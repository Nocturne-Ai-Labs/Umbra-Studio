import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { managedChildPath, type ManagedRuntimePackage } from '../setup/ManagedToolRequirements';

type InstalledDistribution = { name: string; version: string; tritonRequirement?: string };
export type ManagedMaintenanceAction = 'repair' | 'torch' | 'sage';

export function managedMaintenanceAction(arg: string): { tool: 'ComfyUI' | 'AI-Toolkit'; action: ManagedMaintenanceAction; pythonMigration: boolean } {
  return { tool: arg.includes('aitoolkit') ? 'AI-Toolkit' : 'ComfyUI',
    action: arg.startsWith('update-pytorch-') ? 'torch' : /^install-sage-?attention-comfyui$/.test(arg) ? 'sage' : 'repair',
    pythonMigration: arg === 'update-python-comfyui' || arg === 'update-python-aitoolkit' };
}

export const REVIEWED_SAGE_SOURCE = 'git+https://github.com/thu-ml/SageAttention.git@eb615cf6cf4d221338033340ee2de1c37fbdba4a';

export function reviewedSageTriton(torch: string, platform: string, metadataPin = ''): string {
  // On Linux Torch's installed wheel metadata is authoritative for its exact Triton
  // requirement. Windows' separate provider needs the published compatibility table.
  if (platform === 'linux' && /^triton==\d+\.\d+\.\d+$/.test(metadataPin)) return metadataPin;
  // Current official triton-lang/triton-windows table, reviewed 2026-10-07.
  // The old woct0rdho repository is archived; it is not current compatibility evidence.
  const minor = /^(2\.\d+)\./.exec(torch)?.[1] || '';
  const triton = ({ '2.4': '3.1', '2.5': '3.1', '2.6': '3.2', '2.7': '3.3', '2.8': '3.4', '2.9': '3.5', '2.10': '3.6', '2.11': '3.6', '2.12': '3.7', '2.13': '3.7', '2.14': '3.8' } as Record<string, string>)[minor];
  if (!triton) throw new Error(`SageAttention maintenance is held: Torch ${torch || 'unavailable'} has no reviewed Triton compatibility pin in this Setup version. Existing packages were preserved.`);
  if (platform === 'win32') {
    // These non-yanked CPython 3.13 x64 wheels are published by upstream on PyPI.
    // Pin the reviewed release, rather than choosing a future ABI by latest version.
    const windows = ({ '3.2': '3.2.0.post21', '3.3': '3.3.1.post21', '3.4': '3.4.0.post21', '3.5': '3.5.1.post24', '3.6': '3.6.0.post26', '3.7': '3.7.1.post27', '3.8': '3.8.0.post29' } as Record<string, string>)[triton];
    if (!windows) throw new Error(`SageAttention maintenance is held: Torch ${torch} needs Triton ${triton}, which has no reviewed Windows CPython 3.13 wheel. Update the managed Python/Torch stack before retrying. Existing packages were preserved.`);
    return `triton-windows==${windows}`;
  }
  return `triton>=${triton}.0,<${triton.split('.')[0]}.${Number(triton.split('.')[1]) + 1}`;
}

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

export function managedDependencyConstraints(installed: InstalledDistribution[], optional: string[], action: ManagedMaintenanceAction = 'repair', platform: string = process.platform): string {
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
  // Linux CUDA Torch owns Triton as a required runtime dependency. First use has
  // no wheel metadata yet; a damaged installed wheel exposes its active exact pin.
  // Keep existing optional versions held, and do not unblock Triton for CPU Torch.
  const torch = installed.find(entry => normalize(entry.name) === 'torch');
  if (platform === 'linux' && !packages.has('triton') && (!torch || /^triton==\d+\.\d+\.\d+$/.test(torch.tritonRequirement || ''))) held.delete('triton');
  // Ordered specifiers cannot contain local versions. Pin those builds exactly to preserve e.g. Torch's CUDA variant.
  // Repair keeps lower bounds. Explicit maintenance freezes unrelated packages and
  // releases only the requested accelerator stack; optional packages remain held.
  const allowed = (name: string) => action === 'torch' ? ['torch', 'torchvision', 'torchaudio', 'triton'].includes(name) || name.startsWith('nvidia-')
    : action === 'sage' && ['sageattention', platform === 'win32' ? 'triton-windows' : 'triton'].includes(name);
  const lines = [...packages].sort(([a], [b]) => a.localeCompare(b)).filter(([name]) => action !== 'sage' || !allowed(name))
    .map(([name, version]) => {
      const requested = allowed(name);
      const freeze = !requested && (action !== 'repair' || held.has(name) || version.includes('+'));
      return `${name}${freeze ? '==' : '>='}${requested ? version.split('+')[0] : version}`;
    });
  for (const name of held) if (!packages.has(name) && !allowed(name)) lines.push(`${name}<0`);
  if (action === 'sage') lines.push('sageattention==2.2.0', reviewedSageTriton(packages.get('torch') || '', platform, installed.find(entry => normalize(entry.name) === 'torch')?.tritonRequirement));
  return `${lines.join('\n')}\n`;
}

export function prepareManagedDependencyInstallPolicy(runtimeRoot: string, dependencies: ManagedRuntimePackage[], selection: { tool: 'ComfyUI' | 'AI-Toolkit'; action: ManagedMaintenanceAction } = { tool: 'ComfyUI', action: 'repair' }): { path: string; cleanup: () => void } {
  if (process.env.PIP_CONSTRAINT?.trim()) throw new Error('A custom PIP_CONSTRAINT is active. Review that policy before managed repair; it was not overridden.');
  const python = join(runtimeRoot, 'Tools', selection.tool, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  let installed: InstalledDistribution[] = [];
  if (existsSync(python)) {
    const script = "import importlib.metadata as m,json\ntry:\n from packaging.requirements import Requirement\nexcept ImportError:\n from pip._vendor.packaging.requirements import Requirement\nresult=[]\nfor d in m.distributions():\n entry={'name':d.metadata['Name'],'version':d.version}\n if entry['name'].lower()=='torch':\n  pins=[r.name+str(r.specifier) for text in d.requires or [] for r in [Requirement(text)] if r.name=='triton' and (not r.marker or r.marker.evaluate())]\n  if len(pins)==1: entry['tritonRequirement']=pins[0]\n result.append(entry)\nprint(json.dumps(result))";
    const probe = spawnSync(python, ['-I', '-c', script],
      { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
    if (probe.status !== 0 || probe.error) throw new Error('Installed managed Python package versions are unavailable. No package repair was started.');
    try { installed = JSON.parse(probe.stdout.trim()); if (!Array.isArray(installed)) throw new Error(); }
    catch { throw new Error('Installed managed Python package versions are unverified. No package repair was started.'); }
  }
  const optional = dependencies.filter((dependency) => dependency.optional).map((dependency) => dependency.distribution);
  // Both distributions provide the declared Triton module; platform selection still needs an explicit reviewed pin.
  if (dependencies.some((dependency) => dependency.optional && dependency.module === 'triton')) optional.push('triton', 'triton-windows');
  const content = managedDependencyConstraints(installed, optional, selection.action);
  const cache = join(runtimeRoot, 'User', 'Cache', 'UmbraUpdater');
  mkdirSync(cache, { recursive: true });
  const path = join(cache, `dependency-constraints-${randomUUID()}.txt`);
  writeFileSync(path, content, { flag: 'wx' });
  return { path, cleanup: () => unlinkSync(path) };
}
