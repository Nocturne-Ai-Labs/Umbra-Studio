import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MetadataParser } from './MetadataParser';
import { upsertPngTextMetadata } from './PngTextMetadata';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let testDirectory = '';

afterEach(async () => {
  if (!testDirectory) return;
  await rm(testDirectory, { recursive: true, force: true });
  testDirectory = '';
});

describe('Power Prompter PNG metadata', () => {
  test('upserts UTF-8 JSON and replaces a previous ppuid chunk', async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'umbra-png-metadata-'));
    const filePath = join(testDirectory, 'output.png');
    await writeFile(filePath, ONE_PIXEL_PNG);

    await upsertPngTextMetadata(filePath, 'umbra_power_prompter', JSON.stringify({
      version: 2,
      ppuid: 'pp_first',
      segments: [{ slotLabel: 'Character', text: 'heroine' }],
    }));
    await upsertPngTextMetadata(filePath, 'umbra_power_prompter', JSON.stringify({
      version: 2,
      ppuid: 'pp_second',
      segments: [{ slotLabel: 'Style', text: 'painted illustration' }],
    }));

    const metadata = await MetadataParser.parse(filePath);
    expect(metadata.umbra_power_prompter).toMatchObject({
      version: 2,
      ppuid: 'pp_second',
      segments: [{ slotLabel: 'Style', text: 'painted illustration' }],
    });
    expect((await readFile(filePath)).subarray(0, 8)).toEqual(ONE_PIXEL_PNG.subarray(0, 8));
  });
});
