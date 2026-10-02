import { randomUUID } from 'node:crypto';
import { realpathSync, existsSync } from 'node:fs';
import { basename, join, resolve, relative, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface OfficialComfySessionBinding {
  baseUrl: string;
  pid: number;
  processStartedAt: string;
  toolRoot: string;
  inputRoot: string;
  expiresAt: number;
}
export interface OfficialComfyProcessProbe {
  pid: number;
  processStartedAt: string;
  commandLine: string;
  listenerPids: number[];
}
export interface OfficialComfySessionTarget {
  baseUrl: string;
  pid: number;
  toolRoot: string;
  inputRoot: string;
  sessionId: string;
}

function physical(value: string): string {
  if (!isAbsolute(value) || !existsSync(value)) throw new Error('Session roots must be existing absolute paths.');
  return realpathSync(value);
}
function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}
export function splitWindowsCommandLine(text: string): string[] {
  const args: string[] = []; let current = '', quoted = false, started = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      let end = i; while (text[end] === '\\') end++;
      const count = end - i;
      if (text[end] === '"') { current += '\\'.repeat(Math.floor(count / 2)); if (count % 2) current += '"'; else quoted = !quoted; i = end; }
      else { current += '\\'.repeat(count); i = end - 1; }
      started = true;
    } else if (c === '"') { quoted = !quoted; started = true; }
    else if (/\s/.test(c) && !quoted) { if (started) { args.push(current); current = ''; started = false; } }
    else { current += c; started = true; }
  }
  if (quoted) throw new Error('Comfy process command line contains an unmatched quote.');
  if (started) args.push(current);
  return args;
}

export function probeOfficialComfyProcess(binding: Pick<OfficialComfySessionBinding, 'pid' | 'baseUrl'>): OfficialComfyProcessProbe {
  if (process.platform !== 'win32') throw new Error('Explicit existing-runtime sessions currently require Windows process identity inspection.');
  const port = Number(new URL(binding.baseUrl).port || 80);
  if (!Number.isSafeInteger(binding.pid) || binding.pid < 1 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid session process or port.');
  const script = `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${binding.pid}'; if(!$p){throw 'Session process is no longer alive'}; $listeners=@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique); [pscustomobject]@{pid=[int]$p.ProcessId;processStartedAt=$p.CreationDate.ToUniversalTime().ToString('o');commandLine=[string]$p.CommandLine;listenerPids=$listeners}|ConvertTo-Json -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, encoding: 'utf8', timeout: 8000 });
  if (result.error || result.status !== 0) throw new Error('Existing Comfy session identity could not be verified. No replacement runtime will be used.');
  let value: OfficialComfyProcessProbe;
  try { value = JSON.parse(result.stdout); } catch { throw new Error('Invalid Comfy process inspection response.'); }
  if (!Array.isArray(value.listenerPids)) value.listenerPids = [value.listenerPids as unknown as number];
  return value;
}

export class OfficialComfySession {
  readonly binding: Readonly<OfficialComfySessionBinding>;
  private readonly id = randomUUID();
  private submitted = false;
  private readonly mainScript: string;
  constructor(binding: OfficialComfySessionBinding,
    private readonly probe = probeOfficialComfyProcess,
    private readonly canonical = physical,
    private readonly now = Date.now) {
    const url = new URL(binding.baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Official test sessions require an explicit loopback HTTP origin.');
    if (!Number.isSafeInteger(binding.pid) || binding.pid < 1 || !binding.processStartedAt
      || !Number.isFinite(Date.parse(binding.processStartedAt))) throw new Error('Session requires a live PID and exact process creation time.');
    if (!Number.isSafeInteger(binding.expiresAt) || binding.expiresAt <= now() || binding.expiresAt > now() + 60 * 60 * 1000) throw new Error('Session expiresAt must be within the next hour.');
    const toolRoot = canonical(binding.toolRoot), inputRoot = canonical(binding.inputRoot);
    if (!samePath(inputRoot, canonical(join(toolRoot, 'input')))) throw new Error('Session input root must be this Comfy installation input directory.');
    const rel = relative(toolRoot, inputRoot);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw new Error('Session input root escapes its tool root.');
    this.mainScript = canonical(join(toolRoot, 'main.py'));
    this.binding = Object.freeze({ ...binding, baseUrl: url.origin, toolRoot, inputRoot });
  }
  target(configuredBaseUrl: string): OfficialComfySessionTarget {
    const b = this.binding;
    if (this.now() >= b.expiresAt) throw new Error('Explicit Comfy test session expired. Existing queued work remains held.');
    if (new URL(configuredBaseUrl).origin !== b.baseUrl || new URL(configuredBaseUrl).pathname !== '/') throw new Error('Configured Comfy endpoint differs from the authorized session.');
    if (!samePath(this.canonical(b.toolRoot), b.toolRoot) || !samePath(this.canonical(b.inputRoot), b.inputRoot)) throw new Error('Session roots changed.');
    const state = this.probe(b);
    if (state.pid !== b.pid || state.processStartedAt !== b.processStartedAt
      || state.listenerPids.length !== 1 || state.listenerPids[0] !== b.pid) throw new Error('Comfy listener identity or process creation time changed.');
    const args = splitWindowsCommandLine(state.commandLine);
    const main = this.canonical(join(b.toolRoot, 'main.py'));
    if (!samePath(main, this.mainScript)) throw new Error('Session entry script path changed.');
    let scriptMatches = false;
    try { scriptMatches = /^python(?:\d+(?:\.\d+)*)?\.exe$/i.test(basename(args[0] || '')) && samePath(this.canonical(args[1]), main); } catch { /* Fail closed: only the actual Python entry script may match. */ }
    const portAt = args.indexOf('--port'), listenAt = args.indexOf('--listen');
    const url = new URL(b.baseUrl);
    if (!scriptMatches || portAt < 0 || Number(args[portAt + 1]) !== Number(url.port || 80)
      || listenAt < 0 || args[listenAt + 1]?.replace(/^\[|\]$/g, '') !== url.hostname.replace(/^\[|\]$/g, '')) throw new Error('Session process command line does not match its pinned Comfy root and endpoint.');
    if (this.now() >= b.expiresAt) throw new Error('Explicit Comfy test session expired during process verification.');
    return { baseUrl: b.baseUrl, pid: b.pid, toolRoot: b.toolRoot, inputRoot: b.inputRoot, sessionId: this.id };
  }
  claimSingleSubmission(sessionId: string): void {
    if (this.now() >= this.binding.expiresAt) throw new Error('Explicit Comfy test session expired before submission.');
    if (sessionId !== this.id || this.submitted) throw new Error('This one-job Comfy session has already submitted. No blind retry is permitted.');
    this.submitted = true;
  }
}

export function officialComfySessionMutationIssue(path: string, method: string, comfyProxyRequest = false): string | null {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  if (comfyProxyRequest || path.startsWith('/comfy/') || /^\/(?:embeddings|extensions|features|free|history|interrupt|models|object_info|prompt|queue|settings|system_stats|upload|userdata|view)(?:\/|$)/.test(path)
    || /^\/api\/umbra-ui\/(?:upscale|inpaint(?:\/(?:control-preprocess|layer-upscale|remove-background))?)$/.test(path)
    || path === '/api/umbrabridge/comfyui/interrupt' || path === '/api/umbrabridge/comfyui/queue/clear'
    || path === '/api/tools/actions' || /^\/api\/tools\/[^/]+\/version$/.test(path)) {
    return 'The temporary existing-runtime session permits one official Umbra queue submission and cancellation of its acknowledged job. Direct Comfy writes, broad queue controls and tool changes are held.';
  }
  return null;
}

export function officialComfySessionFromEnvironment(runtimeRoot: string, sourceRoot: string): OfficialComfySession | null {
  const text = process.env.UMBRA_OFFICIAL_COMFY_SESSION;
  if (!text) return null;
  const binding = JSON.parse(text) as OfficialComfySessionBinding;
  const session = new OfficialComfySession(binding);
  if (!process.env.UMBRA_ROOT) throw new Error('Existing-runtime sessions require an explicit task-owned UMBRA_ROOT.');
  assertOfficialComfySessionIsolation(runtimeRoot, sourceRoot, session.binding.toolRoot);
  return session;
}

export function assertOfficialComfySessionIsolation(runtimeRoot: string, sourceRoot: string, toolRoot: string): void {
  const isolatedRoot = physical(runtimeRoot);
  const overlap = (a: string, b: string) => {
    const inside = (base: string, child: string) => { const rel = relative(base, child); return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../')); };
    return inside(a, b) || inside(b, a);
  };
  if (overlap(isolatedRoot, physical(sourceRoot))
    || overlap(isolatedRoot, physical(resolve(toolRoot, '..', '..')))) throw new Error('Existing-runtime sessions require a separate task-owned UMBRA_ROOT with no overlap with source or personal installation data.');
}
