import { Readable } from 'node:stream';
import type { ImageMetadata } from './MetadataParser';
import { createJpegGenerationMetadata, JpegMetadataWireBudget } from './JpegMetadataText';
import { decodePngMetadataText, MAX_METADATA_TEXT_BYTES } from './PngMetadataText';
import { upsertPngTextMetadataBuffer } from './PngTextMetadata';

export function generationMetadataChunks(metadata: ImageMetadata): Record<string, string> {
  const chunks: Record<string, string> = {};
  for (const key of ['prompt', 'workflow', 'umbra_api_workflow', 'umbra_power_prompter', 'umbra_inpaint', 'umbra_metadata'] as const) {
    if (metadata[key] !== undefined) chunks[key] = JSON.stringify(metadata[key]);
  }
  const source = metadata.source_file || metadata.sourceFile;
  if (source) chunks.source_file = source;
  if (metadata.positive_prompt || metadata.negative_prompt || metadata.model || metadata.seed != null) {
    const controls = [
      `Steps: ${metadata.steps ?? ''}`,
      metadata.sampler ? `Sampler: ${metadata.sampler}` : '',
      metadata.scheduler ? `Schedule type: ${metadata.scheduler}` : '',
      metadata.cfg != null ? `CFG scale: ${metadata.cfg}` : '',
      metadata.seed != null ? `Seed: ${metadata.seed}` : '',
      metadata.model ? `Model: ${metadata.model}` : '',
      metadata.width && metadata.height ? `Size: ${metadata.width}x${metadata.height}` : '',
    ].filter(Boolean).join(', ');
    chunks.parameters = [metadata.positive_prompt || '', metadata.negative_prompt ? `Negative prompt: ${metadata.negative_prompt}` : '', controls].filter(Boolean).join('\n');
  }
  if (Object.entries(chunks).reduce((sum, [key, text]) => sum + Buffer.byteLength(key) + 5 + Buffer.byteLength(text), 0) > MAX_METADATA_TEXT_BYTES) {
    throw new Error('Generation metadata exceeds the export limit');
  }
  return chunks;
}

export function embedPngGenerationMetadata(buffer: Buffer, chunks: Record<string, string>): Buffer {
  if (!Object.keys(chunks).length) return buffer;
  if (!buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('Invalid PNG export signature');
  const replacements = new Set(Object.keys(chunks));
  let wireBytes = 0, decodedBytes = 0;
  for (const [key, value] of Object.entries(chunks)) {
    const bytes = Buffer.byteLength(value);
    wireBytes += Buffer.byteLength(key) + 5 + bytes;
    decodedBytes += bytes;
  }
  const checkBudget = () => {
    if (wireBytes > MAX_METADATA_TEXT_BYTES || decodedBytes > MAX_METADATA_TEXT_BYTES) throw new Error('PNG metadata exceeds the export limit');
  };
  checkBudget();
  let offset = 8, foundEnd = false;
  // Count unrelated retained text before allocating rewritten image buffers.
  // Metadata replaced by this export is removed, so does not consume its budget.
  for (let index = 0; index < 100_000; index++) {
    if (offset + 12 > buffer.length) throw new Error('PNG export metadata is truncated');
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buffer.length) throw new Error('PNG export metadata is truncated');
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const data = buffer.subarray(offset + 8, end - 4), separator = data.indexOf(0);
      if (!replacements.has(separator < 0 ? '' : data.toString('latin1', 0, separator))) {
        wireBytes += length;
        checkBudget();
        decodedBytes += decodePngMetadataText(type, data, MAX_METADATA_TEXT_BYTES - decodedBytes).bytes;
      }
    }
    offset = end;
    if (type === 'IEND') { foundEnd = true; break; }
  }
  if (!foundEnd) throw new Error('PNG export is missing IEND or exceeds the chunk limit');
  for (const [key, value] of Object.entries(chunks)) buffer = upsertPngTextMetadataBuffer(buffer, key, value);
  return buffer;
}

export function embedJpegGenerationMetadata(buffer: Buffer, chunks: Record<string, string>): Buffer {
  if (!Object.keys(chunks).length) return buffer;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('Invalid JPEG export signature');
  const parts = [buffer.subarray(0, 2), ...createJpegGenerationMetadata(chunks), buffer.subarray(2)];
  const budget = new JpegMetadataWireBudget();
  for (const part of parts) budget.consume(part);
  budget.finish();
  return Buffer.concat(parts);
}

// Keep the JPEG archive encoder streaming; only metadata is assembled in memory.
export function jpegGenerationMetadataStream(image: Readable, metadata: Promise<ImageMetadata>): Readable {
  // Cancellation can happen before Readable.from enters the generator. Observe
  // metadata rejection immediately and close its encoder on either path.
  void metadata.catch(() => {});
  const output = Readable.from((async function* () {
    try {
      const chunks = generationMetadataChunks(await metadata);
      const segments = Object.keys(chunks).length ? createJpegGenerationMetadata(chunks) : [];
      const budget = segments.length ? new JpegMetadataWireBudget() : null;
      let pending: Buffer | null = null;
      let started = !segments.length;
      for await (const value of image) {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
        if (started) { budget?.consume(bytes); yield bytes; continue; }
        pending = pending ? Buffer.concat([pending, bytes]) : bytes;
        if (pending.length < 2) continue;
        if (pending[0] !== 0xff || pending[1] !== 0xd8) throw new Error('Invalid JPEG export signature');
        const signature = pending.subarray(0, 2), rest = pending.subarray(2);
        budget?.consume(signature); yield signature;
        for (const segment of segments) { budget?.consume(segment); yield segment; }
        budget?.consume(rest); yield rest;
        pending = null; started = true;
      }
      if (!started) throw new Error('JPEG export is truncated');
      budget?.finish();
    } finally {
      image.destroy();
    }
  })(), { objectMode: false });
  output.once('close', () => image.destroy());
  return output;
}
