export type UmbraClipSegQualificationCategory = 'photograph' | 'anime' | 'crowded' | string;
export type UmbraClipSegMeasurementStatus = 'ok' | 'empty' | 'error';

export interface UmbraClipSegMaskBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UmbraClipSegThresholdMeasurement {
  threshold: number;
  status: UmbraClipSegMeasurementStatus;
  durationMs: number;
  width: number;
  height: number;
  selectedPixels: number;
  coverage: number;
  bounds: UmbraClipSegMaskBounds | null;
  error?: string;
  maskPath?: string;
  overlayPath?: string;
}

export interface UmbraClipSegMaskAnalysis {
  width: number;
  height: number;
  selectedPixels: number;
  coverage: number;
  bounds: UmbraClipSegMaskBounds | null;
}

export interface UmbraClipSegSeriesExpectation {
  minCoverage: number;
  maxCoverage: number;
  preferredThreshold: number;
  requiredThreshold?: number;
}

export interface UmbraClipSegSeriesAssessment {
  ok: boolean;
  monotonic: boolean;
  recommendedThreshold: number | null;
  viableThresholds: number[];
  issues: string[];
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeUmbraClipSegThreshold(value: unknown): number {
  return Math.round(Math.max(0, Math.min(1, finiteNumber(value, 0.5))) * 1000) / 1000;
}

export function analyzeUmbraClipSegMask(
  pixels: Uint8Array,
  width: number,
  height: number,
  selectedCutoff = 127,
): UmbraClipSegMaskAnalysis {
  const safeWidth = Math.max(0, Math.floor(finiteNumber(width, 0)));
  const safeHeight = Math.max(0, Math.floor(finiteNumber(height, 0)));
  const expectedPixels = safeWidth * safeHeight;
  if (expectedPixels <= 0 || pixels.length < expectedPixels) {
    throw new Error(`Mask pixels (${pixels.length}) do not cover ${safeWidth}x${safeHeight}.`);
  }

  let selectedPixels = 0;
  let minX = safeWidth;
  let minY = safeHeight;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < expectedPixels; index += 1) {
    if (pixels[index] <= selectedCutoff) continue;
    selectedPixels += 1;
    const x = index % safeWidth;
    const y = Math.floor(index / safeWidth);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    width: safeWidth,
    height: safeHeight,
    selectedPixels,
    coverage: selectedPixels / expectedPixels,
    bounds: selectedPixels > 0 ? {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    } : null,
  };
}

export function assessUmbraClipSegThresholdSeries(
  measurements: UmbraClipSegThresholdMeasurement[],
  expectation: UmbraClipSegSeriesExpectation,
): UmbraClipSegSeriesAssessment {
  const minCoverage = Math.max(0, Math.min(1, finiteNumber(expectation.minCoverage, 0.002)));
  const maxCoverage = Math.max(minCoverage, Math.min(1, finiteNumber(expectation.maxCoverage, 0.85)));
  const preferredThreshold = normalizeUmbraClipSegThreshold(expectation.preferredThreshold);
  const ordered = [...measurements].sort((left, right) => left.threshold - right.threshold);
  const issues: string[] = [];
  const providerErrors = ordered.filter((measurement) => measurement.status === 'error');
  if (providerErrors.length > 0) {
    issues.push(`${providerErrors.length} threshold request(s) failed in the provider.`);
  }

  let monotonic = true;
  let previousCoverage = Number.POSITIVE_INFINITY;
  for (const measurement of ordered) {
    if (measurement.status === 'error') continue;
    if (measurement.coverage > previousCoverage + 1e-9) {
      monotonic = false;
      break;
    }
    previousCoverage = measurement.coverage;
  }
  if (!monotonic) issues.push('Selected coverage increased when the cutoff increased.');

  const viable = ordered.filter((measurement) => (
    measurement.status === 'ok'
    && measurement.coverage >= minCoverage
    && measurement.coverage <= maxCoverage
  ));
  if (viable.length <= 0) {
    issues.push(`No cutoff produced coverage within ${(minCoverage * 100).toFixed(2)}%-${(maxCoverage * 100).toFixed(2)}%.`);
  }

  if (expectation.requiredThreshold !== undefined) {
    const requiredThreshold = normalizeUmbraClipSegThreshold(expectation.requiredThreshold);
    const required = ordered.find((measurement) => Math.abs(measurement.threshold - requiredThreshold) < 1e-9);
    if (!required) issues.push(`Required cutoff ${requiredThreshold.toFixed(3)} was not measured.`);
    else if (required.status !== 'ok' || required.coverage < minCoverage || required.coverage > maxCoverage) {
      issues.push(`Required cutoff ${requiredThreshold.toFixed(3)} did not produce a viable mask.`);
    }
  }

  viable.sort((left, right) => (
    Math.abs(left.threshold - preferredThreshold) - Math.abs(right.threshold - preferredThreshold)
    || right.threshold - left.threshold
  ));

  return {
    ok: issues.length === 0,
    monotonic,
    recommendedThreshold: viable[0]?.threshold ?? null,
    viableThresholds: viable.map((measurement) => measurement.threshold).sort((left, right) => left - right),
    issues,
  };
}
