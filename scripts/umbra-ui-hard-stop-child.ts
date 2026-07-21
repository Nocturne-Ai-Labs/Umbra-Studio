import { open, readFile } from 'fs/promises';
import { basename, resolve, sep } from 'path';
import { UmbraUiCanvasProjectService } from '../backend/UmbraUiCanvasProjectService';
import { UmbraUiInpaintService } from '../backend/UmbraUiInpaintService';

type DrillKind = 'canvas' | 'job-ledger';

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function assertDisposablePath(root: string, target: string): void {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  if (!basename(normalizedRoot).startsWith('umbra-ui-hard-stop-')) {
    throw new Error('The hard-stop child only accepts a disposable qualification root.');
  }
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error('The hard-stop child target escaped its disposable qualification root.');
  }
}

async function writeMarker(path: string, value: unknown): Promise<void> {
  const handle = await open(path, 'w');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const kind = argument('--kind') as DrillKind;
  const root = resolve(argument('--root'));
  const markerPath = resolve(argument('--marker'));
  if (kind !== 'canvas' && kind !== 'job-ledger') throw new Error('Choose --kind canvas or job-ledger.');
  assertDisposablePath(root, markerPath);

  const afterBackupCreated = async (paths: {
    temporaryPath: string;
    finalPath: string;
    backupPath: string;
  }) => {
    assertDisposablePath(root, paths.temporaryPath);
    assertDisposablePath(root, paths.finalPath);
    assertDisposablePath(root, paths.backupPath);
    await writeMarker(markerPath, {
      schemaVersion: 1,
      kind,
      pid: process.pid,
      reachedAt: new Date().toISOString(),
      ...paths,
    });
    await new Promise<void>(() => {
      setInterval(() => undefined, 1_000);
    });
  };

  if (kind === 'canvas') {
    const inputPath = resolve(root, 'canvas-replacement.json');
    assertDisposablePath(root, inputPath);
    const replacement = JSON.parse(await readFile(inputPath, 'utf8'));
    const service = new UmbraUiCanvasProjectService(root, {
      atomicReplacementHooks: { forceBackupPath: true, afterBackupCreated },
    });
    await service.save(String(replacement.id || ''), replacement, []);
  } else {
    const statePath = resolve(root, 'job-state', 'jobs.json');
    assertDisposablePath(root, statePath);
    new UmbraUiInpaintService({
      getComfyBaseUrl: () => 'http://127.0.0.1:1',
      jobStatePath: statePath,
      historyPollIntervalMs: 10,
      queueCheckIntervalMs: 10,
      orphanedPromptGraceMs: 10,
      atomicReplacementHooks: { forceBackupPath: true, afterBackupCreated },
      buildBaseWorkflow: async () => ({ promptGraph: {} }),
    });
    await new Promise<void>(() => {
      setInterval(() => undefined, 1_000);
    });
  }

  throw new Error('The hard-stop child crossed its injected interruption boundary.');
}

await main();
