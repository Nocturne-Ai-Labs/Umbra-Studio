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
  /\bbondage\b/i,
  /\bbdsm\b/i,
  /\bpenetration\b/i,
  /\bfellatio\b/i,
  /\bhandjob\b/i,
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

export function classifyUmbraMediaMetadata(metadata: unknown, tags: unknown[] = []): UmbraPrivacyClass {
  const parsed = parseMetadata(metadata);
  const positivePrompt = parsed
    ? String(parsed.positive_prompt ?? parsed.positivePrompt ?? parsed.positive ?? '').trim()
    : '';
  return classifyUmbraPrompt(positivePrompt, tags);
}
