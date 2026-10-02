import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { OfficialComfySession, assertOfficialComfySessionIsolation, probeOfficialComfyProcess, type OfficialComfySessionBinding } from '../backend/OfficialComfySession';

/** Read-only preparation. It never starts, stops, updates or submits to Comfy. */
export async function prepareOfficialComfySession(options: {
  baseUrl: string; toolRoot: string; runtimeRoot: string; sourceRoot: string; pid: number;
}, inspect = probeOfficialComfyProcess, request: typeof fetch = fetch, now = Date.now): Promise<OfficialComfySessionBinding> {
  assertOfficialComfySessionIsolation(options.runtimeRoot, options.sourceRoot, options.toolRoot);
  const url = new URL(options.baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use an explicit loopback HTTP origin.');
  const identity = inspect({ pid: options.pid, baseUrl: url.origin });
  const binding: OfficialComfySessionBinding = {
    baseUrl: url.origin, pid: options.pid, processStartedAt: identity.processStartedAt,
    toolRoot: resolve(options.toolRoot), inputRoot: join(resolve(options.toolRoot), 'input'), expiresAt: now() + 30 * 60 * 1000,
  };
  const session = new OfficialComfySession(binding, inspect, undefined, now);
  const target = session.target(url.origin);
  const response = await request(`${target.baseUrl}/queue`, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Comfy queue inspection failed (${response.status}).`);
  const queue = await response.json() as { queue_running?: unknown; queue_pending?: unknown };
  if (!Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending)
    || queue.queue_running.length || queue.queue_pending.length) throw new Error('Comfy must have no running or pending jobs before preparing this one-job session.');
  session.target(url.origin);
  return { ...session.binding };
}

function listenerPid(baseUrl: string): number {
  if (process.platform !== 'win32') throw new Error('Session preparation currently requires Windows.');
  const url = new URL(baseUrl), port = Number(url.port || 80);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid loopback Comfy endpoint.');
  const script = `$ErrorActionPreference='Stop'; $owners=@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique); if($owners.Count -ne 1){throw 'Exactly one listener process is required'}; [int]$owners[0]`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, encoding: 'utf8', timeout: 8000 });
  const pid = Number(result.stdout?.trim());
  if (result.error || result.status !== 0 || !Number.isSafeInteger(pid) || pid < 1) throw new Error('Could not inspect the Comfy listener. No runtime will be launched.');
  return pid;
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const option = (name: string) => { const index = args.indexOf(name); const value = index >= 0 ? args[index + 1] : ''; if (!value || value.startsWith('--')) throw new Error(`Required option: ${name}`); return value; };
    const baseUrl = option('--base-url'), toolRoot = option('--tool-root'), runtimeRoot = option('--runtime-root');
    const binding = await prepareOfficialComfySession({ baseUrl, toolRoot, runtimeRoot, sourceRoot: resolve(import.meta.dir, '..'), pid: listenerPid(baseUrl) });
    process.stdout.write(JSON.stringify(binding, null, 2) + '\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Session preparation failed.');
    process.exitCode = 1;
  }
}
