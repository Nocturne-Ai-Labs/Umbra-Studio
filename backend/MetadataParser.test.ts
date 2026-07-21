import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MetadataParser } from './MetadataParser';

function pngTextChunk(keyword: string, value: unknown): Buffer {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const data = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write('tEXt', 4, 4, 'ascii');
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}

function minimalPng(chunks: Buffer[]): Buffer {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const iend = Buffer.alloc(12);
  iend.write('IEND', 4, 4, 'ascii');
  return Buffer.concat([signature, ...chunks, iend]);
}

describe('MetadataParser Umbra canvas metadata', () => {
  test('restores generation fields and the editable canvas project link', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-metadata-'));
    const path = join(root, 'inpaint-output.png');
    try {
      await writeFile(path, minimalPng([
        pngTextChunk('umbra_inpaint', {
          version: 2,
          canvasProjectId: 'canvas-project-7',
          operationMode: 'outpaint',
          prompt: 'restore the jacket',
          negativePrompt: 'artifact',
          checkpointName: 'model.gguf',
          modelFamily: 'Flux',
          modelSource: 'gguf',
          seed: 73,
          steps: 31,
          cfg: 1.5,
          samplerName: 'euler',
          scheduler: 'simple',
          generationRegion: { x: 128, y: 64, width: 1536, height: 1024 },
        }),
      ]));

      const metadata = await MetadataParser.parse(path);
      expect(metadata.format).toBe('comfyui');
      expect(metadata.umbra_inpaint).toMatchObject({
        canvasProjectId: 'canvas-project-7',
        operationMode: 'outpaint',
      });
      expect(metadata).toMatchObject({
        positive_prompt: 'restore the jacket',
        negative_prompt: 'artifact',
        model: 'model.gguf',
        seed: 73,
        steps: 31,
        cfg: 1.5,
        sampler: 'euler',
        scheduler: 'simple',
        width: 1536,
        height: 1024,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
