import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function getAIToolkitDatasetsHandoff(
  toolPath: string,
  dataForgePath: string,
  localTarget: boolean,
): Promise<{ datasetsPath: string; datasetsShared: boolean }> {
  if (!toolPath) return { datasetsPath: dataForgePath, datasetsShared: false };
  if (!localTarget) return { datasetsPath: '', datasetsShared: false };

  let datasetsPath = join(toolPath, 'datasets');
  const databasePath = join(toolPath, 'aitk_db.db');
  if (existsSync(databasePath)) {
    try {
      const database = new Database(databasePath, { readonly: true });
      try {
        const row = database.query("SELECT value FROM Settings WHERE key = 'DATASETS_FOLDER' LIMIT 1").get() as { value?: unknown } | null;
        if (typeof row?.value === 'string' && row.value.trim()) {
          // AI-Toolkit's Next process runs with <tool>/ui as its working directory.
          datasetsPath = resolve(toolPath, 'ui', row.value);
        }
      } finally {
        database.close();
      }
    } catch {
      return { datasetsPath: '', datasetsShared: false };
    }
  }

  const [dataForgeReal, toolkitReal] = await Promise.all([
    fs.realpath(dataForgePath).catch(() => ''),
    fs.realpath(datasetsPath).catch(() => ''),
  ]);
  const normalize = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
  return {
    datasetsPath,
    datasetsShared: Boolean(dataForgeReal && toolkitReal && normalize(dataForgeReal) === normalize(toolkitReal)),
  };
}
