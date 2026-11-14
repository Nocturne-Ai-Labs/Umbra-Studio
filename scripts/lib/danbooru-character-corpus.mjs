import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';

// A read-only connection leaves an active corpus builder and its cursor alone.
export function readCharacterCorpus(databasePath, character, postFilter, limit) {
  if (!databasePath || !existsSync(databasePath)) return { posts: [], reason: 'No local corpus database' };
  const conditions = ['c.character = ?'];
  const parameters = [character];
  for (const token of String(postFilter || '').replaceAll(',', ' ').split(/\s+/).filter(Boolean)) {
    if (token === 'none') continue;
    const rating = token.match(/^(-?)rating:(g|general|s|sensitive|q|questionable|e|explicit)$/i);
    const score = token.match(/^score:(>=|<=|>|<|=)?(-?\d+)$/);
    if (rating) {
      conditions.push(`p.rating ${rating[1] ? '!=' : '='} ?`);
      parameters.push(rating[2][0].toLowerCase());
    } else if (score) {
      conditions.push(`p.score ${score[1] || '='} ?`);
      parameters.push(Number(score[2]));
    } else if (/^-?[\p{L}\p{N}_()\-]+$/u.test(token)) {
      const excluded = token.startsWith('-');
      conditions.push(`instr(' ' || f.tags || ' ', ?) ${excluded ? '=' : '>'} 0`);
      parameters.push(` ${excluded ? token.slice(1) : token} `);
    } else {
      return { posts: [], reason: `Filter ${token} needs live Danbooru search` };
    }
  }
  let db;
  try {
    db = new Database(databasePath, { readonly: true });
    db.run('PRAGMA busy_timeout = 1000');
    if (!db.query("SELECT name FROM sqlite_master WHERE name = 'danbooru_corpus_characters'").get()) {
      return { posts: [], reason: 'This older corpus has no character associations' };
    }
    const posts = db.query(`
      SELECT p.id, p.score, p.rating, f.tags AS tag_string_general,
             x.copyrights AS tag_string_copyright
      FROM danbooru_corpus_characters c
      JOIN danbooru_corpus_posts p ON p.id = c.post_id
      JOIN danbooru_corpus_fts f ON f.rowid = c.post_id
      JOIN danbooru_corpus_context x ON x.post_id = c.post_id
      WHERE ${conditions.join(' AND ')} ORDER BY c.post_id DESC LIMIT ?
    `).all(...parameters, limit);
    return { posts, reason: `${posts.length}/${limit} matching posts available locally` };
  } catch (error) {
    return { posts: [], reason: `Corpus unavailable (${error.message})` };
  } finally {
    db?.close();
  }
}
