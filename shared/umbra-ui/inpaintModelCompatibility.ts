import {
  normalizeUmbraUiModelFamilyKey,
  type UmbraUiInpaintAdapter,
} from './pipelineTypes';

export type UmbraUiClassicModelArchitecture = 'sd15' | 'sdxl' | 'unknown';

export function inferUmbraUiIpAdapterArchitecture(modelName: unknown): UmbraUiClassicModelArchitecture {
  const value = String(modelName || '').trim().toLowerCase();
  if (/(?:^|[\s_./\\-])sdxl(?:[\s_./\\-]|$)/.test(value)) return 'sdxl';
  if (/(?:^|[\s_./\\-])(?:sd[_-]?1[._-]?5|sd15)(?:[\s_./\\-]|$)/.test(value)) return 'sd15';
  return 'unknown';
}

export function inferUmbraUiClassicModelArchitecture(
  modelFamily: unknown,
  checkpointName: unknown,
): UmbraUiClassicModelArchitecture {
  const family = String(modelFamily || '').trim().toLowerCase();
  const familyKey = normalizeUmbraUiModelFamilyKey(modelFamily);
  if (familyKey === 'anima' || familyKey === 'illustriousxl') return 'sdxl';
  if (/\bsdxl\b|stable\s+diffusion\s+xl|\bpony\b/.test(family)) return 'sdxl';
  if (/\bsd\s*1[._-]?5\b|stable\s+diffusion\s+1[._-]?5/.test(family)) return 'sd15';

  const checkpoint = String(checkpointName || '').trim().toLowerCase();
  if (/(?:^|[\s_./\\-])(?:sdxl|pony|illustrious)(?:[\s_./\\-]|$)|(?:^|[\s_./\\-])xl(?:[\s_./\\-]|$)/.test(checkpoint)) {
    return 'sdxl';
  }
  if (/(?:^|[\s_./\\-])(?:sd[_-]?1[._-]?5|sd15|v1[._-]?5)(?:[\s_./\\-]|$)/.test(checkpoint)) {
    return 'sd15';
  }
  return 'unknown';
}

export function filterUmbraUiCompatibleIpAdapterModels(
  models: string[],
  modelFamily: unknown,
  checkpointName: unknown,
): string[] {
  const architecture = inferUmbraUiClassicModelArchitecture(modelFamily, checkpointName);
  if (architecture === 'unknown') return [];
  return models.filter((model) => inferUmbraUiIpAdapterArchitecture(model) === architecture);
}

export function filterUmbraUiInpaintPrimaryModels(
  models: string[],
  adapter: UmbraUiInpaintAdapter,
): string[] {
  return adapter === 'flux_fill'
    ? models.filter((model) => /fill/i.test(String(model || '')))
    : models;
}

export function getUmbraUiInpaintPrimaryModelIssue(
  adapter: UmbraUiInpaintAdapter,
  checkpointName: unknown,
): string {
  const checkpoint = String(checkpointName || '').trim();
  if (adapter === 'flux_fill' && checkpoint && !/fill/i.test(checkpoint)) {
    return 'FLUX Fill requires a FLUX.1 Fill checkpoint, diffusion model, UNet, or GGUF.';
  }
  return '';
}
