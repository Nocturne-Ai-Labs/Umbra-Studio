export interface UmbraPromptWeightResult {
  nextValue: string;
  selectionStart: number;
  selectionEnd: number;
}

function formatPromptWeight(value: number): string {
  const clamped = Math.max(0, Math.min(10, Math.round(value * 100) / 100));
  return clamped.toFixed(2).replace(/\.?0+$/g, '');
}

function applyPromptWeightToToken(rawToken: string, delta: number): string {
  const token = String(rawToken || '').trim();
  if (!token) return rawToken;
  const weightedMatch = token.match(/^\(([\s\S]+):(-?\d+(?:\.\d+)?)\)$/);
  if (weightedMatch) {
    const prompt = String(weightedMatch[1] || '').trim();
    const currentWeight = Number.parseFloat(weightedMatch[2] || '1');
    const nextWeight = (Number.isFinite(currentWeight) ? currentWeight : 1) + delta;
    return `(${prompt}:${formatPromptWeight(nextWeight)})`;
  }
  return `(${token}:${formatPromptWeight(1 + delta)})`;
}

function applyPromptWeightToSelection(rawSelection: string, delta: number): string {
  return String(rawSelection || '')
    .split(/(,)/g)
    .map((part) => {
      if (part === ',') return part;
      const leading = part.match(/^\s*/)?.[0] || '';
      const trailing = part.match(/\s*$/)?.[0] || '';
      const token = part.slice(leading.length, part.length - trailing.length);
      if (!token.trim()) return part;
      return `${leading}${applyPromptWeightToToken(token, delta)}${trailing}`;
    })
    .join('');
}

export function applyUmbraPromptWeight(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  delta: number,
): UmbraPromptWeightResult | null {
  const source = String(value || '');
  let start = Math.max(0, Math.min(selectionStart, source.length));
  let end = Math.max(start, Math.min(selectionEnd, source.length));
  if (start === end) {
    const leftComma = source.lastIndexOf(',', Math.max(0, start - 1));
    const leftNewline = source.lastIndexOf('\n', Math.max(0, start - 1));
    const rightComma = source.indexOf(',', start);
    const rightNewline = source.indexOf('\n', start);
    start = Math.max(leftComma, leftNewline) + 1;
    const rightCandidates = [rightComma, rightNewline].filter((index) => index >= 0);
    end = rightCandidates.length > 0 ? Math.min(...rightCandidates) : source.length;
  }
  const rawSelection = source.slice(start, end);
  const leading = rawSelection.match(/^\s*/)?.[0] || '';
  const trailing = rawSelection.match(/\s*$/)?.[0] || '';
  const innerStart = start + leading.length;
  const innerEnd = end - trailing.length;
  if (innerStart >= innerEnd) return null;
  const replacement = applyPromptWeightToSelection(source.slice(innerStart, innerEnd), delta);
  return {
    nextValue: `${source.slice(0, innerStart)}${replacement}${source.slice(innerEnd)}`,
    selectionStart: innerStart,
    selectionEnd: innerStart + replacement.length,
  };
}

export function applyUmbraPromptWeightToTextarea(
  textarea: HTMLTextAreaElement,
  delta: number,
): UmbraPromptWeightResult | null {
  return applyUmbraPromptWeight(
    textarea.value,
    textarea.selectionStart ?? textarea.value.length,
    textarea.selectionEnd ?? textarea.selectionStart ?? textarea.value.length,
    delta,
  );
}

export function isUmbraPromptWeightShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key'>,
): boolean {
  return (event.ctrlKey || event.metaKey)
    && event.shiftKey
    && (event.key === 'ArrowUp' || event.key === 'ArrowDown');
}

export function isUmbraQueueShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'key'>,
): boolean {
  return (event.ctrlKey || event.metaKey) && event.key === 'Enter';
}
