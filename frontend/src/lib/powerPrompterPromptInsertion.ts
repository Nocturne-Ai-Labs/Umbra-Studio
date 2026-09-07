export interface PowerPrompterPromptInsertionResult {
  nextValue: string;
  selectionStart: number;
  selectionEnd: number;
}

function clampSelection(value: number, length: number): number {
  if (!Number.isFinite(value)) return length;
  return Math.max(0, Math.min(Math.floor(value), length));
}

function cleanInsertionText(value: string): string {
  return String(value || '').trim().replace(/(?:\s*,\s*)+$/g, '');
}

export function insertCatalogTagsAtCursor(
  rawText: string,
  rawInsertion: string,
  selectionStart: number,
  selectionEnd: number,
  appendTrailingComma = true,
): PowerPrompterPromptInsertionResult | null {
  const insertion = cleanInsertionText(rawInsertion);
  if (!insertion) return null;

  const source = String(rawText || '');
  // Catalog clicks are additive, including when the field has selected text.
  const caret = Math.max(clampSelection(selectionStart, source.length), clampSelection(selectionEnd, source.length));
  const before = source.slice(0, caret);
  const after = source.slice(caret);
  const prefix = !before || /(?:,|\r?\n)[\t ]*$/.test(before)
    ? (/,$/.test(before) ? ' ' : '')
    : ', ';
  const alreadyDelimited = /^\s*,/.test(after) || /^\s*\n/.test(after);
  const suffix = appendTrailingComma && !alreadyDelimited ? ', ' : '';
  const nextValue = `${before}${prefix}${insertion}${suffix}${after}`;
  const nextCaret = before.length + prefix.length + insertion.length + suffix.length;

  return {
    nextValue,
    selectionStart: nextCaret,
    selectionEnd: nextCaret,
  };
}
