import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Umbra UI mobile agent settings', () => {
  test('provides phone-native scaffolding for every agent panel tab', () => {
    const source = readFileSync(new URL('./UmbraAgentPromptPanel.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-umbra-agent-panel');
    expect(source).toContain('data-umbra-agent-panel-tabs');
    expect(source).toContain('data-umbra-agent-drafts');
    expect(source).toContain('data-umbra-agent-instructions');
    expect(source).toContain('data-umbra-agent-connect');
  });

  test('stacks desktop split panes and enlarges actions on phones', () => {
    const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

    expect(styles).toContain(
      'html[data-umbra-remote-mode="phone"] [data-umbra-agent-instructions] {\n'
      + '  grid-template-columns: minmax(0, 1fr);',
    );
    expect(styles).toContain(
      'html[data-umbra-remote-mode="phone"] [data-umbra-agent-panel-tabs] {\n'
      + '  display: grid;',
    );
    expect(styles).toContain(
      'html[data-umbra-remote-mode="phone"] [data-umbra-agent-providers] {\n'
      + '  grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
  });
});
