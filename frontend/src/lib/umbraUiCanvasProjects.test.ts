import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { createUmbraCanvasDocument, createUmbraCanvasImageAsset } from './umbraUiCanvasDocument';
import { exportUmbraCanvasProject, importUmbraCanvasProject } from './umbraUiCanvasProjects';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('portable Umbra canvas projects', () => {
  test('round-trips the layered document and embeds its source asset', async () => {
    const source = createUmbraCanvasImageAsset({
      name: 'source.png',
      path: '',
      imageUrl: ONE_PIXEL_PNG,
      width: 1,
      height: 1,
    });
    const document = createUmbraCanvasDocument(source, 'Portable Canvas');
    const phases: string[] = [];
    const archive = await exportUmbraCanvasProject(document, {
      onProgress: (progress) => phases.push(progress.phase),
    });
    expect(archive.size).toBeGreaterThan(100);
    expect(phases).toContain('collecting');
    expect(phases).toContain('compressing');

    const imported = await importUmbraCanvasProject(archive);
    try {
      expect(imported.document.id).not.toBe(document.id);
      expect(imported.document.name).toBe('Portable Canvas');
      const importedSource = imported.document.layers.find((layer) => layer.kind === 'raster');
      expect(importedSource?.kind).toBe('raster');
      if (importedSource?.kind !== 'raster') throw new Error('Imported source layer is missing.');
      expect(importedSource.asset.imageUrl.startsWith('blob:')).toBe(true);
      expect((await fetch(importedSource.asset.imageUrl)).ok).toBe(true);
    } finally {
      for (const objectUrl of imported.objectUrls) URL.revokeObjectURL(objectUrl);
    }
  });

  test('cancels an in-flight asset collection request', async () => {
    const source = createUmbraCanvasImageAsset({
      name: 'slow-source.png',
      path: '',
      imageUrl: '/slow-canvas-asset.png',
      width: 1,
      height: 1,
    });
    const document = createUmbraCanvasDocument(source, 'Canceled Canvas');
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    let observedSignal: AbortSignal | null | undefined;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Canceled.', 'AbortError'));
        }, { once: true });
      });
    }) as typeof fetch;

    try {
      const archive = exportUmbraCanvasProject(document, { signal: controller.signal });
      controller.abort();
      await expect(archive).rejects.toMatchObject({ name: 'AbortError' });
      expect(observedSignal).toBe(controller.signal);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rejects unsafe project archives before hydrating their embedded assets', async () => {
    const source = createUmbraCanvasImageAsset({
      name: 'source.png',
      path: '',
      imageUrl: ONE_PIXEL_PNG,
      width: 1,
      height: 1,
    });
    const archive = await exportUmbraCanvasProject(createUmbraCanvasDocument(source, 'Unsafe Canvas'));
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    const projectFile = zip.file('project.json');
    if (!projectFile) throw new Error('Fixture project is missing.');
    const project = JSON.parse(await projectFile.async('string'));
    project.width = 16_385;
    project.height = 1;
    zip.file('project.json', JSON.stringify(project));
    const unsafeArchive = await zip.generateAsync({ type: 'blob' });

    await expect(importUmbraCanvasProject(unsafeArchive)).rejects.toThrow('16384-pixel interactive canvas side limit');
  });

  test('rejects unsafe project export before collecting assets', async () => {
    const source = createUmbraCanvasImageAsset({
      name: 'source.png',
      path: '',
      imageUrl: ONE_PIXEL_PNG,
      width: 1,
      height: 1,
    });
    const document = createUmbraCanvasDocument(source, 'Unsafe Export');
    document.width = 9_000;
    document.height = 9_000;
    await expect(exportUmbraCanvasProject(document)).rejects.toThrow('64 MP interactive canvas memory limit');
  });
});
