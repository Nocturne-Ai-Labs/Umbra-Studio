import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type UmbraWindowsLauncherFlavor = 'exe' | 'bat';

export type UmbraWindowsLauncher = {
  flavor: UmbraWindowsLauncherFlavor;
  launcherPath: string;
  command: string;
  args: string[];
};

export function resolveUmbraWindowsLauncher(runtimeRoot: string): UmbraWindowsLauncher | null {
  const root = resolve(runtimeRoot);
  const batchPath = join(root, 'UmbraStudio.bat');
  if (existsSync(batchPath)) {
    return {
      flavor: 'bat',
      launcherPath: batchPath,
      command: 'cmd.exe',
      args: ['/d', '/c', 'call', 'UmbraStudio.bat'],
    };
  }

  // Keep recognizing older portable builds so users can migrate their User
  // and Tools folders into the BAT-only layout.
  const executablePath = join(root, 'UmbraStudio.exe');
  if (existsSync(executablePath)) {
    return {
      flavor: 'exe',
      launcherPath: executablePath,
      command: executablePath,
      args: [],
    };
  }

  return null;
}

export function detectUmbraWindowsLauncherFlavor(runtimeRoot: string): UmbraWindowsLauncherFlavor | null {
  return resolveUmbraWindowsLauncher(runtimeRoot)?.flavor || null;
}
