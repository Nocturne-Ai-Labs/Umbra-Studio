import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyPayload,
  findPayloadRoot,
  rollbackSwap,
  safeArchiveEntryName,
} from './UmbraUpdateWorker';
import type { UmbraUpdateWorkerRequest } from '../shared/appUpdate';

describe('Umbra update archive paths', () => {
  test('accepts ordinary portable package entries', () => {
    expect(safeArchiveEntryName('./resources/app/UmbraServer.js'))
      .toBe('resources/app/UmbraServer.js');
    expect(safeArchiveEntryName('User/Config/')).toBe('User/Config/');
  });

  test('rejects traversal and absolute paths', () => {
    expect(() => safeArchiveEntryName('../outside.txt')).toThrow();
    expect(() => safeArchiveEntryName('resources/../../outside.txt')).toThrow();
    expect(() => safeArchiveEntryName('C:\\Windows\\system.ini')).toThrow();
    expect(() => safeArchiveEntryName('/etc/passwd')).toThrow();
  });

  test('finds a portable payload wrapped in an Umbra Studio folder', () => {
    const extractionRoot = mkdtempSync(join(tmpdir(), 'umbra-wrapped-payload-'));
    try {
      const wrappedRoot = join(extractionRoot, 'Umbra Studio');
      mkdirSync(join(wrappedRoot, 'resources', 'app'), { recursive: true });
      writeFileSync(join(wrappedRoot, 'resources', 'app', 'package.json'), '{"version":"0.20.8"}');
      expect(findPayloadRoot(extractionRoot)).toBe(wrappedRoot);
    } finally {
      rmSync(extractionRoot, { recursive: true, force: true });
    }
  });
});

describe('Umbra portable replacement transaction', () => {
  test('preserves user tools and can restore the previous app tree', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'umbra-update-transaction-'));
    try {
      const runtimeRoot = join(temporaryRoot, 'Umbra Studio');
      const workspaceRoot = join(temporaryRoot, '.update');
      const payloadRoot = join(workspaceRoot, 'payload');
      mkdirSync(join(runtimeRoot, 'User', 'Config'), { recursive: true });
      mkdirSync(join(runtimeRoot, 'Tools', 'ComfyUI'), { recursive: true });
      mkdirSync(join(payloadRoot, 'User'), { recursive: true });
      mkdirSync(join(payloadRoot, 'Tools'), { recursive: true });
      writeFileSync(join(runtimeRoot, 'old-app.txt'), 'old app');
      writeFileSync(join(runtimeRoot, 'User', 'Config', 'personal.json'), '{"kept":true}');
      writeFileSync(join(runtimeRoot, 'Tools', 'ComfyUI', 'model.txt'), 'user model');
      writeFileSync(join(payloadRoot, 'new-app.txt'), 'new app');
      writeFileSync(join(payloadRoot, 'User', 'release-placeholder.txt'), 'discard');
      writeFileSync(join(payloadRoot, 'Tools', 'release-placeholder.txt'), 'discard');
      const originalUserDirectoryId = statSync(join(runtimeRoot, 'User')).ino;
      const originalToolsDirectoryId = statSync(join(runtimeRoot, 'Tools')).ino;

      const request = {
        schemaVersion: 1,
        runtimeRoot,
        archivePath: join(workspaceRoot, 'release.zip'),
        workspaceRoot,
        requestPath: join(workspaceRoot, 'request.json'),
        statePath: join(runtimeRoot, 'User', 'Config', 'app-update.json'),
        serverPid: 0,
        launcherPid: 0,
        port: 8212,
        bindHost: '127.0.0.1',
        currentVersion: '0.20.1',
        targetVersion: '0.20.2',
        targetTag: 'v0.20.2',
        packageName: 'release.zip',
        createdAt: new Date(0).toISOString(),
      } satisfies UmbraUpdateWorkerRequest;

      const transaction = applyPayload(request, payloadRoot);
      expect(readFileSync(join(runtimeRoot, 'new-app.txt'), 'utf8')).toBe('new app');
      expect(readFileSync(join(runtimeRoot, 'User', 'Config', 'personal.json'), 'utf8')).toBe('{"kept":true}');
      expect(readFileSync(join(runtimeRoot, 'Tools', 'ComfyUI', 'model.txt'), 'utf8')).toBe('user model');
      expect(existsSync(join(runtimeRoot, 'User', 'release-placeholder.txt'))).toBe(false);
      expect(existsSync(join(runtimeRoot, 'Tools', 'release-placeholder.txt'))).toBe(false);
      expect(statSync(join(runtimeRoot, 'User')).ino).toBe(originalUserDirectoryId);
      expect(statSync(join(runtimeRoot, 'Tools')).ino).toBe(originalToolsDirectoryId);
      expect(existsSync(transaction.preservedRoot)).toBe(false);

      rollbackSwap(request, transaction.backupRoot, transaction.preservedRoot);
      expect(readFileSync(join(runtimeRoot, 'old-app.txt'), 'utf8')).toBe('old app');
      expect(readFileSync(join(runtimeRoot, 'User', 'Config', 'personal.json'), 'utf8')).toBe('{"kept":true}');
      expect(readFileSync(join(runtimeRoot, 'Tools', 'ComfyUI', 'model.txt'), 'utf8')).toBe('user model');
      expect(statSync(join(runtimeRoot, 'User')).ino).toBe(originalUserDirectoryId);
      expect(statSync(join(runtimeRoot, 'Tools')).ino).toBe(originalToolsDirectoryId);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  test('restores preserved data when the initial application-root rename never succeeded', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'umbra-update-early-rollback-'));
    try {
      const runtimeRoot = join(temporaryRoot, 'Umbra Studio');
      const workspaceRoot = join(temporaryRoot, '.update');
      const preservedRoot = join(workspaceRoot, 'preserved');
      mkdirSync(runtimeRoot, { recursive: true });
      mkdirSync(join(preservedRoot, 'User', 'Config'), { recursive: true });
      mkdirSync(join(preservedRoot, 'Tools', 'ComfyUI'), { recursive: true });
      writeFileSync(join(runtimeRoot, 'old-app.txt'), 'old app');
      writeFileSync(join(preservedRoot, 'User', 'Config', 'personal.json'), '{"kept":true}');
      writeFileSync(join(preservedRoot, 'Tools', 'ComfyUI', 'model.txt'), 'user model');

      const request = {
        schemaVersion: 1,
        runtimeRoot,
        archivePath: join(workspaceRoot, 'release.zip'),
        workspaceRoot,
        requestPath: join(workspaceRoot, 'request.json'),
        statePath: join(runtimeRoot, 'User', 'Config', 'app-update.json'),
        serverPid: 0,
        launcherPid: 0,
        port: 8212,
        bindHost: '127.0.0.1',
        currentVersion: '0.20.3',
        targetVersion: '0.20.4',
        targetTag: 'v0.20.4',
        packageName: 'release.zip',
        createdAt: new Date(0).toISOString(),
      } satisfies UmbraUpdateWorkerRequest;

      rollbackSwap(request, join(temporaryRoot, '.missing-backup'), preservedRoot);
      expect(readFileSync(join(runtimeRoot, 'old-app.txt'), 'utf8')).toBe('old app');
      expect(readFileSync(join(runtimeRoot, 'User', 'Config', 'personal.json'), 'utf8')).toBe('{"kept":true}');
      expect(readFileSync(join(runtimeRoot, 'Tools', 'ComfyUI', 'model.txt'), 'utf8')).toBe('user model');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
