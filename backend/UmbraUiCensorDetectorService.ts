import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { join } from 'path';

export type UmbraUiCensorTarget = 'maleGenitals' | 'femaleGenitals';

export interface UmbraUiCensorDetection {
  reviewOnly?: boolean;
  target: UmbraUiCensorTarget;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
  maskPngBase64?: string;
  maskKind?: 'contour' | 'box-fallback';
  maskScore?: number;
}

const MODEL_REVISION = '0cf62fd6b28213b40ae0c0055f92e7ae6a96bdc2';
const MODEL_URL = `https://huggingface.co/deepghs/anime_censor_detection/resolve/${MODEL_REVISION}/censor_detect_v1.0_n/model.onnx`;
const MODEL_SHA256 = '029de0a116f6c3c73bde62d2a8354c78664795579858f3c8e28fc1b4633a891c';
const LABEL_TARGETS: Record<string, UmbraUiCensorTarget> = {
  penis: 'maleGenitals',
  pussy: 'femaleGenitals',
};

const detectorInstalls = new Map<string, Promise<string>>();
const segmentationInstalls = new Map<string, Promise<string[]>>();
const SEGMENTATION_REVISION = '1cf49585c39567bfc49e991ab8eb31f491ad4877';
const SEGMENTATION_MODELS = [
  ['encoder', '84ed466ffcc5c1f8d08409bc34a23bb364ab2c15e402cb12d4335a42be0e0951'],
  ['decoder', 'a62f8fa5ea080447c0689418d69e58f1e83e0b7adf9c142e2bd9bcc8045c0b11'],
] as const;

async function ensureSegmentationModels(rootDir: string): Promise<string[]> {
  const directory = join(rootDir, 'User', 'Models', 'Detectors', 'efficient-sam-ti');
  const active = segmentationInstalls.get(directory);
  if (active) return active;
  const install = (async () => {
    await fs.mkdir(directory, { recursive: true });
    const paths: string[] = [];
    for (const [part, hash] of SEGMENTATION_MODELS) {
      const path = join(directory, `${part}.onnx`);
      if (!existsSync(path) || await sha256(path) !== hash) {
        const url = `https://huggingface.co/yunyangx/EfficientSAM/resolve/${SEGMENTATION_REVISION}/efficientsam_ti_${part}.onnx`;
        const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
        if (!response.ok) throw new Error(`Censor segmentation model download failed (${response.status}).`);
        const payload = Buffer.from(await response.arrayBuffer());
        if (createHash('sha256').update(payload).digest('hex') !== hash) throw new Error('Censor segmentation model failed its integrity check.');
        const partial = `${path}.partial`;
        try {
          await fs.writeFile(partial, payload);
          await fs.rename(partial, path);
        } finally {
          await fs.rm(partial, { force: true }).catch(() => undefined);
        }
      }
      paths.push(path);
    }
    await fs.writeFile(join(directory, 'MODEL_SOURCE.txt'), [
      'EfficientSAM-Ti / official split ONNX models',
      'License: Apache-2.0',
      'https://github.com/yformer/EfficientSAM',
      `https://huggingface.co/yunyangx/EfficientSAM/tree/${SEGMENTATION_REVISION}`,
      ...SEGMENTATION_MODELS.map(([part, hash]) => `${part}.onnx SHA-256: ${hash}`), '',
    ].join('\n'));
    return paths;
  })().finally(() => { segmentationInstalls.delete(directory); });
  segmentationInstalls.set(directory, install);
  return install;
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(path)).digest('hex');
}

async function ensureDetectorModel(rootDir: string): Promise<string> {
  const modelDirectory = join(rootDir, 'User', 'Models', 'Detectors', 'anime-censor-v1');
  const modelPath = join(modelDirectory, 'model.onnx');
  if (existsSync(modelPath) && await sha256(modelPath) === MODEL_SHA256) return modelPath;
  if (!detectorInstalls.has(modelPath)) {
    const install = (async () => {
      await fs.mkdir(modelDirectory, { recursive: true });
      const partialPath = `${modelPath}.partial`;
      await fs.rm(partialPath, { force: true });
      const response = await fetch(MODEL_URL, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(`Body-part detector download failed (${response.status}).`);
      const payload = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(payload).digest('hex') !== MODEL_SHA256) {
        throw new Error('Body-part detector download failed its integrity check.');
      }
      await fs.writeFile(partialPath, payload);
      await fs.rm(modelPath, { force: true });
      await fs.rename(partialPath, modelPath);
      await fs.writeFile(join(modelDirectory, 'MODEL_SOURCE.txt'), [
        'DeepGHS anime_censor_detection / censor_detect_v1.0_n',
        `Source: ${MODEL_URL}`,
        'License: MIT',
        `SHA-256: ${MODEL_SHA256}`,
        '',
      ].join('\n'));
      return modelPath;
    })().finally(() => { detectorInstalls.delete(modelPath); });
    detectorInstalls.set(modelPath, install);
  }
  return detectorInstalls.get(modelPath)!;
}

function resolvePython(rootDir: string, specialist: boolean): string {
  const managedComfyRoot = join(rootDir, 'Tools', 'ComfyUI');
  const candidates = process.platform === 'win32'
    ? [
      join(rootDir, 'Runtime', 'Python311', 'python.exe'),
      join(rootDir, 'Runtime', 'Python311', 'Scripts', 'python.exe'),
      join(managedComfyRoot, 'venv', 'Scripts', 'python.exe'),
      join(managedComfyRoot, '.venv', 'Scripts', 'python.exe'),
    ]
    : [
      join(rootDir, 'Runtime', 'Python311', 'bin', 'python3.11'),
      join(rootDir, 'Runtime', 'Python311', 'bin', 'python3'),
      join(rootDir, 'Runtime', 'Python311', 'bin', 'python'),
      join(managedComfyRoot, 'venv', 'bin', 'python3'),
      join(managedComfyRoot, 'venv', 'bin', 'python'),
      join(managedComfyRoot, '.venv', 'bin', 'python3'),
      join(managedComfyRoot, '.venv', 'bin', 'python'),
    ];
  const bundled = candidates.filter(path => !specialist || path.startsWith(managedComfyRoot)).find(existsSync);
  if (!bundled) {
    throw new Error('Umbra could not find its Python helper runtime or the managed ComfyUI Python environment. Install ComfyUI from Umbra Studio, then retry image censoring.');
  }
  return bundled;
}

async function runDetector(rootDir: string, sourceDir: string, modelPath: string, sourcePath: string, threshold: number, padding: number, targets: Set<UmbraUiCensorTarget>, reviewThreshold?: number): Promise<unknown> {
  const specialist = targets.has('maleGenitals');
  const python = resolvePython(rootDir, specialist);
  const specialistPath = join(rootDir, 'User', 'Models', 'Detectors', 'anatomy-v2', 'cockAndBallDetection2D_v20.pt');
  if (specialist && !existsSync(specialistPath)) {
    throw new Error('Paired censoring requires the separately licensed anatomy v2 model. See CENSORING.md for the official download and setup. Place cockAndBallDetection2D_v20.pt in User/Models/Detectors/anatomy-v2. No fallback output was generated.');
  }
  const script = join(sourceDir, 'backend', 'python', 'anime_censor_detector.py');
  if (!existsSync(script)) throw new Error('Umbra\'s body-part detector script is missing.');
  const [encoder, decoder] = await ensureSegmentationModels(rootDir);
  const labels = Object.entries(LABEL_TARGETS).filter(([, target]) => targets.has(target)).map(([label]) => label);
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, '--model', modelPath, '--image', sourcePath, '--threshold', String(threshold),
      '--segment-encoder', encoder, '--segment-decoder', decoder, '--padding', String(padding), '--targets', labels.join(','),
      ...(reviewThreshold === undefined ? [] : ['--review-threshold', String(reviewThreshold)]),
      ...(specialist ? ['--specialist-model', specialistPath] : [])], {
      cwd: rootDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Body-part detection timed out.'));
    }, 300_000);
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk || '');
      if (stdout.length > 32 * 1024 * 1024) {
        child.kill();
        clearTimeout(timer);
        reject(new Error('Censor segmentation output exceeded its size limit.'));
      }
    });
    child.stderr?.on('data', (chunk) => { stderr = (stderr + String(chunk || '')).slice(-64 * 1024); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Body-part detector exited with code ${code}.`));
        return;
      }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Body-part detector returned invalid output.')); }
    });
  });
}

export async function detectUmbraUiCensorRegions(options: {
  rootDir: string;
  sourceDir?: string;
  sourcePath: string;
  targets: UmbraUiCensorTarget[];
  threshold?: number;
  reviewThreshold?: number;
  padding?: number;
  onWarnings?: (warnings: string[]) => void;
}): Promise<UmbraUiCensorDetection[]> {
  const targetSet = new Set(options.targets.filter(target => target === 'maleGenitals' || target === 'femaleGenitals'));
  if (targetSet.size === 0) throw new Error('Select at least one body part to censor.');
  const modelPath = await ensureDetectorModel(options.rootDir);
  const threshold = clamp(options.threshold, 0.05, 0.95, 0.5);
  const reviewThreshold = options.reviewThreshold === undefined ? undefined : clamp(options.reviewThreshold, 0.05, threshold, Math.min(0.15, threshold));
  const raw = await runDetector(
    options.rootDir,
    options.sourceDir || options.rootDir,
    modelPath,
    options.sourcePath,
    threshold,
    clamp(options.padding, 0, 0.5, 0),
    targetSet,
    reviewThreshold,
  );
  const warnings = (raw as any)?.warnings;
  options.onWarnings?.(Array.isArray(warnings) ? warnings.filter((value: unknown): value is string => typeof value === 'string') : []);
  const rows = Array.isArray((raw as any)?.detections) ? (raw as any).detections : [];
  return rows.flatMap((row: any) => {
    const target = LABEL_TARGETS[String(row?.label || '')];
    const reviewOnly = reviewThreshold !== undefined && row.reviewOnly === true;
    if (!target || !targetSet.has(target) || !Number.isFinite(row.score) || row.score < (reviewOnly ? reviewThreshold! : threshold)) return [];
    const x = clamp(row.x, 0, 1, 0);
    const y = clamp(row.y, 0, 1, 0);
    const width = clamp(row.width, 0.001, 1, 0.01);
    const height = clamp(row.height, 0.001, 1, 0.01);
    if (row.maskKind !== 'contour' && row.maskKind !== 'box-fallback') throw new Error('Censor segmentation did not return a region mask status.');
    if (row.maskKind === 'contour' && (typeof row.maskPngBase64 !== 'string' || !row.maskPngBase64)) throw new Error('Censor segmentation returned an empty mask.');
    return [{
      target,
      ...(reviewOnly ? { reviewOnly: true } : {}),
      score: clamp(row.score, 0, 1, 0),
      x,
      y,
      width: Math.min(1 - x, width),
      height: Math.min(1 - y, height),
      maskPngBase64: row.maskKind === 'contour' ? row.maskPngBase64 : undefined,
      maskKind: row.maskKind as 'contour' | 'box-fallback',
      maskScore: clamp(row.maskScore, 0, 1, 0),
    }];
  });
}
