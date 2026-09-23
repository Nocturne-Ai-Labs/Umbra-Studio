import { composeActivePromptFromCards } from '../shared/power-prompter/queuePromptBuilder';
import type { PowerPrompterCardNode } from '../shared/power-prompter/types';

export function composePowerPrompterDocumentPrompt(document: { cards: PowerPrompterCardNode[]; activeQueueSet: number }): string {
  return composeActivePromptFromCards(document.cards, document.activeQueueSet);
}
