import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveSetupLanguage } from './UmbraSetupApp';

const temporaryRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'umbra-setup-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe('standalone Umbra setup', () => {
  test('preserves existing settings while saving the selected language', () => {
    const root = createRoot();
    const settingsPath = join(root, 'User', 'Config', 'settings.json');
    mkdirSync(join(root, 'User', 'Config'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({
      paths: { comfyui: '${PROJECT_ROOT}/Tools/ComfyUI' },
      app: {
        'ui.language': 'en',
        'remote.enabled': false,
      },
    }));

    expect(saveSetupLanguage(root, 'ja')).toBe('ja');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.paths.comfyui).toBe('${PROJECT_ROOT}/Tools/ComfyUI');
    expect(settings.app['remote.enabled']).toBe(false);
    expect(settings.app['ui.language']).toBe('ja');

    const onboardingPath = join(root, 'User', 'Config', 'onboarding.json');
    expect(existsSync(onboardingPath)).toBe(true);
    const onboarding = JSON.parse(readFileSync(onboardingPath, 'utf8'));
    expect(onboarding.phase).toBe('complete');
    expect(onboarding.migration).toBeNull();
  });

  test('rejects unsupported languages without changing settings', () => {
    const root = createRoot();
    const settingsPath = join(root, 'User', 'Config', 'settings.json');
    mkdirSync(join(root, 'User', 'Config'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ app: { 'ui.language': 'ko' } }));

    expect(() => saveSetupLanguage(root, 'fr')).toThrow('supported Umbra Studio language');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.app['ui.language']).toBe('ko');
  });

  test('accepts settings files written with a UTF-8 byte-order mark', () => {
    const root = createRoot();
    const settingsPath = join(root, 'User', 'Config', 'settings.json');
    mkdirSync(join(root, 'User', 'Config'), { recursive: true });
    writeFileSync(settingsPath, '\uFEFF{"app":{"remote.enabled":true}}', 'utf8');

    expect(saveSetupLanguage(root, 'zh-CN')).toBe('zh-CN');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.app['remote.enabled']).toBe(true);
    expect(settings.app['ui.language']).toBe('zh-CN');
  });
});
