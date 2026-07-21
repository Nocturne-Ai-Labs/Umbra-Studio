import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';
import sharp from 'sharp';
import {
  analyzeUmbraClipSegMask,
  assessUmbraClipSegThresholdSeries,
  normalizeUmbraClipSegThreshold,
  type UmbraClipSegQualificationCategory,
  type UmbraClipSegThresholdMeasurement,
} from './umbra-ui-clipseg-qualification';

interface UmbraClipSegQualificationCase {
  id: string;
  category: UmbraClipSegQualificationCategory;
  image: string;
  prompt: string;
  thresholds?: number[];
  minCoverage?: number;
  maxCoverage?: number;
  preferredThreshold?: number;
  requiredThreshold?: number;
}

interface UmbraClipSegQualificationManifest {
  baseUrl?: string;
  deviceMode?: 'CPU' | 'AUTO' | 'Prefer GPU';
  thresholds?: number[];
  reportPath?: string;
  artifactsDir?: string;
  cases: UmbraClipSegQualificationCase[];
}

interface LoadedSource {
  bytes: Buffer;
  fileName: string;
  mediaType: string;
  sha256: string;
  origin: string;
}

function readArg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function safeName(value: string): string {
  return String(value || 'case').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'case';
}

function timestampName(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function mediaTypeForPath(value: string): string {
  const extension = extname(value).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  return 'image/png';
}

async function loadSource(value: string): Promise<LoadedSource> {
  const source = String(value || '').trim();
  if (!source) throw new Error('Qualification case is missing an image path or URL.');
  let bytes: Buffer;
  let fileName: string;
  if (isHttpUrl(source)) {
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Source download failed (${response.status} ${response.statusText}).`);
    bytes = Buffer.from(await response.arrayBuffer());
    const parsed = new URL(source);
    fileName = basename(parsed.pathname) || 'source.png';
  } else {
    const filePath = isAbsolute(source) ? source : resolve(source);
    bytes = await readFile(filePath);
    fileName = basename(filePath);
  }
  if (bytes.length <= 0) throw new Error('Qualification source image is empty.');
  await sharp(bytes).metadata();
  return {
    bytes,
    fileName,
    mediaType: mediaTypeForPath(fileName),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    origin: source,
  };
}

async function readResponseError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => ({})) as { error?: unknown; message?: unknown };
    return String(body.error || body.message || `${response.status} ${response.statusText}`).trim();
  }
  return (await response.text().catch(() => '')).trim() || `${response.status} ${response.statusText}`;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function writeOverlay(
  sourceBytes: Buffer,
  pixels: Buffer,
  width: number,
  height: number,
  filePath: string,
): Promise<void> {
  const overlay = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    if (pixels[index] <= 127) continue;
    const offset = index * 4;
    overlay[offset] = 34;
    overlay[offset + 1] = 211;
    overlay[offset + 2] = 238;
    overlay[offset + 3] = 158;
  }
  await sharp(sourceBytes)
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: overlay, raw: { width, height, channels: 4 }, blend: 'over' }])
    .png()
    .toFile(filePath);
}

function normalizeThresholds(values: unknown, fallback: number[]): number[] {
  const candidates = Array.isArray(values) ? values : fallback;
  return Array.from(new Set(candidates.map(normalizeUmbraClipSegThreshold))).sort((left, right) => left - right);
}

async function main(): Promise<void> {
  const manifestPath = resolve(readArg('--manifest') || 'docs/plan/umbra-ui-clipseg-qualification.example.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as UmbraClipSegQualificationManifest;
  if (!Array.isArray(manifest.cases) || manifest.cases.length <= 0) {
    throw new Error('CLIPSeg qualification manifest must contain at least one case.');
  }

  const selectedCaseId = readArg('--case');
  const cases = selectedCaseId
    ? manifest.cases.filter((item) => item.id === selectedCaseId)
    : manifest.cases;
  if (cases.length <= 0) throw new Error(`Qualification case ${selectedCaseId} was not found.`);

  const startedAt = new Date();
  const timestamp = timestampName(startedAt);
  const baseUrl = (readArg('--base-url') || manifest.baseUrl || 'http://127.0.0.1:8212').replace(/\/+$/, '');
  const reportPath = resolve(readArg('--report') || manifest.reportPath || `User/UmbraUI/QualificationReports/clipseg-${timestamp}.json`);
  const artifactsDir = resolve(readArg('--artifacts-dir') || manifest.artifactsDir || `User/UmbraUI/QualificationReports/clipseg-${timestamp}`);
  const deviceMode = manifest.deviceMode || 'CPU';
  const defaultThresholds = normalizeThresholds(manifest.thresholds, [0.25, 0.35, 0.5, 0.65, 0.8]);
  await mkdir(artifactsDir, { recursive: true });

  const capabilitiesResponse = await fetch(`${baseUrl}/comfy/umbra/clipseg/capabilities`, { cache: 'no-store' });
  if (!capabilitiesResponse.ok) throw new Error(await readResponseError(capabilitiesResponse));
  const capabilities = await capabilitiesResponse.json() as { ok?: boolean; available?: boolean; modelId?: string; supportsPrompt?: boolean };
  if (!capabilities.available || !capabilities.supportsPrompt) {
    throw new Error('Umbra CLIPSeg prompt selection is not installed or available.');
  }

  const caseReports = [];
  for (const item of cases) {
    const caseId = safeName(item.id);
    const caseDir = resolve(artifactsDir, caseId);
    await mkdir(caseDir, { recursive: true });
    const source = await loadSource(item.image);
    const sourcePath = resolve(caseDir, 'source.png');
    await sharp(source.bytes).rotate().png().toFile(sourcePath);
    const thresholds = normalizeThresholds(item.thresholds, defaultThresholds);
    const measurements: UmbraClipSegThresholdMeasurement[] = [];

    for (const threshold of thresholds) {
      const started = performance.now();
      const form = new FormData();
      form.append('image', new Blob([new Uint8Array(source.bytes)], { type: source.mediaType }), source.fileName);
      form.append('prompt', String(item.prompt || '').trim());
      form.append('device_mode', deviceMode);
      form.append('threshold', String(threshold));
      try {
        const response = await fetch(`${baseUrl}/comfy/umbra/clipseg/detect`, { method: 'POST', body: form });
        const durationMs = Math.round((performance.now() - started) * 10) / 10;
        if (!response.ok) {
          const error = await readResponseError(response);
          const empty = /did not find|empty mask/i.test(error);
          measurements.push({
            threshold,
            status: empty ? 'empty' : 'error',
            durationMs,
            width: 0,
            height: 0,
            selectedPixels: 0,
            coverage: 0,
            bounds: null,
            error,
          });
          continue;
        }

        const maskBytes = Buffer.from(await response.arrayBuffer());
        const decoded = await sharp(maskBytes).greyscale().raw().toBuffer({ resolveWithObject: true });
        const analysis = analyzeUmbraClipSegMask(decoded.data, decoded.info.width, decoded.info.height);
        const suffix = String(threshold).replace('.', '_');
        const maskPath = resolve(caseDir, `mask-${suffix}.png`);
        const overlayPath = resolve(caseDir, `overlay-${suffix}.png`);
        await writeFile(maskPath, maskBytes);
        await writeOverlay(source.bytes, decoded.data, decoded.info.width, decoded.info.height, overlayPath);
        measurements.push({
          threshold,
          status: 'ok',
          durationMs,
          ...analysis,
          maskPath,
          overlayPath,
        });
      } catch (error) {
        measurements.push({
          threshold,
          status: 'error',
          durationMs: Math.round((performance.now() - started) * 10) / 10,
          width: 0,
          height: 0,
          selectedPixels: 0,
          coverage: 0,
          bounds: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const expectation = {
      minCoverage: item.minCoverage ?? 0.002,
      maxCoverage: item.maxCoverage ?? 0.85,
      preferredThreshold: item.preferredThreshold ?? 0.5,
      ...(item.requiredThreshold === undefined ? {} : { requiredThreshold: item.requiredThreshold }),
    };
    const assessment = assessUmbraClipSegThresholdSeries(measurements, expectation);
    caseReports.push({
      id: item.id,
      category: item.category,
      prompt: item.prompt,
      source: {
        origin: source.origin,
        sha256: source.sha256,
        artifactPath: sourcePath,
      },
      expectation,
      assessment,
      semanticReviewRequired: true,
      measurements,
    });
    const marker = assessment.ok ? 'PASS' : 'FAIL';
    console.log(`[${marker}] ${item.id}: recommended ${assessment.recommendedThreshold ?? 'none'}; overlays ${caseDir}`);
  }

  const finishedAt = new Date();
  const report = {
    schemaVersion: 1,
    kind: 'umbra-ui-clipseg-qualification',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    baseUrl,
    deviceMode,
    capabilities,
    semanticReviewRequired: true,
    note: 'Coverage gates transport and threshold behavior. A human must inspect the saved overlays before claiming semantic prompt-selection quality.',
    summary: {
      total: caseReports.length,
      passed: caseReports.filter((item) => item.assessment.ok).length,
      failed: caseReports.filter((item) => !item.assessment.ok).length,
    },
    cases: caseReports,
  };
  await writeJsonAtomic(reportPath, report);
  console.log(`Report: ${reportPath}`);
  if (report.summary.failed > 0) process.exitCode = 1;
}

await main();
