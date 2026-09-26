import {
  createUmbraUiPromptSegment,
  type UmbraUiPromptSegment,
} from './umbraUiPromptSegments';
import {
  normalizeUmbraUiPromptHistory,
  recordUmbraUiPromptHistory,
  type UmbraUiPromptHistoryEntry,
} from './umbraUiPromptHistory';

export interface UmbraVideoPromptRecoveryResume {
  autoPrompterEnabled?: boolean;
  autoPrompterPrompt?: string;
  recoveredPromptHistory?: UmbraUiPromptHistoryEntry[];
}

export function recoverLegacyUmbraVideoAutoPrompt(resume: UmbraVideoPromptRecoveryResume | null): {
  autoPromptSegments: UmbraUiPromptSegment[] | null;
  history: UmbraUiPromptHistoryEntry[];
} {
  const text = String(resume?.autoPrompterPrompt || '').trim();
  const history = normalizeUmbraUiPromptHistory(resume?.recoveredPromptHistory);
  if (resume?.autoPrompterEnabled !== true || !text) return { autoPromptSegments: null, history };
  const autoPromptSegments = [createUmbraUiPromptSegment(text, {
    label: 'Recovered MiniMax Prompt',
    preserveRepeatedTerms: true,
  })];
  return {
    autoPromptSegments,
    // MiniMax did not use a negative prompt. Recovery is editable through history.
    history: recordUmbraUiPromptHistory(history, autoPromptSegments, ''),
  };
}

export function restoreLegacyUmbraVideoAutoPrompt(
  currentSegments: UmbraUiPromptSegment[],
  initialSegments: UmbraUiPromptSegment[],
  savedFamily: string | null,
  autoPromptSegments: UmbraUiPromptSegment[] | null,
): UmbraUiPromptSegment[] {
  // Never replace edits made while saved video controls were loading.
  if (savedFamily !== 'minimax_h3' || currentSegments !== initialSegments || !autoPromptSegments) {
    return currentSegments;
  }
  return autoPromptSegments;
}
