import { Readable } from 'node:stream';
import type { ImageMetadata } from './MetadataParser';
import { createJpegGenerationMetadata, JpegMetadataWireBudget } from './JpegMetadataText';
import { MAX_METADATA_TEXT_BYTES } from './PngMetadataText';
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
  return Readable.from((async function* () {
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
}
