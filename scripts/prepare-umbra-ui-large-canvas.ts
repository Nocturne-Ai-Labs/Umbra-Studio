import { resolve } from 'node:path';
import sharp from 'sharp';
import { UmbraUiCanvasWorkspaceProjectService } from '../backend/UmbraUiCanvasWorkspaceProjectService';
import {
  createUmbraCanvasMaskEntity,
  createUmbraCanvasMaskStroke,
  createUmbraCanvasProjectDocument,
  createUmbraCanvasRasterEntity,
  createUmbraCanvasShapeEntity,
  normalizeUmbraCanvasRasterAdjustments,
} from '../frontend/src/features/canvas/canvasModel';

function readArg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function integerArg(name: string, fallback: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(readArg(name)) || fallback)));
}

function projectIdArg(): string {
  return String(readArg('--id') || 'umbra-canvas-v8-large-acceptance')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'umbra-canvas-v8-large-acceptance';
}

async function renderSource(width: number, height: number): Promise<Uint8Array> {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/><stop offset="0.5" stop-color="#7f1d1d"/><stop offset="1" stop-color="#083344"/>
        </linearGradient>
        <radialGradient id="light" cx="0.62" cy="0.38" r="0.52">
          <stop offset="0" stop-color="#fda4af" stop-opacity="0.92"/><stop offset="0.48" stop-color="#22d3ee" stop-opacity="0.34"/><stop offset="1" stop-color="#020617" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#base)"/><rect width="${width}" height="${height}" fill="url(#light)"/>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" fill="#fff" fill-opacity="0.86" font-family="monospace" font-size="${Math.max(64, Math.round(width / 14))}" font-weight="700">UMBRA CANVAS V8</text>
    </svg>
  `);
  return new Uint8Array(await sharp(svg).png({ compressionLevel: 9 }).toBuffer());
}

async function main(): Promise<void> {
  const width = integerArg('--width', 4096, 512, 16384);
  const height = integerArg('--height', 4096, 512, 16384);
  if (width * height > 64 * 1024 * 1024) throw new Error('Fixture dimensions exceed the 64 megapixel Canvas limit.');
  const rasterCount = integerArg('--layers', 25, 1, 100);
  const maskCount = integerArg('--masks', 5, 0, 20);
  const projectId = projectIdArg();
  const service = new UmbraUiCanvasWorkspaceProjectService(resolve('User'));
  if (process.argv.includes('--cleanup')) {
    await service.delete(projectId);
    console.log(`Removed Canvas workspace fixture ${projectId}.`);
    return;
  }

  await service.delete(projectId).catch(() => undefined);
  const sourceBytes = await renderSource(width, height);
  const project = createUmbraCanvasProjectDocument(`Large Canvas V8 ${width}x${height}`);
  project.id = projectId;
  project.generationBbox = {
    x: Math.round((width - Math.min(width, 1024)) / 2),
    y: Math.round((height - Math.min(height, 1024)) / 2),
    width: Math.min(width, 1024),
    height: Math.min(height, 1024),
  };
  const base = createUmbraCanvasRasterEntity({ name: 'Shared 4K Source', imageUrl: 'blob:large-fixture', width, height });
  project.entities = [base];
  project.activeEntityId = base.id;
  const storedBase = await service.save(projectId, project, [{ key: base.id, name: 'large-canvas-source.png', bytes: sourceBytes }]);
  const storedRaster = storedBase.entities.find((entity) => entity.kind === 'raster');
  if (!storedRaster || storedRaster.kind !== 'raster') throw new Error('The fixture source raster was not persisted.');

  const expanded = structuredClone(storedBase);
  const rasters = Array.from({ length: Math.max(0, rasterCount - 1) }, (_, index) => {
    const raster = createUmbraCanvasRasterEntity({
      name: `Raster Pass ${String(index + 2).padStart(2, '0')}`,
      imageUrl: storedRaster.imageUrl,
      sourcePath: storedRaster.sourcePath,
      width,
      height,
      x: (index % 5 - 2) * 24,
      y: (index % 7 - 3) * 24,
    });
    raster.rotation = (index % 5 - 2) * 0.5;
    raster.opacity = 0.08 + (index % 4) * 0.04;
    raster.blendMode = index % 3 === 0 ? 'screen' : index % 3 === 1 ? 'overlay' : 'soft-light';
    raster.adjustments = normalizeUmbraCanvasRasterAdjustments(index % 4 === 0
      ? { brightness: 5, contrast: 8, saturation: 12, hue: index * 3, blur: 0 }
      : undefined);
    return raster;
  });
  const masks = Array.from({ length: maskCount }, (_, index) => {
    const size = Math.min(1024, width, height);
    const mask = createUmbraCanvasMaskEntity({
      name: `Mask ${String(index + 1).padStart(2, '0')}`,
      bbox: { x: index * 48, y: index * 48, width: size, height: size },
    });
    mask.strokes = [createUmbraCanvasMaskStroke({
      mode: 'paint',
      points: [size * 0.2, size * 0.5, size * 0.5, size * 0.25, size * 0.8, size * 0.5, size * 0.5, size * 0.75, size * 0.2, size * 0.5],
      size: 96,
      opacity: 0.8,
      closed: true,
    })];
    return mask;
  });
  const accents = Array.from({ length: 5 }, (_, index) => createUmbraCanvasShapeEntity(index % 2 ? 'ellipse' : 'rectangle', {
    name: `Vector Accent ${index + 1}`,
    x: index * 160,
    y: index * 120,
    width: 320,
    height: 240,
  }));
  expanded.entities = [storedRaster, ...rasters, ...accents, ...masks];
  expanded.activeEntityId = rasters.at(-1)?.id || storedRaster.id;
  expanded.revision += 1;
  expanded.updatedAt = Date.now();
  const saved = await service.save(projectId, expanded, []);
  console.log(JSON.stringify({
    projectId: saved.id,
    version: saved.version,
    dimensions: `${width}x${height}`,
    rasterLayers: saved.entities.filter((entity) => entity.kind === 'raster').length,
    maskLayers: saved.entities.filter((entity) => entity.kind === 'mask').length,
    vectorLayers: saved.entities.filter((entity) => ['shape', 'text', 'gradient', 'path'].includes(entity.kind)).length,
    sharedSourceBytes: sourceBytes.byteLength,
  }, null, 2));
}

await main();
