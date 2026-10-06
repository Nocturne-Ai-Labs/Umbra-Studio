import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { compareUmbraVersions } from '../shared/appUpdate';
import { inspectBundledPythonHelpers } from '../backend/PythonHelpers';
import { readModelSetupManifest } from '../setup/ModelSetupCatalog';
import { daSiWaCoreRequirements } from '../setup/DaSiWaRequirements';
import { ordinaryNodeRequirementsMarker } from '../setup/OrdinaryNodeRequirements';
import { inspectManagedNodeFrontend, managedChildPath, readManagedToolRequirements, type ManagedNodeRequirement, type ManagedRuntimePackage } from '../setup/ManagedToolRequirements';
import { inspectBackgroundRemovalCompatibility } from '../setup/BackgroundRemovalCompatibility';
import { inspectMediaTools } from '../setup/MediaTools';

export type ManagedNodeStatus = {
  name: string; minimumCommit: string; installedCommit: string;
  installedVersion: string; requiredVersion: string;
  status: 'ready' | 'missing' | 'outdated' | 'unknown'; reason?: string;
  requiredClasses: string[]; requiredFrontendClasses: string[];
  frontendAssets: string[]; runtimeVerified: boolean;
  filesVerified: boolean; runtimeReadiness: 'ready' | 'held' | 'unverified';
  pythonDependencies: ManagedPythonDependencyStatus;
};
export type ManagedPythonDependencyStatus = { verified: boolean; detail: string };
export type ManagedModuleProbeStatus = 'present' | 'missing' | 'unverified';
export type ManagedPythonModuleProbeOptions = {
  fileExists?: (path: string) => boolean;
  runPython?: (python: string, args: string[], input?: string) => { status: number | null; stdout?: string; error?: unknown };
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

type ManagedGitProbe = { status: number | null; stdout: string };

function probeManagedGit(root: string, args: string[], probes?: Map<string, ManagedGitProbe>): ManagedGitProbe {
  const key = JSON.stringify([root, args]);
  const prior = probes?.get(key);
  if (prior) return prior;
  const probe = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  probes?.set(key, probe);
  return probe;
}

function readCheckoutCommit(root: string, probes?: Map<string, ManagedGitProbe>): string {
  const top = probeManagedGit(root, ['rev-parse', '--show-toplevel'], probes);
  if (top.status !== 0 || resolve(top.stdout.trim()).toLowerCase() !== resolve(root).toLowerCase()) return '';
  const head = probeManagedGit(root, ['rev-parse', 'HEAD'], probes);
  return head.status === 0 && /^[a-f0-9]{40}$/.test(head.stdout.trim()) ? head.stdout.trim() : '';
}

function readNodeVersion(root: string): string {
  try {
    const metadata = Bun.TOML.parse(readFileSync(join(root, 'pyproject.toml'), 'utf8')) as { project?: { version?: unknown }; tool?: { poetry?: { version?: unknown } } };
    const version = metadata.project?.version || metadata.tool?.poetry?.version;
    if (typeof version === 'string' && /^\d+\.\d+\.\d+[A-Za-z0-9.+-]*$/.test(version)) return version;
  } catch { /* Node suites may use JavaScript or inline Python metadata. */ }
  try {
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    if (typeof version === 'string' && /^\d+\.\d+\.\d+(?:[A-Za-z0-9.+-]*)$/.test(version)) return version;
  } catch { /* Node suites may use Python metadata instead. */ }
  try { return readFileSync(join(root, '__init__.py'), 'utf8').match(/__version__\s*=\s*["'](\d+\.\d+\.\d+[A-Za-z0-9.+-]*)["']/)?.[1] || ''; }
  catch { /* Version metadata is informational; the commit remains authoritative. */ }
  return '';
}

const PYTHON_REQUIREMENTS_PROBE = String.raw`import importlib.metadata as m,json,re,sys
try:
 from packaging.requirements import Requirement
except ImportError:
 from pip._vendor.packaging.requirements import Requirement
issues=[]
for line in sys.stdin.read().replace('\\\n','').splitlines():
 line=re.split(r'\s+#',line,1)[0].strip()
 if not line or line.startswith('#'): continue
 try:
  requirement=Requirement(line)
  if requirement.marker and not requirement.marker.evaluate(): continue
  distribution=m.distribution(requirement.name)
  if requirement.url: issues.append(requirement.name+': direct-source revision needs separate verification')
  elif not requirement.specifier.contains(distribution.version, prereleases=True): issues.append(requirement.name+': installed '+distribution.version+' does not satisfy '+str(requirement.specifier))
 except m.PackageNotFoundError:
  issues.append(requirement.name+': missing from the managed environment')
 except Exception:
  issues.append('Unverified requirement: '+line[:160])
print(json.dumps({'verified':not issues,'issues':issues[:16]}))`;

function inspectPythonDependencies(comfyRoot: string, dependencyRoot: string, nodeName?: string, options: ManagedPythonModuleProbeOptions = {}): ManagedPythonDependencyStatus {
  if (nodeName && !existsSync(join(dependencyRoot, '__init__.py'))) return { verified: false, detail: 'The node source is unavailable; its Python requirements remain unverified.' };
  const python = join(comfyRoot, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!existsSync(python)) return { verified: false, detail: 'The managed tool-local Python environment needs Setup.' };
  const requirementsPath = join(dependencyRoot, 'requirements.txt');
  if (!existsSync(requirementsPath)) return { verified: Boolean(nodeName), detail: nodeName ? 'No node requirements.txt is declared.' : 'ComfyUI requirements.txt is unavailable.' };
  try {
    const content = readFileSync(requirementsPath, 'utf8');
    const installedContent = nodeName === 'ComfyUI-DaSiWa-Nodes' ? daSiWaCoreRequirements(content) : content;
    const marker = readFileSync(join(dependencyRoot, nodeName ? '.umbra-requirements-installed' : '.requirements_installed'), 'utf8').trim();
    const expectedMarker = nodeName && nodeName !== 'ComfyUI-DaSiWa-Nodes'
      ? ordinaryNodeRequirementsMarker(installedContent) : Bun.hash(installedContent).toString();
    if (marker === expectedMarker) {
      const args = ['-I', '-c', PYTHON_REQUIREMENTS_PROBE];
      const probe = options.runPython ? options.runPython(python, args, installedContent)
        : spawnSync(python, args, { input: installedContent, encoding: 'utf8', windowsHide: true, timeout: 5_000 });
      if (probe.status === 0 && !probe.error) {
        const result = JSON.parse(String(probe.stdout || '')) as { verified?: boolean; issues?: string[] };
        if (result.verified === true && Array.isArray(result.issues) && !result.issues.length) {
          return { verified: true, detail: 'Managed Setup recorded these requirements and installed distribution versions satisfy them. Imports, platform/GPU compatibility and runtime readiness remain separate checks.' };
        }
        if (Array.isArray(result.issues) && result.issues.every((issue) => typeof issue === 'string')) {
          return { verified: false, detail: `Python requirements need managed Setup sync: ${result.issues.join('; ')}` };
        }
      }
      return { verified: false, detail: 'Managed Python requirement versions could not be verified. Review Setup and explicitly retry; runtime imports remain unchecked.' };
    }
  } catch { /* Missing/stale setup evidence requires the existing managed installer. */ }
  return { verified: false, detail: 'Python requirement installation is unverified or stale. Repair using the existing managed Setup installer.' };
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

export function inspectManagedNode(sourceRoot: string, comfyRoot: string, requirement: ManagedNodeRequirement, registeredClasses?: ReadonlySet<string>, options: ManagedPythonModuleProbeOptions = {}, gitProbes?: Map<string, ManagedGitProbe>): ManagedNodeStatus {
  const nodePath = managedChildPath(join(comfyRoot, 'custom_nodes'), requirement.name);
  const base = {
    name: requirement.name, minimumCommit: requirement.minimumCommit,
    installedVersion: readNodeVersion(nodePath), requiredVersion: (requirement as ManagedNodeRequirement & { version?: string }).version || '',
    requiredClasses: requirement.requiredClasses || [], requiredFrontendClasses: requirement.requiredFrontendClasses || [],
    frontendAssets: requirement.frontendAssets?.map((asset) => asset.path) || [], runtimeVerified: registeredClasses !== undefined,
    filesVerified: false, runtimeReadiness: 'unverified' as ManagedNodeStatus['runtimeReadiness'],
    pythonDependencies: inspectPythonDependencies(comfyRoot, nodePath, requirement.name, options),
  };
  if (!existsSync(join(nodePath, '__init__.py'))) return { ...base, installedCommit: '', status: 'missing', reason: 'Install the declared node suite in Setup.' };
  const topLevel = probeManagedGit(nodePath, ['rev-parse', '--show-toplevel'], gitProbes);
  if (topLevel.status !== 0 || resolve(topLevel.stdout.trim()).toLowerCase() !== resolve(nodePath).toLowerCase()) {
    return { ...base, installedCommit: '', status: 'unknown', reason: 'The suite is not an independent Git checkout; local files were preserved.' };
  }
  const head = probeManagedGit(nodePath, ['rev-parse', 'HEAD'], gitProbes);
  const installedCommit = head.status === 0 ? head.stdout.trim() : '';
  if (!/^[a-f0-9]{40}$/.test(installedCommit)) return { ...base, installedCommit: '', status: 'unknown' };
  if (installedCommit !== requirement.minimumCommit) {
    const ancestor = probeManagedGit(nodePath, ['merge-base', '--is-ancestor', requirement.minimumCommit, 'HEAD'], gitProbes);
    if (ancestor.status !== 0) return { ...base, installedCommit, status: 'outdated', reason: 'Install the reviewed node suite version in Setup.' };
  }
  if (requirement.requiredPatch) {
    const patch = safeChild(join(sourceRoot, 'setup'), requirement.requiredPatch);
    if (!existsSync(patch)) {
      return { ...base, installedCommit, status: 'unknown', reason: 'Bundled compatibility patch is missing; repair the Umbra Studio installation.' };
    }
    // The upstream commit alone cannot establish readiness for Umbra's local integration.
    const applied = probeManagedGit(nodePath, ['apply', '--reverse', '--check', patch], gitProbes);
    if (applied.status !== 0) {
      return { ...base, installedCommit, status: 'outdated', reason: 'Umbra compatibility patch needs to be installed or refreshed.' };
    }
  }
  const frontendProblems = inspectManagedNodeFrontend(nodePath, requirement);
  if (frontendProblems.length) return { ...base, installedCommit, status: 'outdated', reason: `Frontend repair required: ${frontendProblems.join(' ')}` };
  const missingClasses = registeredClasses && base.requiredClasses.filter((name) => !registeredClasses.has(name));
  if (missingClasses?.length) {
    return { ...base, filesVerified: true, runtimeReadiness: 'held', installedCommit, status: 'unknown', reason: `ComfyUI has not registered: ${missingClasses.join(', ')}. Review its node import log and Python dependencies, then restart the managed ComfyUI instance.` };
  }
  return { ...base, filesVerified: true, runtimeReadiness: registeredClasses ? 'ready' : 'unverified', installedCommit, status: 'ready' };
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
  // Suites appear in several features; share identical Git probes only for this inspection, never across requests or repairs.
  const gitProbes = new Map<string, ManagedGitProbe>();
  const requirementsProbes = new Map<string, ReturnType<NonNullable<ManagedPythonModuleProbeOptions['runPython']>>>();
  const probeOptions: ManagedPythonModuleProbeOptions = { runPython: (python, args, input) => {
    const key = JSON.stringify([python, args, input]);
    if (!requirementsProbes.has(key)) requirementsProbes.set(key, spawnSync(python, args, { input, encoding: 'utf8', windowsHide: true, timeout: 5_000 }));
    return requirementsProbes.get(key)!;
  } };
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
      customNodes: feature.customNodes.map((node) => inspectManagedNode(sourceRoot, comfyRoot, node, registeredClasses, probeOptions, gitProbes)),
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
      installedCommit: existsSync(comfyRoot) ? readCheckoutCommit(comfyRoot, gitProbes) : '',
      filesVerified: Boolean(installedVersion) && existsSync(join(comfyRoot, 'main.py')),
      pythonDependencies: inspectPythonDependencies(comfyRoot, comfyRoot, undefined, probeOptions),
      runtimeReadiness: 'unverified' as const,
      // The managed core installer must satisfy every build declaration, even before models activate a feature.
      minimumFrontendRequired: features.map((feature) => feature.minimumFrontendVersion).filter(Boolean)
        .sort(compareUmbraVersions).at(-1) || '',
      minimumRequired: features.map((feature) => feature.minimumComfyVersion)
        .sort(compareUmbraVersions).at(-1) || '',
    },
    features,
    backgroundCompatibility: inspectBackgroundRemovalCompatibility(runtimeRoot),
    mediaTools: inspectMediaTools(runtimeRoot),
    pythonHelpers: inspectBundledPythonHelpers(runtimeRoot),
  };
}
