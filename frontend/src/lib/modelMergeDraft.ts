import type { UmbraUiPipelineModelSource } from '../../../shared/umbra-ui/pipelineTypes';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function normalizeMergeDraft(raw: unknown) {
  const value = object(raw);
  const stack = (raw: unknown) => {
    const ids = new Set<string>();
    return (Array.isArray(raw) ? raw : []).flatMap(item => {
      const entry = object(item);
      if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || typeof entry.model !== 'string' || !entry.model.startsWith('loras/') || !entry.model.endsWith('.safetensors') || typeof entry.strength !== 'number' || !Number.isFinite(entry.strength) || typeof entry.enabled !== 'boolean') return [];
      ids.add(entry.id);
      return [{ id: entry.id, model: entry.model, strength: number(entry.strength, 1, -2, 2), enabled: entry.enabled }];
    }).slice(0, 32);
  };
  const blocks = Object.fromEntries(Object.entries(object(value.blocks)).filter(([key, weight]) => /^(?:[0-9]|[1-3][0-9])$/.test(key) && typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= 1)) as Record<string, number>;
  return { a: text(value.a), b: text(value.b), name: text(value.name), ratio: number(value.ratio, 50, 0, 100), blocks, lorasA: stack(value.lorasA), lorasB: stack(value.lorasB), cleanMetadata: value.cleanMetadata !== false };
}

export type MergePreviewDraft = { family: string; source: UmbraUiPipelineModelSource; model: string; prompt: string; negative: string; seed: number; steps: number; cfg: number; width: number; height: number; sampler: string; scheduler: string; resources: Record<string, string> };
export function normalizeMergePreviewDraft(raw: unknown): MergePreviewDraft {
  const value = object(raw);
  const source = ['checkpoint', 'diffusers', 'diffusion_model', 'unet', 'gguf'].includes(String(value.source)) ? value.source as UmbraUiPipelineModelSource : 'checkpoint';
  return {
    family: text(value.family, 'Anima'), source, model: text(value.model), prompt: text(value.prompt), negative: text(value.negative),
    seed: Math.floor(number(value.seed, 12345, 0, Number.MAX_SAFE_INTEGER)), steps: Math.round(number(value.steps, 20, 1, 1000)), cfg: number(value.cfg, 4, 0, 100),
    width: Math.round(number(value.width, 1024, 64, 8192)), height: Math.round(number(value.height, 1024, 64, 8192)),
    sampler: text(value.sampler, 'euler'), scheduler: text(value.scheduler, 'normal'),
    resources: Object.fromEntries(Object.entries(object(value.resources)).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
  };
}
