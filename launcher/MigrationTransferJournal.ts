import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertSeparateMigrationPaths, resolveMigrationPath } from '../shared/migrationPaths';

type Identity = { dev: string; ino: string; size: string; mtime: string; kind: 'file' | 'link'; target?: string };
type Phase = 'planned' | 'staged' | 'backed_up' | 'published' | 'complete';
type Entry = { id: number; path: string; phase: Phase; source: string; previous: string | null; staged: string | null; backup: string | null };
export type MigrationTransferProgress = { totalFiles: number; processedFiles: number; totalBytes: number; processedBytes: number; currentItem: string };

export function isExcludedMigrationPath(sourceRoot: string, candidatePath: string): boolean {
  return relative(resolve(sourceRoot), resolve(candidatePath)).split(/[\\/]+/).some(part => part.trim().toLowerCase() === 'umbra-nodes');
}

function identity(path: string): Identity | null {
  let stat: fs.BigIntStats;
  try { stat = fs.lstatSync(path, { bigint: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Migration expected a file or link: ${path}`);
  return { dev: String(stat.dev), ino: String(stat.ino), size: String(stat.size), mtime: String(stat.mtimeNs),
    kind: stat.isSymbolicLink() ? 'link' : 'file', ...(stat.isSymbolicLink() ? { target: fs.readlinkSync(path) } : {}) };
}

function equal(a: Identity | null, b: Identity | null): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function requireIdentity(path: string, expected: Identity | null) {
  if (!equal(identity(path), expected)) throw new Error(`Migration file changed; retained for manual recovery: ${path}`);
}

function hash(path: string): string {
  const descriptor = fs.openSync(path, 'r');
  try {
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let count: number;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null))) digest.update(buffer.subarray(0, count));
    return digest.digest('hex');
  } finally { fs.closeSync(descriptor); }
}

function syncFile(path: string) {
  const mode = fs.statSync(path).mode;
  const readOnly = process.platform === 'win32' && !(mode & 0o200);
  if (readOnly) fs.chmodSync(path, mode | 0o200);
  try {
    const fd = fs.openSync(path, 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } finally { if (readOnly) fs.chmodSync(path, mode); }
}

function ensureDirectory(root: string, path: string) {
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== resolve(path)) throw new Error('Migration directory escaped its root.');
  let current = root;
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try { fs.mkdirSync(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Migration refuses a linked destination directory: ${current}`);
  }
}

function stageCopy(source: string, destination: string, expected: Identity) {
  requireIdentity(source, expected);
  if (expected.kind === 'link') {
    let type: 'file' | 'junction' | undefined;
    if (process.platform === 'win32') {
      try { type = fs.statSync(source).isDirectory() ? 'junction' : 'file'; } catch { type = 'file'; }
    }
    fs.symlinkSync(expected.target!, destination, type);
  } else {
    let copied = false;
    try { fs.linkSync(source, destination); }
    catch (error) {
      if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EMLINK'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      if (identity(destination)?.size !== expected.size || hash(source) !== hash(destination)) throw new Error('Migration copy verification failed.');
      copied = true;
    }
    if (copied) syncFile(destination);
  }
  requireIdentity(source, expected);
}

// Keep recovery data under User so future app updates preserve it. Path rewriting skips this directory.
export class MigrationTransferJournal {
  readonly root: string;
  private db: Database;
  private owner: Database | null = null;
  private run: number;
  private completed = false;
  private ownershipPath: string;
  private closed = false;
  readonly sourceRoot: string;
  readonly destinationRoot: string;

  constructor(sourceRoot: string, destinationRoot: string) {
    this.sourceRoot = resolveMigrationPath(sourceRoot);
    this.destinationRoot = resolveMigrationPath(destinationRoot);
    for (const name of ['User', 'Tools']) assertSeparateMigrationPaths(join(this.sourceRoot, name), join(this.destinationRoot, name));
    const roots = `${this.sourceRoot}\0${this.destinationRoot}`;
    const key = createHash('sha256').update(process.platform === 'win32' ? roots.toLowerCase() : roots).digest('hex').slice(0, 24);
    this.root = join(this.destinationRoot, 'User', 'Recovery', 'Migrations', `transfers-${key}`);
    this.ownershipPath = join(dirname(this.root), 'owner.sqlite');
    ensureDirectory(this.destinationRoot, this.root);
    this.acquire();
    try {
      const dbPath = join(this.root, 'receipts.sqlite');
      try { if (!fs.lstatSync(dbPath).isFile()) throw new Error('Invalid migration journal path.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      this.db = new Database(dbPath, { create: true });
      this.db.run('PRAGMA journal_mode = WAL');
      this.db.run('PRAGMA synchronous = FULL');
      this.db.run(`CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, complete INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY, run INTEGER NOT NULL, path TEXT NOT NULL,
          phase TEXT NOT NULL, source TEXT NOT NULL, previous TEXT, staged TEXT, backup TEXT, UNIQUE(run, path));`);
      const current = this.db.query('SELECT id, complete FROM runs ORDER BY id DESC LIMIT 1').get() as { id: number; complete: number } | null;
      if (!current) {
        this.run = Number((this.db.query('INSERT INTO runs DEFAULT VALUES RETURNING id').get() as { id: number }).id);
      } else { this.run = current.id; this.completed = current.complete === 1; }
    } catch (error) { this.db!?.close(); this.release(); throw error; }
  }

  private acquire() {
    try {
      try { if (!fs.lstatSync(this.ownershipPath).isFile()) throw new Error('Invalid migration ownership path.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      this.owner = new Database(this.ownershipPath, { create: true });
      this.owner.run('PRAGMA busy_timeout = 0');
      this.owner.run('CREATE TABLE IF NOT EXISTS ownership (id INTEGER PRIMARY KEY)');
      // A separate database holds the OS-backed lock while the receipt database commits each boundary.
      this.owner.run('BEGIN EXCLUSIVE');
    } catch (error) {
      this.release();
      throw new Error('A migration already owns this destination, or its ownership database is unavailable.', { cause: error });
    }
  }

  private release() {
    try { this.owner?.close(); } finally { this.owner = null; }
  }

  close() { if (!this.closed) { this.closed = true; try { this.db.close(); } finally { this.release(); } } }

  private paths(entry: Entry) {
    if (!/^(User|Tools)\//.test(entry.path) || entry.path.split('/').some(part => !part || part === '.' || part === '..' || /[:\\]/.test(part))) throw new Error('Invalid migration receipt path.');
    const source = join(this.sourceRoot, ...entry.path.split('/'));
    const destination = join(this.destinationRoot, ...entry.path.split('/'));
    if (entry.staged && ['backed_up', 'published', 'complete'].includes(entry.phase)
      && equal(identity(destination), JSON.parse(entry.staged))) {
      // Same-volume staging uses hard links; a published destination can still share the source inode until unlink.
      assertSeparateMigrationPaths(dirname(source), dirname(destination));
    } else assertSeparateMigrationPaths(source, destination);
    const area = join(this.root, String(entry.id));
    ensureDirectory(this.root, area);
    ensureDirectory(this.destinationRoot, dirname(destination));
    return { source, destination, incoming: join(area, 'incoming'), previous: join(area, 'previous') };
  }

  plan() {
    const previousRun = this.run;
    const wasCompleted = this.completed;
    const insert = this.db.query('INSERT OR IGNORE INTO entries(run, path, phase, source, previous) VALUES (?, ?, ?, ?, ?)');
    const existing = this.db.query('SELECT 1 FROM entries WHERE run = ? AND path = ?');
    const walk = (path: string) => {
      const rel = relative(this.sourceRoot, path).split(sep).join('/');
      if (isExcludedMigrationPath(this.sourceRoot, path)) return;
      // This destination-owned progress file changes during migration and must not be imported from the old install.
      if (rel.toLowerCase() === 'user/config/onboarding.json'
        || /^User\/Recovery\/Migrations\/owner\.sqlite(?:-journal|-wal|-shm)?$/i.test(rel)) return;
      const stat = fs.lstatSync(path);
      if (stat.isDirectory() && !stat.isSymbolicLink()) { for (const child of fs.readdirSync(path)) walk(join(path, child)); return; }
      if (this.completed) {
        this.run = Number((this.db.query('INSERT INTO runs DEFAULT VALUES RETURNING id').get() as { id: number }).id);
        this.completed = false;
      }
      if (existing.get(this.run, rel)) return;
      const source = identity(path)!;
      const destination = join(this.destinationRoot, ...rel.split('/'));
      const recoveryRelative = relative(this.root, destination);
      if (!recoveryRelative || (!recoveryRelative.startsWith(`..${sep}`) && recoveryRelative !== '..' && !isAbsolute(recoveryRelative))) throw new Error('Incoming migration recovery files overlap the active journal. Preserve them separately before retrying.');
      assertSeparateMigrationPaths(path, destination);
      ensureDirectory(this.destinationRoot, dirname(destination));
      insert.run(this.run, rel, 'planned', JSON.stringify(source), JSON.stringify(identity(destination)));
    };
    try { this.db.transaction(() => {
      for (const name of ['User', 'Tools']) {
        const tree = join(this.sourceRoot, name);
        if (!fs.existsSync(tree)) continue;
        if (!fs.lstatSync(tree).isDirectory() || fs.lstatSync(tree).isSymbolicLink()) throw new Error(`Migration requires a real ${name} directory.`);
        walk(tree);
      }
    })(); } catch (error) { this.run = previousRun; this.completed = wasCompleted; throw error; }
  }

  progress(): MigrationTransferProgress {
    const counts = this.db.query(`SELECT COUNT(*) AS totalFiles,
      COALESCE(SUM(phase = 'complete'), 0) AS processedFiles,
      COALESCE(SUM(CASE WHEN json_extract(source, '$.kind') = 'file' THEN CAST(json_extract(source, '$.size') AS INTEGER) ELSE 0 END), 0) AS totalBytes,
      COALESCE(SUM(CASE WHEN phase = 'complete' AND json_extract(source, '$.kind') = 'file' THEN CAST(json_extract(source, '$.size') AS INTEGER) ELSE 0 END), 0) AS processedBytes
      FROM entries WHERE run = ?`).get(this.run) as Omit<MigrationTransferProgress, 'currentItem'>;
    const pending = this.db.query("SELECT path FROM entries WHERE run = ? AND phase != 'complete' ORDER BY id LIMIT 1").get(this.run) as { path: string } | null;
    return { ...counts, currentItem: pending?.path || '' };
  }

  hasTree(name: 'User' | 'Tools'): boolean { return !!this.db.query('SELECT 1 FROM entries WHERE run = ? AND path LIKE ? LIMIT 1').get(this.run, `${name}/%`); }

  conflictCount(): number { return Number((this.db.query("SELECT COUNT(*) AS count FROM entries WHERE run = ? AND phase = 'complete' AND previous != 'null'").get(this.run) as { count: number }).count); }

  private update(entry: Entry, phase: Phase, staged = entry.staged, backup = entry.backup) {
    this.db.query('UPDATE entries SET phase = ?, staged = ?, backup = ? WHERE id = ? AND run = ?').run(phase, staged, backup, entry.id, this.run);
    Object.assign(entry, { phase, staged, backup });
  }

  private transfer(entry: Entry) {
    if (!['planned', 'staged', 'backed_up', 'published', 'complete'].includes(entry.phase)) throw new Error('Unsupported migration receipt phase.');
    const paths = this.paths(entry);
    const source = JSON.parse(entry.source) as Identity;
    const previous = JSON.parse(entry.previous || 'null') as Identity | null;
    if (entry.phase === 'complete') {
      if (!identity(paths.destination)) throw new Error(`A completed migration destination is missing: ${paths.destination}`);
      if (identity(paths.source)) throw new Error(`A source file reappeared after migration; review it before continuing: ${paths.source}`);
      return;
    }
    if (entry.phase === 'planned') {
      requireIdentity(paths.source, source);
      requireIdentity(paths.destination, previous);
      // An interrupted, unpublished copy can only be discarded while its source is unchanged.
      if (identity(paths.incoming)) fs.rmSync(paths.incoming, { force: true });
      stageCopy(paths.source, paths.incoming, source);
      this.update(entry, 'staged', JSON.stringify(identity(paths.incoming)));
    }
    const staged = JSON.parse(entry.staged!) as Identity;
    if (entry.phase === 'staged') {
      requireIdentity(paths.incoming, staged);
      requireIdentity(paths.destination, previous);
      if (previous) {
        if (identity(paths.previous)) fs.rmSync(paths.previous, { force: true });
        stageCopy(paths.destination, paths.previous, previous);
      }
      this.update(entry, 'backed_up', entry.staged, JSON.stringify(identity(paths.previous)));
    }
    if (entry.phase === 'backed_up') {
      requireIdentity(paths.previous, JSON.parse(entry.backup || 'null'));
      if (identity(paths.incoming)) {
        requireIdentity(paths.source, source);
        requireIdentity(paths.incoming, staged);
        requireIdentity(paths.destination, previous);
        fs.renameSync(paths.incoming, paths.destination);
      } else requireIdentity(paths.destination, staged); // Rename committed before its receipt did.
      this.update(entry, 'published');
    }
    if (entry.phase === 'published') {
      requireIdentity(paths.destination, staged);
      const remaining = identity(paths.source);
      if (remaining) {
        requireIdentity(paths.source, source);
        try {
          try { fs.unlinkSync(paths.source); }
          catch (error) {
            if (process.platform !== 'win32' || (error as NodeJS.ErrnoException).code !== 'EPERM'
              || source.kind !== 'file' || (fs.statSync(paths.source).mode & 0o200)) throw error;
            fs.rmSync(paths.source, { force: true });
          }
        }
        catch (error) { throw new Error(`Destination saved, but the source could not be removed. Retry migration to finish cleanup. Source: ${paths.source}. ${(error as Error).message}`); }
      }
      this.update(entry, 'complete');
    }
  }

  move(onProgress?: (progress: MigrationTransferProgress) => void) {
    const progress = this.progress();
    let cursor = 0;
    for (;;) {
      const entries = this.db.query('SELECT * FROM entries WHERE run = ? AND id > ? ORDER BY id LIMIT 256').all(this.run, cursor) as Entry[];
      if (!entries.length) break;
      for (const entry of entries) {
        const wasComplete = entry.phase === 'complete';
        this.transfer(entry);
        if (!wasComplete) {
          progress.processedFiles++;
          const source = JSON.parse(entry.source) as Identity;
          progress.processedBytes += source.kind === 'file' ? Number(source.size) : 0;
        }
        onProgress?.({ ...progress, currentItem: entry.path });
        cursor = entry.id;
      }
    }
  }

  complete() {
    const progress = this.progress();
    if (progress.processedFiles !== progress.totalFiles) throw new Error('Migration still has unfinished transfers.');
    this.db.query('UPDATE runs SET complete = 1 WHERE id = ?').run(this.run);
    this.completed = true;
  }

  writeRecoveryReport() {
    const items = this.db.query("SELECT * FROM entries WHERE run = ? AND (previous != 'null' OR phase != 'complete') ORDER BY id").all(this.run) as Entry[];
    const report = {
      version: 1, run: this.run, sourceRoot: this.sourceRoot, destinationRoot: this.destinationRoot,
      ...this.progress(),
      items: items.map(entry => ({ path: entry.path, phase: entry.phase,
        retainedDestination: entry.previous !== 'null' && entry.backup !== 'null' && fs.existsSync(join(this.root, String(entry.id), 'previous'))
          ? join(String(entry.id), 'previous') : null })),
    };
    const temporary = join(this.root, `recovery-${this.run}-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      syncFile(temporary);
      fs.renameSync(temporary, join(this.root, `recovery-${this.run}.json`));
    } finally { try { fs.unlinkSync(temporary); } catch { /* Already published or unavailable. */ } }
  }
}
