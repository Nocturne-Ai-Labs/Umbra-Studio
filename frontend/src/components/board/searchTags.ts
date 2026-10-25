export interface SearchTagToken { text: string; start: number; end: number }
export interface TagSuggestionTarget { start: number; end: number; query: string; prefix: string }
export interface SearchTagSuggestion extends TagSuggestionTarget { tag: string }

// Keep quoted metatag values together, while leaving the actual query untouched.
export function tokenizeSearchTags(value: string): SearchTagToken[] {
  const tokens: SearchTagToken[] = [];
  let start = -1;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i <= value.length; i++) {
    const character = value[i];
    if (i === value.length || (!quoted && /\s/.test(character))) {
      if (start >= 0) tokens.push({ text: value.slice(start, i), start, end: i });
      start = -1;
    } else {
      if (start < 0) start = i;
      if (character === '"' && !escaped) quoted = !quoted;
    }
    escaped = character === '\\' && !escaped;
  }
  return tokens;
}

function plainTag(text: string): boolean {
  return !!text && !/[\s:"{}<>=*\\]/.test(text) && !/^[~\-]/.test(text);
}

export function tagSuggestionTargets(value: string, cursor: number): TagSuggestionTarget[] {
  const position = Math.max(0, Math.min(cursor, value.length));
  const tokens = tokenizeSearchTags(value);
  const index = tokens.findIndex(token => token.start < position && position <= token.end);
  if (index < 0) return [];
  const active = tokens[index];
  const typed = value.slice(active.start, position);
  const prefix = /^[~-]/.test(typed) ? typed[0] : '';
  const query = typed.slice(prefix.length);
  // The caret may be before a ':' or '*'; never replace the surrounding filter.
  if (!plainTag(active.text.slice(prefix.length))) return [];
  if (!plainTag(query) || query.length < 2) return [];
  const targets: TagSuggestionTarget[] = [{ start: active.start, end: active.end, prefix, query }];
  // Look back only through ordinary words. Existing underscored tags, operators,
  // exclusions and metatags form boundaries, not words to silently merge.
  if (!prefix && !query.includes('_')) {
    const words = [query];
    for (let i = index - 1; i >= Math.max(0, index - 2); i--) {
      const token = tokens[i];
      const sign = /^[~-]/.test(token.text) ? token.text[0] : '';
      const word = token.text.slice(sign.length);
      if (!plainTag(word) || word.includes('_') || /^\d/.test(word)) break;
      words.unshift(word);
      targets.unshift({ start: token.start, end: active.end, query: words.join('_'), prefix: sign });
      if (sign) break;
    }
  }
  return targets;
}

export function collectTagSuggestions(targets: TagSuggestionTarget[], results: string[][]): SearchTagSuggestion[] {
  const seen = new Set<string>();
  const suggestions: SearchTagSuggestion[] = [];
  targets.forEach((target, index) => {
    for (const raw of results[index] || []) {
      const tag = raw.trim().replace(/^[-~]/, '').replace(/\s+/g, '_');
      if (!plainTag(tag)) continue;
      const key = `${target.prefix}${tag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ ...target, tag });
    }
  });
  return suggestions.slice(0, 10);
}

export function applyTagSuggestion(value: string, suggestion: SearchTagSuggestion): { value: string; cursor: number } {
  const before = value.slice(0, suggestion.start);
  const tag = `${suggestion.prefix}${suggestion.tag}`;
  const after = value.slice(suggestion.end);
  // Replace the entire active token, including the suffix after the caret.
  const separator = after.startsWith(' ') ? '' : ' ';
  const next = before + tag + separator + after;
  return { value: next, cursor: before.length + tag.length + 1 };
}

export function removeSearchTag(value: string, token: SearchTagToken): string {
  const before = value.slice(0, token.start).trimEnd();
  const after = value.slice(token.end).trimStart();
  return before && after ? `${before} ${after}` : before || after;
}
