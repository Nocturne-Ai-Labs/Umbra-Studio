import { stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { readModelSetupManifest } from '../setup/ModelSetupCatalog';

export type ManagedVideoFamily = 'minimax_h3' | 'ltx25' | 'ltx23';

export async function inspectManagedVideoModels(
  sourceRoot: string,
  runtimeRoot: string,
  family: ManagedVideoFamily,
  referenceMode = false,
  promptForge = false,
) {
  const profiles = family === 'minimax_h3'
    ? ['minimax-h3', ...(referenceMode ? ['minimax-h3-reference'] : []),
      ...(promptForge ? ['minimax-h3-autoprompter'] : [])]
    : [family === 'ltx23' ? 'ltx-2.3' : 'ltx-2.5'];
  const manifest = readModelSetupManifest(sourceRoot, 'requirements');
  const modelsRoot = resolve(runtimeRoot, 'Tools', 'ComfyUI', 'models');
  const files = new Map<string, { destination: string; bytes: number }>();
  for (const model of manifest.models) {
    if (model.installPolicy !== 'automatic' || !model.profiles.some((profile) => profiles.includes(profile))) continue;
    for (const file of model.files) {
      const target = resolve(modelsRoot, file.destination);
      const rel = relative(modelsRoot, target);
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe video model destination.');
      files.set(file.destination.toLowerCase(), { destination: file.destination, bytes: file.bytes });
    }
  }
  const missing: string[] = [];
  for (const file of files.values()) {
    const info = await stat(join(modelsRoot, file.destination)).catch(() => null);
    if (!info?.isFile() || info.size !== file.bytes) missing.push(file.destination);
  }
  return { family, profiles, totalFiles: files.size, missing };
}
