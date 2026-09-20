import { Database } from 'bun:sqlite';

type Entry = { path: string; cursor: number; failures: number };

// SQLite's temporary store bounds the page cache without discarding pending
// folders. It contains scheduling metadata only and is removed on connection exit.
export class GalleryWarmupScheduler {
  private db?: Database;
  private running = false;
  private count = 0;
  private stamp = 0;
  private preferPriority = true;

  constructor(
    private readonly priorityLimit = 64,
    private readonly intervalMs = 60_000,
    private readonly clock = Date.now,
  ) {
    try {
      this.db = new Database(':memory:');
      this.db.exec(`
        PRAGMA temp_store=FILE;
        CREATE TEMP TABLE warmup (
          path TEXT PRIMARY KEY, due INTEGER NOT NULL DEFAULT 0,
          failures INTEGER NOT NULL DEFAULT 0, cursor INTEGER NOT NULL DEFAULT 0,
          visited INTEGER NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 0,
          stamp INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL DEFAULT 0
        );
        PRAGMA temp.cache_size=-1024;
        CREATE INDEX temp.warmup_due ON warmup(priority, visited, due);
        CREATE INDEX temp.warmup_priority ON warmup(priority, stamp DESC);
        CREATE INDEX temp.warmup_expiry ON warmup(expires);
      `);
    } catch { this.disable(); }
  }

  register(path: string, priority = false, expires = 0): boolean {
    if (!this.db || !path) return false;
    try {
      const result = this.db.query('INSERT OR IGNORE INTO warmup (path, expires) VALUES (?, ?)').run(path, expires);
      this.count += result.changes;
      if (!result.changes) {
        // Managed-output discovery is permanent for this process. A later UI
        // interest refresh must not downgrade that registration to a lease.
        this.db.query('UPDATE warmup SET expires=? WHERE path=? AND expires<>0 AND expires<>?')
          .run(expires, path, expires);
      }
      if (priority) {
        this.db.query('UPDATE warmup SET priority=1, stamp=? WHERE path=?').run(++this.stamp, path);
        this.db.query(`UPDATE warmup SET priority=0 WHERE priority=1 AND path NOT IN (
          SELECT path FROM warmup WHERE priority=1 ORDER BY stamp DESC LIMIT ?
        )`).run(Math.max(1, this.priorityLimit));
      }
      return true;
    } catch { this.disable(); return false; }
  }

  get size() { return this.count; }

  async tick(busy: boolean, visit: (path: string, cursor: number) => Promise<number>, now = this.clock()) {
    if (!this.db || this.running || busy) return;
    let next: Entry | null;
    try {
      const expired = this.db.query(`DELETE FROM warmup WHERE path IN (
        SELECT path FROM warmup WHERE expires>0 AND expires<=? LIMIT 64
      )`).run(now);
      this.count -= expired.changes;
      const select = this.db.query(`SELECT path, cursor, failures FROM warmup
        WHERE priority=? AND due<=? AND (expires=0 OR expires>?) ORDER BY visited, due LIMIT 1`);
      next = select.get(Number(this.preferPriority), now, now) as Entry | null;
      next ??= select.get(Number(!this.preferPriority), now, now) as Entry | null;
    } catch { this.disable(); return; }
    if (!next) return;
    this.preferPriority = !this.preferPriority;
    this.running = true;
    const started = this.clock();
    let cursor = next.cursor;
    let failures = 0;
    try { cursor = await visit(next.path, cursor); }
    catch { failures = next.failures + 1; }
    finally {
      try {
        const delay = failures ? Math.min(600_000, 30_000 * 2 ** Math.min(5, failures - 1)) : this.intervalMs;
        const completed = now + Math.max(0, this.clock() - started);
        this.db?.query('UPDATE warmup SET cursor=?, failures=?, due=?, visited=1 WHERE path=?')
          .run(cursor, failures, completed + delay, next.path);
      } catch { this.disable(); }
      this.running = false;
    }
  }

  private disable() {
    this.close();
    console.warn('[Gallery] Background discovery unavailable; on-demand browsing remains enabled.');
  }

  close() {
    const db = this.db;
    this.db = undefined;
    this.count = 0;
    try { db?.close(); } catch { /* Disposable cache; never block browsing or shutdown. */ }
  }
}
