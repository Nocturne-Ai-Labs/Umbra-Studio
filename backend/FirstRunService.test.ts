import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FirstRunService } from './FirstRunService';

const testRoots: string[] = [];

function createTestRoot(name: string): string {
  const root = join(tmpdir(), `umbra-first-run-${name}-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  testRoots.push(root);
  return root;
}

function createPortableRoot(root: string, version = '0.10.4') {
  mkdirSync(join(root, 'resources', 'app'), { recursive: true });
  mkdirSync(join(root, 'User'), { recursive: true });
  mkdirSync(join(root, 'Tools', 'ComfyUI'), { recursive: true });
  writeFileSync(join(root, 'resources', 'app', 'UmbraServer.js'), 'console.log("test");');
  writeFileSync(join(root, 'resources', 'app', 'package.json'), JSON.stringify({ version }));
}

afterEach(() => {
  for (const root of testRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('FirstRunService', () => {
  test('defaults to an incomplete English onboarding state', () => {
    const root = createTestRoot('default');
    const service = new FirstRunService(root, join(root, 'resources', 'app'));
    expect(service.readState()).toEqual({
      schemaVersion: 1,
      phase: 'pending',
      language: 'en',
      completedAt: null,
      migration: null,
    });
  });

  test('persists a fresh Japanese onboarding choice', () => {
    const root = createTestRoot('fresh');
    const service = new FirstRunService(root, join(root, 'resources', 'app'));
    service.completeFreshStart('ja');
    expect(service.readState().phase).toBe('complete');
    expect(service.readState().language).toBe('ja');
    expect(service.readState().completedAt).toBeTruthy();
  });

  test('persists a fresh Simplified Chinese onboarding choice', () => {
    const root = createTestRoot('fresh-chinese');
    const service = new FirstRunService(root, join(root, 'resources', 'app'));
    service.completeFreshStart('zh-cn');
    expect(service.readState().phase).toBe('complete');
    expect(service.readState().language).toBe('zh-CN');
    expect(service.readState().completedAt).toBeTruthy();
  });

  test('persists a fresh Korean onboarding choice', () => {
    const root = createTestRoot('fresh-korean');
    const service = new FirstRunService(root, join(root, 'resources', 'app'));
    service.completeFreshStart('ko-KR');
    expect(service.readState().phase).toBe('complete');
    expect(service.readState().language).toBe('ko');
    expect(service.readState().completedAt).toBeTruthy();
  });

  test('recognizes a previous portable build and creates a staged request', () => {
    const currentRoot = createTestRoot('current');
    const previousRoot = createTestRoot('previous');
    createPortableRoot(previousRoot, '0.10.3');
    const service = new FirstRunService(currentRoot, join(currentRoot, 'resources', 'app'));

    const summary = service.inspectMigrationSource(previousRoot);
    expect(summary.version).toBe('0.10.3');
    expect(summary.hasUser).toBe(true);
    expect(summary.hasTools).toBe(true);
    expect(summary.hasComfyUI).toBe(true);

    const request = service.createMigrationRequest(previousRoot, 'ja', 1234);
    expect(request.sourceRoot).toBe(previousRoot);
    expect(request.destinationRoot).toBe(currentRoot);
    expect(request.language).toBe('ja');
    expect(request.restartOwner).toBe('worker');
    expect(service.readState().phase).toBe('migrating');
  });

  test('accepts a legacy version folder nested inside the versionless runtime root', () => {
    const currentRoot = createTestRoot('versionless');
    const previousRoot = join(currentRoot, 'v0.11.4');
    createPortableRoot(previousRoot, '0.11.4');
    const service = new FirstRunService(currentRoot, join(currentRoot, 'resources', 'app'));

    const summary = service.inspectMigrationSource(previousRoot);
    expect(summary.sourceRoot).toBe(previousRoot);
    expect(summary.version).toBe('0.11.4');
  });

  test('rejects arbitrary nested runtime folders as migration sources', () => {
    const currentRoot = createTestRoot('protected-child');
    const nestedRoot = join(currentRoot, 'Tools', 'Previous');
    createPortableRoot(nestedRoot);
    const service = new FirstRunService(currentRoot, join(currentRoot, 'resources', 'app'));

    expect(() => service.inspectMigrationSource(nestedRoot)).toThrow('Only a previous version folder');
  });

  test('rejects the active runtime and unrelated folders', () => {
    const currentRoot = createTestRoot('active');
    createPortableRoot(currentRoot);
    const unrelatedRoot = createTestRoot('unrelated');
    const service = new FirstRunService(currentRoot, join(currentRoot, 'resources', 'app'));

    expect(() => service.inspectMigrationSource(currentRoot)).toThrow('currently running');
    expect(() => service.inspectMigrationSource(unrelatedRoot)).toThrow('does not look like');
  });
});
