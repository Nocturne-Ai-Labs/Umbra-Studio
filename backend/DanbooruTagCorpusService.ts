import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import {
  classifyDanbooruTag,
  hasExplicitDanbooruClassifier,
  type DanbooruTagClassifierId,
} from '../shared/danbooru/tagClassifiers';

const DEFAULT_TARGET_POSTS = 2_000_000;
const MAX_TARGET_POSTS = 50_000_000;
const DEFAULT_REQUEST_DELAY_MS = 1_050;
const DEFAULT_FULL_SCAN_REQUEST_DELAY_MS = 250;
const DEFAULT_FULL_SCAN_CONCURRENCY = 5;
const MAX_FULL_SCAN_CONCURRENCY = 6;
const DANBOORU_POST_BATCH_SIZE = 200;
const MAX_RELATED_SAMPLE_POSTS = 500_000;
const RELATED_CACHE_VERSION = 2;
const AVAILABLE_POST_COUNT_TTL_MS = 60 * 60 * 1_000;
const TAG_MATRIX_SIZE = 10;

type CorpusRunState = 'empty' | 'running' | 'paused' | 'completed' | 'failed';
type CorpusMode = 'sample' | 'all';

type DanbooruCorpusPost = {
  id?: unknown;
  score?: unknown;
  rating?: unknown;
  created_at?: unknown;
  tag_string_general?: unknown;
};

export type DanbooruCorpusStatus = {
  state: CorpusRunState;
  mode: CorpusMode;
  targetPosts: number;
  availablePosts: number;
  availablePostsCheckedAt: number | null;
  indexedPosts: number;
  scannedPosts: number;
  progress: number;
  minimumScore: number;
  lastPostId: number | null;
  requestCount: number;
  lastBatchSize: number;
  startedAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  databaseBytes: number;
  tagMatrix: DanbooruCorpusTagMatrix;
  error: string;
};

export type DanbooruCorpusTagMatrixTag = {
  tag: string;
  count: number;
  classifiers: DanbooruTagClassifierId[];
  explicit: boolean;
};

export type DanbooruCorpusTagMatrix = {
  updatedAt: number | null;
  sampledPosts: number;
  cursorId: number | null;
  tags: DanbooruCorpusTagMatrixTag[];
  cells: number[][];
  maxPairCount: number;
};

export type DanbooruCorpusStartOptions = {
  targetPosts?: number;
  allPosts?: boolean;
  minimumScore?: number;
  rebuild?: boolean;
  authorization?: string;
  userAgent?: string;
  requestDelayMs?: number;
  requestConcurrency?: number;
};

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
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(numeric)));
}

function normalizeTag(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeTagString(value: unknown): string[] {
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

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function emptyTagMatrix(): DanbooruCorpusTagMatrix {
  return {
    updatedAt: null,
    sampledPosts: 0,
    cursorId: null,
    tags: [],
    cells: [],
    maxPairCount: 0,
  };
}

function parseTagMatrix(value: unknown): DanbooruCorpusTagMatrix {
  try {
    const parsed = JSON.parse(String(value || '')) as Partial<DanbooruCorpusTagMatrix>;
    if (!Array.isArray(parsed.tags) || !Array.isArray(parsed.cells)) return emptyTagMatrix();
    const tags = parsed.tags.slice(0, TAG_MATRIX_SIZE).map((entry) => ({
      tag: normalizeTag(entry?.tag),
      count: clampInteger(entry?.count, 0, 0, Number.MAX_SAFE_INTEGER),
      classifiers: Array.isArray(entry?.classifiers) ? entry.classifiers : [],
      explicit: entry?.explicit === true,
    })).filter((entry) => Boolean(entry.tag));
    if (tags.length === 0 || parsed.cells.length < tags.length) return emptyTagMatrix();
    const cells = parsed.cells.slice(0, tags.length).map((row) => (
      Array.isArray(row)
        ? row.slice(0, tags.length).map((cell) => clampInteger(cell, 0, 0, Number.MAX_SAFE_INTEGER))
        : []
    ));
    if (cells.some((row) => row.length !== tags.length)) return emptyTagMatrix();
    return {
      updatedAt: clampInteger(parsed.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER) || null,
      sampledPosts: clampInteger(parsed.sampledPosts, 0, 0, Number.MAX_SAFE_INTEGER),
      cursorId: clampInteger(parsed.cursorId, 0, 0, Number.MAX_SAFE_INTEGER) || null,
      tags,
      cells,
      maxPairCount: clampInteger(parsed.maxPairCount, 0, 0, Number.MAX_SAFE_INTEGER),
    };
  } catch {
    return emptyTagMatrix();
  }
}

export class DanbooruTagCorpusService {
  readonly databasePath: string;
  private readonly db: Database;
  private indexedPosts = 0;
  private abortController: AbortController | null = null;
  private runner: Promise<void> | null = null;
  private runToken = 0;
  private latestTagMatrix = emptyTagMatrix();

  constructor(userDir: string, databasePath = join(userDir, 'Config', 'DataForge', 'DanbooruTagCorpus.db')) {
    this.databasePath = databasePath;
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA synchronous = NORMAL');
    this.db.run('PRAGMA temp_store = MEMORY');
    this.db.run('PRAGMA cache_size = -65536');
    this.ensureSchema();
    this.indexedPosts = Number((this.db.prepare(
      'SELECT COUNT(*) AS count FROM danbooru_corpus_posts',
    ).get() as { count?: number } | null)?.count || 0);
    this.setMetaValues({ indexed_posts: this.indexedPosts });
    this.latestTagMatrix = parseTagMatrix(this.getMeta('tag_matrix_json'));

    if (this.getMeta('state') === 'running') {
      this.setMetaValues({ state: 'paused', updated_at: Date.now() });
    }
  }

  close(): void {
    this.pause();
    this.db.close();
  }

  getStatus(): DanbooruCorpusStatus {
    const indexedPosts = this.indexedPosts;
    const targetPosts = clampInteger(this.getMeta('target_posts'), DEFAULT_TARGET_POSTS, 1, MAX_TARGET_POSTS);
    const mode: CorpusMode = this.getMeta('corpus_mode') === 'sample' ? 'sample' : 'all';
    const scannedPosts = clampInteger(this.getMeta('scanned_posts'), indexedPosts, 0, Number.MAX_SAFE_INTEGER);
    const availablePosts = clampInteger(this.getMeta('available_posts'), 0, 0, MAX_TARGET_POSTS);
    const availablePostsCheckedAt = this.metaNumber('available_posts_checked_at');
    const rawState = String(this.getMeta('state') || (indexedPosts > 0 ? 'paused' : 'empty')) as CorpusRunState;
    const progressPosts = mode === 'all' ? scannedPosts : indexedPosts;
    const state: CorpusRunState = progressPosts >= targetPosts && rawState !== 'running' ? 'completed' : rawState;
    const startedAt = this.metaNumber('started_at');
    const updatedAt = this.metaNumber('updated_at');
    const completedAt = this.metaNumber('completed_at');
    const elapsedMs = startedAt ? Math.max(0, (completedAt || Date.now()) - startedAt) : 0;
    const runStartedPosts = clampInteger(this.getMeta('run_started_posts'), 0, 0, Number.MAX_SAFE_INTEGER);
    const runProgressPosts = Math.max(0, progressPosts - runStartedPosts);
    const rate = elapsedMs > 0 ? runProgressPosts / elapsedMs : 0;
    const estimatedRemainingMs = state === 'running' && rate > 0
      ? Math.max(0, Math.round((targetPosts - progressPosts) / rate))
      : null;

    return {
      state,
      mode,
      targetPosts,
      availablePosts,
      availablePostsCheckedAt,
      indexedPosts,
      scannedPosts,
      progress: state === 'completed'
        ? 100
        : targetPosts > 0 ? Math.min(100, Math.round((progressPosts / targetPosts) * 10_000) / 100) : 0,
      minimumScore: clampInteger(this.getMeta('minimum_score'), 0, 0, 1_000_000),
      lastPostId: this.metaNumber('last_post_id'),
      requestCount: clampInteger(this.getMeta('request_count'), 0, 0, Number.MAX_SAFE_INTEGER),
      lastBatchSize: clampInteger(
        this.getMeta('last_batch_size'),
        0,
        0,
        DANBOORU_POST_BATCH_SIZE * MAX_FULL_SCAN_CONCURRENCY,
      ),
      startedAt,
      updatedAt,
      completedAt,
      elapsedMs,
      estimatedRemainingMs,
      databaseBytes: this.databasePath === ':memory:'
        ? 0
        : [this.databasePath, `${this.databasePath}-wal`, `${this.databasePath}-shm`]
          .reduce((total, path) => total + (existsSync(path) ? statSync(path).size : 0), 0),
      tagMatrix: this.latestTagMatrix,
      error: String(this.getMeta('error') || ''),
    };
  }

  async refreshAvailablePostCount(options: {
    minimumScore?: number;
    authorization?: string;
    userAgent?: string;
    force?: boolean;
  } = {}): Promise<DanbooruCorpusStatus> {
    const current = this.getStatus();
    const minimumScore = clampInteger(options.minimumScore, current.minimumScore, 0, 1_000_000);
    const cachedScore = clampInteger(this.getMeta('available_posts_minimum_score'), 0, 0, 1_000_000);
    const cacheFresh = Boolean(
      current.availablePosts > 0
      && current.availablePostsCheckedAt
      && Date.now() - current.availablePostsCheckedAt < AVAILABLE_POST_COUNT_TTL_MS
      && cachedScore === minimumScore,
    );
    if (!options.force && cacheFresh) return current;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': String(options.userAgent || 'UmbraStudio/1.0 (Data Forge corpus count)').trim(),
    };
    if (options.authorization) headers.Authorization = String(options.authorization).trim();
    const params = new URLSearchParams();
    if (minimumScore > 0) params.set('tags', `score:>=${minimumScore}`);
    const availablePosts = await this.fetchPostCount(
      `https://danbooru.donmai.us/counts/posts.json${params.size > 0 ? `?${params}` : ''}`,
      headers,
    );
    const now = Date.now();
    const values: Record<string, string | number | null> = {
      available_posts: availablePosts,
      available_posts_checked_at: now,
      available_posts_minimum_score: minimumScore,
    };
    if (current.mode === 'all' && current.scannedPosts === 0 && current.state !== 'running') {
      values.target_posts = availablePosts;
    }
    this.setMetaValues(values);
    return this.getStatus();
  }

  shouldRefreshAvailablePostCount(status = this.getStatus()): boolean {
    return !status.availablePosts
      || !status.availablePostsCheckedAt
      || Date.now() - status.availablePostsCheckedAt >= AVAILABLE_POST_COUNT_TTL_MS;
  }

  async start(options: DanbooruCorpusStartOptions = {}): Promise<DanbooruCorpusStatus> {
    if (this.runner) return this.getStatus();
    if (options.rebuild) this.reset();

    let current = this.getStatus();
    const mode: CorpusMode = options.allPosts === true ? 'all' : options.allPosts === false ? 'sample' : current.mode;
    const minimumScore = clampInteger(options.minimumScore, current.minimumScore, 0, 1_000_000);
    if (current.indexedPosts > 0 && minimumScore !== current.minimumScore) {
      throw new Error('The score floor cannot change for an existing corpus. Rebuild the corpus to use a different floor.');
    }
    if (mode === 'all') {
      current = await this.refreshAvailablePostCount({
        minimumScore,
        authorization: options.authorization,
        userAgent: options.userAgent,
        force: current.scannedPosts === 0,
      });
    }
    const targetPosts = mode === 'all'
      ? current.availablePosts || current.targetPosts
      : clampInteger(options.targetPosts, current.targetPosts || DEFAULT_TARGET_POSTS, 1, MAX_TARGET_POSTS);
    const progressPosts = mode === 'all' ? current.scannedPosts : current.indexedPosts;
    if (progressPosts >= targetPosts) {
      this.setMetaValues({ corpus_mode: mode, target_posts: targetPosts, state: 'completed', completed_at: Date.now(), updated_at: Date.now(), error: '' });
      return this.getStatus();
    }

    const now = Date.now();
    this.setMetaValues({
      state: 'running',
      corpus_mode: mode,
      target_posts: targetPosts,
      minimum_score: minimumScore,
      // ETA should reflect the active run's throughput, not earlier pauses or a previous scan strategy.
      started_at: now,
      run_started_posts: progressPosts,
      completed_at: '',
      updated_at: now,
      error: '',
    });

    const token = ++this.runToken;
    const controller = new AbortController();
    this.abortController = controller;
    this.runner = this.runCorpusBuild({
      targetPosts,
      allPosts: mode === 'all',
      minimumScore,
      authorization: String(options.authorization || '').trim(),
      userAgent: String(options.userAgent || 'UmbraStudio/1.0 (Data Forge corpus)').trim(),
      requestDelayMs: clampInteger(
        options.requestDelayMs,
        mode === 'all' ? DEFAULT_FULL_SCAN_REQUEST_DELAY_MS : DEFAULT_REQUEST_DELAY_MS,
        50,
        30_000,
      ),
      requestConcurrency: mode === 'all'
        ? clampInteger(options.requestConcurrency, DEFAULT_FULL_SCAN_CONCURRENCY, 1, MAX_FULL_SCAN_CONCURRENCY)
        : 1,
      signal: controller.signal,
      token,
    }).finally(() => {
      if (this.runToken === token) {
        this.runner = null;
        this.abortController = null;
      }
    });

    return this.getStatus();
  }

  pause(): DanbooruCorpusStatus {
    this.runToken += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.runner = null;
    const current = this.getStatus();
    if (current.state === 'running') {
      this.setMetaValues({ state: current.indexedPosts > 0 ? 'paused' : 'empty', updated_at: Date.now() });
    }
    return this.getStatus();
  }

  reset(): DanbooruCorpusStatus {
    this.pause();
    const tx = this.db.transaction(() => {
      this.db.run('DELETE FROM danbooru_corpus_posts');
      this.db.run('DELETE FROM danbooru_corpus_fts');
      this.db.run('DELETE FROM danbooru_corpus_related_cache');
      this.db.run('DELETE FROM danbooru_corpus_meta');
    });
    tx();
    this.seedMeta();
    this.indexedPosts = 0;
    this.latestTagMatrix = emptyTagMatrix();
    this.db.run("INSERT INTO danbooru_corpus_fts(danbooru_corpus_fts) VALUES('optimize')");
    return this.getStatus();
  }

  ingestPosts(posts: DanbooruCorpusPost[]): { inserted: number; lastPostId: number | null } {
    const insertPost = this.db.prepare(`
      INSERT OR IGNORE INTO danbooru_corpus_posts (id, score, rating, created_at, tag_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertTags = this.db.prepare('INSERT INTO danbooru_corpus_fts(rowid, tags) VALUES (?, ?)');
    let inserted = 0;
    let lastPostId: number | null = null;
    const normalizedPosts = posts.map((post) => {
      const id = clampInteger(post?.id, 0, 1, Number.MAX_SAFE_INTEGER);
      return id ? {
        id,
        score: clampInteger(post?.score, 0, -1_000_000, 1_000_000),
        rating: String(post?.rating || '').slice(0, 2),
        createdAt: String(post?.created_at || ''),
        tags: normalizeTagString(post?.tag_string_general),
      } : null;
    }).filter((post): post is NonNullable<typeof post> => Boolean(post));

    const tx = this.db.transaction(() => {
      for (const post of normalizedPosts) {
        lastPostId = lastPostId === null ? post.id : Math.min(lastPostId, post.id);
        if (post.tags.length === 0) continue;
        const result = insertPost.run(
          post.id,
          post.score,
          post.rating,
          post.createdAt,
          post.tags.length,
        );
        if (Number(result.changes || 0) > 0) {
          insertTags.run(post.id, post.tags.join(' '));
          inserted += 1;
        }
      }
    });
    tx();
    this.indexedPosts += inserted;
    this.latestTagMatrix = this.buildTagMatrix(
      normalizedPosts.filter((post) => post.tags.length > 0).map((post) => post.tags),
      lastPostId,
    );
    this.setMetaValues({
      indexed_posts: this.indexedPosts,
      tag_matrix_json: JSON.stringify(this.latestTagMatrix),
    });
    return { inserted, lastPostId };
  }

  private buildTagMatrix(tagRows: string[][], cursorId: number | null): DanbooruCorpusTagMatrix {
    if (tagRows.length === 0) return emptyTagMatrix();
    const frequencies = new Map<string, number>();
    for (const row of tagRows) {
      for (const tag of row) frequencies.set(tag, (frequencies.get(tag) || 0) + 1);
    }
    const selected = Array.from(frequencies.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TAG_MATRIX_SIZE);
    const tagIndex = new Map(selected.map(([tag], index) => [tag, index]));
    const cells = Array.from({ length: selected.length }, () => Array(selected.length).fill(0));
    let maxPairCount = 0;
    for (const row of tagRows) {
      const present = row
        .map((tag) => tagIndex.get(tag))
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b);
      for (let left = 0; left < present.length; left += 1) {
        const leftIndex = present[left];
        cells[leftIndex][leftIndex] += 1;
        for (let right = left + 1; right < present.length; right += 1) {
          const rightIndex = present[right];
          cells[leftIndex][rightIndex] += 1;
          cells[rightIndex][leftIndex] += 1;
          maxPairCount = Math.max(maxPairCount, cells[leftIndex][rightIndex]);
        }
      }
    }
    return {
      updatedAt: Date.now(),
      sampledPosts: tagRows.length,
      cursorId,
      tags: selected.map(([tag, count]) => {
        const classifiers = classifyDanbooruTag(tag, 0);
        return {
          tag,
          count,
          classifiers,
          explicit: hasExplicitDanbooruClassifier(classifiers),
        };
      }),
      cells,
      maxPairCount,
    };
  }

  getRelatedTags(options: DanbooruRelatedOptions): DanbooruRelatedResult {
    const tags = Array.from(new Set((options.tags || []).map(normalizeTag).filter(Boolean)));
    if (tags.length === 0) throw new Error('Select at least one corpus tag.');
    const status = this.getStatus();
    if (status.indexedPosts === 0) throw new Error('The Danbooru relation corpus has not been built yet.');

    const requestedClassifier = String(options.classifier || 'smart').trim().toLowerCase();
    const includeExplicit = options.includeExplicit === true;
    const limit = clampInteger(options.limit, 80, 1, 160);
    const minimumSupport = clampInteger(options.minimumSupport, 20, 1, 100_000);
    const sampleLimit = clampInteger(options.sampleLimit, MAX_RELATED_SAMPLE_POSTS, 100, MAX_RELATED_SAMPLE_POSTS);
    const matchExpression = buildMatchExpression(tags);
    const matchedPostCount = Number((this.db.prepare(
      'SELECT COUNT(*) AS count FROM danbooru_corpus_fts WHERE danbooru_corpus_fts MATCH ?',
    ).get(matchExpression) as { count?: number } | null)?.count || 0);
    // Keep broad-corpus noise out without making uncommon intersections blank.
    // Ten percent means a 12-post niche can still suggest a tag seen once, while
    // ordinary searches against the full corpus retain the requested floor.
    const effectiveMinimumSupport = Math.min(
      minimumSupport,
      Math.max(1, Math.floor(matchedPostCount * 0.1)),
    );

    const cacheKey = JSON.stringify({
      version: RELATED_CACHE_VERSION,
      tags,
      requestedClassifier,
      includeExplicit,
      limit,
      minimumSupport,
      sampleLimit,
      indexedPosts: status.indexedPosts,
    });
    if (status.state !== 'running') {
      const cached = this.db.prepare('SELECT payload FROM danbooru_corpus_related_cache WHERE cache_key = ?').get(cacheKey) as { payload?: string } | null;
      if (cached?.payload) {
        try {
          return JSON.parse(cached.payload) as DanbooruRelatedResult;
        } catch {
          // Recompute malformed cache entries.
        }
      }
    }

    const seedClassifiers = new Set<DanbooruTagClassifierId>(tags.flatMap((tag) => classifyDanbooruTag(tag, 0)));
    const filterClassifiers = requestedClassifier === 'smart'
      ? seedClassifiers
      : requestedClassifier === 'all'
        ? new Set<DanbooruTagClassifierId>()
        : new Set<DanbooruTagClassifierId>([requestedClassifier as DanbooruTagClassifierId]);
    const selected = new Set(tags);
    const counts = new Map<string, number>();
    let sampledPostCount = 0;
    const rows = this.db.prepare(`
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

    const countTagPosts = this.db.prepare(
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
    if (status.state !== 'running') {
      this.db.prepare(`
        INSERT INTO danbooru_corpus_related_cache (cache_key, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
      `).run(cacheKey, JSON.stringify(result), Date.now());
    }
    return result;
  }

  private ensureSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS danbooru_corpus_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS danbooru_corpus_posts (
        id INTEGER PRIMARY KEY,
        score INTEGER NOT NULL DEFAULT 0,
        rating TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        tag_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS danbooru_corpus_fts
      USING fts5(tags, tokenize="unicode61 tokenchars '_'")
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS danbooru_corpus_related_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.seedMeta();
  }

  private seedMeta(): void {
    const defaults: Record<string, string | number> = {
      state: 'empty',
      corpus_mode: 'all',
      target_posts: DEFAULT_TARGET_POSTS,
      available_posts: 0,
      available_posts_checked_at: 0,
      available_posts_minimum_score: 0,
      scanned_posts: 0,
      indexed_posts: 0,
      run_started_posts: 0,
      minimum_score: 0,
      request_count: 0,
      last_batch_size: 0,
      tag_matrix_json: '',
      error: '',
    };
    const insert = this.db.prepare('INSERT OR IGNORE INTO danbooru_corpus_meta (key, value) VALUES (?, ?)');
    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(defaults)) insert.run(key, String(value));
    });
    tx();
  }

  private getMeta(key: string): string {
    return String((this.db.prepare('SELECT value FROM danbooru_corpus_meta WHERE key = ?').get(key) as { value?: string } | null)?.value || '');
  }

  private metaNumber(key: string): number | null {
    const numeric = Number(this.getMeta(key));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  private setMetaValues(values: Record<string, string | number | null>): void {
    const upsert = this.db.prepare(`
      INSERT INTO danbooru_corpus_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(values)) upsert.run(key, value === null ? '' : String(value));
    });
    tx();
  }

  private async runCorpusBuild(options: {
    targetPosts: number;
    allPosts: boolean;
    minimumScore: number;
    authorization: string;
    userAgent: string;
    requestDelayMs: number;
    requestConcurrency: number;
    signal: AbortSignal;
    token: number;
  }): Promise<void> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': options.userAgent,
    };
    if (options.authorization) headers.Authorization = options.authorization;

    try {
      while (!options.signal.aborted && this.runToken === options.token) {
        const status = this.getStatus();
        const progressPosts = options.allPosts ? status.scannedPosts : status.indexedPosts;
        if (progressPosts >= options.targetPosts) {
          this.setMetaValues({ state: 'completed', completed_at: Date.now(), updated_at: Date.now(), error: '' });
          break;
        }

        if (options.allPosts && status.lastPostId) {
          const firstRangeHigh = status.lastPostId - 1;
          if (firstRangeHigh < 1) {
            this.setMetaValues({ state: 'completed', completed_at: Date.now(), updated_at: Date.now(), error: '' });
            break;
          }

          const ranges: Array<{ low: number; high: number }> = [];
          let rangeHigh = firstRangeHigh;
          for (let worker = 0; worker < options.requestConcurrency && rangeHigh >= 1; worker += 1) {
            const rangeLow = Math.max(1, rangeHigh - DANBOORU_POST_BATCH_SIZE + 1);
            ranges.push({ low: rangeLow, high: rangeHigh });
            rangeHigh = rangeLow - 1;
          }

          const batches = await Promise.all(ranges.map(({ low, high }) => {
            const rangeTags = [`id:${low}..${high}`];
            if (options.minimumScore > 0) rangeTags.push(`score:>=${options.minimumScore}`);
            const params = new URLSearchParams({
              limit: String(DANBOORU_POST_BATCH_SIZE),
              tags: rangeTags.join(' '),
              only: 'id,score,rating,created_at,tag_string_general',
            });
            return this.fetchPostBatch(`https://danbooru.donmai.us/posts.json?${params}`, headers, options.signal);
          }));
          if (options.signal.aborted || this.runToken !== options.token) return;

          const ingestedBatch = batches.flat();
          this.ingestPosts(ingestedBatch);
          const nextCursor = ranges[ranges.length - 1].low;
          this.setMetaValues({
            last_post_id: nextCursor,
            request_count: status.requestCount + ranges.length,
            last_batch_size: ingestedBatch.length,
            scanned_posts: status.scannedPosts + ingestedBatch.length,
            updated_at: Date.now(),
            error: '',
          });

          const nextStatus = this.getStatus();
          if (nextStatus.scannedPosts >= options.targetPosts) continue;
          await abortableDelay(options.requestDelayMs, options.signal);
          continue;
        }

        const params = new URLSearchParams({
          limit: String(DANBOORU_POST_BATCH_SIZE),
          only: 'id,score,rating,created_at,tag_string_general',
        });
        if (options.minimumScore > 0) params.set('tags', `score:>=${options.minimumScore}`);
        if (status.lastPostId) params.set('page', `b${status.lastPostId}`);
        const data = await this.fetchPostBatch(`https://danbooru.donmai.us/posts.json?${params}`, headers, options.signal);
        if (options.signal.aborted || this.runToken !== options.token) return;
        if (data.length === 0) {
          this.setMetaValues({ state: 'completed', completed_at: Date.now(), updated_at: Date.now(), error: '' });
          break;
        }

        const remainingPosts = Math.max(0, options.targetPosts - progressPosts);
        const ingestedBatch = data.slice(0, remainingPosts);
        const ingested = this.ingestPosts(ingestedBatch);
        const nextCursor = ingested.lastPostId;
        if (!nextCursor || (status.lastPostId && nextCursor >= status.lastPostId)) {
          throw new Error('Danbooru corpus pagination stopped advancing. The partial corpus was preserved.');
        }
        this.setMetaValues({
          last_post_id: nextCursor,
          request_count: status.requestCount + 1,
          last_batch_size: ingestedBatch.length,
          scanned_posts: status.scannedPosts + ingestedBatch.length,
          updated_at: Date.now(),
          error: '',
        });

        const nextStatus = this.getStatus();
        if ((options.allPosts ? nextStatus.scannedPosts : nextStatus.indexedPosts) >= options.targetPosts) continue;
        await abortableDelay(options.requestDelayMs, options.signal);
      }
    } catch (error) {
      if (isAbortError(error) || options.signal.aborted || this.runToken !== options.token) return;
      this.setMetaValues({
        state: 'failed',
        error: error instanceof Error ? error.message : 'Danbooru corpus build failed.',
        updated_at: Date.now(),
      });
    }
  }

  private async fetchPostBatch(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<DanbooruCorpusPost[]> {
    let lastError = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(url, { headers, signal });
      if (response.ok) {
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error('Danbooru returned an invalid corpus response.');
        return payload as DanbooruCorpusPost[];
      }
      const body = await response.text().catch(() => '');
      lastError = `Danbooru corpus request failed: ${response.status}${body ? ` ${body.slice(0, 160)}` : ''}`;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) break;
      const retryAfterSeconds = Number(response.headers.get('retry-after') || 0);
      const waitMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1_000 : Math.min(60_000, 5_000 * (2 ** attempt));
      await abortableDelay(waitMs, signal);
    }
    throw new Error(lastError || 'Danbooru corpus request failed.');
  }

  private async fetchPostCount(url: string, headers: Record<string, string>): Promise<number> {
    let lastError = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const payload = await response.json() as { counts?: { posts?: unknown } };
        const count = clampInteger(payload?.counts?.posts, 0, 1, MAX_TARGET_POSTS);
        if (!count) throw new Error('Danbooru returned an invalid public post count.');
        return count;
      }
      const body = await response.text().catch(() => '');
      lastError = `Danbooru post-count request failed: ${response.status}${body ? ` ${body.slice(0, 160)}` : ''}`;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) break;
      const retryAfterSeconds = Number(response.headers.get('retry-after') || 0);
      const waitMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1_000 : Math.min(60_000, 5_000 * (2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    throw new Error(lastError || 'Danbooru post-count request failed.');
  }
}
