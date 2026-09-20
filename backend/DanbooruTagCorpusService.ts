import { Database } from 'bun:sqlite';
import { calculateDanbooruRelatedTags, normalizeTag, normalizeTagString, type DanbooruRelatedOptions, type DanbooruRelatedResult } from './DanbooruRelatedQuery';
export type { DanbooruRelatedOptions, DanbooruRelatedResult, DanbooruRelatedSuggestion } from './DanbooruRelatedQuery';
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


function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(numeric)));
}


function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
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
  private starting = false;
  private closed = false;
  private runToken = 0;
  private runFailure: { error: string; updatedAt: number } | null = null;
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
    this.indexedPosts = Number((this.db.query(
      'SELECT COUNT(*) AS count FROM danbooru_corpus_posts',
    ).get() as { count?: number } | null)?.count || 0);
    this.setMetaValues({ indexed_posts: this.indexedPosts });
    this.latestTagMatrix = parseTagMatrix(this.getMeta('tag_matrix_json'));

    if (this.getMeta('state') === 'running') {
      this.setMetaValues({ state: 'paused', updated_at: Date.now() });
    }
  }

  close(): void {
    if (this.closed) return;
    try { this.pause(); }
    finally {
      this.closed = true;
      this.db.close();
    }
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
    const state: CorpusRunState = this.runFailure ? 'failed'
      : progressPosts >= targetPosts && rawState !== 'running' && rawState !== 'failed' ? 'completed' : rawState;
    const startedAt = this.metaNumber('started_at');
    const updatedAt = this.runFailure?.updatedAt ?? this.metaNumber('updated_at');
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
      error: this.runFailure?.error ?? String(this.getMeta('error') || ''),
    };
  }

  async refreshAvailablePostCount(options: {
    minimumScore?: number;
    authorization?: string;
    userAgent?: string;
    force?: boolean;
    signal?: AbortSignal;
  } = {}): Promise<DanbooruCorpusStatus> {
    if (this.closed) throw new Error('The corpus database is closed.');
    const token = this.runToken;
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
      options.signal,
    );
    if (this.closed) throw new Error('The corpus database is closed.');
    if (token !== this.runToken || options.signal?.aborted) return this.getStatus();
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
    if (this.closed) throw new Error('The corpus database is closed.');
    if (this.runner || this.starting) return this.getStatus();
    if (options.rebuild) this.reset();
    const token = ++this.runToken;
    const controller = new AbortController();
    this.starting = true;
    this.abortController = controller;
    try {
      return await this.startBuild(options, token, controller);
    } catch (error) {
      if (this.closed) throw new Error('The corpus database is closed.');
      if (this.runToken !== token || controller.signal.aborted) return this.getStatus();
      throw error;
    } finally {
      if (this.runToken === token) {
        this.starting = false;
        if (!this.runner) this.abortController = null;
      }
    }
  }

  private async startBuild(options: DanbooruCorpusStartOptions, token: number, controller: AbortController): Promise<DanbooruCorpusStatus> {
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
        signal: controller.signal,
      });
      if (this.closed) throw new Error('The corpus database is closed.');
      if (this.runToken !== token || controller.signal.aborted) return this.getStatus();
    }
    const targetPosts = mode === 'all'
      ? current.availablePosts || current.targetPosts
      : clampInteger(options.targetPosts, current.targetPosts || DEFAULT_TARGET_POSTS, 1, MAX_TARGET_POSTS);
    const progressPosts = mode === 'all' ? current.scannedPosts : current.indexedPosts;
    if (progressPosts >= targetPosts) {
      this.setMetaValues({ corpus_mode: mode, target_posts: targetPosts, state: 'completed', completed_at: Date.now(), updated_at: Date.now(), error: '' });
      this.runFailure = null;
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

    this.runFailure = null;
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
      controller.abort();
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
    this.starting = false;
    const current = this.getStatus();
    if (current.state === 'running') {
      try {
        this.setMetaValues({ state: current.indexedPosts > 0 ? 'paused' : 'empty', updated_at: Date.now() });
      } catch (error) {
        this.recordRunFailure(error);
        throw error;
      }
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
    this.runFailure = null;
    this.indexedPosts = 0;
    this.latestTagMatrix = emptyTagMatrix();
    this.db.run("INSERT INTO danbooru_corpus_fts(danbooru_corpus_fts) VALUES('optimize')");
    return this.getStatus();
  }

  ingestPosts(posts: DanbooruCorpusPost[]): { inserted: number; lastPostId: number | null } {
    return this.ingestBatch(posts);
  }

  private ingestBatch(
    posts: DanbooruCorpusPost[],
    progress?: (lastPostId: number | null) => Record<string, string | number | null>,
  ): { inserted: number; lastPostId: number | null } {
    const insertPost = this.db.query(`
      INSERT OR IGNORE INTO danbooru_corpus_posts (id, score, rating, created_at, tag_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertTags = this.db.query('INSERT INTO danbooru_corpus_fts(rowid, tags) VALUES (?, ?)');
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

    for (const post of normalizedPosts) lastPostId = lastPostId === null ? post.id : Math.min(lastPostId, post.id);
    const progressValues = progress?.(lastPostId) || {};
    const tagMatrix = this.buildTagMatrix(
      normalizedPosts.filter((post) => post.tags.length > 0).map((post) => post.tags),
      lastPostId,
    );

    const tx = this.db.transaction(() => {
      for (const post of normalizedPosts) {
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
      this.setMetaValues({
        ...progressValues,
        indexed_posts: this.indexedPosts + inserted,
        tag_matrix_json: JSON.stringify(tagMatrix),
      });
    });
    tx();
    // Publish cached status only after rows, search data and the cursor commit together.
    this.indexedPosts += inserted;
    this.latestTagMatrix = tagMatrix;
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
    return calculateDanbooruRelatedTags(this.db, this.getStatus(), options);
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
    const insert = this.db.query('INSERT OR IGNORE INTO danbooru_corpus_meta (key, value) VALUES (?, ?)');
    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(defaults)) insert.run(key, String(value));
    });
    tx();
  }

  private getMeta(key: string): string {
    return String((this.db.query('SELECT value FROM danbooru_corpus_meta WHERE key = ?').get(key) as { value?: string } | null)?.value || '');
  }

  private metaNumber(key: string): number | null {
    const numeric = Number(this.getMeta(key));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  private setMetaValues(values: Record<string, string | number | null>): void {
    const upsert = this.db.query(`
      INSERT INTO danbooru_corpus_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(values)) upsert.run(key, value === null ? '' : String(value));
    });
    tx();
  }

  private recordRunFailure(error: unknown): void {
    this.runFailure = {
      error: error instanceof Error ? error.message : 'Danbooru corpus build failed.',
      updatedAt: Date.now(),
    };
    try {
      this.setMetaValues({ state: 'failed', error: this.runFailure.error, updated_at: this.runFailure.updatedAt });
    } catch (persistError) {
      // A storage failure must not hide the stopped runner behind stale database status.
      this.runFailure.error += ` Could not save the failure status: ${persistError instanceof Error ? persistError.message : String(persistError)}`;
    }
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
          const nextCursor = ranges[ranges.length - 1].low;
          this.ingestBatch(ingestedBatch, () => ({
            last_post_id: nextCursor,
            request_count: status.requestCount + ranges.length,
            last_batch_size: ingestedBatch.length,
            scanned_posts: status.scannedPosts + ingestedBatch.length,
            updated_at: Date.now(),
            error: '',
          }));

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
        this.ingestBatch(ingestedBatch, (nextCursor) => {
          if (!nextCursor || (status.lastPostId && nextCursor >= status.lastPostId)) {
            throw new Error('Danbooru corpus pagination stopped advancing. The partial corpus was preserved.');
          }
          return {
            last_post_id: nextCursor,
            request_count: status.requestCount + 1,
            last_batch_size: ingestedBatch.length,
            scanned_posts: status.scannedPosts + ingestedBatch.length,
            updated_at: Date.now(),
            error: '',
          };
        });

        const nextStatus = this.getStatus();
        if ((options.allPosts ? nextStatus.scannedPosts : nextStatus.indexedPosts) >= options.targetPosts) continue;
        await abortableDelay(options.requestDelayMs, options.signal);
      }
    } catch (error) {
      if (options.signal.aborted || this.runToken !== options.token) return;
      this.recordRunFailure(error);
    }
  }

  private async fetchPostBatch(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<DanbooruCorpusPost[]> {
    let lastError = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(url, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
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

  private async fetchPostCount(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<number> {
    let lastError = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const timeout = AbortSignal.timeout(30_000);
      const response = await fetch(url, { headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
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
      await abortableDelay(waitMs, signal || new AbortController().signal);
    }
    throw new Error(lastError || 'Danbooru post-count request failed.');
  }
}
