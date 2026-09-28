import { readComfyInputChoices } from '../shared/umbra-ui/comfyInputChoices';

type PromptNode = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
type PromptGraph = Record<string, unknown>;

const LORA_TAG = /<lora:([^:>]+)(?::([^:>]*))?(?::([^:>]*))?>/gi;
const ANIMA38_LORA_NODE = 'Anima38LoRALoaderModelOnly';

function isPromptNode(value: unknown): value is PromptNode {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as PromptNode).class_type === 'string'
    && !!(value as PromptNode).inputs && typeof (value as PromptNode).inputs === 'object';
}

export function applyAnima38LoraStack(graph: PromptGraph, prompt: string): string {
  const loader = Object.entries(graph).find(([, node]) => isPromptNode(node) && node.class_type === 'Anima38BV2Loader');
  if (!loader) return prompt;

  const entries: Array<{ name: string; strength: number }> = [];
  let hasLoraTag = false;
  for (const match of prompt.matchAll(LORA_TAG)) {
    hasLoraTag = true;
    const name = match[1].trim().replace(/\\/g, '/');
    const strength = match[2] === undefined || match[2] === '' ? 1 : Number(match[2]);
    if (!name || !Number.isFinite(strength) || strength < -10 || strength > 10) {
      throw new Error(`Invalid Anima 3.8B LoRA tag: ${match[0]}`);
    }
    if (strength !== 0 && !entries.some((entry) => entry.name === name && entry.strength === strength)) {
      entries.push({ name, strength });
    }
  }
  if (!hasLoraTag) return prompt;

  let modelRef: [string, number] = [loader[0], 0];
  const inserted = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    let id = `umbra_anima38_lora_${index + 1}`;
    while (Object.hasOwn(graph, id)) id += '_';
    graph[id] = {
      class_type: ANIMA38_LORA_NODE,
      inputs: { model: modelRef, lora_name: entry.name, strength_model: entry.strength },
      _meta: { title: `Anima 3.8B LoRA ${index + 1}`, umbra_role: 'lora_stack' },
    };
    inserted.add(id);
    modelRef = [id, 0];
  }
  if (entries.length > 0) {
    for (const [nodeId, node] of Object.entries(graph)) {
      if (inserted.has(nodeId) || nodeId === loader[0] || !isPromptNode(node)) continue;
      for (const [inputName, value] of Object.entries(node.inputs || {})) {
        if (Array.isArray(value) && value[0] === loader[0] && value[1] === 0) {
          node.inputs[inputName] = modelRef;
        }
      }
    }
  }

  return prompt.replace(LORA_TAG, ' ').replace(/\s+,/g, ',').replace(/,\s+/g, ', ')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
}

export function resolveAnima38LoraNames(graph: PromptGraph, objectInfo: Record<string, unknown> | null): void {
  const nodes = Object.values(graph).filter((node): node is PromptNode =>
    isPromptNode(node) && node._meta?.umbra_role === 'lora_stack');
  if (nodes.length === 0) return;
  const loader = objectInfo?.[ANIMA38_LORA_NODE] as { input?: { required?: { lora_name?: unknown } } } | undefined;
  const choices = readComfyInputChoices(loader?.input?.required?.lora_name)
    ?.filter((choice): choice is string => typeof choice === 'string');
  if (!choices) throw new Error('Anima 3.8B LoRA bridge is missing. Install ComfyUI-Anima-3.8B-LoRA-Bridge through Umbra Setup, then restart managed ComfyUI.');
  for (const node of nodes) {
    const selected = String(node.inputs.lora_name || '');
    const matches = choices.filter((choice) => choice.replace(/\\/g, '/').toLowerCase() === selected.toLowerCase());
    if (matches.length !== 1) {
      throw new Error(matches.length > 1
        ? `Anima 3.8B LoRA "${selected}" is ambiguous in ComfyUI.`
        : `Anima 3.8B LoRA "${selected}" is not installed in ComfyUI. Refresh the model catalog or choose another LoRA.`);
    }
    node.inputs.lora_name = matches[0];
  }
}
