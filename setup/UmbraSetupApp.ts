import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertOnboardingPaths, inspectOnboarding, readOnboarding, updateOnboarding, verifyOnboardingCheckpoint, writeOnboarding } from './Onboarding';
import { pathToFileURL } from 'node:url';
import { invalidateManagedPythonSetupEvidence, prepareManagedDependencyInstallPolicy } from '../updater/ManagedDependencyInstallPolicy';
import { resolveUmbraWindowsLauncher } from '../shared/portableLauncher';
import { MODEL_MANIFESTS, SHARED_VISION_PROFILES, sharedSupportCatalog, modelSetupCatalog, modelSetupSelection, type ModelSetupPack } from './ModelSetupCatalog';
import { inspectManagedDependencies } from '../updater/ManagedDependencyStatus';
import { assertAIToolkitStopped, inspectToolMaintenance, toolMaintenanceArgs } from './ToolMaintenance';
import { claimToolMaintenance, readToolMaintenance, trackToolMaintenanceChild } from '../shared/toolMaintenanceLock';
import { createUmbraUpdateController } from '../updater/UmbraUpdaterApp';
import { setupSourceFingerprint } from '../launcher/UmbraUpdaterBootstrap';
import { installerFailureMessage } from '../shared/installerFailure';
import { compareUmbraVersions } from '../shared/appUpdate';
import { installMediaTools, inspectMediaTools } from './MediaTools';
import { assertManagedDependencyRepairIdle, createManagedWorkflowRepairPlan, managedRepairStepArgs, managedRepairStatePath, managedWorkflowRepairPlans, preflightManagedWorkflowRepair, readManagedRepairState, runManagedWorkflowRepair, type ManagedRepairState } from '../updater/ManagedDependencyRepair';

const DEFAULT_SETUP_PORT = 8215;
const SUPPORTED_LANGUAGES = new Set(['en', 'ja', 'zh-CN', 'ko', 'de']);
const MAX_LOG_LINES = 500;

type SetupJobKind = 'data-forge' | 'data-forge-pixai' | 'umbra-ui' | 'requirements' | 'support' | 'managed-tools' | 'media-tools' | 'python-helpers' | 'readiness';
type SetupJobState = {
  id: string;
  kind: SetupJobKind;
  phase: 'running' | 'complete' | 'failed' | 'cancelled';
  step: string;
  lines: string[];
  startedAt: string;
  completedAt: string | null;
  error: string;
  cancellable?: boolean;
  maintenanceTool?: 'comfyui' | 'aitoolkit';
  cancelRequested?: boolean;
  progress?: { stage?: string; file?: string; bytes?: number; totalBytes?: number; completedFiles?: number; totalFiles?: number };
};
const jobChildren = new Map<string, ReturnType<typeof spawn>>();

function readArg(name: string, fallback = ''): string {
  const args = Bun.argv.slice(2);
  const index = args.indexOf(name);
  if (index >= 0) return String(args[index + 1] || fallback);
  const inline = args.find((entry) => entry.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function hasArg(name: string): boolean {
  return Bun.argv.slice(2).includes(name);
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function writeJsonAtomic(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, filePath);
}

function readSettings(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) return {};
  const parsed = JSON.parse(readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('User/Config/settings.json does not contain a settings object.');
  }
  return parsed as Record<string, unknown>;
}

export function saveSetupLanguage(runtimeRoot: string, languageValue: unknown): string {
  assertOnboardingPaths(runtimeRoot);
  const language = String(languageValue || '').trim();
  if (!SUPPORTED_LANGUAGES.has(language)) throw new Error('Choose a supported Umbra Studio language.');

  const configRoot = join(resolve(runtimeRoot), 'User', 'Config');
  const settingsPath = join(configRoot, 'settings.json');
  const settings = readSettings(settingsPath);
  const currentApp = settings.app;
  const app = currentApp && typeof currentApp === 'object' && !Array.isArray(currentApp)
    ? currentApp as Record<string, unknown>
    : {};

  writeJsonAtomic(settingsPath, {
    ...settings,
    app: {
      ...app,
      'ui.language': language,
    },
  });
  writeJsonAtomic(join(configRoot, 'onboarding.json'), {
    schemaVersion: 1,
    phase: 'complete',
    language,
    completedAt: new Date().toISOString(),
    migration: null,
  });
  writeOnboarding(runtimeRoot, { ...readOnboarding(runtimeRoot), languageSaved: true });
  return language;
}

function openBrowser(url: string) {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/d', '/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }
  spawn('xdg-open', [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

function appendOutput(job: SetupJobState, value: string) {
  const normalized = value.replace(/\r/g, '\n');
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    job.lines.push(trimmed);
  }
  if (job.lines.length > MAX_LOG_LINES) {
    job.lines.splice(0, job.lines.length - MAX_LOG_LINES);
  }
}

async function runScript(runtimeRoot: string, scriptPath: string, args: string[], job: SetupJobState, hfToken = '', sourceRoot = '', installEnv: Record<string, string> = {}) {
  if (!existsSync(scriptPath)) throw new Error(`Required installer script is missing: ${scriptPath}`);
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      ...installEnv,
      UMBRA_ROOT: runtimeRoot,
      ...(sourceRoot ? { UMBRA_SOURCE_ROOT: sourceRoot } : {}),
      ...(hfToken ? { HF_TOKEN: hfToken } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  jobChildren.set(job.id, child);
  if (job.maintenanceTool && child.pid) {
    try { trackToolMaintenanceChild(runtimeRoot, job.maintenanceTool, child.pid); }
    catch (error) { child.kill(); child.on('error', () => {}); jobChildren.delete(job.id); throw error; }
  }
  const redact = (value: string) => hfToken ? value.split(hfToken).join('[redacted]') : value;
  child.stdin?.on('error', (error) => {
    appendOutput(job, redact(`Installer input pipe failed: ${error.message}`));
  });
  const attachOutput = (stream: typeof child.stdout) => {
    let pending = '';
    const line = (value: string) => {
      if (value.startsWith('UMBRA_MODEL_PROGRESS|')) {
        try { job.progress = { ...job.progress, ...JSON.parse(value.slice('UMBRA_MODEL_PROGRESS|'.length)) }; } catch { /* Ignore incomplete worker messages. */ }
      } else appendOutput(job, redact(value));
    };
    stream?.setEncoding('utf8');
    stream?.on('data', (chunk) => {
      pending += String(chunk);
      const lines = pending.split(/[\r\n]/);
      pending = lines.pop() || '';
      lines.forEach(line);
    });
    stream?.on('end', () => { if (pending) line(pending); });
  };
  attachOutput(child.stdout);
  attachOutput(child.stderr);
  const code = await new Promise<number>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (value) => resolveExit(value ?? 1));
  }).finally(() => jobChildren.delete(job.id));
  if (job.cancelRequested) throw new Error('Installation cancelled.');
  if (code !== 0) throw new Error(installerFailureMessage(job.lines, code));
}

async function runManagedToolScript(runtimeRoot: string, sourceRoot: string, args: string[], job: SetupJobState) {
  // Old interpreter constraints cannot be applied to a fresh Python ABI. The migration
  // snapshots optional attention packages and rolls back if they cannot be restored.
  if (args[0] === 'update-python-comfyui') {
    await runScript(runtimeRoot, join(sourceRoot, 'setup-tools.ts'), args, job, '', sourceRoot);
    return;
  }
  const before = inspectManagedDependencies(sourceRoot, runtimeRoot);
  const policy = prepareManagedDependencyInstallPolicy(runtimeRoot, before.features.flatMap((feature) => feature.runtimePackages));
  try {
    const target = args[0] === 'managed-comfyui' ? 'ComfyUI' : args[0] === 'comfy-node' ? args[1] : null;
    const pythonVerified = target === 'ComfyUI' ? before.comfyui.pythonDependencies.verified
      : target ? before.features.flatMap((feature) => feature.customNodes.filter((node) => node.name === target)).every((node) => node.pythonDependencies.verified) : true;
    if (target && !pythonVerified) invalidateManagedPythonSetupEvidence(runtimeRoot, target);
    await runScript(runtimeRoot, join(sourceRoot, 'setup-tools.ts'), args, job, '', sourceRoot,
      { PIP_CONSTRAINT: pathToFileURL(policy.path).href });
  } finally { policy.cleanup(); }
}

async function runModelInstall(
  runtimeRoot: string,
  sourceRoot: string,
  kind: SetupJobKind,
  job: SetupJobState,
  profiles: string[] = ['core'],
  check = false,
  hfToken = '',
) {
  if (kind === 'python-helpers') {
    job.step = 'Installing Python Helpers';
    await runScript(runtimeRoot, join(sourceRoot, 'setup-tools.ts'), ['python-helpers'], job, '', sourceRoot);
    if (!job.lines.some((line) => line === 'UMBRA_VERIFY_OK|setup-tools')) {
      throw new Error('Python Helpers verification did not complete. Review the setup log.');
    }
    return;
  }
  if (kind === 'data-forge') {
    job.step = 'Installing WD tagger models';
    await runScript(runtimeRoot, join(sourceRoot, 'scripts', 'download-waifu-models.mjs'), [], job);
    job.step = 'Installing natural-language caption models';
    await runScript(runtimeRoot, join(sourceRoot, 'scripts', 'download-caption-models.mjs'), [], job);
    return;
  }
  if (kind === 'data-forge-pixai') {
    job.step = 'Installing PixAI Python dependencies';
    await runScript(runtimeRoot, join(sourceRoot, 'scripts', 'install-pixai-tagger-deps.mjs'), [], job);
    job.step = 'Installing optional PixAI tagger';
    await runScript(runtimeRoot, join(sourceRoot, 'scripts', 'download-waifu-models.mjs'), ['--only', 'pixai-tagger-v1.0'], job);
    return;
  }
  const pack = kind === 'requirements' ? 'requirements' : 'support';
  if (!profiles.length) return;
  job.step = check ? 'Verifying selected models' : 'Installing selected models';
  await runScript(
    runtimeRoot,
    join(sourceRoot, 'scripts', 'download-umbra-ui-models.mjs'),
    ['--manifest', join(sourceRoot, 'defaults', 'UmbraUI', MODEL_MANIFESTS[pack]),
      '--profile', profiles.join(','), '--comfy-root', join(runtimeRoot, 'Tools', 'ComfyUI'),
      '--state-file', pack === 'requirements' ? 'model-requirements.json' : 'support-models.json',
      '--json-progress', '--cancel-stdin', ...(check ? ['--check'] : [])],
    job,
    hfToken,
  );
}

function launchUmbra(runtimeRoot: string) {
  const windowsLauncher = process.platform === 'win32'
    ? resolveUmbraWindowsLauncher(runtimeRoot)
    : null;
  const launcher = process.platform === 'win32'
    ? windowsLauncher?.launcherPath || ''
    : join(runtimeRoot, 'start-umbra.sh');
  if (!launcher || !existsSync(launcher)) throw new Error('Umbra Studio launcher is missing.');
  spawn(
    process.platform === 'win32' ? windowsLauncher!.command : launcher,
    process.platform === 'win32' ? windowsLauncher!.args : [],
    {
      cwd: runtimeRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    },
  ).unref();
}

async function main() {
  const runtimeRoot = resolve(readArg('--root', process.env.UMBRA_ROOT || process.cwd()));
  const sourceRoot = resolve(readArg('--source', join(runtimeRoot, 'resources', 'app')));
  const sessionPath = readArg('--session');
  const bootstrap = join(sourceRoot, 'launcher', 'UmbraUpdaterBootstrap.js');
  // Run outside replaceable application files so the shared app survives an update.
  if (!sessionPath && existsSync(bootstrap) && existsSync(join(sourceRoot, 'setup', 'UmbraSetupApp.js'))) {
    const child = spawn(process.execPath, [bootstrap, '--tab', readArg('--tab', 'onboarding'), ...Bun.argv.slice(2)], { cwd: runtimeRoot, windowsHide: true, stdio: 'inherit' });
    const code = await new Promise<number>((done, fail) => { child.once('error', fail); child.once('close', code => done(code ?? 1)); });
    if (code) throw new Error(`Setup bootstrap exited with code ${code}.`);
    return;
  }
  const requestedPort = Number(readArg('--port', String(DEFAULT_SETUP_PORT)));
  const port = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535 ? requestedPort : DEFAULT_SETUP_PORT;
  const token = readArg('--token') || randomUUID();
  if (sessionPath) {
    const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
    if (resolve(session.runtimeRoot) !== runtimeRoot || resolve(session.sourceRoot) !== sourceRoot || session.token !== token) throw new Error('Setup and update session ownership does not match this installation.');
  }
  const uiSourceRoot = resolve(readArg('--ui-source', sourceRoot));
  const sourceFingerprint = sessionPath ? JSON.parse(readFileSync(sessionPath, 'utf8')).sourceFingerprint : '';
  const htmlPath = join(uiSourceRoot, 'setup', 'index.html');
  if (!existsSync(htmlPath)) throw new Error(`Setup page is missing: ${htmlPath}`);
  const html = readFileSync(htmlPath, 'utf8')
    .replace('/* MODEL_SETUP_SCRIPT */', () => readFileSync(join(uiSourceRoot, 'setup', 'models.js'), 'utf8'))
    .replace('/* ONBOARDING_SCRIPT */', () => readFileSync(join(uiSourceRoot, 'setup', 'onboarding.js'), 'utf8'))
    .replace('<!-- UPDATE_PANEL -->', () => readFileSync(join(uiSourceRoot, 'updater', 'update-panel.html'), 'utf8'))
    .replace('/* UPDATE_STYLE */', () => readFileSync(join(uiSourceRoot, 'updater', 'update-panel.css'), 'utf8'))
    .replace('/* UPDATE_SCRIPT */', () => readFileSync(join(uiSourceRoot, 'updater', 'update-panel.js'), 'utf8'));
  let activeJob: SetupJobState | null = null;
  let managedRepairState = readManagedRepairState(runtimeRoot);
  const persistManagedRepair = async (state: ManagedRepairState) => { managedRepairState = state; writeJsonAtomic(managedRepairStatePath(runtimeRoot), state); };
  const umbraOrigin = () => {
    const settings = readSettings(join(runtimeRoot, 'User', 'Config', 'settings.json'));
    const servers = settings.servers as { umbra?: { port?: number } } | undefined;
    const appPort = Number(process.env.UMBRA_PORT || servers?.umbra?.port || 8212);
    if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) throw new Error('The Umbra Studio listener port is invalid.');
    return `http://127.0.0.1:${appPort}`;
  };
  const assertDependencyIdle = () => assertManagedDependencyRepairIdle({ runtimeRoot, origin: umbraOrigin() });
  let updateController: Awaited<ReturnType<typeof createUmbraUpdateController>> | null = null;
  const setupBusy = () => activeJob?.phase === 'running' || !!readToolMaintenance(runtimeRoot, 'comfyui') || !!readToolMaintenance(runtimeRoot, 'aitoolkit');
  const hasRunningInstaller = () => activeJob?.phase === 'running' || updateController?.isBusy() === true;
  const closeSetup = () => { updateController?.close(); server.stop(true); process.exit(0); };
  if (sessionPath) updateController = await createUmbraUpdateController(sessionPath, { isSetupBusy: setupBusy, onClose: closeSetup });

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const suppliedToken = url.searchParams.get('token')
        || request.headers.get('x-umbra-setup-token')
        || '';
      if (suppliedToken !== token) return json({ success: false, error: 'Unauthorized setup session.' }, 403);
      if (url.pathname.startsWith('/api/updates/')) {
        return await updateController?.fetch(request) || json({ success: false, error: 'Open the packaged Umbra Setup launcher to manage updates.' }, 503);
      }
      if (url.pathname !== '/api/health') {
        try { assertOnboardingPaths(runtimeRoot); }
        catch (error) { return json({ success: false, error: (error as Error).message }, 409); }
      }
      if (updateController?.needsReopen() && (request.method === 'POST' && !['/api/close', '/api/launch'].includes(url.pathname) || url.pathname === '/api/onboarding')) {
        return json({ success: false, error: 'Close and reopen Setup after updating Umbra Studio.' }, 409);
      }

      if (url.pathname === '/api/health') {
        let needsReopen = updateController?.needsReopen() || false;
        try { if (sourceFingerprint) needsReopen ||= sourceFingerprint !== setupSourceFingerprint(sourceRoot); } catch { needsReopen = true; }
        return json({ success: true, port: server.port, runtimeRoot, sourceFingerprint, needsReopen });
      }
      if (url.pathname === '/api/models' && request.method === 'GET') {
        try { return json({ success: true, ...await modelSetupCatalog(sourceRoot, runtimeRoot) }); }
        catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500); }
      }
      if (url.pathname === '/api/onboarding' && request.method === 'GET') {
        try { return json(await inspectOnboarding(sourceRoot, runtimeRoot)); }
        catch (error) { return json({ success: false, error: (error as Error).message }, 500); }
      }
      if (url.pathname === '/api/onboarding' && request.method === 'POST') {
        if (hasRunningInstaller()) return json({ success: false, error: 'Wait for the current operation to finish.' }, 409);
        try {
          const body = await request.json() as Record<string, unknown>;
          if (hasRunningInstaller()) return json({ success: false, error: 'Wait for the current operation to finish.' }, 409);
          return json({ success: true, state: updateOnboarding(sourceRoot, runtimeRoot, body) });
        } catch (error) { return json({ success: false, error: (error as Error).message }, 400); }
      }
      if (url.pathname === '/api/onboarding/verify' && request.method === 'POST') {
        if (hasRunningInstaller()) return json({ success: false, error: 'Wait for the current operation to finish.' }, 409);
        const state = readOnboarding(runtimeRoot);
        if (!state.languageSaved || !state.profiles.length) return json({ success: false, error: 'Save your language and select a generation model family first.' }, 400);
        const job: SetupJobState = { id: randomUUID(), kind: 'readiness', phase: 'running', step: 'Verifying installation', lines: [], startedAt: new Date().toISOString(), completedAt: null, error: '', cancellable: true };
        activeJob = job;
        void (async () => {
          await runModelInstall(runtimeRoot, sourceRoot, 'support', job, modelSetupSelection(sourceRoot, 'support', state.supportProfiles), true);
          await runModelInstall(runtimeRoot, sourceRoot, 'requirements', job, modelSetupSelection(sourceRoot, 'requirements', state.profiles), true);
          const checkpoint = await inspectOnboarding(sourceRoot, runtimeRoot);
          job.step = 'Verifying generation checkpoint';
          job.progress = { stage: 'checking', file: checkpoint.selectedCheckpoint };
          writeOnboarding(runtimeRoot, { ...readOnboarding(runtimeRoot), checkpointVerification: await verifyOnboardingCheckpoint(runtimeRoot, checkpoint.selectedCheckpoint) });
          const result = await inspectOnboarding(sourceRoot, runtimeRoot);
          if (result.issues.length) throw new Error(result.issues.join(' '));
          writeOnboarding(runtimeRoot, { ...readOnboarding(runtimeRoot), verificationFingerprint: result.fingerprint, verifiedAt: new Date().toISOString() });
          appendOutput(job, result.qualification);
          job.phase = 'complete'; job.step = 'Installation verified'; job.completedAt = new Date().toISOString();
        })().catch(error => { job.phase = job.cancelRequested ? 'cancelled' : 'failed'; job.step = 'Verification held'; job.error = (error as Error).message; job.completedAt = new Date().toISOString(); appendOutput(job, job.error); });
        return json({ success: true, accepted: true, job }, 202);
      }
      if (url.pathname === '/api/dependencies' && request.method === 'GET') {
        try {
          const status = inspectManagedDependencies(sourceRoot, runtimeRoot);
          return json({ success: true, ...status, maintenanceTools: inspectToolMaintenance(runtimeRoot), sharedSupport: sharedSupportCatalog(sourceRoot), repairState: managedRepairState,
            repairPlans: managedWorkflowRepairPlans(status) });
        }
        catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500); }
      }
      if (url.pathname === '/api/tools/action' && request.method === 'POST') {
        if (hasRunningInstaller()) return json({ success: false, error: 'Finish the current installation first.' }, 409);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        let args: string[];
        try { args = toolMaintenanceArgs(body.tool, body.action, body.ref); }
        catch (error) { return json({ success: false, error: String((error as Error).message) }, 400); }
        let releaseMaintenance: (() => void) | null = null;
        try {
          const release = claimToolMaintenance(runtimeRoot, String(body.tool));
          releaseMaintenance = release;
          try {
            const health = await fetch(`${umbraOrigin()}/api/healthz`, { signal: AbortSignal.timeout(1500) }).then(response => response.json()).catch(() => null) as any;
            if (health && health.runtimeRoot !== runtimeRoot) throw new Error('The Umbra endpoint belongs to another installation.');
            if (health) {
              const detect = await fetch(`${umbraOrigin()}/api/tools/detect`, { signal: AbortSignal.timeout(1500) }).then(response => response.json()) as any;
              const action = detect[body.tool as string]?.activeAction;
              if (action && action.ownerPid !== process.pid) throw new Error('Finish the active Umbra tool operation before maintenance.');
            }
            if (body.tool === 'comfyui') await assertDependencyIdle();
            else await assertAIToolkitStopped(runtimeRoot);
          } catch (error) { release(); throw error; }
          if (hasRunningInstaller()) { release(); return json({ success: false, error: 'Finish the current installation first.' }, 409); }
          const tool = inspectToolMaintenance(runtimeRoot).find(item => item.id === body.tool)!;
          if (!['install', 'install_core', 'set_comfyui_version'].includes(String(body.action)) && !tool.installed) { release(); return json({ success: false, error: `Install ${tool.name} first.` }, 400); }
          const job: SetupJobState = { id: randomUUID(), kind: 'managed-tools', maintenanceTool: tool.id, phase: 'running', step: `${tool.name}: ${String(body.action).replaceAll('_', ' ')}`,
            lines: [], startedAt: new Date().toISOString(), completedAt: null, error: '', cancellable: false };
          activeJob = job;
          // AI Toolkit has its own environment; ComfyUI's constraints must not leak into it.
          void (body.tool === 'comfyui' ? runManagedToolScript(runtimeRoot, sourceRoot, args, job)
            : runScript(runtimeRoot, join(sourceRoot, 'setup-tools.ts'), args, job, '', sourceRoot))
            .then(async () => {
              if (!job.lines.includes('UMBRA_VERIFY_OK|setup-tools')) throw new Error('Tool installer verification did not complete. Review the log.');
              if (!inspectToolMaintenance(runtimeRoot).find(item => item.id === body.tool)?.installed) throw new Error(`${tool.name} installation is missing after maintenance.`);
              if (body.tool === 'comfyui' && ['nodes_only', 'custom_nodes', 'install'].includes(String(body.action))) {
                const inspected = await inspectOnboarding(sourceRoot, runtimeRoot);
                writeOnboarding(runtimeRoot, { ...readOnboarding(runtimeRoot), nodesFingerprint: inspected.nodesFingerprint });
              }
              appendOutput(job, 'Maintenance verified. Launch the tool from Umbra Studio to check runtime readiness.');
              job.phase = 'complete'; job.step = `${tool.name} maintenance complete`; job.completedAt = new Date().toISOString();
            }).catch(error => { job.phase = 'failed'; job.step = `${tool.name} maintenance failed`; job.error = error instanceof Error ? error.message : String(error); job.completedAt = new Date().toISOString(); appendOutput(job, job.error); }).finally(release);
          return json({ success: true, accepted: true, job }, 202);
        } catch (error) { releaseMaintenance?.(); return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 409); }
      }
      if (url.pathname === '/api/dependencies/action' && request.method === 'POST') {
        if (hasRunningInstaller()) return json({ success: false, error: 'Finish the current installation first.' }, 409);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        try {
          const target = String(body.target || '');
          const kind = String(body.kind || '');
          const media = kind === 'media' && target === 'FFmpeg';
          const status = inspectManagedDependencies(sourceRoot, runtimeRoot);
          const args = media ? ['media-tools'] : kind === 'comfyui' && target === 'ComfyUI' ? ['managed-comfyui']
            : kind === 'node' && status.features.some((feature) => feature.customNodes.some((node) => node.name === target)) ? ['comfy-node', target]
            : null;
          if (!args) return json({ success: false, error: 'Choose a dependency declared by this Umbra Studio build.' }, 400);
          if (!media) await assertDependencyIdle();
          if (hasRunningInstaller()) return json({ success: false, error: 'Finish the current installation first.' }, 409);
          const job: SetupJobState = {
            id: randomUUID(), kind: media ? 'media-tools' : 'managed-tools', phase: 'running', step: `Installing ${target}`,
            lines: [], startedAt: new Date().toISOString(), completedAt: null, error: '', cancellable: false,
          };
          activeJob = job;
          void (media ? installMediaTools(runtimeRoot, (line) => appendOutput(job, line))
            : runManagedToolScript(runtimeRoot, sourceRoot, args, job))
            .then(() => {
              if (media) {
                if (!inspectMediaTools(runtimeRoot).ready) throw new Error('Media tools could not be verified. Review configured FFmpeg/ffprobe paths and retry.');
                job.phase = 'complete'; job.step = 'FFmpeg and ffprobe verified'; job.completedAt = new Date().toISOString();
                return;
              }
              if (!job.lines.some((line) => line === 'UMBRA_VERIFY_OK|setup-tools')) throw new Error('Managed tool installation did not complete verification. Review the log.');
              const verified = inspectManagedDependencies(sourceRoot, runtimeRoot);
              const requirements = kind === 'node' ? verified.features.flatMap((feature) => feature.customNodes.filter((node) => node.name === target)) : [];
              const failed = requirements.filter((node) => !node.filesVerified || !node.pythonDependencies.verified);
              if (kind === 'node' && (!requirements.length || failed.length)) {
                throw new Error(`Managed ${target} verification failed. ${failed.map((node) => node.pythonDependencies.detail || node.reason || node.status).join(' ')}`);
              }
              if (kind === 'comfyui' && (!verified.comfyui.installed || (verified.comfyui.minimumRequired
                && compareUmbraVersions(verified.comfyui.version, verified.comfyui.minimumRequired) < 0)
                || (verified.comfyui.minimumFrontendRequired && compareUmbraVersions(verified.comfyui.frontendVersion || '0.0.0', verified.comfyui.minimumFrontendRequired) < 0))) {
                throw new Error(`ComfyUI ${verified.comfyui.minimumRequired || 'installation'} is still required. Review the setup log.`);
              }
              appendOutput(job, 'Managed files verified. Restart managed ComfyUI and refresh its frontend before opening the workflow. Runtime class registration remains to be checked.');
              job.phase = 'complete'; job.step = 'Managed tool files verified'; job.completedAt = new Date().toISOString();
            })
            .catch((error) => {
              job.phase = 'failed'; job.step = 'Managed tool repair failed'; job.completedAt = new Date().toISOString();
              job.error = error instanceof Error ? error.message : String(error); appendOutput(job, job.error);
            });
          return json({ success: true, accepted: true, job }, 202);
        } catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500); }
      }
      if (url.pathname === '/api/dependencies/repair' && request.method === 'POST') {
        if (hasRunningInstaller()) return json({ success: false, error: 'Finish the current installation first.' }, 409);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        try {
          const plan = createManagedWorkflowRepairPlan(inspectManagedDependencies(sourceRoot, runtimeRoot), String(body.featureId || ''));
          if (body.planId !== plan.id) return json({ success: false, error: 'Review and approve the current managed dependency plan.' }, 409);
          await assertDependencyIdle();
          if (hasRunningInstaller()) return json({ success: false, error: 'Finish the current installation first.' }, 409);
          const prior = managedRepairState;
          const state: ManagedRepairState = prior?.planId === plan.id && prior.featureId === plan.featureId
            ? { ...prior, completedTargets: [...prior.completedTargets], priorVersions: { ...prior.priorVersions }, lines: [...prior.lines] }
            : { schemaVersion: 1, planId: plan.id, featureId: plan.featureId, phase: 'held', completedTargets: [], priorVersions: {}, lines: [], error: '', updatedAt: new Date().toISOString() };
          const job: SetupJobState = { id: randomUUID(), kind: 'managed-tools', phase: 'running', step: `Preparing ${plan.label}`,
            lines: [], startedAt: new Date().toISOString(), completedAt: null, error: '', cancellable: false };
          activeJob = job;
          void (async () => {
            if (plan.featureId === 'all-managed-dependencies') {
              await runModelInstall(runtimeRoot, sourceRoot, 'python-helpers', job);
              await runModelInstall(runtimeRoot, sourceRoot, 'data-forge-pixai', job);
              await runModelInstall(runtimeRoot, sourceRoot, 'data-forge', job);
              await runModelInstall(runtimeRoot, sourceRoot, 'support', job, ['core']);
              await runModelInstall(runtimeRoot, sourceRoot, 'requirements', job, SHARED_VISION_PROFILES);
            }
            await runManagedWorkflowRepair(plan, state, {
            assertIdle: assertDependencyIdle, persist: persistManagedRepair,
            inspect: () => inspectManagedDependencies(sourceRoot, runtimeRoot),
            install: async (step) => {
              job.step = `Installing ${step.target}`;
              job.lines = [];
              try {
                await runManagedToolScript(runtimeRoot, sourceRoot, managedRepairStepArgs(step), job);
                if (!job.lines.some((line) => line === 'UMBRA_VERIFY_OK|setup-tools')) throw new Error(`${step.target} did not finish managed verification.`);
                const verified = inspectManagedDependencies(sourceRoot, runtimeRoot);
                if (step.kind === 'package' && !verified.backgroundCompatibility.verified) throw new Error(verified.backgroundCompatibility.detail);
                const requirements = step.kind === 'node' ? verified.features.flatMap((feature) => feature.customNodes.filter((node) => node.name === step.target)) : [];
                const failed = requirements.filter((node) => !node.filesVerified || !node.pythonDependencies.verified);
                if (step.kind === 'node' && (!requirements.length || failed.length)) {
                  throw new Error(`Managed ${step.target} verification failed. ${failed.map((node) => node.pythonDependencies.detail || node.reason || node.status).join(' ')}`);
                }
                if (step.kind === 'comfyui' && (!verified.comfyui.installed || compareUmbraVersions(verified.comfyui.version || '0.0.0', verified.comfyui.minimumRequired || '0.0.0') < 0
                  || compareUmbraVersions(verified.comfyui.frontendVersion || '0.0.0', verified.comfyui.minimumFrontendRequired || '0.0.0') < 0)) throw new Error('The core/frontend bundle still needs repair.');
              } finally { state.lines.push(...job.lines.slice(-20)); }
            },
            });
          })().then(() => { job.phase = 'complete'; job.step = 'Restart required; runtime preflight pending'; job.completedAt = new Date().toISOString(); })
            .catch((error) => { job.phase = 'failed'; job.step = 'Managed repair held'; job.error = error instanceof Error ? error.message : String(error); job.completedAt = new Date().toISOString(); appendOutput(job, job.error); });
          return json({ success: true, accepted: true, job, repairState: state }, 202);
        } catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 409); }
      }
      if (url.pathname === '/api/dependencies/preflight' && request.method === 'POST') {
        if (hasRunningInstaller()) return json({ success: false, error: 'Finish the current installation before refreshing readiness.' }, 409);
        try {
          const body = await request.json().catch(() => ({})) as Record<string, unknown>;
          const status = inspectManagedDependencies(sourceRoot, runtimeRoot);
          const plan = createManagedWorkflowRepairPlan(status, String(body.featureId || ''));
          const issues = await preflightManagedWorkflowRepair(plan, status, umbraOrigin());
          if (managedRepairState?.planId === plan.id) await persistManagedRepair({ ...managedRepairState, phase: issues.length ? 'preflight-held' : 'preflight-passed', error: issues.join(' '), updatedAt: new Date().toISOString() });
          return json({ success: true, ready: issues.length === 0, issues, qualification: 'Installed files and owned runtime classes only. Refresh/import the native workflow; frontend hooks, GPU execution and quality remain unqualified. Queue Resume is explicit.' });
        } catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 409); }
      }
      if (url.pathname === '/api/cancel' && request.method === 'POST') {
        if (!activeJob || activeJob.phase !== 'running' || !activeJob.cancellable) return json({ success: false, error: 'No cancellable download is running.' }, 409);
        const job = activeJob;
        const child = jobChildren.get(job.id);
        if (!child?.stdin?.writable) return json({ success: false, error: 'Installer is finishing. Try again shortly.' }, 409);
        try {
          await new Promise<void>((resolveWrite, rejectWrite) => {
            child.stdin!.write('q', (error) => error ? rejectWrite(error) : resolveWrite());
          });
        } catch {
          return json({ success: false, error: 'The installer could not receive the cancellation request. Check its status and try again.' }, 409);
        }
        if (job.phase !== 'running') return json({ success: false, error: 'The installer has already finished.' }, 409);
        job.cancelRequested = true;
        return json({ success: true });
      }
      if (url.pathname === '/api/status' && request.method === 'GET') {
        const settingsPath = join(runtimeRoot, 'User', 'Config', 'settings.json');
        let language = 'en';
        try {
          const settings = readSettings(settingsPath);
          const app = settings.app as Record<string, unknown> | undefined;
          const configured = String(app?.['ui.language'] || '');
          if (SUPPORTED_LANGUAGES.has(configured)) language = configured;
        } catch {
          // The save endpoint reports malformed settings without blocking this page.
        }
        return json({ success: true, language, job: activeJob });
      }
      if (url.pathname === '/api/language' && request.method === 'POST') {
        if (hasRunningInstaller()) return json({ success: false, error: 'Wait for the current operation to finish.' }, 409);
        try {
          const body = await request.json().catch(() => ({})) as Record<string, unknown>;
          return json({ success: true, language: saveSetupLanguage(runtimeRoot, body.language) });
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 400);
        }
      }
      if (url.pathname === '/api/install' && request.method === 'POST') {
        if (hasRunningInstaller()) {
          return json({ success: false, error: 'A model installation is already running.' }, 409);
        }
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return json({ success: false, error: 'Model installation requires a settings object.' }, 400);
        }
        const kind = String(body.kind || '') as SetupJobKind;
        if (!['data-forge', 'data-forge-pixai', 'umbra-ui', 'requirements', 'support', 'python-helpers'].includes(kind)) {
          return json({ success: false, error: 'Choose a supported model pack.' }, 400);
        }
        let profiles: string[] = ['core'];
        try {
          if (kind === 'requirements' || kind === 'support') profiles = modelSetupSelection(sourceRoot, kind as ModelSetupPack, body.profiles);
          if (body.hfToken !== undefined && (typeof body.hfToken !== 'string' || body.hfToken.length > 512 || /[\r\n]/.test(body.hfToken))) throw new Error('Invalid Hugging Face token.');
          if ((kind === 'data-forge' || kind === 'data-forge-pixai') && body.check) throw new Error('Data Forge verification runs during installation.');
        } catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 400); }
        // Reading the request body yields; another installer may now own the slot.
        if (hasRunningInstaller()) {
          return json({ success: false, error: 'A model installation is already running.' }, 409);
        }
        const job: SetupJobState = {
          id: randomUUID(),
          kind,
          phase: 'running',
          step: 'Preparing installer',
          lines: [],
          startedAt: new Date().toISOString(),
          completedAt: null,
          error: '',
          cancellable: kind !== 'data-forge' && kind !== 'data-forge-pixai' && kind !== 'python-helpers',
        };
        activeJob = job;
        void runModelInstall(runtimeRoot, sourceRoot, kind, job, profiles, body.check === true, String(body.hfToken || '').trim())
          .then(() => {
            job.phase = 'complete';
            job.step = 'Installation complete';
            job.completedAt = new Date().toISOString();
          })
          .catch((error) => {
            job.phase = job.cancelRequested ? 'cancelled' : 'failed';
            job.step = job.cancelRequested ? 'Installation cancelled' : 'Installation failed';
            job.completedAt = new Date().toISOString();
            job.error = error instanceof Error ? error.message : String(error);
            appendOutput(job, job.error);
          });
        return json({ success: true, accepted: true, job }, 202);
      }
      if (url.pathname === '/api/launch' && request.method === 'POST') {
        if (hasRunningInstaller()) {
          return json({ success: false, error: 'Wait for the model installer to finish.' }, 409);
        }
        try {
          launchUmbra(runtimeRoot);
          setTimeout(() => {
            closeSetup();
          }, 750);
          return json({ success: true });
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        }
      }
      if (url.pathname === '/api/close' && request.method === 'POST') {
        if (hasRunningInstaller()) {
          return json({ success: false, error: 'Wait for the model installer to finish.' }, 409);
        }
        setTimeout(() => {
          closeSetup();
        }, 200);
        return json({ success: true });
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
            'X-Frame-Options': 'DENY',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    },
  });

  const setupUrl = `http://127.0.0.1:${server.port}/?token=${encodeURIComponent(token)}&tab=${['models', 'tools', 'updates'].includes(readArg('--tab')) ? readArg('--tab') : 'general'}&pack=${encodeURIComponent(readArg('--pack', 'requirements'))}`;
  console.log(`[UmbraSetup] Ready: ${setupUrl}`);
  if (!hasArg('--no-open')) openBrowser(setupUrl);
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error('[UmbraSetup] Fatal:', error);
    process.exit(1);
  });
}
