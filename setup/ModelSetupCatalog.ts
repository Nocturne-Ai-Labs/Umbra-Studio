import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';

export type ModelSetupPack = 'requirements' | 'support';
export const MODEL_MANIFESTS: Record<ModelSetupPack, string> = {
  requirements: 'model-requirements-manifest.json',
  support: 'model-manifest.json',
};
type ModelFile = { destination: string; bytes: number; sha256: string };
type Manifest = {
  schemaVersion: number;
  profiles: Record<string, { label: string; description: string; noDownload?: boolean }>;
  models: { id: string; installPolicy: string; profiles: string[]; license?: string; files: ModelFile[] }[];
};

export function readModelSetupManifest(sourceRoot: string, pack: ModelSetupPack): Manifest {
  if (!Object.hasOwn(MODEL_MANIFESTS, pack)) throw new Error('Choose a supported model pack.');
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'defaults', 'UmbraUI', MODEL_MANIFESTS[pack]), 'utf8')) as Manifest;
  if (manifest.schemaVersion !== 1 || !manifest.profiles || !Array.isArray(manifest.models)) throw new Error('Invalid model manifest.');
  return manifest;
}

export function modelSetupSelection(sourceRoot: string, pack: ModelSetupPack, value: unknown) {
  const manifest = readModelSetupManifest(sourceRoot, pack);
  if (!Array.isArray(value) || value.length === 0 || value.length > Object.keys(manifest.profiles).length) throw new Error('Select at least one model family.');
  const profiles = [...new Set(value)];
  if (profiles.some(id => typeof id !== 'string' || !Object.hasOwn(manifest.profiles, id))) throw new Error('Unknown model family.');
  return (profiles as string[]).filter(id => !manifest.profiles[id].noDownload);
}

export async function modelSetupCatalog(sourceRoot: string, runtimeRoot: string) {
  const modelsRoot = join(runtimeRoot, 'Tools', 'ComfyUI', 'models');
  const packs = [];
  for (const pack of Object.keys(MODEL_MANIFESTS) as ModelSetupPack[]) {
    const manifest = readModelSetupManifest(sourceRoot, pack);
    const files = new Map<string, ModelFile & { present: boolean; profiles: string[]; licenses: string[] }>();
    for (const model of manifest.models.filter(item => item.installPolicy === 'automatic')) {
      for (const file of model.files) {
        const target = resolve(modelsRoot, file.destination);
        const rel = relative(modelsRoot, target);
        if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe model destination.');
        const key = file.destination.toLowerCase();
        let entry = files.get(key);
        if (!entry) {
          const info = await stat(target).catch(() => null);
          entry = { ...file, present: !!info?.isFile() && info.size === file.bytes, profiles: [], licenses: [] };
          files.set(key, entry);
        }
        entry.profiles = [...new Set([...entry.profiles, ...model.profiles])];
        if (model.license) entry.licenses = [...new Set([...entry.licenses, model.license])];
      }
    }
    packs.push({ id: pack, profiles: Object.entries(manifest.profiles).map(([id, profile]) => ({ id, ...profile })), files: [...files.values()] });
  }
  return { modelsRoot, packs };
}
