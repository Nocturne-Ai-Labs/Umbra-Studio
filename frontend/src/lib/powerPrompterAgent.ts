import type { QueuePromptPreviewEntry } from '@/components/power-prompter/queue/queueCore';
import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import type { UmbraUiAgentDraft } from '@/lib/umbraUiAgent';
import { createPowerPrompterCardNode } from '@/lib/powerPrompter';

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

export interface PowerPrompterAgentDraftApplication {
  document: PowerPrompterCardDocument;
  addedCardCount: number;
}

export function applyAgentDraftToPowerPrompterDocument(
  document: PowerPrompterCardDocument,
  draft: UmbraUiAgentDraft,
  targetSetId: number,
): PowerPrompterAgentDraftApplication {
  if (draft.mediaType !== 'image') {
    throw new Error('Power Prompter accepts image prompt drafts only.');
  }
  const segments = (draft.segments.length > 0 ? draft.segments : [draft.prompt])
    .map((segment) => String(segment || '').trim())
    .filter(Boolean);
  if (segments.length <= 0) {
    throw new Error('The selected agent draft does not contain an image prompt.');
  }

  const normalizedSetId = Math.max(1, Math.min(99, Math.floor(Number(targetSetId) || 1)));
  const firstOrder = document.cards.reduce(
    (highest, card) => Math.max(highest, Number(card.order) || 0),
    -1,
  ) + 1;
  const title = String(draft.title || 'Agent Draft').trim().slice(0, 80) || 'Agent Draft';
  const draftCards = segments.map((text, index) => {
    const card = createPowerPrompterCardNode(
      'custom',
      segments.length === 1 ? 'Agent Prompt' : `Agent Segment ${index + 1}`,
      text,
      firstOrder + index,
    );
    return {
      ...card,
      variantName: segments.length === 1 ? title : `${title} ${index + 1}`,
      variantTags: ['agent-draft'],
      queueSetIds: [normalizedSetId],
      queueEnabled: true,
    };
  });

  return {
    addedCardCount: draftCards.length,
    document: {
      ...document,
      generation: {
        ...document.generation,
        negativePrompt: String(draft.negativePrompt || '').trim() || document.generation.negativePrompt,
      },
      cards: [...document.cards, ...draftCards],
      updatedAt: new Date().toISOString(),
    },
  };
}

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
