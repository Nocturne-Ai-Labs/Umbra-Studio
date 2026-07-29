import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const temporaryDirectories: string[] = [];
const generatorScript = join(import.meta.dir, 'danbooru-character-attributes-csv.mjs');

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

describe('Danbooru dataset generator controls', () => {
  test('stops cooperatively without making a request and leaves a valid partial CSV', async () => {
    const directory = await createTemporaryDirectory();
    const controlPath = join(directory, 'control.json');
    const outputPath = join(directory, 'output.csv');
    await writeControl(controlPath, { paused: false, stopRequested: true });

    const result = await runGenerator(controlPath, outputPath);

    expect(result.exitCode).toBe(75);
    expect(result.stdout).toContain('Generator stopped');
    expect(await readFile(outputPath, 'utf8')).toBe('character,attributes\n');
  });

  test('honors pause before accepting a later stop request', async () => {
    const directory = await createTemporaryDirectory();
    const controlPath = join(directory, 'control.json');
    const outputPath = join(directory, 'output.csv');
    await writeControl(controlPath, { paused: true, stopRequested: false });

    const running = runGenerator(controlPath, outputPath);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await writeControl(controlPath, { paused: false, stopRequested: true });
    const result = await running;

    expect(result.exitCode).toBe(75);
    expect(result.stdout).toContain('Generator paused');
    expect(await readFile(outputPath, 'utf8')).toBe('character,attributes\n');
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'umbra-danbooru-control-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeControl(
  controlPath: string,
  state: { paused: boolean; stopRequested: boolean },
): Promise<void> {
  await writeFile(controlPath, JSON.stringify(state), 'utf8');
}

async function runGenerator(controlPath: string, outputPath: string) {
  const child = Bun.spawn([
    process.execPath,
    generatorScript,
    '--tag',
    'hatsune_miku',
    '--control-file',
    controlPath,
    '--out-file',
    outputPath,
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}
