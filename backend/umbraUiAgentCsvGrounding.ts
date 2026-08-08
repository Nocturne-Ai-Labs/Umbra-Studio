export interface UmbraUiAgentCsvItem {
  tag: string;
  source: string;
  type: 'tag' | 'character';
  extra?: string;
  displayTag?: string;
  searchAliases?: string;
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

function boundedEditDistance(left: string, right: string, maxDistance: number): number {
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[right.length];
}

function scoreCloseTag(tag: string, queryTokens: Set<string>): number {
  const tagTokens = normalizeSearchText(tag).split(' ').filter((token) => token.length >= 3);
  let bestScore = 0;
  for (const queryToken of queryTokens) {
    if (queryToken.length < 3) continue;
    for (const tagToken of tagTokens) {
      if (queryToken === tagToken || queryToken.slice(0, 2) !== tagToken.slice(0, 2)) continue;
      const maxDistance = Math.min(queryToken.length, tagToken.length) >= 7 ? 2 : 1;
      const distance = boundedEditDistance(queryToken, tagToken, maxDistance);
      if (distance <= maxDistance) {
        bestScore = Math.max(bestScore, 65 - distance * 15);
      }
    }
  }
  return bestScore;
}

function scoreCsvItem(item: UmbraUiAgentCsvItem, normalizedPrompt: string, queryTokens: Set<string>): number {
  const exactScore = Math.max(
    scoreCsvTag(item.tag, normalizedPrompt, queryTokens),
    scoreCsvTag(item.displayTag || '', normalizedPrompt, queryTokens),
    scoreCsvTag(item.searchAliases || '', normalizedPrompt, queryTokens),
  );
  return exactScore > 0 ? exactScore : scoreCloseTag(item.tag, queryTokens);
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
      score: scoreCsvItem(item, normalizedPrompt, queryTokens),
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
      'These are exact spellings and close-match candidates from the user library. Use only relevant entries for ordinary Danbooru visual tags; do not assume every candidate belongs in the result. Preserve explicit custom triggers, weights, embeddings, and LoRA syntax from the user request even when absent from this list.',
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
