import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GGUF_REQUIREMENT = /^\s*llama[-_.]cpp[-_.]python(?:\[[^\]]*\])?(?:[<=>!~;\s@]|$)/i;

export function daSiWaCoreRequirements(requirements: string): string {
  return requirements.split(/\r?\n/).filter((line) => !GGUF_REQUIREMENT.test(line)).join('\n');
}

export function installDaSiWaRequirements(python: string, requirementsPath: string, markerPath: string, forceRequirements = false): boolean {
  // Prompt Forge uses Transformers. Keep the optional GGUF runtime out of setup.
  const requirements = daSiWaCoreRequirements(readFileSync(requirementsPath, 'utf-8'));
  const hash = Bun.hash(requirements).toString();
  try { if (!forceRequirements && readFileSync(markerPath, 'utf-8').trim() === hash) return true; }
  catch { /* Install or refresh the core dependencies. */ }

  const tempDir = mkdtempSync(join(tmpdir(), 'umbra-dasiwa-'));
  try {
    const corePath = join(tempDir, 'requirements.txt');
    writeFileSync(corePath, requirements);
    const install = spawnSync(python, ['-m', 'pip', 'install', '-r', corePath], { stdio: 'inherit' });
    if (install.status !== 0) return false;
    writeFileSync(markerPath, `${hash}\n`);
    return true;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
