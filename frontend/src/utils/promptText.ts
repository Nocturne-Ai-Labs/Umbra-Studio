/** Prompt JSON is content, not a ComfyUI workflow. Never normalize its strings. */
export function promptText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return '';
}

export function parsePromptJson(value: unknown): Record<string, unknown> | unknown[] | null {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> | unknown[] : null;
  } catch { return null; }
}

export function formatPromptText(value: unknown): string {
  const json = parsePromptJson(value);
  return json ? JSON.stringify(json, null, 2) : promptText(value);
}
