import { describe, expect, test } from 'bun:test';
import { enhancePowerPrompterQueuePrompts } from './powerPrompterAgent';

describe('enhancePowerPrompterQueuePrompts', () => {
  test('enhances prompts sequentially while preserving structured variant tokens', async () => {
    const order: number[] = [];
    const progress: Array<{ completed: number; total: number; current: number }> = [];
    const result = await enhancePowerPrompterQueuePrompts(
      ['character, pose', 'character, outfit'],
      [
        { prompt: 'character, pose', tokens: [{ slotId: 'character', variantId: 'char-1' }] },
        { prompt: 'character, outfit', tokens: [{ slotId: 'outfit', variantId: 'outfit-1' }] },
      ],
      async (prompt, index) => {
        order.push(index);
        return `${prompt}, enhanced`;
      },
      (next) => progress.push(next),
    );

    expect(order).toEqual([0, 1]);
    expect(result.prompts).toEqual([
      'character, pose, enhanced',
      'character, outfit, enhanced',
    ]);
    expect(result.promptEntries[0]?.tokens).toEqual([{ slotId: 'character', variantId: 'char-1' }]);
    expect(result.promptEntries[0]?.originalPrompt).toBe('character, pose');
    expect(result.promptEntries[0]?.agentEnhanced).toBe(true);
    expect(progress.at(-1)).toEqual({ completed: 2, current: 2, total: 2 });
  });

  test('rejects the whole enhancement before returning a partial queue', async () => {
    let calls = 0;
    await expect(enhancePowerPrompterQueuePrompts(
      ['first', 'second', 'third'],
      [],
      async (prompt) => {
        calls += 1;
        if (prompt === 'second') throw new Error('agent unavailable');
        return `${prompt} enhanced`;
      },
    )).rejects.toThrow('agent unavailable');
    expect(calls).toBe(2);
  });
});
