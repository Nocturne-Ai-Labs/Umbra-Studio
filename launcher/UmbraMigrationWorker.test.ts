import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isExcludedMigrationPath,
  measureMigrationTrees,
  moveMigrationTree,
  rewritePortableDatabasePaths,
  rewritePortableJsonFiles,
  updateMigratedLanguage,
} from './UmbraMigrationWorker';
import { Database } from 'bun:sqlite';

const roots: string[] = [];

function createRoot(label: string): string {
  const root = join(tmpdir(), `umbra-migration-worker-${label}-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('UmbraMigrationWorker', () => {
  test('excludes Umbra-Nodes at every nesting level', () => {
    const root = createRoot('filter');
    expect(isExcludedMigrationPath(root, join(root, 'Umbra-Nodes'))).toBe(true);
    expect(isExcludedMigrationPath(root, join(root, 'Tools', 'ComfyUI', 'custom_nodes', 'Umbra-Nodes', 'nodes.py'))).toBe(true);
    expect(isExcludedMigrationPath(root, join(root, 'Tools', 'ComfyUI', 'custom_nodes', 'Other-Node'))).toBe(false);
  });

  test('moves tool data without duplicating files or moving Umbra-Nodes', () => {
    const source = createRoot('source');
    const destination = createRoot('destination');
    const sourceTools = join(source, 'Tools');
    const destinationTools = join(destination, 'Tools');
    mkdirSync(join(sourceTools, 'ComfyUI', 'custom_nodes', 'Umbra-Nodes'), { recursive: true });
    mkdirSync(join(sourceTools, 'ComfyUI', 'custom_nodes', 'Useful-Node'), { recursive: true });
    mkdirSync(join(destinationTools, 'ComfyUI', 'custom_nodes', 'Useful-Node'), { recursive: true });
    writeFileSync(join(sourceTools, 'ComfyUI', 'custom_nodes', 'Umbra-Nodes', 'nodes.py'), 'old');
    writeFileSync(join(sourceTools, 'ComfyUI', 'custom_nodes', 'Useful-Node', 'node.py'), 'keep');
    writeFileSync(join(destinationTools, 'ComfyUI', 'custom_nodes', 'Useful-Node', 'node.py'), 'stale');
    writeFileSync(join(destinationTools, 'new-build.txt'), 'preserve');

    const progress = measureMigrationTrees(source);
    expect(progress.totalFiles).toBe(1);
    expect(moveMigrationTree(sourceTools, destinationTools, 'Tools', progress)).toBe(true);
    expect(existsSync(join(destinationTools, 'new-build.txt'))).toBe(true);
    expect(existsSync(join(destinationTools, 'ComfyUI', 'custom_nodes', 'Umbra-Nodes'))).toBe(false);
    expect(readFileSync(join(destinationTools, 'ComfyUI', 'custom_nodes', 'Useful-Node', 'node.py'), 'utf8')).toBe('keep');
    expect(existsSync(join(sourceTools, 'ComfyUI', 'custom_nodes', 'Useful-Node', 'node.py'))).toBe(false);
    expect(readFileSync(join(sourceTools, 'ComfyUI', 'custom_nodes', 'Umbra-Nodes', 'nodes.py'), 'utf8')).toBe('old');
    expect(progress.processedFiles).toBe(1);
  });

  test('rewrites portable settings and database paths for the destination build', async () => {
    const source = createRoot('path-source');
    const destination = createRoot('path-destination');
    const configRoot = join(destination, 'User', 'Config');
    mkdirSync(configRoot, { recursive: true });
    writeFileSync(
      join(configRoot, 'paths.json'),
      JSON.stringify({
        galleryRoot: join(source, 'User', 'Gallery'),
        nested: [join(source, 'Tools', 'ComfyUI')],
      }),
    );
    writeFileSync(
      join(configRoot, 'onboarding.json'),
      JSON.stringify({ migration: { sourceRoot: source } }),
    );

    const databasePath = join(destination, 'User', 'Config', 'portable.db');
    const database = new Database(databasePath);
    database.run('CREATE TABLE roots (value TEXT NOT NULL)');
    database.query('INSERT INTO roots (value) VALUES (?)').run(join(source, 'User', 'Datasets'));
    database.close();

    expect(rewritePortableJsonFiles(destination, source)).toBe(1);
    expect(await rewritePortableDatabasePaths(destination, source)).toBe(1);
    updateMigratedLanguage(destination, 'ja');

    const paths = JSON.parse(readFileSync(join(configRoot, 'paths.json'), 'utf8'));
    expect(paths.galleryRoot).toBe(join(destination, 'User', 'Gallery'));
    expect(paths.nested[0]).toBe(join(destination, 'Tools', 'ComfyUI'));
    const onboarding = JSON.parse(readFileSync(join(configRoot, 'onboarding.json'), 'utf8'));
    expect(onboarding.migration.sourceRoot).toBe(source);

    const migratedDatabase = new Database(databasePath, { create: false, strict: true });
    const row = migratedDatabase.query('SELECT value FROM roots').get() as { value: string };
    migratedDatabase.close();
    expect(row.value).toBe(join(destination, 'User', 'Datasets'));

    const settings = JSON.parse(readFileSync(join(configRoot, 'settings.json'), 'utf8'));
    expect(settings.app['ui.language']).toBe('ja');
  });

});
