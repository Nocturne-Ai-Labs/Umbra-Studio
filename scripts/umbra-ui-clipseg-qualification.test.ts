import { describe, expect, test } from 'bun:test';
import {
  analyzeUmbraClipSegMask,
  assessUmbraClipSegThresholdSeries,
  type UmbraClipSegThresholdMeasurement,
} from './umbra-ui-clipseg-qualification';

function measurement(threshold: number, coverage: number, status: 'ok' | 'empty' | 'error' = 'ok'): UmbraClipSegThresholdMeasurement {
  return {
    threshold,
    status,
    durationMs: 10,
    width: 10,
    height: 10,
    selectedPixels: Math.round(coverage * 100),
    coverage,
    bounds: coverage > 0 ? { x: 1, y: 1, width: 8, height: 8 } : null,
  };
}

describe('Umbra CLIPSeg qualification', () => {
  test('measures binary coverage and exact selected bounds', () => {
    const pixels = Uint8Array.from([
      0, 0, 0, 0,
      0, 255, 255, 0,
      0, 0, 255, 0,
    ]);
    expect(analyzeUmbraClipSegMask(pixels, 4, 3)).toEqual({
      width: 4,
      height: 3,
      selectedPixels: 3,
      coverage: 0.25,
      bounds: { x: 1, y: 1, width: 2, height: 2 },
    });
  });

  test('accepts monotonic masks and recommends the viable cutoff nearest the preferred value', () => {
    const assessment = assessUmbraClipSegThresholdSeries([
      measurement(0.25, 0.72),
      measurement(0.4, 0.42),
      measurement(0.5, 0.24),
      measurement(0.65, 0.04),
      measurement(0.8, 0, 'empty'),
    ], {
      minCoverage: 0.02,
      maxCoverage: 0.6,
      preferredThreshold: 0.5,
      requiredThreshold: 0.5,
    });
    expect(assessment.ok).toBe(true);
    expect(assessment.monotonic).toBe(true);
    expect(assessment.recommendedThreshold).toBe(0.5);
    expect(assessment.viableThresholds).toEqual([0.4, 0.5, 0.65]);
  });

  test('rejects non-monotonic and provider-error series', () => {
    const assessment = assessUmbraClipSegThresholdSeries([
      measurement(0.3, 0.2),
      measurement(0.5, 0.3),
      measurement(0.7, 0, 'error'),
    ], {
      minCoverage: 0.01,
      maxCoverage: 0.8,
      preferredThreshold: 0.5,
    });
    expect(assessment.ok).toBe(false);
    expect(assessment.monotonic).toBe(false);
    expect(assessment.issues).toHaveLength(2);
  });
});
