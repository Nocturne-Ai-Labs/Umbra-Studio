import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { managedChildPath, type ManagedRuntimePackage } from '../setup/ManagedToolRequirements';

type InstalledDistribution = { name: string; version: string };

export function invalidateManagedPythonSetupEvidence(runtimeRoot: string, target: string): void {
  const comfyRoot = join(runtimeRoot, 'Tools', 'ComfyUI');
  const root = target === 'ComfyUI' ? comfyRoot : managedChildPath(join(comfyRoot, 'custom_nodes'), target);
  const marker = join(root, target === 'ComfyUI' ? '.requirements_installed' : '.umbra-requirements-installed');
  if (!existsSync(marker)) return;
  const content = readFileSync(marker, 'utf8');
  const cache = join(runtimeRoot, 'User', 'Cache', 'UmbraUpdater');
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, `requirements-evidence-${randomUUID()}.json`), JSON.stringify({ target, priorMarker: content, updatedAt: new Date().toISOString() }), { flag: 'wx' });
  // Setup's unchanged-hash fast path cannot repair a subsequently damaged environment.
  // Retain the old evidence, then invalidate only its generated marker so the existing installer does the sync.
  if (readFileSync(marker, 'utf8') !== content) throw new Error('Managed Python Setup evidence changed during admission. Review and retry.');
  unlinkSync(marker);
}

export function managedDependencyConstraints(installed: InstalledDistribution[], optional: string[]): string {
  const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/g, '-');
  const packages = new Map<string, string>();
  for (const entry of installed) {
    if (!entry || typeof entry.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(entry.name)
      || typeof entry.version !== 'string' || !/^[0-9][A-Za-z0-9.!+_-]*$/.test(entry.version)) {
      throw new Error('Managed Python package versions could not be safely constrained. Existing packages were preserved; review Setup before retrying.');
    }
    const name = normalize(entry.name);
    if (packages.has(name) && packages.get(name) !== entry.version) throw new Error(`Multiple installed versions of ${name} need review before managed repair.`);
    packages.set(name, entry.version);
  }
  const held = new Set(optional.map(normalize));
  for (const name of held) if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Invalid optional dependency hold.');
  // Existing versions are lower bounds, not upgrade requests. Unreviewed optional packages cannot change.
  const lines = [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, version]) => `${name}${held.has(name) ? '==' : '>='}${version}`);
  for (const name of held) if (!packages.has(name)) lines.push(`${name}<0`);
  return `${lines.join('\n')}\n`;
}

export function prepareManagedDependencyInstallPolicy(runtimeRoot: string, dependencies: ManagedRuntimePackage[]): { path: string; cleanup: () => void } {
  if (process.env.PIP_CONSTRAINT?.trim()) throw new Error('A custom PIP_CONSTRAINT is active. Review that policy before managed repair; it was not overridden.');
  const python = join(runtimeRoot, 'Tools', 'ComfyUI', 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  let installed: InstalledDistribution[] = [];
  if (existsSync(python)) {
    const probe = spawnSync(python, ['-I', '-c', 'import importlib.metadata as m,json; print(json.dumps([{"name":d.metadata["Name"],"version":d.version} for d in m.distributions()]))'],
      { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
    if (probe.status !== 0 || probe.error) throw new Error('Installed managed Python package versions are unavailable. No package repair was started.');
    try { installed = JSON.parse(probe.stdout.trim()); if (!Array.isArray(installed)) throw new Error(); }
    catch { throw new Error('Installed managed Python package versions are unverified. No package repair was started.'); }
  }
  const optional = dependencies.filter((dependency) => dependency.optional).map((dependency) => dependency.distribution);
  // Both distributions provide the declared Triton module; platform selection still needs an explicit reviewed pin.
  if (dependencies.some((dependency) => dependency.optional && dependency.module === 'triton')) optional.push('triton', 'triton-windows');
  const content = managedDependencyConstraints(installed, optional);
  const cache = join(runtimeRoot, 'User', 'Cache', 'UmbraUpdater');
  mkdirSync(cache, { recursive: true });
  const path = join(cache, `dependency-constraints-${randomUUID()}.txt`);
  writeFileSync(path, content, { flag: 'wx' });
  return { path, cleanup: () => unlinkSync(path) };
}
