import { rename, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Windows preview/index readers can briefly deny replacement. Keep the prior
// CSV intact, retry the atomic replacement, and retain the temp on real failure.
export async function publishCheckpoint(temporary, destination, operations = {}) {
  const move = operations.rename || rename;
  const wait = operations.delay || delay;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await move(temporary, destination);
      return;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) || attempt === 39) throw error;
      await wait(75);
    }
  }
}

export async function writeCollectionCheckpoint(destination, csv) {
  const temporary = `${destination}.collecting.tmp`;
  await writeFile(temporary, csv, 'utf8');
  await publishCheckpoint(temporary, destination);
}
