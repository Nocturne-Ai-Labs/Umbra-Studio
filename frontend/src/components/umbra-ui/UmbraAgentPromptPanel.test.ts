import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Umbra UI mobile agent settings', () => {
  test('keeps prompt tools in Umbra UI and moves connection settings out', () => {
    const source = readFileSync(new URL('./UmbraAgentPromptPanel.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-umbra-agent-panel');
    expect(source).toContain('data-umbra-agent-panel-tabs');
    expect(source).toContain('data-umbra-agent-drafts');
    expect(source).toContain('data-umbra-agent-instructions');
    expect(source).not.toContain("setTab('connect')");
    expect(source).not.toContain('> Connect');
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
