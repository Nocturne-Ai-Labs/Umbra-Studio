export interface UmbraPromptWildcard {
  name: string;
  values: string[];
}

export interface UmbraPromptWildcardExpansion {
  prompt: string;
  resolved: Array<{ name: string; value: string }>;
  missing: string[];
}

export interface UmbraPromptWildcardSegment {
  [key: string]: unknown;
  text?: unknown;
  slotId?: unknown;
  variantId?: unknown;
  wildcardMode?: unknown;
}

export interface UmbraPromptWildcardSegmentExpansion {
  prompt: string;
  tokens: UmbraPromptWildcardSegment[];
}

const TOKEN_PATTERN = /__([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})__/g;
const MAX_EXPANSION_DEPTH = 8;

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function nextRandom(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeUmbraPromptWildcards(rawWildcards: unknown): UmbraPromptWildcard[] {
  if (!Array.isArray(rawWildcards)) return [];
  const names = new Set<string>();
  return rawWildcards.flatMap((entry) => {
    const name = normalizeName((entry as UmbraPromptWildcard)?.name);
    if (!name || names.has(name)) return [];
    const values = Array.isArray((entry as UmbraPromptWildcard)?.values)
      ? (entry as UmbraPromptWildcard).values.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (values.length === 0) return [];
    names.add(name);
    return [{ name, values }];
  });
}

export function expandUmbraPromptWildcards(
  rawPrompt: unknown,
  rawWildcards: unknown,
  seed: number | string = 0,
): UmbraPromptWildcardExpansion {
  const wildcardMap = new Map(normalizeUmbraPromptWildcards(rawWildcards).map((entry) => [entry.name, entry.values]));
  const resolved: Array<{ name: string; value: string }> = [];
  const missing = new Set<string>();
  let randomState = hashText(`${seed}|${String(rawPrompt || '')}`);
  let prompt = String(rawPrompt || '');

  for (let depth = 0; depth < MAX_EXPANSION_DEPTH; depth += 1) {
    let changed = false;
    prompt = prompt.replace(TOKEN_PATTERN, (token, rawName: string) => {
      const name = normalizeName(rawName);
      const values = wildcardMap.get(name);
      if (!values) {
        missing.add(name);
        return token;
      }
      randomState = nextRandom(randomState || 1);
      const value = values[randomState % values.length];
      resolved.push({ name, value });
      changed = true;
      return value;
    });
    if (!changed || !TOKEN_PATTERN.test(prompt)) break;
    TOKEN_PATTERN.lastIndex = 0;
  }
  TOKEN_PATTERN.lastIndex = 0;
  return { prompt, resolved, missing: [...missing] };
}

interface UmbraPromptWildcardResolutionDescriptor {
  name: string;
  tokenIndex: number;
  value: string;
}

function createWildcardTokenPattern(): RegExp {
  return /__([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})__/g;
}

export function expandUmbraPromptWildcardSegments(
  rawPrompt: unknown,
  rawTokens: unknown,
  rawWildcards: unknown,
  baseSeed: number,
  promptIndex: number,
): UmbraPromptWildcardSegmentExpansion {
  const tokens = Array.isArray(rawTokens)
    ? rawTokens.map((rawToken) => (
      rawToken && typeof rawToken === 'object'
        ? rawToken as UmbraPromptWildcardSegment
        : {}
    ))
    : [];
  if (tokens.length <= 0) {
    return {
      prompt: expandUmbraPromptWildcards(rawPrompt, rawWildcards, baseSeed + promptIndex).prompt,
      tokens,
    };
  }

  const descriptorsByName = new Map<string, UmbraPromptWildcardResolutionDescriptor[]>();
  const descriptorsByToken = new Map<number, UmbraPromptWildcardResolutionDescriptor[]>();
  for (const [tokenIndex, token] of tokens.entries()) {
    const tokenText = String(token.text || '');
    const hold = String(token.wildcardMode || '').trim().toLowerCase() === 'hold';
    const slotIdentity = String(token.slotId || token.variantId || tokenIndex).trim() || String(tokenIndex);
    let occurrenceIndex = 0;
    for (const match of tokenText.matchAll(createWildcardTokenPattern())) {
      const name = normalizeName(match[1]);
      if (!name) continue;
      const seed = hold
        ? `${baseSeed}|wildcard-hold|${slotIdentity}|${occurrenceIndex}`
        : `${baseSeed + promptIndex}|wildcard-reroll|${slotIdentity}|${occurrenceIndex}`;
      const descriptor: UmbraPromptWildcardResolutionDescriptor = {
        name,
        tokenIndex,
        value: expandUmbraPromptWildcards(`__${name}__`, rawWildcards, seed).prompt,
      };
      const namedDescriptors = descriptorsByName.get(name) || [];
      namedDescriptors.push(descriptor);
      descriptorsByName.set(name, namedDescriptors);
      const tokenDescriptors = descriptorsByToken.get(tokenIndex) || [];
      tokenDescriptors.push(descriptor);
      descriptorsByToken.set(tokenIndex, tokenDescriptors);
      occurrenceIndex += 1;
    }
  }

  const descriptorOffsets = new Map<string, number>();
  const prompt = String(rawPrompt || '').replace(
    createWildcardTokenPattern(),
    (wildcardToken, rawName: string) => {
      const name = normalizeName(rawName);
      const descriptors = descriptorsByName.get(name) || [];
      const offset = descriptorOffsets.get(name) || 0;
      descriptorOffsets.set(name, offset + 1);
      const descriptor = descriptors[offset];
      if (descriptor) return descriptor.value;
      return expandUmbraPromptWildcards(
        wildcardToken,
        rawWildcards,
        `${baseSeed + promptIndex}|wildcard-reroll|fallback|${name}|${offset}`,
      ).prompt;
    },
  ).trim();

  const resolvedTokens = tokens.map((token, tokenIndex) => {
    const descriptorQueue = [...(descriptorsByToken.get(tokenIndex) || [])];
    const text = String(token.text || '').replace(
      createWildcardTokenPattern(),
      (wildcardToken) => descriptorQueue.shift()?.value || wildcardToken,
    );
    return { ...token, text };
  });

  return { prompt, tokens: resolvedTokens };
}
