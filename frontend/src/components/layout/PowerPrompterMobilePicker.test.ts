import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Power Prompter mobile model pickers', () => {
  test('uses the shared mobile picker scaffolding for model and LoRA selection', () => {
    const source = readFileSync(
      new URL('./PowerPrompterCardChainEditor.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('data-power-prompter-picker="model"');
    expect(source).toContain('data-power-prompter-picker="lora"');
    expect(source.match(/data-umbra-model-picker-mobile-folder/g)?.length).toBe(2);
    expect(source.match(/data-umbra-model-picker-confirm/g)?.length).toBe(2);
    expect(source.match(/data-umbra-model-picker-actions/g)?.length).toBe(2);
    expect(source).toContain('>LoRA Browser</h2>');
    expect(source).toContain('>Model Browser</h2>');
  });

  test('keeps nested Power Prompter confirmation actions full-width on phones', () => {
    const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

    expect(styles).toContain(
      'html[data-umbra-remote-mode="phone"] [data-umbra-model-picker-actions] {\n'
      + '  display: grid;\n'
      + '  grid-column: 1 / -1;',
    );
  });
});
