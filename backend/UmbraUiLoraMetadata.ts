type MetadataRecord = Record<string, unknown>;

function parseStructuredValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function collectDirectTags(value: unknown, add: (tag: unknown) => void): void {
  const parsed = parseStructuredValue(value);
  if (Array.isArray(parsed)) {
    parsed.forEach((entry) => collectDirectTags(entry, add));
    return;
  }
  if (parsed && typeof parsed === 'object') {
    Object.keys(parsed as MetadataRecord).forEach(add);
    return;
  }
  if (typeof parsed === 'string') {
    parsed.split(/[,;\n]/).forEach(add);
  }
}

function collectFrequencyTags(value: unknown): string[] {
  const scores = new Map<string, { tag: string; score: number }>();
  const visit = (entry: unknown) => {
    const parsed = parseStructuredValue(entry);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    for (const [tag, rawFrequency] of Object.entries(parsed as MetadataRecord)) {
      const frequency = Number(rawFrequency);
      if (Number.isFinite(frequency)) {
        const normalized = String(tag || '').trim();
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        const current = scores.get(key);
        scores.set(key, {
          tag: current?.tag || normalized,
          score: (current?.score || 0) + Math.max(0, frequency),
        });
      } else {
        visit(rawFrequency);
      }
    }
  };
  visit(value);
  return Array.from(scores.values())
    .sort((left, right) => right.score - left.score || left.tag.localeCompare(right.tag))
    .map((entry) => entry.tag);
}

export function extractUmbraUiTrainedTags(
  civitai: MetadataRecord | null,
  metadata: MetadataRecord,
): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const add = (rawTag: unknown) => {
    const tag = String(rawTag || '').trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  };

  collectDirectTags(civitai?.trainedWords, add);
  for (const key of [
    'trainedWords',
    'trained_words',
    'activation text',
    'activation_text',
    'trigger_words',
    'triggerWords',
    'modelspec.trigger_phrase',
    'modelspec.tags',
  ]) {
    collectDirectTags(metadata[key], add);
  }
  collectFrequencyTags(metadata.ss_tag_frequency).forEach(add);

  return tags.slice(0, 120);
}
