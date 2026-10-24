import { normalizeMossSamplingSettings, type MossSamplingSettings } from './mossSampling';
/** Image-only controls shared by every generation surface and persisted preset. */
export interface ImagePipelineSettings {
  /** null preserves the selected workflow's own shift (including when switching families). */
  flowShift: number | null;
  outputFormat: 'png' | 'jpeg';
  outputQuality: number;
  mossPromptEnhancer: boolean;
  mossSampling: MossSamplingSettings;
  mossReference: { imageWeight: number; visionMegapixels: number };
}

export const IMAGE_FLOW_SHIFT_CLASSES = ['ModelSamplingAuraFlow', 'ModelSamplingSD3'] as const;
export const IMAGE_SAVE_CLASSES = ['UmbraLabSaveImage'] as const;

export function normalizeImagePipelineSettings(value: unknown): ImagePipelineSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const shift = raw.flowShift === null || raw.flowShift === undefined || raw.flowShift === '' ? null : Number(raw.flowShift);
  const quality = Number(raw.outputQuality);
  const reference = raw.mossReference && typeof raw.mossReference === 'object' ? raw.mossReference as Record<string, unknown> : {};
  const finite = (value: unknown, fallback: number, min: number, max: number) => {
    const n = value === null || value === '' ? NaN : Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  return {
    flowShift: shift !== null && Number.isFinite(shift) && shift > 0 ? shift : null,
    outputFormat: raw.outputFormat === 'jpeg' ? raw.outputFormat : 'png',
    outputQuality: Number.isFinite(quality) ? Math.max(1, Math.min(100, Math.round(quality))) : 90,
    mossPromptEnhancer: raw.mossPromptEnhancer === true,
    mossSampling: normalizeMossSamplingSettings(raw.mossSampling),
    mossReference: { imageWeight: finite(reference.imageWeight, 1, 0, 2), visionMegapixels: finite(reference.visionMegapixels, 1, 0.1, 8) },
  };
}

/** Apply only literal inputs on known image nodes; never replace graph connections. */
export function applyImagePipelineSettings(graph: Record<string, any>, value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const settings = normalizeImagePipelineSettings(value);
  for (const node of Object.values(graph)) {
    if (!node || typeof node !== 'object') continue;
    const inputs = node.inputs;
    if (!inputs || typeof inputs !== 'object') continue;
    if ((IMAGE_FLOW_SHIFT_CLASSES as readonly string[]).includes(node.class_type)
      && typeof inputs.shift === 'number' && settings.flowShift !== null) inputs.shift = settings.flowShift;
    if (node.class_type === 'TextEncodeMOSSImageVision') {
      if (!Array.isArray(inputs.image_weight)) inputs.image_weight = settings.mossReference.imageWeight;
      if (!Array.isArray(inputs.vision_megapixels)) inputs.vision_megapixels = settings.mossReference.visionMegapixels;
    }
    if ((IMAGE_SAVE_CLASSES as readonly string[]).includes(node.class_type)) {
      if (!Array.isArray(inputs.output_format)) inputs.output_format = settings.outputFormat;
      if (!Array.isArray(inputs.output_quality)) inputs.output_quality = settings.outputQuality;
    }
  }
}
