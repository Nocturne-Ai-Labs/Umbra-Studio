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

function findTopLevelPromptSeparators(value: string): number[] {
  const separators: number[] = [];
  const depth = { round: 0, square: 0, curly: 0, angle: 0 };
  let quote = '';
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const apostropheAfterWord = character === "'" && /[\p{L}\p{N}]/u.test(value[index - 1] || '');
    const apostropheWithinWord = apostropheAfterWord && /[\p{L}\p{N}]/u.test(value[index + 1] || '');
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (quote) {
      if (character === quote && !apostropheWithinWord) quote = '';
      continue;
    }
    if (apostropheAfterWord) continue;
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(') depth.round += 1;
    else if (character === ')') depth.round = Math.max(0, depth.round - 1);
    else if (character === '[') depth.square += 1;
    else if (character === ']') depth.square = Math.max(0, depth.square - 1);
    else if (character === '{') depth.curly += 1;
    else if (character === '}') depth.curly = Math.max(0, depth.curly - 1);
    else if (character === '<') depth.angle += 1;
    else if (character === '>') depth.angle = Math.max(0, depth.angle - 1);
    if ((character === ',' || character === '\n')
      && depth.round === 0 && depth.square === 0 && depth.curly === 0 && depth.angle === 0) {
      separators.push(index);
    }
  }
  return separators;
}

function applyPromptWeightToSelection(rawSelection: string, delta: number, separatorPositions: number[]): string {
  const weightPart = (part: string) => {
    const leading = part.match(/^\s*/)?.[0] || '';
    const trailing = part.match(/\s*$/)?.[0] || '';
    const token = part.slice(leading.length, part.length - trailing.length);
    if (!token.trim()) return part;
    return `${leading}${applyPromptWeightToToken(token, delta)}${trailing}`;
  };
  let result = '';
  let partStart = 0;
  for (const position of separatorPositions) {
    result += weightPart(rawSelection.slice(partStart, position)) + rawSelection[position];
    partStart = position + 1;
  }
  return result + weightPart(rawSelection.slice(partStart));
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
  const separators = findTopLevelPromptSeparators(source);
  if (start === end) {
    start = (separators.filter((position) => position < start).at(-1) ?? -1) + 1;
    end = separators.find((position) => position >= end) ?? source.length;
  }
  const rawSelection = source.slice(start, end);
  const leading = rawSelection.match(/^\s*/)?.[0] || '';
  const trailing = rawSelection.match(/\s*$/)?.[0] || '';
  const innerStart = start + leading.length;
  const innerEnd = end - trailing.length;
  if (innerStart >= innerEnd) return null;
  const replacement = applyPromptWeightToSelection(
    source.slice(innerStart, innerEnd),
    delta,
    separators.filter((position) => position >= innerStart && position < innerEnd)
      .map((position) => position - innerStart),
  );
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
