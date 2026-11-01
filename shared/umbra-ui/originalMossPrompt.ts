/** Recover a recorded input, never try to reverse an enhanced caption. */
export function originalMossPrompt(metadata: any): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  if (typeof metadata.original_positive_prompt === 'string') return metadata.original_positive_prompt;
  if (typeof metadata.umbra_power_prompter?.originalPrompt === 'string') return metadata.umbra_power_prompter.originalPrompt;
  // Umbra records the submitted prompt separately even when the saved workflow is stripped.
  if (readableMossPrompt(metadata.positive_prompt) !== undefined || readableMossPrompt(metadata.umbra_power_prompter?.prompt) !== undefined) {
    for (const value of [metadata.umbra_power_prompter?.prompt, metadata.umbra_inpaint?.prompt]) {
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  for (let graph of [metadata.umbra_api_workflow, metadata.prompt, metadata.workflow]) {
    if (typeof graph === 'string') { try { graph = JSON.parse(graph); } catch { continue; } }
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) continue;
    const enhancers = Object.values(graph).filter((node: any) => node?.class_type === 'UmbraMossPromptEnhancer') as any[];
    if (enhancers.length !== 1) continue;
    const seen = new Set<string>();
    const resolve = (input: unknown): string | undefined => {
      if (typeof input === 'string') return input;
      if (!Array.isArray(input) || input.length !== 2) return undefined;
      const id = String(input[0]);
      if (seen.has(id) || seen.size > 32) return undefined;
      seen.add(id);
      const node = graph[id];
      if (node?.class_type === 'UmbraA1111LoraSyntax' && input[1] === 2) return resolve(node.inputs?.prompt_text);
      if (node?.class_type === 'UmbraPowerPrompterReader' && input[1] === 0) return resolve(node.inputs?.prompt_text);
      return undefined;
    };
    const original = resolve(enhancers[0].inputs?.prompt);
    if (original !== undefined) return original;
  }
  return undefined;
}

/** Readable MOSS content, not a reconstruction of the original wording. */
export function readableMossPrompt(value: unknown): string | undefined {
  let data: any = value;
  for (let depth = 0; depth < 3 && typeof data === 'string'; depth++) {
    const text = data.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
    try { data = JSON.parse(text); } catch { return undefined; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  // Caption-only records and summary-only scenes do not necessarily contain items.
  const summary = data.summary && typeof data.summary === 'object' ? data.summary : data;
  if (typeof summary.caption !== 'string' || (data.items !== undefined && !Array.isArray(data.items))) return undefined;
  const lines: string[] = [];
  if (summary.caption.trim()) lines.push(summary.caption.trim());
  const meta = summary.meta;
  if (typeof meta === 'string' && meta.trim()) lines.push(meta.trim());
  else if (Array.isArray(meta)) {
    const terms = meta.filter((entry: unknown) => typeof entry === 'string' && entry.trim());
    if (terms.length) lines.push(terms.join(', '));
  }
  for (const item of data.items || []) {
    if (!item || typeof item !== 'object') continue;
    const caption = typeof item.caption === 'string' ? item.caption.trim() : '';
    const words = typeof item.text === 'string' ? item.text.trim() : '';
    if (!caption && !words) continue;
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    lines.push(`${label ? label + ': ' : ''}${caption}${words && words !== caption ? `${caption ? ' ' : ''}Text: "${words}"` : ''}`);
  }
  return lines.join('\n\n');
}

export function reusableMossPrompt(metadata: unknown, generated: string): { text: string; kind: 'original' | 'readable' | 'unchanged' } {
  const original = originalMossPrompt(metadata);
  if (original !== undefined) {
    const readableOriginal = readableMossPrompt(original);
    return readableOriginal !== undefined ? { text: readableOriginal, kind: 'readable' } : { text: original, kind: 'original' };
  }
  const readable = readableMossPrompt(generated);
  return readable !== undefined ? { text: readable, kind: 'readable' } : { text: generated, kind: 'unchanged' };
}

/** Remove only LoRA directives; preserve the user's line breaks, spacing and repetition. */
export function withoutLoraSyntax(text: string): string {
  return text.replace(/<lora:[^>]+>/gi, '');
}
