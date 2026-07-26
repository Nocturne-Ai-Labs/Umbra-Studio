import { describe, expect, test } from 'bun:test';
import { resolveUmbraUiQueueControlTargets } from './umbraUiQueueControls';

describe('resolveUmbraUiQueueControlTargets', () => {
  test('targets only active and queued Umbra UI work in a mixed queue', () => {
    const targets = resolveUmbraUiQueueControlTargets('umbra-active', [
      {
        requestId: 'power-prompter-active',
        origin: 'power_prompter',
        prompts: [{ status: 'running' }, { status: 'pending' }],
      },
      {
        requestId: 'umbra-active',
        origin: 'umbra_ui',
        prompts: [{ status: 'running' }, { status: 'pending' }],
      },
      {
        requestId: 'umbra-future',
        origin: 'umbra_ui',
        prompts: [{ status: 'pending' }],
      },
      {
        requestId: 'umbra-complete',
        origin: 'umbra_ui',
        prompts: [{ status: 'completed' }],
      },
    ]);

    expect(targets.activeRequestId).toBe('umbra-active');
    expect(targets.requestIds).toEqual(['umbra-active', 'umbra-future']);
    expect(targets.running).toBe(1);
    expect(targets.pending).toBe(2);
  });

  test('does not expose Skip while Power Prompter owns the active request', () => {
    const targets = resolveUmbraUiQueueControlTargets('power-prompter-active', [
      {
        requestId: 'power-prompter-active',
        origin: 'power_prompter',
        prompts: [{ status: 'running' }],
      },
      {
        requestId: 'umbra-future',
        origin: 'umbra_ui',
        prompts: [{ status: 'pending' }],
      },
    ]);

    expect(targets.activeRequestId).toBe('');
    expect(targets.requestIds).toEqual(['umbra-future']);
  });
});
