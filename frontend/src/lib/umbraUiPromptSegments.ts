import { normalizePowerPrompterPromptText } from '../../../shared/power-prompter/powerPrompter';

export interface UmbraUiPromptSegment {
  id: string;
  text: string;
  label?: string;
  slotType?: string;
  variantId?: string;
  variantName?: string;
  agentEnabled?: boolean;
  preserveRepeatedTerms?: true;
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
    ...(metadata.agentEnabled === true ? { agentEnabled: true } : {}),
    ...(metadata.preserveRepeatedTerms === true ? { preserveRepeatedTerms: true } : {}),
  };
}

export function getUmbraUiActiveImagePromptSegments(
  manualSegments: UmbraUiPromptSegment[],
  activePrompt: string,
  agentModeEnabled: boolean,
): UmbraUiPromptSegment[] {
  if (!agentModeEnabled) return manualSegments;
  return [{
    id: 'umbra-ui-agent-prompt',
    label: 'Agent Prompt',
    slotType: 'umbra_ui_agent_prompt',
    text: String(activePrompt || '').trim(),
  }];
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

  const characters = Array.from(String(value || ''));
  for (const [index, character] of characters.entries()) {
    const apostropheAfterWord = character === "'" && /[\p{L}\p{N}]/u.test(characters[index - 1] || '');
    const apostropheWithinWord = apostropheAfterWord && /[\p{L}\p{N}]/u.test(characters[index + 1] || '');
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
      if (character === quote && !apostropheWithinWord) quote = '';
      continue;
    }
    if (apostropheAfterWord) {
      current += character;
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

export function normalizeUmbraUiPromptSegmentText(value: string, preserveRepeatedTerms = false): string {
  if (preserveRepeatedTerms) return normalizePowerPrompterPromptText(value);
  return dedupeTerms(splitPromptTerms(value)).join(', ');
}

export function compileUmbraUiPromptSegments(segments: UmbraUiPromptSegment[]): string {
  const seen = new Set<string>();
  const chunks: string[] = [];
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (segment?.preserveRepeatedTerms === true) {
      const importedText = normalizePowerPrompterPromptText(segment.text);
      if (!importedText) continue;
      chunks.push(importedText);
      // Imported terms retain their full multiplicity. They still count as seen
      // when a later, ordinary Umbra UI field is deduplicated.
      splitPromptTerms(importedText).forEach((term) => seen.add(term.toLowerCase()));
      continue;
    }
    for (const term of splitPromptTerms(String(segment?.text || ''))) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      chunks.push(term);
    }
  }
  return chunks.join(', ');
}

export function mergeUmbraUiPromptSegmentEnhancements(
  segments: UmbraUiPromptSegment[],
  sourceTextById: ReadonlyMap<string, string>,
  enhancedTextById: ReadonlyMap<string, string>,
): {
  segments: UmbraUiPromptSegment[];
  applied: number;
  skipped: number;
} {
  let applied = 0;
  let skipped = 0;
  const next = segments.map((segment) => {
    if (!enhancedTextById.has(segment.id)) return segment;
    if (segment.text !== sourceTextById.get(segment.id)) {
      skipped += 1;
      return segment;
    }
    const enhancedText = String(enhancedTextById.get(segment.id) || '').trim();
    if (!enhancedText) {
      skipped += 1;
      return segment;
    }
    applied += 1;
    return { ...segment, text: enhancedText };
  });
  return { segments: next, applied, skipped };
}

export function appendUmbraUiPromptToken(
  segments: UmbraUiPromptSegment[],
  segmentId: string,
  token: string,
): UmbraUiPromptSegment[] {
  const targetId = segments.some((segment) => segment.id === segmentId)
    ? segmentId
    : segments[0]?.id || '';
  const target = segments.find((segment) => segment.id === targetId);
  const preserveRepeatedTerms = target?.preserveRepeatedTerms === true;
  const normalizedToken = normalizeUmbraUiPromptSegmentText(token, preserveRepeatedTerms);
  if (!normalizedToken) return segments;
  if (!targetId) return [createUmbraUiPromptSegment(normalizedToken)];
  return segments.map((segment) => segment.id === targetId
    ? { ...segment, text: normalizeUmbraUiPromptSegmentText(`${segment.text}, ${normalizedToken}`, preserveRepeatedTerms) }
    : segment);
}
