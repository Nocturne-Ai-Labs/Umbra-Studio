export interface UmbraPromptWildcard {
  name: string;
  values: string[];
  choices?: UmbraPromptWildcardChoice[];
}

export interface UmbraPromptWildcardChoice {
  id: string;
  value: string;
}

export interface UmbraPromptWildcardExpansion {
  prompt: string;
  resolved: Array<{ name: string; id: string; value: string }>;
  missing: string[];
}

export interface UmbraPromptWildcardContextResult {
  prompt: string;
  added: string[];
  removed: string[];
  rules: string[];
}

export interface UmbraPromptWildcardSegment {
  [key: string]: unknown;
  text?: unknown;
  slotId?: unknown;
  variantId?: unknown;
  wildcardMode?: unknown;
  wildcardHoldSelections?: unknown;
  wildcardContextEnabled?: unknown;
}

export interface UmbraPromptWildcardSegmentExpansion {
  prompt: string;
  tokens: UmbraPromptWildcardSegment[];
}

const TOKEN_PATTERN = /__([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})__/g;
const MAX_EXPANSION_DEPTH = 8;
const normalizedWildcardLibraryCache = new WeakMap<object, UmbraPromptWildcard[]>();

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

export function createUmbraWildcardChoiceUid(rawName: unknown, rawValue: unknown): string {
  const name = normalizeName(rawName);
  const value = String(rawValue || '').trim();
  const left = hashText(`${name}\u0000${value}`).toString(16).padStart(8, '0');
  const right = hashText(`${value}\u0000${name}\u0000umbra`).toString(16).padStart(8, '0');
  return `WCUID-${left}${right}`.toUpperCase();
}

export function createUmbraWildcardChoices(rawName: unknown, rawValues: unknown): UmbraPromptWildcardChoice[] {
  const name = normalizeName(rawName);
  if (!name || !Array.isArray(rawValues)) return [];
  const seen = new Set<string>();
  return rawValues.flatMap((rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) return [];
    const id = createUmbraWildcardChoiceUid(name, value);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, value }];
  });
}

function normalizeProvidedChoices(rawName: unknown, rawChoices: unknown): UmbraPromptWildcardChoice[] {
  const name = normalizeName(rawName);
  if (!name || !Array.isArray(rawChoices)) return [];
  const seen = new Set<string>();
  return rawChoices.flatMap((rawChoice) => {
    const choice = rawChoice as Partial<UmbraPromptWildcardChoice> | null;
    const value = String(choice?.value || '').trim();
    if (!value) return [];
    const id = String(choice?.id || createUmbraWildcardChoiceUid(name, value)).trim().toUpperCase();
    if (!/^WCUID-[A-F0-9]{16}$/.test(id) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, value }];
  });
}

export function normalizeUmbraPromptWildcards(rawWildcards: unknown): UmbraPromptWildcard[] {
  if (!Array.isArray(rawWildcards)) return [];
  const cached = normalizedWildcardLibraryCache.get(rawWildcards);
  if (cached) return cached;
  const names = new Set<string>();
  const normalized = rawWildcards.flatMap((entry) => {
    const name = normalizeName((entry as UmbraPromptWildcard)?.name);
    if (!name || names.has(name)) return [];
    const values = Array.isArray((entry as UmbraPromptWildcard)?.values)
      ? (entry as UmbraPromptWildcard).values.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (values.length === 0) return [];
    const choices = normalizeProvidedChoices(name, (entry as UmbraPromptWildcard)?.choices);
    names.add(name);
    return [{ name, values, choices: choices.length > 0 ? choices : createUmbraWildcardChoices(name, values) }];
  });
  normalizedWildcardLibraryCache.set(rawWildcards, normalized);
  return normalized;
}

export function normalizeUmbraWildcardHoldSelections(rawSelections: unknown): Record<string, string> {
  if (!rawSelections || typeof rawSelections !== 'object' || Array.isArray(rawSelections)) return {};
  const normalized: Record<string, string> = {};
  for (const [rawName, rawId] of Object.entries(rawSelections as Record<string, unknown>)) {
    const name = normalizeName(rawName);
    const id = String(rawId || '').trim().toUpperCase();
    if (!name || !/^WCUID-[A-F0-9]{16}$/.test(id)) continue;
    normalized[name] = id;
  }
  return normalized;
}

function resolveWildcardChoice(
  wildcard: UmbraPromptWildcard,
  randomState: number,
  heldChoiceId = '',
): UmbraPromptWildcardChoice {
  const choices = wildcard.choices?.length
    ? wildcard.choices
    : createUmbraWildcardChoices(wildcard.name, wildcard.values);
  const heldChoice = heldChoiceId
    ? choices.find((choice) => choice.id === heldChoiceId.toUpperCase())
    : undefined;
  return heldChoice || choices[randomState % choices.length];
}

function hasHeldWildcardChoice(wildcard: UmbraPromptWildcard | undefined, heldChoiceId = ''): boolean {
  if (!wildcard || !heldChoiceId) return false;
  const choices = wildcard.choices?.length
    ? wildcard.choices
    : createUmbraWildcardChoices(wildcard.name, wildcard.values);
  const normalizedId = heldChoiceId.toUpperCase();
  return choices.some((choice) => choice.id === normalizedId);
}

export function expandUmbraPromptWildcards(
  rawPrompt: unknown,
  rawWildcards: unknown,
  seed: number | string = 0,
  options?: { heldChoiceIds?: Record<string, string> },
): UmbraPromptWildcardExpansion {
  const wildcardMap = new Map(normalizeUmbraPromptWildcards(rawWildcards).map((entry) => [entry.name, entry]));
  const heldChoiceIds = normalizeUmbraWildcardHoldSelections(options?.heldChoiceIds);
  const resolved: Array<{ name: string; id: string; value: string }> = [];
  const missing = new Set<string>();
  let randomState = hashText(`${seed}|${String(rawPrompt || '')}`);
  let prompt = String(rawPrompt || '');

  for (let depth = 0; depth < MAX_EXPANSION_DEPTH; depth += 1) {
    let changed = false;
    prompt = prompt.replace(TOKEN_PATTERN, (token, rawName: string) => {
      const name = normalizeName(rawName);
      const wildcard = wildcardMap.get(name);
      if (!wildcard) {
        missing.add(name);
        return token;
      }
      randomState = nextRandom(randomState || 1);
      const choice = resolveWildcardChoice(wildcard, randomState, heldChoiceIds[name]);
      resolved.push({ name, id: choice.id, value: choice.value });
      changed = true;
      return choice.value;
    });
    if (!changed || !TOKEN_PATTERN.test(prompt)) break;
    TOKEN_PATTERN.lastIndex = 0;
  }
  TOKEN_PATTERN.lastIndex = 0;
  return { prompt, resolved, missing: [...missing] };
}

function normalizeContextTag(rawTag: string): string {
  return String(rawTag || '')
    .trim()
    .replace(/^\(+|\)+$/g, '')
    .replace(/:-?\d+(?:\.\d+)?$/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function applyUmbraWildcardContextualModifiers(rawPrompt: unknown): UmbraPromptWildcardContextResult {
  const segments = String(rawPrompt || '').split(',').map((segment) => segment.trim()).filter(Boolean);
  const normalizedSegments = segments.map(normalizeContextTag);
  const tagSet = new Set(normalizedSegments);
  const added: string[] = [];
  const removed = new Set<string>();
  const rules: string[] = [];
  const hasAny = (...tags: string[]) => tags.some((tag) => tagSet.has(tag));
  const hasMatching = (pattern: RegExp) => normalizedSegments.some((tag) => pattern.test(tag));
  const add = (tag: string, rule: string) => {
    if (!tagSet.has(tag) && !added.includes(tag)) added.push(tag);
    if (!rules.includes(rule)) rules.push(rule);
  };

  type PrimaryActionFamily = 'oral' | 'handjob' | 'paizuri' | 'vaginal' | 'anal';
  const actionFamilyForTag = (tag: string): PrimaryActionFamily | null => {
    if (
      tag === 'oral'
      || tag === 'fellatio'
      || tag === 'deepthroat'
      || /^(?:reverse_|assisted_|cooperative_|cleanup_|stealth_)?fellatio$/.test(tag)
    ) return 'oral';
    if (tag === 'handjob' || /^(?!after_|imminent_|implied_).+handjob$/.test(tag)) return 'handjob';
    if (tag === 'paizuri' || /^(?!after_|imminent_|implied_|simulated_).+paizuri$/.test(tag)) return 'paizuri';
    if (tag === 'vaginal' || tag === 'double_vaginal' || tag === 'multiple_vaginal') return 'vaginal';
    if (tag === 'anal' || tag === 'double_anal' || tag === 'multiple_anal') return 'anal';
    return null;
  };
  const groupStructureTags = new Set([
    'spitroast',
    'reverse_spitroast',
    'oral_sandwich',
    'multiple_penis_fellatio',
    'double_penetration',
    'triple_penetration',
    'gangbang',
  ]);
  const hasGroupParticipants = hasAny('2boys', '3boys', 'multiple_boys')
    || normalizedSegments.some((tag) => groupStructureTags.has(tag));
  const actionEntries = normalizedSegments.flatMap((tag, index) => {
    const family = actionFamilyForTag(tag);
    return family ? [{ family, index, tag }] : [];
  });
  const distinctActionFamilies = new Set(actionEntries.map((entry) => entry.family));

  if (hasAny('1boy') && !hasGroupParticipants && distinctActionFamilies.size > 1) {
    const selectedFamily = actionEntries[actionEntries.length - 1]?.family;
    for (const entry of actionEntries) {
      if (entry.family !== selectedFamily) removed.add(entry.tag);
    }
    rules.push('single-partner-action');
  }

  const hasEffectiveAny = (...tags: string[]) => tags.some((tag) => tagSet.has(tag) && !removed.has(tag));
  const hasEffectiveMatching = (pattern: RegExp) => normalizedSegments.some((tag) => !removed.has(tag) && pattern.test(tag));
  const hasEffectiveAction = (family: PrimaryActionFamily) => actionEntries.some(
    (entry) => entry.family === family && !removed.has(entry.tag),
  );
  const groupOralStructure = hasAny(
    'spitroast',
    'reverse_spitroast',
    'oral_sandwich',
    'multiple_penis_fellatio',
  );
  const oralOccupied = hasEffectiveAction('oral') || groupOralStructure;
  const handjobActive = hasEffectiveAction('handjob');

  if (oralOccupied) {
    const incompatibleMouthTags = new Set([
      'clenched_teeth',
      'closed_mouth',
      'pursed_lips',
      'biting_lip',
      'biting_own_lip',
      'tongue_out',
      'food_in_mouth',
      'gag',
      'ball_gag',
    ]);
    for (const tag of normalizedSegments) {
      if (incompatibleMouthTags.has(tag)) removed.add(tag);
    }
    add('open_mouth', 'oral-mouth-availability');
  }

  if (handjobActive) {
    const incompatibleHandTags = new Set(['arms_behind_head', 'bound_wrists']);
    for (const tag of normalizedSegments) {
      if (incompatibleHandTags.has(tag)) removed.add(tag);
    }
    if (normalizedSegments.some((tag) => incompatibleHandTags.has(tag))) {
      rules.push('hand-availability');
    }
  }

  const hasSexAction = actionEntries.some((entry) => !removed.has(entry.tag))
    || normalizedSegments.some((tag) => groupStructureTags.has(tag))
    || hasAny('groping', 'breast_grab', 'grabbing_breast', 'breast_groping');
  if (hasSexAction && tagSet.has('solo')) {
    removed.add('solo');
    rules.push('solo-sex-scene');
  }
  if (hasAny('spitroast', 'reverse_spitroast', 'oral_sandwich') && !hasAny('2boys', '3boys', 'multiple_boys')) {
    removed.add('1boy');
    add('2boys', 'participant-count');
  }
  if (hasAny('gangbang', 'multiple_penis_fellatio') && !hasAny('3boys', 'multiple_boys')) {
    removed.add('1boy');
    removed.add('2boys');
    add('multiple_boys', 'participant-count');
  }

  const hasPenetration = hasEffectiveAny('vaginal', 'anal', 'sex', 'penetration', 'penetrating')
    || hasEffectiveMatching(/(?:^|_)(?:vaginal|anal|penetration|sex)(?:_|$)/);
  const hasVaginalOrAnal = hasEffectiveAny('vaginal', 'anal')
    || hasEffectiveMatching(/(?:^|_)(?:vaginal|anal)(?:_|$)/);
  const hasGroping = hasEffectiveAny('groping', 'breast_grab', 'grabbing_breast', 'breast_groping')
    || hasEffectiveMatching(/(?:^|_)(?:groping|breast_grab)(?:_|$)/);
  const penetrationThroughClothes = hasEffectiveAny('penetration_through_clothes');
  const lowerAccessAlreadyDefined = hasAny(
    'panties_aside',
    'thong_aside',
    'bikini_bottom_aside',
    'clothing_aside',
    'panty_pull',
    'panties_around_one_leg',
    'panties_around_ankles',
  );
  const matchingTagIndexes = (predicate: (tag: string) => boolean) => normalizedSegments
    .flatMap((tag, index) => predicate(tag) ? [index] : []);
  const removeIndexes = (indexes: number[]) => {
    for (const index of indexes) removed.add(normalizedSegments[index]);
  };

  if (hasVaginalOrAnal && !penetrationThroughClothes) {
    const pantiesIndexes = matchingTagIndexes((tag) => tag === 'panties' || tag.endsWith('_panties'));
    const thongIndexes = matchingTagIndexes((tag) => tag === 'thong' || tag.endsWith('_thong'));
    const bikiniBottomIndexes = matchingTagIndexes((tag) => tag === 'bikini_bottom' || tag.endsWith('_bikini_bottom'));

    if (pantiesIndexes.length > 0) {
      removeIndexes(pantiesIndexes);
      if (!lowerAccessAlreadyDefined) add('panties_aside', 'lower-garment-access');
    }
    if (thongIndexes.length > 0) {
      removeIndexes(thongIndexes);
      if (!lowerAccessAlreadyDefined) add('thong_aside', 'lower-garment-access');
    }
    if (bikiniBottomIndexes.length > 0) {
      removeIndexes(bikiniBottomIndexes);
      if (!lowerAccessAlreadyDefined) add('bikini_bottom_aside', 'lower-garment-access');
    }
  }

  if (hasPenetration && hasAny('skirt', 'miniskirt', 'pleated_skirt') && !lowerAccessAlreadyDefined && !penetrationThroughClothes) {
    add('skirt_lift', 'skirt-access');
  }
  if (hasPenetration && hasAny('shorts', 'pants', 'jeans', 'pantyhose') && !lowerAccessAlreadyDefined && !penetrationThroughClothes) {
    add('clothing_aside', 'lower-garment-access');
  }

  const hasUpperGarment = hasAny('shirt', 't-shirt', 'blouse', 'serafuku', 'sweater', 'crop_top', 'tank_top');
  const upperAccessAlreadyDefined = hasAny('hand_under_shirt', 'hand_under_clothes', 'shirt_lift', 'clothes_lift');
  if (hasGroping && hasUpperGarment && !upperAccessAlreadyDefined) {
    add('hand_under_shirt', 'upper-garment-contact');
  } else if (hasGroping && hasAny('dress', 'lingerie', 'bodysuit', 'leotard') && !upperAccessAlreadyDefined) {
    add('hand_under_clothes', 'upper-garment-contact');
  }

  const primaryAngleKey = (tag: string): string | null => {
    const normalized = tag === 'close_up' ? 'close-up' : tag;
    if (new Set([
      'from_above',
      'from_below',
      'from_side',
      'from_behind',
      'pov',
      'close-up',
      'wide_shot',
      'dutch_angle',
      'between_legs',
      'over_shoulder',
      'eye_level',
    ]).has(normalized)) return normalized;
    if (normalized === 'over-the-shoulder_view') return 'over_shoulder';
    if (normalized.startsWith('low_angle')) return 'from_below';
    if (normalized.startsWith('high_angle')) return 'from_above';
    return null;
  };
  const angleEntries = normalizedSegments.flatMap((tag, index) => {
    if (removed.has(tag)) return [];
    const key = primaryAngleKey(tag);
    return key ? [{ tag, key, index }] : [];
  });
  const firstAngle = angleEntries[0];
  if (firstAngle) {
    for (const entry of angleEntries.slice(1)) {
      if (entry.key !== firstAngle.key) removed.add(entry.tag);
    }
    if (angleEntries.some((entry) => entry.key !== firstAngle.key)) rules.push('single-primary-angle');
  }

  const focusEntries = normalizedSegments.flatMap((tag, index) => (
    !removed.has(tag) && /(?:^|_)focus$/.test(tag) ? [{ tag, index }] : []
  ));
  const firstFocus = focusEntries[0];
  if (firstFocus) {
    for (const entry of focusEntries.slice(1)) {
      if (entry.tag !== firstFocus.tag) removed.add(entry.tag);
    }
    if (focusEntries.some((entry) => entry.tag !== firstFocus.tag)) rules.push('single-primary-focus');
  }

  const kept = segments.filter((segment, index) => !removed.has(normalizedSegments[index]));
  return {
    prompt: [...kept, ...added].join(', '),
    added,
    removed: [...removed],
    rules,
  };
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
  const wildcardMap = new Map(
    normalizeUmbraPromptWildcards(rawWildcards).map((wildcard) => [wildcard.name, wildcard]),
  );
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
    const heldChoiceIds = hold ? normalizeUmbraWildcardHoldSelections(token.wildcardHoldSelections) : {};
    const slotIdentity = String(token.slotId || token.variantId || tokenIndex).trim() || String(tokenIndex);
    let occurrenceIndex = 0;
    for (const match of tokenText.matchAll(createWildcardTokenPattern())) {
      const name = normalizeName(match[1]);
      if (!name) continue;
      const heldChoiceId = heldChoiceIds[name];
      const hasExactHeldChoice = hold && hasHeldWildcardChoice(wildcardMap.get(name), heldChoiceId);
      // A library edit can invalidate a previously saved WCUID. Keep Hold stable in
      // that case instead of silently falling through to a new choice for every job.
      const seed = hasExactHeldChoice
        ? `${baseSeed}|wildcard-hold|${slotIdentity}|${occurrenceIndex}`
        : hold
          ? `wildcard-hold-fallback|${slotIdentity}|${name}|${occurrenceIndex}`
          : `${baseSeed + promptIndex}|wildcard-reroll|${slotIdentity}|${occurrenceIndex}`;
      const descriptor: UmbraPromptWildcardResolutionDescriptor = {
        name,
        tokenIndex,
        value: expandUmbraPromptWildcards(`__${name}__`, rawWildcards, seed, { heldChoiceIds }).prompt,
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
  let prompt = String(rawPrompt || '').replace(
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

  let resolvedTokens = tokens.map((token, tokenIndex) => {
    const descriptorQueue = [...(descriptorsByToken.get(tokenIndex) || [])];
    const text = String(token.text || '').replace(
      createWildcardTokenPattern(),
      (wildcardToken) => descriptorQueue.shift()?.value || wildcardToken,
    );
    return { ...token, text };
  });

  const contextTokenIndex = tokens.findIndex((token) => token.wildcardContextEnabled === true);
  if (contextTokenIndex >= 0) {
    const contextual = applyUmbraWildcardContextualModifiers(prompt);
    prompt = contextual.prompt;
    if (contextual.added.length > 0 || contextual.removed.length > 0) {
      resolvedTokens = resolvedTokens.map((token, tokenIndex) => {
        const tokenSegments = String(token.text || '').split(',').map((segment) => segment.trim()).filter(Boolean);
        const keptSegments = tokenSegments.filter((segment) => !contextual.removed.includes(normalizeContextTag(segment)));
        const nextSegments = tokenIndex === contextTokenIndex
          ? [...keptSegments, ...contextual.added]
          : keptSegments;
        return { ...token, text: nextSegments.join(', ') };
      });
    }
  }

  return { prompt, tokens: resolvedTokens };
}
