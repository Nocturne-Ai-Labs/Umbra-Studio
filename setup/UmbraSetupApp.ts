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

const DEFAULT_SETUP_PORT = 8215;
const SUPPORTED_LANGUAGES = new Set(['en', 'ja', 'zh-CN', 'ko', 'de']);
const MAX_LOG_LINES = 500;

type SetupJobKind = 'data-forge' | 'umbra-ui' | 'requirements' | 'support';
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

async function runScript(runtimeRoot: string, scriptPath: string, args: string[], job: SetupJobState, hfToken = '') {
  if (!existsSync(scriptPath)) throw new Error(`Required installer script is missing: ${scriptPath}`);
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      UMBRA_ROOT: runtimeRoot,
      ...(hfToken ? { HF_TOKEN: hfToken } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  jobChildren.set(job.id, child);
  const attachOutput = (stream: typeof child.stdout) => {
    let pending = '';
    const line = (value: string) => {
      if (value.startsWith('UMBRA_MODEL_PROGRESS|')) {
        try { job.progress = { ...job.progress, ...JSON.parse(value.slice('UMBRA_MODEL_PROGRESS|'.length)) }; } catch { /* Ignore incomplete worker messages. */ }
      } else appendOutput(job, hfToken ? value.split(hfToken).join('[redacted]') : value);
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
      if (url.pathname === '/api/cancel' && request.method === 'POST') {
        if (!activeJob || activeJob.phase !== 'running' || !activeJob.cancellable) return json({ success: false, error: 'No cancellable download is running.' }, 409);
        const child = jobChildren.get(activeJob.id);
        if (!child?.stdin?.writable) return json({ success: false, error: 'Installer is finishing. Try again shortly.' }, 409);
        activeJob.cancelRequested = true;
        child.stdin.write('q');
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
        if (activeJob?.phase === 'running') {
          return json({ success: false, error: 'A model installation is already running.' }, 409);
        }
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const kind = String(body.kind || '') as SetupJobKind;
        if (!['data-forge', 'umbra-ui', 'requirements', 'support'].includes(kind)) {
          return json({ success: false, error: 'Choose a supported model pack.' }, 400);
        }
        let profiles: string[] = ['core'];
        try {
          if (kind === 'requirements' || kind === 'support') profiles = modelSetupSelection(sourceRoot, kind as ModelSetupPack, body.profiles);
          if (body.hfToken !== undefined && (typeof body.hfToken !== 'string' || body.hfToken.length > 512 || /[\r\n]/.test(body.hfToken))) throw new Error('Invalid Hugging Face token.');
          if (kind === 'data-forge' && body.check) throw new Error('Data Forge verification runs during installation.');
        } catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 400); }
        const job: SetupJobState = {
          id: randomUUID(),
          kind,
          phase: 'running',
          step: 'Preparing installer',
          lines: [],
          startedAt: new Date().toISOString(),
          completedAt: null,
          error: '',
          cancellable: kind !== 'data-forge',
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
