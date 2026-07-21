import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { UMBRA_CANVAS_DOCUMENT_VERSION } from '../frontend/src/lib/umbraUiCanvasDocument';
import { UmbraUiCanvasProjectService } from './UmbraUiCanvasProjectService';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function projectDocument() {
  return {
    version: 1,
    id: 'project-1',
    name: 'Test Project',
    width: 512,
    height: 512,
    operationMode: 'inpaint',
    layers: [
      {
        id: 'source-layer',
        kind: 'raster',
        role: 'source',
        name: 'Original',
        asset: {
          id: 'source-asset',
          name: 'source.png',
          imageUrl: 'blob:source',
          path: '',
          width: 512,
          height: 512,
        },
      },
      {
        id: 'mask-layer',
        kind: 'mask',
        name: 'Inpaint Mask',
        dataUrl: 'data:image/png;base64,mask',
      },
    ],
    staging: [],
    activeLayerId: 'source-layer',
    activeMaskLayerId: 'mask-layer',
    previewStageId: '',
    generationRegion: null,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('UmbraUiCanvasProjectService', () => {
  test('atomically stores portable project assets and hydrates their API URLs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const saved = await service.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);

    expect(saved.version).toBe(UMBRA_CANVAS_DOCUMENT_VERSION);
    expect(saved.layers[1].purpose).toBe('inpaint');
    expect(saved.layers[0].asset.imageUrl).toContain('/api/umbra-ui/inpaint/projects/project-1/assets/');
    expect(saved.layers[1].dataUrl).toContain('/api/umbra-ui/inpaint/projects/project-1/assets/');
    expect((await service.list())[0]).toMatchObject({
      id: 'project-1',
      name: 'Test Project',
      layerCount: 2,
      thumbnailUrl: expect.stringContaining('/api/umbra-ui/inpaint/projects/project-1/assets/'),
    });

    const savedAgain = await service.save('project-1', saved, []);
    expect(savedAgain.layers[0].asset.imageUrl).toBe(saved.layers[0].asset.imageUrl);
    const filename = decodeURIComponent(saved.layers[0].asset.imageUrl.split('/').pop());
    expect((await service.resolveAsset('project-1', filename))?.size).toBe(imageBytes.byteLength);
  });

  test('rejects transient assets that were not included in the save request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    await expect(service.save('project-1', projectDocument(), [])).rejects.toThrow('was not uploaded');
  });

  test('accepts the current frontend document version and rejects future project formats', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const current = projectDocument();
    current.version = UMBRA_CANVAS_DOCUMENT_VERSION;
    expect((await service.save('project-1', current, [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ])).version).toBe(UMBRA_CANVAS_DOCUMENT_VERSION);

    const future = structuredClone(current);
    future.version = UMBRA_CANVAS_DOCUMENT_VERSION + 1;
    await expect(service.save('project-1', future, [])).rejects.toThrow('newer than this Umbra build');
  });

  test('migrates legacy layers without making omitted opacity fully transparent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const legacy = projectDocument();
    legacy.version = 1;
    for (const layer of legacy.layers) {
      delete (layer as Record<string, unknown>).opacity;
      delete (layer as Record<string, unknown>).blendMode;
    }
    delete (legacy.layers[1] as Record<string, unknown>).purpose;

    const saved = await service.save('project-1', legacy, [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);

    expect(saved.version).toBe(UMBRA_CANVAS_DOCUMENT_VERSION);
    expect(saved.layers[0]).toMatchObject({ opacity: 1, blendMode: 'source-over' });
    expect(saved.layers[1]).toMatchObject({ opacity: 1, blendMode: 'source-over', purpose: 'inpaint' });
  });

  test('does not mutate the last good project when a replacement save fails validation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const originalBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const replacementBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]);
    const saved = await service.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: originalBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: originalBytes },
    ]);
    const originalUrl = saved.layers[0].asset.imageUrl;
    const broken = structuredClone(saved);
    broken.name = 'Broken replacement';
    broken.layers.push({
      id: 'missing-layer',
      kind: 'raster',
      role: 'generated',
      name: 'Missing upload',
      asset: {
        id: 'missing-asset',
        name: 'missing.png',
        imageUrl: 'blob:missing',
        path: '',
        width: 512,
        height: 512,
      },
    });

    await expect(service.save('project-1', broken, [
      { key: 'source-asset', name: 'source.png', bytes: replacementBytes },
    ])).rejects.toThrow('was not uploaded');

    const recovered = await service.get('project-1');
    expect(recovered?.name).toBe('Test Project');
    expect(recovered?.layers[0].asset.imageUrl).toBe(originalUrl);
    const filename = decodeURIComponent(originalUrl.split('/').pop());
    const asset = await service.resolveAsset('project-1', filename);
    expect(asset).not.toBeNull();
    expect(new Uint8Array(await readFile(asset!.path))).toEqual(originalBytes);
  });

  test('recovers interrupted Windows fallback replacements on the next service boot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 7]);
    const saved = await service.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);
    const snapshot = await service.createSnapshot('project-1', 'Power loss checkpoint');
    const projectRoot = join(root, 'UmbraUI', 'InpaintProjects', 'project-1');
    const assetsRoot = join(projectRoot, 'assets');
    const snapshotsRoot = join(projectRoot, 'snapshots');
    const sourceFilename = decodeURIComponent(saved.layers[0].asset.imageUrl.split('/').pop());
    const snapshotFilename = `${snapshot.id}.json`;

    await rename(join(projectRoot, 'project.json'), join(projectRoot, 'project.json.backup-interrupted'));
    await rename(join(assetsRoot, sourceFilename), join(assetsRoot, `${sourceFilename}.backup-interrupted`));
    await rename(join(snapshotsRoot, snapshotFilename), join(snapshotsRoot, `${snapshotFilename}.backup-interrupted`));
    await writeFile(join(projectRoot, 'project.abandoned.tmp'), '{"name":"uncommitted"}', 'utf8');
    await writeFile(join(assetsRoot, '.asset.abandoned.tmp'), imageBytes);

    const recoveredService = new UmbraUiCanvasProjectService(root);
    const recovered = await recoveredService.get('project-1');
    expect(recovered).toMatchObject({ id: 'project-1', name: 'Test Project', version: UMBRA_CANVAS_DOCUMENT_VERSION });
    expect(await recoveredService.listSnapshots('project-1')).toEqual([
      expect.objectContaining({ id: snapshot.id, name: 'Power loss checkpoint' }),
    ]);
    const recoveredAsset = await recoveredService.resolveAsset('project-1', sourceFilename);
    expect(recoveredAsset).not.toBeNull();
    expect(new Uint8Array(await readFile(recoveredAsset!.path))).toEqual(imageBytes);
    expect((await readdir(projectRoot)).some((name) => name.includes('atomic-backup') || name.includes('.backup-') || name.endsWith('.tmp'))).toBe(false);
    expect((await readdir(assetsRoot)).some((name) => name.includes('atomic-backup') || name.includes('.backup-') || name.endsWith('.tmp'))).toBe(false);
    expect((await readdir(snapshotsRoot)).some((name) => name.includes('atomic-backup') || name.includes('.backup-') || name.endsWith('.tmp'))).toBe(false);
  });

  test('restores a valid backup instead of trusting a malformed final project file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9]);
    await service.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);
    const projectRoot = join(root, 'UmbraUI', 'InpaintProjects', 'project-1');
    const projectPath = join(projectRoot, 'project.json');
    const committed = await readFile(projectPath);
    await writeFile(`${projectPath}.backup-interrupted`, committed);
    await writeFile(projectPath, '{"name":"truncated"', 'utf8');

    const recoveredService = new UmbraUiCanvasProjectService(root);
    expect((await recoveredService.get('project-1'))?.name).toBe('Test Project');
    expect((await readdir(projectRoot)).some((name) => name.includes('atomic-backup') || name.includes('.backup-') || name.endsWith('.tmp'))).toBe(false);
  });

  test('restores the last committed project when a forced fallback hook fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 8]);
    const baselineService = new UmbraUiCanvasProjectService(root);
    const saved = await baselineService.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);
    const replacement = structuredClone(saved);
    replacement.name = 'Uncommitted replacement';
    let backupObserved = false;
    const interruptedService = new UmbraUiCanvasProjectService(root, {
      atomicReplacementHooks: {
        forceBackupPath: true,
        afterBackupCreated: ({ finalPath, backupPath }) => {
          backupObserved = finalPath.endsWith('project.json') && backupPath.includes('.umbra-atomic-backup-');
          throw new Error('Injected replacement interruption.');
        },
      },
    });

    await expect(interruptedService.save('project-1', replacement, [])).rejects.toThrow('Injected replacement interruption');
    expect(backupObserved).toBe(true);

    const recoveredService = new UmbraUiCanvasProjectService(root);
    expect((await recoveredService.get('project-1'))?.name).toBe('Test Project');
    const projectRoot = join(root, 'UmbraUI', 'InpaintProjects', 'project-1');
    expect((await readdir(projectRoot)).some((name) => name.includes('atomic-backup') || name.includes('.backup-') || name.endsWith('.tmp'))).toBe(false);
  });

  test('preserves IP Adapter controls and private influence masks across save and reload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const document = projectDocument();
    document.version = 12;
    document.layers.push(
      {
        id: 'reference-mask',
        kind: 'mask',
        purpose: 'reference',
        name: 'Reference Mask',
        dataUrl: 'blob:reference-mask',
      },
      {
        id: 'reference-layer',
        kind: 'reference',
        name: 'Identity',
        method: 'ip_adapter',
        maskLayerId: 'reference-mask',
        modelName: 'adapter.safetensors',
        visionModelName: 'vision.safetensors',
        weight: 0.85,
        beginStepPercent: 0.1,
        endStepPercent: 0.8,
        ipAdapterWeightType: 'composition precise',
        ipAdapterCombineEmbeds: 'average',
        ipAdapterEmbedsScaling: 'K+V',
        asset: { id: 'reference-asset', name: 'reference.png', imageUrl: 'blob:reference', path: '', width: 512, height: 512 },
      },
    );
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const saved = await service.save('project-1', document, [
      { key: 'source-asset', name: 'source.png', bytes },
      { key: 'mask-layer', name: 'mask.png', bytes },
      { key: 'reference-mask', name: 'reference-mask.png', bytes },
      { key: 'reference-asset', name: 'reference.png', bytes },
    ]);
    expect(saved.layers.find((layer: any) => layer.id === 'reference-mask')).toMatchObject({ purpose: 'reference' });
    expect(saved.layers.find((layer: any) => layer.id === 'reference-layer')).toMatchObject({
      method: 'ip_adapter',
      maskLayerId: 'reference-mask',
      weight: 0.85,
      beginStepPercent: 0.1,
      endStepPercent: 0.8,
      ipAdapterWeightType: 'composition precise',
      ipAdapterCombineEmbeds: 'average',
      ipAdapterEmbedsScaling: 'K+V',
    });
    const loaded = await service.get('project-1');
    expect(loaded?.layers.find((layer: any) => layer.id === 'reference-mask')?.dataUrl).toContain('/assets/');
  });

  test('preserves live regional IP Adapter influence links across save and reload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const document = projectDocument();
    document.version = 12;
    document.layers.push(
      {
        id: 'region-mask', kind: 'mask', purpose: 'regional_guidance', name: 'Face Mask', dataUrl: 'blob:region-mask',
      },
      {
        id: 'face-region', kind: 'regional_guidance', name: 'Face Region', maskLayerId: 'region-mask',
        positivePrompt: 'detailed face', negativePrompt: '', autoNegative: true, weight: 1, beginStepPercent: 0, endStepPercent: 1,
      },
      {
        id: 'linked-reference', kind: 'reference', name: 'Face Identity', method: 'ip_adapter', regionLayerId: 'face-region',
        modelName: 'adapter.safetensors', visionModelName: 'vision.safetensors', weight: 0.9,
        beginStepPercent: 0, endStepPercent: 1, ipAdapterWeightType: 'linear', ipAdapterCombineEmbeds: 'concat', ipAdapterEmbedsScaling: 'V only',
        asset: { id: 'linked-reference-asset', name: 'face.png', imageUrl: 'blob:face', path: '', width: 512, height: 512 },
      },
    );
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const saved = await service.save('project-1', document, [
      { key: 'source-asset', name: 'source.png', bytes },
      { key: 'mask-layer', name: 'mask.png', bytes },
      { key: 'region-mask', name: 'region-mask.png', bytes },
      { key: 'linked-reference-asset', name: 'face.png', bytes },
    ]);
    expect(saved.layers.find((layer: any) => layer.id === 'face-region')).toMatchObject({ autoNegative: true });
    const savedReference = saved.layers.find((layer: any) => layer.id === 'linked-reference');
    expect(savedReference).toMatchObject({ regionLayerId: 'face-region' });
    expect(savedReference?.maskLayerId).toBeUndefined();
    const loaded = await service.get('project-1');
    expect(loaded?.layers.find((layer: any) => layer.id === 'linked-reference')).toMatchObject({ regionLayerId: 'face-region' });
  });

  test('removes persisted assets after their owning layers are deleted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const saved = await service.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);
    const maskFilename = decodeURIComponent(saved.layers[1].dataUrl.split('/').pop());
    saved.layers = [saved.layers[0]];
    await service.save('project-1', saved, []);
    expect(await service.resolveAsset('project-1', maskFilename)).toBeNull();
  });

  test('deletes a project together with its assets and restore points', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const saved = await service.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);
    await service.createSnapshot('project-1', 'Before delete');
    const filename = decodeURIComponent(saved.layers[0].asset.imageUrl.split('/').pop());

    await service.delete('project-1');

    expect(await service.get('project-1')).toBeNull();
    expect(await service.resolveAsset('project-1', filename)).toBeNull();
    expect(await service.listSnapshots('project-1')).toEqual([]);
  });

  test('creates and restores named project checkpoints while retaining their assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const saved = await service.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);
    const snapshot = await service.createSnapshot('project-1', 'Before face edit');
    expect(snapshot).toMatchObject({ name: 'Before face edit', layerCount: 2 });
    expect(await service.listSnapshots('project-1')).toHaveLength(1);
    const maskFilename = decodeURIComponent(saved.layers[1].dataUrl.split('/').pop());
    saved.layers = [saved.layers[0]];
    await service.save('project-1', saved, []);
    expect(await service.resolveAsset('project-1', maskFilename)).not.toBeNull();
    const restored = await service.restoreSnapshot('project-1', snapshot.id);
    expect(restored.layers).toHaveLength(2);
    expect(restored.layers[1].dataUrl).toContain(maskFilename);
    await service.deleteSnapshot('project-1', snapshot.id);
    expect(await service.listSnapshots('project-1')).toHaveLength(0);
  });

  test('rejects projects that exceed the interactive canvas memory budget', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const document = projectDocument();
    document.width = 9000;
    document.height = 9000;
    await expect(service.save('project-1', document, [])).rejects.toThrow('64 MP interactive canvas memory limit');

    document.width = 16385;
    document.height = 1;
    await expect(service.save('project-1', document, [])).rejects.toThrow('16384-pixel interactive canvas side limit');
  });

  test('refuses corrupted oversized stored projects instead of hydrating them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const document = projectDocument();
    document.id = 'corrupted-project';
    document.width = 20_000;
    document.height = 1;
    const projectRoot = join(root, 'UmbraUI', 'InpaintProjects', 'corrupted-project');
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, 'project.json'), JSON.stringify(document), 'utf8');

    await expect(service.get('corrupted-project')).rejects.toThrow('16384-pixel interactive canvas side limit');
  });

  test('persists 4K and maximum-area 8K project geometry without allocating raster pixels', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-canvas-project-'));
    roots.push(root);
    const service = new UmbraUiCanvasProjectService(root);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const saved = await service.save('project-1', projectDocument(), [
      { key: 'source-asset', name: 'source.png', bytes: imageBytes },
      { key: 'mask-layer', name: 'mask.png', bytes: imageBytes },
    ]);

    saved.width = 3840;
    saved.height = 2160;
    const fourK = await service.save('project-1', saved, []);
    expect(fourK).toMatchObject({ width: 3840, height: 2160 });

    fourK.width = 8192;
    fourK.height = 8192;
    const maximumArea = await service.save('project-1', fourK, []);
    expect(maximumArea).toMatchObject({ width: 8192, height: 8192 });

    maximumArea.width = 16384;
    maximumArea.height = 4096;
    const wide = await service.save('project-1', maximumArea, []);
    expect(wide).toMatchObject({ width: 16384, height: 4096 });
  });
});
