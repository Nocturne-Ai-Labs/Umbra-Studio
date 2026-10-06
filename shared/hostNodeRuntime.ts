import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join, win32, posix } from 'node:path';

export type HostNodeRuntime = {
  available: boolean; version: string; major: number; executable: string; npmCli: string; env: NodeJS.ProcessEnv;
};
type Probe = (command: string, args: string[], env: NodeJS.ProcessEnv) => { status: number | null; stdout?: string; stderr?: string };

export function currentWindowsPath(env: NodeJS.ProcessEnv = process.env): string {
  const powershell = join(env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    "[Console]::Write([Environment]::ExpandEnvironmentVariables([Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')))"],
  { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  return result.status === 0 ? result.stdout.trim() : '';
}

export function resolveHostNodeRuntime(options: {
  env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; refreshedPath?: () => string;
  probe?: Probe; fileExists?: (path: string) => boolean; canonical?: (path: string) => string;
} = {}): HostNodeRuntime {
  const env = { ...(options.env || process.env) }, platform = options.platform || process.platform;
  const { dirname, join, resolve } = platform === 'win32' ? win32 : posix;
  const separator = platform === 'win32' ? ';' : ':';
  const inherited = String(env.PATH || env.Path || '');
  const refresh = platform === 'win32' ? (options.refreshedPath || (() => currentWindowsPath(env)))() : '';
  const directories = [...new Set([...inherited.split(separator), ...refresh.split(separator)]
    .map(path => path.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean))];
  const fileExists = options.fileExists || existsSync;
  const canonical = options.canonical || realpathSync;
  const probe: Probe = options.probe || ((command, args, childEnv) => spawnSync(command, args,
    { env: childEnv, encoding: 'utf8', windowsHide: true, timeout: 5000, shell: false }));
  let unsupported = '';
  for (const directory of directories) {
    const executable = join(directory, platform === 'win32' ? 'node.exe' : 'node');
    if (!fileExists(executable)) continue;
    // The npm CLI is bound to the same installation, instead of invoking a .cmd through a shell.
    const nodeRoot = dirname(canonical(executable));
    const candidates = platform === 'win32' ? [join(nodeRoot, 'node_modules/npm/bin/npm-cli.js')]
      : [join(nodeRoot, '../lib/node_modules/npm/bin/npm-cli.js'), join(nodeRoot, '../share/nodejs/npm/bin/npm-cli.js')];
    const npmCli = candidates.find(fileExists);
    if (!npmCli) continue;
    const path = [dirname(executable), ...directories].join(separator);
    const childEnv = { ...env, PATH: path, ...(platform === 'win32' ? { Path: path } : {}) };
    const node = probe(executable, ['--version'], childEnv);
    const version = String(node.stdout || '').trim();
    const major = Number(version.match(/^v?(\d+)\./)?.[1] || 0);
    if (node.status !== 0 || major < 20) { unsupported ||= version; continue; }
    const npm = probe(executable, [npmCli, '--version'], childEnv);
    if (npm.status !== 0 || !/^\d+\./.test(String(npm.stdout || '').trim())) continue;
    return { available: true, version, major, executable: resolve(executable), npmCli: resolve(npmCli), env: childEnv };
  }
  return { available: false, version: unsupported, major: Number(unsupported.match(/^v?(\d+)\./)?.[1] || 0), executable: '', npmCli: '', env };
}
