import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { compareUmbraVersions } from '../shared/appUpdate';
import { readModelSetupManifest } from '../setup/ModelSetupCatalog';
import { inspectManagedNodeFrontend, managedChildPath, readManagedToolRequirements, type ManagedNodeRequirement, type ManagedRuntimePackage } from '../setup/ManagedToolRequirements';

export type ManagedNodeStatus = {
  name: string; minimumCommit: string; installedCommit: string;
  status: 'ready' | 'missing' | 'outdated' | 'unknown'; reason?: string;
  requiredClasses: string[]; requiredFrontendClasses: string[];
  frontendAssets: string[]; runtimeVerified: boolean;
};
export type ManagedModuleProbeStatus = 'present' | 'missing' | 'unverified';
export type ManagedPythonModuleProbeOptions = {
  fileExists?: (path: string) => boolean;
  runPython?: (python: string, args: string[]) => { status: number | null; stdout?: string; error?: unknown };
};
export type ManagedConditionalModuleStatus = ManagedRuntimePackage & {
  status: ManagedModuleProbeStatus; detail: string;
};
export type ManagedFeatureStatus = {
  id: string;
  label: string;
  optional: boolean;
  active: boolean;
  minimumComfyVersion: string;
  minimumFrontendVersion: string;
  modelProfiles: string[];
  missingModels: string[];
  totalModels: number;
  customNodes: ManagedNodeStatus[];
  workflowIds: string[];
  requiredBuiltinClasses: string[];
  missingRuntimeClasses: string[];
  runtimePackages: (ManagedRuntimePackage & { status: 'missing' | 'unverified'; moduleStatus: ManagedModuleProbeStatus; detail: string })[];
};

function safeChild(root: string, path: string): string {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe managed dependency path.');
  return target;
}

function readComfyVersion(comfyRoot: string): string {
  for (const [name, pattern] of [
    ['comfyui_version.py', /__version__\s*=\s*["'](\d+\.\d+\.\d+)["']/],
    ['pyproject.toml', /^version\s*=\s*["'](\d+\.\d+\.\d+)["']/m],
  ] as const) {
    try {
      const match = readFileSync(join(comfyRoot, name), 'utf8').match(pattern);
      if (match) return match[1];
    } catch { /* Try the other version file. */ }
  }
  return '';
}

export function inspectManagedPythonModule(selectedToolRoot: string, module: string, options: ManagedPythonModuleProbeOptions = {}): { status: ManagedModuleProbeStatus; detail: string } {
  if (!isAbsolute(selectedToolRoot) || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(module)) {
    return { status: 'unverified', detail: 'Module availability could not be verified: an explicit absolute tool root and declared module are required. The active branch is held.' };
  }
  const python = join(selectedToolRoot, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  let available = false;
  try { available = (options.fileExists || existsSync)(python); } catch { /* An unreadable interpreter remains unverified. */ }
  if (!available) {
    return { status: 'unverified', detail: `Module ${module} could not be verified because the selected tool-local Python environment is unavailable. The active branch is held.` };
  }
  const script = 'import importlib.util,sys\ntry:\n print("UMBRA_MODULE_PROBE|present" if importlib.util.find_spec(sys.argv[1]) is not None else "UMBRA_MODULE_PROBE|missing")\nexcept Exception:\n print("UMBRA_MODULE_PROBE|unverified")';
  try {
    const probe = options.runPython ? options.runPython(python, ['-I', '-c', script, module])
      : spawnSync(python, ['-I', '-c', script, module], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
    const marker = probe.status === 0 && !probe.error ? String(probe.stdout || '').trim() : '';
    if (marker === 'UMBRA_MODULE_PROBE|present') {
      return { status: 'present', detail: `Module ${module} is present in the selected tool-local environment. Torch/platform compatibility, native GPU execution and quality remain unqualified.` };
    }
    if (marker === 'UMBRA_MODULE_PROBE|missing') {
      return { status: 'missing', detail: `Module ${module} is missing from the selected tool-local environment. The active branch is held until its compatible dependency is installed.` };
    }
  } catch { /* A failed interpreter/probe is unknown evidence, not proof of a missing module. */ }
  return { status: 'unverified', detail: `Module ${module} availability could not be verified in the selected tool-local environment. The active branch is held; review the Python environment and retry readiness.` };
}

export function inspectActiveManagedWorkflowRuntimePackages(sourceRoot: string, selectedToolRoot: string, workflowId: string, apiClasses: ReadonlySet<string>, options: ManagedPythonModuleProbeOptions = {}): ManagedConditionalModuleStatus[] {
  const requirements = readManagedToolRequirements(sourceRoot);
  if (!requirements.length) throw new Error('Managed workflow dependency declarations are unavailable. Native readiness is held until the Umbra installation is repaired.');
  const dependencies = requirements.filter((feature) => feature.workflowIds?.includes(workflowId))
    .flatMap((feature) => feature.runtimePackages || [])
    .filter((dependency) => dependency.requiredWhen?.workflowId === workflowId && apiClasses.has(dependency.requiredWhen.className));
  const probes = new Map<string, ReturnType<typeof inspectManagedPythonModule>>();
  return dependencies.map((dependency) => {
    if (!probes.has(dependency.module)) probes.set(dependency.module, inspectManagedPythonModule(selectedToolRoot, dependency.module, options));
    return { ...dependency, ...probes.get(dependency.module)! };
  });
}

export function inspectManagedNode(sourceRoot: string, comfyRoot: string, requirement: ManagedNodeRequirement, registeredClasses?: ReadonlySet<string>): ManagedNodeStatus {
  const nodePath = managedChildPath(join(comfyRoot, 'custom_nodes'), requirement.name);
  const base = {
    name: requirement.name, minimumCommit: requirement.minimumCommit,
    requiredClasses: requirement.requiredClasses || [], requiredFrontendClasses: requirement.requiredFrontendClasses || [],
    frontendAssets: requirement.frontendAssets?.map((asset) => asset.path) || [], runtimeVerified: registeredClasses !== undefined,
  };
  if (!existsSync(join(nodePath, '__init__.py'))) return { ...base, installedCommit: '', status: 'missing', reason: 'Install the declared node suite in Setup.' };
  const topLevel = spawnSync('git', ['-C', nodePath, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  if (topLevel.status !== 0 || resolve(topLevel.stdout.trim()).toLowerCase() !== resolve(nodePath).toLowerCase()) {
    return { ...base, installedCommit: '', status: 'unknown', reason: 'The suite is not an independent Git checkout; local files were preserved.' };
  }
  const head = spawnSync('git', ['-C', nodePath, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  const installedCommit = head.status === 0 ? head.stdout.trim() : '';
  if (!/^[a-f0-9]{40}$/.test(installedCommit)) return { ...base, installedCommit: '', status: 'unknown' };
  if (installedCommit !== requirement.minimumCommit) {
    const ancestor = spawnSync('git', ['-C', nodePath, 'merge-base', '--is-ancestor', requirement.minimumCommit, 'HEAD'], {
      encoding: 'utf8', windowsHide: true, timeout: 5_000,
    });
    if (ancestor.status !== 0) return { ...base, installedCommit, status: 'outdated', reason: 'Install the reviewed node suite version in Setup.' };
  }
  if (requirement.requiredPatch) {
    const patch = safeChild(join(sourceRoot, 'setup'), requirement.requiredPatch);
    if (!existsSync(patch)) {
      return { ...base, installedCommit, status: 'unknown', reason: 'Bundled compatibility patch is missing; repair the Umbra Studio installation.' };
    }
    // The upstream commit alone cannot establish readiness for Umbra's local integration.
    const applied = spawnSync('git', ['-C', nodePath, 'apply', '--reverse', '--check', patch], {
      encoding: 'utf8', windowsHide: true, timeout: 5_000,
    });
    if (applied.status !== 0) {
      return { ...base, installedCommit, status: 'outdated', reason: 'Umbra compatibility patch needs to be installed or refreshed.' };
    }
  }
  const frontendProblems = inspectManagedNodeFrontend(nodePath, requirement);
  if (frontendProblems.length) return { ...base, installedCommit, status: 'outdated', reason: `Frontend repair required: ${frontendProblems.join(' ')}` };
  const missingClasses = registeredClasses && base.requiredClasses.filter((name) => !registeredClasses.has(name));
  if (missingClasses?.length) {
    return { ...base, installedCommit, status: 'unknown', reason: `ComfyUI has not registered: ${missingClasses.join(', ')}. Review its node import log and Python dependencies, then restart the managed ComfyUI instance.` };
  }
  return { ...base, installedCommit, status: 'ready' };
}

export function inspectManagedDependencies(sourceRoot: string, runtimeRoot: string, registeredClasses?: ReadonlySet<string>) {
  const comfyRoot = join(runtimeRoot, 'Tools', 'ComfyUI');
  const modelsRoot = join(comfyRoot, 'models');
  const installedVersion = readComfyVersion(comfyRoot);
  const requirements = readManagedToolRequirements(sourceRoot);
  const python = join(comfyRoot, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const frontendProbe = requirements.some((feature) => feature.minimumFrontendVersion) && existsSync(python)
    ? spawnSync(python, ['-I', '-c', 'import importlib.metadata; print(importlib.metadata.version("comfyui-frontend-package"))'],
      { encoding: 'utf8', windowsHide: true, timeout: 5_000 }) : null;
  const frontendVersion = frontendProbe?.status === 0 ? frontendProbe.stdout.trim() : '';
  const packageProbes = new Map<string, ReturnType<typeof inspectManagedPythonModule>>();
  const modelManifest = requirements.length ? readModelSetupManifest(sourceRoot, 'requirements') : { models: [] };
  const features: ManagedFeatureStatus[] = requirements.map((feature) => {
    const files = new Map<string, { destination: string; bytes: number }>();
    for (const model of modelManifest.models) {
      if (model.installPolicy !== 'automatic' || !model.profiles.some((profile) => feature.modelProfiles.includes(profile))) continue;
      for (const file of model.files) files.set(file.destination.toLowerCase(), file);
    }
    const missingModels = [...files.values()].filter((file) => {
      const target = safeChild(modelsRoot, file.destination);
      try {
        const info = statSync(target);
        return !info.isFile() || info.size !== file.bytes;
      } catch { return true; }
    }).map((file) => file.destination);
    return {
      id: feature.id,
      label: feature.label,
      optional: feature.optional === true,
      active: feature.workflowIds?.length ? true : Boolean(feature.activationFile && existsSync(safeChild(modelsRoot, feature.activationFile))),
      minimumComfyVersion: feature.minimumComfyVersion,
      minimumFrontendVersion: feature.minimumFrontendVersion || '',
      modelProfiles: feature.modelProfiles,
      missingModels,
      totalModels: files.size,
      customNodes: feature.customNodes.map((node) => inspectManagedNode(sourceRoot, comfyRoot, node, registeredClasses)),
      workflowIds: feature.workflowIds || [],
      requiredBuiltinClasses: feature.requiredBuiltinClasses || [],
      missingRuntimeClasses: registeredClasses ? (feature.requiredBuiltinClasses || []).filter((name) => !registeredClasses.has(name)) : [],
      runtimePackages: (feature.runtimePackages || []).map((entry) => {
        if (!packageProbes.has(entry.module)) {
          packageProbes.set(entry.module, inspectManagedPythonModule(comfyRoot, entry.module));
        }
        const probe = packageProbes.get(entry.module)!;
        return { ...entry, status: probe.status === 'missing' ? 'missing' as const : 'unverified' as const, moduleStatus: probe.status,
          detail: `${probe.detail}${entry.requiredWhen && probe.status !== 'present' ? ` The ${entry.requiredWhen.workflowId} ${entry.requiredWhen.className} branch requires it while enabled (default ${entry.requiredWhen.defaultEnabled ? 'on' : 'off'}).` : ''}` };
      }),
    };
  });
  return {
    requirementsHash: createHash('sha256').update(JSON.stringify(requirements)).digest('hex'),
    comfyui: {
      installed: Boolean(installedVersion),
      version: installedVersion,
      frontendVersion,
      minimumFrontendRequired: features.filter((feature) => feature.active && !feature.optional).map((feature) => feature.minimumFrontendVersion).filter(Boolean)
        .sort(compareUmbraVersions).at(-1) || '',
      minimumRequired: features.filter((feature) => feature.active && !feature.optional).map((feature) => feature.minimumComfyVersion)
        .sort(compareUmbraVersions).at(-1) || '',
    },
    features,
  };
}
