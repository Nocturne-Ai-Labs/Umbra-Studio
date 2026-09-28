import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function syncUmbraAnimaCustomNode(rootDir: string, nodesDir: string): void {
  const source = join(rootDir, 'backend', 'python', 'comfy_nodes', 'umbra_anima_cpu', '__init__.py');
  if (!existsSync(source)) {
    throw new Error('Bundled Umbra Anima custom node is missing. Repair the Umbra Studio installation.');
  }
  const targetDir = join(nodesDir, 'umbra_anima_cpu');
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, join(targetDir, '__init__.py'));
}
