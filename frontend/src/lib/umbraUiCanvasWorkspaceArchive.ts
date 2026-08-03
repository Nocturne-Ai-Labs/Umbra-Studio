import JSZip from 'jszip';
import {
  normalizeUmbraCanvasRasterAdjustments,
  UMBRA_CANVAS_PROJECT_VERSION,
  type UmbraCanvasProjectDocument,
} from '@/features/canvas/canvasModel';

const ARCHIVE_FORMAT = 'umbra-canvas';
const ARCHIVE_VERSION = 1;

interface UmbraCanvasArchiveAsset {
  entityId: string;
  path: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
}

interface UmbraCanvasArchiveManifest {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  exportedAt: number;
  projectFile: 'project.json';
  assets: UmbraCanvasArchiveAsset[];
}

function safeFilename(value: string, fallback: string): string {
  const clean = String(value || '').replace(/\\/g, '/').split('/').pop()?.replace(/[^a-z0-9._-]+/gi, '-') || '';
  return clean || fallback;
}

function archiveExtension(name: string, type: string): string {
  const matched = safeFilename(name, '').match(/\.[a-z0-9]{2,5}$/i)?.[0];
  if (matched) return matched.toLowerCase();
  if (type === 'image/jpeg') return '.jpg';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/avif') return '.avif';
  return '.png';
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function exportUmbraCanvasWorkspaceArchive(project: UmbraCanvasProjectDocument): Promise<Blob> {
  const zip = new JSZip();
  const archived = structuredClone(project);
  archived.generation.pending = [];
  archived.generation.staging = [];
  const assets: UmbraCanvasArchiveAsset[] = [];
  const sourceCache = new Map<string, { type: string; size: number; sha256: string; path: string }>();
  const pathByDigest = new Map<string, string>();
  for (const entity of archived.entities) {
    if ((entity.kind !== 'raster' && entity.kind !== 'mask') || !entity.imageUrl) continue;
    let source = sourceCache.get(entity.imageUrl);
    if (!source) {
      const response = await fetch(entity.imageUrl);
      if (!response.ok) throw new Error(`Could not export Canvas layer ${entity.name}.`);
      const blob = await response.blob();
      const bytes = await blob.arrayBuffer();
      const digest = await sha256(bytes);
      const path = pathByDigest.get(digest)
        || `assets/${digest}${archiveExtension(entity.name, blob.type)}`;
      if (!pathByDigest.has(digest)) {
        zip.file(path, bytes, { binary: true });
        pathByDigest.set(digest, path);
      }
      source = {
        type: blob.type || 'image/png',
        size: bytes.byteLength,
        sha256: digest,
        path,
      };
      sourceCache.set(entity.imageUrl, source);
    }
    const filename = safeFilename(entity.name, `${entity.id}${archiveExtension(entity.name, source.type)}`);
    assets.push({
      entityId: entity.id,
      path: source.path,
      name: filename,
      type: source.type,
      size: source.size,
      sha256: source.sha256,
    });
    entity.imageUrl = `umbra-canvas-archive:${source.path}`;
  }
  const manifest: UmbraCanvasArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: Date.now(),
    projectFile: 'project.json',
    assets,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('project.json', JSON.stringify(archived, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

export async function importUmbraCanvasWorkspaceArchive(file: Blob): Promise<{
  project: UmbraCanvasProjectDocument;
  objectUrls: string[];
}> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: true });
  const manifestFile = zip.file('manifest.json');
  const projectFile = zip.file('project.json');
  if (!manifestFile || !projectFile) throw new Error('This file is not a complete Umbra Canvas archive.');
  const manifest = JSON.parse(await manifestFile.async('string')) as UmbraCanvasArchiveManifest;
  if (manifest.format !== ARCHIVE_FORMAT || manifest.version !== ARCHIVE_VERSION) {
    throw new Error(`Unsupported Umbra Canvas archive version ${String(manifest.version || 'unknown')}.`);
  }
  const project = JSON.parse(await projectFile.async('string')) as UmbraCanvasProjectDocument;
  if (!project || !Array.isArray(project.entities)) throw new Error('The Canvas project document is invalid.');
  if (Number(project.version) > UMBRA_CANVAS_PROJECT_VERSION) {
    throw new Error(`Canvas project version ${String(project.version)} is newer than this Umbra build supports.`);
  }
  const assetByEntity = new Map(manifest.assets.map((asset) => [asset.entityId, asset]));
  const objectUrls: string[] = [];
  try {
    for (const entity of project.entities) {
      if ((entity.kind !== 'raster' && entity.kind !== 'mask') || !entity.imageUrl) continue;
      const asset = assetByEntity.get(entity.id);
      const entry = asset ? zip.file(asset.path) : null;
      if (!asset || !entry) throw new Error(`Canvas layer ${entity.name} is missing from the archive.`);
      const bytes = await entry.async('arraybuffer');
      if (bytes.byteLength !== asset.size || await sha256(bytes) !== asset.sha256) {
        throw new Error(`Canvas layer ${entity.name} failed its integrity check.`);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: asset.type || 'image/png' }));
      objectUrls.push(url);
      entity.imageUrl = url;
      entity.sourcePath = '';
    }
    const now = Date.now();
    project.version = UMBRA_CANVAS_PROJECT_VERSION;
    project.entities = project.entities.map((entity) => entity.kind === 'raster'
      ? { ...entity, adjustments: normalizeUmbraCanvasRasterAdjustments(entity.adjustments) }
      : entity);
    project.id = `canvas-${crypto.randomUUID()}`;
    project.name = `${String(project.name || 'Imported Canvas').slice(0, 140)} imported`;
    project.activeEntityId = project.entities.some((entity) => entity.id === project.activeEntityId) ? project.activeEntityId : '';
    project.generation.pending = [];
    project.generation.staging = [];
    project.createdAt = now;
    project.updatedAt = now;
    project.revision = Math.max(0, Number(project.revision) || 0) + 1;
    return { project, objectUrls };
  } catch (error) {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}

export function downloadUmbraCanvasWorkspaceArchive(blob: Blob, projectName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(projectName, 'Umbra-Canvas').replace(/\.[^.]+$/, '')}.umbra-canvas`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
