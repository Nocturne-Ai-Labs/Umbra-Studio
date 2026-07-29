import { describe, expect, test } from 'bun:test';
import {
  applyAgentDraftToPowerPrompterDocument,
  enhancePowerPrompterQueuePrompts,
} from './powerPrompterAgent';
import { createDefaultPowerPrompterCardDocument } from './powerPrompter';

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

describe('Power Prompter shared agent drafts', () => {
  test('turns structured image segments into editable active-set cards', () => {
    const source = createDefaultPowerPrompterCardDocument('Example.ppcards.json');
    const result = applyAgentDraftToPowerPrompterDocument(source, {
      id: 'draft-1',
      mediaType: 'image',
      title: 'Rain Portrait',
      instructionId: 'image-general-director',
      instructionName: 'General Image Director',
      segments: ['woman in a red jacket', 'rainy cyberpunk street', 'cinematic rim lighting'],
      prompt: 'woman in a red jacket, rainy cyberpunk street, cinematic rim lighting',
      negativePrompt: 'blurry, malformed hands',
      notes: '',
      warnings: [],
      createdAt: Date.now(),
    }, 4);

    const added = result.document.cards.slice(source.cards.length);
    expect(result.addedCardCount).toBe(3);
    expect(added.map((card) => card.label)).toEqual(['Agent Segment 1', 'Agent Segment 2', 'Agent Segment 3']);
    expect(added.map((card) => card.text)).toEqual([
      'woman in a red jacket',
      'rainy cyberpunk street',
      'cinematic rim lighting',
    ]);
    expect(added.every((card) => card.queueSetIds?.[0] === 4)).toBe(true);
    expect(result.document.generation.negativePrompt).toBe('blurry, malformed hands');
    expect(source.cards).toHaveLength(5);
  });

  test('rejects video drafts without mutating the source document', () => {
    const source = createDefaultPowerPrompterCardDocument('Example.ppcards.json');
    expect(() => applyAgentDraftToPowerPrompterDocument(source, {
      id: 'draft-video',
      mediaType: 'video',
      title: 'Motion',
      instructionId: '',
      instructionName: '',
      segments: [],
      prompt: 'camera moves forward',
      negativePrompt: '',
      notes: '',
      warnings: [],
      createdAt: Date.now(),
    }, 1)).toThrow('image prompt drafts only');
    expect(source.cards).toHaveLength(5);
  });
});
