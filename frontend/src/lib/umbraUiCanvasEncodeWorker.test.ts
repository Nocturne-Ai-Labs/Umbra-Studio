import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  canUseUmbraCanvasEncodeWorker,
  encodeUmbraCanvasInWorker,
} from './umbraUiCanvasEncodeWorker';

type WorkerMode = 'success' | 'failure' | 'idle' | 'throw';

const GLOBAL_KEYS = ['window', 'Worker', 'OffscreenCanvas', 'createImageBitmap'] as const;
const originalDescriptors = new Map<string, PropertyDescriptor | undefined>();

let workerMode: WorkerMode = 'success';
let bitmapCloseCount = 0;
let fakeBitmap: ImageBitmap;

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  postedTransfer: Transferable[] = [];

  constructor(public readonly url: string | URL, public readonly options?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: { requestId: number }, transfer: Transferable[] = []) {
    this.postedTransfer = transfer;
    if (workerMode === 'throw') throw new Error('transfer failed');
    if (workerMode === 'idle') return;
    queueMicrotask(() => {
      this.onmessage?.({
        data: workerMode === 'failure'
          ? { requestId: message.requestId, success: false, error: 'encode failed' }
          : {
            requestId: message.requestId,
            success: true,
            blob: new Blob(['encoded']),
            width: 64,
            height: 32,
            elapsedMs: 12,
          },
      } as MessageEvent);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

class FakeOffscreenCanvas {
  async convertToBlob(): Promise<Blob> {
    return new Blob();
  }
}

function defineGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

describe('Umbra canvas encoder worker client', () => {
  beforeEach(() => {
    for (const key of GLOBAL_KEYS) originalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    workerMode = 'success';
    bitmapCloseCount = 0;
    FakeWorker.instances = [];
    fakeBitmap = {
      width: 64,
      height: 32,
      close: () => { bitmapCloseCount += 1; },
    } as ImageBitmap;
    defineGlobal('window', {});
    defineGlobal('Worker', FakeWorker);
    defineGlobal('OffscreenCanvas', FakeOffscreenCanvas);
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

  test('encodes through the dedicated worker and terminates it afterward', async () => {
    expect(canUseUmbraCanvasEncodeWorker()).toBe(true);
    const result = await encodeUmbraCanvasInWorker({
      canvas: {} as HTMLCanvasElement,
      type: 'image/png',
    });

    expect(result).toMatchObject({ width: 64, height: 32, elapsedMs: 12 });
    expect(await result.blob.text()).toBe('encoded');
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].url).toBe('/assets/UmbraCanvasEncodeWorker.js');
    expect(FakeWorker.instances[0].postedTransfer).toEqual([fakeBitmap]);
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  test('terminates an in-flight worker when the operation is canceled', async () => {
    workerMode = 'idle';
    const controller = new AbortController();
    const result = encodeUmbraCanvasInWorker({
      canvas: {} as HTMLCanvasElement,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  test('surfaces worker failures and still terminates the worker', async () => {
    workerMode = 'failure';
    await expect(encodeUmbraCanvasInWorker({ canvas: {} as HTMLCanvasElement }))
      .rejects.toThrow('encode failed');
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  test('closes an untransferred bitmap when postMessage throws', async () => {
    workerMode = 'throw';
    await expect(encodeUmbraCanvasInWorker({ canvas: {} as HTMLCanvasElement }))
      .rejects.toThrow('transfer failed');
    expect(bitmapCloseCount).toBe(1);
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });
});
