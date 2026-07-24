import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { decodePowerPrompterImageRestore } from './powerPrompterImageRestore';

function createRestoreMetadata(snapshot: unknown, overrides: Record<string, unknown> = {}) {
  const json = JSON.stringify(snapshot);
  const compressed = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  return {
    umbra_power_prompter: {
      version: 2,
      ppuid: 'pp_restore_test',
      promptIndex: 4,
      setId: 2,
      restore: {
        version: 1,
        encoding: 'gzip-base64',
        sha256: createHash('sha256').update(json).digest('hex'),
        compressedBytes: compressed.length,
        uncompressedBytes: Buffer.byteLength(json, 'utf8'),
        data: compressed.toString('base64'),
        ...overrides,
      },
    },
  } as any;
}

describe('Power Prompter image restore metadata', () => {
  test('decompresses and verifies the embedded editor snapshot', async () => {
    const snapshot = {
      version: 1,
      sourceFile: 'Example.ppcards.json',
      document: {
        version: 1,
        cards: [{ id: 'character-1', label: 'Character', text: 'heroine' }],
      },
      queueBuildSettings: {
        traversalMode: 'card-order',
        diversity: 0,
        promptLimit: null,
        shuffleEnabled: false,
        shuffleSeed: 1,
      },
    };

    await expect(decodePowerPrompterImageRestore(createRestoreMetadata(snapshot))).resolves.toEqual({
      ppuid: 'pp_restore_test',
      promptIndex: 4,
      setId: 2,
      snapshot,
    });
  });

  test('rejects a restore payload whose snapshot hash does not match', async () => {
    await expect(decodePowerPrompterImageRestore(createRestoreMetadata(
      { version: 1, document: { cards: [] } },
      { sha256: '0'.repeat(64) },
    ))).rejects.toThrow('integrity check');
  });
});
