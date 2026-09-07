import { classifyUmbraPrompt } from '@/lib/nsfwPrivacy';

export function isProtectedLivePreview(prompt: string | undefined): boolean {
  // Unidentified live frames must not flash before their prompt metadata arrives.
  return prompt === undefined || classifyUmbraPrompt(prompt) === 'nsfw';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function readComfyPreviewPrompt(queueRow: unknown): string | undefined {
  if (!Array.isArray(queueRow)) return undefined;
  const metadata = record(record(queueRow[3]).extra_pnginfo);
  const prompter = record(metadata.umbra_power_prompter);
  if (typeof prompter.prompt === 'string') return prompter.prompt;
  if (typeof metadata.positive_prompt === 'string') return metadata.positive_prompt;

  const graph = record(queueRow[2]);
  const parts = new Set<string>();
  const visited = new Set<string>();
  const resolving = new Set<string>();
  let unresolved = false;
  const readText = (value: unknown) => {
    if (typeof value === 'string') {
      parts.add(value);
      return;
    }
    if (!Array.isArray(value) || value.length !== 2) {
      unresolved = true;
      return;
    }
    const id = String(value[0]);
    if (resolving.has(id)) {
      unresolved = true;
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    resolving.add(id);
    const inputs = record(record(graph[id]).inputs);
    let followedInput = false;
    for (const [key, input] of Object.entries(inputs)) {
      if (/negative/i.test(key)) continue;
      if (/^(text(?:_\w+)?|prompt|positive(?:_prompt)?|conditioning(?:_\d+)?|string_[ab]|clip_[lg]|t5xxl)$/.test(key)) {
        followedInput = true;
        readText(input);
      }
    }
    if (!followedInput) unresolved = true;
    resolving.delete(id);
  };
  // Follow positive conditioning only, never infer safety from unrelated/negative text nodes.
  for (const candidate of Object.values(graph)) {
    const node = record(candidate);
    const inputs = record(node.inputs);
    if ('positive' in inputs) readText(inputs.positive);
    if ('positive_prompt' in inputs) readText(inputs.positive_prompt);
    if (node.class_type === 'BasicGuider') readText(inputs.conditioning);
  }
  return parts.size > 0 && !unresolved ? [...parts].join(', ') : undefined;
}
