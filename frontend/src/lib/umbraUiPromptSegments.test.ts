import { describe, expect, test } from 'bun:test';
import {
  compileUmbraUiPromptSegments,
  mergeUmbraUiPromptSegmentEnhancements,
  type UmbraUiPromptSegment,
} from './umbraUiPromptSegments';

const segments: UmbraUiPromptSegment[] = [
  { id: 'style', label: 'Style', text: 'cel shading, crisp linework' },
  { id: 'character', label: 'Character', text: '1girl, red jacket', agentEnabled: true },
  { id: 'setting', label: 'Setting', text: 'city street at night', agentEnabled: true },
];

describe('Umbra UI prompt field enhancement', () => {
  test('replaces selected fields without touching protected prompt fields', () => {
    const source = new Map([
      ['character', '1girl, red jacket'],
      ['setting', 'city street at night'],
    ]);
    const enhanced = new Map([
      ['character', '1girl, fitted red jacket, confident expression'],
      ['setting', 'city street at night, reflected neon signage'],
    ]);
    const result = mergeUmbraUiPromptSegmentEnhancements(segments, source, enhanced);

    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.segments[0]).toBe(segments[0]);
    expect(result.segments[0].text).toBe('cel shading, crisp linework');
    expect(compileUmbraUiPromptSegments(result.segments)).toBe(
      'cel shading, crisp linework, 1girl, fitted red jacket, confident expression, city street at night, reflected neon signage',
    );
  });

  test('does not overwrite a field edited while the agent was composing', () => {
    const edited = segments.map((segment) => (
      segment.id === 'character' ? { ...segment, text: '1girl, blue jacket' } : segment
    ));
    const result = mergeUmbraUiPromptSegmentEnhancements(
      edited,
      new Map([['character', '1girl, red jacket']]),
      new Map([['character', '1girl, detailed red jacket']]),
    );

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.segments.find((segment) => segment.id === 'character')?.text).toBe('1girl, blue jacket');
  });
});
