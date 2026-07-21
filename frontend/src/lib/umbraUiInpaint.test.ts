import { describe, expect, test } from 'bun:test';
import {
  failLostUmbraUiInpaintJob,
  resolveUmbraUiInpaintFillModeForMask,
  type UmbraUiInpaintJob,
} from './umbraUiInpaint';

function createJob(statuses: UmbraUiInpaintJob['items'][number]['status'][]): UmbraUiInpaintJob {
  return {
    id: 'job-1',
    status: 'running',
    sourceName: 'source.png',
    workflowId: 'workflow-1',
    prompt: 'repair',
    width: 1024,
    height: 1024,
    total: statuses.length,
    completed: statuses.filter((status) => status === 'completed').length,
    failed: statuses.filter((status) => status === 'failed').length,
    createdAt: 1,
    updatedAt: 1,
    items: statuses.map((status, index) => ({
      id: String(index + 1),
      seed: 100 + index,
      status,
      promptId: `prompt-${index + 1}`,
      outputs: status === 'completed' ? [{ filename: `${index}.png`, subfolder: '', type: 'output', fullpath: `${index}.png` }] : [],
      error: status === 'failed' ? 'provider failed' : '',
    })),
  };
}

describe('Umbra UI inpaint frontend recovery', () => {
  test('turns a backend-lost active job into a terminal failure', () => {
    const recovered = failLostUmbraUiInpaintJob(createJob(['queued', 'running']), 'backend record missing');
    expect(recovered).toMatchObject({
      status: 'failed',
      completed: 0,
      failed: 2,
      items: [
        { status: 'failed', error: 'backend record missing' },
        { status: 'failed', error: 'backend record missing' },
      ],
    });
  });

  test('preserves completed outputs and reports a partial terminal job', () => {
    const recovered = failLostUmbraUiInpaintJob(createJob(['completed', 'queued', 'failed']), 'backend record missing');
    expect(recovered.status).toBe('partial');
    expect(recovered.completed).toBe(1);
    expect(recovered.failed).toBe(2);
    expect(recovered.items[0].outputs).toHaveLength(1);
    expect(recovered.items[2].error).toBe('provider failed');
  });
});

describe('Umbra UI inpaint masked fill safety', () => {
  test('keeps local edge fill for small repair masks', () => {
    expect(resolveUmbraUiInpaintFillModeForMask('navier-stokes', 0.12)).toBe('navier-stokes');
    expect(resolveUmbraUiInpaintFillModeForMask('telea', 0.34)).toBe('telea');
  });

  test('uses neutral conditioning instead of stretching edges across large masks', () => {
    expect(resolveUmbraUiInpaintFillModeForMask('navier-stokes', 0.35)).toBe('neutral');
    expect(resolveUmbraUiInpaintFillModeForMask('telea', 0.82)).toBe('neutral');
  });

  test('does not replace model-backed or explicit fill modes', () => {
    expect(resolveUmbraUiInpaintFillModeForMask('neutral', 1)).toBe('neutral');
    expect(resolveUmbraUiInpaintFillModeForMask('lama', 1)).toBe('lama');
    expect(resolveUmbraUiInpaintFillModeForMask('color', 1)).toBe('color');
    expect(resolveUmbraUiInpaintFillModeForMask('tile', 1)).toBe('tile');
  });
});
