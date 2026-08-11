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

export function replacePowerPrompterPromptTokenAtCursor(
  rawText: string,
  rawInsertion: string,
  selectionStart: number,
  selectionEnd: number,
  appendTrailingComma = true,
): PowerPrompterPromptInsertionResult | null {
  const insertion = cleanInsertionText(rawInsertion);
  if (!insertion) return null;

  const source = String(rawText || '');
  const start = clampSelection(selectionStart, source.length);
  const end = Math.max(start, clampSelection(selectionEnd, source.length));
  let insertionStart = start;
  let insertionEnd = end;

  if (start === end) {
    const leftComma = source.lastIndexOf(',', Math.max(0, start - 1));
    const leftNewline = source.lastIndexOf('\n', Math.max(0, start - 1));
    const tokenStart = Math.max(leftComma, leftNewline) + 1;
    const rightComma = source.indexOf(',', start);
    const rightNewline = source.indexOf('\n', start);
    const rightBoundaries = [rightComma, rightNewline].filter((index) => index >= 0);
    const tokenEnd = rightBoundaries.length > 0 ? Math.min(...rightBoundaries) : source.length;
    const tokenText = source.slice(tokenStart, tokenEnd);
    const leadingWhitespace = tokenText.match(/^\s*/)?.[0].length || 0;
    const trailingWhitespace = tokenText.match(/\s*$/)?.[0].length || 0;
    insertionStart = tokenStart + leadingWhitespace;
    insertionEnd = Math.max(insertionStart, tokenEnd - trailingWhitespace);
  }

  const before = source.slice(0, insertionStart);
  const after = source.slice(insertionEnd);
  const alreadyDelimited = /^\s*,/.test(after) || /^\s*\n/.test(after);
  const suffix = appendTrailingComma && !alreadyDelimited ? ', ' : '';
  const nextValue = `${before}${insertion}${suffix}${after}`;
  const nextCaret = before.length + insertion.length + suffix.length;

  return {
    nextValue,
    selectionStart: nextCaret,
    selectionEnd: nextCaret,
  };
}
