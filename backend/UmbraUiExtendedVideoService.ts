import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import * as fs from 'fs/promises';
import { basename, dirname, extname, join } from 'path';

const VIDEO_EXTENSIONS = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.webm']);

function findImageIoFfmpeg(comfyRoot: string): string {
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(join(comfyRoot, 'venv', 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries'));
  } else {
    const libRoot = join(comfyRoot, 'venv', 'lib');
    if (existsSync(libRoot)) {
      for (const entry of readdirSync(libRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith('python')) continue;
        candidates.push(join(libRoot, entry.name, 'site-packages', 'imageio_ffmpeg', 'binaries'));
      }
    }
  }
  for (const directory of candidates) {
    if (!existsSync(directory)) continue;
    const match = readdirSync(directory)
      .map((name) => join(directory, name))
      .find((path) => {
        const name = basename(path).toLowerCase();
        return name.startsWith('ffmpeg-')
          && (process.platform !== 'win32' || name.endsWith('.exe'));
      });
    if (match) return match;
  }
  return '';
}

export function resolveUmbraExtendedVideoFfmpeg(comfyRoot: string): string {
  const configured = String(process.env.FFMPEG_PATH || '').trim();
  if (configured && existsSync(configured)) return configured;
  return findImageIoFfmpeg(comfyRoot) || 'ffmpeg';
}

function runProcess(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 24000) stderr = stderr.slice(-24000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${basename(command)} exited with code ${code}.`));
    });
  });
}

function quoteConcatPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

export function isUmbraExtendedVideoOutputPath(path: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(path).toLowerCase());
}

export async function concatenateUmbraExtendedVideoClips(options: {
  comfyRoot: string;
  clipPaths: string[];
  outputPath: string;
  workDirectory: string;
}): Promise<void> {
  if (options.clipPaths.length < 2) {
    throw new Error('An extended video needs at least two completed clips to merge.');
  }
  await fs.mkdir(options.workDirectory, { recursive: true });
  await fs.mkdir(dirname(options.outputPath), { recursive: true });
  const concatListPath = join(options.workDirectory, 'clips.txt');
  await fs.writeFile(
    concatListPath,
    `${options.clipPaths.map((path) => `file '${quoteConcatPath(path)}'`).join('\n')}\n`,
    'utf8',
  );
  const ffmpeg = resolveUmbraExtendedVideoFfmpeg(options.comfyRoot);
  try {
    await runProcess(ffmpeg, [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-map', '0',
      '-c', 'copy',
      '-movflags', '+faststart',
      options.outputPath,
    ], options.workDirectory);
  } catch {
    await runProcess(ffmpeg, [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      options.outputPath,
    ], options.workDirectory);
  } finally {
    await fs.rm(concatListPath, { force: true }).catch(() => undefined);
  }
}
