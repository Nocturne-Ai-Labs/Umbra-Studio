export const UMBRA_UI_PROMPT_FIELD_HISTORY_LIMIT = 50;

export interface UmbraUiPromptFieldHistory {
  undo: string[];
  redo: string[];
}

export interface UmbraUiPromptFieldHistoryResult {
  history: UmbraUiPromptFieldHistory;
  text: string;
}

export function cloneUmbraUiPromptFieldHistory(
  history?: UmbraUiPromptFieldHistory,
): UmbraUiPromptFieldHistory {
  return {
    undo: [...(history?.undo || [])],
    redo: [...(history?.redo || [])],
  };
}

export function recordUmbraUiPromptFieldCheckpoint(
  history: UmbraUiPromptFieldHistory | undefined,
  previousText: string,
  limit = UMBRA_UI_PROMPT_FIELD_HISTORY_LIMIT,
): UmbraUiPromptFieldHistory {
  const next = cloneUmbraUiPromptFieldHistory(history);
  if (next.undo[next.undo.length - 1] !== previousText) {
    next.undo.push(previousText);
  }
  next.undo = next.undo.slice(-Math.max(1, limit));
  next.redo = [];
  return next;
}

export function undoUmbraUiPromptField(
  history: UmbraUiPromptFieldHistory | undefined,
  currentText: string,
): UmbraUiPromptFieldHistoryResult | null {
  if (!history || history.undo.length <= 0) return null;
  const next = cloneUmbraUiPromptFieldHistory(history);
  const text = next.undo.pop();
  if (text === undefined) return null;
  if (next.redo[next.redo.length - 1] !== currentText) {
    next.redo.push(currentText);
  }
  return { history: next, text };
}

export function redoUmbraUiPromptField(
  history: UmbraUiPromptFieldHistory | undefined,
  currentText: string,
): UmbraUiPromptFieldHistoryResult | null {
  if (!history || history.redo.length <= 0) return null;
  const next = cloneUmbraUiPromptFieldHistory(history);
  const text = next.redo.pop();
  if (text === undefined) return null;
  if (next.undo[next.undo.length - 1] !== currentText) {
    next.undo.push(currentText);
  }
  return { history: next, text };
}
