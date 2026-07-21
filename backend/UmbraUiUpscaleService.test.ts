import { afterEach, describe, expect, test } from 'bun:test';
import {
  UmbraUiUpscaleService,
  type UmbraUiUpscaleQueuePlacement,
} from './UmbraUiUpscaleService';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function waitForTerminalJob(service: UmbraUiUpscaleService, jobId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const job = service.getJob(jobId);
    if (job && (job.status === 'completed' || job.status === 'partial' || job.status === 'failed')) return job;
    await Bun.sleep(5);
  }
  throw new Error('Timed out waiting for the test upscale job.');
}

describe('UmbraUiUpscaleService scheduling', () => {
  test('holds the selected queue position for the complete serial job and always releases it', async () => {
    const prepared: Array<{ jobId: string; queuePlacement: UmbraUiUpscaleQueuePlacement }> = [];
    let released = 0;
    let promptCount = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/upload/image')) {
        return Response.json({ name: 'input.png', subfolder: 'umbra-ui-upscale/test' });
      }
      if (url.endsWith('/prompt')) {
        promptCount += 1;
        return Response.json({ prompt_id: `prompt-${promptCount}` });
      }
      if (url.includes('/history/')) {
        const promptId = decodeURIComponent(url.split('/').pop() || '');
        return Response.json({
          [promptId]: {
            status: { status_str: 'success', completed: true },
            outputs: {
              '3': {
                images: [{ filename: `${promptId}.png`, subfolder: 'Umbra UI/extras', type: 'output' }],
              },
            },
          },
        });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const service = new UmbraUiUpscaleService({
      getComfyBaseUrl: () => 'http://127.0.0.1:8188',
      prepareExecution: async (context) => {
        prepared.push(context);
        return () => { released += 1; };
      },
    });
    const submitted = await service.submit([
      { name: 'first.png', read: async () => new Uint8Array([1, 2, 3]) },
      { name: 'second.png', read: async () => new Uint8Array([4, 5, 6]) },
    ], {
      modelName: 'anime-upscale.pth',
      maxDimension: 3840,
      queuePlacement: 'next',
    });

    const completed = await waitForTerminalJob(service, submitted.id);
    expect(completed.status).toBe('completed');
    expect(completed.queuePlacement).toBe('next');
    expect(completed.completed).toBe(2);
    expect(promptCount).toBe(2);
    expect(prepared).toEqual([{ jobId: submitted.id, queuePlacement: 'next' }]);
    expect(released).toBe(1);
  });

  test('marks a queued job failed when its execution gate cannot be acquired', async () => {
    const service = new UmbraUiUpscaleService({
      getComfyBaseUrl: () => 'http://127.0.0.1:8188',
      prepareExecution: async () => {
        throw new Error('queue gate unavailable');
      },
    });
    const submitted = await service.submit([
      { name: 'blocked.png', read: async () => new Uint8Array([1]) },
    ], {
      modelName: 'anime-upscale.pth',
      maxDimension: 2048,
      queuePlacement: 'interrupt',
    });

    const failed = await waitForTerminalJob(service, submitted.id);
    expect(failed.status).toBe('failed');
    expect(failed.failed).toBe(1);
    expect(failed.items[0]?.error).toContain('queue gate unavailable');
  });
});
