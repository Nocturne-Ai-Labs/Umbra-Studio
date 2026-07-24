import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { platform } from 'node:os';
import { buildListenerOrigin } from '../backend/remoteNetworkAddress';

type LauncherOptions = {
  noOpen: boolean;
  port: number;
  portExplicit: boolean;
  rootOverride: string;
  sourceRootOverride: string;
};

type RuntimeLayout = {
  runtimeRoot: string;
  sourceRoot: string;
};

type ServerEntrypoint = {
  path: string;
  label: string;
};

const DEFAULT_PORT = 8212;
const ALREADY_RUNNING_TIMEOUT_MS = 5_000;
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 350;
const TERMINAL_MODE_ENV = 'visible';
const TERMINAL_CHILD_ENV = 'UMBRA_TERMINAL_CHILD';
const LAUNCHER_IN_TERMINAL_ENV = 'UMBRA_LAUNCHER_IN_TERMINAL';
const PAUSE_ON_EXIT_ENV = 'UMBRA_PAUSE_ON_EXIT';
const ALREADY_RUNNING_EXIT_CODE_ENV = 'UMBRA_ALREADY_RUNNING_EXIT_CODE';

type ReadyCheckResult = {
  ready: boolean;
  runtimeRoot?: string;
};

function parseArgs(argv: string[]): LauncherOptions {
  const options: LauncherOptions = {
    noOpen: false,
    port: DEFAULT_PORT,
    portExplicit: false,
    rootOverride: '',
    sourceRootOverride: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] || '';
    if (arg === '--no-open') {
      options.noOpen = true;
    } else if (arg === '--port') {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next)) options.port = Math.max(1, Math.min(65535, Math.floor(next)));
      options.portExplicit = true;
      index += 1;
    } else if (arg.startsWith('--port=')) {
      const next = Number(arg.slice('--port='.length));
      if (Number.isFinite(next)) options.port = Math.max(1, Math.min(65535, Math.floor(next)));
      options.portExplicit = true;
    } else if (arg === '--root') {
      options.rootOverride = String(argv[index + 1] || '').trim();
      index += 1;
    } else if (arg.startsWith('--root=')) {
      options.rootOverride = arg.slice('--root='.length).trim();
    } else if (arg === '--source-root') {
      options.sourceRootOverride = String(argv[index + 1] || '').trim();
      index += 1;
    } else if (arg.startsWith('--source-root=')) {
      options.sourceRootOverride = arg.slice('--source-root='.length).trim();
    }
  }

  return options;
}

function hasServerEntrypoint(root: string): boolean {
  return existsSync(join(root, 'UmbraServer.js')) || existsSync(join(root, 'UmbraServer.ts'));
}

function findServerEntrypoint(root: string): ServerEntrypoint | null {
  const compiledServer = join(root, 'UmbraServer.js');
  if (existsSync(compiledServer)) {
    return { path: compiledServer, label: 'UmbraServer.js' };
  }

  const sourceServer = join(root, 'UmbraServer.ts');
  if (existsSync(sourceServer)) {
    return { path: sourceServer, label: 'UmbraServer.ts' };
  }

  return null;
}

function isCompiledUmbraExecutable(): boolean {
  if (platform() !== 'win32') return false;
  const execName = process.execPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
  return execName === 'umbrastudio.exe';
}

function findRuntimeLayout(options: LauncherOptions): RuntimeLayout {
  const executableRoot = dirname(process.execPath);
  const explicitRuntimeRoot = resolve(options.rootOverride || process.env.UMBRA_ROOT || process.cwd());
  const explicitSourceRoot = resolve(options.sourceRootOverride || process.env.UMBRA_SOURCE_ROOT || '');
  if (explicitSourceRoot && hasServerEntrypoint(explicitSourceRoot)) {
    return { runtimeRoot: explicitRuntimeRoot, sourceRoot: explicitSourceRoot };
  }

  const candidates = (
    isCompiledUmbraExecutable()
      ? [
          options.rootOverride,
          process.env.UMBRA_ROOT,
          executableRoot,
          process.cwd(),
          resolve(import.meta.dir, '..'),
        ]
      : [
          options.rootOverride,
          process.env.UMBRA_ROOT,
          process.cwd(),
          executableRoot,
          resolve(import.meta.dir, '..'),
        ]
  ).filter((entry): entry is string => Boolean(entry && entry.trim()));

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (hasServerEntrypoint(resolved)) {
      return { runtimeRoot: resolved, sourceRoot: resolved };
    }
    const resourceApp = join(resolved, 'resources', 'app');
    if (hasServerEntrypoint(resourceApp)) {
      return { runtimeRoot: resolved, sourceRoot: resourceApp };
    }
  }

  const fallbackRoot = resolve(options.rootOverride || process.cwd());
  return { runtimeRoot: fallbackRoot, sourceRoot: fallbackRoot };
}

function isPortableRuntime(runtimeRoot: string, sourceRoot: string): boolean {
  if (isCompiledUmbraExecutable()) return true;
  if (existsSync(join(runtimeRoot, 'portable-mode'))) return true;
  const relativeSource = relative(resolve(runtimeRoot), resolve(sourceRoot)).replace(/\\/g, '/');
  return relativeSource === 'resources/app' || relativeSource.startsWith('resources/app/');
}

function clampPort(value: unknown, fallback: number): number {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(65535, numeric));
}

function normalizeBindHost(value: unknown, fallback = '0.0.0.0'): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw === 'localhost') return '127.0.0.1';
  if (raw === '127.0.0.1' || raw === '0.0.0.0' || raw === '::' || raw === '::1') return raw;
  if (/^[a-z0-9.-]+$/i.test(raw) || /^[0-9a-f:.]+$/i.test(raw)) return raw;
  return fallback;
}

function loadRemoteLauncherSettings(runtimeRoot: string): { bindHost?: string; port?: number } {
  try {
    const settingsPath = join(runtimeRoot, 'User', 'Config', 'UmbraRemote', 'settings.json');
    if (!existsSync(settingsPath)) return {};
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    return {
      bindHost: normalizeBindHost(parsed.bindHost, ''),
      port: parsed.port ? clampPort(parsed.port, DEFAULT_PORT) : undefined,
    };
  } catch {
    return {};
  }
}

function findBunBinary(runtimeRoot: string): string | null {
  const bunName = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const candidates = [
    process.env.UMBRA_BUN,
    join(runtimeRoot, 'Runtime', 'Bun', process.platform, bunName),
    join(runtimeRoot, 'resources', 'bin', process.platform, bunName),
  ].filter((entry): entry is string => Boolean(entry && entry.trim()));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  if (process.env.UMBRA_ALLOW_SYSTEM_BUN === '1') {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(finder, ['bun'], { encoding: 'utf-8', shell: process.platform === 'win32' });
    const first = result.stdout?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (result.status === 0 && first) return first;
  }

  return null;
}

function todayStamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function ensureLogStream(runtimeRoot: string) {
  const logDir = join(runtimeRoot, 'User', 'Logs');
  mkdirSync(logDir, { recursive: true });
  return createWriteStream(join(logDir, `web-launcher-${todayStamp()}.log`), { flags: 'a' });
}

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function writeBanner() {
  writeLine('');
  writeLine('============================================================');
  writeLine(' Umbra Studio Webapp Terminal');
  writeLine(' Backend, Gallery Bridge, and ComfyUI logs appear here.');
  writeLine(' Close this window or press Ctrl+C to stop Umbra.');
  writeLine('============================================================');
  writeLine('');
}

function shouldRelaunchInVisibleTerminal(): boolean {
  if (platform() !== 'win32') return false;
  if (process.env[TERMINAL_CHILD_ENV] === '1') return false;
  if (process.env[LAUNCHER_IN_TERMINAL_ENV] === '1') return false;
  return isCompiledUmbraExecutable();
}

function relaunchInVisibleTerminal() {
  const args = Bun.argv.slice(2);
  const executableRoot = dirname(process.execPath);
  const executableName = process.execPath.slice(executableRoot.length + 1);
  spawn('cmd.exe', ['/d', '/k', executableName, ...args], {
    cwd: executableRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      [TERMINAL_CHILD_ENV]: '1',
      [LAUNCHER_IN_TERMINAL_ENV]: '1',
      [PAUSE_ON_EXIT_ENV]: '1',
      UMBRA_TERMINAL_MODE: TERMINAL_MODE_ENV,
    },
  }).unref();
}

async function pauseBeforeExitIfRequested() {
  if (process.env[PAUSE_ON_EXIT_ENV] !== '1') return;
  if (platform() !== 'win32') return;
  writeLine('');
  writeLine('[UmbraWebLauncher] Press Enter to close this terminal.');
  await new Promise<void>((resolvePause) => {
    try {
      process.stdin.resume();
      process.stdin.once('data', () => resolvePause());
    } catch {
      resolvePause();
    }
  });
}

async function exitLauncher(code: number): Promise<void> {
  await pauseBeforeExitIfRequested();
  process.exit(code);
}

function configuredAlreadyRunningExitCode(): number {
  const rawCode = Number(process.env[ALREADY_RUNNING_EXIT_CODE_ENV]);
  if (!Number.isFinite(rawCode)) return 0;
  return Math.max(0, Math.min(255, Math.floor(rawCode)));
}

function normalizeRuntimeRootForCompare(value: string): string {
  return resolve(String(value || '').trim()).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

async function checkReady(localOrigin: string): Promise<ReadyCheckResult> {
  const response = await fetch(`${localOrigin}/api/healthz/ready`, { cache: 'no-store' });
  if (!response.ok) return { ready: false };
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  return {
    ready: true,
    runtimeRoot: String(body.runtimeRoot || '').trim(),
  };
}

async function waitForReady(localOrigin: string, timeoutMs: number): Promise<ReadyCheckResult> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await checkReady(localOrigin);
      if (result.ready) return result;
    } catch {
      // Server is still starting.
    }
    await Bun.sleep(READY_POLL_MS);
  }
  return { ready: false };
}

async function canBindPort(portNumber: number, host: string): Promise<boolean> {
  return await new Promise<boolean>((resolveProbe) => {
    const probe = createServer();
    let settled = false;

    const settle = (available: boolean) => {
      if (settled) return;
      settled = true;
      resolveProbe(available);
    };

    probe.unref();
    probe.once('error', () => settle(false));
    probe.listen({ port: portNumber, host, exclusive: true }, () => {
      probe.close(() => settle(true));
    });
  });
}

function openBrowser(url: string) {
  if (platform() === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (platform() === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function wireShutdown(child: ChildProcessWithoutNullStreams) {
  let shuttingDown = false;
  const stop = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      child.kill();
    } catch {
      // Best-effort shutdown only.
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function main() {
  if (shouldRelaunchInVisibleTerminal()) {
    relaunchInVisibleTerminal();
    return;
  }

  const launchStartedAt = Date.now();
  const options = parseArgs(Bun.argv.slice(2));
  const { runtimeRoot, sourceRoot } = findRuntimeLayout(options);
  const serverEntrypoint = findServerEntrypoint(sourceRoot);
  const bunPath = findBunBinary(runtimeRoot);
  const launcherDevMode = !isPortableRuntime(runtimeRoot, sourceRoot) && process.env.UMBRA_DEV_MODE !== '0';
  const remoteSettings = loadRemoteLauncherSettings(runtimeRoot);
  const effectivePort = options.portExplicit
    ? options.port
    : clampPort(process.env.UMBRA_PORT || remoteSettings.port || options.port, options.port);
  const bindHost = normalizeBindHost(
    process.env.UMBRA_HOST || process.env.HOST || remoteSettings.bindHost || (launcherDevMode ? '0.0.0.0' : '127.0.0.1'),
  );
  const localOrigin = buildListenerOrigin(bindHost, effectivePort);
  const appUrl = `${localOrigin}/`;

  if (!serverEntrypoint) {
    console.error(`[UmbraWebLauncher] UmbraServer.js or UmbraServer.ts not found under ${sourceRoot}`);
    await exitLauncher(1);
    return;
  }
  if (!bunPath) {
    console.error('[UmbraWebLauncher] Bundled Bun runtime not found. Run webapp:prepare-runtime before packaging.');
    await exitLauncher(1);
    return;
  }

  const alreadyRunning = await waitForReady(localOrigin, ALREADY_RUNNING_TIMEOUT_MS);
  if (alreadyRunning.ready) {
    const runningRoot = normalizeRuntimeRootForCompare(alreadyRunning.runtimeRoot || '');
    const expectedRoot = normalizeRuntimeRootForCompare(runtimeRoot);
    if (runningRoot && runningRoot !== expectedRoot) {
      writeBanner();
      writeLine(`[UmbraWebLauncher] Port ${options.port} is already serving a different Umbra runtime.`);
      writeLine(`[UmbraWebLauncher] Running root: ${alreadyRunning.runtimeRoot}`);
      writeLine(`[UmbraWebLauncher] Expected root: ${runtimeRoot}`);
      writeLine('[UmbraWebLauncher] Stop the other Umbra server, then launch this build again.');
      await exitLauncher(1);
      return;
    }
    writeBanner();
    writeLine(`[UmbraWebLauncher] Umbra is already running at ${appUrl} (checked in ${Date.now() - launchStartedAt}ms)`);
    if (!options.noOpen) openBrowser(appUrl);
    process.exit(configuredAlreadyRunningExitCode());
  }

  if (!(await canBindPort(effectivePort, bindHost))) {
    writeBanner();
    writeLine(`[UmbraWebLauncher] Configured port ${effectivePort} is occupied by another or unresponsive process.`);
    writeLine('[UmbraWebLauncher] Umbra will not change ports automatically because Remote and proxy routes depend on this port.');
    writeLine('[UmbraWebLauncher] Stop the process using the configured port, then launch Umbra again.');
    await exitLauncher(1);
    return;
  }

  const logStream = ensureLogStream(runtimeRoot);
  const cacheRoot = join(runtimeRoot, 'Runtime', 'Cache');
  const thumbnailCacheDir = join(cacheRoot, 'thumbnails');
  mkdirSync(thumbnailCacheDir, { recursive: true });

  writeBanner();
  writeLine(`[UmbraWebLauncher] Starting Umbra Studio webapp at ${appUrl}`);
  writeLine(`[UmbraWebLauncher] Runtime root: ${runtimeRoot}`);
  writeLine(`[UmbraWebLauncher] Source root: ${sourceRoot}`);
  writeLine(`[UmbraWebLauncher] Server entry: ${serverEntrypoint.label}`);
  writeLine(`[UmbraWebLauncher] Bind host: ${bindHost}`);
  writeLine(`[UmbraWebLauncher] Port: ${effectivePort}`);

  const child = spawn(bunPath, [serverEntrypoint.path], {
    cwd: sourceRoot,
    env: {
      ...process.env,
      UMBRA_ROOT: runtimeRoot,
      UMBRA_PORT: String(effectivePort),
      UMBRA_HOST: bindHost,
      UMBRA_CACHE_DIR: cacheRoot,
      UMBRA_THUMBNAIL_CACHE_DIR: thumbnailCacheDir,
      UMBRA_WEB_LAUNCHER: '1',
      UMBRA_TERMINAL_MODE: TERMINAL_MODE_ENV,
      UMBRA_DEV_MODE: launcherDevMode ? '1' : '0',
      NODE_ENV: launcherDevMode ? (process.env.NODE_ENV || 'development') : 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  wireShutdown(child);

  child.stdout.on('data', (chunk) => {
    logStream.write(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    logStream.write(chunk);
    process.stderr.write(chunk);
  });
  child.on('exit', (code) => {
    logStream.end();
    void (async () => {
      writeLine('');
      writeLine(`[UmbraWebLauncher] Umbra server exited with code ${code ?? 0}.`);
      await exitLauncher(code ?? 0);
    })();
  });

  const ready = await waitForReady(localOrigin, READY_TIMEOUT_MS);
  if (ready.ready) {
    writeLine(`[UmbraWebLauncher] Ready in ${Date.now() - launchStartedAt}ms: ${appUrl}`);
    if (!options.noOpen) openBrowser(appUrl);
  } else {
    console.warn(`[UmbraWebLauncher] Server is still starting after ${Date.now() - launchStartedAt}ms. Open ${appUrl} when ready.`);
  }
}

void main().catch(async (error) => {
  console.error('[UmbraWebLauncher] Fatal launcher error:', error);
  await exitLauncher(1);
});
