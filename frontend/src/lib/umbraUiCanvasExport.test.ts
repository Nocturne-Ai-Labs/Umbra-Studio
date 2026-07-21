import { afterEach, describe, expect, test } from 'bun:test';
import type { UmbraUiCanvasSaveMetadata } from './umbraUiCanvasExport';
import { saveUmbraUiCanvasToGallery } from './umbraUiCanvasExport';

const originalFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

afterEach(() => {
  if (originalFetchDescriptor) Object.defineProperty(globalThis, 'fetch', originalFetchDescriptor);
});

describe('Umbra canvas Gallery export', () => {
  test('forwards cancellation to the upload request', async () => {
    let uploadSignal: AbortSignal | null | undefined;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: (_input: RequestInfo | URL, init?: RequestInit) => {
        uploadSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          uploadSignal?.addEventListener('abort', () => {
            reject(new DOMException('Upload canceled.', 'AbortError'));
          }, { once: true });
        });
      },
    });

    const controller = new AbortController();
    const result = saveUmbraUiCanvasToGallery(
      new Blob(['png'], { type: 'image/png' }),
      'cancel-me',
      {} as UmbraUiCanvasSaveMetadata,
      controller.signal,
    );
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(uploadSignal).toBe(controller.signal);
  });

  test('rejects an empty rendered canvas before starting an upload', async () => {
    let fetchCalls = 0;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: () => {
        fetchCalls += 1;
        return Promise.resolve(new Response());
      },
    });

    await expect(saveUmbraUiCanvasToGallery(
      new Blob(),
      'empty',
      {} as UmbraUiCanvasSaveMetadata,
    )).rejects.toThrow('rendered canvas is empty');
    expect(fetchCalls).toBe(0);
  });
});
