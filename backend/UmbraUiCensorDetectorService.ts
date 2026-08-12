import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { join } from 'path';

export type UmbraUiCensorTarget = 'femaleNipples' | 'maleGenitals' | 'femaleGenitals';

export interface UmbraUiCensorDetection {
  target: UmbraUiCensorTarget;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const MODEL_REVISION = '0cf62fd6b28213b40ae0c0055f92e7ae6a96bdc2';
const MODEL_URL = `https://huggingface.co/deepghs/anime_censor_detection/resolve/${MODEL_REVISION}/censor_detect_v1.0_n/model.onnx`;
const MODEL_SHA256 = '029de0a116f6c3c73bde62d2a8354c78664795579858f3c8e28fc1b4633a891c';
const LABEL_TARGETS: Record<string, UmbraUiCensorTarget> = {
  nipple_f: 'femaleNipples',
  penis: 'maleGenitals',
  pussy: 'femaleGenitals',
};

let modelInstallPromise: Promise<string> | null = null;

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
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
  if (!modelInstallPromise) {
    modelInstallPromise = (async () => {
      await fs.mkdir(modelDirectory, { recursive: true });
      const partialPath = `${modelPath}.partial`;
      await fs.rm(partialPath, { force: true });
      const response = await fetch(MODEL_URL, { redirect: 'follow' });
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
    })().finally(() => { modelInstallPromise = null; });
  }
  return modelInstallPromise;
}

function resolvePython(rootDir: string): string {
  const candidates = process.platform === 'win32'
    ? [
      join(rootDir, 'Runtime', 'Python311', 'python.exe'),
      join(rootDir, 'Runtime', 'Python311', 'Scripts', 'python.exe'),
    ]
    : [
      join(rootDir, 'Runtime', 'Python311', 'bin', 'python3.11'),
      join(rootDir, 'Runtime', 'Python311', 'bin', 'python3'),
      join(rootDir, 'Runtime', 'Python311', 'bin', 'python'),
    ];
  const bundled = candidates.find(existsSync);
  if (!bundled) throw new Error('Umbra\'s bundled Python runtime is unavailable.');
  return bundled;
}

async function runDetector(rootDir: string, modelPath: string, sourcePath: string, threshold: number): Promise<unknown> {
  const python = resolvePython(rootDir);
  const script = join(rootDir, 'backend', 'python', 'anime_censor_detector.py');
  if (!existsSync(script)) throw new Error('Umbra\'s body-part detector script is missing.');
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, '--model', modelPath, '--image', sourcePath, '--threshold', String(threshold)], {
      cwd: rootDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Body-part detection timed out.'));
    }, 120_000);
    child.stdout?.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk || ''); });
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
  sourcePath: string;
  targets: UmbraUiCensorTarget[];
  threshold?: number;
  padding?: number;
}): Promise<UmbraUiCensorDetection[]> {
  const targetSet = new Set(options.targets);
  if (targetSet.size === 0) throw new Error('Select at least one body part to censor.');
  const modelPath = await ensureDetectorModel(options.rootDir);
  const raw = await runDetector(options.rootDir, modelPath, options.sourcePath, clamp(options.threshold, 0.05, 0.95, 0.278));
  const rows = Array.isArray((raw as any)?.detections) ? (raw as any).detections : [];
  const padding = clamp(options.padding, 0, 0.5, 0.12);
  return rows.flatMap((row: any) => {
    const target = LABEL_TARGETS[String(row?.label || '')];
    if (!target || !targetSet.has(target)) return [];
    const x = clamp(row.x, 0, 1, 0);
    const y = clamp(row.y, 0, 1, 0);
    const width = clamp(row.width, 0.001, 1, 0.01);
    const height = clamp(row.height, 0.001, 1, 0.01);
    const horizontalPad = width * padding;
    const verticalPad = height * padding;
    const left = Math.max(0, x - horizontalPad);
    const top = Math.max(0, y - verticalPad);
    return [{
      target,
      score: clamp(row.score, 0, 1, 0),
      x: left,
      y: top,
      width: Math.min(1 - left, width + horizontalPad * 2),
      height: Math.min(1 - top, height + verticalPad * 2),
    }];
  });
}
