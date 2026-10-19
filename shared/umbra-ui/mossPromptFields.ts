// Schema: https://github.com/OpenMOSS/MOSS-Image/blob/main/USERGUIDE.md#layout-prompts-experimental
// Scene/location and character are editor conveniences; MOSS accepts free-form item labels.
export interface MossPromptField {
  enabled: boolean;
  purpose: 'scene' | 'meta' | 'item';
  label: string;
  text: string;
}

export function normalizeMossPromptField(value: unknown): MossPromptField | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  return { enabled: raw.enabled === true, purpose: raw.purpose === 'scene' || raw.purpose === 'meta' ? raw.purpose : 'item',
    label: String(raw.label || 'object').trim() || 'object', text: String(raw.text || '') };
}

// Prompt fields describe content only. Spatial control belongs to Edit mode (mossLayout.ts).
export function compileMossPromptFields(fields: { text: string; moss?: MossPromptField }[]): string {
  const scene: string[] = [];
  const meta: string[] = [];
  const items: { label: string; caption: string; text?: string }[] = [];
  for (const field of fields) {
    const config = normalizeMossPromptField(field.moss);
    if (config?.purpose === 'meta') { meta.push(...field.text.split(',').map(value => value.trim()).filter(Boolean)); continue; }
    if (!config || config.purpose === 'scene') { if (field.text.trim()) scene.push(field.text.trim()); continue; }
    if (!field.text.trim() && !config.text.trim()) continue;
    items.push({ label: config.label, caption: field.text.trim(),
      ...(config.label === 'text' ? { text: config.text } : {}) });
  }
  return JSON.stringify({ summary: { canvas: 'single', caption: scene.join('\n'), ...(meta.length ? { meta } : {}) }, items });
}
