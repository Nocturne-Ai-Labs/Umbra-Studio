import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { compareUmbraVersions } from '../shared/appUpdate';
import { readModelSetupManifest } from '../setup/ModelSetupCatalog';

type NodeRequirement = { name: string; minimumCommit: string };
type FeatureRequirement = {
  id: string;
  label: string;
  optional?: boolean;
  activationFile: string;
  minimumComfyVersion: string;
  modelProfiles: string[];
  customNodes: NodeRequirement[];
};

export type ManagedNodeStatus = { name: string; minimumCommit: string; installedCommit: string; status: 'ready' | 'missing' | 'outdated' | 'unknown' };
export type ManagedFeatureStatus = {
  id: string;
  label: string;
  optional: boolean;
  active: boolean;
  minimumComfyVersion: string;
  modelProfiles: string[];
  missingModels: string[];
  totalModels: number;
  customNodes: ManagedNodeStatus[];
};

function safeChild(root: string, path: string): string {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe managed dependency path.');
  return target;
}

function readRequirements(sourceRoot: string): FeatureRequirement[] {
  const path = join(sourceRoot, 'defaults', 'UmbraUI', 'tool-requirements.json');
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { schemaVersion?: number; features?: FeatureRequirement[] };
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.features) || parsed.features.length > 24) {
    throw new Error('Invalid managed tool requirements manifest.');
  }
  for (const feature of parsed.features) {
    if (!/^[a-z0-9-]{1,64}$/.test(feature.id) || !feature.label || !/^\d+\.\d+\.\d+$/.test(feature.minimumComfyVersion)
      || !Array.isArray(feature.modelProfiles) || !Array.isArray(feature.customNodes)) {
      throw new Error('Invalid managed tool requirement.');
    }
    for (const node of feature.customNodes) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(node.name) || !/^[a-f0-9]{40}$/.test(node.minimumCommit)) {
        throw new Error('Invalid managed custom-node requirement.');
      }
    }
  }
  return parsed.features;
}

function readComfyVersion(comfyRoot: string): string {
  for (const [name, pattern] of [
    ['comfyui_version.py', /__version__\s*=\s*["'](\d+\.\d+\.\d+)["']/],
    ['pyproject.toml', /^version\s*=\s*["'](\d+\.\d+\.\d+)["']/m],
  ] as const) {
    try {
      const match = readFileSync(join(comfyRoot, name), 'utf8').match(pattern);
      if (match) return match[1];
    } catch { /* Try the other version file. */ }
  }
  return '';
}

function inspectNode(comfyRoot: string, requirement: NodeRequirement): ManagedNodeStatus {
  const nodePath = safeChild(join(comfyRoot, 'custom_nodes'), requirement.name);
  const base = { name: requirement.name, minimumCommit: requirement.minimumCommit };
  if (!existsSync(join(nodePath, '__init__.py'))) return { ...base, installedCommit: '', status: 'missing' };
  const topLevel = spawnSync('git', ['-C', nodePath, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  if (topLevel.status !== 0 || resolve(topLevel.stdout.trim()).toLowerCase() !== resolve(nodePath).toLowerCase()) {
    return { ...base, installedCommit: '', status: 'unknown' };
  }
  const head = spawnSync('git', ['-C', nodePath, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  const installedCommit = head.status === 0 ? head.stdout.trim() : '';
  if (!/^[a-f0-9]{40}$/.test(installedCommit)) return { ...base, installedCommit: '', status: 'unknown' };
  if (installedCommit === requirement.minimumCommit) return { ...base, installedCommit, status: 'ready' };
  const ancestor = spawnSync('git', ['-C', nodePath, 'merge-base', '--is-ancestor', requirement.minimumCommit, 'HEAD'], {
    encoding: 'utf8', windowsHide: true, timeout: 5_000,
  });
  return { ...base, installedCommit, status: ancestor.status === 0 ? 'ready' : 'outdated' };
}

export function inspectManagedDependencies(sourceRoot: string, runtimeRoot: string) {
  const comfyRoot = join(runtimeRoot, 'Tools', 'ComfyUI');
  const modelsRoot = join(comfyRoot, 'models');
  const installedVersion = readComfyVersion(comfyRoot);
  const requirements = readRequirements(sourceRoot);
  const modelManifest = requirements.length ? readModelSetupManifest(sourceRoot, 'requirements') : { models: [] };
  const features: ManagedFeatureStatus[] = requirements.map((feature) => {
    const activationPath = safeChild(modelsRoot, feature.activationFile);
    const files = new Map<string, { destination: string; bytes: number }>();
    for (const model of modelManifest.models) {
      if (model.installPolicy !== 'automatic' || !model.profiles.some((profile) => feature.modelProfiles.includes(profile))) continue;
      for (const file of model.files) files.set(file.destination.toLowerCase(), file);
    }
    const missingModels = [...files.values()].filter((file) => {
      const target = safeChild(modelsRoot, file.destination);
      try {
        const info = statSync(target);
        return !info.isFile() || info.size !== file.bytes;
      } catch { return true; }
    }).map((file) => file.destination);
    return {
      id: feature.id,
      label: feature.label,
      optional: feature.optional === true,
      active: existsSync(activationPath),
      minimumComfyVersion: feature.minimumComfyVersion,
      modelProfiles: feature.modelProfiles,
      missingModels,
      totalModels: files.size,
      customNodes: feature.customNodes.map((node) => inspectNode(comfyRoot, node)),
    };
  });
  return {
    comfyui: {
      installed: Boolean(installedVersion),
      version: installedVersion,
      minimumRequired: features.filter((feature) => feature.active && !feature.optional).map((feature) => feature.minimumComfyVersion)
        .sort(compareUmbraVersions).at(-1) || '',
    },
    features,
  };
}
