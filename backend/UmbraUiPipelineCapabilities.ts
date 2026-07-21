import {
  filterUmbraUiDetailerStages,
  matchUmbraUiResourceCatalog,
  normalizeUmbraUiModelFamilyKey,
  resolveUmbraUiHiresResizeMode,
  type UmbraUiPipelineCapabilities,
  type UmbraUiPipelineCapabilitySupport,
  type UmbraUiPipelineControlCapability,
  type UmbraUiPipelineDefaults,
  type UmbraUiPipelineFeature,
  type UmbraUiInpaintAdapter,
  type UmbraUiInpaintCanvasCapabilities,
  type UmbraUiInpaintControlAdapterType,
  type UmbraUiPipelineModelSource,
  type UmbraUiPipelineReadiness,
  type UmbraUiPipelineResourceReadinessItem,
  type UmbraUiPipelineResourceKind,
} from '../shared/umbra-ui/pipelineTypes';

export function resolveUmbraUiPipelineResourceReadinessStatus(
  items: UmbraUiPipelineResourceReadinessItem[],
  catalogAvailable: boolean,
): UmbraUiPipelineReadiness['runtime']['resources']['status'] {
  if (items.some((item) => item.required && item.status === 'selection_required')) return 'selection_required';
  if (items.some((item) => item.status === 'ambiguous')) return 'ambiguous';
  if (items.some((item) => item.required && item.status === 'missing')) return 'missing';
  if (!catalogAvailable || items.some((item) => item.required && item.status === 'unverified')) return 'unverified';
  return 'ready';
}

interface UmbraUiCapabilityDescriptorInput {
  modelSources: UmbraUiPipelineModelSource[];
  defaults?: UmbraUiPipelineDefaults;
  feature?: UmbraUiPipelineFeature;
}

interface UmbraUiInpaintCapabilityDescriptorInput extends UmbraUiCapabilityDescriptorInput {
  inpaintAdapter?: UmbraUiInpaintAdapter;
  modelFamily?: string;
  modelFamilyKey?: string;
}

interface PipelineNode {
  id: string;
  classType: string;
  role: string;
  roles: string[];
  title: string;
  referenceMethod: string;
  controlAdapter: string;
  controlMode: string;
  inputs: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export type UmbraUiInpaintRegionalConditioningMethod =
  | 'clip_masked_conditioning'
  | 'flux_guidance_masked_conditioning'
  | 'flux_text_encode_masked_conditioning'
  | 'qwen_image_edit_masked_conditioning';

export interface UmbraUiInpaintRegionalConditioningContract {
  method: UmbraUiInpaintRegionalConditioningMethod;
  maxLayers: number;
  positivePrompt: boolean;
  negativePrompt: boolean;
  autoNegative: boolean;
  sinkNodeId: string;
  positiveSinkInput: string;
  negativeSinkInput: string;
  clipSourceNodeId: string;
  clipSourceOutput: number;
  positiveTransformNodeId: string;
  positiveEncoderNodeId: string;
  negativeEncoderNodeId: string;
}

const SAMPLER_CONTROL_CLASSES = new Set([
  'UmbraPowerPrompter',
  'UmbraKSamplerHiResFix',
  'UmbraKSampler',
  'UmbraKSamplerNormal',
  'KSampler',
  'KSamplerAdvanced',
  'KSamplerSelect',
]);

const SCHEDULER_CONTROL_CLASSES = new Set([
  'UmbraPowerPrompter',
  'UmbraKSamplerHiResFix',
  'UmbraKSampler',
  'UmbraKSamplerNormal',
  'KSampler',
  'KSamplerAdvanced',
  'BasicScheduler',
]);

const CLASSIC_DETAILER_INCOMPATIBLE_CLASSES = new Set([
  'BasicGuider',
  'DualCFGGuider',
  'DualModelGuider',
  'Flux2Scheduler',
  'Ideogram4Scheduler',
  'KSamplerAdvanced',
  'SamplerCustom',
  'SamplerCustomAdvanced',
  'SamplerLCM',
]);

const NATIVE_DETAILER_PROVIDER_CLASSES = new Set([
  'NativeDetailerProvider',
  'UmbraNativeDetailerProvider',
  'UmbraImageDetailerProvider',
  'UmbraFlux2DetailerSamplingProvider',
  'UmbraHiDreamO1DetailerSamplingProvider',
  'UmbraIdeogram4DetailerSamplingProvider',
  'UmbraOmniGen2DetailerSamplingProvider',
]);

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function listPipelineNodes(promptGraph: Record<string, unknown>): PipelineNode[] {
  return Object.entries(promptGraph).map(([id, rawNode]) => {
    const node = toRecord(rawNode);
    const meta = toRecord(node._meta);
    const primaryRole = String(meta.umbra_role || meta.role || '').trim().toLowerCase();
    const extraRoles = Array.isArray(meta.umbra_roles)
      ? meta.umbra_roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const roles = Array.from(new Set([primaryRole, ...extraRoles].filter(Boolean)));
    return {
      id,
      classType: String(node.class_type || '').trim(),
      role: primaryRole,
      roles,
      title: String(meta.title || '').trim(),
      referenceMethod: String(meta.umbra_reference_method || '').trim().toLowerCase(),
      controlAdapter: String(meta.umbra_control_adapter || '').trim().toLowerCase(),
      controlMode: String(meta.umbra_control_mode || '').trim().toLowerCase(),
      inputs: toRecord(node.inputs),
      meta,
    };
  }).filter((node) => node.classType.length > 0);
}

function hasNodeRole(node: PipelineNode, role: string): boolean {
  return node.roles.includes(role);
}

function hasInput(node: PipelineNode, inputName: string): boolean {
  return Object.prototype.hasOwnProperty.call(node.inputs, inputName);
}

function connectedNodeId(node: PipelineNode | undefined, inputName: string): string {
  const value = node?.inputs[inputName];
  if (!Array.isArray(value) || value.length < 1) return '';
  const nodeId = value[0];
  return typeof nodeId === 'string' || typeof nodeId === 'number'
    ? String(nodeId).trim()
    : '';
}

function connectedAutogrowImageNodeId(node: PipelineNode | undefined, inputName: string): string {
  const groupedInputs = toRecord(node?.inputs.images);
  const prefixedInputName = `images.${inputName}`;
  const value = Object.prototype.hasOwnProperty.call(node?.inputs || {}, prefixedInputName)
    ? node?.inputs[prefixedInputName]
    : Object.prototype.hasOwnProperty.call(groupedInputs, inputName)
      ? groupedInputs[inputName]
      : node?.inputs[inputName];
  if (!Array.isArray(value) || value.length < 1) return '';
  const nodeId = value[0];
  return typeof nodeId === 'string' || typeof nodeId === 'number'
    ? String(nodeId).trim()
    : '';
}

function uniqueNodeClassTypes(nodes: PipelineNode[]): string[] {
  return Array.from(new Set(nodes.map((node) => node.classType).filter(Boolean))).sort();
}

function boundedRegionalLayerLimit(value: unknown): number {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) ? Math.max(1, Math.min(16, numeric)) : 16;
}

export function resolveUmbraUiInpaintRegionalConditioningContract(
  promptGraph: Record<string, unknown>,
): UmbraUiInpaintRegionalConditioningContract | null {
  const nodes = listPipelineNodes(promptGraph);
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const methods = new Set<UmbraUiInpaintRegionalConditioningMethod>([
    'clip_masked_conditioning',
    'flux_guidance_masked_conditioning',
    'flux_text_encode_masked_conditioning',
    'qwen_image_edit_masked_conditioning',
  ]);
  const sinks = nodes.filter((node) => methods.has(
    String(node.meta.umbra_regional_method || '').trim().toLowerCase() as UmbraUiInpaintRegionalConditioningMethod,
  ));
  if (sinks.length !== 1) return null;
  const sink = sinks[0];
  const method = String(sink.meta.umbra_regional_method || '').trim().toLowerCase() as UmbraUiInpaintRegionalConditioningMethod;
  const positiveSinkInput = String(sink.meta.umbra_regional_positive_input || '').trim();
  const negativeSinkInput = String(sink.meta.umbra_regional_negative_input || '').trim();
  if (!positiveSinkInput || !connectedNodeId(sink, positiveSinkInput)) return null;
  if (negativeSinkInput && !connectedNodeId(sink, negativeSinkInput)) return null;

  const base = {
    method,
    maxLayers: boundedRegionalLayerLimit(sink.meta.umbra_regional_max_layers),
    positivePrompt: true,
    negativePrompt: !!negativeSinkInput,
    autoNegative: !!negativeSinkInput,
    sinkNodeId: sink.id,
    positiveSinkInput,
    negativeSinkInput,
    clipSourceNodeId: '',
    clipSourceOutput: 0,
    positiveTransformNodeId: '',
    positiveEncoderNodeId: '',
    negativeEncoderNodeId: '',
  } satisfies UmbraUiInpaintRegionalConditioningContract;

  if (method === 'qwen_image_edit_masked_conditioning') {
    const source = nodes.find((node) => hasNodeRole(node, 'inpaint_source'));
    const positiveEncoder = nodes.find((node) => hasNodeRole(node, 'inpaint_regional_positive_encoder'));
    const negativeEncoder = nodes.find((node) => hasNodeRole(node, 'inpaint_regional_negative_encoder'));
    const encoderReady = (node: PipelineNode | undefined): node is PipelineNode => !!node
      && node.classType === 'TextEncodeQwenImageEditPlus'
      && !!connectedNodeId(node, 'clip')
      && !!connectedNodeId(node, 'vae')
      && connectedNodeId(node, 'image1') === source?.id
      && hasInput(node, 'prompt');
    if (!source || !encoderReady(positiveEncoder) || !encoderReady(negativeEncoder)) return null;
    if (connectedNodeId(sink, positiveSinkInput) !== positiveEncoder?.id
      || connectedNodeId(sink, negativeSinkInput) !== negativeEncoder?.id) return null;
    return {
      ...base,
      positiveEncoderNodeId: positiveEncoder.id,
      negativeEncoderNodeId: negativeEncoder.id,
    };
  }

  if (method === 'flux_text_encode_masked_conditioning') {
    const encoders = nodes.filter((node) => hasNodeRole(node, 'inpaint_regional_positive_encoder'));
    if (encoders.length !== 1) return null;
    const encoder = encoders[0];
    if (encoder.classType !== 'CLIPTextEncodeFlux'
      || !connectedNodeId(encoder, 'clip')
      || !hasInput(encoder, 'clip_l')
      || !hasInput(encoder, 't5xxl')
      || !hasInput(encoder, 'guidance')
      || connectedNodeId(sink, positiveSinkInput) !== encoder.id) return null;
    return {
      ...base,
      negativePrompt: false,
      autoNegative: false,
      positiveEncoderNodeId: encoder.id,
    };
  }

  const clipSources = nodes.filter((node) => hasNodeRole(node, 'inpaint_regional_clip_source'));
  if (clipSources.length !== 1) return null;
  const clipSource = clipSources[0];
  const clipSourceOutput = Math.max(0, Math.floor(Number(clipSource.meta.umbra_output_index) || 0));
  if (method === 'flux_guidance_masked_conditioning') {
    const transforms = nodes.filter((node) => hasNodeRole(node, 'inpaint_regional_positive_transform'));
    if (transforms.length !== 1) return null;
    const transform = transforms[0];
    if (transform.classType !== 'FluxGuidance'
      || !connectedNodeId(transform, 'conditioning')
      || !Object.prototype.hasOwnProperty.call(transform.inputs, 'guidance')
      || connectedNodeId(sink, positiveSinkInput) !== transform.id) return null;
    return {
      ...base,
      negativePrompt: false,
      autoNegative: false,
      clipSourceNodeId: clipSource.id,
      clipSourceOutput,
      positiveTransformNodeId: transform.id,
    };
  }
  if (!nodeMap.has(connectedNodeId(sink, positiveSinkInput))) return null;
  return {
    ...base,
    clipSourceNodeId: clipSource.id,
    clipSourceOutput,
  };
}

export function resolveUmbraUiInpaintRegionalConditioningContractForAdapter(
  promptGraph: Record<string, unknown>,
  adapter: UmbraUiInpaintAdapter,
): UmbraUiInpaintRegionalConditioningContract | null {
  const contract = resolveUmbraUiInpaintRegionalConditioningContract(promptGraph);
  if (!contract) return null;
  if (adapter === 'classic_conditioning') {
    return contract.method === 'clip_masked_conditioning' ? contract : null;
  }
  if (adapter === 'flux_fill') {
    return contract.method === 'flux_text_encode_masked_conditioning' ? contract : null;
  }
  if (adapter === 'qwen_image_controlnet') {
    return contract.method === 'clip_masked_conditioning' ? contract : null;
  }
  return contract.method === 'clip_masked_conditioning'
    || contract.method === 'flux_guidance_masked_conditioning'
    || contract.method === 'qwen_image_edit_masked_conditioning'
    ? contract
    : null;
}

function connectedNodeExists(
  node: PipelineNode | undefined,
  inputName: string,
  nodeIds: ReadonlySet<string>,
): boolean {
  const connectedId = connectedNodeId(node, inputName);
  return !!connectedId && nodeIds.has(connectedId);
}

function collectGraphDependencyIds(
  rootId: string,
  nodeMap: ReadonlyMap<string, PipelineNode>,
): Set<string> {
  const dependencies = new Set<string>();
  const visit = (nodeId: string) => {
    if (dependencies.has(nodeId)) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;
    dependencies.add(nodeId);
    for (const value of Object.values(node.inputs)) {
      if (!Array.isArray(value) || value.length < 1) continue;
      const upstreamId = typeof value[0] === 'string' || typeof value[0] === 'number'
        ? String(value[0]).trim()
        : '';
      if (upstreamId) visit(upstreamId);
    }
  };
  visit(rootId);
  return dependencies;
}

export function listUmbraUiInpaintPipelineGraphIssues(
  promptGraph: Record<string, unknown>,
  descriptor: UmbraUiInpaintCapabilityDescriptorInput,
): string[] {
  const adapter = descriptor.inpaintAdapter;
  if (!adapter) return ['inpainting adapter declaration'];
  const nodes = listPipelineNodes(promptGraph);
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const nodeIds = new Set(nodeMap.keys());
  const issues: string[] = [];
  const declaresRegionalConditioning = nodes.some((node) => (
    String(node.meta.umbra_regional_method || '').trim().length > 0
    || node.roles.some((role) => role.startsWith('inpaint_regional_'))
  ));
  if (declaresRegionalConditioning
    && !resolveUmbraUiInpaintRegionalConditioningContractForAdapter(promptGraph, adapter)) {
    issues.push('exact regional-conditioning contract');
  }

  if (adapter !== 'native_edit') {
    const unified = nodes.find((node) => node.classType === 'UmbraPowerPrompter');
    if (!unified) {
      const samplerClasses = new Set([
        'UmbraKSamplerHiResFix',
        'UmbraKSampler',
        'UmbraKSamplerNormal',
        'KSampler',
        'KSamplerAdvanced',
      ]);
      const sampler = nodes.find((node) => samplerClasses.has(node.classType));
      if (!sampler) {
        issues.push('inpaint sampler binding');
      } else {
        if (!connectedNodeExists(sampler, 'model', nodeIds)) issues.push('inpaint model binding');
        if (!connectedNodeExists(sampler, 'positive', nodeIds)) issues.push('inpaint positive-conditioning binding');
        if (!connectedNodeExists(sampler, 'negative', nodeIds)) issues.push('inpaint negative-conditioning binding');
        const directVae = connectedNodeExists(sampler, 'vae', nodeIds);
        const decodeVae = nodes.some((node) => (
          node.classType === 'VAEDecode'
          && connectedNodeId(node, 'samples') === sampler.id
          && connectedNodeExists(node, 'vae', nodeIds)
        ));
        if (!directVae && !decodeVae) issues.push('inpaint VAE binding');
      }
    }
    if (adapter === 'qwen_image_controlnet' && !String(descriptor.defaults?.adapterModelName || '').trim()) {
      issues.push('Qwen inpainting ControlNet default');
    }
    return Array.from(new Set(issues));
  }

  const sourceNodes = nodes.filter((node) => node.role === 'inpaint_source');
  const maskNodes = nodes.filter((node) => node.role === 'inpaint_mask');
  if (sourceNodes.length !== 1) issues.push('exactly one inpaint_source role');
  if (maskNodes.length !== 1) issues.push('exactly one inpaint_mask role');
  const source = sourceNodes[0];
  const mask = maskNodes[0];
  const imageInputNames = new Set(['image', 'source_image', 'mask_image', 'filename']);
  if (source && !Object.keys(source.inputs).some((name) => imageInputNames.has(name))) {
    issues.push('inpaint_source image input');
  }
  if (mask && !Object.keys(mask.inputs).some((name) => imageInputNames.has(name))) {
    issues.push('inpaint_mask image input');
  }

  const outputClasses = new Set(['UmbraLabSaveImage', 'SaveImage', 'PreviewImage']);
  const outputs = nodes.filter((node) => node.role === 'inpaint_output' || outputClasses.has(node.classType));
  if (outputs.length <= 0) {
    issues.push('inpaint output');
  } else if (source && mask) {
    const reachesOutput = outputs.some((output) => {
      const dependencies = collectGraphDependencyIds(output.id, nodeMap);
      return dependencies.has(source.id) && dependencies.has(mask.id);
    });
    if (!reachesOutput) issues.push('inpaint source and mask output path');
  }

  const canvasCapabilities = deriveUmbraUiInpaintCanvasCapabilities(promptGraph, descriptor);
  const hasReferenceRoles = nodes.some((node) => node.role.startsWith('inpaint_reference_'));
  if (hasReferenceRoles && canvasCapabilities.referenceLayers.support === 'unsupported') {
    issues.push('exact native reference-provider contract');
  }
  const hasControlRoles = nodes.some((node) => node.role.startsWith('inpaint_control_'));
  if (hasControlRoles && canvasCapabilities.controlLayers.support === 'unsupported') {
    issues.push('exact native control-provider contract');
  }
  return Array.from(new Set(issues));
}

export function listUmbraUiImg2ImgPipelineGraphIssues(
  promptGraph: Record<string, unknown>,
): string[] {
  const nodes = listPipelineNodes(promptGraph);
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const issues: string[] = [];
  const sources = nodes.filter((node) => hasNodeRole(node, 'img2img_source'));
  const resizeNodes = nodes.filter((node) => hasNodeRole(node, 'img2img_resize'));
  const encodeNodes = nodes.filter((node) => hasNodeRole(node, 'img2img_encode'));
  const samplers = nodes.filter((node) => hasNodeRole(node, 'img2img_sampler'));

  if (sources.length !== 1) issues.push('exactly one img2img_source role');
  if (resizeNodes.length !== 1) issues.push('exactly one img2img_resize role');
  if (encodeNodes.length !== 1) issues.push('exactly one img2img_encode role');
  if (samplers.length !== 1) issues.push('exactly one img2img_sampler role');

  const source = sources[0];
  const resize = resizeNodes[0];
  const encode = encodeNodes[0];
  const sampler = samplers[0];
  if (source && source.classType !== 'LoadImage') issues.push('img2img source LoadImage node');
  if (resize) {
    if (resize.classType !== 'ImageScale') issues.push('img2img ImageScale node');
    if (source && connectedNodeId(resize, 'image') !== source.id) issues.push('img2img source-to-resize binding');
    if (!hasInput(resize, 'width') || !hasInput(resize, 'height')) issues.push('img2img resize dimensions');
  }
  if (encode) {
    if (encode.classType !== 'VAEEncode') issues.push('img2img VAEEncode node');
    if (resize && connectedNodeId(encode, 'pixels') !== resize.id) issues.push('img2img resize-to-encode binding');
    if (!connectedNodeId(encode, 'vae')) issues.push('img2img VAE binding');
  }
  if (sampler) {
    if (encode && connectedNodeId(sampler, 'latent_image') !== encode.id) issues.push('img2img latent-to-sampler binding');
    const samplerHasDenoise = hasInput(sampler, 'denoise');
    const scheduler = nodes.find((node) => hasNodeRole(node, 'img2img_scheduler'));
    const schedulerHasDenoise = !!scheduler
      && hasInput(scheduler, 'denoise')
      && connectedNodeId(sampler, 'sigmas') === scheduler.id;
    if (!samplerHasDenoise && !schedulerHasDenoise) issues.push('adjustable img2img denoise binding');
  }

  const outputs = nodes.filter((node) => (
    node.classType === 'UmbraLabSaveImage'
    || node.classType === 'SaveImage'
    || node.classType === 'PreviewImage'
  ));
  if (outputs.length <= 0) issues.push('img2img output');
  else if (source && !outputs.some((output) => collectGraphDependencyIds(output.id, nodeMap).has(source.id))) {
    issues.push('img2img source output path');
  }
  return Array.from(new Set(issues));
}

export function listUmbraUiVid2VidPipelineGraphIssues(
  promptGraph: Record<string, unknown>,
): string[] {
  const nodes = listPipelineNodes(promptGraph);
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const issues: string[] = [];
  const sources = nodes.filter((node) => hasNodeRole(node, 'source_video'));
  const components = nodes.filter((node) => hasNodeRole(node, 'source_video_components'));
  const frameSlices = nodes.filter((node) => hasNodeRole(node, 'source_video_frames'));
  const scales = nodes.filter((node) => hasNodeRole(node, 'source_video_scale'));
  const encodes = nodes.filter((node) => hasNodeRole(node, 'source_video_encode'));

  if (sources.length !== 1) issues.push('exactly one source_video role');
  if (components.length !== 1) issues.push('exactly one source_video_components role');
  if (frameSlices.length !== 1) issues.push('exactly one source_video_frames role');
  if (scales.length !== 1) issues.push('exactly one source_video_scale role');
  if (encodes.length !== 1) issues.push('exactly one source_video_encode role');

  const source = sources[0];
  const component = components[0];
  const frameSlice = frameSlices[0];
  const scale = scales[0];
  const encode = encodes[0];
  if (source) {
    if (source.classType !== 'LoadVideo') issues.push('VID2VID source LoadVideo node');
    if (!hasInput(source, 'file')) issues.push('VID2VID source file input');
  }
  if (component) {
    if (component.classType !== 'GetVideoComponents') issues.push('VID2VID GetVideoComponents node');
    if (source && connectedNodeId(component, 'video') !== source.id) issues.push('VID2VID source-to-components binding');
  }
  if (frameSlice) {
    if (frameSlice.classType !== 'ImageFromBatch') issues.push('VID2VID ImageFromBatch node');
    if (component && connectedNodeId(frameSlice, 'image') !== component.id) issues.push('VID2VID components-to-frames binding');
    if (!hasInput(frameSlice, 'length')) issues.push('VID2VID frame limit');
  }
  if (scale) {
    if (scale.classType !== 'ImageScale') issues.push('VID2VID ImageScale node');
    if (frameSlice && connectedNodeId(scale, 'image') !== frameSlice.id) issues.push('VID2VID frames-to-scale binding');
    if (!hasInput(scale, 'width') || !hasInput(scale, 'height')) issues.push('VID2VID scale dimensions');
  }
  if (encode) {
    if (encode.classType !== 'VAEEncode') issues.push('VID2VID VAEEncode node');
    if (scale && connectedNodeId(encode, 'pixels') !== scale.id) issues.push('VID2VID scale-to-encode binding');
    if (!connectedNodeId(encode, 'vae')) issues.push('VID2VID VAE binding');
  }

  const hasWanDenoise = nodes.some((node) => (
    hasNodeRole(node, 'wan_high_sampler')
    && node.classType === 'KSamplerAdvanced'
    && hasInput(node, 'start_at_step')
    && hasInput(node, 'end_at_step')
  ));
  const hasLtxDenoise = nodes.some((node) => (
    (hasNodeRole(node, 'ltx_base_sigmas') || hasNodeRole(node, 'ltx_refine_sigmas'))
    && node.classType === 'ManualSigmas'
    && hasInput(node, 'sigmas')
  ));
  if (!hasWanDenoise && !hasLtxDenoise) issues.push('adjustable VID2VID denoise binding');

  const outputs = nodes.filter((node) => (
    hasNodeRole(node, 'video_output')
    || node.classType === 'SaveVideo'
    || node.classType === 'VHS_VideoCombine'
  ));
  if (outputs.length <= 0) issues.push('VID2VID output');
  else if (source && !outputs.some((output) => collectGraphDependencyIds(output.id, nodeMap).has(source.id))) {
    issues.push('VID2VID source output path');
  }
  return Array.from(new Set(issues));
}

function literalInput(nodes: PipelineNode[], inputNames: string[]): string | number | boolean | undefined {
  for (const node of nodes) {
    for (const inputName of inputNames) {
      const value = node.inputs[inputName];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    }
  }
  return undefined;
}

function clipSkipCapabilityValue(nodes: PipelineNode[], fallback: unknown): number {
  const directNode = nodes.find((node) => node.classType === 'UmbraPowerPrompter');
  const directValue = Number(directNode?.inputs.clip_skip);
  if (Number.isFinite(directValue)) return Math.max(1, Math.round(Math.abs(directValue)));

  const layerNode = nodes.find((node) => node.classType === 'CLIPSetLastLayer');
  const layerValue = Number(layerNode?.inputs.stop_at_clip_layer);
  if (Number.isFinite(layerValue)) {
    // A CLIPSetLastLayer(-1) mutation is not Umbra's semantic "normal CLIP" value.
    return Math.max(2, Math.round(Math.abs(layerValue)));
  }

  const fallbackValue = Number(fallback);
  return Number.isFinite(fallbackValue) ? Math.max(1, Math.round(Math.abs(fallbackValue))) : 1;
}

function control(
  support: UmbraUiPipelineCapabilitySupport,
  reason: string,
  nodes: PipelineNode[] = [],
  value?: string | number | boolean,
): UmbraUiPipelineControlCapability {
  return {
    support,
    reason,
    nodeClassTypes: uniqueNodeClassTypes(nodes),
    ...(value !== undefined ? { value } : {}),
  };
}

function unsupported(reason: string): UmbraUiPipelineControlCapability {
  return control('unsupported', reason);
}

export interface UmbraUiOptionalStagePolicy<T extends { label: string }> {
  hiresFix: {
    enabled: boolean;
    resizeMode: 'scale' | 'dimensions' | null;
  };
  detailerPipeline: T[];
  outputUpscale: {
    enabled: boolean;
    modelSelection: boolean;
    maxDimension: boolean;
  };
}

export function resolveUmbraUiOptionalStagePolicy<T extends { label: string }>(
  capabilities: UmbraUiPipelineCapabilities | undefined,
  hiresFix: { enabled?: unknown; resizeMode?: unknown },
  detailerPipeline: T[],
  outputUpscale: { enabled?: unknown },
): UmbraUiOptionalStagePolicy<T> {
  if (!capabilities) {
    return {
      hiresFix: {
        enabled: hiresFix.enabled === true,
        resizeMode: hiresFix.resizeMode === 'dimensions' ? 'dimensions' : 'scale',
      },
      detailerPipeline: [...detailerPipeline],
      outputUpscale: {
        enabled: outputUpscale.enabled === true,
        modelSelection: true,
        maxDimension: true,
      },
    };
  }
  const resizeMode = resolveUmbraUiHiresResizeMode(capabilities.hiresFix, hiresFix.resizeMode);
  return {
    hiresFix: {
      enabled: capabilities.hiresFix.support === 'adjustable' && !!resizeMode && hiresFix.enabled === true,
      resizeMode,
    },
    detailerPipeline: filterUmbraUiDetailerStages(capabilities.detailerStages, detailerPipeline),
    outputUpscale: {
      enabled: capabilities.finalModelUpscale.support === 'adjustable' && outputUpscale.enabled === true,
      modelSelection: capabilities.finalModelUpscale.modelSelection,
      maxDimension: capabilities.finalModelUpscale.maxDimension,
    },
  };
}

export interface UmbraUiQueueResourceSelector {
  id: string;
  label: string;
  kind: UmbraUiPipelineResourceKind;
  required: boolean;
  defaultValue: string;
}

export interface UmbraUiQueueResourceIssue {
  type: 'selection_required' | 'missing' | 'ambiguous' | 'unverified';
  id: string;
  label: string;
  kind: UmbraUiPipelineResourceKind;
  value: string;
  matches: string[];
}

export function getUmbraUiResourceSelectionIssue(
  id: string,
  label: string,
  kind: UmbraUiPipelineResourceKind,
  valueInput: unknown,
  catalog: ReadonlyMap<UmbraUiPipelineResourceKind, ReadonlySet<string>>,
): UmbraUiQueueResourceIssue | null {
  const value = String(valueInput || '').trim().replace(/\\/g, '/');
  if (!value || value.toLowerCase() === 'none' || value.toLowerCase() === '[none]') {
    return { type: 'selection_required', id, label, kind, value: '', matches: [] };
  }
  const available = catalog.get(kind);
  if (!available || available.size <= 0) {
    return { type: 'unverified', id, label, kind, value, matches: [] };
  }
  const match = matchUmbraUiResourceCatalog(value, available);
  if (match.status === 'available') return null;
  return {
    type: match.status,
    id,
    label,
    kind,
    value,
    matches: match.matches,
  };
}

export function listUmbraUiRequiredResourceIssues(
  selectors: UmbraUiQueueResourceSelector[],
  rawValues: unknown,
  catalog: ReadonlyMap<UmbraUiPipelineResourceKind, ReadonlySet<string>>,
): UmbraUiQueueResourceIssue[] {
  const values = toRecord(rawValues);
  return selectors
    .filter((selector) => selector.required)
    .map((selector) => getUmbraUiResourceSelectionIssue(
      selector.id,
      selector.label,
      selector.kind,
      values[selector.id] ?? selector.defaultValue,
      catalog,
    ))
    .filter((issue): issue is UmbraUiQueueResourceIssue => !!issue);
}

export function getUmbraUiRuntimeNodeExecutionError(
  nodes: UmbraUiPipelineReadiness['runtime']['nodes'],
): string {
  if (nodes.status === 'missing') {
    return `ComfyUI is missing required node classes: ${nodes.missing.join(', ') || 'unknown node class'}.`;
  }
  if (nodes.status === 'unverified') {
    return 'ComfyUI node availability could not be verified.';
  }
  return '';
}

export function deriveUmbraUiTxt2ImgCapabilities(
  promptGraph: Record<string, unknown>,
  descriptor: UmbraUiCapabilityDescriptorInput,
): UmbraUiPipelineCapabilities {
  const nodes = listPipelineNodes(promptGraph);
  const defaults = descriptor.defaults || {};
  const modelNodes = nodes.filter((node) => (
    node.classType === 'UmbraPowerPrompter'
    || node.classType === 'UmbraLoadCheckpoint'
    || node.classType === 'CheckpointLoaderSimple'
    || node.classType === 'DiffusersLoader'
    || node.classType === 'UNETLoader'
    || node.classType === 'DiffusionModelLoader'
    || node.role === 'model_loader'
  ));
  const modelSourceSupport: UmbraUiPipelineCapabilitySupport = descriptor.modelSources.length > 1
    ? 'adjustable'
    : descriptor.modelSources.length === 1 ? 'fixed' : 'unsupported';

  const unifiedPromptNodes = nodes.filter((node) => node.classType === 'UmbraPowerPrompter');
  const negativeEncoderNodes = nodes.filter((node) => (
    (node.role === 'negative_prompt' || /negative/i.test(node.title))
    && /^CLIPTextEncode/.test(node.classType)
    && (hasInput(node, 'text') || hasInput(node, 'prompt'))
  ));
  const zeroNegativeNodes = nodes.filter((node) => (
    node.classType === 'ConditioningZeroOut'
    && /negative|unconditional/i.test(node.title)
  ));
  const negativePrompt = unifiedPromptNodes.some((node) => hasInput(node, 'negative_prompt')) || negativeEncoderNodes.length > 0
    ? control(
      'adjustable',
      'Negative prompt text is connected to the conditioning graph.',
      [...unifiedPromptNodes, ...negativeEncoderNodes],
    )
    : zeroNegativeNodes.length > 0
      ? control(
        'unsupported',
        'This graph uses zero or unconditional conditioning and does not consume negative prompt text.',
        zeroNegativeNodes,
      )
      : unsupported('No negative-prompt conditioning path is present in this graph.');

  const loraNodes = nodes.filter((node) => (
    node.classType === 'UmbraPowerPrompter'
    || node.classType === 'UmbraA1111LoraSyntax'
    || node.role === 'lora_stack'
  ));
  const loras = loraNodes.length > 0
    ? control('adjustable', 'The graph includes an Umbra LoRA-aware prompt/model adapter.', loraNodes)
    : unsupported('No LoRA adapter is present in this graph.');

  const seedNodes = nodes.filter((node) => (
    ['UmbraPowerPrompter', 'UmbraPowerPrompterReader', 'UmbraSeedValue', 'RandomNoise',
      'UmbraKSamplerHiResFix', 'UmbraKSampler', 'UmbraKSamplerNormal', 'KSampler',
      'KSamplerAdvanced', 'SamplerCustom'].includes(node.classType)
    && (hasInput(node, 'seed') || hasInput(node, 'noise_seed'))
  ) || node.role === 'seed');
  const seed = seedNodes.length > 0
    ? control('adjustable', 'Seed is wired to the graph noise source.', seedNodes, literalInput(seedNodes, ['seed', 'noise_seed']))
    : unsupported('No supported seed input is connected to this graph.');

  const stepNodes = nodes.filter((node) => (
    ['UmbraPowerPrompter', 'UmbraKSamplerHiResFix', 'UmbraKSampler', 'UmbraKSamplerNormal',
      'KSampler', 'KSamplerAdvanced', 'BasicScheduler', 'Ideogram4Scheduler', 'Flux2Scheduler'].includes(node.classType)
    && hasInput(node, 'steps')
  ) || node.role === 'steps');
  const steps = stepNodes.length > 0
    ? control('adjustable', 'Sampling steps are exposed by a supported sampler or scheduler node.', stepNodes, literalInput(stepNodes, ['steps']) ?? defaults.steps)
    : unsupported('The graph does not expose an adjustable step count.');

  const guidanceNodes = nodes.filter((node) => (
    (node.classType === 'FluxGuidance' || node.classType === 'CLIPTextEncodeFlux' || node.role === 'guidance')
    && hasInput(node, 'guidance')
  ));
  const cfgNodes = nodes.filter((node) => (
    (
      ['UmbraPowerPrompter', 'UmbraKSamplerHiResFix', 'UmbraKSampler', 'UmbraKSamplerNormal',
        'KSampler', 'KSamplerAdvanced', 'SamplerCustom', 'CFGGuider', 'DualCFGGuider',
        'DualModelGuider'].includes(node.classType)
      || node.role === 'cfg'
    )
    && (hasInput(node, 'cfg') || hasInput(node, 'cfg_conds'))
  ));
  const fixedGuiderNodes = nodes.filter((node) => /Guider$/.test(node.classType));
  const guidance = guidanceNodes.length > 0
    ? {
      ...control(
        'adjustable',
        'This family uses conditioning guidance rather than sampler CFG.',
        guidanceNodes,
        literalInput(guidanceNodes, ['guidance']) ?? defaults.cfg,
      ),
      mode: 'guidance' as const,
      label: 'Guidance' as const,
    }
    : cfgNodes.length > 0
      ? {
        ...control(
          'adjustable',
          'Classifier-free guidance is exposed by the sampling graph.',
          cfgNodes,
          literalInput(cfgNodes, ['cfg', 'cfg_conds']) ?? defaults.cfg,
        ),
        mode: 'cfg' as const,
        label: 'CFG' as const,
      }
      : fixedGuiderNodes.length > 0
        ? {
          ...control('fixed', 'The graph uses a guider without an adjustable CFG or guidance input.', fixedGuiderNodes, defaults.cfg),
          mode: 'none' as const,
          label: 'Guidance unavailable' as const,
        }
        : {
          ...unsupported('No CFG or guidance control is present in this graph.'),
          mode: 'none' as const,
          label: 'Guidance unavailable' as const,
        };

  const clipSkipNodes = nodes.filter((node) => (
    (node.classType === 'UmbraPowerPrompter' && hasInput(node, 'clip_skip'))
    || (node.classType === 'CLIPSetLastLayer' && hasInput(node, 'stop_at_clip_layer'))
  ));
  const clipSkip = clipSkipNodes.length > 0
    ? control(
      'adjustable',
      'CLIP skip is wired through a supported conditioning node.',
      clipSkipNodes,
      clipSkipCapabilityValue(clipSkipNodes, defaults.clipSkip),
    )
    : unsupported('This graph has no CLIP skip node; changing CLIP skip would have no effect.');

  const samplerNodes = nodes.filter((node) => SAMPLER_CONTROL_CLASSES.has(node.classType) && hasInput(node, 'sampler_name'));
  const fixedSamplerNodes = nodes.filter((node) => (
    /^Sampler/.test(node.classType)
    && !['SamplerCustom', 'SamplerCustomAdvanced'].includes(node.classType)
    && !hasInput(node, 'sampler_name')
  ));
  const sampler = samplerNodes.length > 0
    ? control('adjustable', 'Sampler selection is exposed by the graph.', samplerNodes, literalInput(samplerNodes, ['sampler_name']) ?? defaults.samplerName)
    : fixedSamplerNodes.length > 0
      ? control('fixed', `Sampler is fixed by ${fixedSamplerNodes[0].classType}.`, fixedSamplerNodes, defaults.samplerName || fixedSamplerNodes[0].classType)
      : unsupported('No supported sampler selector is present in this graph.');

  const schedulerNodes = nodes.filter((node) => SCHEDULER_CONTROL_CLASSES.has(node.classType) && hasInput(node, 'scheduler'));
  const fixedSchedulerNodes = nodes.filter((node) => /Scheduler$/.test(node.classType) && !hasInput(node, 'scheduler'));
  const scheduler = schedulerNodes.length > 0
    ? control('adjustable', 'Scheduler selection is exposed by the graph.', schedulerNodes, literalInput(schedulerNodes, ['scheduler']) ?? defaults.scheduler)
    : fixedSchedulerNodes.length > 0
      ? control('fixed', `Scheduler behavior is fixed by ${fixedSchedulerNodes[0].classType}.`, fixedSchedulerNodes, defaults.scheduler || fixedSchedulerNodes[0].classType)
      : unsupported('No supported scheduler selector is present in this graph.');

  const img2imgDenoiseNodes = descriptor.feature === 'img2img'
    ? nodes.filter((node) => (
      (hasNodeRole(node, 'img2img_sampler') || hasNodeRole(node, 'img2img_scheduler'))
      && hasInput(node, 'denoise')
    ))
    : [];
  const denoise = img2imgDenoiseNodes.length > 0
    ? control(
      'adjustable',
      'IMG2IMG denoise is wired to the base sampling path.',
      img2imgDenoiseNodes,
      literalInput(img2imgDenoiseNodes, ['denoise']) ?? defaults.denoise,
    )
    : unsupported('This pipeline does not expose a base IMG2IMG denoise control.');

  const resolutionNodes = nodes.filter((node) => (
    ['UmbraPowerPrompter', 'UmbraPowerPrompterReader', 'Ideogram4Scheduler', 'Flux2Scheduler'].includes(node.classType)
    && hasInput(node, 'width')
    && hasInput(node, 'height')
  ) || node.role === 'resolution');
  const hasHiDreamPixelLatent = nodes.some((node) => node.classType === 'EmptyHiDreamO1LatentImage');
  const hasSixteenPixelLatent = nodes.some((node) => (
    node.classType === 'EmptyFlux2LatentImage' || node.classType === 'EmptySD3LatentImage'
  ));
  const resolutionStep = hasHiDreamPixelLatent ? 32 : hasSixteenPixelLatent ? 16 : 8;
  const maximumResolution = hasHiDreamPixelLatent ? 4096 : 16384;
  const resolution = resolutionNodes.length > 0
    ? {
      ...control('adjustable', 'Width and height are connected to the latent or family scheduler.', resolutionNodes),
      defaultWidth: Number(literalInput(resolutionNodes, ['width']) ?? defaults.width) || undefined,
      defaultHeight: Number(literalInput(resolutionNodes, ['height']) ?? defaults.height) || undefined,
      minimumWidth: 64,
      minimumHeight: 64,
      maximumWidth: maximumResolution,
      maximumHeight: maximumResolution,
      step: resolutionStep,
    }
    : {
      ...unsupported('The graph does not expose adjustable output dimensions.'),
      defaultWidth: defaults.width,
      defaultHeight: defaults.height,
      minimumWidth: 64,
      minimumHeight: 64,
      maximumWidth: maximumResolution,
      maximumHeight: maximumResolution,
      step: resolutionStep,
    };

  const hiresNodes = nodes.filter((node) => node.classType === 'UmbraKSamplerHiResFix' && hasInput(node, 'enabled'));
  const hiresNode = hiresNodes[0];
  const resizeModes: Array<'scale' | 'dimensions'> = [];
  if (hiresNode && hasInput(hiresNode, 'scale_by')) resizeModes.push('scale');
  if (hiresNode && hasInput(hiresNode, 'resize_width') && hasInput(hiresNode, 'resize_height')) resizeModes.push('dimensions');
  const hiresFix = hiresNode
    ? {
      ...control('adjustable', 'The graph includes an optional Umbra hires-fix sampling stage.', hiresNodes, literalInput(hiresNodes, ['enabled'])),
      resizeModes,
      controls: {
        upscaler: hasInput(hiresNode, 'upscaler'),
        steps: hasInput(hiresNode, 'hires_steps'),
        denoise: hasInput(hiresNode, 'hires_denoise'),
        cfg: guidance.mode === 'cfg' && hasInput(hiresNode, 'hires_cfg'),
        sampler: hasInput(hiresNode, 'hires_sampler_name'),
        scheduler: hasInput(hiresNode, 'hires_scheduler'),
      },
    }
    : {
      ...unsupported('No hires-fix stage is present in this graph.'),
      resizeModes: [],
      controls: { upscaler: false, steps: false, denoise: false, cfg: false, sampler: false, scheduler: false },
    };

  const detailerNodes = nodes.filter((node) => node.classType === 'UmbraImageDetailer' || node.role === 'detailer');
  const nativeDetailerProviders = nodes.filter((node) => (
    NATIVE_DETAILER_PROVIDER_CLASSES.has(node.classType)
    || node.role === 'native_detailer_provider'
    || node.role === 'detailer_provider'
  ));
  const classicDetailerBlockers = nodes.filter((node) => CLASSIC_DETAILER_INCOMPATIBLE_CLASSES.has(node.classType));
  const detailerNode = detailerNodes[0];
  const nativeProviderById = new Map(nativeDetailerProviders.map((node) => [node.id, node]));
  const connectedNativeProvider = nativeProviderById.get(connectedNodeId(detailerNode, 'sampling_provider'));
  const stageInputs = [
    ['person_detail', 'person'],
    ['face_detail', 'face'],
    ['eye_detail', 'eyes'],
    ['hand_detail', 'hands'],
  ] as const;
  const detailerStages = detailerNode && classicDetailerBlockers.length > 0 && !connectedNativeProvider
    ? {
      ...control(
        'unsupported',
        `Classic detailer stages are incompatible with this graph's advanced sampling contract (${uniqueNodeClassTypes(classicDetailerBlockers).join(', ')}). An explicit native detailer provider is required.`,
        [...detailerNodes, ...nativeDetailerProviders, ...classicDetailerBlockers],
      ),
      stages: [],
      customStages: false,
    }
    : detailerNode
      ? {
        ...control(
          'adjustable',
          connectedNativeProvider
            ? 'The detailer is connected to an explicit native detailer provider.'
            : 'The classic sampling graph includes an Umbra detailer stage pipeline.',
          [...detailerNodes, ...(connectedNativeProvider ? [connectedNativeProvider] : [])],
        ),
        stages: stageInputs.filter(([input]) => hasInput(detailerNode, input)).map(([, stage]) => stage),
        customStages: hasInput(detailerNode, 'pipeline_json'),
      }
    : {
      ...unsupported('No detailer stage is present in this graph.'),
      stages: [],
      customStages: false,
    };

  const upscaleNodes = nodes.filter((node) => node.classType === 'UmbraImageUpscale' || node.role === 'final_upscale');
  const upscaleNode = upscaleNodes[0];
  const finalModelUpscale = upscaleNode && hasInput(upscaleNode, 'enabled')
    ? {
      ...control(
        'adjustable',
        'The final image path includes an optional model upscaler.',
        upscaleNodes,
        literalInput(upscaleNodes, ['upscale_model']),
      ),
      modelSelection: hasInput(upscaleNode, 'upscale_model'),
      maxDimension: hasInput(upscaleNode, 'max_dimension'),
    }
    : {
      ...unsupported('No final model-upscale stage is present in this graph.'),
      modelSelection: false,
      maxDimension: false,
    };

  return {
    version: 1,
    modelSources: {
      ...control(
        modelSourceSupport,
        descriptor.modelSources.length > 0
          ? 'Accepted model sources come from the locked pipeline descriptor and its model loader.'
          : 'The locked descriptor does not declare a model source.',
        modelNodes,
      ),
      values: [...descriptor.modelSources],
    },
    negativePrompt,
    loras,
    seed,
    steps,
    guidance,
    clipSkip,
    sampler,
    scheduler,
    denoise,
    resolution,
    hiresFix,
    detailerStages,
    finalModelUpscale,
  };
}

export function deriveUmbraUiInpaintCanvasCapabilities(
  promptGraph: Record<string, unknown>,
  descriptor: UmbraUiInpaintCapabilityDescriptorInput,
): UmbraUiInpaintCanvasCapabilities {
  const nodes = listPipelineNodes(promptGraph);
  const nodeClassTypes = uniqueNodeClassTypes(nodes);
  const regionalContract = descriptor.inpaintAdapter
    ? resolveUmbraUiInpaintRegionalConditioningContractForAdapter(promptGraph, descriptor.inpaintAdapter)
    : null;
  if (descriptor.inpaintAdapter === 'classic_conditioning') {
    const isAnima = normalizeUmbraUiModelFamilyKey(
      descriptor.modelFamilyKey || descriptor.modelFamily,
    ) === 'anima';
    const adapterTypes: UmbraUiInpaintControlAdapterType[] = [
      'controlnet',
      't2i_adapter',
      'control_lora',
      ...(isAnima ? ['anima_lllite' as const] : []),
    ];
    return {
      version: 1,
      regionalGuidance: {
        support: 'adjustable',
        reason: 'Umbra can compose regional positive and negative conditioning into this classic inpaint graph.',
        nodeClassTypes,
        maxLayers: 16,
        positivePrompt: true,
        negativePrompt: true,
        autoNegative: true,
      },
      controlLayers: {
        support: 'adjustable',
        reason: isAnima
          ? 'Umbra can attach classic CONTROL_NET adapters or an installed Anima LLLite provider through their exact, separate graph contracts.'
          : 'Umbra can attach installed ControlNet, T2I Adapter, and Control LoRA models through ComfyUI\'s shared CONTROL_NET contract.',
        nodeClassTypes: isAnima
          ? Array.from(new Set([...nodeClassTypes, 'AnimaLLLiteApply'])).sort()
          : nodeClassTypes,
        maxLayers: 8,
        adapterTypes,
        modes: ['balanced'],
      },
      referenceLayers: {
        support: 'adjustable',
        reason: 'Umbra can attach exact style-model conditioning or architecture-matched IP Adapter model patches to this classic inpaint graph.',
        nodeClassTypes: Array.from(new Set([
          ...nodeClassTypes,
          'LoadImage',
          'LoadImageMask',
          'CLIPVisionLoader',
          'CLIPVisionEncode',
          'StyleModelLoader',
          'StyleModelApply',
          'IPAdapterModelLoader',
          'IPAdapterAdvanced',
        ])).sort(),
        maxLayers: 8,
        methods: ['style_model', 'ip_adapter'],
      },
      seamless: {
        support: 'adjustable',
        reason: 'Umbra can apply axis-specific circular padding to this classic convolutional model and VAE.',
        nodeClassTypes: ['UmbraSeamlessTiling'],
        axes: ['x', 'y'],
      },
    };
  }
  if (descriptor.inpaintAdapter === 'native_edit') {
    const source = nodes.find((node) => node.role === 'inpaint_source');
    const sink = nodes.find((node) => node.role === 'inpaint_reference_sink');
    const vae = nodes.find((node) => node.role === 'inpaint_reference_vae');
    const fluxMethods = new Set(['flux_kontext', 'flux2_reference']);
    const fluxMethod = sink && fluxMethods.has(sink.referenceMethod)
      ? sink.referenceMethod as 'flux_kontext' | 'flux2_reference'
      : null;
    const fluxReady = !!sink
      && !!vae
      && !!fluxMethod
      && (hasInput(sink, 'positive') || hasInput(sink, 'conditioning'));
    const qwenPositive = nodes.find((node) => node.role === 'inpaint_reference_positive_encoder');
    const qwenNegative = nodes.find((node) => node.role === 'inpaint_reference_negative_encoder');
    const qwenEncoderReady = (node: PipelineNode | undefined) => !!node
      && node.classType === 'TextEncodeQwenImageEditPlus'
      && node.referenceMethod === 'qwen_image_reference'
      && !!connectedNodeId(node, 'clip')
      && !!connectedNodeId(node, 'vae')
      && connectedNodeId(node, 'image1') === source?.id
      && hasInput(node, 'prompt');
    const qwenReady = !!source && qwenEncoderReady(qwenPositive) && qwenEncoderReady(qwenNegative);
    const hiDreamReady = !!sink
      && sink.classType === 'HiDreamO1ReferenceImages'
      && sink.referenceMethod === 'hidream_o1_reference'
      && connectedAutogrowImageNodeId(sink, 'image_1') === source?.id
      && !!connectedNodeId(sink, 'positive')
      && !!connectedNodeId(sink, 'negative');
    const reduxReady = !!sink
      && sink.referenceMethod === 'flux_redux'
      && (hasInput(sink, 'positive') || hasInput(sink, 'conditioning'));
    const referenceModelSink = nodes.find((node) => node.role === 'inpaint_reference_model_sink');
    const ipAdapterReady = !!referenceModelSink
      && referenceModelSink.referenceMethod === 'ip_adapter'
      && !!connectedNodeId(referenceModelSink, 'model');
    const providers = [
      ...(fluxReady && fluxMethod ? [{
        method: fluxMethod,
        maxLayers: 8,
        reason: `The locked native edit graph declares an exact ${fluxMethod} ReferenceLatent sink and VAE binding.`,
        requiredNodes: ['LoadImage', 'VAEEncode', 'ReferenceLatent'],
      }] : []),
      ...(qwenReady ? [{
        method: 'qwen_image_reference' as const,
        maxLayers: 2,
        reason: 'The locked native edit graph declares paired Qwen Image Edit Plus encoders with two explicit extra-reference slots.',
        requiredNodes: ['LoadImage', 'TextEncodeQwenImageEditPlus'],
      }] : []),
      ...(reduxReady ? [{
        method: 'flux_redux' as const,
        maxLayers: 8,
        reason: 'The locked native edit graph declares a FLUX Redux conditioning sink with configurable style-model references.',
        requiredNodes: ['LoadImage', 'CLIPVisionLoader', 'CLIPVisionEncode', 'StyleModelLoader', 'StyleModelApply'],
      }] : []),
      ...(ipAdapterReady ? [{
        method: 'ip_adapter' as const,
        maxLayers: 8,
        reason: 'The locked native edit graph declares an exact IP Adapter model sink with per-reference timing and embedding controls.',
        requiredNodes: ['LoadImage', 'IPAdapterModelLoader', 'CLIPVisionLoader', 'IPAdapterAdvanced'],
      }] : []),
      ...(hiDreamReady ? [{
        method: 'hidream_o1_reference' as const,
        maxLayers: 9,
        reason: 'The locked native edit graph reserves HiDream-O1 image_1 for the editable source and exposes nine additional reference slots.',
        requiredNodes: ['LoadImage', 'HiDreamO1ReferenceImages'],
      }] : []),
    ];
    const provider = providers.length === 1 ? providers[0] : null;
    const controlModelSink = nodes.find((node) => node.role === 'inpaint_control_model_sink');
    const controlVae = nodes.find((node) => node.role === 'inpaint_control_vae');
    const zImageControlReady = !!controlModelSink
      && !!controlVae
      && controlModelSink.controlAdapter === 'z_image_control'
      && controlModelSink.controlMode === 'balanced'
      && !!connectedNodeId(controlModelSink, 'model');
    const unavailable = (kind: string) => ({
      support: 'unsupported' as const,
      reason: providers.length > 1
        ? 'The native_edit graph declares multiple reference providers; select one exact provider contract.'
        : `The native_edit provider does not declare a compatible ${kind} binding contract.`,
      nodeClassTypes,
      maxLayers: 0,
    });
    return {
      version: 1,
      regionalGuidance: regionalContract
        ? {
          support: 'adjustable',
          reason: regionalContract.method === 'flux_guidance_masked_conditioning'
            ? 'The locked native edit graph declares an exact FLUX guidance encoder and positive-conditioning sink. Negative regional conditioning is not part of this guider contract.'
            : regionalContract.method === 'qwen_image_edit_masked_conditioning'
              ? 'The locked native edit graph declares paired Qwen Image Edit Plus regional encoders and conditioning sinks.'
              : 'The locked native edit graph declares an exact CLIP encoder and paired regional-conditioning sinks.',
          nodeClassTypes: Array.from(new Set([
            ...nodeClassTypes,
            'LoadImageMask',
            'ConditioningSetMask',
            'ConditioningSetTimestepRange',
            'ConditioningCombine',
            ...(regionalContract.autoNegative ? ['InvertMask'] : []),
          ])).sort(),
          maxLayers: regionalContract.maxLayers,
          positivePrompt: regionalContract.positivePrompt,
          negativePrompt: regionalContract.negativePrompt,
          autoNegative: regionalContract.autoNegative,
        }
        : {
          ...unavailable('regional-guidance'),
          positivePrompt: false,
          negativePrompt: false,
          autoNegative: false,
        },
      controlLayers: zImageControlReady
        ? {
          support: 'adjustable',
          reason: 'The locked native edit graph declares an exact Z-Image model-patch sink and VAE binding.',
          nodeClassTypes: Array.from(new Set([...nodeClassTypes, 'LoadImage', 'ModelPatchLoader', 'ZImageFunControlnet'])).sort(),
          maxLayers: 4,
          adapterTypes: ['z_image_control'],
          modes: ['balanced'],
        }
        : { ...unavailable('control-layer'), adapterTypes: [], modes: [] },
      referenceLayers: provider
        ? {
          support: 'adjustable',
          reason: provider.reason,
          nodeClassTypes: Array.from(new Set([...nodeClassTypes, ...provider.requiredNodes])).sort(),
          maxLayers: provider.maxLayers,
          methods: [provider.method],
        }
        : { ...unavailable('native reference'), methods: [] },
      seamless: {
        support: 'unsupported',
        reason: 'The native_edit provider does not declare a compatible seamless model/VAE patch contract.',
        nodeClassTypes,
        axes: [],
      },
    };
  }
  const provider = descriptor.inpaintAdapter || 'undeclared';
  const fluxReduxReady = descriptor.inpaintAdapter === 'flux_fill';
  const unavailable = (kind: string) => ({
    support: 'unsupported' as const,
    reason: `The ${provider} provider does not declare a compatible ${kind} binding contract.`,
    nodeClassTypes,
    maxLayers: 0,
  });
  return {
    version: 1,
    regionalGuidance: regionalContract
      ? {
        support: 'adjustable',
        reason: regionalContract.method === 'flux_text_encode_masked_conditioning'
          ? 'The locked FLUX graph declares an exact CLIPTextEncodeFlux template and positive-conditioning sink.'
          : 'The locked graph declares an exact CLIP source and paired regional-conditioning sinks.',
        nodeClassTypes: Array.from(new Set([
          ...nodeClassTypes,
          'LoadImageMask',
          'ConditioningSetMask',
          'ConditioningSetTimestepRange',
          'ConditioningCombine',
          ...(regionalContract.autoNegative ? ['InvertMask'] : []),
        ])).sort(),
        maxLayers: regionalContract.maxLayers,
        positivePrompt: regionalContract.positivePrompt,
        negativePrompt: regionalContract.negativePrompt,
        autoNegative: regionalContract.autoNegative,
      }
      : {
        ...unavailable('regional-guidance'),
        positivePrompt: false,
        negativePrompt: false,
        autoNegative: false,
      },
    controlLayers: { ...unavailable('ControlNet'), adapterTypes: [], modes: [] },
    referenceLayers: fluxReduxReady
      ? {
        support: 'adjustable',
        reason: 'The FLUX Fill builder declares the exact FLUX Redux style-model conditioning contract.',
        nodeClassTypes: Array.from(new Set([
          ...nodeClassTypes,
          'LoadImage',
          'CLIPVisionLoader',
          'CLIPVisionEncode',
          'StyleModelLoader',
          'StyleModelApply',
        ])).sort(),
        maxLayers: 8,
        methods: ['flux_redux'],
      }
      : { ...unavailable('style-reference'), methods: [] },
    seamless: {
      support: 'unsupported',
      reason: `The ${provider} provider does not declare a compatible seamless model/VAE patch contract.`,
      nodeClassTypes,
      axes: [],
    },
  };
}
