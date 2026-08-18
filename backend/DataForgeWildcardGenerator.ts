import { readFile, stat } from 'fs/promises';
import {
  DANBOORU_TAG_CLASSIFIERS,
  classifyDanbooruTag,
  getDanbooruTagClassifierDefinition,
  hasExplicitDanbooruClassifier,
  parseDanbooruTagClassifiers,
  type DanbooruTagClassifierId,
} from '../shared/danbooru/tagClassifiers';

export interface DataForgeWildcardTag {
  tag: string;
  category: number;
  postCount: number | null;
  classifiers: DanbooruTagClassifierId[];
  explicit: boolean;
  source: 'danbooru' | 'local';
}

export interface DataForgeWildcardClassifierSummary {
  id: DanbooruTagClassifierId;
  label: string;
  description: string;
  explicit: boolean;
  count: number;
}

export interface DataForgeWildcardTagRef {
  tag: string;
  postCount?: number | null;
  category?: number;
  kind?: 'tag' | 'natural' | 'auto';
}

export interface DataForgeWildcardOption {
  id?: string;
  tags?: DataForgeWildcardTagRef[] | string[] | string;
  chance?: number;
  enabled?: boolean;
}

export interface DataForgeWildcardGroup {
  id?: string;
  name?: string;
  enabled?: boolean;
  required?: boolean;
  progressive?: boolean;
  options?: DataForgeWildcardOption[];
}

export interface DataForgeWildcardGenerateRequest {
  baseTags?: DataForgeWildcardTagRef[] | string[] | string;
  groups?: DataForgeWildcardGroup[];
  forbiddenTags?: string[] | string;
  count?: number;
  seed?: number;
  maxTagsPerLine?: number;
  prioritizePostCounts?: boolean;
}

export interface DataForgeWildcardGeneratedRow {
  value: string;
  score: number;
  chance: number;
  minimumPostCount: number | null;
  knownPostCountTags: number;
}

export interface DataForgeWildcardGenerateResult {
  rows: DataForgeWildcardGeneratedRow[];
  values: string[];
  requestedCount: number;
  generatedCount: number;
  possibleCombinations: number;
  seed: number;
  warnings: string[];
  audit: {
    unique: boolean;
    maximumTagsPerLine: number;
    unknownPostCountTags: string[];
    groupsUsed: number;
  };
}

interface CatalogEntry {
  tag: string;
  category: number;
  postCount: number | null;
  classifiers: DanbooruTagClassifierId[];
  explicit: boolean;
}

interface CatalogCacheEntry {
  stamp: string;
  entries: CatalogEntry[];
  byTag: Map<string, CatalogEntry>;
}

const catalogCache = new Map<string, CatalogCacheEntry>();
const suggestionCache = new Map<string, { expiresAt: number; values: DataForgeWildcardTag[] }>();

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function normalizeTag(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^,+|,+$/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
}

function normalizeNaturalLanguage(value: unknown): string {
  return String(value || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

function normalizeTagList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  const seen = new Set<string>();
  const output: string[] = [];
  for (const entry of values) {
    const rawTag = typeof entry === 'object' && entry !== null && 'tag' in entry
      ? (entry as { tag?: unknown }).tag
      : entry;
    const tag = normalizeTag(rawTag);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    output.push(tag);
  }
  return output;
}

function normalizePostCount(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function normalizeCsvHeader(value: unknown): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

async function loadCatalog(csvPath: string): Promise<CatalogCacheEntry> {
  const fileStat = await stat(csvPath);
  const stamp = `${fileStat.size}:${fileStat.mtimeMs}`;
  const cached = catalogCache.get(csvPath);
  if (cached?.stamp === stamp) return cached;

  const text = await readFile(csvPath, 'utf8');
  const entries: CatalogEntry[] = [];
  const byTag = new Map<string, CatalogEntry>();
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvRow(lines[0] || '').map(normalizeCsvHeader);
  const tagIndex = headers.findIndex((header) => header === 'tag' || header === 'tags');
  const categoryIndex = headers.findIndex((header) => header === 'category' || header === 'tag_category');
  const postCountIndex = headers.findIndex((header) => ['post_count', 'postcount', 'count'].includes(header));
  const classifierIndex = headers.findIndex((header) => ['classifiers', 'classifier', 'umbra_classifiers'].includes(header));
  const hasHeader = tagIndex >= 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    if (!line.trim()) continue;
    const row = parseCsvRow(line);
    const rawTag = row[hasHeader ? tagIndex : 0];
    const rawCategory = row[hasHeader && categoryIndex >= 0 ? categoryIndex : 1];
    const tag = normalizeTag(rawTag);
    if (!tag) continue;
    const category = Math.max(0, Number.parseInt(rawCategory || '0', 10) || 0);
    const classifiers = hasHeader && classifierIndex >= 0
      ? parseDanbooruTagClassifiers(row[classifierIndex])
      : classifyDanbooruTag(tag, category);
    const entry = {
      tag,
      category,
      postCount: hasHeader && postCountIndex >= 0 ? normalizePostCount(row[postCountIndex]) : null,
      classifiers,
      explicit: hasExplicitDanbooruClassifier(classifiers),
    };
    entries.push(entry);
    byTag.set(tag.toLowerCase(), entry);
  }
  const next = { stamp, entries, byTag };
  catalogCache.set(csvPath, next);
  return next;
}

function localSuggestions(
  catalog: CatalogCacheEntry,
  query: string,
  limit: number,
  category: number | null,
  classifier: DanbooruTagClassifierId | null,
  includeExplicit: boolean,
): DataForgeWildcardTag[] {
  const normalized = normalizeTag(query).toLowerCase();
  return catalog.entries
    .filter((entry) => category === null || entry.category === category)
    .filter((entry) => classifier === null || entry.classifiers.includes(classifier))
    .filter((entry) => includeExplicit || !entry.explicit)
    .filter((entry) => !normalized || entry.tag.toLowerCase().includes(normalized))
    .sort((left, right) => {
      const leftCount = left.postCount ?? -1;
      const rightCount = right.postCount ?? -1;
      if (!normalized) return rightCount - leftCount;
      const leftStarts = left.tag.toLowerCase().startsWith(normalized) ? 0 : 1;
      const rightStarts = right.tag.toLowerCase().startsWith(normalized) ? 0 : 1;
      return leftStarts - rightStarts
        || rightCount - leftCount
        || left.tag.length - right.tag.length
        || left.tag.localeCompare(right.tag);
    })
    .slice(0, limit)
    .map((entry) => ({ ...entry, source: 'local' as const }));
}

export async function searchDataForgeWildcardTags(options: {
  csvPath: string;
  query: string;
  limit?: number;
  category?: number | null;
  classifier?: string | null;
  includeExplicit?: boolean;
  authorization?: string;
  fetcher?: typeof fetch;
}): Promise<DataForgeWildcardTag[]> {
  const query = normalizeTag(options.query);
  const limit = Math.max(1, Math.min(200, Math.floor(Number(options.limit) || 20)));
  const rawCategory = options.category;
  const parsedCategory = Number(rawCategory);
  const category = rawCategory === null
    || rawCategory === undefined
    || String(rawCategory).trim() === ''
    || !Number.isFinite(parsedCategory)
    ? null
    : Math.max(0, Math.floor(parsedCategory));
  const rawClassifier = String(options.classifier || '').trim().toLowerCase();
  const classifierDefinition = rawClassifier ? getDanbooruTagClassifierDefinition(rawClassifier) : null;
  if (rawClassifier && !classifierDefinition) throw new Error(`Unknown tag classifier: ${rawClassifier}`);
  const classifier = classifierDefinition?.id || null;
  const includeExplicit = options.includeExplicit !== false;
  const catalog = await loadCatalog(options.csvPath);
  if (query.length === 1 || classifier || !includeExplicit) {
    return localSuggestions(catalog, query, limit, category, classifier, includeExplicit);
  }
  const cacheKey = `${options.csvPath}:${category ?? 'all'}:${classifier ?? 'all'}:${includeExplicit ? 'explicit' : 'safe'}:${query.toLowerCase()}:${limit}`;
  const cached = suggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.values;

  const fetcher = options.fetcher || fetch;
  try {
    const params = new URLSearchParams({ 'search[order]': 'count', limit: String(limit) });
    if (query) params.set('search[name_matches]', `${query}*`);
    if (category !== null) params.set('search[category]', String(category));
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'UmbraStudio/1.0 (Data Forge Wildcard Generator)',
    };
    if (options.authorization) headers.Authorization = options.authorization;
    const response = await fetcher(`https://danbooru.donmai.us/tags.json?${params}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Danbooru tag lookup failed with ${response.status}.`);
    const payload = await response.json() as unknown;
    const remote = Array.isArray(payload) ? payload : [];
    const values = remote
      .map((entry: any): DataForgeWildcardTag | null => {
        const tag = normalizeTag(entry?.name);
        const local = catalog.byTag.get(tag.toLowerCase());
        if (!tag || !local || (category !== null && local.category !== category)) return null;
        return {
          tag: local.tag,
          category: Number.isFinite(Number(entry?.category)) ? Number(entry.category) : local.category,
          postCount: Math.max(0, Math.floor(Number(entry?.post_count) || 0)),
          classifiers: local.classifiers,
          explicit: local.explicit,
          source: 'danbooru',
        };
      })
      .filter((entry): entry is DataForgeWildcardTag => entry !== null)
      .slice(0, limit);
    if (values.length > 0) {
      suggestionCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, values });
      return values;
    }
  } catch {
    // The local catalog remains useful when Danbooru is offline or rate limited.
  }
  return localSuggestions(catalog, query, limit, category, classifier, includeExplicit);
}

export async function listDataForgeWildcardClassifiers(options: {
  csvPath: string;
  includeExplicit?: boolean;
}): Promise<DataForgeWildcardClassifierSummary[]> {
  const catalog = await loadCatalog(options.csvPath);
  const includeExplicit = options.includeExplicit !== false;
  const counts = new Map<DanbooruTagClassifierId, number>();
  for (const entry of catalog.entries) {
    if (!includeExplicit && entry.explicit) continue;
    for (const classifier of entry.classifiers) {
      counts.set(classifier, (counts.get(classifier) || 0) + 1);
    }
  }
  return DANBOORU_TAG_CLASSIFIERS
    .filter((entry) => includeExplicit || !entry.explicit)
    .map((entry) => ({ ...entry, count: counts.get(entry.id) || 0 }))
    .filter((entry) => entry.count > 0);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeTagRefs(value: unknown, catalog: CatalogCacheEntry): DataForgeWildcardTagRef[] {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  const output: DataForgeWildcardTagRef[] = [];
  const seen = new Set<string>();
  const appendNatural = (value: unknown) => {
    const text = normalizeNaturalLanguage(value);
    const key = `natural:${text.toLowerCase()}`;
    if (!text || seen.has(key)) return;
    seen.add(key);
    output.push({ tag: text, postCount: null, kind: 'natural' });
  };
  const appendCatalogTag = (requested: string, rawObject?: DataForgeWildcardTagRef | null) => {
    const canonical = catalog.byTag.get(requested.toLowerCase());
    if (!canonical) return false;
    const key = `tag:${canonical.tag.toLowerCase()}`;
    if (seen.has(key)) return true;
    seen.add(key);
    output.push({
      tag: canonical.tag,
      category: canonical.category,
      postCount: normalizePostCount(rawObject?.postCount) ?? canonical.postCount,
      kind: 'tag',
    });
    return true;
  };
  for (const raw of source) {
    const rawObject = typeof raw === 'object' && raw !== null ? raw as DataForgeWildcardTagRef : null;
    const kind = rawObject?.kind === 'natural' || rawObject?.kind === 'auto' ? rawObject.kind : 'tag';
    if (kind === 'natural') {
      appendNatural(rawObject?.tag);
      continue;
    }
    if (kind === 'auto') {
      const text = normalizeNaturalLanguage(rawObject?.tag);
      for (const part of text.split(',').map((entry) => entry.trim()).filter(Boolean)) {
        const requested = normalizeTag(part);
        if (!requested || !appendCatalogTag(requested, rawObject)) appendNatural(part);
      }
      continue;
    }
    const requested = normalizeTag(rawObject?.tag ?? raw);
    if (!requested) continue;
    if (!appendCatalogTag(requested, rawObject)) throw new Error(`Unknown Danbooru tag: ${requested || '(empty)'}`);
  }
  return output;
}

function normalizeOption(option: DataForgeWildcardOption, catalog: CatalogCacheEntry) {
  const tags = normalizeTagRefs(option?.tags, catalog);
  if (tags.length === 0) throw new Error('Every wildcard option must contain at least one valid tag.');
  const rawChance = Number(option?.chance);
  return {
    id: String(option?.id || ''),
    tags,
    chance: Number.isFinite(rawChance) ? Math.max(0, Math.min(100, rawChance)) : null,
    enabled: option?.enabled !== false,
  };
}

function normalizeOptionChances<T extends { chance: number | null }>(options: T[]): Array<Omit<T, 'chance'> & { chance: number }> {
  if (options.length === 0) return [];
  const suppliedTotal = options.reduce((sum, option) => sum + Math.max(0, Number(option.chance) || 0), 0);
  const weights = suppliedTotal > 0
    ? options.map((option) => Math.max(0, Number(option.chance) || 0))
    : options.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || options.length;
  return options.map((option, index) => ({
    ...option,
    chance: (weights[index] / total) * 100,
  }));
}

function optionPostCount(option: { tags: DataForgeWildcardTagRef[] }): number | null {
  const known = option.tags
    .filter((tag) => tag.postCount !== null && tag.postCount !== undefined)
    .map((tag) => Number(tag.postCount))
    .filter((count) => Number.isFinite(count) && count >= 0);
  return known.length > 0 ? Math.min(...known) : null;
}

function combinationScore(options: Array<{ tags: DataForgeWildcardTagRef[] }>): number {
  const counts = options
    .flatMap((option) => option.tags)
    .filter((tag) => tag.postCount !== null && tag.postCount !== undefined)
    .map((tag) => Number(tag.postCount))
    .filter((count) => Number.isFinite(count) && count >= 0);
  if (counts.length === 0) return 0;
  return counts.reduce((sum, count) => sum + Math.log10(count + 10), 0) / counts.length;
}

function combinationChanceWeight(options: Array<{ chance: number }>): number {
  return options.reduce((weight, option) => weight * Math.max(0, option.chance / 100), 1);
}

interface InternalGeneratedRow extends Omit<DataForgeWildcardGeneratedRow, 'chance'> {
  chanceWeight: number;
  entryCount: number;
}

function buildRow(
  baseTags: DataForgeWildcardTagRef[],
  options: Array<{ tags: DataForgeWildcardTagRef[]; chance: number }>,
  forbidden: Set<string>,
  maxTagsPerLine: number,
): InternalGeneratedRow | null {
  const refs = [...baseTags, ...options.flatMap((option) => option.tags)];
  const tags: DataForgeWildcardTagRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.kind === 'natural' ? 'natural' : 'tag'}:${ref.tag.toLowerCase()}`;
    if (ref.kind !== 'natural' && forbidden.has(ref.tag.toLowerCase())) return null;
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(ref);
  }
  if (tags.length === 0 || tags.length > maxTagsPerLine) return null;
  const knownCounts = tags
    .filter((tag) => tag.postCount !== null && tag.postCount !== undefined)
    .map((tag) => Number(tag.postCount))
    .filter((count) => Number.isFinite(count) && count >= 0);
  return {
    value: tags.map((tag) => tag.tag).join(', '),
    score: Math.round(combinationScore(options) * 100) / 100,
    chanceWeight: combinationChanceWeight(options),
    minimumPostCount: knownCounts.length > 0 ? Math.min(...knownCounts) : null,
    knownPostCountTags: knownCounts.length,
    entryCount: tags.length,
  };
}

function enumerateCombinations<T>(groups: T[][], limit: number): T[][] {
  const output: T[][] = [];
  const current: T[] = [];
  const visit = (index: number) => {
    if (output.length >= limit) return;
    if (index >= groups.length) {
      output.push([...current]);
      return;
    }
    for (const option of groups[index]) {
      current.push(option);
      visit(index + 1);
      current.pop();
      if (output.length >= limit) break;
    }
  };
  visit(0);
  return output;
}

function weightedPick<T extends { tags: DataForgeWildcardTagRef[]; chance: number }>(
  options: T[],
  random: () => number,
  prioritizePostCounts: boolean,
): T {
  const weights = options.map((option) => {
    const count = optionPostCount(option);
    const popularity = !prioritizePostCounts || count === null ? 1 : Math.max(1, Math.log10(count + 10));
    return Math.max(0, option.chance) * popularity;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * total;
  for (let index = 0; index < options.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return options[index];
  }
  return options[options.length - 1];
}

function progressivePick<T extends { tags: DataForgeWildcardTagRef[]; chance: number }>(options: T[], lineIndex: number, lineCount: number): T {
  const index = lineCount <= 1 ? 0 : Math.min(options.length - 1, Math.floor((lineIndex * options.length) / lineCount));
  return options[index];
}

export async function generateDataForgeWildcard(options: {
  csvPath: string;
  request: DataForgeWildcardGenerateRequest;
}): Promise<DataForgeWildcardGenerateResult> {
  const catalog = await loadCatalog(options.csvPath);
  const request = options.request || {};
  const requestedCount = Number(request.count);
  const count = Math.max(1, Number.isFinite(requestedCount) ? Math.floor(requestedCount) : 50);
  const seed = Math.max(0, Math.min(0xffffffff, Math.floor(Number(request.seed) || 1)));
  const maxTagsPerLine = Math.max(2, Math.min(40, Math.floor(Number(request.maxTagsPerLine) || 12)));
  const prioritizePostCounts = request.prioritizePostCounts !== false;
  const baseTags = normalizeTagRefs(request.baseTags, catalog);
  const forbidden = new Set(normalizeTagList(request.forbiddenTags).map((tag) => tag.toLowerCase()));
  const groups = (Array.isArray(request.groups) ? request.groups : [])
    .filter((group) => group?.enabled !== false)
    .slice(0, 8)
    .map((group, groupIndex) => {
      const options = (Array.isArray(group.options) ? group.options : [])
        .slice(0, 250)
        .map((option) => normalizeOption(option, catalog));
      return {
        id: String(group.id || `group-${groupIndex + 1}`),
        name: String(group.name || `Group ${groupIndex + 1}`).trim(),
        required: group.required !== false,
        progressive: group.progressive === true,
        options: normalizeOptionChances(options),
      };
    })
    .filter((group) => group.options.length > 0);
  if (groups.length === 0) throw new Error('Add at least one enabled wildcard group.');

  const normalizedGroups = groups.map((group) => {
    const eligibleOptions = group.options.filter((option) => option.enabled !== false && option.chance > 0);
    if (eligibleOptions.length === 0) throw new Error(`${group.name} needs at least one option above 0%.`);
    if (group.required) return { ...group, options: eligibleOptions };
    const averageChance = 100 / eligibleOptions.length;
    return { ...group, options: [{ id: `${group.id}-empty`, tags: [] as DataForgeWildcardTagRef[], chance: averageChance }, ...eligibleOptions] };
  });
  const possibleCombinations = normalizedGroups.reduce((total, group) => Math.min(Number.MAX_SAFE_INTEGER, total * group.options.length), 1);
  const rowsByValue = new Map<string, InternalGeneratedRow>();
  const enumerationLimit = 100_000;
  const random = createSeededRandom(seed);
  const hasProgressiveGroup = normalizedGroups.some((group) => group.progressive);

  if (possibleCombinations <= enumerationLimit && !hasProgressiveGroup) {
    const combinations = enumerateCombinations(normalizedGroups.map((group) => group.options), enumerationLimit);
    const ranked = combinations
      .map((combination) => {
        const row = buildRow(baseTags, combination, forbidden, maxTagsPerLine);
        const popularity = combinationScore(combination);
        const chanceWeight = combinationChanceWeight(combination);
        const randomKey = Math.max(Number.EPSILON, random());
        const selectionWeight = chanceWeight * (prioritizePostCounts ? Math.max(1, popularity) : 1);
        const rank = selectionWeight > 0 ? -Math.log(randomKey) / selectionWeight : Number.POSITIVE_INFINITY;
        return { row, rank, tie: stableHash(combination.flatMap((option) => option.tags.map((tag) => tag.tag)).join('|')) };
      })
      .filter((entry): entry is { row: InternalGeneratedRow; rank: number; tie: number } => entry.row !== null && Number.isFinite(entry.rank))
      .sort((left, right) => left.rank - right.rank || left.tie - right.tie);
    for (const entry of ranked) {
      if (!rowsByValue.has(entry.row.value)) rowsByValue.set(entry.row.value, entry.row);
      if (rowsByValue.size >= count) break;
    }
  } else {
    const maximumAttempts = Math.min(500_000, Math.max(count * 200, 20_000));
    for (let attempt = 0; attempt < maximumAttempts && rowsByValue.size < count; attempt += 1) {
      const combination = normalizedGroups.map((group) => group.progressive
        ? progressivePick(group.options, attempt, count)
        : weightedPick(group.options, random, prioritizePostCounts));
      const row = buildRow(baseTags, combination, forbidden, maxTagsPerLine);
      if (row && !rowsByValue.has(row.value)) rowsByValue.set(row.value, row);
    }
  }

  const weightedRows = [...rowsByValue.values()];
  const totalChanceWeight = weightedRows.reduce((sum, row) => sum + row.chanceWeight, 0);
  const rawChanceUnits = weightedRows.map((row) => totalChanceWeight > 0 ? (row.chanceWeight / totalChanceWeight) * 1000 : 0);
  const chanceUnits = rawChanceUnits.map((value) => Math.floor(value));
  let remainingChanceUnits = Math.max(0, 1000 - chanceUnits.reduce((sum, value) => sum + value, 0));
  const chanceRemainders = rawChanceUnits
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < chanceRemainders.length && remainingChanceUnits > 0; index += 1) {
    chanceUnits[chanceRemainders[index].index] += 1;
    remainingChanceUnits -= 1;
  }
  const rows: DataForgeWildcardGeneratedRow[] = weightedRows.map((row, index) => ({
    value: row.value,
    score: row.score,
    chance: (chanceUnits[index] || 0) / 10,
    minimumPostCount: row.minimumPostCount,
    knownPostCountTags: row.knownPostCountTags,
  }));
  const unknownPostCountTags = [...new Set([
    ...baseTags,
    ...groups.flatMap((group) => group.options.flatMap((option) => option.tags)),
  ].filter((tag) => tag.kind !== 'natural' && (tag.postCount === null || tag.postCount === undefined)).map((tag) => tag.tag))].sort();
  const warnings: string[] = [];
  if (rows.length < count) warnings.push(`Generated ${rows.length} unique valid combinations from the requested ${count}.`);
  if (unknownPostCountTags.length > 0) warnings.push(`${unknownPostCountTags.length} tag${unknownPostCountTags.length === 1 ? '' : 's'} do not have stored or live post-count data.`);

  return {
    rows,
    values: rows.map((row) => row.value),
    requestedCount: count,
    generatedCount: rows.length,
    possibleCombinations,
    seed,
    warnings,
    audit: {
      unique: new Set(rows.map((row) => row.value)).size === rows.length,
      maximumTagsPerLine: weightedRows.reduce((maximum, row) => Math.max(maximum, row.entryCount), 0),
      unknownPostCountTags,
      groupsUsed: groups.length,
    },
  };
}

export async function inspectDataForgeWildcardTags(options: {
  csvPath: string;
  tags: unknown;
  authorization?: string;
}): Promise<DataForgeWildcardTag[]> {
  const catalog = await loadCatalog(options.csvPath);
  const requested = normalizeTagList(options.tags);
  if (requested.length === 0) return [];
  const output: DataForgeWildcardTag[] = [];
  for (const requestedTag of requested.slice(0, 20)) {
    const canonical = catalog.byTag.get(requestedTag.toLowerCase());
    if (!canonical) throw new Error(`Unknown Danbooru tag: ${requestedTag}`);
    const suggestions = await searchDataForgeWildcardTags({
      csvPath: options.csvPath,
      query: canonical.tag,
      limit: 20,
      authorization: options.authorization,
    });
    const exact = suggestions.find((entry) => entry.tag.toLowerCase() === canonical.tag.toLowerCase());
    output.push(exact || { ...canonical, source: 'local' });
  }
  return output;
}
