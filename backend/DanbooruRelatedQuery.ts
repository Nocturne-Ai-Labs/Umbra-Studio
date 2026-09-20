import type { Database } from 'bun:sqlite';
import { classifyDanbooruTag, hasExplicitDanbooruClassifier, type DanbooruTagClassifierId } from '../shared/danbooru/tagClassifiers';

const MAX_RELATED_SAMPLE_POSTS = 500_000;
const RELATED_CACHE_VERSION = 2;

export type DanbooruRelatedSuggestion = {
  tag: string;
  cooccurrenceCount: number;
  conditionalPercent: number;
  corpusPostCount: number;
  lift: number;
  score: number;
  classifiers: DanbooruTagClassifierId[];
  explicit: boolean;
};

export type DanbooruRelatedResult = {
  tags: string[];
  corpusPostCount: number;
  matchedPostCount: number;
  sampledPostCount: number;
  truncated: boolean;
  classifier: string;
  suggestions: DanbooruRelatedSuggestion[];
};

export type DanbooruRelatedOptions = {
  tags: string[];
  classifier?: string | null;
  includeExplicit?: boolean;
  limit?: number;
  minimumSupport?: number;
  sampleLimit?: number;
};

type CorpusRow = {
  tags?: string;
};

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, Math.floor(numeric))) : fallback;
}

export function normalizeTag(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeTagString(value: unknown): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const rawTag of String(value || '').split(/\s+/)) {
    const tag = normalizeTag(rawTag);
    if (!tag || tag.length > 160 || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function ftsPhrase(tag: string): string {
  return `"${tag.replaceAll('"', '""')}"`;
}

function buildMatchExpression(tags: string[]): string {
  return tags.map(ftsPhrase).join(' AND ');
}

function isRelatedResult(value: unknown): value is DanbooruRelatedResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<DanbooruRelatedResult>;
  const nonnegativeNumber = (number: unknown): number is number => (
    typeof number === 'number' && Number.isFinite(number) && number >= 0
  );
  return Array.isArray(result.tags) && result.tags.every((tag) => typeof tag === 'string')
    && nonnegativeNumber(result.corpusPostCount)
    && nonnegativeNumber(result.matchedPostCount)
    && nonnegativeNumber(result.sampledPostCount)
    && typeof result.truncated === 'boolean'
    && typeof result.classifier === 'string'
    && Array.isArray(result.suggestions)
    && result.suggestions.every((entry) => entry && typeof entry === 'object'
      && typeof entry.tag === 'string'
      && nonnegativeNumber(entry.cooccurrenceCount)
      && nonnegativeNumber(entry.conditionalPercent)
      && nonnegativeNumber(entry.corpusPostCount)
      && nonnegativeNumber(entry.lift)
      && nonnegativeNumber(entry.score)
      && Array.isArray(entry.classifiers)
      && entry.classifiers.every((classifier) => typeof classifier === 'string')
      && typeof entry.explicit === 'boolean');
}

export function calculateDanbooruRelatedTags(
  db: Database,
  status: { indexedPosts: number; state: string },
  options: DanbooruRelatedOptions,
  writeCache = true,
): DanbooruRelatedResult {
  const tags = Array.from(new Set((options.tags || []).map(normalizeTag).filter(Boolean)));
  if (tags.length === 0) throw new Error('Select at least one corpus tag.');
  if (status.indexedPosts === 0) throw new Error('The Danbooru relation corpus has not been built yet.');

  const requestedClassifier = String(options.classifier || 'smart').trim().toLowerCase();
  const includeExplicit = options.includeExplicit === true;
  const limit = clampInteger(options.limit, 80, 1, 160);
  const minimumSupport = clampInteger(options.minimumSupport, 20, 1, 100_000);
  const sampleLimit = clampInteger(options.sampleLimit, MAX_RELATED_SAMPLE_POSTS, 100, MAX_RELATED_SAMPLE_POSTS);
  const cacheKey = JSON.stringify({
    version: RELATED_CACHE_VERSION,
    tags: [...tags].sort(),
    requestedClassifier,
    includeExplicit,
    limit,
    minimumSupport,
    sampleLimit,
    indexedPosts: status.indexedPosts,
  });
  if (status.state !== 'running') {
    const cached = db.query('SELECT payload FROM danbooru_corpus_related_cache WHERE cache_key = ?').get(cacheKey) as { payload?: string } | null;
    if (cached?.payload) {
      try {
        const result: unknown = JSON.parse(cached.payload);
        if (isRelatedResult(result) && result.corpusPostCount === status.indexedPosts
          && result.classifier === requestedClassifier) {
          return { ...result, tags };
        }
      } catch {
        // Recompute malformed cache entries.
      }
    }
  }

  const matchExpression = buildMatchExpression(tags);
  const matchedPostCount = Number((db.query(
    'SELECT COUNT(*) AS count FROM danbooru_corpus_fts WHERE danbooru_corpus_fts MATCH ?',
  ).get(matchExpression) as { count?: number } | null)?.count || 0);
  // Keep broad-corpus noise out without making uncommon intersections blank.
  // Ten percent means a 12-post niche can still suggest a tag seen once, while
  // ordinary searches against the full corpus retain the requested floor.
  const effectiveMinimumSupport = Math.min(
    minimumSupport,
    Math.max(1, Math.floor(matchedPostCount * 0.1)),
  );

  const seedClassifiers = new Set<DanbooruTagClassifierId>(tags.flatMap((tag) => classifyDanbooruTag(tag, 0)));
  const filterClassifiers = requestedClassifier === 'smart'
    ? seedClassifiers
    : requestedClassifier === 'all'
      ? new Set<DanbooruTagClassifierId>()
      : new Set<DanbooruTagClassifierId>([requestedClassifier as DanbooruTagClassifierId]);
  const selected = new Set(tags);
  const counts = new Map<string, number>();
  let sampledPostCount = 0;
  const rows = db.query(`
    SELECT tags
    FROM danbooru_corpus_fts
    WHERE danbooru_corpus_fts MATCH ?
    ORDER BY rowid DESC
    LIMIT ?
  `).iterate(matchExpression, Math.min(sampleLimit, matchedPostCount)) as IterableIterator<CorpusRow>;
  for (const row of rows) {
    sampledPostCount += 1;
    for (const tag of normalizeTagString(row.tags)) {
      if (selected.has(tag)) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const preliminary = Array.from(counts.entries())
    .filter(([, count]) => count >= effectiveMinimumSupport)
    .map(([tag, cooccurrenceCount]) => {
      const classifiers = classifyDanbooruTag(tag, 0);
      return {
        tag,
        cooccurrenceCount,
        classifiers,
        explicit: hasExplicitDanbooruClassifier(classifiers),
      };
    })
    .filter((entry) => includeExplicit || !entry.explicit)
    .filter((entry) => filterClassifiers.size === 0 || entry.classifiers.some((classifier) => filterClassifiers.has(classifier)))
    .sort((a, b) => b.cooccurrenceCount - a.cooccurrenceCount || a.tag.localeCompare(b.tag))
    .slice(0, Math.max(limit * 4, 160));

  const countTagPosts = db.query(
    'SELECT COUNT(*) AS count FROM danbooru_corpus_fts WHERE danbooru_corpus_fts MATCH ?',
  );
  const suggestions = preliminary.map((entry) => {
    const corpusPostCount = Number((countTagPosts.get(ftsPhrase(entry.tag)) as { count?: number } | null)?.count || 0);
    const conditional = sampledPostCount > 0 ? entry.cooccurrenceCount / sampledPostCount : 0;
    const baseRate = status.indexedPosts > 0 ? corpusPostCount / status.indexedPosts : 0;
    const lift = baseRate > 0 ? conditional / baseRate : 0;
    const score = conditional * Math.log2(2 + Math.min(25, lift)) * Math.log10(10 + entry.cooccurrenceCount);
    return {
      ...entry,
      conditionalPercent: Math.round(conditional * 10_000) / 100,
      corpusPostCount,
      lift: Math.round(lift * 100) / 100,
      score: Math.round(score * 100_000) / 100_000,
    } satisfies DanbooruRelatedSuggestion;
  }).sort((a, b) => b.score - a.score || b.cooccurrenceCount - a.cooccurrenceCount || a.tag.localeCompare(b.tag)).slice(0, limit);

  const result: DanbooruRelatedResult = {
    tags,
    corpusPostCount: status.indexedPosts,
    matchedPostCount,
    sampledPostCount,
    truncated: sampledPostCount < matchedPostCount,
    classifier: requestedClassifier,
    suggestions,
  };
  if (writeCache && status.state !== 'running') {
    db.query(`
      INSERT INTO danbooru_corpus_related_cache (cache_key, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `).run(cacheKey, JSON.stringify(result), Date.now());
  }
  return result;
}
