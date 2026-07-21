import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type PromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

type PromptGraph = Record<string, PromptNode>;

const root = process.cwd();
const workflowDirectory = join(root, 'defaults', 'PowerPrompter', 'API Workflows');
const targetDirectories = [
  workflowDirectory,
  join(root, 'User', 'PowerPrompter', 'API Workflows'),
  join(root, 'Umbra-Nodes', 'example_workflows'),
  join(root, 'Umbra-Nodes', 'examples'),
  join(root, 'Tools', 'ComfyUI', 'custom_nodes', 'Umbra-Nodes', 'example_workflows'),
  join(root, 'Tools', 'ComfyUI', 'custom_nodes', 'Umbra-Nodes', 'examples'),
];

const sources = [
  {
    source: '[Umbra UI] WAN 2.2 Text to Video.json',
    output: '[Umbra UI] WAN 2.2 Video to Video.json',
    family: 'wan22' as const,
    width: 832,
    height: 480,
    frames: 81,
  },
  {
    source: '[Umbra UI] LTX-2.3 Text to Video.json',
    output: '[Umbra UI] LTX-2.3 Video to Video.json',
    family: 'ltx23' as const,
    width: 640,
    height: 360,
    frames: 121,
  },
];

function nextNodeIds(graph: PromptGraph, count: number): string[] {
  let next = Object.keys(graph).reduce((maximum, id) => Math.max(maximum, Number(id) || 0), 0) + 1;
  return Array.from({ length: count }, () => String(next++));
}

function findRole(graph: PromptGraph, role: string): [string, PromptNode] {
  const entry = Object.entries(graph).find(([, node]) => String(node._meta?.umbra_role || '').trim() === role);
  if (!entry) throw new Error(`The source video workflow is missing the ${role} role.`);
  return entry;
}

function updateDescriptor(graph: PromptGraph) {
  for (const node of Object.values(graph)) {
    if (!node._meta) continue;
    if (node._meta.umbra_video_mode) node._meta.umbra_video_mode = 'video_to_video';
    const descriptor = node._meta.umbra_ui_pipeline;
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) continue;
    node._meta.umbra_ui_pipeline = {
      ...(descriptor as Record<string, unknown>),
      feature: 'vid2vid',
      defaults: {
        ...(((descriptor as Record<string, unknown>).defaults as Record<string, unknown> | undefined) || {}),
        denoise: 0.35,
      },
    };
  }
}

function addSourceVideoChain(
  graph: PromptGraph,
  options: { width: number; height: number; frames: number; vae: [string, number]; ltx: boolean },
) {
  const [sourceId, componentsId, framesId, scaleId, encodeId] = nextNodeIds(graph, 5);
  graph[sourceId] = {
    class_type: 'LoadVideo',
    inputs: { file: 'umbra-vid2vid-source.mp4' },
    _meta: { title: 'VID2VID Source Video', umbra_role: 'source_video' },
  };
  graph[componentsId] = {
    class_type: 'GetVideoComponents',
    inputs: { video: [sourceId, 0] },
    _meta: { title: 'Extract Source Video', umbra_role: 'source_video_components' },
  };
  graph[framesId] = {
    class_type: 'ImageFromBatch',
    inputs: { image: [componentsId, 0], batch_index: 0, length: options.frames },
    _meta: { title: 'Trim Source Frames', umbra_role: 'source_video_frames' },
  };
  graph[scaleId] = {
    class_type: 'ImageScale',
    inputs: {
      image: [framesId, 0],
      upscale_method: 'lanczos',
      width: options.width,
      height: options.height,
      crop: 'center',
    },
    _meta: { title: 'VID2VID Working Resolution', umbra_role: 'source_video_scale' },
  };
  graph[encodeId] = {
    class_type: 'VAEEncode',
    inputs: { pixels: [scaleId, 0], vae: options.vae },
    _meta: options.ltx
      ? { title: 'Encode LTX Source Video', umbra_role: 'ltx_base_video_latent', umbra_roles: ['source_video_encode'] }
      : { title: 'Encode Wan Source Video', umbra_role: 'source_video_encode' },
  };
  return { sourceId, componentsId, encodeId };
}

async function buildWorkflow(source: (typeof sources)[number]): Promise<PromptGraph> {
  const graph = JSON.parse(await readFile(join(workflowDirectory, source.source), 'utf8')) as PromptGraph;
  updateDescriptor(graph);

  const [, create] = findRole(graph, 'video_create');
  const [, output] = findRole(graph, 'video_output');
  if (source.family === 'wan22') {
    const [vaeId] = findRole(graph, 'wan_vae');
    const [, highSampler] = findRole(graph, 'wan_high_sampler');
    const [, lowSampler] = findRole(graph, 'wan_low_sampler');
    const chain = addSourceVideoChain(graph, {
      width: source.width,
      height: source.height,
      frames: source.frames,
      vae: [vaeId, 0],
      ltx: false,
    });
    highSampler.inputs.latent_image = [chain.encodeId, 0];
    lowSampler.inputs.latent_image = [chain.encodeId, 0];
    lowSampler.inputs.add_noise = 'enable';
    lowSampler.inputs.start_at_step = 2;
    create.inputs.audio = [chain.componentsId, 1];
    output.inputs.filename_prefix = 'video/Umbra_Wan_VID2VID';
  } else {
    const [checkpointId] = findRole(graph, 'ltx_checkpoint');
    const [, originalLatent] = findRole(graph, 'ltx_base_video_latent');
    originalLatent._meta = { ...(originalLatent._meta || {}), umbra_role: 'ltx_empty_video_latent' };
    const chain = addSourceVideoChain(graph, {
      width: source.width,
      height: source.height,
      frames: source.frames,
      vae: [checkpointId, 2],
      ltx: true,
    });
    const [, baseConcat] = findRole(graph, 'ltx_base_concat');
    baseConcat.inputs.video_latent = [chain.encodeId, 0];
    create.inputs.audio = [chain.componentsId, 1];
    output.inputs.filename_prefix = 'video/Umbra_LTX23_VID2VID';
  }
  return graph;
}

for (const targetDirectory of targetDirectories) await mkdir(targetDirectory, { recursive: true });
for (const source of sources) {
  const graph = await buildWorkflow(source);
  for (const targetDirectory of targetDirectories) {
    await writeFile(join(targetDirectory, source.output), `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  }
}

console.log(`Generated ${sources.length} locked VID2VID workflows in ${targetDirectories.length} locations.`);
