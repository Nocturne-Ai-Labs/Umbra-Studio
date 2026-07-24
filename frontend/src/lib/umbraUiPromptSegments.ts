export interface UmbraUiPromptSegment {
  id: string;
  text: string;
  label?: string;
  slotType?: string;
  variantId?: string;
  variantName?: string;
}

function createSegmentId(): string {
  try {
    return `umbra-prompt-${crypto.randomUUID()}`;
  } catch {
    return `umbra-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function createUmbraUiPromptSegment(
  text = '',
  metadata: Partial<Omit<UmbraUiPromptSegment, 'id' | 'text'>> = {},
): UmbraUiPromptSegment {
  return {
    id: createSegmentId(),
    text: String(text || ''),
    ...(String(metadata.label || '').trim() ? { label: String(metadata.label).trim() } : {}),
    ...(String(metadata.slotType || '').trim() ? { slotType: String(metadata.slotType).trim() } : {}),
    ...(String(metadata.variantId || '').trim() ? { variantId: String(metadata.variantId).trim() } : {}),
    ...(String(metadata.variantName || '').trim() ? { variantName: String(metadata.variantName).trim() } : {}),
  };
}

function splitPromptTerms(value: string): string[] {
  const terms: string[] = [];
  let current = '';
  let quote = '';
  let escaped = false;
  const depth = { round: 0, square: 0, curly: 0, angle: 0 };

  const pushCurrent = () => {
    const normalized = current.replace(/\s+/g, ' ').trim();
    if (normalized) terms.push(normalized);
    current = '';
  };

  for (const character of String(value || '')) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') depth.round += 1;
    if (character === ')') depth.round = Math.max(0, depth.round - 1);
    if (character === '[') depth.square += 1;
    if (character === ']') depth.square = Math.max(0, depth.square - 1);
    if (character === '{') depth.curly += 1;
    if (character === '}') depth.curly = Math.max(0, depth.curly - 1);
    if (character === '<') depth.angle += 1;
    if (character === '>') depth.angle = Math.max(0, depth.angle - 1);

    const atTopLevel = depth.round === 0 && depth.square === 0 && depth.curly === 0 && depth.angle === 0;
    if (character === ',' && atTopLevel) {
      pushCurrent();
      continue;
    }
    current += character;
  }
  pushCurrent();
  return terms;
}

function dedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const normalized = String(term || '').replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function normalizeUmbraUiPromptSegmentText(value: string): string {
  return dedupeTerms(splitPromptTerms(value)).join(', ');
}

export function compileUmbraUiPromptSegments(segments: UmbraUiPromptSegment[]): string {
  const terms = (Array.isArray(segments) ? segments : [])
    .flatMap((segment) => splitPromptTerms(String(segment?.text || '')));
  return dedupeTerms(terms).join(', ');
}

export function appendUmbraUiPromptToken(
  segments: UmbraUiPromptSegment[],
  segmentId: string,
  token: string,
): UmbraUiPromptSegment[] {
  const normalizedToken = normalizeUmbraUiPromptSegmentText(token);
  if (!normalizedToken) return segments;
  const targetId = segments.some((segment) => segment.id === segmentId)
    ? segmentId
    : segments[0]?.id || '';
  if (!targetId) return [createUmbraUiPromptSegment(normalizedToken)];
  return segments.map((segment) => segment.id === targetId
    ? { ...segment, text: normalizeUmbraUiPromptSegmentText(`${segment.text}, ${normalizedToken}`) }
    : segment);
}
