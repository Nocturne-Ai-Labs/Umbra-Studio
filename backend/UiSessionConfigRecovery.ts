import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

export function isRecoverableUiSessionKey(key: unknown): boolean {
  return ['gallery-ui-session', 'remote-ui-session', 'powerprompter-ui'].includes(String(key || '').trim().toLowerCase());
}

// The caller holds the config's mutation lock, including while reading and backing up.
export async function readUiSessionConfigValue(
  configPath: string,
  writeDefault: () => Promise<void>,
): Promise<unknown | null> {
  let bytes: Buffer;
  try { bytes = await fs.readFile(configPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; }

  if (!(await fs.lstat(configPath)).isFile()) throw new Error('Damaged UI session is not a regular file.');
  // Preserve the exact damaged bytes before replacing anything. I/O errors remain errors.
  const backupPath = `${configPath}.corrupt-${Date.now()}-${randomUUID()}.bak`;
  const backup = await fs.open(backupPath, 'wx');
  try {
    await backup.writeFile(bytes);
    await backup.sync();
  } catch (error) {
    await backup.close().catch(() => {});
    await fs.unlink(backupPath).catch(() => {});
    throw error;
  } finally { await backup.close().catch(() => {}); }
  await writeDefault();
  console.warn(`[UserConfig] Recovered damaged UI session ${basename(configPath)}; original saved as ${basename(backupPath)}.`);
  return null;
}
