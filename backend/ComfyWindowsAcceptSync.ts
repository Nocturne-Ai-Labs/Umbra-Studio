import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function syncUmbraWindowsAcceptNode(rootDir: string, nodesDir: string): void {
  if (process.platform !== 'win32') return;
  const relative = join('backend', 'python', 'comfy_nodes', 'umbra_windows_accept');
  const source = [join(rootDir, relative), join(rootDir, 'resources', 'app', relative)]
    .find(path => existsSync(join(path, 'prestartup_script.py')));
  if (!source) throw new Error('Bundled Windows network compatibility is missing. Repair Umbra Studio through Setup.');
  const target = join(nodesDir, 'umbra_windows_accept');
  mkdirSync(target, { recursive: true });
  for (const file of ['__init__.py', 'prestartup_script.py']) {
    copyFileSync(join(source, file), join(target, file));
  }
}
