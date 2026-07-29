export interface UmbraUiAgentCsvItem {
  tag: string;
  source: string;
  type: 'tag' | 'character';
  extra?: string;
}

export interface UmbraUiAgentCsvGrounding {
  tags: string[];
  sources: string[];
  text: string;
}

const QUERY_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'and',
  'are',
  'background',
  'but',
  'can',
  'character',
  'draw',
  'for',
  'from',
  'generate',
  'girl',
  'image',
  'into',
  'make',
  'model',
  'of',
  'one',
  'prompt',
  'scene',
  'should',
  'the',
  'this',
  'use',
  'using',
  'with',
  'woman',
]);

function normalizeSearchText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitExtraTags(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function scoreCsvTag(tag: string, normalizedPrompt: string, queryTokens: Set<string>): number {
  const normalizedTag = normalizeSearchText(tag);
  if (!normalizedTag) return 0;
  if (normalizedPrompt.includes(normalizedTag)) {
    return 1_000 + normalizedTag.split(' ').length * 20;
  }
  const tagTokens = normalizedTag.split(' ').filter(Boolean);
  const matchingTokens = tagTokens.filter((token) => queryTokens.has(token)).length;
  if (matchingTokens <= 0) return 0;
  const coverage = matchingTokens / tagTokens.length;
  return matchingTokens * 100 + Math.round(coverage * 50) - Math.max(0, tagTokens.length - matchingTokens) * 10;
}

export function buildUmbraUiAgentCsvGrounding(
  sourcePrompt: string,
  items: UmbraUiAgentCsvItem[],
  limit = 160,
): UmbraUiAgentCsvGrounding {
  const normalizedPrompt = normalizeSearchText(sourcePrompt);
  const queryTokens = new Set(
    normalizedPrompt
      .split(' ')
      .filter((token) => token.length >= 2 && !QUERY_STOP_WORDS.has(token)),
  );
  const safeLimit = Math.max(1, Math.min(400, Math.floor(limit) || 160));
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      score: scoreCsvTag(item.tag, normalizedPrompt, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const tags: string[] = [];
  const sources = new Set<string>();
  const seenTags = new Set<string>();
  const appendTag = (tag: string, source: string) => {
    const cleanTag = String(tag || '').trim();
    const key = cleanTag.toLowerCase();
    if (!cleanTag || seenTags.has(key) || tags.length >= safeLimit) return;
    seenTags.add(key);
    tags.push(cleanTag);
    if (source) sources.add(source);
  };

  for (const { item } of ranked) {
    appendTag(item.tag, item.source);
    if (item.type === 'character') {
      for (const extraTag of splitExtraTags(item.extra).slice(0, 32)) {
        appendTag(extraTag, item.source);
      }
    }
    if (tags.length >= safeLimit) break;
  }

  const sourceList = [...sources];
  const text = tags.length > 0
    ? [
      'CSV TAG VOCABULARY (exact spellings from the user library):',
      tags.join(', '),
      `CSV SOURCES: ${sourceList.join(', ') || 'User/PowerPrompter/CSV'}`,
      'Use only these exact spellings for ordinary Danbooru visual tags. Preserve explicit custom triggers, weights, embeddings, and LoRA syntax from the user request even when absent from this list.',
    ].join('\n')
    : [
      'CSV TAG VOCABULARY: No related exact tags were found in the user CSV library.',
      'Preserve explicit user-provided trigger tokens, weights, embeddings, and LoRA syntax, but omit uncertain ordinary tags instead of inventing them.',
    ].join('\n');

  return {
    tags,
    sources: sourceList,
    text,
  };
}
