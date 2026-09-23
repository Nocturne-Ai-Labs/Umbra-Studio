import type { UmbraVideoLoraEntry, UmbraVideoLoraFamily } from '../shared/umbra-ui/videoLoraStack';
import { readComfyInputChoices } from '../shared/umbra-ui/comfyInputChoices';

type PromptNode = { class_type: string; inputs?: Record<string, unknown>; _meta?: Record<string, unknown> };
type PromptGraph = Record<string, unknown>;

function isPromptNode(value: unknown): value is PromptNode {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  return typeof node.class_type === 'string'
    && (!node.inputs || (typeof node.inputs === 'object' && !Array.isArray(node.inputs)));
}

const MODEL_ROLES: Record<UmbraVideoLoraFamily, Record<string, string>> = {
  wan22: { high: 'wan_high_model', low: 'wan_low_model' },
  ltx23: { model: 'ltx_checkpoint' },
  ltx25: { model: 'ltx25_model' },
  minimax_h3: { model: 'minimax_h3_model' },
};

export function assertUmbraUiVideoLoraStackInstalled(
  family: UmbraVideoLoraFamily,
  stack: UmbraVideoLoraEntry[],
  objectInfo: Record<string, unknown> | null,
): void {
  const selected = stack.filter(item => item.family === family && item.enabled);
  if (!selected.length) return;
  if (selected.some(item => !item.name)) throw new Error('Choose a file for each enabled video LoRA, or disable the empty row.');
  const loader = objectInfo?.LoraLoaderModelOnly as { input?: { required?: { lora_name?: unknown } } } | undefined;
  const descriptor = loader?.input?.required?.lora_name;
  const choices = readComfyInputChoices(descriptor);
  if (!choices) throw new Error('Video LoRA support could not be verified in ComfyUI. Start or update the managed ComfyUI server and refresh its catalog.');
  const installed = new Set(choices.map(name => String(name).replace(/\\/g, '/')));
  for (const item of selected) {
    if (!installed.has(item.name)) throw new Error(`Video LoRA "${item.name}" is not installed in the managed ComfyUI runtime. Select an installed LoRA or disable this row.`);
  }
}

export function applyUmbraUiVideoLoraStack(graph: PromptGraph, family: UmbraVideoLoraFamily, stack: UmbraVideoLoraEntry[]): void {
  const entries = stack.filter(item => item.family === family && item.enabled && item.name && item.strength !== 0);
  if (!entries.length) return;

  for (const [stage, role] of Object.entries(MODEL_ROLES[family])) {
    const selected = entries.filter(item => family !== 'wan22' || item.wanStage === 'both' || item.wanStage === stage);
    if (!selected.length) continue;
    const source = Object.entries(graph).find(([, node]) => isPromptNode(node) && node._meta?.umbra_role === role);
    if (!source) throw new Error(`This ${family} workflow has no ${role} model connection for the video LoRA stack.`);
    const [sourceId] = source;
    let output: [string, number] = [sourceId, 0];
    const inserted: PromptNode[] = [];
    for (const [index, item] of selected.entries()) {
      let id = `umbra_video_lora_${stage}_${index + 1}`;
      while (Object.hasOwn(graph, id)) id += '_';
      const node: PromptNode = {
        class_type: 'LoraLoaderModelOnly',
        inputs: { model: output, lora_name: item.name, strength_model: item.strength },
        _meta: { umbra_role: 'video_lora_stack', title: `Video LoRA ${index + 1}` },
      };
      graph[id] = node;
      inserted.push(node);
      output = [id, 0];
    }
    for (const node of Object.values(graph)) {
      if (!isPromptNode(node) || inserted.includes(node) || !node.inputs) continue;
      for (const [key, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && value.length === 2 && value[0] === sourceId && value[1] === 0) {
          node.inputs[key] = output;
        }
      }
    }
  }
}
