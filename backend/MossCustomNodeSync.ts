import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function syncUmbraMossCustomNode(rootDir: string, nodesDir: string): void {
  const relative = join('backend', 'python', 'comfy_nodes', 'umbra_moss_prompt', '__init__.py');
  const source = [join(rootDir, relative), join(rootDir, 'resources', 'app', relative)].find(existsSync);
  if (!source) throw new Error('Bundled MOSS prompt enhancer is missing. Repair Umbra Studio through Setup.');
  const target = join(nodesDir, 'umbra_moss_prompt');
  mkdirSync(target, { recursive: true });
  copyFileSync(source, join(target, '__init__.py'));
}
