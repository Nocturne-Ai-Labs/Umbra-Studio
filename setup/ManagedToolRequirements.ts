import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export type ManagedFrontendAsset = { path: string; registration: string };
export type ManagedRuntimePackage = {
  module: string; distribution: string; reason: string; optional?: boolean;
  requiredWhen?: { workflowId: string; className: string; defaultEnabled: boolean; controllerNodeId: number; controllerWidget: string };
};
export type ManagedNodeRequirement = {
  name: string;
  minimumCommit: string;
  requiredPatch?: string;
  requiredClasses?: string[];
  requiredFrontendClasses?: string[];
  webDirectory?: string;
  frontendAssets?: ManagedFrontendAsset[];
};
export type ManagedFeatureRequirement = {
  id: string;
  label: string;
  optional?: boolean;
  activationFile?: string;
  minimumComfyVersion: string;
  minimumFrontendVersion?: string;
  modelProfiles: string[];
  workflowIds?: string[];
  requiredBuiltinClasses?: string[];
  runtimePackages?: ManagedRuntimePackage[];
  customNodes: ManagedNodeRequirement[];
};

export function managedChildPath(root: string, child: string): string {
  const target = resolve(root, child);
  const inside = (base: string, path: string) => {
    const rel = relative(base, path);
    return Boolean(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel);
  };
  if (!inside(resolve(root), target)) throw new Error('Unsafe managed dependency path.');
  if (existsSync(root)) {
    let existing = target;
    while (!existsSync(existing) && existing !== resolve(root)) existing = dirname(existing);
    if (existing !== resolve(root) && !inside(realpathSync(root), realpathSync(existing))) {
      throw new Error('Managed dependency path resolves outside its installation.');
    }
  }
  return target;
}

function stringList(value: unknown, maximum = 256): value is string[] {
  return Array.isArray(value) && value.length <= maximum
    && value.every((entry) => typeof entry === 'string' && /^[^\u0000-\u001f]{1,160}$/.test(entry));
}

function relativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 240 && /^[A-Za-z0-9_./-]+$/.test(value)
    && !isAbsolute(value) && !value.split('/').includes('..') && value !== '.' && value !== './';
}

export function readManagedToolRequirements(sourceRoot: string): ManagedFeatureRequirement[] {
  const path = join(sourceRoot, 'defaults', 'UmbraUI', 'tool-requirements.json');
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { schemaVersion?: number; features?: ManagedFeatureRequirement[] };
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.features) || parsed.features.length > 64) {
    throw new Error('Invalid managed tool requirements manifest.');
  }
  for (const feature of parsed.features) {
    if (!feature || !/^[a-z0-9-]{1,64}$/.test(feature.id) || typeof feature.label !== 'string' || !feature.label
      || !/^\d+\.\d+\.\d+$/.test(feature.minimumComfyVersion)
      || (feature.minimumFrontendVersion !== undefined && !/^\d+\.\d+\.\d+$/.test(feature.minimumFrontendVersion))
      || (feature.activationFile !== undefined && !relativePath(feature.activationFile))
      || (!feature.activationFile && !feature.workflowIds?.length)
      || !stringList(feature.modelProfiles, 64) || !Array.isArray(feature.customNodes) || feature.customNodes.length > 64
      || (feature.workflowIds !== undefined && !stringList(feature.workflowIds, 128))
      || (feature.requiredBuiltinClasses !== undefined && !stringList(feature.requiredBuiltinClasses))) {
      throw new Error('Invalid managed tool requirement.');
    }
    if (feature.runtimePackages !== undefined && (!Array.isArray(feature.runtimePackages) || feature.runtimePackages.length > 16
      || feature.runtimePackages.some((entry) => !entry || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(entry.module)
        || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(entry.distribution) || typeof entry.reason !== 'string' || !entry.reason || entry.reason.length > 1000
        || (entry.optional !== undefined && typeof entry.optional !== 'boolean')
        || (entry.requiredWhen !== undefined && (!entry.requiredWhen || !stringList([entry.requiredWhen.workflowId, entry.requiredWhen.className, entry.requiredWhen.controllerWidget], 3)
          || typeof entry.requiredWhen.defaultEnabled !== 'boolean' || !Number.isSafeInteger(entry.requiredWhen.controllerNodeId)))))) {
      throw new Error('Invalid managed runtime-package requirement.');
    }
    for (const node of feature.customNodes) {
      if (!node || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(node.name) || !/^[a-f0-9]{40}$/.test(node.minimumCommit)
        || (node.requiredPatch !== undefined && (typeof node.requiredPatch !== 'string'
          || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\.patch$/.test(node.requiredPatch)))
        || (node.requiredClasses !== undefined && !stringList(node.requiredClasses))
        || (node.requiredFrontendClasses !== undefined && !stringList(node.requiredFrontendClasses))
        || (node.webDirectory !== undefined && !relativePath(node.webDirectory))
        || (node.frontendAssets !== undefined && (!Array.isArray(node.frontendAssets) || node.frontendAssets.length > 64
          || !node.webDirectory || node.frontendAssets.some((asset) => !asset || !relativePath(asset.path)
            || typeof asset.registration !== 'string' || !/^[^\u0000-\u001f]{1,160}$/.test(asset.registration))))) {
        throw new Error('Invalid managed custom-node requirement.');
      }
    }
  }
  return parsed.features;
}

export function requirementsForManagedNode(features: ManagedFeatureRequirement[], name: string): ManagedNodeRequirement[] {
  return features.flatMap((feature) => feature.customNodes.filter((node) => node.name === name));
}

export function inspectManagedNodeFrontend(nodePath: string, requirement: ManagedNodeRequirement): string[] {
  if (!requirement.frontendAssets?.length) return [];
  const problems: string[] = [];
  const webDirectory = managedChildPath(nodePath, requirement.webDirectory!);
  const init = readFileSync(managedChildPath(nodePath, '__init__.py'), 'utf8');
  const declared = init.match(/^\s*WEB_DIRECTORY\s*=\s*['"]([^'"]+)['"]/m)?.[1];
  if (!declared || managedChildPath(nodePath, declared) !== webDirectory) {
    problems.push(`WEB_DIRECTORY does not expose ${requirement.webDirectory}.`);
  }
  const contents: string[] = [];
  for (const asset of requirement.frontendAssets) {
    const path = managedChildPath(nodePath, asset.path);
    try {
      const rel = relative(webDirectory, path);
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Asset is outside WEB_DIRECTORY.');
      const info = statSync(path);
      if (!info.isFile() || info.size === 0 || info.size > 2_000_000) throw new Error('Asset is missing, empty or too large to verify.');
      const content = readFileSync(path, 'utf8');
      contents.push(content);
      if (!/\bregisterExtension\s*\(/.test(content) || !content.includes(asset.registration)) {
        problems.push(`${asset.path} does not declare frontend registration ${asset.registration}.`);
      }
    } catch (error) {
      problems.push(`${asset.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const name of requirement.requiredFrontendClasses || []) {
    if (!contents.some((content) => /\bregisterNodeType\s*\(/.test(content) && content.includes(name))) {
      problems.push(`Frontend class ${name} is not declared by the required assets.`);
    }
  }
  return problems;
}
