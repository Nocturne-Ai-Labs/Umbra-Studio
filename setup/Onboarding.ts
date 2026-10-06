import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, readdirSync, realpathSync, openSync, readSync, closeSync, createReadStream } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { modelSetupCatalog, modelSetupSelection, readModelSetupManifest, type ModelSetupPack } from './ModelSetupCatalog';
import { inspectManagedDependencies } from '../updater/ManagedDependencyStatus';
import { compareUmbraVersions } from '../shared/appUpdate';
import { readManagedToolRequirements } from './ManagedToolRequirements';
import { ordinaryNodeRequirementsMarker } from './OrdinaryNodeRequirements';

export type OnboardingState = {
  schemaVersion: 1; languageSaved: boolean; training: 'undecided' | 'skip' | 'install';
  profiles: string[]; supportProfiles: string[]; checkpoint: string; stage: number;
  nodesFingerprint?: string; verificationFingerprint?: string; verifiedAt?: string;
  checkpointVerification?: { path: string; sha256: string; identity: ReturnType<typeof identity> };
};
const generationProfiles = new Set(['anima', 'anima-2.9b', 'anima-3.8b', 'flux-1', 'flux-2', 'qwen-image', 'qwen-image-2.1', 'krea-2', 'ernie-image', 'z-image', 'chroma-1', 'ideogram-4', 'omni-ovis', 'hidream-o1', 'classic-sd', 'minimax-h3', 'ltx-2.3', 'ltx-2.5']);
// Resolve every existing ancestor before any read/write; junctions cannot redirect Setup
// to a different Umbra installation. Missing descendants remain local to this root.
function assertLocalPath(root: string, target: string) {
  const canonicalRoot = realpathSync(root);
  if (!contained(resolve(root), resolve(target))) throw new Error('Setup paths must remain inside this Umbra installation.');
  let ancestor = resolve(target);
  while (!existsSync(ancestor)) { const parent = resolve(ancestor, '..'); if (parent === ancestor) break; ancestor = parent; }
  const canonical = realpathSync(ancestor);
  if (canonical !== canonicalRoot && !contained(canonicalRoot, canonical)) throw new Error('Setup paths must remain inside this Umbra installation.');
}
export function assertOnboardingPaths(root: string) {
  const canonicalRoot = realpathSync(root);
  for (const path of ['User', 'User/Config', 'User/Config/settings.json', 'User/Config/onboarding.json', 'Tools', 'Tools/ComfyUI', 'Tools/ComfyUI/models', 'Tools/ComfyUI/custom_nodes', 'Tools/AI-Toolkit']) {
    const target = resolve(root, path);
    if (existsSync(target) && !contained(canonicalRoot, realpathSync(target))) throw new Error('Setup paths must remain inside this Umbra installation.');
  }
}
const statePath = (root: string) => join(root, 'User', 'Config', 'setup-onboarding.json');
export function readOnboarding(root: string): OnboardingState {
  const initial: OnboardingState = { schemaVersion: 1, languageSaved: false, training: 'undecided', profiles: [], supportProfiles: ['core'], checkpoint: '', stage: 0 };
  assertOnboardingPaths(root);
  try {
    const target = statePath(root);
    if (existsSync(target) && !contained(realpathSync(root), realpathSync(target))) return initial;
    const saved = JSON.parse(readFileSync(target, 'utf8'));
    if (saved.schemaVersion !== 1) return initial;
    if (typeof saved.languageSaved !== 'boolean' || !['undecided', 'skip', 'install'].includes(saved.training)
      || !Array.isArray(saved.profiles) || !saved.profiles.every((p: unknown) => typeof p === 'string')
      || !Array.isArray(saved.supportProfiles) || !saved.supportProfiles.every((p: unknown) => typeof p === 'string')
      || typeof saved.checkpoint !== 'string' || !Number.isInteger(saved.stage) || saved.stage < 0 || saved.stage > 6) return initial;
    const state: OnboardingState = { ...initial, languageSaved: saved.languageSaved, training: saved.training,
      profiles: saved.profiles, supportProfiles: saved.supportProfiles, checkpoint: saved.checkpoint, stage: saved.stage };
    if (state.checkpoint && (!/^(checkpoints|diffusion_models)\//.test(state.checkpoint) || state.checkpoint.split(/[\\/]/).includes('..'))) state.checkpoint = '';
    for (const field of ['nodesFingerprint', 'verificationFingerprint', 'verifiedAt'] as const) if (typeof saved[field] === 'string') state[field] = saved[field];
    if (saved.checkpointVerification && typeof saved.checkpointVerification.path === 'string'
      && /^[a-f0-9]{64}$/i.test(saved.checkpointVerification.sha256) && saved.checkpointVerification.identity
      && ['size', 'mtime', 'ctime', 'ino'].every(key => Number.isFinite(saved.checkpointVerification.identity[key]))) state.checkpointVerification = saved.checkpointVerification;
    return state;
  } catch { return initial; }
}
export function writeOnboarding(root: string, state: OnboardingState) {
  assertOnboardingPaths(root);
  const target = statePath(root); mkdirSync(join(root, 'User', 'Config'), { recursive: true });
  if (existsSync(target) && !contained(realpathSync(root), realpathSync(target))) throw new Error('Setup state must remain inside this Umbra installation.');
  const temporary = `${target}.${process.pid}.tmp`;
  if (existsSync(temporary) && !contained(realpathSync(root), realpathSync(temporary))) throw new Error('Setup state must remain inside this Umbra installation.');
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`); renameSync(temporary, target);
}
export function updateOnboarding(source: string, root: string, body: Record<string, unknown>) {
  const state = readOnboarding(root);
  if (body.training !== undefined) {
    if (!['skip', 'install'].includes(String(body.training))) throw new Error('Choose whether to install AI Toolkit.');
    state.training = body.training as OnboardingState['training'];
  }
  for (const [field, pack] of [['profiles', 'requirements'], ['supportProfiles', 'support']] as const) {
    if (body[field] === undefined) continue;
    // Preserve no-download selections: they still require a generation checkpoint.
    if (!Array.isArray(body[field])) throw new Error('Choose a model family.');
    if (field === 'profiles' && ((body[field] as unknown[]).length > 1 || (body[field] as unknown[]).some(profile => !generationProfiles.has(String(profile))))) throw new Error('Choose one generation model family. Additional feature models are available in Models.');
    if ((body[field] as unknown[]).length) modelSetupSelection(source, pack, body[field]);
    state[field] = [...new Set(body[field] as string[])];
  }
  if (body.checkpoint !== undefined) {
    if (typeof body.checkpoint !== 'string') throw new Error('Choose a checkpoint from this installation.');
    if (body.checkpoint && !checkpointFiles(root).some(file => file.path === body.checkpoint)) throw new Error('Choose a checkpoint from this installation.');
    state.checkpoint = body.checkpoint;
  }
  if (body.stage !== undefined) {
    if (!Number.isInteger(body.stage) || Number(body.stage) < 0 || Number(body.stage) > 6) throw new Error('Unknown setup stage.');
    state.stage = Number(body.stage);
  }
  writeOnboarding(root, state); return state;
}
function identity(path: string) {
  try { const s = statSync(path); return { size: s.size, mtime: s.mtimeMs, ctime: s.ctimeMs, ino: s.ino }; }
  catch { return null; }
}
function contained(root: string, target: string) {
  const rel = relative(root, target); return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}
export function checkpointFiles(root: string): { path: string; bytes: number }[] {
  assertOnboardingPaths(root);
  const modelRoot = resolve(root, 'Tools', 'ComfyUI', 'models');
  if (!existsSync(modelRoot)) return [];
  const canonicalRoot = realpathSync(modelRoot), files: { path: string; bytes: number }[] = [];
  const walk = (folder: string, depth: number) => {
    if (depth > 8 || files.length >= 1000 || !existsSync(folder) || !contained(canonicalRoot, realpathSync(folder))) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const target = join(folder, entry.name);
      if (!contained(canonicalRoot, realpathSync(target))) continue;
      if (entry.isDirectory()) walk(target, depth + 1);
      else if (entry.isFile() && /\.safetensors$/i.test(entry.name)) files.push({ path: relative(modelRoot, target).replace(/\\/g, '/'), bytes: statSync(target).size });
    }
  };
  walk(join(modelRoot, 'checkpoints'), 0); walk(join(modelRoot, 'diffusion_models'), 0);
  return files;
}
export function validCheckpoint(root: string, path: string) {
  if (!checkpointFiles(root).some(file => file.path === path)) return false;
  const target = join(root, 'Tools', 'ComfyUI', 'models', path); let fd: number | undefined;
  try {
    fd = openSync(target, 'r'); const size = statSync(target).size; const prefix = Buffer.alloc(8);
    if (readSync(fd, prefix, 0, 8, 0) !== 8) return false;
    const length = Number(prefix.readBigUInt64LE());
    if (!Number.isSafeInteger(length) || length < 2 || length > 64 * 1024 * 1024 || length + 8 >= size) return false;
    const header = Buffer.alloc(length); if (readSync(fd, header, 0, length, 8) !== length) return false;
    const metadata = JSON.parse(header.toString('utf8'));
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
    const tensors = Object.entries(metadata).filter(([key]) => key !== '__metadata__');
    const byteSizes: Record<string, number> = { BOOL: 1, U8: 1, I8: 1, F8_E4M3: 1, F8_E5M2: 1, F8_E8M0: 1, I16: 2, U16: 2, F16: 2, BF16: 2, I32: 4, U32: 4, F32: 4, I64: 8, U64: 8, F64: 8 };
    if (!tensors.length || !tensors.every(([, tensor]: [string, any]) => tensor && Object.hasOwn(byteSizes, tensor.dtype)
      && Array.isArray(tensor.shape) && tensor.shape.every((value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0)
      && Array.isArray(tensor.data_offsets) && tensor.data_offsets.length === 2 && tensor.data_offsets.every(Number.isSafeInteger)
      && tensor.data_offsets[0] >= 0 && tensor.data_offsets[1] >= tensor.data_offsets[0] && tensor.data_offsets[1] <= size - length - 8
      && tensor.shape.reduce((count: number, value: number) => count * value, 1) * byteSizes[tensor.dtype] === tensor.data_offsets[1] - tensor.data_offsets[0])) return false;
    const offsets = tensors.map(([, tensor]: [string, any]) => tensor.data_offsets as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return offsets[0][0] === 0 && offsets.every(([start], index) => index === 0 || start === offsets[index - 1][1]) && offsets.at(-1)![1] === size - length - 8;
  } catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
}
export async function verifyOnboardingCheckpoint(root: string, path: string) {
  if (!validCheckpoint(root, path)) throw new Error('Choose a valid generation checkpoint in this Umbra installation.');
  const target = join(root, 'Tools', 'ComfyUI', 'models', path), before = identity(target);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  const after = identity(target);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('The generation checkpoint changed while it was being verified. Retry verification.');
  return { path, sha256: hash.digest('hex'), identity: after };
}
function modelEvidence(source: string, root: string, pack: ModelSetupPack, selection: string[]) {
  if (!selection.length) return { complete: false, files: [], generation: [] as string[] };
  const profiles = modelSetupSelection(source, pack, selection);
  const models = readModelSetupManifest(source, pack).models.filter(m => m.installPolicy === 'automatic' && m.profiles.some(p => profiles.includes(p)));
  const files = models.flatMap(m => m.files);
  for (const file of files) assertLocalPath(root, join(root, 'Tools', 'ComfyUI', 'models', file.destination));
  assertLocalPath(root, join(root, 'Tools', 'ComfyUI', 'models', '.umbra', pack === 'support' ? 'support-models.json' : 'model-requirements.json'));
  let receipt: any = null;
  try { receipt = JSON.parse(readFileSync(join(root, 'Tools', 'ComfyUI', 'models', '.umbra', pack === 'support' ? 'support-models.json' : 'model-requirements.json'), 'utf8')); } catch { /* Not verified yet. */ }
  const complete = files.every(f => identity(join(root, 'Tools', 'ComfyUI', 'models', f.destination))?.size === f.bytes
    && Array.isArray(receipt?.installed) && receipt.installed.some((entry: any) => entry.destination === f.destination && entry.sha256 === f.sha256));
  return { complete, files: files.map(f => ({ destination: f.destination, hash: f.sha256, identity: identity(join(root, 'Tools', 'ComfyUI', 'models', f.destination)) })),
    generation: files.filter(f => /^(checkpoints|diffusion_models)\//.test(f.destination)).map(f => f.destination) };
}
export async function inspectOnboarding(source: string, root: string) {
  const state = readOnboarding(root);
  const knownProfiles = readModelSetupManifest(source, 'requirements').profiles;
  const knownSupport = readModelSetupManifest(source, 'support').profiles;
  const profiles = state.profiles.filter(profile => Object.hasOwn(knownProfiles, profile) && generationProfiles.has(profile)).slice(0, 1);
  const supportProfiles = state.supportProfiles.filter(profile => Object.hasOwn(knownSupport, profile));
  // A newer app may retire a profile; retain the usable choices and let Setup resume.
  if (JSON.stringify(profiles) !== JSON.stringify(state.profiles) || JSON.stringify(supportProfiles) !== JSON.stringify(state.supportProfiles)) {
    state.profiles = profiles; state.supportProfiles = supportProfiles; writeOnboarding(root, state);
  }
  for (const pack of ['support', 'requirements'] as const) for (const model of readModelSetupManifest(source, pack).models) {
    for (const file of model.files) assertLocalPath(root, join(root, 'Tools', 'ComfyUI', 'models', file.destination));
  }
  for (const feature of readManagedToolRequirements(source)) for (const node of feature.customNodes) assertLocalPath(root, join(root, 'Tools', 'ComfyUI', 'custom_nodes', node.name));
  const catalog = await modelSetupCatalog(source, root);
  const dependencies = inspectManagedDependencies(source, root), core = dependencies.comfyui;
  const comfyComplete = core.installed && core.filesVerified && core.pythonDependencies.verified
    && compareUmbraVersions(core.version, core.minimumRequired || '0.0.0') >= 0
    && compareUmbraVersions(core.frontendVersion || '0.0.0', core.minimumFrontendRequired || '0.0.0') >= 0;
  const relevant = dependencies.features.filter(feature => !feature.optional || feature.modelProfiles.some(profile => state.profiles.includes(profile)));
  const nodeStates = relevant.flatMap(feature => feature.customNodes);
  const baseNodes = ['Umbra-Nodes', 'ComfyUI-Impact-Pack', 'ComfyUI-Impact-Subpack'].map(name => {
    const folder = join(root, 'Tools', 'ComfyUI', 'custom_nodes', name);
    assertLocalPath(root, folder);
    const requirementsFile = join(folder, 'requirements.txt'), markerFile = join(folder, '.umbra-requirements-installed');
    for (const target of [join(folder, '__init__.py'), requirementsFile, markerFile]) assertLocalPath(root, target);
    let requirementsVerified = !existsSync(requirementsFile);
    try { if (!requirementsVerified) requirementsVerified = readFileSync(markerFile, 'utf8').trim() === ordinaryNodeRequirementsMarker(readFileSync(requirementsFile, 'utf8')); } catch { /* A missing/stale installer receipt holds this step. */ }
    return { name, init: identity(join(folder, '__init__.py')), requirements: identity(markerFile), requirementsVerified };
  });
  const nodesFingerprint = createHash('sha256').update(JSON.stringify({ core: core.installedCommit, baseNodes })).digest('hex');
  const nodesComplete = baseNodes.every(n => n.init && n.requirementsVerified) && nodeStates.every(n => n.filesVerified && n.pythonDependencies.verified) && state.nodesFingerprint === nodesFingerprint;
  const support = modelEvidence(source, root, 'support', state.supportProfiles);
  const generation = modelEvidence(source, root, 'requirements', state.profiles);
  const checkpoints = checkpointFiles(root);
  // Automatic packs carry their own generation model; prerequisite-only packs require an explicit local checkpoint choice.
  const checkpoint = state.checkpoint || (state.profiles.length === 1 ? generation.generation[0] || '' : '');
  const checkpointIntegrity = state.checkpointVerification?.path === checkpoint
    && JSON.stringify(state.checkpointVerification.identity) === JSON.stringify(checkpoint && identity(join(root, 'Tools', 'ComfyUI', 'models', checkpoint)));
  const generationComplete = state.profiles.length === 1 && generationProfiles.has(state.profiles[0]) && generation.complete && !!checkpoint && validCheckpoint(root, checkpoint);
  const trainingComplete = state.training === 'skip' || state.training === 'install' && existsSync(join(root, 'Tools', 'AI-Toolkit', 'run.py'))
    && existsSync(join(root, 'Tools', 'AI-Toolkit', 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'));
  const fingerprint = createHash('sha256').update(JSON.stringify({ state: { languageSaved: state.languageSaved, training: state.training, profiles: state.profiles, supportProfiles: state.supportProfiles, checkpoint },
    core: [core.installedCommit, core.version, core.frontendVersion, core.pythonDependencies.verified], nodesFingerprint, support, generation, checkpointIdentity: checkpoint && identity(join(root, 'Tools', 'ComfyUI', 'models', checkpoint)), checkpointVerification: state.checkpointVerification })).digest('hex');
  const checks = [state.languageSaved, comfyComplete, trainingComplete, nodesComplete, support.complete, generationComplete];
  const ready = checks.every(Boolean) && checkpointIntegrity && state.verificationFingerprint === fingerprint;
  const details = ['Save your preferred language.', 'Install and verify managed ComfyUI and its Python environment.', 'Install AI Toolkit for training, or skip it.', 'Install and verify custom nodes.', 'Install or verify selected support models.', 'Select a model family and a compatible generation checkpoint.', 'Verify the selected installation.'];
  const stages = ['language', 'comfyui', 'training', 'nodes', 'support', 'generation', 'ready'].map((id, index) => ({ id, complete: index === 6 ? ready : checks[index], detail: details[index] }));
  const issues = stages.slice(0, 6).filter(stage => !stage.complete).map(stage => stage.detail);
  if (state.profiles.length && !checkpoint) issues.push('Add a compatible generation checkpoint in Umbra Model Manager; prerequisites alone do not include one.');
  const issueCodes = stages.slice(0, 6).filter(stage => !stage.complete).map(stage => stage.id);
  return { success: true, state, stages, issueCodes, selectedCheckpoint: checkpoint, checkpointIntegrity, catalog: { ...catalog, checkpoints, generationProfiles: [...generationProfiles] }, ready, issues, fingerprint, nodesFingerprint,
    qualification: 'Installation files and model integrity verified. Launch managed ComfyUI from Umbra; GPU execution and image quality have not been tested.' };
}
