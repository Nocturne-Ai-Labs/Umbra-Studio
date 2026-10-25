import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const quote = (value: string) => "'" + value.replace(/'/g, "''") + "'";

export function visibleUmbraLaunchScript(runtimeRoot: string, command: string, args: string[]): string {
  const argument = (value: string) => /[\s"]/.test(value)
    ? '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"' : value;
  const commandLine = [command, ...args].map(argument).join(' ');
  return [
    "$ErrorActionPreference = 'Stop'",
    // An explicit console host avoids inheriting Setup's hidden console.
    "$process = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\conhost.exe')"
      + ' -ArgumentList ' + quote(commandLine)
      + ' -WorkingDirectory ' + quote(resolve(runtimeRoot)) + ' -WindowStyle Normal -PassThru',
    '[Console]::Out.Write($process.Id)',
  ].join('; ');
}

/** The helper stays hidden; the explicitly requested Studio terminal is visible. */
export function launchVisibleWindowsUmbra(options: { runtimeRoot: string; command: string; args: string[]; port: number; host?: string; relaunch?: boolean }) {
  const runtimeRoot = resolve(options.runtimeRoot);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    visibleUmbraLaunchScript(runtimeRoot, options.command, options.args)], {
    cwd: runtimeRoot, encoding: 'utf8', windowsHide: true, timeout: 15_000,
    env: { ...process.env, UMBRA_ROOT: runtimeRoot, UMBRA_PORT: String(options.port),
      UMBRA_HOST: options.host || '127.0.0.1', UMBRA_TERMINAL_MODE: 'visible',
      UMBRA_TERMINAL_CHILD: '1', UMBRA_LAUNCHER_IN_TERMINAL: '1', UMBRA_PAUSE_ON_EXIT: '0',
      ...(options.relaunch ? { UMBRA_UPDATER_RELAUNCH: '1' } : {}) },
  });
  const pid = Number(String(result.stdout || '').trim());
  if (result.status !== 0 || !Number.isInteger(pid) || pid <= 0) {
    throw new Error('Umbra Studio terminal could not be opened. ' + String(result.stderr || result.error?.message || '').trim());
  }
  return { pid };
}
