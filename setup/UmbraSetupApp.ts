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
import { resolveUmbraWindowsLauncher } from '../shared/portableLauncher';
import { MODEL_MANIFESTS, modelSetupCatalog, modelSetupSelection, type ModelSetupPack } from './ModelSetupCatalog';
import { inspectManagedDependencies } from '../updater/ManagedDependencyStatus';
import { compareUmbraVersions } from '../shared/appUpdate';
import { assertManagedDependencyRepairIdle, createManagedWorkflowRepairPlan, managedRepairStepArgs, managedRepairStatePath, managedWorkflowRepairPlans, preflightManagedWorkflowRepair, readManagedRepairState, runManagedWorkflowRepair, type ManagedRepairState } from '../updater/ManagedDependencyRepair';

const DEFAULT_SETUP_PORT = 8215;
const SUPPORTED_LANGUAGES = new Set(['en', 'ja', 'zh-CN', 'ko', 'de']);
const MAX_LOG_LINES = 500;

type SetupJobKind = 'data-forge' | 'data-forge-pixai' | 'umbra-ui' | 'requirements' | 'support' | 'managed-tools';
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

async function runScript(runtimeRoot: string, scriptPath: string, args: string[], job: SetupJobState, hfToken = '', sourceRoot = '') {
  if (!existsSync(scriptPath)) throw new Error(`Required installer script is missing: ${scriptPath}`);
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      UMBRA_ROOT: runtimeRoot,
      ...(sourceRoot ? { UMBRA_SOURCE_ROOT: sourceRoot } : {}),
      ...(hfToken ? { HF_TOKEN: hfToken } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  jobChildren.set(job.id, child);
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
  if (code !== 0) throw new Error(`Installer exited with code ${code}.`);
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
  const port = Math.max(1, Number.parseInt(readArg('--port', String(DEFAULT_SETUP_PORT)), 10) || DEFAULT_SETUP_PORT);
  const token = readArg('--token') || randomUUID();
  const htmlPath = join(sourceRoot, 'setup', 'index.html');
  if (!existsSync(htmlPath)) throw new Error(`Setup page is missing: ${htmlPath}`);
  const html = readFileSync(htmlPath, 'utf8').replace('/* MODEL_SETUP_SCRIPT */', () => readFileSync(join(sourceRoot, 'setup', 'models.js'), 'utf8'));
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
  const hasRunningInstaller = () => activeJob?.phase === 'running';

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const suppliedToken = url.searchParams.get('token')
        || request.headers.get('x-umbra-setup-token')
        || '';
      if (suppliedToken !== token) return json({ success: false, error: 'Unauthorized setup session.' }, 403);

      if (url.pathname === '/api/health') {
        return json({ success: true, port: server.port });
      }
      if (url.pathname === '/api/models' && request.method === 'GET') {
        try { return json({ success: true, ...await modelSetupCatalog(sourceRoot, runtimeRoot) }); }
        catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500); }
      }
      if (url.pathname === '/api/dependencies' && request.method === 'GET') {
        try {
          const status = inspectManagedDependencies(sourceRoot, runtimeRoot);
          return json({ success: true, ...status, repairState: managedRepairState,
            repairPlans: managedWorkflowRepairPlans(status) });
        }
        catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500); }
      }
      if (url.pathname === '/api/dependencies/action' && request.method === 'POST') {
        if (hasRunningInstaller()) return json({ success: false, error: 'Finish the current installation first.' }, 409);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        try {
          const target = String(body.target || '');
          const kind = String(body.kind || '');
          const status = inspectManagedDependencies(sourceRoot, runtimeRoot);
          const args = kind === 'comfyui' && target === 'ComfyUI' ? ['managed-comfyui']
            : kind === 'node' && status.features.some((feature) => feature.customNodes.some((node) => node.name === target)) ? ['comfy-node', target]
            : null;
          if (!args) return json({ success: false, error: 'Choose a dependency declared by this Umbra Studio build.' }, 400);
          await assertDependencyIdle();
          if (hasRunningInstaller()) return json({ success: false, error: 'Finish the current installation first.' }, 409);
          const job: SetupJobState = {
            id: randomUUID(), kind: 'managed-tools', phase: 'running', step: `Installing ${target}`,
            lines: [], startedAt: new Date().toISOString(), completedAt: null, error: '', cancellable: false,
          };
          activeJob = job;
          void runScript(runtimeRoot, join(sourceRoot, 'setup-tools.ts'), args, job, '', sourceRoot)
            .then(() => {
              if (!job.lines.some((line) => line === 'UMBRA_VERIFY_OK|setup-tools')) throw new Error('Managed tool installation did not complete verification. Review the log.');
              const verified = inspectManagedDependencies(sourceRoot, runtimeRoot);
              const failed = kind === 'node' ? verified.features.flatMap((feature) => feature.customNodes.filter((node) => node.name === target && node.status !== 'ready')) : [];
              if (failed.length) throw new Error(failed.map((node) => node.reason || node.status).join(' '));
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
          void runManagedWorkflowRepair(plan, state, {
            assertIdle: assertDependencyIdle, persist: persistManagedRepair,
            inspect: () => inspectManagedDependencies(sourceRoot, runtimeRoot),
            install: async (step) => {
              job.step = `Installing ${step.target}`;
              job.lines = [];
              try {
                await runScript(runtimeRoot, join(sourceRoot, 'setup-tools.ts'), managedRepairStepArgs(step), job, '', sourceRoot);
                if (!job.lines.some((line) => line === 'UMBRA_VERIFY_OK|setup-tools')) throw new Error(`${step.target} did not finish managed verification.`);
                const verified = inspectManagedDependencies(sourceRoot, runtimeRoot);
                if (step.kind === 'package' && !verified.backgroundCompatibility.verified) throw new Error(verified.backgroundCompatibility.detail);
                const failed = step.kind === 'node' ? verified.features.flatMap((feature) => feature.customNodes.filter((node) => node.name === step.target && node.status !== 'ready')) : [];
                if (failed.length) throw new Error(failed.map((node) => node.reason || node.status).join(' '));
                if (step.kind === 'comfyui' && (!verified.comfyui.installed || compareUmbraVersions(verified.comfyui.version || '0.0.0', verified.comfyui.minimumRequired || '0.0.0') < 0
                  || compareUmbraVersions(verified.comfyui.frontendVersion || '0.0.0', verified.comfyui.minimumFrontendRequired || '0.0.0') < 0)) throw new Error('The core/frontend bundle still needs repair.');
              } finally { state.lines.push(...job.lines.slice(-20)); }
            },
          }).then(() => { job.phase = 'complete'; job.step = 'Restart required; runtime preflight pending'; job.completedAt = new Date().toISOString(); })
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
        if (!['data-forge', 'data-forge-pixai', 'umbra-ui', 'requirements', 'support'].includes(kind)) {
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
          cancellable: kind !== 'data-forge' && kind !== 'data-forge-pixai',
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
        if (activeJob?.phase === 'running') {
          return json({ success: false, error: 'Wait for the model installer to finish.' }, 409);
        }
        try {
          launchUmbra(runtimeRoot);
          setTimeout(() => {
            server.stop(true);
            process.exit(0);
          }, 750);
          return json({ success: true });
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        }
      }
      if (url.pathname === '/api/close' && request.method === 'POST') {
        if (activeJob?.phase === 'running') {
          return json({ success: false, error: 'Wait for the model installer to finish.' }, 409);
        }
        setTimeout(() => {
          server.stop(true);
          process.exit(0);
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

  const setupUrl = `http://127.0.0.1:${server.port}/?token=${encodeURIComponent(token)}&tab=${readArg('--tab') === 'models' ? 'models' : 'general'}&pack=${encodeURIComponent(readArg('--pack', 'requirements'))}`;
  console.log(`[UmbraSetup] Ready: ${setupUrl}`);
  if (!hasArg('--no-open')) openBrowser(setupUrl);
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error('[UmbraSetup] Fatal:', error);
    process.exit(1);
  });
}
