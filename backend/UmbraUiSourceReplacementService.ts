import { randomBytes } from 'crypto';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path';
import * as fs from 'fs/promises';

const REPLACEABLE_IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);

const CONVERTIBLE_IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);

export interface UmbraUiSourceReplacementOptions {
  originalPath: string;
  resultPath: string;
  recoveryRoot: string;
  allowedRoots: string[];
  now?: Date;
}

export interface UmbraUiSourceReplacementResult {
  originalPath: string;
  resultPath: string;
  recoveryPath: string;
  converted: boolean;
}

function normalizeForCompare(pathValue: string): string {
  const normalized = resolve(pathValue).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isInsideRoot(pathValue: string, rootValue: string): boolean {
  const target = normalizeForCompare(pathValue);
  const root = normalizeForCompare(rootValue);
  if (!target || !root) return false;
  if (target === root) return true;
  const relation = relative(root, target);
  return !!relation && !relation.startsWith('..') && !isAbsolute(relation);
}

function assertAllowedPath(pathValue: string, allowedRoots: string[], label: string): void {
  if (!allowedRoots.some((root) => root && isInsideRoot(pathValue, root))) {
    throw new Error(`${label} is outside Umbra's configured output and Gallery roots.`);
  }
}

function sanitizeStem(pathValue: string): string {
  const extension = extname(pathValue);
  return basename(pathValue, extension)
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 120) || 'image';
}

async function writeReplacementFile(resultPath: string, temporaryPath: string, originalExtension: string): Promise<boolean> {
  const resultExtension = extname(resultPath).toLowerCase();
  if (resultExtension === originalExtension) {
    await fs.copyFile(resultPath, temporaryPath);
    return false;
  }
  if (!CONVERTIBLE_IMAGE_EXTENSIONS.has(originalExtension)) {
    throw new Error(`Cannot replace a ${originalExtension || 'formatless'} source with a ${resultExtension || 'formatless'} result.`);
  }

  const sharp = (await import('sharp')).default;
  let pipeline = sharp(resultPath, { animated: false }).rotate().withMetadata();
  if (originalExtension === '.png') pipeline = pipeline.png();
  else if (originalExtension === '.jpg' || originalExtension === '.jpeg') pipeline = pipeline.jpeg({ quality: 96, chromaSubsampling: '4:4:4' });
  else if (originalExtension === '.webp') pipeline = pipeline.webp({ quality: 96 });
  else if (originalExtension === '.avif') pipeline = pipeline.avif({ quality: 90 });
  else if (originalExtension === '.tif' || originalExtension === '.tiff') pipeline = pipeline.tiff({ quality: 96 });
  await pipeline.toFile(temporaryPath);
  return true;
}

export async function replaceUmbraUiImageSource(
  options: UmbraUiSourceReplacementOptions,
): Promise<UmbraUiSourceReplacementResult> {
  const originalPath = resolve(String(options.originalPath || '').trim());
  const resultPath = resolve(String(options.resultPath || '').trim());
  const recoveryRoot = resolve(String(options.recoveryRoot || '').trim());
  const allowedRoots = options.allowedRoots.map((root) => resolve(root)).filter(Boolean);

  if (!options.originalPath || !options.resultPath) throw new Error('Both the original source and completed result paths are required.');
  if (normalizeForCompare(originalPath) === normalizeForCompare(resultPath)) {
    throw new Error('The completed result already points to the original source file.');
  }
  assertAllowedPath(originalPath, allowedRoots, 'Original source');
  assertAllowedPath(resultPath, allowedRoots, 'Completed result');

  const originalExtension = extname(originalPath).toLowerCase();
  const resultExtension = extname(resultPath).toLowerCase();
  if (!REPLACEABLE_IMAGE_EXTENSIONS.has(originalExtension)) throw new Error('The original source is not a supported image file.');
  if (!REPLACEABLE_IMAGE_EXTENSIONS.has(resultExtension)) throw new Error('The completed result is not a supported image file.');

  const [originalStats, resultStats] = await Promise.all([fs.stat(originalPath), fs.stat(resultPath)]);
  if (!originalStats.isFile() || originalStats.size <= 0) throw new Error('The original source image is missing or empty.');
  if (!resultStats.isFile() || resultStats.size <= 0) throw new Error('The completed result image is missing or empty.');

  const now = options.now || new Date();
  const dateFolder = now.toISOString().slice(0, 10);
  const recoveryFolder = join(recoveryRoot, dateFolder);
  const nonce = randomBytes(4).toString('hex');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const recoveryPath = join(recoveryFolder, `${sanitizeStem(originalPath)}_${timestamp}_${nonce}${originalExtension}`);
  const temporaryPath = join(dirname(originalPath), `.${basename(originalPath)}.umbra-replace-${nonce}${originalExtension}`);
  const swapPath = join(dirname(originalPath), `.${basename(originalPath)}.umbra-swap-${nonce}${originalExtension}`);

  await fs.mkdir(recoveryFolder, { recursive: true });
  await fs.copyFile(originalPath, recoveryPath);

  let converted = false;
  try {
    converted = await writeReplacementFile(resultPath, temporaryPath, originalExtension);
    const temporaryStats = await fs.stat(temporaryPath);
    if (!temporaryStats.isFile() || temporaryStats.size <= 0) throw new Error('The replacement image could not be prepared.');

    await fs.rename(originalPath, swapPath);
    try {
      await fs.rename(temporaryPath, originalPath);
    } catch (error) {
      await fs.rename(swapPath, originalPath).catch(() => undefined);
      throw error;
    }
    await fs.rm(swapPath, { force: true }).catch(() => undefined);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    const originalExists = await fs.stat(originalPath).then(() => true).catch(() => false);
    if (!originalExists) await fs.rename(swapPath, originalPath).catch(() => undefined);
    else await fs.rm(swapPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return { originalPath, resultPath, recoveryPath, converted };
}
