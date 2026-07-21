import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { replaceUmbraUiImageSource } from './UmbraUiSourceReplacementService';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('UmbraUiSourceReplacementService', () => {
  test('atomically replaces the original image and keeps a recovery copy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-source-replace-'));
    roots.push(root);
    const originalPath = join(root, 'original.png');
    const resultPath = join(root, 'result.png');
    await writeFile(originalPath, 'original-image');
    await writeFile(resultPath, 'completed-image');

    const result = await replaceUmbraUiImageSource({
      originalPath,
      resultPath,
      recoveryRoot: join(root, 'recovery'),
      allowedRoots: [root],
      now: new Date('2026-07-18T12:00:00.000Z'),
    });

    expect(await readFile(originalPath, 'utf8')).toBe('completed-image');
    expect(await readFile(resultPath, 'utf8')).toBe('completed-image');
    expect(await readFile(result.recoveryPath, 'utf8')).toBe('original-image');
    expect(result.converted).toBe(false);
  });

  test('rejects replacement targets outside the configured roots without touching the original', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-source-replace-'));
    const outside = await mkdtemp(join(tmpdir(), 'umbra-source-outside-'));
    roots.push(root, outside);
    const originalPath = join(outside, 'original.png');
    const resultPath = join(root, 'result.png');
    await writeFile(originalPath, 'original-image');
    await writeFile(resultPath, 'completed-image');

    await expect(replaceUmbraUiImageSource({
      originalPath,
      resultPath,
      recoveryRoot: join(root, 'recovery'),
      allowedRoots: [root],
    })).rejects.toThrow('outside Umbra');

    expect(await readFile(originalPath, 'utf8')).toBe('original-image');
  });
});
