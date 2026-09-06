import * as fs from 'node:fs/promises';
import { join } from 'node:path';

export class GalleryTransferJournal {
  private readonly writes = new Map<string, Promise<void>>();
  constructor(private readonly directory: string) {}

  private path(id: string) {
    if (!/^fs(move|copy)-[\w-]+$/.test(id)) throw new Error('Invalid transfer ID');
    return join(this.directory, `${id}.json`);
  }

  async save(job: { id: string }) {
    const path = this.path(job.id);
    const data = JSON.stringify(job);
    const write = (this.writes.get(job.id) || Promise.resolve()).catch(() => undefined).then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      await fs.writeFile(`${path}.tmp`, data);
      await fs.rename(`${path}.tmp`, path);
    });
    this.writes.set(job.id, write);
    try { await write; }
    finally { if (this.writes.get(job.id) === write) this.writes.delete(job.id); }
  }

  async read(id: string): Promise<Record<string, unknown> | null> {
    const path = this.path(id);
    await this.writes.get(id);
    try {
      const data = JSON.parse(await fs.readFile(path, 'utf8'));
      return data && data.id === id && Array.isArray(data.results) ? data : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
