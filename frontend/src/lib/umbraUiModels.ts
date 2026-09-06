export interface UmbraUiLoraEntry {
  id: string;
  name: string;
  modelFamilyKey?: string;
  enabled: boolean;
  strengthModel: number;
  strengthClip: number;
  trainedTags: string[];
  triggerWords?: string[];
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  civitaiUrl?: string;
}

export interface UmbraUiLoraVisualMeta {
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  civitaiUrl?: string;
}

type UmbraUiMetadataRecord = Record<string, unknown>;

function collectUmbraUiLoraWords(value: unknown, add: (word: string) => void): void {
  let parsed = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = value;
      }
    }
  }
  if (Array.isArray(parsed)) {
    parsed.forEach((entry) => collectUmbraUiLoraWords(entry, add));
    return;
  }
  if (parsed && typeof parsed === 'object') {
    Object.keys(parsed as UmbraUiMetadataRecord).forEach(add);
    return;
  }
  if (typeof parsed === 'string') parsed.split(/[,;\n]/).forEach(add);
}

export function extractUmbraUiLoraTriggerWords(info: unknown): string[] {
  if (!info || typeof info !== 'object') return [];
  const record = info as UmbraUiMetadataRecord;
  const metadata = record.metadata && typeof record.metadata === 'object'
    ? record.metadata as UmbraUiMetadataRecord
    : {};
  const civitai = record.civitai && typeof record.civitai === 'object'
    ? record.civitai as UmbraUiMetadataRecord
    : {};
  const words: string[] = [];
  const seen = new Set<string>();
  const add = (rawWord: string) => {
    const word = String(rawWord || '').trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) return;
    seen.add(key);
    words.push(word);
  };
  collectUmbraUiLoraWords(record.triggerWords, add);
  collectUmbraUiLoraWords(civitai.trainedWords, add);
  for (const key of [
    'trainedWords', 'trained_words', 'activation text', 'activation_text',
    'trigger_words', 'triggerWords', 'modelspec.trigger_phrase',
  ]) collectUmbraUiLoraWords(metadata[key], add);
  return words.slice(0, 120);
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
  visualMeta: UmbraUiLoraVisualMeta = {},
  triggerWords: string[] = [],
): UmbraUiLoraEntry {
  const normalizedName = String(name || '').trim().replace(/\\/g, '/');
  const normalizedModelFamilyKey = String(modelFamilyKey || '').trim().toLowerCase();
  const thumbnailUrls = Array.from(new Set(
    (Array.isArray(visualMeta.thumbnailUrls) ? visualMeta.thumbnailUrls : [])
      .map((url) => String(url || '').trim())
      .filter(Boolean),
  ));
  const thumbnailUrl = String(visualMeta.thumbnailUrl || thumbnailUrls[0] || '').trim();
  if (thumbnailUrl && !thumbnailUrls.includes(thumbnailUrl)) thumbnailUrls.unshift(thumbnailUrl);
  const civitaiUrl = String(visualMeta.civitaiUrl || '').trim();
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
    triggerWords: Array.from(new Set(
      triggerWords.map((tag) => String(tag || '').trim()).filter(Boolean),
    )),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(thumbnailUrls.length > 0 ? { thumbnailUrls } : {}),
    ...(civitaiUrl ? { civitaiUrl } : {}),
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
