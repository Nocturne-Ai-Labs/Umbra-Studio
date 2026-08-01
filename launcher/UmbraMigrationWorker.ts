import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { FirstRunService } from '../backend/FirstRunService';
import {
  normalizeUmbraAppLanguage,
  type UmbraMigrationRequest,
} from '../shared/onboarding/firstRun';
import { resolveUmbraWindowsLauncher } from '../shared/portableLauncher';

const UMBRA_NODES_DIRECTORY_NAME = 'umbra-nodes';
const MIGRATION_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

function quoteSqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function replaceRootText(value: string, sourceRoot: string, destinationRoot: string): string {
  const replacements = [
    [sourceRoot, destinationRoot],
    [sourceRoot.replace(/\\/g, '/'), destinationRoot.replace(/\\/g, '/')],
    [sourceRoot.replace(/\//g, '\\'), destinationRoot.replace(/\//g, '\\')],
  ] as const;
  let result = value;
  for (const [source, destination] of replacements) {
    if (!source || source === destination) continue;
    result = result.split(source).join(destination);
  }
  return result;
}

function rewriteJsonValue(value: unknown, sourceRoot: string, destinationRoot: string): unknown {
  if (typeof value === 'string') {
    return replaceRootText(value, sourceRoot, destinationRoot);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteJsonValue(entry, sourceRoot, destinationRoot));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      next[replaceRootText(key, sourceRoot, destinationRoot)] = rewriteJsonValue(
        entry,
        sourceRoot,
        destinationRoot,
      );
    }
    return next;
  }
  return value;
}

function collectFiles(rootPath: string, extensions: Set<string>, results: string[] = []): string[] {
  if (!existsSync(rootPath)) return results;
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = join(rootPath, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      collectFiles(fullPath, extensions, results);
      continue;
    }
    if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) results.push(fullPath);
  }
  return results;
}

export function isExcludedMigrationPath(sourceRoot: string, candidatePath: string): boolean {
  const rel = relative(resolve(sourceRoot), resolve(candidatePath));
  if (!rel || rel === '.') return false;
  return rel
    .split(/[\\/]+/)
    .some((segment) => segment.trim().toLowerCase() === UMBRA_NODES_DIRECTORY_NAME);
}

export interface UmbraMigrationProgress {
  totalFiles: number;
  processedFiles: number;
  totalBytes: number;
  processedBytes: number;
  currentItem: string;
}

function addMigrationTreeTotals(
  sourceRoot: string,
  candidatePath: string,
  totals: Pick<UmbraMigrationProgress, 'totalFiles' | 'totalBytes'>,
) {
  if (!existsSync(candidatePath) || isExcludedMigrationPath(sourceRoot, candidatePath)) return;
  const stats = lstatSync(candidatePath);
  if (stats.isDirectory() && !stats.isSymbolicLink()) {
    for (const entry of readdirSync(candidatePath)) {
      addMigrationTreeTotals(sourceRoot, join(candidatePath, entry), totals);
    }
    return;
  }
  totals.totalFiles += 1;
  totals.totalBytes += stats.isFile() ? stats.size : 0;
}

export function measureMigrationTrees(sourceRoot: string): UmbraMigrationProgress {
  const progress: UmbraMigrationProgress = {
    totalFiles: 0,
    processedFiles: 0,
    totalBytes: 0,
    processedBytes: 0,
    currentItem: '',
  };
  for (const treeName of ['User', 'Tools']) {
    const treeRoot = join(sourceRoot, treeName);
    addMigrationTreeTotals(treeRoot, treeRoot, progress);
  }
  return progress;
}

function moveFileOrLink(sourcePath: string, destinationPath: string, stats: ReturnType<typeof lstatSync>) {
  mkdirSync(dirname(destinationPath), { recursive: true });
  if (existsSync(destinationPath)) {
    rmSync(destinationPath, { recursive: true, force: true });
  }
  try {
    renameSync(sourcePath, destinationPath);
    return;
  } catch (error: any) {
    if (error?.code !== 'EXDEV') throw error;
  }
  if (stats.isSymbolicLink()) {
    const target = readlinkSync(sourcePath);
    let linkType: 'junction' | 'file' | undefined;
    if (process.platform === 'win32') {
      try {
        linkType = statSync(sourcePath).isDirectory() ? 'junction' : 'file';
      } catch {
        linkType = 'file';
      }
    }
    symlinkSync(target, destinationPath, linkType);
    rmSync(sourcePath, { force: true });
    return;
  }
  copyFileSync(sourcePath, destinationPath);
  rmSync(sourcePath, { force: true });
}

function moveMigrationEntry(
  sourceRoot: string,
  sourcePath: string,
  destinationPath: string,
  treeName: string,
  progress: UmbraMigrationProgress,
  onProgress?: (progress: UmbraMigrationProgress) => void,
) {
  if (!existsSync(sourcePath) || isExcludedMigrationPath(sourceRoot, sourcePath)) return;
  const stats = lstatSync(sourcePath);
  if (stats.isDirectory() && !stats.isSymbolicLink()) {
    mkdirSync(destinationPath, { recursive: true });
    for (const entry of readdirSync(sourcePath)) {
      moveMigrationEntry(
        sourceRoot,
        join(sourcePath, entry),
        join(destinationPath, entry),
        treeName,
        progress,
        onProgress,
      );
    }
    try {
      rmdirSync(sourcePath);
    } catch {
      // Excluded Umbra-Nodes content deliberately keeps its legacy parent tree.
    }
    return;
  }

  moveFileOrLink(sourcePath, destinationPath, stats);
  progress.processedFiles += 1;
  progress.processedBytes += stats.isFile() ? stats.size : 0;
  progress.currentItem = `${treeName}/${relative(sourceRoot, sourcePath).split('\\').join('/')}`;
  onProgress?.({ ...progress });
}

export function moveMigrationTree(
  sourcePath: string,
  destinationPath: string,
  treeName: string,
  progress: UmbraMigrationProgress,
  onProgress?: (progress: UmbraMigrationProgress) => void,
): boolean {
  if (!existsSync(sourcePath)) return false;
  mkdirSync(destinationPath, { recursive: true });
  for (const entry of readdirSync(sourcePath)) {
    moveMigrationEntry(
      sourcePath,
      join(sourcePath, entry),
      join(destinationPath, entry),
      treeName,
      progress,
      onProgress,
    );
  }
  try {
    rmdirSync(sourcePath);
  } catch {
    // Excluded Umbra-Nodes content deliberately remains in the previous build.
  }
  return true;
}

export function rewritePortableJsonFiles(
  destinationRoot: string,
  sourceRoot: string,
): number {
  const configRoot = join(destinationRoot, 'User', 'Config');
  const jsonFiles = collectFiles(configRoot, new Set(['.json']));
  let rewritten = 0;
  for (const filePath of jsonFiles) {
    if (basename(filePath).toLowerCase() === 'onboarding.json') continue;
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const next = JSON.stringify(rewriteJsonValue(parsed, sourceRoot, destinationRoot), null, 2);
      if (`${next}\n` !== raw && next !== raw) {
        writeFileSync(filePath, `${next}\n`, 'utf8');
        rewritten += 1;
      }
    } catch {
      // Non-JSON files and partially written legacy settings are left untouched.
    }
  }
  return rewritten;
}

export async function rewritePortableDatabasePaths(
  destinationRoot: string,
  sourceRoot: string,
): Promise<number> {
  const databaseFiles = collectFiles(
    join(destinationRoot, 'User'),
    new Set(['.db', '.sqlite', '.sqlite3']),
  );
  if (databaseFiles.length === 0) return 0;
  const { Database } = await import('bun:sqlite');
  let changedDatabases = 0;

  for (const databasePath of databaseFiles) {
    let database: InstanceType<typeof Database> | null = null;
    try {
      database = new Database(databasePath, { create: false, strict: true });
      const tables = database.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      ).all() as Array<{ name: string }>;
      let touched = false;
      database.run('BEGIN IMMEDIATE');
      for (const table of tables) {
        const tableName = String(table.name || '');
        if (!tableName) continue;
        const columns = database.query(`PRAGMA table_info(${quoteSqlIdentifier(tableName)})`).all() as Array<{
          name: string;
          type: string;
        }>;
        for (const column of columns) {
          const columnName = String(column.name || '');
          const columnType = String(column.type || '').toUpperCase();
          if (!columnName || (!columnType.includes('TEXT') && !columnType.includes('CHAR') && !columnType.includes('CLOB'))) {
            continue;
          }
          for (const [source, destination] of [
            [sourceRoot, destinationRoot],
            [sourceRoot.replace(/\\/g, '/'), destinationRoot.replace(/\\/g, '/')],
          ]) {
            if (source === destination) continue;
            const statement = database.query(
              `UPDATE ${quoteSqlIdentifier(tableName)}
               SET ${quoteSqlIdentifier(columnName)} = replace(${quoteSqlIdentifier(columnName)}, ?, ?)
               WHERE instr(${quoteSqlIdentifier(columnName)}, ?) > 0`,
            );
            const result = statement.run(source, destination, source);
            if (Number(result.changes) > 0) touched = true;
          }
        }
      }
      database.run('COMMIT');
      if (touched) changedDatabases += 1;
    } catch {
      try {
        database?.run('ROLLBACK');
      } catch {
        // Best-effort rollback for unknown legacy databases.
      }
    } finally {
      database?.close();
    }
  }
  return changedDatabases;
}

export function updateMigratedLanguage(destinationRoot: string, language: string) {
  const settingsPath = join(destinationRoot, 'User', 'Config', 'settings.json');
  let settings: Record<string, any> = {};
  try {
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, any>;
    }
  } catch {
    settings = {};
  }
  settings.app = settings.app && typeof settings.app === 'object' && !Array.isArray(settings.app)
    ? settings.app
    : {};
  settings.app['ui.language'] = normalizeUmbraAppLanguage(language);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForServerExit(pid: number) {
  const startedAt = Date.now();
  while (isProcessAlive(pid)) {
    if (Date.now() - startedAt > MIGRATION_WAIT_TIMEOUT_MS) {
      throw new Error('Umbra did not shut down within ten minutes. Migration was not started.');
    }
    await Bun.sleep(250);
  }
  await Bun.sleep(500);
}

function syncLatestUmbraNodes(request: UmbraMigrationRequest): { synced: boolean; warning: string } {
  const comfyRoot = join(request.destinationRoot, 'Tools', 'ComfyUI');
  if (!existsSync(comfyRoot)) return { synced: false, warning: '' };
  const setupScript = join(request.destinationSourceRoot, 'setup-tools.ts');
  if (!existsSync(setupScript)) {
    return { synced: false, warning: 'Umbra-Nodes setup script was not found.' };
  }
  const result = spawnSync(process.execPath, [setupScript, 'umbra-nodes'], {
    cwd: request.destinationSourceRoot,
    env: {
      ...process.env,
      UMBRA_ROOT: request.destinationRoot,
    },
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.status === 0 && output.includes('UMBRA_VERIFY_OK|setup-tools')) {
    return { synced: true, warning: '' };
  }
  return {
    synced: false,
    warning: output || 'Umbra-Nodes could not be downloaded. Run ComfyUI custom-node setup after reconnecting.',
  };
}

function relaunchUmbra(request: UmbraMigrationRequest) {
  const windowsLauncher = process.platform === 'win32'
    ? resolveUmbraWindowsLauncher(request.destinationRoot)
    : null;
  const linuxLauncher = join(request.destinationRoot, 'start-umbra.sh');
  if (windowsLauncher) {
    spawn(windowsLauncher.command, windowsLauncher.args, {
      cwd: request.destinationRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref();
    return;
  }
  if (process.platform !== 'win32' && existsSync(linuxLauncher)) {
    spawn(linuxLauncher, [], {
      cwd: request.destinationRoot,
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }
  const sourceLauncher = join(request.destinationSourceRoot, 'launcher', 'UmbraWebLauncher.ts');
  spawn(process.execPath, [
    sourceLauncher,
    '--root',
    request.destinationRoot,
    '--source-root',
    request.destinationSourceRoot,
  ], {
    cwd: request.destinationSourceRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      UMBRA_ROOT: request.destinationRoot,
    },
  }).unref();
}

function appendMigrationLog(request: UmbraMigrationRequest, message: string) {
  const logPath = join(request.destinationRoot, 'Runtime', 'Migration', 'migration.log');
  mkdirSync(dirname(logPath), { recursive: true });
  const previous = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  writeFileSync(logPath, `${previous}[${new Date().toISOString()}] ${message}\n`, 'utf8');
}

function writeMigrationConsole(message: string) {
  console.log(`[UmbraMigration] ${message}`);
}

export async function runMigrationRequest(
  request: UmbraMigrationRequest,
  options: { waitForServer?: boolean; relaunch?: boolean } = {},
) {
  const service = new FirstRunService(request.destinationRoot, request.destinationSourceRoot);
  const shouldWaitForServer = options.waitForServer !== false;
  const shouldRelaunch = options.relaunch !== false;
  try {
    if (shouldWaitForServer) {
      appendMigrationLog(request, `Waiting for Umbra server process ${request.serverPid} to exit.`);
      await waitForServerExit(request.serverPid);
    }
    appendMigrationLog(request, `Migrating from ${request.sourceRoot}.`);
    writeMigrationConsole(`Moving data from ${request.sourceRoot}`);
    const progress = measureMigrationTrees(request.sourceRoot);
    let movedUser = false;
    let movedTools = false;
    let lastProgressWriteAt = 0;
    let lastConsoleProgressAt = 0;
    const writeProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastProgressWriteAt < 250) return;
      lastProgressWriteAt = now;
      service.writeState({
        schemaVersion: 1,
        phase: 'migrating',
        language: normalizeUmbraAppLanguage(request.language),
        completedAt: null,
        migration: {
          mode: 'move',
          sourceRoot: request.sourceRoot,
          startedAt: request.createdAt,
          completedAt: null,
          movedUser,
          movedTools,
          umbraNodesSynced: false,
          ...progress,
          error: '',
        },
      });
      if (force || now - lastConsoleProgressAt >= 2000) {
        lastConsoleProgressAt = now;
        const ratio = progress.totalBytes > 0
          ? progress.processedBytes / progress.totalBytes
          : progress.totalFiles > 0
            ? progress.processedFiles / progress.totalFiles
            : 0;
        const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
        writeMigrationConsole(
          `${percent}% · ${progress.processedFiles}/${progress.totalFiles} files · ${progress.currentItem || 'Preparing'}`,
        );
      }
    };
    writeProgress(true);
    appendMigrationLog(
      request,
      `Move inventory ready: ${progress.totalFiles} files, ${progress.totalBytes} bytes.`,
    );

    movedUser = moveMigrationTree(
      join(request.sourceRoot, 'User'),
      join(request.destinationRoot, 'User'),
      'User',
      progress,
      () => writeProgress(),
    );
    writeProgress(true);
    appendMigrationLog(request, movedUser ? 'User data move complete.' : 'No User data was present to move.');
    writeMigrationConsole(movedUser ? 'User data move complete.' : 'No User data was present to move.');

    movedTools = moveMigrationTree(
      join(request.sourceRoot, 'Tools'),
      join(request.destinationRoot, 'Tools'),
      'Tools',
      progress,
      () => writeProgress(),
    );
    writeProgress(true);
    appendMigrationLog(request, movedTools ? 'Tools move complete.' : 'No Tools data was present to move.');
    writeMigrationConsole(movedTools ? 'Tools move complete.' : 'No Tools data was present to move.');

    const rewrittenJsonFiles = rewritePortableJsonFiles(request.destinationRoot, request.sourceRoot);
    const rewrittenDatabases = await rewritePortableDatabasePaths(request.destinationRoot, request.sourceRoot);
    updateMigratedLanguage(request.destinationRoot, request.language);
    const nodeSync = syncLatestUmbraNodes(request);
    const completedAt = new Date().toISOString();

    service.writeState({
      schemaVersion: 1,
      phase: 'complete',
      language: normalizeUmbraAppLanguage(request.language),
      completedAt,
      migration: {
        mode: 'move',
        sourceRoot: request.sourceRoot,
        startedAt: request.createdAt,
        completedAt,
        movedUser,
        movedTools,
        umbraNodesSynced: nodeSync.synced,
        ...progress,
        currentItem: '',
        error: nodeSync.warning,
      },
    });
    appendMigrationLog(
      request,
      `Migration complete. JSON files updated: ${rewrittenJsonFiles}; databases updated: ${rewrittenDatabases}.`,
    );
    writeMigrationConsole('Migration complete. Returning control to Umbra.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const previous = service.readState().migration;
    service.writeState({
      schemaVersion: 1,
      phase: 'failed',
      language: normalizeUmbraAppLanguage(request.language),
      completedAt: null,
      migration: {
        mode: 'move',
        sourceRoot: request.sourceRoot,
        startedAt: request.createdAt,
        completedAt: null,
        movedUser: previous?.movedUser === true,
        movedTools: previous?.movedTools === true,
        umbraNodesSynced: false,
        totalFiles: previous?.totalFiles || 0,
        processedFiles: previous?.processedFiles || 0,
        totalBytes: previous?.totalBytes || 0,
        processedBytes: previous?.processedBytes || 0,
        currentItem: previous?.currentItem || '',
        error: message,
      },
    });
    appendMigrationLog(request, `Migration failed: ${message}`);
    writeMigrationConsole(`Migration failed: ${message}`);
    throw error;
  } finally {
    if (shouldRelaunch && request.restartOwner !== 'launcher') relaunchUmbra(request);
  }
}

function readRequestPath(argv: string[]): string {
  const index = argv.findIndex((entry) => entry === '--request');
  if (index >= 0) return String(argv[index + 1] || '').trim();
  const inline = argv.find((entry) => entry.startsWith('--request='));
  return inline ? inline.slice('--request='.length).trim() : '';
}

async function main() {
  const requestPath = resolve(readRequestPath(Bun.argv.slice(2)));
  if (!requestPath || !existsSync(requestPath) || basename(requestPath).includes('\0')) {
    throw new Error('A valid migration request is required.');
  }
  const parsed = JSON.parse(readFileSync(requestPath, 'utf8')) as UmbraMigrationRequest;
  const request: UmbraMigrationRequest = {
    ...parsed,
    restartOwner: parsed.restartOwner === 'launcher' ? 'launcher' : 'worker',
  };
  if (request.schemaVersion !== 1 || resolve(request.requestPath) !== requestPath) {
    throw new Error('The migration request is invalid or unsupported.');
  }
  await runMigrationRequest(request);
}

if (import.meta.main) {
  console.log('');
  console.log('============================================================');
  console.log(' Umbra Studio Migration Service');
  console.log(' Keep this window open until Umbra Studio reconnects.');
  console.log('============================================================');
  console.log('');
  void main().catch((error) => {
    console.error('[UmbraMigrationWorker] Fatal migration error:', error);
    process.exit(1);
  });
}
