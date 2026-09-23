import * as fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';

const VIDEO_EXTENSIONS = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.webm']);
const MANIFEST_VERSION = 1;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

interface StagedVideoPreviewGrant {
  filename: string;
  inputRoot: string;
  physicalPath: string;
  size: number;
  mtimeMs: number;
  registeredAt: number;
}

function validFilename(filename: string): boolean {
  return filename.length > 0
    && filename.length <= 255
    && filename === basename(filename)
    && !/[<>:"/\\|?*\x00-\x1f]/.test(filename)
    && VIDEO_EXTENSIONS.has(extname(filename).toLowerCase());
}

function samePhysicalPath(left: string, right: string): boolean {
  return relative(left, right) === '';
}

function isInsidePhysicalRoot(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== ''
    && !isAbsolute(pathFromRoot)
    && pathFromRoot !== '..'
    && !pathFromRoot.startsWith(`..${sep}`);
}

async function inspectStagedVideo(inputRoot: string, filename: string): Promise<{
  inputRoot: string;
  physicalPath: string;
  size: number;
  mtimeMs: number;
} | null> {
  if (!validFilename(filename)) return null;
  const physicalRoot = await fs.realpath(inputRoot).catch(() => null);
  if (!physicalRoot || !(await fs.stat(physicalRoot).catch(() => null))?.isDirectory()) return null;

  const candidatePath = join(inputRoot, filename);
  const candidateLinkStat = await fs.lstat(candidatePath).catch(() => null);
  if (!candidateLinkStat?.isFile()) return null;
  const physicalPath = await fs.realpath(candidatePath).catch(() => null);
  if (!physicalPath || !isInsidePhysicalRoot(physicalRoot, physicalPath)) return null;
  const fileStat = await fs.stat(physicalPath).catch(() => null);
  if (!fileStat?.isFile() || !Number.isSafeInteger(fileStat.size) || !Number.isFinite(fileStat.mtimeMs)) return null;
  return { inputRoot: physicalRoot, physicalPath, size: fileStat.size, mtimeMs: fileStat.mtimeMs };
}

function isGrant(value: unknown): value is StagedVideoPreviewGrant {
  if (!value || typeof value !== 'object') return false;
  const grant = value as Partial<StagedVideoPreviewGrant>;
  return typeof grant.filename === 'string' && validFilename(grant.filename)
    && typeof grant.inputRoot === 'string' && isAbsolute(grant.inputRoot)
    && typeof grant.physicalPath === 'string' && isAbsolute(grant.physicalPath)
    && typeof grant.size === 'number' && Number.isSafeInteger(grant.size) && grant.size >= 0
    && typeof grant.mtimeMs === 'number' && Number.isFinite(grant.mtimeMs)
    && typeof grant.registeredAt === 'number' && Number.isFinite(grant.registeredAt);
}

export class UmbraStagedVideoPreviewGrants {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly manifestPath: string, private readonly maxEntries = 1024) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096) {
      throw new Error('Invalid staged video preview grant limit.');
    }
  }

  private async readManifest(): Promise<StagedVideoPreviewGrant[]> {
    const manifestStat = await fs.stat(this.manifestPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!manifestStat) return [];
    if (!manifestStat.isFile() || manifestStat.size > MAX_MANIFEST_BYTES) {
      throw new Error('Invalid staged video preview grant manifest.');
    }
    const parsed: unknown = JSON.parse(await fs.readFile(this.manifestPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid staged video preview grant manifest.');
    const manifest = parsed as { version?: unknown; grants?: unknown };
    if (manifest.version !== MANIFEST_VERSION || !Array.isArray(manifest.grants) || !manifest.grants.every(isGrant)) {
      throw new Error('Invalid staged video preview grant manifest.');
    }
    return manifest.grants;
  }

  private async writeManifest(grants: StagedVideoPreviewGrant[]): Promise<void> {
    await fs.mkdir(dirname(this.manifestPath), { recursive: true });
    const tempPath = `${this.manifestPath}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      const file = await fs.open(tempPath, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ version: MANIFEST_VERSION, grants }), 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await fs.rename(tempPath, this.manifestPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async register(inputRoot: string, filename: string, sourcePath: string): Promise<void> {
    const operation = this.writeChain.then(async () => {
      const inspected = await inspectStagedVideo(inputRoot, filename);
      const physicalSourcePath = await fs.realpath(sourcePath).catch(() => null);
      if (!inspected || !physicalSourcePath || !samePhysicalPath(inspected.physicalPath, physicalSourcePath)) {
        throw new Error('The staged video is not a regular file inside the ComfyUI input directory.');
      }
      const grants = await this.readManifest();
      const grant: StagedVideoPreviewGrant = {
        filename,
        ...inspected,
        registeredAt: Date.now(),
      };
      await this.writeManifest([
        grant,
        ...grants.filter((entry) => !(entry.filename === filename && samePhysicalPath(entry.inputRoot, inspected.inputRoot))),
      ].slice(0, this.maxEntries));
    });
    this.writeChain = operation.catch(() => undefined);
    return operation;
  }

  async resolve(inputRoot: string, filename: string): Promise<string | null> {
    if (!validFilename(filename)) return null;
    await this.writeChain;
    try {
      const grants = await this.readManifest();
      const inspected = await inspectStagedVideo(inputRoot, filename);
      if (!inspected) return null;
      const grant = grants.find((entry) => entry.filename === filename
        && samePhysicalPath(entry.inputRoot, inspected.inputRoot));
      if (!grant
        || !samePhysicalPath(grant.physicalPath, inspected.physicalPath)
        || grant.size !== inspected.size
        || grant.mtimeMs !== inspected.mtimeMs) return null;
      return inspected.physicalPath;
    } catch {
      return null;
    }
  }
}
