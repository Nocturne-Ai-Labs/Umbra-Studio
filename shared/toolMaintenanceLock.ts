import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function lockPath(root: string, tool: string) {
  if (!['comfyui', 'aitoolkit'].includes(tool)) throw new Error('Unsupported maintenance tool.');
  return join(root, 'User', 'Config', `setup-${tool}-maintenance.json`);
}

export function readToolMaintenance(root: string, tool: string) {
  const path = lockPath(root, tool);
  if (!existsSync(path)) return null;
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    if (!Number.isInteger(record.ownerPid) || record.ownerPid < 1 || typeof record.id !== 'string') throw new Error('Invalid maintenance lock');
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error: any) { if (error.code === 'ESRCH') return false; throw error; } };
    if (!alive(record.ownerPid) && !(Number.isInteger(record.childPid) && record.childPid > 0 && alive(record.childPid))) return null;
    return { tool, action: 'setup', startedAt: record.startedAt, ownerPid: record.ownerPid };
  } catch { return { tool, action: 'setup', startedAt: 0, ownerPid: null }; }
}

export function claimToolMaintenance(root: string, tool: string) {
  const path = lockPath(root, tool);
  mkdirSync(join(root, 'User', 'Config'), { recursive: true });
  if (readToolMaintenance(root, tool)) throw new Error('Tool maintenance is already running. Finish the existing Setup job first.');
  // A dead owner leaves a recoverable marker; live or unreadable locks remain held.
  if (existsSync(path)) {
    if (readToolMaintenance(root, tool)) throw new Error('Tool maintenance is already running.');
    unlinkSync(path);
  }
  const id = randomUUID();
  writeFileSync(path, JSON.stringify({ id, ownerPid: process.pid, startedAt: Date.now() }), { flag: 'wx' });
  return () => {
    try { if (JSON.parse(readFileSync(path, 'utf8')).id === id) unlinkSync(path); } catch { /* Never remove another owner's marker. */ }
  };
}

export function trackToolMaintenanceChild(root: string, tool: string, childPid: number) {
  const path = lockPath(root, tool);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  if (record.ownerPid !== process.pid) throw new Error('Tool maintenance ownership changed before installer start.');
  writeFileSync(path, JSON.stringify({ ...record, childPid }));
}

export function joinToolMaintenance(root: string, tool: string): () => void {
  const active = readToolMaintenance(root, tool);
  if (!active) return claimToolMaintenance(root, tool);
  const record = JSON.parse(readFileSync(lockPath(root, tool), 'utf8'));
  if (record.childPid !== process.pid || !active.ownerPid) throw new Error('Tool maintenance belongs to another operation.');
  return () => {}; // The owning Setup job releases its own lock after the child exits.
}

export function comfyPythonUpgradePending(root: string): boolean { return toolPythonUpgradePending(root, 'comfyui'); }

export function toolPythonUpgradePending(root: string, tool: 'comfyui' | 'aitoolkit'): boolean {
  const path = join(root, 'Tools', tool === 'comfyui' ? 'ComfyUI' : 'AI-Toolkit', '.umbra-python-upgrade.json');
  if (!existsSync(path)) return false;
  try {
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    return receipt.version !== 1 || !['complete', 'rolled-back'].includes(receipt.phase);
  } catch { return true; }
}
