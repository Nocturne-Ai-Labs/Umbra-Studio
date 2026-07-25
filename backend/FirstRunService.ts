import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  createPendingFirstRunState,
  normalizeFirstRunState,
  normalizeUmbraAppLanguage,
  type UmbraAppLanguage,
  type UmbraFirstRunState,
  type UmbraMigrationRequest,
  type UmbraMigrationSummary,
} from '../shared/onboarding/firstRun';

function isPathInside(parentPath: string, childPath: string): boolean {
  const rel = relative(resolve(parentPath), resolve(childPath));
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

function readPackageVersion(rootPath: string): string {
  const candidates = [
    join(rootPath, 'resources', 'app', 'package.json'),
    join(rootPath, 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as Record<string, unknown>;
      const version = String(parsed.version || '').trim();
      if (version) return version;
    } catch {
      // Keep inspecting the remaining portable layouts.
    }
  }
  return 'Unknown';
}

function isUmbraPortableRoot(rootPath: string): boolean {
  const markers = [
    join(rootPath, 'UmbraStudio.exe'),
    join(rootPath, 'Start-Umbra.bat'),
    join(rootPath, 'start-umbra.sh'),
    join(rootPath, 'resources', 'app', 'UmbraServer.js'),
    join(rootPath, 'resources', 'app', 'UmbraServer.ts'),
    join(rootPath, 'UmbraServer.ts'),
  ];
  return markers.some((marker) => existsSync(marker))
    && (existsSync(join(rootPath, 'User')) || existsSync(join(rootPath, 'Tools')));
}

export class FirstRunService {
  readonly runtimeRoot: string;
  readonly sourceRoot: string;
  readonly statePath: string;
  readonly migrationRoot: string;

  constructor(runtimeRoot: string, sourceRoot: string) {
    this.runtimeRoot = resolve(runtimeRoot);
    this.sourceRoot = resolve(sourceRoot);
    this.statePath = join(this.runtimeRoot, 'User', 'Config', 'onboarding.json');
    this.migrationRoot = join(this.runtimeRoot, 'Runtime', 'Migration');
  }

  readState(): UmbraFirstRunState {
    try {
      if (!existsSync(this.statePath)) {
        const legacyState = this.readLegacyCompletedState();
        return legacyState ? this.writeState(legacyState) : createPendingFirstRunState();
      }
      return normalizeFirstRunState(JSON.parse(readFileSync(this.statePath, 'utf8')));
    } catch {
      return createPendingFirstRunState();
    }
  }

  private readLegacyCompletedState(): UmbraFirstRunState | null {
    const settingsPath = join(this.runtimeRoot, 'User', 'Config', 'settings.json');
    try {
      if (!existsSync(settingsPath)) return null;
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
        app?: Record<string, unknown>;
      };
      const appSettings = settings?.app;
      if (!appSettings || Array.isArray(appSettings) || Object.keys(appSettings).length === 0) {
        return null;
      }
      return {
        schemaVersion: 1,
        phase: 'complete',
        language: normalizeUmbraAppLanguage(appSettings['ui.language']),
        completedAt: new Date().toISOString(),
        migration: null,
      };
    } catch {
      return null;
    }
  }

  writeState(state: UmbraFirstRunState): UmbraFirstRunState {
    const normalized = normalizeFirstRunState(state);
    mkdirSync(dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, this.statePath);
    return normalized;
  }

  completeFreshStart(languageValue: unknown): UmbraFirstRunState {
    const language = normalizeUmbraAppLanguage(languageValue);
    return this.writeState({
      schemaVersion: 1,
      phase: 'complete',
      language,
      completedAt: new Date().toISOString(),
      migration: null,
    });
  }

  inspectMigrationSource(sourceValue: unknown): UmbraMigrationSummary {
    const sourceRoot = resolve(String(sourceValue || '').trim());
    if (!String(sourceValue || '').trim() || !existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
      throw new Error('Choose an existing Umbra Studio folder.');
    }
    if (sourceRoot === this.runtimeRoot) {
      throw new Error('Choose a previous Umbra Studio build, not the build currently running.');
    }
    if (isPathInside(sourceRoot, this.runtimeRoot)) {
      throw new Error('The current Umbra Studio folder cannot be inside the previous build.');
    }
    if (isPathInside(this.runtimeRoot, sourceRoot)) {
      const [topLevelName = ''] = relative(this.runtimeRoot, sourceRoot).split(/[\\/]/).filter(Boolean);
      if (!/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/i.test(topLevelName)) {
        throw new Error('Only a previous version folder may be migrated from inside the current Umbra Studio root.');
      }
    }
    if (!isUmbraPortableRoot(sourceRoot)) {
      throw new Error('The selected folder does not look like an Umbra Studio portable build.');
    }
    return {
      sourceRoot,
      version: readPackageVersion(sourceRoot),
      hasUser: existsSync(join(sourceRoot, 'User')),
      hasTools: existsSync(join(sourceRoot, 'Tools')),
      hasComfyUI: existsSync(join(sourceRoot, 'Tools', 'ComfyUI')),
      hasAIToolkit: existsSync(join(sourceRoot, 'Tools', 'AI-Toolkit')),
    };
  }

  createMigrationRequest(
    sourceValue: unknown,
    languageValue: unknown,
    serverPid: number,
    restartOwner: 'launcher' | 'worker' = 'worker',
  ): UmbraMigrationRequest {
    const source = this.inspectMigrationSource(sourceValue);
    const language = normalizeUmbraAppLanguage(languageValue);
    mkdirSync(this.migrationRoot, { recursive: true });
    const requestPath = join(this.migrationRoot, `migration-${Date.now()}-${process.pid}.json`);
    const request: UmbraMigrationRequest = {
      schemaVersion: 1,
      sourceRoot: source.sourceRoot,
      destinationRoot: this.runtimeRoot,
      destinationSourceRoot: this.sourceRoot,
      language,
      serverPid: Math.max(1, Math.floor(Number(serverPid) || process.pid)),
      restartOwner,
      createdAt: new Date().toISOString(),
      requestPath,
    };
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
    this.writeState({
      schemaVersion: 1,
      phase: 'migrating',
      language,
      completedAt: null,
      migration: {
        mode: 'move',
        sourceRoot: source.sourceRoot,
        startedAt: request.createdAt,
        completedAt: null,
        movedUser: false,
        movedTools: false,
        umbraNodesSynced: false,
        totalFiles: 0,
        processedFiles: 0,
        totalBytes: 0,
        processedBytes: 0,
        currentItem: '',
        error: '',
      },
    });
    return request;
  }
}
