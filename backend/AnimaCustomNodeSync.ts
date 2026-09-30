import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function syncUmbraAnimaCustomNode(rootDir: string, nodesDir: string): void {
  const relativeSource = join('backend', 'python', 'comfy_nodes', 'umbra_anima_cpu', '__init__.py');
  const source = [
    join(rootDir, relativeSource),
    join(rootDir, 'resources', 'app', relativeSource),
  ].find(candidate => existsSync(candidate));
  if (!source) {
    throw new Error('Bundled Umbra Anima custom node is missing. Repair the Umbra Studio installation.');
  }
  const targetDir = join(nodesDir, 'umbra_anima_cpu');
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, join(targetDir, '__init__.py'));
}
