import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Psd } from 'ag-psd';
import {
  canUseUmbraPsdEncodeWorker,
  encodeUmbraPsdInWorker,
} from './umbraUiPsdEncodeWorker';

const GLOBAL_KEYS = ['window', 'Worker', 'OffscreenCanvas', 'createImageBitmap'] as const;
const originalDescriptors = new Map<string, PropertyDescriptor | undefined>();

let respond = true;
let bitmapCloseCount = 0;
let fakeBitmap: ImageBitmap;

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  postedBitmaps: Transferable[] = [];

  constructor(public readonly url: string | URL) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: { requestId: number }, transfer: Transferable[] = []) {
    this.postedBitmaps = transfer;
    if (!respond) return;
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          requestId: message.requestId,
          success: true,
          buffer: new Uint8Array([56, 66, 80, 83]).buffer,
          elapsedMs: 25,
        },
      } as MessageEvent);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function defineGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

function createPsd(): Psd {
  return {
    width: 64,
    height: 32,
    children: [{
      name: 'Group',
      children: [{
        name: 'Layer',
        left: 0,
        top: 0,
        right: 64,
        bottom: 32,
        canvas: {} as HTMLCanvasElement,
      }],
    }],
  };
}

describe('Umbra PSD encoder worker client', () => {
  beforeEach(() => {
    for (const key of GLOBAL_KEYS) originalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    respond = true;
    bitmapCloseCount = 0;
    FakeWorker.instances = [];
    fakeBitmap = {
      width: 64,
      height: 32,
      close: () => { bitmapCloseCount += 1; },
    } as ImageBitmap;
    defineGlobal('window', {});
    defineGlobal('Worker', FakeWorker);
    defineGlobal('OffscreenCanvas', class FakeOffscreenCanvas {});
    defineGlobal('createImageBitmap', async () => fakeBitmap);
  });

  afterEach(() => {
    for (const key of GLOBAL_KEYS) {
      const descriptor = originalDescriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    originalDescriptors.clear();
  });

  test('serializes nested layers and transfers their bitmaps to the worker', async () => {
    expect(canUseUmbraPsdEncodeWorker()).toBe(true);
    const result = await encodeUmbraPsdInWorker(createPsd());

    expect(result.elapsedMs).toBe(25);
    expect(Array.from(new Uint8Array(await result.blob.arrayBuffer()))).toEqual([56, 66, 80, 83]);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].url).toBe('/assets/UmbraPsdEncodeWorker.js');
    expect(FakeWorker.instances[0].postedBitmaps).toEqual([fakeBitmap]);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(bitmapCloseCount).toBe(0);
  });

  test('terminates serialization immediately when the export is canceled', async () => {
    respond = false;
    const controller = new AbortController();
    const result = encodeUmbraPsdInWorker(createPsd(), { signal: controller.signal });
    for (let attempt = 0; attempt < 10 && FakeWorker.instances.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(FakeWorker.instances).toHaveLength(1);
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });
});
