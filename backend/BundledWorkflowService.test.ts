import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedBundledWorkflowDirectory } from './BundledWorkflowService';

const temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'umbra-workflow-seed-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe('seedBundledWorkflowDirectory', () => {
  test('copies bundled JSON workflows and ignores unrelated files', () => {
    const root = createTemporaryRoot();
    const source = join(root, 'defaults');
    const target = join(root, 'User', 'API Workflows');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'Native Inpaint.json'), '{"version":1}', 'utf8');
    writeFileSync(join(source, 'notes.txt'), 'not a workflow', 'utf8');

    const result = seedBundledWorkflowDirectory(source, target);

    expect(result).toEqual({
      copied: ['Native Inpaint.json'],
      preserved: [],
      sourceAvailable: true,
    });
    expect(readFileSync(join(target, 'Native Inpaint.json'), 'utf8')).toBe('{"version":1}');
  });

  test('preserves an existing user-edited workflow with the same name', () => {
    const root = createTemporaryRoot();
    const source = join(root, 'defaults');
    const target = join(root, 'User', 'API Workflows');
    mkdirSync(source, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(join(source, 'Native Inpaint.json'), '{"version":2}', 'utf8');
    writeFileSync(join(target, 'Native Inpaint.json'), '{"custom":true}', 'utf8');

    const result = seedBundledWorkflowDirectory(source, target);

    expect(result.copied).toEqual([]);
    expect(result.preserved).toEqual(['Native Inpaint.json']);
    expect(readFileSync(join(target, 'Native Inpaint.json'), 'utf8')).toBe('{"custom":true}');
  });

  test('treats a missing bundled source as an empty optional seed', () => {
    const root = createTemporaryRoot();
    const result = seedBundledWorkflowDirectory(join(root, 'missing'), join(root, 'target'));

    expect(result).toEqual({ copied: [], preserved: [], sourceAvailable: false });
  });
});
