import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');

describe('Umbra UI agent settings', () => {
  test('uses one declared default timeout throughout settings normalization', () => {
    const source = readFileSync(join(root, 'UmbraServer.ts'), 'utf8');
    const references = source.match(/\bDEFAULT_UMBRA_UI_AGENT_GENERATION_TIMEOUT_MS\b/g) || [];

    expect(source).toContain(
      'const DEFAULT_UMBRA_UI_AGENT_GENERATION_TIMEOUT_MS = 3 * 60 * 1000;',
    );
    expect(references).toHaveLength(3);
    expect(source).not.toMatch(/\bconst UMBRA_UI_AGENT_GENERATION_TIMEOUT_MS\b/);
  });
});
