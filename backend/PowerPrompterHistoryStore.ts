import * as fs from 'fs/promises';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

type HistorySummary = { id: string; updatedAt: number; createdAt: number };
type Document<S, Q> = S & { snapshot: Q };
type Manifest<S> = { storageVersion: 2; summary: S; snapshotFile: string };

// The manifest is the commit point. Large snapshots are immutable; progress only
// replaces the small manifest. All operations on one ID share the same lock.
export class PowerPrompterHistoryStore<S extends HistorySummary, Q> {
  private operations = new Map<string, Promise<unknown>>();

  constructor(private options: {
    directory: string;
    writeAtomic: (path: string, contents: string) => Promise<void>;
    normalizeLegacy: (value: unknown, id: string) => Document<S, Q> | null;
    summarize: (document: Document<S, Q>) => S;
  }) {}

  private locked<T>(id: string, run: () => Promise<T>): Promise<T> {
    if (!id || basename(id) !== id || !/^[a-z0-9._ -]+$/i.test(id) || id === '.' || id === '..') {
      return Promise.reject(new Error('Invalid queue history ID.'));
    }
    const result = (this.operations.get(id) || Promise.resolve()).catch(() => undefined).then(run);
    this.operations.set(id, result);
    const release = () => { if (this.operations.get(id) === result) this.operations.delete(id); };
    void result.then(release, release);
    return result;
  }

  private path(id: string) { return join(this.options.directory, `${id}.pphistory.json`); }

  private snapshotPath(id: string, file: string) {
    if (basename(file) !== file || !file.startsWith(`${id}.`) || !file.endsWith('.ppsnapshot.json')) {
      throw new Error('Invalid queue history snapshot reference.');
    }
    return join(this.options.directory, file);
  }

  private async read(id: string): Promise<Manifest<S> | null> {
    let raw;
    try { raw = JSON.parse(await fs.readFile(this.path(id), 'utf8')); }
    catch (error: any) { if (error?.code === 'ENOENT') return null; throw error; }
    if (raw?.storageVersion === 2) {
      this.snapshotPath(id, raw.snapshotFile);
      if (raw.summary?.id !== id) throw new Error('Invalid queue history summary.');
      return raw;
    }
    const legacy = this.options.normalizeLegacy(raw, id);
    if (!legacy) throw new Error('Queue history could not be read.');
    // Migrate on first access, without discarding the old file until committed.
    return this.commit(id, this.options.summarize(legacy), legacy.snapshot);
  }

  private async commit(id: string, summary: S, snapshot: Q, previous?: Manifest<S>): Promise<Manifest<S>> {
    const snapshotFile = `${id}.${randomUUID()}.ppsnapshot.json`;
    const path = this.snapshotPath(id, snapshotFile);
    const manifest: Manifest<S> = { storageVersion: 2, summary, snapshotFile };
    await this.options.writeAtomic(path, JSON.stringify(snapshot));
    try { await this.options.writeAtomic(this.path(id), JSON.stringify(manifest)); }
    catch (error) { await fs.rm(path, { force: true }).catch(() => undefined); throw error; }
    if (previous) {
      await fs.rm(this.snapshotPath(id, previous.snapshotFile), { force: true }).catch(() => undefined);
    }
    return manifest;
  }

  create(id: string, build: () => Document<S, Q> | null): Promise<S | null> {
    return this.locked(id, async () => {
      const existing = await this.read(id);
      if (existing) return existing.summary;
      const document = build();
      if (!document) return null;
      return (await this.commit(id, this.options.summarize(document), document.snapshot)).summary;
    });
  }

  summary(id: string): Promise<S | null> {
    return this.locked(id, async () => (await this.read(id))?.summary || null);
  }

  load(id: string): Promise<Document<S, Q> | null> {
    return this.locked(id, async () => {
      const manifest = await this.read(id);
      if (!manifest) return null;
      const snapshot = JSON.parse(await fs.readFile(this.snapshotPath(id, manifest.snapshotFile), 'utf8')) as Q;
      return { ...manifest.summary, snapshot };
    });
  }

  update(id: string, patch: (current: S) => S | null, snapshot?: Q): Promise<S | null> {
    return this.locked(id, async () => {
      const existing = await this.read(id);
      if (!existing) return null;
      const patched = patch(existing.summary);
      if (!patched) return existing.summary;
      const next = { ...patched, id };
      // Ignore timestamp-only changes, including reconnects and sampling steps.
      if (snapshot === undefined && JSON.stringify({ ...next, updatedAt: 0 }) === JSON.stringify({ ...existing.summary, updatedAt: 0 })) {
        return existing.summary;
      }
      if (snapshot !== undefined) return (await this.commit(id, next, snapshot, existing)).summary;
      await this.options.writeAtomic(this.path(id), JSON.stringify({ ...existing, summary: next }));
      return next;
    });
  }

  delete(id: string): Promise<boolean> {
    return this.locked(id, async () => {
      const existing = await this.read(id);
      if (!existing) return false;
      await fs.rm(this.path(id));
      await fs.rm(this.snapshotPath(id, existing.snapshotFile), { force: true }).catch(() => undefined);
      return true;
    });
  }

  async list(): Promise<S[]> {
    let entries;
    try { entries = await fs.readdir(this.options.directory); }
    catch (error: any) { if (error?.code === 'ENOENT') return []; throw error; }
    const items: S[] = [];
    for (const file of entries) {
      if (!file.endsWith('.pphistory.json')) continue;
      try {
        const item = await this.summary(file.slice(0, -'.pphistory.json'.length));
        if (item) items.push(item);
      } catch { /* Leave damaged histories on disk for manual recovery. */ }
    }
    return items.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  }
}
