import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownedPath, inspectToolPython } from './ComfyPythonRuntime';

type Receipt = {
  version: 1; id: string; phase: 'prepared' | 'rebuilding' | 'rolling-back' | 'complete' | 'rolled-back';
  environment: string; hadEnvironment: boolean; previousPython: string; startedAt: string;
  markers: { path: string; content: string | null }[]; error?: string; previousIdentity?: string;
};

// The new venv is created at its final path: pip launchers contain absolute paths.
// The old environment remains at its backup path until a later explicit cleanup.
export async function upgradeComfyPython(root: string, markerPaths: string[], hooks: {
  assertIdle: () => Promise<void>; rebuild: (environment: string) => Promise<void>;
  verify: () => Promise<void>; log: (line: string) => void;
}, tool: 'ComfyUI' | 'AI-Toolkit' = 'ComfyUI'): Promise<void> {
  const lock = ownedPath(root, 'Tools', tool, '.umbra-python-upgrade.lock');
  if (existsSync(lock)) {
    const owner = JSON.parse(readFileSync(lock, 'utf8'));
    if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('Unverified Python upgrade lock.');
    try { process.kill(owner.pid, 0); throw new Error('Python upgrade is already running.'); }
    catch (error: any) { if (error.code !== 'ESRCH') throw error; }
    unlinkSync(lock);
  }
  const lockId = randomUUID();
  writeFileSync(lock, JSON.stringify({ pid: process.pid, id: lockId }), { flag: 'wx' });
  try { await runUpgrade(root, markerPaths, hooks, tool); }
  finally { if (existsSync(lock) && JSON.parse(readFileSync(lock, 'utf8')).id === lockId) unlinkSync(lock); }
}

async function runUpgrade(root: string, markerPaths: string[], hooks: {
  assertIdle: () => Promise<void>; rebuild: (environment: string) => Promise<void>;
  verify: () => Promise<void>; log: (line: string) => void;
}, tool: 'ComfyUI' | 'AI-Toolkit'): Promise<void> {
  const target = tool === 'ComfyUI' ? '3.13' : '3.12';
  const comfy = ownedPath(root, 'Tools', tool);
  if (!existsSync(join(comfy, tool === 'ComfyUI' ? 'main.py' : 'run.py'))) throw new Error(`Install ${tool} before upgrading its Python.`);
  const receiptPath = ownedPath(root, 'Tools', tool, '.umbra-python-upgrade.json');
  const identity = (path: string) => { const stat = statSync(path); return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`; };
  const validMarker = (path: string) => path === '.torch_installed' || path === '.requirements_installed' || tool === 'ComfyUI' && /^custom_nodes\/[^/\\]+\/\.umbra-requirements-installed$/.test(path);
  for (const path of markerPaths) { if (!validMarker(path)) throw new Error('Unsupported Python setup marker.'); ownedPath(comfy, path); }
  const persist = (receipt: Receipt) => {
    const temporary = ownedPath(root, 'Tools', tool, '.umbra-python-upgrade.json.tmp');
    writeFileSync(temporary, JSON.stringify(receipt, null, 2)); renameSync(temporary, receiptPath);
  };
  const rollback = (receipt: Receipt) => {
    if (!/^[a-f0-9-]{36}$/.test(receipt.id) || !['venv', 'env', '.venv'].includes(receipt.environment) || typeof receipt.hadEnvironment !== 'boolean' || !Array.isArray(receipt.markers)) throw new Error('Unverified Python upgrade receipt; retain backups and review Setup.');
    for (const marker of receipt.markers) {
      if (typeof marker.path !== 'string' || !validMarker(marker.path)
        || (marker.content !== null && typeof marker.content !== 'string')) throw new Error('Unverified Python upgrade marker.');
      ownedPath(comfy, marker.path);
    }
    const backup = ownedPath(root, 'Tools', tool, '.umbra-python-backups', receipt.id);
    const environment = ownedPath(root, 'Tools', tool, receipt.environment);
    const old = ownedPath(root, 'Tools', tool, '.umbra-python-backups', receipt.id, 'previous');
    const previouslyRestoring = receipt.phase === 'rolling-back';
    const beforeMove = receipt.phase === 'prepared';
    if (existsSync(old)) {
      if (receipt.previousIdentity && receipt.previousIdentity !== identity(old)) throw new Error('Previous environment identity changed; recovery is held.');
      receipt.previousIdentity = identity(old);
    }
    receipt.phase = 'rolling-back'; persist(receipt);
    // A prepared journal may precede the first rename. Never displace the original in that case.
    if (existsSync(old) || !receipt.hadEnvironment) {
      if (existsSync(environment)) renameSync(environment, join(backup, `failed-${randomUUID()}`));
      if (existsSync(old)) renameSync(old, environment);
    } else if (!beforeMove && !(previouslyRestoring && existsSync(environment) && receipt.previousIdentity === identity(environment))) throw new Error('Previous Python environment is missing; recovery is held.');
    for (const marker of receipt.markers) {
      const path = ownedPath(comfy, marker.path);
      if (marker.content === null) { if (existsSync(path)) unlinkSync(path); }
      else writeFileSync(path, marker.content);
    }
    receipt.phase = 'rolled-back'; persist(receipt);
    hooks.log('Python upgrade rolled back. Previous environment and setup markers restored; diagnostic backup retained.');
  };
  await hooks.assertIdle();
  if (existsSync(receiptPath)) {
    const prior: Receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (prior.version !== 1 || !['prepared', 'rebuilding', 'rolling-back', 'complete', 'rolled-back'].includes(prior.phase)) throw new Error('Unverified Python upgrade receipt.');
    if (prior.phase === 'prepared' || prior.phase === 'rebuilding' || prior.phase === 'rolling-back') { rollback(prior); throw new Error('Recovered an interrupted Python upgrade. Review the log and retry.'); }
  }
  const inspected = inspectToolPython(comfy, target);
  if (inspected.multipleEnvironments) throw new Error(`Multiple ${tool} environments found. Choose one environment before upgrading.`);
  const environment = ownedPath(root, 'Tools', tool, inspected.environment);
  const receipt: Receipt = { version: 1, id: randomUUID(), phase: 'prepared', environment: inspected.environment,
    hadEnvironment: existsSync(environment), previousIdentity: existsSync(environment) ? identity(environment) : undefined,
    previousPython: inspected.version || 'unavailable', startedAt: new Date().toISOString(),
    markers: [...new Set(markerPaths)].map(path => ({ path, content: existsSync(ownedPath(comfy, path)) ? readFileSync(ownedPath(comfy, path), 'utf8') : null })) };
  const backup = ownedPath(root, 'Tools', tool, '.umbra-python-backups', receipt.id);
  mkdirSync(backup, { recursive: true }); persist(receipt);
  try {
    if (receipt.hadEnvironment) renameSync(environment, join(backup, 'previous'));
    receipt.phase = 'rebuilding'; persist(receipt);
    for (const marker of receipt.markers) { const path = ownedPath(comfy, marker.path); if (existsSync(path)) unlinkSync(path); }
    hooks.log(`Rebuilding ${tool} Python ${receipt.previousPython} → ${target}. Backup: ${backup}`);
    await hooks.rebuild(environment);
    await hooks.verify();
    receipt.phase = 'complete'; persist(receipt);
    hooks.log(`Python ${target} upgrade verified. Previous environment retained: ${backup}`);
  } catch (error) {
    receipt.error = error instanceof Error ? error.message : String(error);
    try { rollback(receipt); } catch (recovery) { throw new Error(`Python upgrade failed: ${receipt.error}. Recovery requires review: ${String(recovery)}. Backups: ${backup}`); }
    throw new Error(`Python upgrade failed; previous environment restored. ${receipt.error}`);
  }
}
