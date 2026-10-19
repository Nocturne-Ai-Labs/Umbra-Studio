// Schema: https://github.com/OpenMOSS/MOSS-Image/blob/main/USERGUIDE.md#layout-prompts-experimental
// Scene/location and character are editor conveniences; MOSS accepts free-form item labels.
export interface MossPromptField {
  enabled: boolean;
  purpose: 'scene' | 'meta' | 'item';
  label: string;
  text: string;
  // Percentages of the output canvas, ordered top, left, bottom, right.
  bounds: [number, number, number, number];
}

export function normalizeMossPromptField(value: unknown): MossPromptField | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const bounds = Array.isArray(raw.bounds) && raw.bounds.length === 4
    && raw.bounds.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100)
    && raw.bounds[2] > raw.bounds[0] && raw.bounds[3] > raw.bounds[1]
    ? raw.bounds as MossPromptField['bounds'] : [0, 0, 100, 100] as MossPromptField['bounds'];
  return { enabled: raw.enabled === true, purpose: raw.purpose === 'scene' || raw.purpose === 'meta' ? raw.purpose : 'item',
    label: String(raw.label || 'object').trim() || 'object', text: String(raw.text || ''), bounds };
}

export function compileMossPromptFields(fields: { text: string; moss?: MossPromptField }[], width: number, height: number): string {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error('MOSS layout needs a valid output size.');
  const scene: string[] = [];
  const meta: string[] = [];
  const items: { label: string; caption: string; text?: string; bbox: number[] }[] = [];
  for (const field of fields) {
    const config = normalizeMossPromptField(field.moss);
    if (config?.purpose === 'meta') { meta.push(...field.text.split(',').map(value => value.trim()).filter(Boolean)); continue; }
    if (!config || config.purpose === 'scene') { if (field.text.trim()) scene.push(field.text.trim()); continue; }
    if (!field.text.trim() && !config.text.trim()) continue;
    const [top, left, bottom, right] = config.bounds;
    items.push({ label: config.label, caption: field.text.trim(),
      ...(config.label === 'text' ? { text: config.text } : {}),
      bbox: [Math.round((top / 100 - 0.5) * height), Math.round((left / 100 - 0.5) * width),
        Math.round((bottom / 100 - 0.5) * height), Math.round((right / 100 - 0.5) * width)] });
  }
  return JSON.stringify({ summary: { canvas: 'single', caption: scene.join('\n'), ...(meta.length ? { meta } : {}) }, items,
    bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx' });
}
