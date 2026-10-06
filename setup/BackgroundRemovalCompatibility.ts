import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { managedChildPath } from './ManagedToolRequirements';

export const BACKGROUND_COMPATIBILITY_VERSION = '1.3.4+umbra.1';
export const BACKGROUND_COMPATIBILITY_RECIPE = 'transparent-background-1.3.4-albumentationsx-2.4.11-v1';
const BACKGROUND_WHEEL = 'transparent_background-1.3.4-py3-none-any.whl';
const BACKGROUND_SHA = 'aa823962e124ae06ea16eb722c18d00cafdda2eda729e9d84d1ab038f62a1d32';
const AUGMENTATION_WHEEL = 'albumentationsx-2.4.11-py3-none-any.whl';
const AUGMENTATION_SHA = '9a7a361aa4b08b4f63a382451039deafb0b2cebc5d1cbc20a976406394d19d2c';
const PATCHED_UTILS_SHA = 'ec891f8219cb1df117ba09ebc39652bca82571872379389d8185336916ec6d98';

export type BackgroundCompatibilityStatus = {
  status: 'not-needed' | 'ready' | 'repair-required' | 'held';
  verified: boolean; detail: string; versions: Record<string, string>;
  legacyConsumers: string[];
};
type PythonResult = { status: number | null; stdout?: string; stderr?: string; error?: unknown };
export type BackgroundCompatibilityProbeOptions = {
  runPython?: (python: string, args: string[]) => PythonResult;
};
type BackgroundSnapshot = {
  prefix: string; versions: Record<string, string>; legacyConsumers: string[];
  issues: string[]; utilsSha: string;
};

const SNAPSHOT = String.raw`import hashlib,importlib.metadata as m,json,pathlib,re,sys
try:
 from packaging.requirements import Requirement
except ImportError:
 from pip._vendor.packaging.requirements import Requirement
names=('transparent-background','albumentations','albumentationsx','albucore','torch','torchvision','torchaudio')
versions={}
for name in names:
 try: versions[name]=m.version(name)
 except m.PackageNotFoundError: versions[name]=''
consumers=[]; issues=[]
for distribution in m.distributions():
 for value in distribution.requires or []:
  try:
   requirement=Requirement(value)
   if re.sub(r'[-_.]+','-',requirement.name.lower())!='albumentations': continue
   if requirement.marker and not requirement.marker.evaluate({'extra':''}): continue
   consumers.append(distribution.metadata['Name'])
  except Exception:
   if re.match(r'^albumentations(?:\s|[<>=!;\[]|$)',value,re.I): issues.append('Unverified legacy dependency declaration')
sha=''
if versions['transparent-background']:
 try:
  data=pathlib.Path(m.distribution('transparent-background').locate_file('transparent_background/utils.py')).read_bytes()
  sha=hashlib.sha256(data.replace(b'\r\n',b'\n')).hexdigest()
 except Exception: issues.append('Background resize implementation could not be verified')
for name in ('transparent-background','albumentationsx','albucore'):
 if not versions[name]: continue
 for text in m.distribution(name).requires or []:
  try:
   requirement=Requirement(text)
   if requirement.marker and not requirement.marker.evaluate(): continue
   if re.sub(r'[-_.]+','-',requirement.name.lower())=='albumentations': continue
   installed=m.version(requirement.name)
   if requirement.url or not requirement.specifier.contains(installed,prereleases=True): issues.append(name+': incompatible '+requirement.name)
  except m.PackageNotFoundError: issues.append(name+': missing '+requirement.name)
  except Exception: issues.append(name+': unverified dependency declaration')
print(json.dumps({'prefix':sys.prefix,'versions':versions,'legacyConsumers':sorted(set(consumers)),'issues':issues,'utilsSha':sha}))`;

const pythonPath = (runtimeRoot: string) => join(runtimeRoot, 'Tools', 'ComfyUI', 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/g, '-');
const evidencePath = (root: string) => managedChildPath(root, 'User/Config/background-removal-compatibility.json');
const fingerprint = (value: BackgroundSnapshot) => createHash('sha256').update(JSON.stringify({ prefix: resolve(value.prefix), versions: value.versions, utilsSha: value.utilsSha })).digest('hex');

function verifiedEvidence(runtimeRoot: string, value: BackgroundSnapshot): boolean {
  try {
    const evidence = JSON.parse(readFileSync(evidencePath(runtimeRoot), 'utf8'));
    return evidence.schemaVersion === 1 && evidence.recipe === BACKGROUND_COMPATIBILITY_RECIPE
      && evidence.fingerprint === fingerprint(value) && evidence.pipCheck === true && evidence.preprocessing === true;
  } catch { return false; }
}

function pendingRepair(runtimeRoot: string): boolean {
  try {
    const evidence = JSON.parse(readFileSync(evidencePath(runtimeRoot), 'utf8'));
    return evidence.schemaVersion === 1 && evidence.recipe === BACKGROUND_COMPATIBILITY_RECIPE && evidence.inProgress === true;
  } catch { return false; }
}

function snapshot(runtimeRoot: string, options: BackgroundCompatibilityProbeOptions = {}): BackgroundSnapshot {
  const python = pythonPath(runtimeRoot);
  const result = options.runPython ? options.runPython(python, ['-I', '-c', SNAPSHOT])
    : spawnSync(python, ['-I', '-c', SNAPSHOT], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  if (result.status !== 0 || result.error) throw new Error('Background package compatibility could not be inspected in the managed environment.');
  const value = JSON.parse(String(result.stdout || '')) as BackgroundSnapshot;
  if (!value || typeof value.prefix !== 'string' || !value.versions || typeof value.versions !== 'object' || Array.isArray(value.versions)
    || !Array.isArray(value.legacyConsumers) || value.legacyConsumers.some((name) => typeof name !== 'string')
    || !Array.isArray(value.issues) || value.issues.some((issue) => typeof issue !== 'string') || typeof value.utilsSha !== 'string'
    || ['transparent-background', 'albumentations', 'albumentationsx', 'albucore', 'torch', 'torchvision', 'torchaudio'].some((name) => !Object.hasOwn(value.versions, name) || typeof value.versions[name] !== 'string')) throw new Error('Background compatibility evidence is invalid.');
  const expected = join(runtimeRoot, 'Tools', 'ComfyUI', 'venv');
  const canonical = (path: string) => resolve(existsSync(path) ? realpathSync(path) : path);
  if (canonical(value.prefix) !== canonical(expected)) throw new Error('Background repair requires this installation\'s tool-local Python environment.');
  return value;
}

export function inspectBackgroundRemovalCompatibility(runtimeRoot: string, options: BackgroundCompatibilityProbeOptions = {}): BackgroundCompatibilityStatus {
  if (!existsSync(pythonPath(runtimeRoot)) && !options.runPython) {
    return { status: 'not-needed', verified: true, detail: 'No managed Python environment is installed yet.', versions: {}, legacyConsumers: [] };
  }
  try {
    const value = snapshot(runtimeRoot, options);
    const { versions, legacyConsumers } = value;
    const result = (status: BackgroundCompatibilityStatus['status'], detail: string): BackgroundCompatibilityStatus => ({
      status, verified: status === 'ready' || status === 'not-needed', detail, versions, legacyConsumers,
    });
    const pending = pendingRepair(runtimeRoot);
    const missingX = !versions.albumentationsx && versions['transparent-background'] === BACKGROUND_COMPATIBILITY_VERSION;
    if (!pending && !missingX && (!versions.albumentationsx || (!versions['transparent-background'] && !versions.albumentations))) {
      return result('not-needed', 'The conflicting background-removal / AlbumentationsX combination is not installed.');
    }
    const otherConsumers = legacyConsumers.filter((name) => normalize(name) !== 'transparent-background');
    const issues = value.issues.filter((issue) => !((missingX || pending) && issue === 'transparent-background: missing albumentationsx'));
    if (issues.length) return result('held', `Background package verification is held: ${issues.join('; ')}. Review the managed environment before repair.`);
    if (otherConsumers.length) {
      return result('held', `Legacy Albumentations is also required by ${otherConsumers.join(', ') || 'an unverified package'}. Existing packages are preserved; review those dependencies before repair.`);
    }
    if ((versions.albumentationsx !== '2.4.11' && !missingX && !(pending && !versions.albumentationsx)) || versions.albucore !== '0.2.18'
      || (!['1.3.4', BACKGROUND_COMPATIBILITY_VERSION].includes(versions['transparent-background']) && !(pending && !versions['transparent-background']))) {
      return result('held', 'This background / augmentation package combination is outside the reviewed compatibility recipe. No dependency downgrade or removal is allowed.');
    }
    if (versions['transparent-background'] === BACKGROUND_COMPATIBILITY_VERSION && !versions.albumentations
      && value.utilsSha === PATCHED_UTILS_SHA && !legacyConsumers.length && verifiedEvidence(runtimeRoot, value)) {
      return result('ready', 'Background removal uses the reviewed AlbumentationsX compatibility package; the overlapping legacy package is absent.');
    }
    return result('repair-required', 'Background removal needs the reviewed compatibility wheel and a clean AlbumentationsX namespace. Repair preserves Torch/CUDA and refuses unrelated legacy consumers.');
  } catch (error) {
    return { status: 'held', verified: false, detail: error instanceof Error ? error.message : String(error), versions: {}, legacyConsumers: [] };
  }
}

const PREPROCESS_SMOKE = String.raw`import os
os.environ['NO_ALBUMENTATIONS_UPDATE']='1'
os.environ['ALBUMENTATIONS_OFFLINE']='1'
os.environ['ALBUMENTATIONS_NO_TELEMETRY']='1'
import albumentations as A,numpy as np
from transparent_background import Remover
from transparent_background.utils import dynamic_resize_a
assert callable(Remover)
for h,w in [(96,160),(160,96),(96,96)]:
 image=np.zeros((h,w,3),dtype=np.uint8)
 assert A.Compose([A.Resize(64,64)])(image=image)['image'].shape==(64,64,3)
 result=A.Compose([dynamic_resize_a(L=64)])(image=image)['image']
 assert result.shape[:2]==(int(round(h/(min(h,w)/64)/32))*32,int(round(w/(min(h,w)/64)/32))*32)
print('UMBRA_BACKGROUND_PREPROCESS_OK')`;

export async function repairBackgroundRemovalCompatibility(sourceRoot: string, runtimeRoot: string, hooks: {
  assertIdle: () => Promise<void>; log?: (line: string) => void;
  runPython?: (python: string, args: string[], options: { env: NodeJS.ProcessEnv; cwd: string }) => PythonResult;
  probe?: BackgroundCompatibilityProbeOptions;
}): Promise<void> {
  const before = inspectBackgroundRemovalCompatibility(runtimeRoot, hooks.probe);
  if (before.verified) return;
  if (before.status !== 'repair-required') throw new Error(before.detail);
  await hooks.assertIdle();
  const helper = join(sourceRoot, 'setup', 'python', 'background_compat.py');
  if (!existsSync(helper)) throw new Error('The bundled background compatibility recipe is missing. Repair the Umbra installation first.');
  const cacheRoot = managedChildPath(runtimeRoot, 'User/Cache/BackgroundCompatibility');
  mkdirSync(cacheRoot, { recursive: true });
  const cache = managedChildPath(cacheRoot, randomUUID());
  mkdirSync(cache);
  const constraint = process.env.PIP_CONSTRAINT?.trim();
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^PIP_/i.test(name) && !/^PYTHON(?:PATH|HOME|USERBASE)$/i.test(name)));
  // Python/pip isolation alone still permits global/site pip configuration files.
  env.PIP_CONFIG_FILE = process.platform === 'win32' ? 'nul' : '/dev/null';
  env.NO_ALBUMENTATIONS_UPDATE = '1'; env.ALBUMENTATIONS_OFFLINE = '1'; env.ALBUMENTATIONS_NO_TELEMETRY = '1';
  const python = pythonPath(runtimeRoot);
  const run = (args: string[]) => {
    const result = hooks.runPython ? hooks.runPython(python, args, { env, cwd: cache })
      : spawnSync(python, args, { env, cwd: cache, encoding: 'utf8', windowsHide: true, timeout: 180_000, maxBuffer: 4_000_000 });
    for (const line of `${result.stdout || ''}\n${result.stderr || ''}`.split(/\r?\n/).filter(Boolean)) hooks.log?.(line);
    if (result.status !== 0 || result.error) throw new Error(`Background compatibility repair failed: ${args.includes('uninstall') ? 'legacy package removal' : args.includes('install') ? 'package installation' : 'package verification'}. Review the installer log and retry; no automatic rollback was attempted.`);
    return String(result.stdout || '');
  };
  const requirements = join(cache, 'wheels.txt');
  writeFileSync(requirements, `transparent-background==1.3.4 --hash=sha256:${BACKGROUND_SHA}\nalbumentationsx==2.4.11 --hash=sha256:${AUGMENTATION_SHA}\n`, { flag: 'wx' });
  hooks.log?.('Preparing checksum-verified background compatibility wheels; Torch/CUDA and model files remain untouched.');
  // Downloads use PyPI explicitly, ignore custom indexes, and cannot install dependencies.
  run(['-I', '-m', 'pip', '--isolated', 'download', '--no-deps', '--only-binary=:all:', '--index-url', 'https://pypi.org/simple', '--require-hashes', '-r', requirements, '--dest', cache]);
  for (const [filename, hash] of [[BACKGROUND_WHEEL, BACKGROUND_SHA], [AUGMENTATION_WHEEL, AUGMENTATION_SHA]]) {
    if (createHash('sha256').update(readFileSync(join(cache, filename))).digest('hex') !== hash) throw new Error('Background compatibility wheel checksum mismatch. No installed package was changed.');
  }
  const built = JSON.parse(run(['-I', helper, 'build', join(cache, BACKGROUND_WHEEL), cache]));
  const patchedName = `transparent_background-${BACKGROUND_COMPATIBILITY_VERSION}-py3-none-any.whl`;
  const patched = join(cache, patchedName);
  if (built.wheel !== patchedName || built.utilsSha256 !== PATCHED_UTILS_SHA
    || built.sha256 !== createHash('sha256').update(readFileSync(patched)).digest('hex')) throw new Error('The compatibility wheel does not match the reviewed recipe. No installed package was changed.');
  const current = inspectBackgroundRemovalCompatibility(runtimeRoot, hooks.probe);
  if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error('Background packages changed while preparing repair. Review the current plan before retrying.');
  await hooks.assertIdle();
  const evidence = evidencePath(runtimeRoot);
  mkdirSync(join(runtimeRoot, 'User', 'Config'), { recursive: true });
  writeFileSync(evidence, JSON.stringify({ schemaVersion: 1, recipe: BACKGROUND_COMPATIBILITY_RECIPE, inProgress: true, startedAt: new Date().toISOString() }));
  const installArgs = ['-I', '-m', 'pip', '--isolated', 'install', '--no-deps', '--force-reinstall', ...(constraint ? ['--constraint', constraint] : [])];
  run([...installArgs, patched]);
  if (before.versions.albumentations) run(['-I', '-m', 'pip', '--isolated', 'uninstall', '--yes', 'albumentations']);
  // Removing the old distribution deletes shared namespace files, so restore the identical X wheel.
  run([...installArgs, join(cache, AUGMENTATION_WHEEL)]);
  const after = snapshot(runtimeRoot, hooks.probe);
  if (after.issues.length || after.versions.albumentations || after.legacyConsumers.length
    || after.versions['transparent-background'] !== BACKGROUND_COMPATIBILITY_VERSION || after.utilsSha !== PATCHED_UTILS_SHA) throw new Error('Background compatibility package verification remains held. Review the installation log.');
  for (const name of ['torch', 'torchvision', 'torchaudio', 'albumentationsx', 'albucore']) {
    if (after.versions[name] !== before.versions[name] && !(name === 'albumentationsx' && !before.versions[name] && after.versions[name] === '2.4.11')) throw new Error(`${name} changed unexpectedly during background compatibility repair.`);
  }
  run(['-I', '-m', 'pip', '--isolated', 'check']);
  if (!run(['-I', '-c', PREPROCESS_SMOKE]).includes('UMBRA_BACKGROUND_PREPROCESS_OK')) throw new Error('Background preprocessing verification did not complete.');
  writeFileSync(evidence, JSON.stringify({ schemaVersion: 1, recipe: BACKGROUND_COMPATIBILITY_RECIPE, fingerprint: fingerprint(after), pipCheck: true, preprocessing: true, verifiedAt: new Date().toISOString() }));
  if (!inspectBackgroundRemovalCompatibility(runtimeRoot, hooks.probe).verified) throw new Error('Background packages changed during final verification. Review and retry.');
  hooks.log?.('Background package compatibility and synthetic preprocessing verified. No segmentation weights were loaded or downloaded. Restart managed ComfyUI normally.');
}
