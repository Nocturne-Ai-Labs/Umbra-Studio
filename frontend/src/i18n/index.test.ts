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

  test('interpolates translated values', () => {
    expect(translate('ja', 'onboarding.version', { version: '0.11.2' })).toBe('バージョン 0.11.2');
  });
});
