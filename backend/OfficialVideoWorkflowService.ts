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
function linkShape(link: any): unknown[] {
  return Array.isArray(link) ? link.slice(1, 5).map(String)
    : [link.origin_id, link.origin_slot, link.target_id, link.target_slot].map(String);
}
export function officialUiTopology(document: any): string {
  if (!Array.isArray(document?.nodes) || !Array.isArray(document?.links)) throw new Error('The native serializer did not return an editable ComfyUI workflow.');
  const graph = (value: any): unknown => ({
    nodes: value.nodes.map((node: any) => ({ id: String(node.id), type: node.type,
      inputs: (node.inputs || []).filter((input: any) => input.link != null).map((input: any) => [input.name, String(input.link)]).sort(),
    })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    links: (value.links || []).map(linkShape).sort((a: unknown[], b: unknown[]) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    subgraphs: (value.definitions?.subgraphs || []).map((entry: any) => ({ id: entry.id, graph: graph(entry) })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
  });
  return JSON.stringify(graph(document));
}
export interface OfficialWorkflowCapture {
  workflowId: OfficialVideoWorkflowId;
  sourceCommit: string;
  sourceSha256: string;
  serializer: 'comfy-native-v1';
  graphSha256: string;
  workflowSha256: string;
  capturedAt: number;
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
  const nodes = Object.entries(graph);
  if (!nodes.length || nodes.length > 1000) throw new Error('The native serializer returned no valid API graph.');
  for (const [id, node] of nodes) {
    if (['__proto__', 'constructor', 'prototype'].includes(id) || !node || !allowedTypes.has(node.class_type)
      || !node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs)) throw new Error(`Official graph contains an unexpected node (${id}). Reload the pinned workflow and capture it again.`);
    for (const [name, value] of Object.entries(node.inputs)) {
      if (/seed/i.test(name) && typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Native seed precision was lost. Use DaSiWa Seed Control with lossless decimal seed state and capture again.');
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]) && !graph[value[0]]) throw new Error(`Official graph input ${id}.${name} has a missing node link.`);
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
      const descriptor = inputs[name];
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
  constructor(private sourceRoot: string, private captureRoot: string, private inputRoot?: () => string) {}
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
      if (!managed) issues.push('Official workflows require this Umbra instance’s managed ComfyUI. External runtimes are not qualified.');
      if (!objectInfo) issues.push('Managed ComfyUI catalogs are unavailable. Open its workspace, then refresh readiness.');
      const runtimeTypes = nodeTypes.filter(type => !['Note', 'MarkdownNote', 'Reroute', 'Lable (DaSiWa)'].includes(type));
      if (objectInfo) for (const type of runtimeTypes) if (!objectInfo[type]) issues.push(`Missing installed node: ${type}. This workflow is held; no adapted fallback.`);
      return { id, ...definition, sourceUrl: `https://github.com/darksidewalker/dasiwa-comfyui-workflows/blob/${SOURCE_COMMIT}/${encodeURI(definition.path)}`, sourceCommit: SOURCE_COMMIT, license: 'GPL-3.0', nodeTypes, requiredRuntimeNodes: runtimeTypes, readiness: { ready: issues.length === 0, issues }, qualification: 'GPU execution and quality are unverified.' };
    }));
  }
  async capture(id: OfficialVideoWorkflowId, payload: any, objectInfo: Record<string, any> | null) {
    const sourceUi = JSON.parse(await this.source(id));
    if (payload?.sourceSha256 !== OFFICIAL_VIDEO_SOURCES[id].sha256 || payload?.serializer !== 'comfy-native-v1') throw new Error('Capture requires the pinned source and the native ComfyUI serializer.');
    if (officialUiTopology(payload.workflow) !== officialUiTopology(sourceUi)) throw new Error('The upstream workflow wiring changed. Reload its pinned original and configure native controls without editing the graph.');
    const graph = videoGraphNodes(payload.promptGraph) as OfficialApiGraph;
    assertOfficialApiGraph(graph, id, sourceUi);
    assertOfficialApiRuntime(graph, objectInfo);
    if (this.inputRoot) await assertOfficialStagedMedia(graph, this.inputRoot());
    const captureId = `official-dasiwa-${id}-${randomUUID()}`;
    const metadata: OfficialWorkflowCapture = { workflowId: id, sourceCommit: SOURCE_COMMIT, sourceSha256: OFFICIAL_VIDEO_SOURCES[id].sha256, serializer: 'comfy-native-v1', graphSha256: officialGraphSha256(graph), workflowSha256: officialGraphSha256(payload.workflow), capturedAt: Date.now() };
    const document = { prompt: graph, workflow: payload.workflow, umbra_official_workflow: metadata };
    await mkdir(this.captureRoot, { recursive: true });
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
    if (officialGraphSha256(document.prompt) !== metadata.graphSha256) throw new Error('The saved native API graph changed. Capture the upstream workflow again.');
    if (officialGraphSha256(document.workflow) !== metadata.workflowSha256) throw new Error('The saved native UI snapshot changed. Capture the upstream workflow again.');
    const sourceUi = JSON.parse(await this.source(normalized.workflowId));
    if (officialUiTopology(document.workflow) !== officialUiTopology(sourceUi)) throw new Error('The saved upstream workflow wiring changed. Capture its original again.');
    assertOfficialApiGraph(document.prompt, normalized.workflowId, sourceUi);
    return document;
  }
  async compile(document: any, selection: OfficialVideoWorkflowSelection, objectInfo: Record<string, any> | null) {
    const stored = await this.load(selection);
    if (officialGraphSha256(stored.prompt) !== officialGraphSha256(document.prompt)) throw new Error('The queued official capture changed. Resume only after reviewing the capture.');
    const graph = applyOfficialVideoBindings(stored.prompt, selection.bindings);
    assertOfficialApiRuntime(graph, objectInfo);
    if (this.inputRoot) await assertOfficialStagedMedia(graph, this.inputRoot());
    return { promptGraph: graph, workflowPayload: structuredClone(stored.workflow), officialProvenance: { ...stored.umbra_official_workflow, captureId: selection.captureId, bindings: structuredClone(selection.bindings), submittedGraphSha256: officialGraphSha256(graph) } };
  }
}
