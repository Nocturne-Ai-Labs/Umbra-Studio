import { describe, expect, test } from 'bun:test';
import {
  UMBRA_LTX_EXTENDED_MAX_CLIPS,
  normalizeUmbraLtxExtendedControls,
  normalizeUmbraLtxExtendedSequenceMetadata,
  resolveUmbraLtxExtendedTotalSeconds,
} from './videoExtension';

describe('LTX extended video controls', () => {
  test('clamps a sequence to twelve ten-second clips', () => {
    const controls = normalizeUmbraLtxExtendedControls({
      enabled: true,
      clips: Array.from({ length: 20 }, (_, index) => ({
        id: `clip-${index}`,
        prompt: `shot ${index}`,
        durationSeconds: 99,
      })),
    });

    expect(controls.clips).toHaveLength(UMBRA_LTX_EXTENDED_MAX_CLIPS);
    expect(resolveUmbraLtxExtendedTotalSeconds(controls)).toBe(120);
  });

  test('keeps at least one editable default sequence', () => {
    const controls = normalizeUmbraLtxExtendedControls({
      enabled: true,
      clips: [],
    });

    expect(controls.clips).toHaveLength(2);
    expect(controls.clips[0].durationSeconds).toBe(10);
  });

  test('normalizes recoverable sequence metadata', () => {
    expect(normalizeUmbraLtxExtendedSequenceMetadata({
      kind: 'ltx_extended',
      sessionId: 'session-1',
      clipId: 'clip-12',
      clipIndex: 11,
      clipCount: 12,
      clipDurationSeconds: 10,
      totalDurationSeconds: 120,
      finalClip: true,
    })).toEqual({
      kind: 'ltx_extended',
      sessionId: 'session-1',
      clipId: 'clip-12',
      clipIndex: 11,
      clipCount: 12,
      clipDurationSeconds: 10,
      totalDurationSeconds: 120,
      finalClip: true,
    });
  });
});
