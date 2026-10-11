import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export type UmbraProcessIdentity = { pid: number; parentPid: number; started: string; commandLine: string };

export function isUmbraProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0);
    if (process.platform === 'linux' && readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1)?.startsWith('Z ')) return false;
    return true;
  } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' && (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
}

/** OS start identity prevents a saved PID from authorizing termination after reuse. */
export function readUmbraProcessIdentity(pid: number): UmbraProcessIdentity | null {
  if (!isUmbraProcessAlive(pid)) return null;
  try {
    if (process.platform === 'win32') {
      const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){[pscustomobject]@{pid=[int]$p.ProcessId;parentPid=[int]$p.ParentProcessId;started=$p.CreationDate.ToUniversalTime().ToString('o');commandLine=[string]$p.CommandLine}|ConvertTo-Json -Compress}`;
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (result.status !== 0) return null;
      const identity = JSON.parse(result.stdout.trim()) as UmbraProcessIdentity;
      return identity.pid === pid && identity.started && identity.commandLine ? identity : null;
    }
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (fields[0] === 'Z') return null;
    return { pid, parentPid: Number(fields[1]), started: fields[19], commandLine: readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ') };
  } catch { return null; }
}

export function processIdentityMatches(identity: UmbraProcessIdentity): boolean {
  const current = readUmbraProcessIdentity(identity.pid);
  if (!current) {
    if (isUmbraProcessAlive(identity.pid)) throw new Error(`Process ${identity.pid} identity could not be verified. No application files were replaced.`);
    return false;
  }
  // exec changes argv without ending the process or releasing inherited files.
  // Ownership is established at admission; OS start identity tracks its lifetime.
  return current.started === identity.started;
}

export function processIdentityBelongsToRoot(identity: UmbraProcessIdentity, runtimeRoot: string): boolean {
  const normalize = (value: string) => { const path = value.replaceAll('\\', '/'); return process.platform === 'win32' ? path.toLowerCase() : path; };
  const command = normalize(identity.commandLine);
  const root = normalize(resolve(runtimeRoot));
  const at = command.indexOf(root);
  return at >= 0 && ['/', '"', "'", ' ', ''].includes(command.charAt(at + root.length));
}

/** Capture descendants of managed tools only; the server can also own Setup. */
export function readManagedProcessTreeIdentities(rootPids: number[]): UmbraProcessIdentity[] {
  if (!rootPids.length) return [];
  let all: UmbraProcessIdentity[];
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "@(Get-CimInstance Win32_Process | ForEach-Object {[pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;started=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=[string]$_.CommandLine}})|ConvertTo-Json -Compress"], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (result.status !== 0) throw new Error('Process tree could not be inspected.');
      all = JSON.parse(result.stdout);
    } else {
      all = readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(name => readUmbraProcessIdentity(Number(name))).filter((identity): identity is UmbraProcessIdentity => !!identity);
    }
    const owned = new Set(rootPids);
    let count = 0;
    while (count !== owned.size) {
      count = owned.size;
      for (const identity of all) if (owned.has(identity.parentPid)) owned.add(identity.pid);
    }
    return all.filter(identity => owned.has(identity.pid) && identity.started && identity.commandLine);
  } catch { return rootPids.map(readUmbraProcessIdentity).filter((identity): identity is UmbraProcessIdentity => !!identity); }
}
