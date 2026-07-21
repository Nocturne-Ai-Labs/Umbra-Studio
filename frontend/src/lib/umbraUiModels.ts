export interface UmbraUiLoraEntry {
  id: string;
  name: string;
  modelFamilyKey?: string;
  enabled: boolean;
  strengthModel: number;
  strengthClip: number;
  trainedTags: string[];
}

function clampStrength(value: unknown, fallback = 1): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(-10, Math.min(10, numeric));
}

function formatStrength(value: number): string {
  return Number(clampStrength(value).toFixed(3)).toString();
}

export function buildUmbraUiLoraSyntax(lora: UmbraUiLoraEntry): string {
  const name = String(lora.name || '').trim().replace(/\\/g, '/');
  if (!name) return '';
  const modelStrength = clampStrength(lora.strengthModel);
  const clipStrength = clampStrength(lora.strengthClip, modelStrength);
  if (Math.abs(modelStrength - clipStrength) < 0.0005) {
    return `<lora:${name}:${formatStrength(modelStrength)}>`;
  }
  return `<lora:${name}:${formatStrength(modelStrength)}:${formatStrength(clipStrength)}>`;
}

export function composeUmbraUiPromptWithLoras(prompt: string, loras: UmbraUiLoraEntry[]): string {
  const basePrompt = String(prompt || '').trim();
  const syntax = (Array.isArray(loras) ? loras : [])
    .filter((lora) => lora?.enabled !== false)
    .map(buildUmbraUiLoraSyntax)
    .filter(Boolean);
  return [basePrompt, ...syntax].filter(Boolean).join(', ');
}

export function createUmbraUiLoraEntry(
  name: string,
  trainedTags: string[] = [],
  modelFamilyKey = '',
): UmbraUiLoraEntry {
  const normalizedName = String(name || '').trim().replace(/\\/g, '/');
  const normalizedModelFamilyKey = String(modelFamilyKey || '').trim().toLowerCase();
  let id = '';
  try {
    id = crypto.randomUUID();
  } catch {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return {
    id: `umbra-ui-lora-${id}`,
    name: normalizedName,
    ...(normalizedModelFamilyKey ? { modelFamilyKey: normalizedModelFamilyKey } : {}),
    enabled: true,
    strengthModel: 1,
    strengthClip: 1,
    trainedTags: Array.from(new Set(
      trainedTags.map((tag) => String(tag || '').trim()).filter(Boolean),
    )),
  };
}

export function getUmbraUiLorasForFamily(
  loras: UmbraUiLoraEntry[],
  modelFamilyKey: string,
): UmbraUiLoraEntry[] {
  const normalizedModelFamilyKey = String(modelFamilyKey || '').trim().toLowerCase();
  if (!normalizedModelFamilyKey) return [];
  return (Array.isArray(loras) ? loras : []).filter((lora) => (
    String(lora?.modelFamilyKey || '').trim().toLowerCase() === normalizedModelFamilyKey
  ));
}

export function replaceUmbraUiLorasForFamily(
  current: UmbraUiLoraEntry[],
  modelFamilyKey: string,
  replacements: UmbraUiLoraEntry[],
): UmbraUiLoraEntry[] {
  const normalizedModelFamilyKey = String(modelFamilyKey || '').trim().toLowerCase();
  if (!normalizedModelFamilyKey) return current;
  const preserved = (Array.isArray(current) ? current : []).filter((lora) => (
    String(lora?.modelFamilyKey || '').trim().toLowerCase() !== normalizedModelFamilyKey
  ));
  const scoped = (Array.isArray(replacements) ? replacements : []).map((lora) => ({
    ...lora,
    modelFamilyKey: normalizedModelFamilyKey,
  }));
  return [...preserved, ...scoped];
}
