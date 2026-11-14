import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHARACTER_CLOTHING_POLICY } from './danbooru-character-sampling.mjs';

export function collectionPolicy(options) {
  return JSON.stringify({ version: 1, limit: Number.isFinite(options.limit) ? options.limit : 'all',
    clothingPolicy: CHARACTER_CLOTHING_POLICY,
    minTagPosts: options.minTagPosts, minCharacterPosts: options.minCharacterPosts,
    postSample: options.postSample, maxAttributes: options.maxAttributes, minFrequency: options.minFrequency,
    postFilter: String(options.postFilter || '').replaceAll(',', ' ').trim().split(/\s+/).sort().join(' '),
    outputLanguage: options.outputLanguage, removeUnderscores: options.removeUnderscores });
}

const payload = row => JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'options')));

export class CollectionStore {
  constructor(file, policy, resume) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA busy_timeout=3000');
    this.db.run('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.db.run('CREATE TABLE IF NOT EXISTS entries (tag TEXT PRIMARY KEY, payload TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 0)');
    this.db.run('CREATE TABLE IF NOT EXISTS cursors (category INTEGER PRIMARY KEY, payload TEXT NOT NULL)');
    const existing = this.meta('policy');
    if (resume && !existing) { this.close(); throw new Error('This CSV has no resumable collection state. Start a fresh collection with a new filename; the existing CSV is preserved.'); }
    if (resume && existing !== policy) { this.close(); throw new Error('Collection settings changed. Use a new filename for a fresh collection, or restore the original settings to resume. Existing results are preserved.'); }
    if (!resume) this.db.transaction(() => {
      this.db.run('DELETE FROM entries'); this.db.run('DELETE FROM cursors'); this.db.run('DELETE FROM metadata');
      this.setMeta('policy', policy); this.setMeta('batchNumber', '1');
    })();
  }
  meta(key) { return this.db.query('SELECT value FROM metadata WHERE key=?').get(key)?.value; }
  setMeta(key, value) { this.db.query('INSERT OR REPLACE INTO metadata VALUES (?,?)').run(key, value); }
  cursor(category) { const r = this.db.query('SELECT payload FROM cursors WHERE category=?').get(category); return r ? JSON.parse(r.payload) : null; }
  recordPage(category, rows, cursor) {
    this.db.transaction(() => {
      const insert = this.db.query('INSERT OR IGNORE INTO entries(tag,payload) VALUES (?,?)');
      for (const row of rows) insert.run(row.tag, payload(row));
      this.db.query('INSERT OR REPLACE INTO cursors VALUES (?,?)').run(category, JSON.stringify(cursor));
    })();
  }
  rows(kind, options) {
    const condition = kind === 'processed' ? 'processed=1' : kind === 'active' ? 'processed=0 AND active=1' : 'processed=0 AND active=0';
    return this.db.query(`SELECT payload FROM entries WHERE ${condition} ORDER BY rowid`).all().map(r => ({ ...JSON.parse(r.payload), options }));
  }
  beginBatch(rows, batchNumber) {
    this.db.transaction(() => {
      this.setMeta('batchNumber', String(batchNumber));
      for (const row of rows) this.db.query('UPDATE entries SET active=1 WHERE tag=?').run(row.tag);
    })();
  }
  completeRow(row) {
    this.db.query('UPDATE entries SET payload=?,processed=1 WHERE tag=?').run(payload(row), row.tag);
  }
  completeBatch(rows, batchNumber) {
    this.db.transaction(() => {
      for (const row of rows) this.completeRow(row);
      this.db.run('UPDATE entries SET active=0 WHERE processed=1');
      this.setMeta('batchNumber', String(batchNumber + 1));
    })();
  }
  close() { this.db.close(); }
}

export class CharacterSampleCache {
  constructor(file) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.run('PRAGMA journal_mode=WAL'); this.db.run('PRAGMA busy_timeout=3000');
    this.db.run('CREATE TABLE IF NOT EXISTS samples (key TEXT PRIMARY KEY, expires INTEGER NOT NULL, payload TEXT NOT NULL)');
    this.db.query('DELETE FROM samples WHERE expires<?').run(Date.now());
  }
  key(character, filter, limit) { return JSON.stringify([1, character, filter.trim().split(/\s+/).sort().join(' '), limit]); }
  get(character, filter, limit, now = Date.now()) {
    const value = this.db.query('SELECT payload FROM samples WHERE key=? AND expires>?').get(this.key(character, filter, limit), now);
    return value ? JSON.parse(value.payload) : null;
  }
  put(character, filter, limit, posts, now = Date.now()) {
    if (!Array.isArray(posts)) throw new Error('Only successful post arrays can be cached.');
    const metadata = posts.map(({ id, rating, tag_string_general, tag_string_character, tag_string_copyright }) => ({ id, rating, tag_string_general, tag_string_character, tag_string_copyright }));
    this.db.query('INSERT OR REPLACE INTO samples VALUES (?,?,?)').run(this.key(character, filter, limit), now + (posts.length ? 7 : 1) * 86400000, JSON.stringify(metadata));
  }
  close() { this.db.close(); }
}

export function mergeCharacterSamples(local, live, limit) {
  const unique = new Map();
  for (const post of [...live, ...local]) {
    if (!Number.isSafeInteger(Number(post.id)) || Number(post.id) <= 0) continue;
    if (!unique.has(Number(post.id))) unique.set(Number(post.id), post);
  }
  return [...unique.values()].sort((a,b) => Number(b.id) - Number(a.id)).slice(0,limit);
}
