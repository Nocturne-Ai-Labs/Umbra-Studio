import { Database } from 'bun:sqlite';
import { createInterface } from 'node:readline';
import { calculateDanbooruRelatedTags, normalizeTag, type DanbooruRelatedOptions, type DanbooruRelatedResult } from './DanbooruRelatedQuery';

// Querying must never initialize the scan service: its constructor repairs scan state.
const db = new Database(process.argv[2], { readonly: true });
db.run('PRAGMA query_only = ON');
db.run('PRAGMA cache_size = -16384');
db.run('PRAGMA busy_timeout = 1000');
const cache = new Map<string, DanbooruRelatedResult>();
let cacheVersion = -1;
const dataVersion = () => Number((db.query('PRAGMA data_version').get() as { data_version: number }).data_version);
const meta = (key: string) => String((db.query('SELECT value FROM danbooru_corpus_meta WHERE key = ?').get(key) as { value?: string } | null)?.value || '');

const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  let id = '';
  try {
    const request = JSON.parse(line) as { id: string; options: DanbooruRelatedOptions };
    id = request.id;
    const tags = Array.from(new Set(request.options.tags.map(normalizeTag).filter(Boolean)));
    const key = JSON.stringify({ ...request.options, tags: [...tags].sort() });
    const version = dataVersion();
    if (cacheVersion !== version) { cache.clear(); cacheVersion = version; }
    let result = cache.get(key);
    if (!result) {
      // WAL readers keep a consistent view without holding up the corpus writer.
      result = db.transaction(() => calculateDanbooruRelatedTags(db, {
        indexedPosts: Number(meta('indexed_posts')) || 0,
        state: meta('state'),
      }, request.options, false))();
      if (dataVersion() === version) {
        cache.set(key, result);
        while (cache.size > 32) cache.delete(cache.keys().next().value!);
      }
    } else {
      cache.delete(key);
      cache.set(key, result);
    }
    process.stdout.write(`${JSON.stringify({ id, ok: true, result: { ...result, tags } })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ id, ok: false, error: error instanceof Error ? error.message : 'Corpus query failed.' })}\n`);
  }
});
input.on('close', () => { db.close(); });
