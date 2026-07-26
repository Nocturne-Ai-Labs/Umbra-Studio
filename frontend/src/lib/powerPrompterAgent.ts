import type { QueuePromptPreviewEntry } from '@/components/power-prompter/queue/queueCore';

export interface PowerPrompterAgentProgress {
  completed: number;
  total: number;
  current: number;
}

export interface PowerPrompterAgentEnhancedQueue {
  prompts: string[];
  promptEntries: QueuePromptPreviewEntry[];
}

export type PowerPrompterPromptEnhancer = (
  prompt: string,
  index: number,
  total: number,
) => Promise<string>;

export async function enhancePowerPrompterQueuePrompts(
  prompts: string[],
  promptEntries: QueuePromptPreviewEntry[],
  enhancePrompt: PowerPrompterPromptEnhancer,
  onProgress?: (progress: PowerPrompterAgentProgress) => void,
): Promise<PowerPrompterAgentEnhancedQueue> {
  const sourcePrompts = prompts.map((prompt) => String(prompt || '').trim());
  const enhancedPrompts: string[] = [];
  const total = sourcePrompts.length;

  for (let index = 0; index < sourcePrompts.length; index += 1) {
    const sourcePrompt = sourcePrompts[index];
    if (!sourcePrompt) {
      throw new Error(`Prompt ${index + 1} is empty and cannot be enhanced.`);
    }
    onProgress?.({ completed: index, current: index + 1, total });
    const enhancedPrompt = String(await enhancePrompt(sourcePrompt, index, total) || '').trim();
    if (!enhancedPrompt) {
      throw new Error(`The agent returned an empty result for prompt ${index + 1}.`);
    }
    enhancedPrompts.push(enhancedPrompt);
    onProgress?.({ completed: index + 1, current: Math.min(index + 2, total), total });
  }

  return {
    prompts: enhancedPrompts,
    promptEntries: enhancedPrompts.map((prompt, index) => {
      const sourceEntry = promptEntries[index] || { prompt: sourcePrompts[index] || '', tokens: [] };
      return {
        ...sourceEntry,
        prompt,
        originalPrompt: sourcePrompts[index] || sourceEntry.prompt,
        agentEnhanced: true,
      };
    }),
  };
}
