import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { resolveComfyEndpoint } from '../backend/comfyEndpoint';
import { compareUmbraVersions } from '../shared/appUpdate';
import { isUmbraShutdownMarkerForProcess, readUmbraShutdownMarker } from '../shared/umbraShutdownMarker';
import type { inspectManagedDependencies } from './ManagedDependencyStatus';
import { BACKGROUND_COMPATIBILITY_RECIPE, BACKGROUND_COMPATIBILITY_VERSION } from '../setup/BackgroundRemovalCompatibility';

type DependencyStatus = ReturnType<typeof inspectManagedDependencies>;
export type ManagedRepairStep = {
  kind: 'comfyui' | 'node' | 'package'; target: string; pins: string[]; installedVersion: string; verified: boolean;
  installedCommit: string; requiredVersion: string; requiredCommits: string[];
  installedFrontendVersion: string; requiredFrontendVersion: string;
  filesVerified: boolean; pythonDependenciesVerified: boolean;
  runtimeReadiness: 'ready' | 'held' | 'unverified';
};
export type ManagedRepairPlan = {
  id: string; featureId: string; label: string; workflowIds: string[]; steps: ManagedRepairStep[]; holds: string[];
  requirementsHash: string; featureIds: string[]; modelProfiles: string[];
  filesVerified: boolean; runtimeReadiness: 'unverified';
};
export type ManagedRepairState = {
  schemaVersion: 1; planId: string; featureId: string;
  phase: 'running' | 'held' | 'failed' | 'restart-required' | 'preflight-held' | 'preflight-passed';
  completedTargets: string[]; priorVersions: Record<string, string>; priorCommits?: Record<string, string>; lines: string[]; error: string; updatedAt: string;
};

export function managedRepairStepArgs(step: Pick<ManagedRepairStep, 'kind' | 'target'>): string[] {
  return step.kind === 'package' ? ['background-compatibility']
    : step.kind === 'comfyui' ? ['managed-comfyui'] : ['comfy-node', step.target];
}

function repairFeatures(status: DependencyStatus, featureId: string) {
  return ['all-managed-dependencies', 'background-removal-compatibility'].includes(featureId) ? status.features
    : featureId === 'official-video-workflows' ? status.features.filter((entry) => ['official-dasiwa-h3-26', 'official-dasiwa-ltx23-50'].includes(entry.id))
    : status.features.filter((entry) => entry.id === featureId && entry.workflowIds.length);
}

export function createManagedWorkflowRepairPlan(status: DependencyStatus, featureId: string): ManagedRepairPlan {
  const features = repairFeatures(status, featureId);
  if (!features.length || (featureId === 'official-video-workflows' && features.length !== 2)) throw new Error('Choose a declared managed dependency plan.');
  const feature = { ...features[0], id: featureId,
    label: featureId === 'background-removal-compatibility' ? 'Background removal package compatibility'
      : featureId === 'all-managed-dependencies' ? 'All managed dependencies'
      : featureId === 'official-video-workflows' ? 'Official H3 + LTX workflow dependencies' : features[0].label,
    workflowIds: [...new Set(features.flatMap((entry) => entry.workflowIds))],
    minimumComfyVersion: features.map((entry) => entry.minimumComfyVersion).sort(compareUmbraVersions).at(-1)!,
    minimumFrontendVersion: features.map((entry) => entry.minimumFrontendVersion).filter(Boolean).sort(compareUmbraVersions).at(-1) || '',
    customNodes: features.flatMap((entry) => entry.customNodes), runtimePackages: features.flatMap((entry) => entry.runtimePackages),
  };
  const steps: ManagedRepairStep[] = [];
  const core = status.comfyui;
  const coreVerified = core.installed && core.filesVerified && compareUmbraVersions(core.version || '0.0.0', feature.minimumComfyVersion) >= 0
    && (!feature.minimumFrontendVersion || compareUmbraVersions(core.frontendVersion || '0.0.0', feature.minimumFrontendVersion) >= 0);
  // Keep verified targets visible for review and recovery; they are not installer work.
  steps.push({ kind: 'comfyui', target: 'ComfyUI', pins: [feature.minimumComfyVersion, feature.minimumFrontendVersion].filter(Boolean),
    installedVersion: core.version, installedCommit: core.installedCommit, requiredVersion: feature.minimumComfyVersion, requiredCommits: [],
    installedFrontendVersion: core.frontendVersion, requiredFrontendVersion: feature.minimumFrontendVersion,
    filesVerified: coreVerified, pythonDependenciesVerified: core.pythonDependencies.verified,
    verified: coreVerified && core.pythonDependencies.verified, runtimeReadiness: 'unverified' });
  for (const name of new Set(feature.customNodes.map((node) => node.name))) {
    const required = status.features.flatMap((entry) => entry.customNodes.filter((node) => node.name === name));
    const pins = [...new Set(required.map((node) => node.minimumCommit))];
    const filesVerified = required.every((node) => node.filesVerified);
    const pythonDependenciesVerified = required.every((node) => node.pythonDependencies.verified);
    steps.push({ kind: 'node', target: name, pins, requiredCommits: pins,
      installedVersion: required[0]?.installedVersion || '', installedCommit: required[0]?.installedCommit || '',
      requiredVersion: required.map((node) => node.requiredVersion).filter(Boolean).sort(compareUmbraVersions).at(-1) || '',
      installedFrontendVersion: '', requiredFrontendVersion: '', filesVerified, pythonDependenciesVerified,
      verified: filesVerified && pythonDependenciesVerified,
      runtimeReadiness: required.some((node) => node.runtimeReadiness === 'held') ? 'held'
        : required.every((node) => node.runtimeReadiness === 'ready') ? 'ready' : 'unverified' });
  }
  if (featureId === 'background-removal-compatibility') steps.length = 0;
  const compatibility = status.backgroundCompatibility;
  if (compatibility && ['all-managed-dependencies', 'background-removal-compatibility'].includes(featureId)) {
    steps.push({ kind: 'package', target: 'BackgroundRemoval', pins: [BACKGROUND_COMPATIBILITY_VERSION, 'albumentationsx==2.4.11'],
      installedVersion: compatibility.versions['transparent-background'] || '', installedCommit: '', requiredVersion: BACKGROUND_COMPATIBILITY_VERSION,
      requiredCommits: [], installedFrontendVersion: '', requiredFrontendVersion: '', filesVerified: true,
      pythonDependenciesVerified: compatibility.verified, verified: compatibility.verified, runtimeReadiness: 'unverified' });
  }
  const holds = featureId === 'background-removal-compatibility' ? []
    : [...new Set(feature.runtimePackages.map((dependency) => `${dependency.detail} ${dependency.reason}`))];
  if (compatibility && !compatibility.verified && ['all-managed-dependencies', 'background-removal-compatibility'].includes(featureId)) holds.push(compatibility.detail);
  // Consent remains bound to the build's declared requirements, independent of repair progress.
  const id = createHash('sha256').update(JSON.stringify({ featureId, requirementsHash: status.requirementsHash, core: [feature.minimumComfyVersion, feature.minimumFrontendVersion],
    nodes: feature.customNodes.map((node) => ({ name: node.name, pin: node.minimumCommit, assets: node.frontendAssets, classes: node.requiredClasses, frontendClasses: node.requiredFrontendClasses })),
    ...(['all-managed-dependencies', 'background-removal-compatibility'].includes(featureId) ? { backgroundRecipe: BACKGROUND_COMPATIBILITY_RECIPE } : {}) })).digest('hex');
  return { id, featureId, label: feature.label, workflowIds: feature.workflowIds, steps, holds,
    requirementsHash: status.requirementsHash, featureIds: features.map((entry) => entry.id),
    modelProfiles: featureId === 'background-removal-compatibility' ? [] : [...new Set(features.flatMap((entry) => entry.modelProfiles))],
    filesVerified: steps.every((step) => step.filesVerified), runtimeReadiness: 'unverified' };
}

export function managedWorkflowRepairPlans(status: DependencyStatus): ManagedRepairPlan[] {
  const plans = status.features.filter((feature) => feature.workflowIds.length).map((feature) => createManagedWorkflowRepairPlan(status, feature.id));
  if (status.features.some((feature) => feature.id === 'official-dasiwa-h3-26') && status.features.some((feature) => feature.id === 'official-dasiwa-ltx23-50')) {
    plans.unshift(createManagedWorkflowRepairPlan(status, 'official-video-workflows'));
  }
  if (status.features.length) plans.unshift(createManagedWorkflowRepairPlan(status, 'all-managed-dependencies'));
  if (status.features.length && status.backgroundCompatibility && !status.backgroundCompatibility.verified) {
    plans.unshift(createManagedWorkflowRepairPlan(status, 'background-removal-compatibility'));
  }
  return plans;
}

export function recoverManagedRepairState(value: unknown): ManagedRepairState | null {
  const state = value as ManagedRepairState;
  if (!state || state.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(state.planId) || !/^[a-z0-9-]{1,64}$/.test(state.featureId)
    || !['running', 'held', 'failed', 'restart-required', 'preflight-held', 'preflight-passed'].includes(state.phase)
    || !Array.isArray(state.completedTargets) || state.completedTargets.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(name))
    || !state.priorVersions || typeof state.priorVersions !== 'object' || !Array.isArray(state.lines)
    || (state.priorCommits !== undefined && (!state.priorCommits || typeof state.priorCommits !== 'object' || Array.isArray(state.priorCommits)
      || Object.values(state.priorCommits).some((commit) => typeof commit !== 'string' || (commit !== '' && !/^[a-f0-9]{40}$/.test(commit)))))) return null;
  return { ...state, lines: state.lines.filter((line) => typeof line === 'string').slice(-80),
    ...(state.phase === 'running' ? { phase: 'held' as const, error: 'The previous dependency repair was interrupted. Review installed files and explicitly resume; no step was retried automatically.' } : {}) };
}

export function managedRepairStatePath(runtimeRoot: string): string {
  return join(runtimeRoot, 'User', 'Config', 'managed-dependency-repair.json');
}

export function readManagedRepairState(runtimeRoot: string): ManagedRepairState | null {
  try { return recoverManagedRepairState(JSON.parse(readFileSync(managedRepairStatePath(runtimeRoot), 'utf8'))); }
  catch { return null; }
}

async function loopbackPortIsClosed(port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const probes = await Promise.all(['127.0.0.1', '::1'].map((host) => new Promise<boolean>((resolveStopped) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(1_500);
    socket.once('connect', () => { socket.destroy(); resolveStopped(false); });
    socket.once('timeout', () => { socket.destroy(); resolveStopped(false); });
    socket.once('error', (error: NodeJS.ErrnoException) => { socket.destroy(); resolveStopped(error.code === 'ECONNREFUSED'); });
  })));
  return probes.every(Boolean);
}

export function managedComfyProcessBelongsToRoot(runtimeRoot: string, commandLine: string, executablePath = ''): boolean {
  const canonical = (path: string) => (existsSync(path) ? realpathSync(path) : path).replace(/\\/g, '/').toLowerCase();
  const command = commandLine.replace(/\\/g, '/').toLowerCase();
  const main = canonical(join(runtimeRoot, 'Tools', 'ComfyUI', 'main.py'));
  const venv = canonical(join(runtimeRoot, 'Tools', 'ComfyUI', 'venv'));
  const runtime = canonical(join(runtimeRoot, 'Runtime'));
  const executable = executablePath.replace(/\\/g, '/').toLowerCase();
  const mainArgument = /(?:^|[\s"'])(?:[^\s"']*\/)?main\.py(?:[\s"']|$)/.test(command);
  return command.includes(main) || (mainArgument && (command.includes(`${venv}/`) || command.includes(`${runtime}/`)))
    || (mainArgument && (executable.startsWith(`${venv}/`) || executable.startsWith(`${runtime}/`)));
}

export async function proveManagedRuntimeStopped(runtimeRoot: string): Promise<boolean> {
  let settings: Record<string, any> = {};
  try { settings = JSON.parse(readFileSync(join(runtimeRoot, 'User', 'Config', 'settings.json'), 'utf8')); }
  catch { if (existsSync(join(runtimeRoot, 'User', 'Config', 'settings.json'))) return false; }
  const isolatedPort = process.env.UMBRA_COMFY_PORT;
  const endpoint = isolatedPort ? { protocol: 'http:', host: '127.0.0.1', port: Number(isolatedPort) }
    : resolveComfyEndpoint(settings.app?.['comfyui.url'] || '', settings.servers?.comfyui?.host || '127.0.0.1', Number(settings.servers?.comfyui?.port || 8188));
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) return false;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(endpoint.host) || endpoint.protocol !== 'http:') return false;
  const script = "$ErrorActionPreference='Stop'; $rows=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID } | ForEach-Object { @{ command=[string]$_.CommandLine; executable=[string]$_.ExecutablePath } }); ConvertTo-Json -InputObject $rows -Compress";
  const processes = process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8', timeout: 5_000 })
    : spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 5_000 });
  if (processes.status !== 0) return false;
  if (process.platform === 'win32') {
    try {
      const rows = JSON.parse(String(processes.stdout));
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.command !== 'string' || typeof row.executable !== 'string'
        || managedComfyProcessBelongsToRoot(runtimeRoot, row.command, row.executable))) return false;
    } catch { return false; }
  } else if (String(processes.stdout).split(/\r?\n/).some((line) => managedComfyProcessBelongsToRoot(runtimeRoot, line))) return false;
  // An unknown listener is a hold even if no process with this root's main.py was found.
  return loopbackPortIsClosed(endpoint.port);
}

export async function assertManagedDependencyRepairIdle(options: {
  runtimeRoot: string; origin: string; serverPid?: number; initiallyMissing?: boolean;
  fetch?: typeof fetch; processAlive?: (pid: number) => boolean;
  stoppedProof?: () => Promise<boolean>;
  umbraStoppedProof?: () => Promise<boolean>;
}): Promise<void> {
  const request = options.fetch || fetch;
  const alive = options.processAlive || ((pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } });
  const bridgeResult = await request(`${options.origin}/api/umbrabridge/status?refresh=true`, { signal: AbortSignal.timeout(5_000) })
    .then(async (response) => { if (!response.ok) throw new Error('Owned runtime status is unavailable.'); return response.json() as Promise<Record<string, any>>; }).catch(() => null);
  if (bridgeResult) {
    const comfy = bridgeResult.backends?.comfyui;
    if (!comfy || bridgeResult.stale || bridgeResult.refreshing) throw new Error('Dependency repair is held: refresh the managed runtime status first.');
    if (comfy.running || comfy.ownerPid || comfy.signaturePids?.length || comfy.portPids?.length || !['none', 'stopped'].includes(comfy.ownership)) {
      throw new Error('Dependency repair is held while ComfyUI or an unverified listener is running. Finish jobs and stop the managed instance through Umbra before retrying.');
    }
    const response = await request(`${options.origin}/api/powerprompter/backend-queue-debug`, { signal: AbortSignal.timeout(5_000) });
    const queue = await response.json() as Record<string, any>;
    if (!response.ok || queue.success !== true || !Array.isArray(queue.activeTasks) || !Array.isArray(queue.queuedWork)) {
      throw new Error('Dependency repair is held: backend queue state is unavailable. An unavailable queue is not an idle queue.');
    }
    if (queue.activeTasks.length || queue.queuedWork.length || queue.controller?.activeRequestId) throw new Error('Dependency repair is held while generation work is active or queued. Finish or cancel it explicitly before retrying.');
    // An idle response from a reused/wrong Umbra port is not proof for the selected installation.
    if (!await (options.stoppedProof || (() => proveManagedRuntimeStopped(options.runtimeRoot)))()) {
      throw new Error('Dependency repair is held: the selected installation\'s ComfyUI process/listener is not verified stopped.');
    }
    return;
  }
  const appStopped = await (options.umbraStoppedProof || (() => {
    const origin = new URL(options.origin);
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(origin.hostname)) return Promise.resolve(false);
    return loopbackPortIsClosed(Number(origin.port || 80));
  }))();
  if (!appStopped) throw new Error('Dependency repair is held: the Umbra listener is still present or cannot be verified stopped. Refresh its status and queue before retrying.');
  const stopped = await (options.stoppedProof || (() => proveManagedRuntimeStopped(options.runtimeRoot)))();
  if (!stopped) throw new Error('Dependency repair is held: a ComfyUI process/listener may still be using these files, or its absence could not be verified.');
  if (!options.serverPid) return;
  const marker = readUmbraShutdownMarker(options.runtimeRoot);
  if (options.serverPid && isUmbraShutdownMarkerForProcess(marker, options.serverPid)
    && !alive(options.serverPid) && marker!.managedProcessPids.every((pid) => !alive(pid))) return;
  if (!existsSync(join(options.runtimeRoot, 'Tools', 'ComfyUI', 'main.py')) && !options.serverPid) return;
  throw new Error('Dependency repair is held: managed process shutdown could not be verified. Open Umbra, finish jobs, stop its ComfyUI instance and retry; no process was stopped automatically.');
}

export async function runManagedWorkflowRepair(plan: ManagedRepairPlan, state: ManagedRepairState, hooks: {
  assertIdle: () => Promise<void>;
  install: (step: ManagedRepairStep) => Promise<void>;
  persist: (state: ManagedRepairState) => Promise<void>;
  inspect?: () => DependencyStatus;
}): Promise<void> {
  if (state.planId !== plan.id || state.featureId !== plan.featureId) throw new Error('Managed requirements changed. Review and approve the new repair plan.');
  state.phase = 'running'; state.error = ''; state.updatedAt = new Date().toISOString(); await hooks.persist(state);
  try {
    for (const step of plan.steps) {
      const currentPlan = hooks.inspect ? createManagedWorkflowRepairPlan(hooks.inspect(), plan.featureId) : plan;
      if (currentPlan.id !== plan.id) throw new Error('Managed requirements changed. Review and approve the new repair plan.');
      const current = currentPlan.steps.find((entry) => entry.target === step.target)!;
      state.priorVersions[step.target] ??= step.kind === 'node' ? step.installedCommit : step.installedVersion;
      state.priorCommits ??= {};
      state.priorCommits[step.target] ??= step.installedCommit;
      if (current.verified) {
        if (!state.completedTargets.includes(step.target)) state.completedTargets.push(step.target);
        state.lines.push(`Already verified: ${step.target}; installer skipped.`);
        state.updatedAt = new Date().toISOString(); state.lines = state.lines.slice(-80); await hooks.persist(state);
        continue;
      }
      await hooks.assertIdle();
      state.lines.push(`${current.filesVerified && !current.pythonDependenciesVerified ? 'Syncing managed Python requirements for' : 'Installing / verifying'} ${step.target} (${step.pins.join(', ')})`); state.lines = state.lines.slice(-80);
      await hooks.persist(state);
      if (hooks.inspect && createManagedWorkflowRepairPlan(hooks.inspect(), plan.featureId).id !== plan.id) {
        throw new Error('Managed requirements changed. Review and approve the new repair plan.');
      }
      await hooks.install(current);
      if (hooks.inspect) {
        const verifiedPlan = createManagedWorkflowRepairPlan(hooks.inspect(), plan.featureId);
        if (verifiedPlan.id !== plan.id) throw new Error('Managed requirements changed. Review and approve the new repair plan.');
        if (!verifiedPlan.steps.find((entry) => entry.target === step.target)?.verified) throw new Error(`${step.target}: managed file/Python setup verification is still held. Review the installer log and explicitly retry.`);
      }
      if (!state.completedTargets.includes(step.target)) state.completedTargets.push(step.target);
      state.updatedAt = new Date().toISOString(); await hooks.persist(state);
    }
    state.phase = 'restart-required'; state.lines.push('Dependency files verified. Start managed ComfyUI normally, refresh its frontend, and recheck runtime readiness. Existing queues remain paused until explicit Resume.');
  } catch (error) {
    state.phase = 'held'; state.error = error instanceof Error ? error.message : String(error);
    state.lines.push(state.error, 'Completed repairs and prior commit evidence are retained. Explicit Resume rechecks remaining steps. No dependency downgrade, reset, model download or automatic rollback was attempted.');
    throw error;
  } finally {
    state.updatedAt = new Date().toISOString(); state.lines = state.lines.slice(-80); await hooks.persist(state);
  }
}

export async function preflightManagedWorkflowRepair(plan: ManagedRepairPlan, status: DependencyStatus, origin: string, request: typeof fetch = fetch): Promise<string[]> {
  if (createManagedWorkflowRepairPlan(status, plan.featureId).id !== plan.id) throw new Error('Managed requirements changed. Review the current repair plan.');
  const issues: string[] = [];
  const get = async (path: string) => {
    const response = await request(`${origin}${path}`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error('Owned runtime readiness is unavailable.');
    return response.json() as Promise<Record<string, any>>;
  };
  const before = await get('/api/umbrabridge/status?refresh=true');
  const target = before.backends?.comfyui;
  if (before.stale || before.refreshing || !target?.running || !target.healthy || target.ownership !== 'owned' || !target.ownerPid) {
    return ['Start the managed ComfyUI instance normally, then refresh readiness. Unowned or stale runtime evidence is held.'];
  }
  const features = repairFeatures(status, plan.featureId);
  if (!features.length) return ['The declared workflow repair plan changed. Review the current plan.'];
  if (['all-managed-dependencies', 'background-removal-compatibility'].includes(plan.featureId) && status.backgroundCompatibility && !status.backgroundCompatibility.verified) issues.push(status.backgroundCompatibility.detail);
  if (plan.featureId === 'background-removal-compatibility') {
    const objectInfo = await get('/object_info');
    // The optional Essentials suite is not installed by this repair.
    if (status.backgroundCompatibility?.status === 'ready') {
      for (const name of ['TransparentBGSession+', 'ImageRemoveBackground+']) {
        if (!Object.prototype.hasOwnProperty.call(objectInfo, name)) issues.push(`Background removal node ${name} is not registered. Review the custom-node import log.`);
      }
    }
    const after = await get('/api/umbrabridge/status?refresh=true');
    const next = after.backends?.comfyui;
    if (after.stale || after.refreshing || !next?.healthy || next.ownership !== 'owned' || next.ownerPid !== target.ownerPid || next.port !== target.port) issues.push('The owned ComfyUI process changed during background preflight. Refresh readiness.');
    return [...new Set(issues)];
  }
  for (const feature of features) {
    for (const node of feature.customNodes) if (node.status !== 'ready') issues.push(`${node.name}: ${node.reason || node.status}`);
    if (compareUmbraVersions(status.comfyui.version || '0.0.0', feature.minimumComfyVersion) < 0
      || (feature.minimumFrontendVersion && compareUmbraVersions(status.comfyui.frontendVersion || '0.0.0', feature.minimumFrontendVersion) < 0)) issues.push('The installed ComfyUI core/frontend bundle still needs repair.');
    for (const dependency of feature.runtimePackages) {
      if ((dependency.status === 'missing' || dependency.moduleStatus === 'unverified')
        && (!dependency.optional || dependency.requiredWhen?.defaultEnabled)) issues.push(`${dependency.detail} ${dependency.reason}`);
    }
  }
  if (plan.featureId === 'all-managed-dependencies') {
    const objectInfo = await get('/object_info');
    if (!objectInfo || typeof objectInfo !== 'object' || Array.isArray(objectInfo) || !Object.keys(objectInfo).length) issues.push('Owned runtime class catalog is unavailable.');
    else {
      const requiredClasses = new Set(features.flatMap((feature) => [...feature.requiredBuiltinClasses, ...feature.customNodes.flatMap((node) => node.requiredClasses)]));
      for (const name of requiredClasses) if (!Object.prototype.hasOwnProperty.call(objectInfo, name)) issues.push(`ComfyUI has not registered: ${name}. Review its node import log and Python dependencies.`);
    }
    for (const step of createManagedWorkflowRepairPlan(status, plan.featureId).steps) {
      if (!step.verified) issues.push(`${step.target}: managed files or Python Setup installation remain unverified.`);
    }
  }
  const workflowIds = plan.featureId === 'all-managed-dependencies'
    ? status.features.filter((feature) => ['official-dasiwa-h3-26', 'official-dasiwa-ltx23-50'].includes(feature.id)).flatMap((feature) => feature.workflowIds)
    : plan.workflowIds;
  if (workflowIds.length) {
    const catalog = await get('/api/video/official-workflows');
    if (catalog.success !== true || !Array.isArray(catalog.items)) issues.push('Owned official workflow catalogs are unavailable.');
    else for (const id of new Set(workflowIds)) {
      const item = catalog.items.find((entry: any) => entry.id === id);
      if (!item) issues.push(`${id}: use its normal pipeline preflight; official runtime qualification is unavailable.`);
      else if (!item.readiness?.ready) issues.push(...(item.readiness?.issues || [`${id}: runtime node registration is held.`]));
    }
  }
  const after = await get('/api/umbrabridge/status?refresh=true');
  const next = after.backends?.comfyui;
  if (after.stale || after.refreshing || !next?.running || !next.healthy || next.ownership !== 'owned'
    || next.ownerPid !== target.ownerPid || next.port !== target.port) issues.push('The owned ComfyUI process or port changed during preflight. Refresh readiness before resuming any queue.');
  issues.push('Native frontend hooks remain unverified. Refresh the ComfyUI frontend and import/capture the pinned original workflow through its native bridge before explicitly resuming its queue. GPU execution and quality remain unqualified.');
  return [...new Set(issues)];
}
