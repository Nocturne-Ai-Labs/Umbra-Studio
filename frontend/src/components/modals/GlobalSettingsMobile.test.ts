import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Global Settings mobile layout', () => {
  test('provides a dedicated phone section selector and compact action footer', () => {
    const source = readFileSync(new URL('./GlobalSettings.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-umbra-global-settings-shell');
    expect(source).toContain('data-umbra-settings-mobile-nav');
    expect(source).toContain('aria-label="Settings section"');
    expect(source).toContain('data-umbra-settings-footer-actions');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('<span>Section</span>');
  });

  test('removes the horizontal desktop navigation from phone mode', () => {
    const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

    expect(styles).toContain(
      'html[data-umbra-remote-mode="phone"] [data-umbra-settings-nav] {\n'
      + '  display: none;',
    );
    expect(styles).toContain(
      'html[data-umbra-remote-mode="phone"] [data-umbra-settings-mobile-nav] {\n'
      + '  display: grid;',
    );
    expect(styles).toContain(
      'html[data-umbra-remote-mode="phone"] [data-umbra-settings-footer] {\n'
      + '  display: grid;',
    );
  });
});
