import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listUmbraUiImg2ImgPipelineGraphIssues,
  listUmbraUiInpaintPipelineGraphIssues,
  listUmbraUiVid2VidPipelineGraphIssues,
} from '../backend/UmbraUiPipelineCapabilities';
import {
  normalizeUmbraUiPipelineFeature,
  normalizeUmbraUiModelFamilyKey,
  normalizeUmbraUiPipelineModelSources,
  type UmbraUiInpaintAdapter,
  type UmbraUiPipelineDefaults,
} from '../shared/umbra-ui/pipelineTypes';

const workflowDirectory = join(process.cwd(), 'defaults', 'PowerPrompter', 'API Workflows');
const files = (await readdir(workflowDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /^\[Umbra UI\].+\.json$/i.test(entry.name))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

if (files.length <= 0) {
  throw new Error(`No locked Umbra UI API workflows were found in ${workflowDirectory}.`);
}

const failures: string[] = [];
let descriptorCount = 0;
let inpaintCount = 0;
let img2imgCount = 0;
let vid2vidCount = 0;
const pipelineSlots = new Map<string, string>();

for (const fileName of files) {
  const raw = JSON.parse(await readFile(join(workflowDirectory, fileName), 'utf8')) as Record<string, unknown>;
  const graph = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : {};
  const graphNodeIds = new Set(Object.keys(graph));
  for (const [nodeId, rawNode] of Object.entries(graph)) {
    if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) continue;
    const inputs = (rawNode as Record<string, unknown>).inputs;
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) continue;
    for (const [inputName, value] of Object.entries(inputs as Record<string, unknown>)) {
      if (!Array.isArray(value) || value.length !== 2 || typeof value[1] !== 'number') continue;
      const upstreamId = typeof value[0] === 'string' || typeof value[0] === 'number' ? String(value[0]) : '';
      if (upstreamId && !graphNodeIds.has(upstreamId)) {
        failures.push(`${fileName}: node ${nodeId}.${inputName} references missing node ${upstreamId}`);
      }
    }
  }
  const rawPipelines = Object.values(graph).flatMap((rawNode) => {
    const node = rawNode && typeof rawNode === 'object' && !Array.isArray(rawNode)
      ? rawNode as Record<string, unknown>
      : {};
    const meta = node._meta && typeof node._meta === 'object' && !Array.isArray(node._meta)
      ? node._meta as Record<string, unknown>
      : {};
    return [
      ...(Array.isArray(meta.umbra_ui_pipelines) ? meta.umbra_ui_pipelines : []),
      ...(meta.umbra_ui_pipeline && typeof meta.umbra_ui_pipeline === 'object' && !Array.isArray(meta.umbra_ui_pipeline)
        ? [meta.umbra_ui_pipeline]
        : []),
    ];
  });
  if (rawPipelines.length <= 0) failures.push(`${fileName}: no Umbra UI pipeline descriptor`);

  for (const rawPipeline of rawPipelines) {
    if (!rawPipeline || typeof rawPipeline !== 'object' || Array.isArray(rawPipeline)) continue;
    descriptorCount += 1;
    const pipeline = rawPipeline as Record<string, unknown>;
    const feature = normalizeUmbraUiPipelineFeature(pipeline.feature || pipeline.mode);
    const family = String(pipeline.modelFamily || pipeline.model_family || pipeline.family || '').trim();
    const familyKey = normalizeUmbraUiModelFamilyKey(family);
    const modelSources = normalizeUmbraUiPipelineModelSources(
      pipeline.modelSources ?? pipeline.model_sources ?? pipeline.modelTypes ?? pipeline.model_types,
    );
    if (!feature) failures.push(`${fileName}: invalid pipeline feature`);
    if (!family) failures.push(`${fileName}: missing model family`);
    if (modelSources.length <= 0) failures.push(`${fileName}: missing model sources`);
    const priority = Number.isFinite(Number(pipeline.priority)) ? Math.floor(Number(pipeline.priority)) : 0;
    for (const modelSource of modelSources) {
      const slot = `${feature || 'invalid'}:${familyKey || 'invalid'}:${modelSource}:${priority}`;
      const previous = pipelineSlots.get(slot);
      if (previous) failures.push(`${fileName}: pipeline slot ${slot} is already declared by ${previous}`);
      else pipelineSlots.set(slot, fileName);
    }
    if (feature === 'img2img') {
      img2imgCount += 1;
      for (const issue of listUmbraUiImg2ImgPipelineGraphIssues(graph)) {
        failures.push(`${fileName}: ${family || 'unknown'} IMG2IMG: ${issue}`);
      }
      continue;
    }
    if (feature === 'vid2vid') {
      vid2vidCount += 1;
      for (const issue of listUmbraUiVid2VidPipelineGraphIssues(graph)) {
        failures.push(`${fileName}: ${family || 'unknown'} VID2VID: ${issue}`);
      }
      continue;
    }
    if (feature !== 'inpainting') continue;
    inpaintCount += 1;
    const adapter = String(pipeline.inpaintAdapter || pipeline.inpaint_adapter || '').trim().toLowerCase() as UmbraUiInpaintAdapter;
    if (!['classic_conditioning', 'flux_fill', 'qwen_image_controlnet', 'native_edit'].includes(adapter)) {
      failures.push(`${fileName}: missing or invalid explicit inpainting adapter`);
      continue;
    }
    const defaults = pipeline.defaults && typeof pipeline.defaults === 'object' && !Array.isArray(pipeline.defaults)
      ? pipeline.defaults as UmbraUiPipelineDefaults
      : undefined;
    for (const issue of listUmbraUiInpaintPipelineGraphIssues(graph, {
      modelSources,
      inpaintAdapter: adapter,
      defaults,
    })) {
      failures.push(`${fileName}: ${family || 'unknown'} inpainting: ${issue}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Umbra UI pipeline audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Umbra UI pipeline audit passed: ${files.length} workflows, ${descriptorCount} descriptors, ${img2imgCount} IMG2IMG providers, ${vid2vidCount} VID2VID providers, ${inpaintCount} inpaint providers.`);
}
