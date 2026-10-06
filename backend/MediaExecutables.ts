import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export type MediaTool = 'ffmpeg' | 'ffprobe';
export type MediaExecutable = { executable: string; source: 'configured' | 'managed' | 'bundled' | 'comfyui' | 'path' | 'missing' };
export type MediaExecutableOptions = {
  runtimeRoot?: string;
  comfyRoot?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  which?: (command: string) => string | null;
};

function executableFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

function manifestMediaBin(root: string): string {
  try {
    const record = JSON.parse(readFileSync(join(root, 'installed.json'), 'utf8'));
    if (typeof record.binDirectory !== 'string' || isAbsolute(record.binDirectory)
      || record.binDirectory.split(/[\\/]/).some((part: string) => !part || part === '.' || part === '..')) return '';
    const bin = resolve(root, record.binDirectory);
    const inside = relative(realpathSync(root), realpathSync(bin));
    return inside && inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside) ? bin : '';
  } catch { return ''; }
}

export function managedMediaBin(runtimeRoot: string, platform: NodeJS.Platform = process.platform): string {
  return manifestMediaBin(resolve(runtimeRoot, 'Tools', 'FFmpeg', platform));
}

export function bundledMediaBin(runtimeRoot: string, platform: NodeJS.Platform = process.platform): string {
  return manifestMediaBin(resolve(runtimeRoot, 'Runtime', 'FFmpeg', platform));
}

export function resolveMediaExecutable(tool: MediaTool, options: MediaExecutableOptions = {}): MediaExecutable {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const runtimeRoot = resolve(options.runtimeRoot || env.UMBRA_ROOT || process.cwd());
  const comfyRoot = options.comfyRoot || join(runtimeRoot, 'Tools', 'ComfyUI');
  const name = `${tool}${platform === 'win32' ? '.exe' : ''}`;
  const which = options.which || ((command: string) => Bun.which(command, { PATH: env.PATH || env.Path || '' }));
  const configured = String(env[tool === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'] || '').trim();
  if (configured) {
    const path = executableFile(configured) ? resolve(configured) : which(configured);
    if (path) return { executable: path, source: 'configured' };
  }
  const managed = managedMediaBin(runtimeRoot, platform);
  if (managed && executableFile(join(managed, name))) return { executable: join(managed, name), source: 'managed' };
  if (tool === 'ffprobe' && env.FFMPEG_PATH) {
    const sibling = join(dirname(env.FFMPEG_PATH), name);
    if (executableFile(sibling)) return { executable: sibling, source: 'configured' };
  }
  const bundled = bundledMediaBin(runtimeRoot, platform);
  if (bundled && executableFile(join(bundled, name))) return { executable: join(bundled, name), source: 'bundled' };
  if (tool === 'ffmpeg') {
    const libraries = platform === 'win32' ? [join(comfyRoot, 'venv', 'Lib')]
      : (() => {
        const lib = join(comfyRoot, 'venv', 'lib');
        try { return readdirSync(lib).filter((entry) => /^python\d/.test(entry)).sort().reverse().map((entry) => join(lib, entry)); }
        catch { return []; }
      })();
    for (const library of libraries) {
      const bin = join(library, 'site-packages', 'imageio_ffmpeg', 'binaries');
      try {
        const candidate = readdirSync(bin).sort().find((entry) => entry.startsWith('ffmpeg-')
          && (platform === 'win32' ? entry.endsWith('.exe') : !entry.endsWith('.exe')) && executableFile(join(bin, entry)));
        if (candidate) return { executable: join(bin, candidate), source: 'comfyui' };
      } catch { /* Only inspect this instance's bundled environment. */ }
    }
  }
  const path = which(tool);
  return path ? { executable: path, source: 'path' } : { executable: tool, source: 'missing' };
}
