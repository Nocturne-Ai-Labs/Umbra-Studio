import { createHash, randomUUID } from 'crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { UmbraUiCanvasProjectService } from '../backend/UmbraUiCanvasProjectService';
import { UmbraUiInpaintService, type UmbraUiInpaintJob } from '../backend/UmbraUiInpaintService';
import { createUmbraCanvasDocument } from '../frontend/src/lib/umbraUiCanvasDocument';

const PNG_BYTES = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+H9p2AAAAAElFTkSuQmCC',
  'base64',
));
const MARKER_TIMEOUT_MS = 15_000;
const CHILD_EXIT_TIMEOUT_MS = 10_000;

interface InterruptionMarker {
  schemaVersion: 1;
  kind: 'canvas' | 'job-ledger';
  pid: number;
  reachedAt: string;
  temporaryPath: string;
  finalPath: string;
  backupPath: string;
}

interface InterruptionFileState {
  finalExists: boolean;
  matchingBackupCount: number;
  backupHash: string;
  temporaryHash: string;
}

interface HardStopReport {
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  platform: string;
  runtime: string;
  checks: Record<string, boolean>;
  canvas: Record<string, unknown>;
  jobLedger: Record<string, unknown>;
  error: string;
}

function requireConfirmation(): void {
  if (!process.argv.includes('--confirm-hard-stop')) {
    throw new Error('Pass --confirm-hard-stop to force-kill the disposable qualification child processes.');
  }
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then((entry) => entry.isFile()).catch(() => false);
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pathExists(path)) return;
    await Bun.sleep(25);
  }
  throw new Error(`Timed out waiting for the hard-stop marker ${basename(path)}.`);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function hashFile(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function captureInterruptionState(marker: InterruptionMarker): Promise<InterruptionFileState> {
  const directory = dirname(marker.finalPath);
  const finalName = basename(marker.finalPath);
  const matchingBackupCount = (await readdir(directory, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && (
      entry.name.startsWith(`${finalName}.umbra-atomic-backup-`)
      || entry.name.startsWith(`${finalName}.backup-`)
    ))
    .length;
  return {
    finalExists: await pathExists(marker.finalPath),
    matchingBackupCount,
    backupHash: await hashFile(marker.backupPath),
    temporaryHash: await hashFile(marker.temporaryPath),
  };
}

async function atomicArtifacts(directory: string): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && (
      entry.name.includes('.umbra-atomic-backup-')
      || entry.name.includes('.backup-')
      || entry.name.endsWith('.tmp')
    ))
    .map((entry) => entry.name)
    .sort();
}

function assertCheck(checks: Record<string, boolean>, name: string, value: unknown): void {
  checks[name] = Boolean(value);
  if (!checks[name]) throw new Error(`Hard-stop recovery check failed: ${name}.`);
}

async function forceKillChild(child: ReturnType<typeof Bun.spawn>): Promise<number> {
  if (process.platform === 'win32') {
    Bun.spawnSync(['taskkill', '/PID', String(child.pid), '/T', '/F'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
  } else {
    child.kill('SIGKILL');
  }
  return await Promise.race([
    child.exited,
    (async () => {
      await Bun.sleep(CHILD_EXIT_TIMEOUT_MS);
      throw new Error(`Hard-stop child ${child.pid} did not exit after a forced kill.`);
    })(),
  ]);
}

async function interruptReplacement(
  root: string,
  kind: InterruptionMarker['kind'],
): Promise<{
  marker: InterruptionMarker;
  exitCode: number;
  stateAtBoundary: InterruptionFileState;
  stateAfterKill: InterruptionFileState;
}> {
  const markerPath = resolve(root, `${kind}-interruption.json`);
  const childScript = resolve(import.meta.dir, 'umbra-ui-hard-stop-child.ts');
  const child = Bun.spawn([
    process.execPath,
    childScript,
    '--kind', kind,
    '--root', root,
    '--marker', markerPath,
  ], {
    cwd: resolve(import.meta.dir, '..'),
    stdout: 'ignore',
    stderr: 'ignore',
  });
  try {
    await waitForFile(markerPath, MARKER_TIMEOUT_MS);
    const marker = await readJson<InterruptionMarker>(markerPath);
    if (marker.pid !== child.pid || marker.kind !== kind) {
      throw new Error(`The ${kind} hard-stop marker did not belong to its child process.`);
    }
    const stateAtBoundary = await captureInterruptionState(marker);
    const exitCode = await forceKillChild(child);
    const stateAfterKill = await captureInterruptionState(marker);
    return { marker, exitCode, stateAtBoundary, stateAfterKill };
  } catch (error) {
    try { await forceKillChild(child); } catch { /* child already exited */ }
    throw error;
  }
}

function baselineJob(now: number): UmbraUiInpaintJob {
  return {
    id: 'power-loss-ledger-job',
    status: 'running',
    sourceName: 'power-loss-source.png',
    workflowId: '[Qualification] Atomic recovery',
    prompt: 'preserve exact persisted identity',
    width: 512,
    height: 512,
    total: 99,
    completed: 0,
    failed: 0,
    createdAt: now,
    updatedAt: now,
    items: [{
      id: 'sample-1',
      seed: 123456789,
      status: 'completed',
      promptId: 'power-loss-prompt-1',
      outputs: [{
        filename: 'power-loss-output.png',
        subfolder: 'Umbra UI/inpainting',
        type: 'output',
        fullpath: 'D:/qualification/power-loss-output.png',
      }],
      error: '',
    }],
  };
}

async function writeReport(report: HardStopReport): Promise<string> {
  const root = resolve(import.meta.dir, '..');
  const reportPath = resolve(
    root,
    'User',
    'UmbraUI',
    'QualificationReports',
    `runtime-hard-stop-recovery-${report.finishedAt.replace(/[:.]/g, '-')}.json`,
  );
  await mkdir(dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, reportPath);
  return reportPath;
}

async function main(): Promise<void> {
  requireConfirmation();
  const startedAt = new Date().toISOString();
  const checks: Record<string, boolean> = {};
  const canvas: Record<string, unknown> = {};
  const jobLedger: Record<string, unknown> = {};
  const root = await mkdtemp(join(tmpdir(), 'umbra-ui-hard-stop-'));
  let error = '';

  try {
    const projectId = 'power-loss-canvas-project';
    const asset = {
      id: 'power-loss-source-asset',
      name: 'power-loss-source.png',
      imageUrl: 'blob:power-loss-source',
      path: '',
      width: 1,
      height: 1,
    };
    const document = createUmbraCanvasDocument(asset, 'Committed Canvas Baseline');
    document.id = projectId;
    const baselineService = new UmbraUiCanvasProjectService(root);
    const saved = await baselineService.save(projectId, document, [{
      key: asset.id,
      name: asset.name,
      bytes: PNG_BYTES,
    }]);
    const projectRoot = resolve(root, 'UmbraUI', 'InpaintProjects', projectId);
    const projectPath = resolve(projectRoot, 'project.json');
    const committedProjectHash = await hashFile(projectPath);
    const replacement = structuredClone(saved);
    replacement.name = 'Interrupted Canvas Replacement';
    replacement.revision += 1;
    await writeFile(resolve(root, 'canvas-replacement.json'), JSON.stringify(replacement), 'utf8');

    const canvasInterruption = await interruptReplacement(root, 'canvas');
    canvas.interruption = canvasInterruption;
    assertCheck(checks, 'canvasChildWasForceKilled', canvasInterruption.exitCode !== 0);
    assertCheck(checks, 'canvasFinalWasAbsentAtInterruption', !canvasInterruption.stateAtBoundary.finalExists);
    assertCheck(checks, 'canvasHadExactlyOneBackup', canvasInterruption.stateAtBoundary.matchingBackupCount === 1);
    assertCheck(checks, 'canvasBackupSurvivedHardStop', await pathExists(canvasInterruption.marker.backupPath));
    assertCheck(checks, 'canvasTemporarySurvivedHardStop', await pathExists(canvasInterruption.marker.temporaryPath));
    assertCheck(checks, 'canvasBackupMatchesCommittedBytes', canvasInterruption.stateAtBoundary.backupHash === committedProjectHash);
    assertCheck(checks, 'canvasTemporaryDiffersFromCommittedBytes', canvasInterruption.stateAtBoundary.temporaryHash !== committedProjectHash);
    assertCheck(
      checks,
      'canvasHardStopDidNotRunRollback',
      !canvasInterruption.stateAfterKill.finalExists
        && canvasInterruption.stateAfterKill.backupHash === canvasInterruption.stateAtBoundary.backupHash
        && canvasInterruption.stateAfterKill.temporaryHash === canvasInterruption.stateAtBoundary.temporaryHash,
    );

    const recoveredCanvasService = new UmbraUiCanvasProjectService(root);
    const recoveredProject = await recoveredCanvasService.get(projectId);
    const sourceLayer = recoveredProject?.layers?.find((layer: any) => layer?.kind === 'raster' && layer?.role === 'source');
    const sourceFilename = decodeURIComponent(String(sourceLayer?.asset?.imageUrl || '').split('/').pop() || '');
    const recoveredAsset = await recoveredCanvasService.resolveAsset(projectId, sourceFilename);
    assertCheck(checks, 'canvasRecoveredLastCommittedProject', recoveredProject?.name === 'Committed Canvas Baseline');
    assertCheck(checks, 'canvasRejectedInterruptedReplacement', recoveredProject?.name !== replacement.name);
    assertCheck(checks, 'canvasRestoredExactCommittedBytes', await hashFile(projectPath) === committedProjectHash);
    assertCheck(checks, 'canvasRecoveredSourceAsset', recoveredAsset && (await readFile(recoveredAsset.path)).byteLength === PNG_BYTES.byteLength);
    assertCheck(checks, 'canvasRecoveryRemovedArtifacts', (await atomicArtifacts(projectRoot)).length === 0);
    const secondCanvasService = new UmbraUiCanvasProjectService(root);
    assertCheck(checks, 'canvasRecoveryIsIdempotent', (await secondCanvasService.get(projectId))?.name === 'Committed Canvas Baseline'
      && await hashFile(projectPath) === committedProjectHash
      && (await atomicArtifacts(projectRoot)).length === 0);
    canvas.recoveredProject = {
      id: recoveredProject?.id,
      name: recoveredProject?.name,
      revision: recoveredProject?.revision,
      sourceFilename,
      remainingArtifacts: await atomicArtifacts(projectRoot),
    };

    const statePath = resolve(root, 'job-state', 'jobs.json');
    await mkdir(dirname(statePath), { recursive: true });
    const originalJob = baselineJob(Date.now());
    await writeFile(statePath, JSON.stringify({ version: 1, jobs: [originalJob] }, null, 2), 'utf8');
    const committedLedgerHash = await hashFile(statePath);
    const ledgerInterruption = await interruptReplacement(root, 'job-ledger');
    jobLedger.interruption = ledgerInterruption;
    assertCheck(checks, 'ledgerChildWasForceKilled', ledgerInterruption.exitCode !== 0);
    assertCheck(checks, 'ledgerFinalWasAbsentAtInterruption', !ledgerInterruption.stateAtBoundary.finalExists);
    assertCheck(checks, 'ledgerHadExactlyOneBackup', ledgerInterruption.stateAtBoundary.matchingBackupCount === 1);
    assertCheck(checks, 'ledgerBackupSurvivedHardStop', await pathExists(ledgerInterruption.marker.backupPath));
    assertCheck(checks, 'ledgerTemporarySurvivedHardStop', await pathExists(ledgerInterruption.marker.temporaryPath));
    assertCheck(checks, 'ledgerBackupMatchesCommittedBytes', ledgerInterruption.stateAtBoundary.backupHash === committedLedgerHash);
    assertCheck(checks, 'ledgerTemporaryDiffersFromCommittedBytes', ledgerInterruption.stateAtBoundary.temporaryHash !== committedLedgerHash);
    assertCheck(
      checks,
      'ledgerHardStopDidNotRunRollback',
      !ledgerInterruption.stateAfterKill.finalExists
        && ledgerInterruption.stateAfterKill.backupHash === ledgerInterruption.stateAtBoundary.backupHash
        && ledgerInterruption.stateAfterKill.temporaryHash === ledgerInterruption.stateAtBoundary.temporaryHash,
    );

    const recoveredLedgerService = new UmbraUiInpaintService({
      getComfyBaseUrl: () => 'http://127.0.0.1:1',
      jobStatePath: statePath,
      buildBaseWorkflow: async () => ({ promptGraph: {} }),
    });
    const recoveredJob = recoveredLedgerService.getJob(originalJob.id);
    assertCheck(checks, 'ledgerRecoveredExactJobIdentity', recoveredJob?.id === originalJob.id);
    assertCheck(checks, 'ledgerRecoveredExactPromptIdentity', recoveredJob?.items[0]?.promptId === originalJob.items[0].promptId);
    assertCheck(checks, 'ledgerRecoveredExactOutputIdentity', recoveredJob?.items[0]?.outputs[0]?.fullpath === originalJob.items[0].outputs[0].fullpath);
    assertCheck(
      checks,
      'ledgerReconciledTerminalCounts',
      recoveredJob?.status === 'completed' && recoveredJob.total === 1 && recoveredJob.completed === 1 && recoveredJob.failed === 0,
    );
    await recoveredLedgerService.flushPersistence();
    const recoveredStoredLedger = await readJson<{ jobs?: UmbraUiInpaintJob[] }>(statePath);
    const recoveredStoredJob = recoveredStoredLedger.jobs?.[0];
    assertCheck(checks, 'ledgerPersistedReconciledState', recoveredStoredJob?.status === 'completed'
      && recoveredStoredJob.total === 1
      && recoveredStoredJob.completed === 1
      && recoveredStoredJob.failed === 0);
    assertCheck(
      checks,
      'ledgerRecoveredIntendedDurableBytes',
      await hashFile(statePath) === ledgerInterruption.stateAtBoundary.temporaryHash,
    );
    assertCheck(checks, 'ledgerRecoveryRemovedArtifacts', (await atomicArtifacts(dirname(statePath))).length === 0);
    const secondLedgerService = new UmbraUiInpaintService({
      getComfyBaseUrl: () => 'http://127.0.0.1:1',
      jobStatePath: statePath,
      buildBaseWorkflow: async () => ({ promptGraph: {} }),
    });
    assertCheck(checks, 'ledgerRecoveryIsIdempotent', secondLedgerService.getJob(originalJob.id)?.items[0]?.promptId === originalJob.items[0].promptId
      && (await atomicArtifacts(dirname(statePath))).length === 0);
    jobLedger.recoveredJob = recoveredJob;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }

  const finishedAt = new Date().toISOString();
  const report: HardStopReport = {
    schemaVersion: 1,
    startedAt,
    finishedAt,
    passed: !error && Object.values(checks).length > 0 && Object.values(checks).every(Boolean),
    platform: process.platform,
    runtime: `Bun ${Bun.version}`,
    checks,
    canvas,
    jobLedger,
    error,
  };
  const reportPath = await writeReport(report);
  if (!report.passed) throw new Error(`${error || 'Hard-stop recovery drill failed.'}\nReport: ${reportPath}`);
  console.log('PASSED Umbra UI hard-stop recovery drill.');
  console.log(`Report: ${reportPath}`);
}

await main();
