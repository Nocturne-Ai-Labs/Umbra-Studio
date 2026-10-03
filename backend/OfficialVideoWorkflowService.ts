import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { assertLtx23StagedMediaName } from './Ltx23OmniForgeWorkflow';
import { readComfyInputChoices } from '../shared/umbra-ui/comfyInputChoices';
import { isOfficialVideoWorkflowId, normalizeOfficialVideoWorkflowSelection, type OfficialVideoBinding, type OfficialVideoWorkflowId, type OfficialVideoWorkflowSelection } from '../shared/umbra-ui/officialVideoWorkflow';
import { dasiwaVideoGraphRoute, videoGraphNodes } from '../shared/umbra-ui/videoRoutePolicy';

type Node = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
export type OfficialApiGraph = Record<string, Node>;
const SOURCE_COMMIT = '143bd6a47d844ddd7a68175db5c5ff3867f5febb';
export const OFFICIAL_VIDEO_SOURCES = {
  'h3-26': { name: 'DaSiWa H3 MythicAlchemy C-MMH3-26', family: 'minimax_h3', sha256: 'd13b404cc77860fb8284cd4276c8057f1714583304ed6b03357bda799d83ca0d', path: 'C-MMH3/DaSiWa MiniMaxH3 MythicAlchemy C-MMH3-26.json' },
  'ltx23-50': { name: 'DaSiWa LTX OmniForge C-LTX23-50', family: 'ltx23', sha256: 'f4a9e0c3abfff2c4e94525b312c463981090da7e5cb8a41cd479bb9779ab6933', path: 'C-LTX23/DaSiWa LTX OmniForge C-LTX23-50.json' },
} as const;
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
export const officialGraphSha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function uiNodes(document: any): any[] {
  return [...(document.nodes || []), ...(document.definitions?.subgraphs || []).flatMap((graph: any) => uiNodes(graph))];
}
export function officialUiTopology(document: any): string {
  if (!Array.isArray(document?.nodes) || !Array.isArray(document?.links)) throw new Error('The native serializer did not return an editable ComfyUI workflow.');
  const graphs: any[] = [], definitionIds = new Set<string>();
  let count = 0;
  // Native frontend1.53.6 removes only unlabeled, unconnected widget slots in
  // result.workflow. Normalize that representation without changing the graph.
  const nativeInputs = (values: any[] = [], type = '') => (values || []).filter(input =>
    !(input.widget && input.link === null && !input.label)
    // The pinned KJNodes adds this optional slot to older H3 workflows.
    && !(type === 'ModelPreviewOverrideKJ' && input.name === 'audio_vae' && input.type === 'VAE' && input.link == null));
  const id = (value: unknown) => { if ((typeof value === 'string' && value.length > 0 && value.length <= 128) || (typeof value === 'number' && Number.isSafeInteger(value))) return String(value); throw new Error('Official workflow contains an invalid node or link ID.'); };
  const ids = (values?: unknown[] | null) => [...new Set((values || []).map(id))].sort();
  const ports = (values: any[] = [], boundary = false) => (values || []).map(port => {
    if (!port || typeof port.name !== 'string') throw new Error('Official workflow contains invalid connection slots.');
    return boundary ? { id: port.id, name: port.name, type: port.type, links: ids(port.linkIds) }
      : { name: port.name, type: port.type, link: port.link == null ? null : id(port.link), links: ids(port.links) };
  });
  const walk = (value: any, scope: string, depth: number) => {
    if (depth > 32 || !Array.isArray(value?.nodes) || !Array.isArray(value?.links)) throw new Error('Official workflow contains invalid nested graph data.');
    const seen = new Set<string>();
    const nodes = value.nodes.map((node: any) => {
      const key = id(node?.id);
      if (!node || typeof node.type !== 'string' || !node.type || seen.has(key) || ++count > 8192) throw new Error('Official workflow contains invalid or duplicate nodes.');
      seen.add(key);
      if (node.subgraph) walk(node.subgraph, `${scope}/node:${key}`, depth + 1);
      return { id: key, type: node.type, inputs: ports(nativeInputs(node.inputs, node.type)), outputs: ports(node.outputs) };
    }).sort((a: any, b: any) => a.id.localeCompare(b.id));
    const links = value.links.map((link: any) => {
      const parts = Array.isArray(link) ? link : [link.id, link.origin_id, link.origin_slot, link.target_id, link.target_slot, link.type];
      if (parts.length < 6 || !Number.isSafeInteger(parts[2]) || !Number.isSafeInteger(parts[4])) throw new Error('Official workflow contains invalid connections.');
      const target = value.nodes.find((node: any) => String(node.id) === String(parts[3]));
      let slot = parts[4];
      if (target) {
        const input = target.inputs?.[slot];
        slot = input ? nativeInputs(target.inputs, target.type).indexOf(input) : -1;
        if (slot < 0) throw new Error('Official workflow topology targets a missing native input slot.');
      }
      return [id(parts[0]), id(parts[1]), parts[2], id(parts[3]), slot, parts[5]];
    }).sort((a: any[], b: any[]) => a[0].localeCompare(b[0]));
    graphs.push({ scope, nodes, links, inputs: ports(value.inputs, true), outputs: ports(value.outputs, true),
      inputNode: value.inputNode?.id == null ? null : id(value.inputNode.id), outputNode: value.outputNode?.id == null ? null : id(value.outputNode.id) });
    for (const definition of value.definitions?.subgraphs || []) {
      const key = id(definition?.id);
      if (definitionIds.has(key)) throw new Error('Official workflow contains duplicate subgraph definitions.');
      definitionIds.add(key); walk(definition, `definition:${key}`, depth + 1);
    }
  };
  walk(document, 'root', 0);
  return JSON.stringify(graphs.sort((a, b) => a.scope.localeCompare(b.scope)));
}

/** Correlate native execution IDs with UI instances; never construct an API graph. */
export function officialUiExecutionNodes(document: any): Map<string, { type: string; inactive: boolean; node: any; graph: any; path: string[] }> {
  const definitions = new Map<string, any>(), result = new Map<string, { type: string; inactive: boolean; node: any; graph: any; path: string[] }>();
  const collect = (graph: any, depth: number) => {
    if (depth > 32) throw new Error('Official subgraph nesting is unsupported.');
    for (const definition of graph.definitions?.subgraphs || []) { definitions.set(String(definition.id), definition); collect(definition, depth + 1); }
    for (const node of graph.nodes || []) if (node.subgraph) collect(node.subgraph, depth + 1);
  };
  collect(document, 0);
  const walk = (graph: any, path: string[], inactive: boolean, ancestors: Set<any>) => {
    if (path.length > 32 || ancestors.has(graph)) throw new Error('Official subgraph nesting is recursive or unsupported.');
    const nextAncestors = new Set(ancestors).add(graph);
    for (const node of graph.nodes || []) {
      const parts = [...path, String(node.id)], key = parts.join(':');
      const held = inactive || node.mode === 2 || node.mode === 4;
      const nested = node.subgraph || definitions.get(node.type);
      if (nested) walk(nested, parts, held, nextAncestors);
      else {
        if (result.has(key)) throw new Error('Official workflow contains duplicate execution IDs.');
        result.set(key, { type: node.type, inactive: held, node, graph, path });
      }
    }
  };
  walk(document, [], false, new Set());
  return result;
}
export interface OfficialWorkflowCapture {
  workflowId: OfficialVideoWorkflowId;
  sourceCommit: string;
  sourceSha256: string;
  serializer: 'comfy-native-v1';
  graphSha256: string;
  workflowSha256: string;
  capturedAt: number;
  saveLastFrame?: boolean;
  nativeExport?: { workflowTextSha256: string; apiTextSha256: string };
}
export function parseNativeExportText(text: unknown, label: string): unknown {
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > 16 * 1024 * 1024) throw new Error(`${label} must be a native JSON export of at most 16 MiB.`);
  try {
    // Check original tokens before JSON.parse can round a fractional seed into
    // an apparently safe integer. Skip quoted JSON strings, including escapes.
    for (const match of text.matchAll(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)) {
      const token = match[0];
      if (token.startsWith('"')) continue;
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error('Non-finite numeric token.');
      if (!Number.isInteger(value)) continue;
      const parts = token.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/)!;
      const digits = (parts[2] + (parts[3] || '')).replace(/^0+/, '');
      if (!digits) continue;
      const scale = Number(parts[4] || 0) - (parts[3]?.length || 0);
      let integerDigits: string;
      if (scale >= 0) {
        if (!Number.isSafeInteger(scale) || digits.length + scale > 16) throw new Error('Unsafe numeric precision. Preserve decimal seed strings or use a fixed safe native seed.');
        integerDigits = digits + '0'.repeat(scale);
      } else {
        if (!Number.isSafeInteger(scale) || -scale >= digits.length || !digits.endsWith('0'.repeat(Math.min(-scale, digits.length)))) throw new Error('Numeric precision was lost before import. No fraction will be rounded into an integer.');
        integerDigits = digits.slice(0, scale);
      }
      const exact = BigInt((parts[1] || '') + integerDigits);
      if (exact !== BigInt(value) || exact > BigInt(Number.MAX_SAFE_INTEGER) || exact < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Unsafe numeric precision. Preserve decimal seed strings or use a fixed safe native seed.');
    }
    return JSON.parse(text.replace(/^\uFEFF/, ''), (_key, value) => {
      if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('Unsafe numeric precision. Preserve decimal seed strings or re-export with a fixed safe native seed; no number will be rounded or converted.');
      return value;
    });
  } catch (error) { throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
}
export function officialCaptureMetadata(document: unknown): OfficialWorkflowCapture | null {
  const meta = record(record(document).umbra_official_workflow);
  if (!isOfficialVideoWorkflowId(meta.workflowId) || meta.sourceCommit !== SOURCE_COMMIT
    || meta.sourceSha256 !== OFFICIAL_VIDEO_SOURCES[meta.workflowId].sha256
    || meta.serializer !== 'comfy-native-v1' || !/^[a-f0-9]{64}$/.test(meta.graphSha256) || !/^[a-f0-9]{64}$/.test(meta.workflowSha256)) return null;
  return meta as OfficialWorkflowCapture;
}
const BINDABLE_INPUTS: Record<string, string[]> = {
  UNETLoader: ['unet_name'], UnetLoaderGGUF: ['unet_name'], CLIPLoader: ['clip_name'], CLIPLoaderGGUF: ['clip_name'],
  DualCLIPLoader: ['clip_name1', 'clip_name2'], DualCLIPLoaderGGUF: ['clip_name1', 'clip_name2'],
  VAELoader: ['vae_name'], VAELoaderKJ: ['vae_name'], UpscaleModelLoader: ['model_name'], LatentUpscaleModelLoader: ['model_name'],
  LoadImage: ['image'], LoadAudio: ['audio'],
};
export function applyOfficialVideoBindings(original: OfficialApiGraph, bindings: OfficialVideoBinding[]): OfficialApiGraph {
  const graph = structuredClone(original);
  const seen = new Set<string>();
  for (const binding of bindings) {
    const node = graph[binding.nodeId];
    const key = `${binding.nodeId}\0${binding.inputName}`;
    if (seen.has(key)) throw new Error('An official workflow input was bound more than once.');
    seen.add(key);
    if (!node || !BINDABLE_INPUTS[node.class_type]?.includes(binding.inputName)
      || typeof node.inputs?.[binding.inputName] !== 'string') throw new Error('Only existing literal model and staged-media inputs may be bound. Configure prompts, seeds, stages and sampling in the official ComfyUI workflow.');
    if (!binding.value || binding.value.includes('\0') || /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-z]:|:|https?:/i.test(binding.value)) throw new Error('Official workflow bindings require an installed relative resource or staged-media name.');
    node.inputs[binding.inputName] = binding.value;
  }
  return graph;
}
export function assertOfficialApiGraph(graph: OfficialApiGraph, workflowId: OfficialVideoWorkflowId, sourceUi: unknown): void {
  const allowedTypes = new Set(uiNodes(sourceUi).map(node => node.type));
  const executionNodes = officialUiExecutionNodes(sourceUi);
  const nodes = Object.entries(graph);
  if (!nodes.length || nodes.length > 1000) throw new Error('The native serializer returned no valid API graph.');
  for (const [id, node] of nodes) {
    const uiNode = executionNodes.get(id);
    if (['__proto__', 'constructor', 'prototype'].includes(id) || !node || !allowedTypes.has(node.class_type)
      || !uiNode || uiNode.type !== node.class_type || uiNode.inactive
      || ['Note', 'MarkdownNote', 'Reroute', 'Lable (DaSiWa)', 'DaSiWa_NodeStatusSwitch'].includes(node.class_type)
      || !node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs)) throw new Error(`Official graph contains an unexpected node (${id}). The API export must match this native UI snapshot; export both files together again.`);
    for (const [name, value] of Object.entries(node.inputs)) {
      if (/^target_\d+$/.test(name)) throw new Error('The native status-switch hooks did not finish pruning the API graph. Export again after repairing the DaSiWa frontend suite.');
      if (/seed/i.test(name) && typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Native seed precision was lost. Use DaSiWa Seed Control with lossless decimal seed state and capture again.');
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]) && !graph[value[0]]) throw new Error(`Official graph input ${id}.${name} has a missing node link.`);
    }
  }
  // Direct edges between emitted executable nodes have no virtual/subgraph
  // transformation. Check them without reimplementing the native serializer.
  for (const [id, node] of nodes) {
    const ui = executionNodes.get(id)!;
    for (const input of ui.node.inputs || []) {
      if (input.link == null) continue;
      const link = (ui.graph.links || []).find((entry: any) => String(Array.isArray(entry) ? entry[0] : entry.id) === String(input.link));
      if (!link) throw new Error('Official native UI input has a missing connection.');
      const origin = Array.isArray(link) ? link[1] : link.origin_id;
      const slot = Array.isArray(link) ? link[2] : link.origin_slot;
      const originId = [...ui.path, String(origin)].join(':');
      const originUi = executionNodes.get(originId);
      if (!originUi || originUi.inactive || !graph[originId]) continue;
      const actual = node.inputs[input.name];
      if (!Array.isArray(actual) || actual.length !== 2 || actual[0] !== originId || actual[1] !== slot) throw new Error(`Official API connection ${id}.${input.name} differs from its native UI export. Export both files together again.`);
    }
  }
  const route = dasiwaVideoGraphRoute(graph);
  if (route !== (workflowId === 'h3-26' ? 'h3-director' : 'ltx23-omniforge')) throw new Error('The native API graph does not contain the connected official DaSiWa route. No adapted fallback is available.');
}
export function assertOfficialApiRuntime(graph: OfficialApiGraph, objectInfo: Record<string, any> | null): void {
  if (!objectInfo) throw new Error('Official workflow readiness is blocked: managed ComfyUI node and model catalogs are unavailable. Open the ComfyUI workspace and refresh readiness.');
  for (const [id, node] of Object.entries(graph)) {
    const schema = objectInfo[node.class_type];
    if (!schema) throw new Error(`Official workflow needs ${node.class_type}. This installed runtime is missing that node; generation is held.`);
    const required = record(schema.input?.required);
    const inputs = { ...required, ...record(schema.input?.optional) };
    for (const name of Object.keys(required)) if (!Object.hasOwn(node.inputs, name)) throw new Error(`Official workflow ${node.class_type} requires ${name}. Its installed schema differs from this capture.`);
    for (const [name, value] of Object.entries(node.inputs)) {
      let descriptor = inputs[name];
      // The pinned LTX frontend serializes its DOM widget as an empty string.
      if (!descriptor && node.class_type === 'LTXDirector' && name === 'timeline_ui' && value === '') continue;
      // rgthree's dynamic context ports are omitted from object_info.
      if (!descriptor && node.class_type === 'Context Switch (rgthree)' && /^ctx_\d+$/.test(name)
        && Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1])
        && objectInfo[graph[value[0]]?.class_type]?.output?.[value[1]] === 'RGTHREE_CONTEXT') {
        descriptor = ['RGTHREE_CONTEXT'];
      }
      if (!descriptor) throw new Error(`Official workflow ${node.class_type} no longer accepts ${name}. Capture again with compatible upstream nodes.`);
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1])) {
        const linked = graph[String(value[0])];
        const outputs = objectInfo[linked?.class_type]?.output;
        if (!linked || !Number.isInteger(value[1]) || value[1] < 0 || !Array.isArray(outputs) || value[1] >= outputs.length) throw new Error(`Official workflow ${id}.${name} has an invalid output slot.`);
        continue;
      }
      const options = Array.isArray(descriptor[0]) ? descriptor[0] : descriptor[0] === 'COMBO' && Array.isArray(descriptor[1]?.options) ? descriptor[1].options : null;
      if (options && !options.includes(value)) throw new Error(`Official workflow ${node.class_type}.${name}: '${String(value)}' is unavailable. Select an installed resource or option in the upstream workflow and capture again.`);
      if (descriptor[0] === 'INT') {
        if (typeof value === 'string' && /seed/i.test(name)) {
          if (!/^\d+$/.test(value) || BigInt(value) > 0xffffffffffffffffn) throw new Error('Official native seeds must be unsigned 64-bit decimal strings.');
        } else if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`Official workflow ${id}.${name} is not a supported integer.`);
      }
      if ((descriptor[0] === 'INT' || descriptor[0] === 'FLOAT') && typeof value === 'number'
        && (!Number.isFinite(value) || (descriptor[1]?.min != null && value < descriptor[1].min) || (descriptor[1]?.max != null && value > descriptor[1].max))) throw new Error(`Official workflow ${id}.${name} is outside the installed schema range.`);
    }
    if (node.class_type === 'DaSiWa_LTX2LoraLoader') {
      const stack = JSON.parse(String(node.inputs.stack_data || '[]'));
      if (!Array.isArray(stack)) throw new Error('The native LoRA stack is invalid. Configure it in the upstream workflow.');
      const choices = readComfyInputChoices(objectInfo.LoraLoaderModelOnly?.input?.required?.lora_name);
      for (const entry of stack) if (entry.on && entry.lora !== 'None' && !choices?.includes(entry.lora)) throw new Error(`Native LoRA '${entry.lora}' is unavailable. Select an installed LoRA in the upstream workflow.`);
    }
  }
}
export async function assertOfficialStagedMedia(graph: OfficialApiGraph, inputRoot: string): Promise<void> {
  const names = new Set<string>();
  for (const node of Object.values(graph)) {
    if (node.class_type === 'LoadImage' && typeof node.inputs.image === 'string') names.add(node.inputs.image);
    if (node.class_type === 'LoadAudio' && typeof node.inputs.audio === 'string') names.add(node.inputs.audio);
    if (node.class_type === 'DaSiWa_Watermark' && typeof node.inputs.watermark_path === 'string') names.add(node.inputs.watermark_path);
    if (['MiniMaxH3Director', 'LTXDirector'].includes(node.class_type) && typeof node.inputs.timeline_data === 'string') {
      const timeline = JSON.parse(node.inputs.timeline_data);
      if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) throw new Error('The native Director timeline is invalid. Configure it in the upstream workflow.');
      if (node.class_type === 'MiniMaxH3Director') {
        const mode = node.inputs.mode;
        const items = (timeline.items || []).map((item: any, index: number) => ({ ...item, slot: item.slot ?? index })).filter((item: any) => item.enabled !== false);
        const base = ['T2VA', 'I2VA', 'L2VA', 'FL2VA', 'Image Inpaint'].includes(String(mode));
        const lastSlot = items.some((item: any) => item.type === 'image' && item.slot === 1) ? 1 : 0;
        for (const item of items) {
          const active = !base ? ['image', 'audio', 'video'].includes(item.type)
            : item.type === 'image' && (mode === 'I2VA' || mode === 'Image Inpaint' ? item.slot === 0 : mode === 'L2VA' ? item.slot === lastSlot : mode === 'FL2VA' && [0, 1].includes(item.slot));
          if (active && typeof item.value === 'string') names.add(item.value);
        }
      } else {
        // Validate what the native backend consumes. Its UI track flags are
        // persisted presentation state; do not assume they remove API inputs.
        const start = Number(node.inputs.start_frame || 0);
        const end = start + Number(node.inputs.duration_frames || Number.MAX_SAFE_INTEGER);
        const overlapping = (item: any) => Number(item.start || 0) < end && Number(item.start || 0) + Number(item.length ?? 1) > start;
        for (const item of timeline.segments || []) if (['image', 'video'].includes(item.type || 'image') && overlapping(item) && typeof item.imageFile === 'string' && item.imageFile) names.add(item.imageFile);
        const retake = timeline.retakeMode === true && timeline.retakeVideo;
        if (retake) {
          const name = retake.imageFile || retake.fileName;
          if (typeof name === 'string' && name) names.add(name);
        } else if (node.inputs.override_audio === true) {
          for (const item of timeline.motionSegments || []) if (typeof item.videoFile === 'string' && item.videoFile) names.add(item.videoFile);
        } else {
          for (const item of timeline.audioSegments || []) if (typeof item.audioFile === 'string' && item.audioFile) names.add(item.audioFile);
        }
        if (node.inputs.use_custom_motion !== false) for (const item of timeline.motionSegments || []) if (overlapping(item) && typeof item.videoFile === 'string' && item.videoFile) names.add(item.videoFile);
      }
    }
  }
  if (!names.size) return;
  const root = await realpath(inputRoot).catch(() => '');
  for (const name of names) {
    assertLtx23StagedMediaName(name);
    const path = root ? await realpath(resolve(root, name)).catch(() => '') : '';
    const rel = path && root ? relative(root, path) : '';
    if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)
      || !await stat(path).then(info => info.isFile()).catch(() => false)) throw new Error(`Native Director media '${name}' is unavailable in this ComfyUI instance. Upload it in the upstream workspace and capture again.`);
  }
}
export class OfficialVideoWorkflowService {
  constructor(private sourceRoot: string, private captureRoot: string, private inputRoot?: () => string,
    private nativeExportRoot = join(captureRoot, '..', 'OfficialNativeExports'),
    private runtimePackages?: (graph: OfficialApiGraph, id: OfficialVideoWorkflowId) => Promise<void>) {}
  async source(id: OfficialVideoWorkflowId): Promise<string> {
    const text = await readFile(join(this.sourceRoot, `${id}.json`), 'utf8');
    if (createHash('sha256').update(text).digest('hex') !== OFFICIAL_VIDEO_SOURCES[id].sha256) throw new Error('Pinned official workflow integrity failed. Restore its original source file.');
    return text;
  }
  async catalog(objectInfo: Record<string, any> | null, managed: boolean) {
    return Promise.all((Object.keys(OFFICIAL_VIDEO_SOURCES) as OfficialVideoWorkflowId[]).map(async id => {
      const definition = OFFICIAL_VIDEO_SOURCES[id];
      const issues: string[] = [];
      const nodeTypes: string[] = [];
      try {
        const document = JSON.parse(await this.source(id));
        const subgraphs = new Set((document.definitions?.subgraphs || []).map((entry: any) => entry.id));
        nodeTypes.push(...new Set<string>(uiNodes(document).map(node => node.type).filter(type => !subgraphs.has(type))));
      } catch (error) { issues.push(String((error as Error).message)); }
      if (!managed) issues.push('Official workflows require an owned ComfyUI process or an explicit verified local test session. Unbound runtimes are held.');
      if (!objectInfo) issues.push('Managed ComfyUI catalogs are unavailable. Open its workspace, then refresh readiness.');
      const runtimeTypes = nodeTypes.filter(type => !['Note', 'MarkdownNote', 'Reroute', 'Lable (DaSiWa)'].includes(type));
      if (objectInfo) for (const type of runtimeTypes) if (!objectInfo[type]) issues.push(`Missing installed node: ${type}. This workflow is held; no adapted fallback.`);
      return { id, ...definition, sourceUrl: `https://github.com/darksidewalker/dasiwa-comfyui-workflows/blob/${SOURCE_COMMIT}/${encodeURI(definition.path)}`, sourceCommit: SOURCE_COMMIT, license: 'GPL-3.0', nodeTypes, requiredRuntimeNodes: runtimeTypes, readiness: { ready: issues.length === 0, issues }, qualification: 'GPU execution and quality are unverified.' };
    }));
  }
  async importNativeExports(id: OfficialVideoWorkflowId, payload: any, objectInfo: Record<string, any> | null) {
    const workflow = parseNativeExportText(payload?.workflowText, 'Workflow JSON');
    const promptGraph = parseNativeExportText(payload?.apiText, 'API JSON');
    return this.capture(id, { sourceSha256: payload?.sourceSha256, serializer: 'comfy-native-v1', workflow, promptGraph }, objectInfo,
      { workflowText: payload.workflowText, apiText: payload.apiText });
  }
  async capture(id: OfficialVideoWorkflowId, payload: any, objectInfo: Record<string, any> | null, nativeExports?: { workflowText: string; apiText: string }) {
    if (payload?.saveLastFrame !== undefined && typeof payload.saveLastFrame !== 'boolean') throw new Error('Last-frame export must be enabled or disabled.');
    const sourceUi = JSON.parse(await this.source(id));
    if (payload?.sourceSha256 !== OFFICIAL_VIDEO_SOURCES[id].sha256 || payload?.serializer !== 'comfy-native-v1') throw new Error('Capture requires the pinned source and the native ComfyUI serializer.');
    if (officialUiTopology(payload.workflow) !== officialUiTopology(sourceUi)) throw new Error('The upstream workflow wiring changed. Reload its pinned original and configure native controls without editing the graph.');
    const graph = videoGraphNodes(payload.promptGraph) as OfficialApiGraph;
    assertOfficialApiGraph(graph, id, payload.workflow);
    assertOfficialApiRuntime(graph, objectInfo);
    if (this.runtimePackages) await this.runtimePackages(graph, id);
    if (this.inputRoot) await assertOfficialStagedMedia(graph, this.inputRoot());
    const captureId = `official-dasiwa-${id}-${randomUUID()}`;
    const metadata: OfficialWorkflowCapture = { workflowId: id, sourceCommit: SOURCE_COMMIT, sourceSha256: OFFICIAL_VIDEO_SOURCES[id].sha256, serializer: 'comfy-native-v1', graphSha256: officialGraphSha256(graph), workflowSha256: officialGraphSha256(payload.workflow), capturedAt: Date.now() };
    if (payload.saveLastFrame !== undefined) metadata.saveLastFrame = payload.saveLastFrame;
    if (nativeExports) metadata.nativeExport = { workflowTextSha256: createHash('sha256').update(nativeExports.workflowText).digest('hex'), apiTextSha256: createHash('sha256').update(nativeExports.apiText).digest('hex') };
    const document = { prompt: graph, workflow: payload.workflow, umbra_official_workflow: metadata };
    await mkdir(this.captureRoot, { recursive: true });
    if (nativeExports) {
      const rawRoot = join(this.nativeExportRoot, captureId);
      await mkdir(rawRoot, { recursive: true });
      await writeFile(join(rawRoot, 'workflow.json'), nativeExports.workflowText, { encoding: 'utf8', flag: 'wx' });
      await writeFile(join(rawRoot, 'api.json'), nativeExports.apiText, { encoding: 'utf8', flag: 'wx' });
    }
    await writeFile(join(this.captureRoot, `${captureId}.json`), JSON.stringify(document), { encoding: 'utf8', flag: 'wx' });
    return { captureId, document, ...this.describe(document) };
  }
  describe(document: any) {
    const metadata = officialCaptureMetadata(document);
    if (!metadata) throw new Error('Official workflow provenance is invalid. Capture the pinned original again.');
    const graph = videoGraphNodes(document) as OfficialApiGraph;
    const director = Object.values(graph).find(node => node.class_type === (metadata.workflowId === 'h3-26' ? 'MiniMaxH3Director' : 'LTXDirector'));
    const mode = String(director?.inputs.mode || '');
    const videoMode: 'reference_to_video' | 'image_to_video' | 'text_to_video' = mode === 'REF2VA' ? 'reference_to_video' : ['I2VA', 'L2VA', 'FL2VA'].includes(mode) ? 'image_to_video' : 'text_to_video';
    const prompt = typeof director?.inputs.prompt === 'string' ? director.inputs.prompt : typeof director?.inputs.global_prompt === 'string' ? director.inputs.global_prompt : '';
    return { workflowId: metadata.workflowId, name: OFFICIAL_VIDEO_SOURCES[metadata.workflowId].name, videoFamily: OFFICIAL_VIDEO_SOURCES[metadata.workflowId].family, videoMode, prompt: prompt.trim() || OFFICIAL_VIDEO_SOURCES[metadata.workflowId].name };
  }
  async load(selection: OfficialVideoWorkflowSelection): Promise<any> {
    const normalized = normalizeOfficialVideoWorkflowSelection(selection);
    if (!normalized) throw new Error('Official workflow capture selection is invalid.');
    let document: any;
    try { document = JSON.parse(await readFile(join(this.captureRoot, `${normalized.captureId}.json`), 'utf8')); }
    catch { throw new Error('Saved official workflow capture is unavailable. Its queued work is retained; open the pinned original and capture it again.'); }
    const metadata = officialCaptureMetadata(document);
    if (!metadata || metadata.workflowId !== normalized.workflowId) throw new Error('The selected official capture belongs to a different workflow.');
    if (metadata.nativeExport) {
      for (const [name, expected] of [['workflow', metadata.nativeExport.workflowTextSha256], ['api', metadata.nativeExport.apiTextSha256]]) {
        const raw = await readFile(join(this.nativeExportRoot, normalized.captureId, `${name}.json`), 'utf8');
        if (createHash('sha256').update(raw).digest('hex') !== expected) throw new Error('The retained native export changed. Import both original exports again.');
      }
    }
    if (officialGraphSha256(document.prompt) !== metadata.graphSha256) throw new Error('The saved native API graph changed. Capture the upstream workflow again.');
    if (officialGraphSha256(document.workflow) !== metadata.workflowSha256) throw new Error('The saved native UI snapshot changed. Capture the upstream workflow again.');
    const sourceUi = JSON.parse(await this.source(normalized.workflowId));
    if (officialUiTopology(document.workflow) !== officialUiTopology(sourceUi)) throw new Error('The saved upstream workflow wiring changed. Capture its original again.');
    assertOfficialApiGraph(document.prompt, normalized.workflowId, document.workflow);
    return document;
  }
  async compile(document: any, selection: OfficialVideoWorkflowSelection, objectInfo: Record<string, any> | null) {
    const stored = await this.load(selection);
    if (officialGraphSha256(stored.prompt) !== officialGraphSha256(document.prompt)) throw new Error('The queued official capture changed. Resume only after reviewing the capture.');
    const graph = applyOfficialVideoBindings(stored.prompt, selection.bindings);
    assertOfficialApiRuntime(graph, objectInfo);
    if (this.runtimePackages) await this.runtimePackages(graph, stored.umbra_official_workflow.workflowId);
    if (this.inputRoot) await assertOfficialStagedMedia(graph, this.inputRoot());
    return { promptGraph: graph, workflowPayload: structuredClone(stored.workflow), officialProvenance: { ...stored.umbra_official_workflow, captureId: selection.captureId, bindings: structuredClone(selection.bindings), submittedGraphSha256: officialGraphSha256(graph) } };
  }
}
