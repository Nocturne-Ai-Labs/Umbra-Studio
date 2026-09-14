import * as fs from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export interface UmbraUiUpscaleStagingLease {
  cleanup(): Promise<void>;
  release(): Promise<void>;
}

export class UmbraUiUpscaleStagingStore {
  private readonly root: string;
  private readonly tails = new Map<string, Promise<void>>();
  private readonly owners = new Map<string, symbol>();

  constructor(root: string) {
    this.root = resolve(root);
  }

  private key(path: string): string {
    return process.platform === 'win32' ? path.toLowerCase() : path;
  }

  private batch(folder: string): string {
    const path = resolve(folder);
    if (this.key(dirname(path)) !== this.key(this.root) || !/^[a-z0-9][a-z0-9-]{7,95}$/i.test(basename(path))) {
      throw new Error('Invalid upscale staging batch.');
    }
    return path;
  }

  private file(input: string): { path: string; batch: string; key: string } {
    const path = resolve(input);
    const rel = relative(this.root, path);
    if (!rel || isAbsolute(rel) || rel.split(sep).length !== 2 || rel.startsWith(`..${sep}`)) {
      throw new Error('Invalid upscale staging path.');
    }
    return { path, batch: this.batch(dirname(path)), key: this.key(path) };
  }

  private async locked<T>(batches: string[], action: () => Promise<T>): Promise<T> {
    const keys = [...new Set(batches.map(path => this.key(path)))].sort();
    const enter = async (index: number): Promise<T> => {
      if (index === keys.length) return action();
      const key = keys[index];
      const previous = this.tails.get(key) || Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>(done => { release = done; });
      this.tails.set(key, current);
      await previous;
      try { return await enter(index + 1); }
      finally {
        release();
        if (this.tails.get(key) === current) this.tails.delete(key);
      }
    };
    return enter(0);
  }

  private async checkDirectory(path: string): Promise<void> {
    const stat = await fs.lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid upscale staging directory.');
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    const entry = this.file(path);
    await this.locked([entry.batch], async () => {
      if (this.owners.has(entry.key)) throw new Error('This staged image is already used by an upscale job.');
      await fs.mkdir(this.root, { recursive: true });
      await this.checkDirectory(this.root);
      await fs.mkdir(entry.batch, { recursive: true });
      await this.checkDirectory(entry.batch);
      const existing = await fs.lstat(entry.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('Invalid upscale staging file.');
      await fs.writeFile(entry.path, bytes);
    });
  }

  async cleanupBatch(folder: string): Promise<void> {
    const batch = this.batch(folder);
    await this.locked([batch], async () => {
      const prefix = `${this.key(batch)}${sep}`;
      if ([...this.owners.keys()].some(key => key.startsWith(prefix))) {
        throw new Error('This staging batch is still used by an upscale job.');
      }
      await this.checkDirectory(this.root).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      await this.checkDirectory(batch).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
      await fs.rm(batch, { recursive: true, force: true });
    });
  }

  async claim(paths: string[]): Promise<Map<string, UmbraUiUpscaleStagingLease>> {
    const entries = [...new Map(paths.map(path => { const entry = this.file(path); return [entry.key, entry] as const; })).values()];
    return this.locked(entries.map(entry => entry.batch), async () => {
      // Validate the entire selection before publishing ownership of any file.
      for (const entry of entries) {
        if (this.owners.has(entry.key)) throw new Error('This staged image is already used by an upscale job.');
        await this.checkDirectory(this.root);
        await this.checkDirectory(entry.batch);
        const stat = await fs.lstat(entry.path);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid upscale staging file.');
      }
      const leases = new Map<string, UmbraUiUpscaleStagingLease>();
      for (const entry of entries) {
        const owner = Symbol();
        this.owners.set(entry.key, owner);
        const finish = (remove: boolean) => this.locked([entry.batch], async () => {
          if (this.owners.get(entry.key) !== owner) return;
          try {
            if (remove) {
              await fs.rm(entry.path, { force: true });
              await fs.rmdir(entry.batch).catch(() => undefined);
            }
          } finally { this.owners.delete(entry.key); }
        });
        leases.set(entry.path, { cleanup: () => finish(true), release: () => finish(false) });
      }
      return leases;
    });
  }
}
