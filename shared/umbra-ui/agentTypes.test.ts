import { describe, expect, test } from 'bun:test';
import {
  createDefaultUmbraUiAgentInstructions,
  mergeRequiredUmbraUiAgentInstructions,
} from './agentTypes';

describe('Umbra UI default agent instructions', () => {
  test('includes a CSV-grounded Anima and SDXL Danbooru composer', () => {
    const defaults = createDefaultUmbraUiAgentInstructions(100);
    const instruction = defaults.find((entry) => entry.id === 'image-anima-sdxl-csv-tags');

    expect(instruction?.name).toBe('Anima / SDXL CSV Tag Composer');
    expect(instruction?.instruction).toContain('User/PowerPrompter/CSV');
    expect(instruction?.instruction).toContain('exact tag spellings');
    expect(instruction?.instruction).toContain('never invent');
  });

  test('adds the required default without replacing user instructions', () => {
    const custom = [{
      id: 'custom-image-instruction',
      name: 'My Instruction',
      mediaType: 'image' as const,
      instruction: 'Keep my custom wording.',
      createdAt: 10,
      updatedAt: 20,
      order: 0,
    }];

    const merged = mergeRequiredUmbraUiAgentInstructions(custom, 100);

    expect(merged[0]).toEqual(custom[0]);
    expect(merged.some((entry) => entry.id === 'image-anima-sdxl-csv-tags')).toBe(true);
    expect(mergeRequiredUmbraUiAgentInstructions(merged, 200)).toEqual(merged);
  });
});
