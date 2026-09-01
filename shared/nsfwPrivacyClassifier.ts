export type UmbraPrivacyClass = 'normal' | 'nsfw';

// Gallery-only override for imported media without usable generation metadata.
export const UMBRA_MANUAL_NSFW_TAG = 'umbra:manual-nsfw';

const EXPLICIT_TOKEN_PATTERNS = [
  /\bnsfw\b/i,
  /\brating[:_ -]?explicit\b/i,
  /\bexplicit(?:[_ -](?:action|content|rating|genital|nudity))?\b/i,
  /\bnude\b/i,
  /\bnudity\b/i,
  /\bnaked\b/i,
  /\btopless\b/i,
  /\bbottomless\b/i,
  /\bsex\b/i,
  /\bsexual\b/i,
  /\bnaughty\b/i,
  /\berotic\b/i,
  /\bporn(?:ographic)?\b/i,
  /\bxxx\b/i,
  /\bgenitals?\b/i,
  /\bpenis\b/i,
  /\bvagina\b/i,
  /\bpussy\b/i,
  /\banus\b/i,
  /\bnipples?\b/i,
  /\bareolae?\b/i,
  /\bcum\b/i,
  /\borgasm\b/i,
  /\bhentai\b/i,
  /\btentacles?\b/i,
  /\btentacle[_ -]?(?:sex|job|rape|penetration|insertion|play)\b/i,
  /\bbondage\b/i,
  /\bbdsm\b/i,
  /\bpenetration\b/i,
  /\b(?:vaginal|anal|oral)[_ -]?penetration\b/i,
  /\bfellatio\b/i,
  /\birrumatio\b/i,
  /\bhandjob\b/i,
  /\bblowjob\b/i,
  /\bdeep[_ -]?throat\b/i,
  /\b(?:dildo|vibrator|sex[_ -]?toy)\b/i,
  /\bmasturbat(?:e|ing|ion)\b/i,
];

export function classifyUmbraPrompt(prompt: unknown, tags: unknown[] = []): UmbraPrivacyClass {
  if (tags.some((tag) => String(tag || '').trim().toLowerCase() === UMBRA_MANUAL_NSFW_TAG)) {
    return 'nsfw';
  }
  const haystack = [
    typeof prompt === 'string' ? prompt : '',
    ...tags.filter((tag): tag is string => typeof tag === 'string'),
  ].join(' ').replace(/[_-]+/g, ' ');
  return EXPLICIT_TOKEN_PATTERNS.some((pattern) => pattern.test(haystack)) ? 'nsfw' : 'normal';
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

const PROMPT_METADATA_KEYS = new Set([
  'positive',
  'positiveprompt',
  'positive_prompt',
  'prompt',
  'prompttext',
  'prompt_text',
  'text',
]);

function collectPromptMetadataText(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectPromptMetadataText(entry, depth + 1));
  }
  if (typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const text: string[] = [];
  for (const [rawKey, nested] of Object.entries(record)) {
    const key = rawKey.replace(/[-\s]/g, '_').toLowerCase();
    if (PROMPT_METADATA_KEYS.has(key)) {
      text.push(...collectPromptMetadataText(nested, depth + 1));
      continue;
    }
    // Umbra stores modular prompt segments beneath these containers.
    if (key === 'positivepromptsegments' || key === 'positive_prompt_segments' || key === 'segments') {
      text.push(...collectPromptMetadataText(nested, depth + 1));
      continue;
    }
    // Metadata format differs between Umbra, ComfyUI, and imported images.
    // Continue through containers, but only collect text once it is attached to
    // a prompt-shaped key above.
    if (nested && typeof nested === 'object') {
      text.push(...collectPromptMetadataText(nested, depth + 1));
    }
  }
  return text;
}

export function classifyUmbraMediaMetadata(metadata: unknown, tags: unknown[] = []): UmbraPrivacyClass {
  const parsed = parseMetadata(metadata);
  const promptText = parsed ? collectPromptMetadataText(parsed).join(' ') : '';
  return classifyUmbraPrompt(promptText, tags);
}
