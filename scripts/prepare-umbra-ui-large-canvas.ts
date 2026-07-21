import { resolve } from 'node:path';
import sharp from 'sharp';
import { UmbraUiCanvasProjectService } from '../backend/UmbraUiCanvasProjectService';
import {
  createUmbraCanvasDocument,
  createUmbraCanvasImageAsset,
  type UmbraCanvasGroupLayer,
  type UmbraCanvasRasterLayer,
} from '../frontend/src/lib/umbraUiCanvasDocument';

function readArg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function integerArg(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Math.round(Number(readArg(name)) || fallback);
  return Math.max(minimum, Math.min(maximum, value));
}

function projectIdArg(): string {
  return String(readArg('--id') || 'umbra-large-canvas-acceptance')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'umbra-large-canvas-acceptance';
}

async function renderSource(width: number, height: number): Promise<Uint8Array> {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.45" stop-color="#7f1d1d"/>
          <stop offset="1" stop-color="#083344"/>
        </linearGradient>
        <radialGradient id="light" cx="0.62" cy="0.38" r="0.52">
          <stop offset="0" stop-color="#fda4af" stop-opacity="0.92"/>
          <stop offset="0.48" stop-color="#22d3ee" stop-opacity="0.34"/>
          <stop offset="1" stop-color="#020617" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#base)"/>
      <rect width="${width}" height="${height}" fill="url(#light)"/>
      <g fill="none" stroke="#f8fafc" stroke-opacity="0.22" stroke-width="${Math.max(4, Math.round(width / 512))}">
        <path d="M 0 ${height * 0.25} C ${width * 0.3} ${height * 0.05}, ${width * 0.7} ${height * 0.45}, ${width} ${height * 0.22}"/>
        <path d="M 0 ${height * 0.72} C ${width * 0.35} ${height * 0.95}, ${width * 0.65} ${height * 0.5}, ${width} ${height * 0.76}"/>
      </g>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle"
        fill="#ffffff" fill-opacity="0.86" font-family="monospace" font-size="${Math.max(64, Math.round(width / 14))}"
        font-weight="700">UMBRA ${width}x${height}</text>
    </svg>
  `);
  return new Uint8Array(await sharp(svg).png({ compressionLevel: 9 }).toBuffer());
}

async function renderMask(width: number, height: number): Promise<Uint8Array> {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="transparent"/>
      <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.17}" ry="${height * 0.2}" fill="#ffffff" fill-opacity="0.82"/>
    </svg>
  `);
  return new Uint8Array(await sharp(svg).png({ compressionLevel: 9 }).toBuffer());
}

function groupLayer(id: string, name: string, width: number, height: number, now: number): UmbraCanvasGroupLayer {
  return {
    id,
    kind: 'group',
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'source-over',
    transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
    createdAt: now,
    updatedAt: now,
    collapsed: true,
  };
}

async function main(): Promise<void> {
  const width = integerArg('--width', 8192, 512, 16384);
  const height = integerArg('--height', 8192, 512, 16384);
  if (width * height > 64 * 1024 * 1024) throw new Error('Fixture dimensions exceed Umbra\'s 64 megapixel Canvas limit.');
  const layerCount = integerArg('--layers', 16, 1, 64);
  const groupCount = integerArg('--groups', 4, 1, 16);
  const projectId = projectIdArg();
  const service = new UmbraUiCanvasProjectService(resolve('User'));
  if (process.argv.includes('--cleanup')) {
    await service.delete(projectId);
    process.stdout.write(`Removed large-canvas fixture ${projectId}.\n`);
    return;
  }

  const sourceBytes = await renderSource(width, height);
  const maskBytes = await renderMask(width, height);
  const sourceAsset = createUmbraCanvasImageAsset({
    id: 'acceptance-source-asset',
    name: `umbra-large-canvas-${width}x${height}.png`,
    path: '',
    imageUrl: 'blob:umbra-large-canvas-source',
    width,
    height,
  });
  const document = createUmbraCanvasDocument(sourceAsset, `Large Canvas Acceptance ${width}x${height}`);
  document.id = projectId;
  document.generationRegion = {
    x: Math.max(0, Math.round((width - Math.min(1024, width)) / 2)),
    y: Math.max(0, Math.round((height - Math.min(1024, height)) / 2)),
    width: Math.min(1024, width),
    height: Math.min(1024, height),
  };
  const now = Date.now();
  const sourceLayer = document.layers.find((layer): layer is UmbraCanvasRasterLayer => layer.kind === 'raster' && layer.role === 'source');
  const maskLayer = document.layers.find((layer) => layer.kind === 'mask');
  if (!sourceLayer || !maskLayer) throw new Error('The Canvas fixture could not create its source and mask layers.');
  maskLayer.dataUrl = 'blob:umbra-large-canvas-mask';
  maskLayer.overlayStyle = 'crosshatch';
  maskLayer.overlayColor = '#fb7185';

  const groups = Array.from({ length: groupCount }, (_, index) => (
    groupLayer(`acceptance-group-${index + 1}`, `Acceptance Group ${index + 1}`, width, height, now + index)
  ));
  const generatedLayers: UmbraCanvasRasterLayer[] = Array.from({ length: layerCount }, (_, index) => {
    const layer = structuredClone(sourceLayer);
    layer.id = `acceptance-raster-${index + 1}`;
    layer.name = `Raster Pass ${String(index + 1).padStart(2, '0')}`;
    layer.role = 'generated';
    layer.locked = false;
    layer.opacity = 0.035 + (index % 4) * 0.015;
    layer.blendMode = index % 3 === 0 ? 'screen' : index % 3 === 1 ? 'overlay' : 'soft-light';
    layer.groupId = groups[index % groups.length].id;
    layer.transform = {
      x: (index % 5 - 2) * Math.max(2, Math.round(width / 1024)),
      y: (index % 7 - 3) * Math.max(2, Math.round(height / 1024)),
      width,
      height,
      rotation: (index % 5 - 2) * 0.35,
      scaleX: 1,
      scaleY: 1,
    };
    layer.asset = { ...sourceAsset };
    layer.adjustments.enabled = index % 4 === 0;
    layer.adjustments.brightness = index % 4 === 0 ? 0.04 : 0;
    layer.adjustments.saturation = index % 4 === 0 ? 0.08 : 0;
    layer.createdAt = now + groupCount + index;
    layer.updatedAt = layer.createdAt;
    return layer;
  });
  document.layers = [sourceLayer, ...groups, ...generatedLayers, maskLayer];
  document.activeLayerId = generatedLayers.at(-1)?.id || sourceLayer.id;
  document.revision += 1;
  document.updatedAt = Date.now();

  const saved = await service.save(projectId, document, [
    { key: sourceAsset.id, name: sourceAsset.name, bytes: sourceBytes },
    { key: maskLayer.id, name: 'umbra-large-canvas-mask.png', bytes: maskBytes },
  ]);
  process.stdout.write(`${JSON.stringify({
    projectId,
    name: saved.name,
    width: saved.width,
    height: saved.height,
    layers: saved.layers.length,
    rasterLayers: generatedLayers.length + 1,
    groups: groups.length,
    sourceBytes: sourceBytes.byteLength,
    maskBytes: maskBytes.byteLength,
  }, null, 2)}\n`);
}

await main();
