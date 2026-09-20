import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const pending = new Map<string, Promise<void>>();

// Keep state publications ordered while Windows file-lock retries yield to the updater UI.
export function writeUpdateJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const destination = resolve(filePath);
  const key = process.platform === 'win32' ? destination.toLowerCase() : destination;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const write = (pending.get(key) || Promise.resolve()).catch(() => undefined).then(async () => {
    await fs.mkdir(dirname(destination), { recursive: true });
    const temporaryPath = `${destination}.tmp-${process.pid}-${randomUUID()}`;
    const output = await fs.open(temporaryPath, 'wx');
    try {
      try { await output.writeFile(payload, 'utf8'); await output.sync(); }
      finally { await output.close(); }
      for (let attempt = 0; attempt < 40; attempt++) {
        try { await fs.rename(temporaryPath, destination); return; }
        catch (error) {
          const code = (error as NodeJS.ErrnoException)?.code;
          if (!['EACCES', 'EBUSY', 'EPERM'].includes(code || '') || attempt === 39) throw error;
          await delay(50);
        }
      }
    } finally { await fs.unlink(temporaryPath).catch(() => undefined); }
  });
  pending.set(key, write);
  const finished = () => { if (pending.get(key) === write) pending.delete(key); };
  void write.then(finished, finished);
  return write;
}
