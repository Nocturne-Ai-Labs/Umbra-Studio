import { describe, expect, test } from 'bun:test';
import { translate } from './index';

describe('Umbra i18n', () => {
  test('uses English as the stable fallback', () => {
    expect(translate('unsupported', 'nav.gallery')).toBe('Gallery');
  });

  test('returns Japanese shell labels', () => {
    expect(translate('ja', 'nav.gallery')).toBe('ギャラリー');
    expect(translate('ja', 'settings.title')).toBe('Umbra Studio 設定');
  });

  test('returns Simplified Chinese shell labels', () => {
    expect(translate('zh-CN', 'nav.gallery')).toBe('图库');
    expect(translate('zh-cn', 'settings.title')).toBe('Umbra Studio 设置');
  });

  test('returns Korean shell labels', () => {
    expect(translate('ko', 'nav.gallery')).toBe('갤러리');
    expect(translate('ko-KR', 'settings.title')).toBe('Umbra Studio 설정');
  });

  test('interpolates translated values', () => {
    expect(translate('ja', 'onboarding.version', { version: '0.11.2' })).toBe('バージョン 0.11.2');
    expect(translate('zh-CN', 'onboarding.version', { version: '0.20.0' })).toBe('版本 0.20.0');
    expect(translate('ko', 'onboarding.version', { version: '0.20.0' })).toBe('버전 0.20.0');
  });
});
