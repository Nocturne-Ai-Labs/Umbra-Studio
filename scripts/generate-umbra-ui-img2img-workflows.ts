import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

type PromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

type PromptGraph = Record<string, PromptNode>;
type PipelineDescriptor = Record<string, unknown>;

const root = process.cwd();
const bundledWorkflowDirectory = join(root, 'defaults', 'PowerPrompter', 'API Workflows');
const workflowDirectories = [
  bundledWorkflowDirectory,
  join(root, 'User', 'PowerPrompter', 'API Workflows'),
];
const supportedSamplerClasses = new Set([
  'UmbraKSamplerHiResFix',
  'UmbraKSampler',
  'UmbraKSamplerNormal',
  'KSampler',
  'KSamplerAdvanced',
  'SamplerCustom',
  'SamplerCustomAdvanced',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isLink(value: unknown): value is [string | number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && (typeof value[0] === 'string' || typeof value[0] === 'number')
    && typeof value[1] === 'number';
}

function featureOf(descriptor: PipelineDescriptor): string {
  return String(descriptor.feature || descriptor.mode || '').trim().toLowerCase();
}

function convertedDescriptor(descriptor: PipelineDescriptor): PipelineDescriptor {
  const defaults = isRecord(descriptor.defaults) ? structuredClone(descriptor.defaults) : {};
  defaults.denoise = 0.3;
  return {
    ...structuredClone(descriptor),
    feature: 'img2img',
    priority: Number.isFinite(Number(descriptor.priority)) ? Number(descriptor.priority) : 100,
    defaults,
  };
}

function convertPipelineDescriptors(graph: PromptGraph): PipelineDescriptor[] {
  const converted: PipelineDescriptor[] = [];
  for (const node of Object.values(graph)) {
    if (!isRecord(node._meta)) continue;
    const meta = node._meta;
    const descriptors = [
      ...(Array.isArray(meta.umbra_ui_pipelines) ? meta.umbra_ui_pipelines : []),
      ...(isRecord(meta.umbra_ui_pipeline) ? [meta.umbra_ui_pipeline] : []),
    ].filter(isRecord);
    const nextDescriptors = descriptors
      .filter((descriptor) => featureOf(descriptor) === 'txt2img')
      .map(convertedDescriptor);
    converted.push(...nextDescriptors);
    delete meta.umbra_ui_pipeline;
    if (nextDescriptors.length > 0) meta.umbra_ui_pipelines = nextDescriptors;
    else delete meta.umbra_ui_pipelines;
  }
  return converted;
}

function nextNodeIds(graph: PromptGraph, count: number): string[] {
  let next = Object.keys(graph).reduce((maximum, id) => Math.max(maximum, Number(id) || 0), 0) + 1;
  return Array.from({ length: count }, () => String(next++));
}

function readDefault(descriptor: PipelineDescriptor, camel: string, snake: string, fallback: number): number {
  const defaults = isRecord(descriptor.defaults) ? descriptor.defaults : {};
  const value = Number(defaults[camel] ?? defaults[snake]);
  return Number.isFinite(value) ? Math.max(64, Math.round(value / 8) * 8) : fallback;
}

function outputFileName(sourceFileName: string): string {
  const stem = basename(sourceFileName, '.json')
    .replace(/^\[Umbra UI\]\s*/i, '')
    .replace(/\s+Image Pipeline$/i, '')
    .replace(/\s+Pipeline$/i, '')
    .trim();
  return `[Umbra UI] ${stem} Image to Image Pipeline.json`;
}

function buildImg2ImgGraph(source: PromptGraph, sourceFileName: string): PromptGraph | null {
  const graph = structuredClone(source);
  const descriptors = convertPipelineDescriptors(graph);
  if (descriptors.length !== 1) return null;

  const entries = Object.entries(graph);
  const samplerEntries = entries.filter(([, node]) => (
    supportedSamplerClasses.has(node.class_type)
    && isLink(node.inputs?.latent_image)
  ));
  if (samplerEntries.length !== 1) return null;
  const [samplerId, sampler] = samplerEntries[0];
  const schedulerEntry = entries.find(([id, node]) => (
    node.class_type === 'BasicScheduler'
    && Object.prototype.hasOwnProperty.call(node.inputs || {}, 'denoise')
    && isLink(sampler.inputs?.sigmas)
    && String((sampler.inputs.sigmas as [string | number, number])[0]) === id
  ));
  const hasSamplerDenoise = Object.prototype.hasOwnProperty.call(sampler.inputs || {}, 'denoise');
  if (!hasSamplerDenoise && !schedulerEntry) return null;

  const decode = entries.find(([, node]) => (
    node.class_type === 'VAEDecode'
    && isLink(node.inputs?.samples)
    && String((node.inputs.samples as [string | number, number])[0]) === samplerId
    && isLink(node.inputs?.vae)
  ));
  const vaeLink = isLink(sampler.inputs?.vae)
    ? structuredClone(sampler.inputs.vae)
    : decode && isLink(decode[1].inputs.vae)
      ? structuredClone(decode[1].inputs.vae)
      : null;
  if (!vaeLink) return null;

  const [sourceId, resizeId, encodeId] = nextNodeIds(graph, 3);
  const width = readDefault(descriptors[0], 'width', 'width', 1024);
  const height = readDefault(descriptors[0], 'height', 'height', 1024);
  graph[sourceId] = {
    class_type: 'LoadImage',
    inputs: { image: 'umbra-img2img-source.png' },
    _meta: { title: 'IMG2IMG Source Image', umbra_role: 'img2img_source' },
  };
  graph[resizeId] = {
    class_type: 'ImageScale',
    inputs: {
      image: [sourceId, 0],
      upscale_method: 'lanczos',
      width,
      height,
      crop: 'disabled',
    },
    _meta: { title: 'IMG2IMG Working Resolution', umbra_role: 'img2img_resize' },
  };
  graph[encodeId] = {
    class_type: 'VAEEncode',
    inputs: { pixels: [resizeId, 0], vae: vaeLink },
    _meta: { title: 'Encode IMG2IMG Source', umbra_role: 'img2img_encode' },
  };
  sampler.inputs.latent_image = [encodeId, 0];
  sampler._meta = { ...(sampler._meta || {}), umbra_role: 'img2img_sampler' };
  if (hasSamplerDenoise && typeof sampler.inputs.denoise === 'number') sampler.inputs.denoise = 0.3;
  if (isLink(sampler.inputs.denoise)) {
    const upstream = graph[String((sampler.inputs.denoise as [string | number, number])[0])];
    if (upstream && Object.prototype.hasOwnProperty.call(upstream.inputs || {}, 'denoise')) upstream.inputs.denoise = 0.3;
  }
  if (schedulerEntry) {
    schedulerEntry[1].inputs.denoise = 0.3;
    schedulerEntry[1]._meta = { ...(schedulerEntry[1]._meta || {}), umbra_role: 'img2img_scheduler' };
  }

  for (const node of Object.values(graph)) {
    if (node.class_type !== 'UmbraLabSaveImage' && node.class_type !== 'SaveImage') continue;
    if (Object.prototype.hasOwnProperty.call(node.inputs, 'output_folder')) node.inputs.output_folder = 'Umbra UI/img2img';
    if (Object.prototype.hasOwnProperty.call(node.inputs, 'filename_prefix')) {
      node.inputs.filename_prefix = `UmbraUI_IMG2IMG_${sourceFileName.replace(/\W+/g, '_').replace(/^_+|_+$/g, '')}_%date%`;
    }
  }
  return graph;
}

const sourceFiles = (await readdir(bundledWorkflowDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /^\[Umbra UI\].+\.json$/i.test(entry.name))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

let generated = 0;
const skipped: string[] = [];
for (const sourceFileName of sourceFiles) {
  const source = JSON.parse(await readFile(join(bundledWorkflowDirectory, sourceFileName), 'utf8')) as PromptGraph;
  const hasTxt2Img = Object.values(source).some((node) => {
    const meta = isRecord(node?._meta) ? node._meta : {};
    const descriptors = [
      ...(Array.isArray(meta.umbra_ui_pipelines) ? meta.umbra_ui_pipelines : []),
      ...(isRecord(meta.umbra_ui_pipeline) ? [meta.umbra_ui_pipeline] : []),
    ].filter(isRecord);
    return descriptors.some((descriptor) => featureOf(descriptor) === 'txt2img');
  });
  if (!hasTxt2Img) continue;
  const graph = buildImg2ImgGraph(source, sourceFileName);
  if (!graph) {
    skipped.push(sourceFileName);
    continue;
  }
  const fileName = outputFileName(sourceFileName);
  for (const directory of workflowDirectories) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, fileName), `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  }
  generated += 1;
}

console.log(`Generated ${generated} locked IMG2IMG workflow(s).`);
if (skipped.length > 0) console.log(`Skipped ${skipped.length} incompatible workflow(s): ${skipped.join(', ')}`);
