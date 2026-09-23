/** Keep the original position when discarding empty prompts so parallel metadata stays aligned. */
export function collectQueueSnapshotPromptRows(
  rawPrompts: unknown,
  normalizePrompt: (value: unknown) => string,
): Array<{ prompt: string; sourceIndex: number }> {
  if (!Array.isArray(rawPrompts)) return [];
  const rows: Array<{ prompt: string; sourceIndex: number }> = [];
  rawPrompts.forEach((value, sourceIndex) => {
    const prompt = normalizePrompt(value);
    if (prompt) rows.push({ prompt, sourceIndex });
  });
  return rows;
}
