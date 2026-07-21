export interface UmbraUiInpaintEntityMetadataExpectation {
  id: string;
  [key: string]: string | number | boolean;
}

export interface UmbraUiInpaintMetadataExpectation {
  canvasProjectId: string;
  operationMode: 'inpaint' | 'outpaint';
  workflowId: string;
  modelFamily: string;
  modelSource: string;
  inpaintAdapter: string;
  adapterModelName: string;
  checkpointName: string;
  prompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  clipSkip: number;
  samplerName: string;
  scheduler: string;
  denoise: number;
  samples: number;
  maskGrow: number;
  maskFeather: number;
  canvasMaskGrow: number;
  canvasMaskFeather: number;
  contextPadding: number;
  processingScaleMode: 'none' | 'auto' | 'manual';
  processingWidth: number;
  processingHeight: number;
  coherenceMode: 'none' | 'gaussian' | 'box' | 'staged';
  coherenceEdgeSize: number;
  coherenceMinimumDenoise: number;
  fillMode: string;
  infillColor: string;
  infillTileSize: number;
  inpaintModelName: string;
  seamlessX: boolean;
  seamlessY: boolean;
  outputOnlyMaskedRegions: boolean;
  colorMatch: number;
  differentialStrength: number;
  regionalGuidanceIds: string[];
  controlLayerIds: string[];
  referenceLayerIds: string[];
  regionalGuidance?: UmbraUiInpaintEntityMetadataExpectation[];
  controlLayers?: UmbraUiInpaintEntityMetadataExpectation[];
  referenceLayers?: UmbraUiInpaintEntityMetadataExpectation[];
  requiredPromptNodeClasses?: string[];
  generationX: number;
  generationY: number;
  generationWidth: number;
  generationHeight: number;
  submissionX: number;
  submissionY: number;
  submissionWidth: number;
  submissionHeight: number;
  width: number;
  height: number;
}

export interface UmbraUiInpaintMetadataValidation {
  workflowEmbedded: boolean;
  inpaintMetadataValid: boolean;
  metadataIssues: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedModelPath(value: unknown): string {
  return normalizedText(value).replace(/\\/g, '/').toLowerCase();
}

function normalizedIdentifier(value: unknown): string {
  return normalizedText(value).toLowerCase();
}

function finiteInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function looksLikeComfyPromptGraph(value: unknown): boolean {
  const graph = asRecord(value);
  if (!graph) return false;
  return Object.values(graph).some((node) => {
    const record = asRecord(node);
    return !!record
      && typeof record.class_type === 'string'
      && !!asRecord(record.inputs);
  });
}

function looksLikeComfyWorkflow(value: unknown): boolean {
  const workflow = asRecord(value);
  if (!workflow) return false;
  return (Array.isArray(workflow.nodes) && workflow.nodes.length > 0)
    || (Array.isArray(workflow.links) && workflow.links.length > 0)
    || looksLikeComfyPromptGraph(workflow);
}

function promptGraphNodeClasses(value: unknown): Set<string> {
  const graph = asRecord(value);
  if (!graph) return new Set();
  return new Set(Object.values(graph).map((node) => normalizedText(asRecord(node)?.class_type)).filter(Boolean));
}

function clipSkipPromptGraphIssues(value: unknown, expectedClipSkip: number): string[] {
  const graph = asRecord(value);
  if (!graph) return [];
  const expected = Math.max(1, Math.round(Math.abs(expectedClipSkip)));
  const layerNodes = Object.entries(graph).filter(([, rawNode]) => (
    normalizedText(asRecord(rawNode)?.class_type) === 'CLIPSetLastLayer'
  ));
  const directNodes = Object.entries(graph).filter(([, rawNode]) => {
    const node = asRecord(rawNode);
    const inputs = asRecord(node?.inputs);
    return normalizedText(node?.class_type) === 'UmbraPowerPrompter'
      && inputs
      && Object.prototype.hasOwnProperty.call(inputs, 'clip_skip');
  });
  const issues: string[] = [];

  if (expected === 1 && layerNodes.length > 0) {
    issues.push('The embedded API prompt graph mutates CLIP with CLIPSetLastLayer even though CLIP skip 1 requires normal checkpoint CLIP.');
  }
  if (expected > 1 && layerNodes.length === 0 && directNodes.length === 0) {
    issues.push(`The embedded API prompt graph does not implement requested CLIP skip ${expected}.`);
  }
  for (const [nodeId, rawNode] of layerNodes) {
    const inputs = asRecord(asRecord(rawNode)?.inputs);
    if (finiteInteger(inputs?.stop_at_clip_layer) !== -expected) {
      issues.push(`CLIPSetLastLayer node ${nodeId} did not implement requested CLIP skip ${expected}.`);
    }
  }
  for (const [nodeId, rawNode] of directNodes) {
    const inputs = asRecord(asRecord(rawNode)?.inputs);
    if (finiteInteger(inputs?.clip_skip) !== expected) {
      issues.push(`UmbraPowerPrompter node ${nodeId} did not implement requested CLIP skip ${expected}.`);
    }
  }
  return issues;
}

function modelSourcePromptGraphIssues(
  value: unknown,
  expectedModelSource: string,
  expectedModelName: string,
): string[] {
  const graph = asRecord(value);
  if (!graph) return [];
  const loaderEntries = Object.entries(graph).filter(([, rawNode]) => (
    normalizedText(asRecord(rawNode)?.class_type) === 'UmbraLoadCheckpoint'
  ));
  if (loaderEntries.length === 0) return [];

  const expectedSource = normalizedIdentifier(expectedModelSource);
  const expectedField = ({
    checkpoint: 'checkpoint_name',
    diffusers: 'diffusers_model',
    diffusion_model: 'diffusion_model_name',
    unet: 'unet_name',
    gguf: 'gguf_name',
  } as Record<string, string>)[expectedSource];
  if (!expectedField) return [`Qualification does not recognize model source ${expectedModelSource}.`];

  const issues: string[] = [];
  for (const [nodeId, rawNode] of loaderEntries) {
    const inputs = asRecord(asRecord(rawNode)?.inputs);
    if (normalizedIdentifier(inputs?.model_type) !== expectedSource) {
      issues.push(`UmbraLoadCheckpoint node ${nodeId} did not use requested model source ${expectedSource}.`);
    }
    if (normalizedModelPath(inputs?.[expectedField]) !== normalizedModelPath(expectedModelName)) {
      issues.push(`UmbraLoadCheckpoint node ${nodeId} did not load the requested model from ${expectedField}.`);
    }
  }
  return issues;
}

function maskedReferencePromptGraphIssues(
  value: unknown,
  expectedReferences: UmbraUiInpaintEntityMetadataExpectation[] | undefined,
): string[] {
  const requiredMaskedIpAdapters = (expectedReferences || []).filter((reference) => (
    normalizedIdentifier(reference.method) === 'ip_adapter'
      && reference.hasInfluenceMask === true
  )).length;
  if (requiredMaskedIpAdapters === 0) return [];

  const graph = asRecord(value);
  if (!graph) return [];
  const imageMaskNodeIds = new Set(Object.entries(graph)
    .filter(([, rawNode]) => normalizedText(asRecord(rawNode)?.class_type) === 'LoadImageMask')
    .map(([nodeId]) => nodeId));
  const boundMaskedIpAdapters = Object.values(graph).filter((rawNode) => {
    const node = asRecord(rawNode);
    if (normalizedText(node?.class_type) !== 'IPAdapterAdvanced') return false;
    const maskLink = asRecord(node?.inputs)?.attn_mask;
    return Array.isArray(maskLink)
      && maskLink.length >= 1
      && imageMaskNodeIds.has(String(maskLink[0]));
  }).length;

  return boundMaskedIpAdapters >= requiredMaskedIpAdapters
    ? []
    : [`The embedded API prompt graph only binds ${boundMaskedIpAdapters} of ${requiredMaskedIpAdapters} masked IP Adapter reference layer(s) to LoadImageMask.`];
}

function compareText(
  issues: string[],
  label: string,
  actual: unknown,
  expected: string,
  normalize: (value: unknown) => string = normalizedText,
): void {
  if (normalize(actual) !== normalize(expected)) {
    issues.push(`${label} did not match the submitted qualification case.`);
  }
}

function compareInteger(issues: string[], label: string, actual: unknown, expected: number): void {
  if (finiteInteger(actual) !== Math.round(expected)) {
    issues.push(`${label} did not match the submitted qualification case.`);
  }
}

function compareNumber(issues: string[], label: string, actual: unknown, expected: number): void {
  const number = Number(actual);
  if (!Number.isFinite(number) || Math.abs(number - expected) > 0.000_001) {
    issues.push(`${label} did not match the submitted qualification case.`);
  }
}

function compareBoolean(issues: string[], label: string, actual: unknown, expected: boolean): void {
  if (actual !== expected) issues.push(`${label} did not match the submitted qualification case.`);
}

function compareEntityIds(issues: string[], label: string, actual: unknown, expected: string[]): void {
  const actualIds = Array.isArray(actual)
    ? actual.map((entry) => normalizedText(asRecord(entry)?.id)).filter(Boolean).sort()
    : [];
  const expectedIds = expected.map((entry) => normalizedText(entry)).filter(Boolean).sort();
  if (actualIds.length !== expectedIds.length || actualIds.some((entry, index) => entry !== expectedIds[index])) {
    issues.push(`${label} did not match the submitted qualification case.`);
  }
}

function compareEntitySettings(
  issues: string[],
  label: string,
  actual: unknown,
  expected: UmbraUiInpaintEntityMetadataExpectation[],
): void {
  compareEntityIds(issues, `${label} ids`, actual, expected.map((entry) => entry.id));
  const actualById = new Map(
    (Array.isArray(actual) ? actual : [])
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => !!entry)
      .map((entry) => [normalizedText(entry.id), entry] as const),
  );
  const pathFields = new Set(['modelName', 'visionModelName']);
  const identifierFields = new Set([
    'method', 'crop', 'strengthType', 'adapterType', 'controlMode', 'controlType',
    'ipAdapterWeightType', 'ipAdapterCombineEmbeds', 'ipAdapterEmbedsScaling',
  ]);
  for (const expectedEntry of expected) {
    const id = normalizedText(expectedEntry.id);
    const actualEntry = actualById.get(id);
    if (!actualEntry) continue;
    for (const [field, expectedValue] of Object.entries(expectedEntry)) {
      if (field === 'id') continue;
      const fieldLabel = `${label} ${id} ${field}`;
      if (typeof expectedValue === 'number') {
        compareNumber(issues, fieldLabel, actualEntry[field], expectedValue);
      } else if (typeof expectedValue === 'boolean') {
        compareBoolean(issues, fieldLabel, actualEntry[field], expectedValue);
      } else {
        compareText(
          issues,
          fieldLabel,
          actualEntry[field],
          expectedValue,
          pathFields.has(field) ? normalizedModelPath : identifierFields.has(field) ? normalizedIdentifier : normalizedText,
        );
      }
    }
  }
}

export function validateUmbraUiInpaintOutputMetadata(
  metadata: unknown,
  expected: UmbraUiInpaintMetadataExpectation,
): UmbraUiInpaintMetadataValidation {
  const metadataIssues: string[] = [];
  const root = asRecord(metadata);
  if (!root) {
    return {
      workflowEmbedded: false,
      inpaintMetadataValid: false,
      metadataIssues: ['The metadata endpoint did not return an object.'],
    };
  }

  let workflowEmbedded = looksLikeComfyWorkflow(root.workflow)
    || looksLikeComfyPromptGraph(root.prompt)
    || looksLikeComfyPromptGraph(root.umbra_api_workflow);
  if (!workflowEmbedded) {
    metadataIssues.push('No recoverable ComfyUI workflow or API prompt graph was embedded.');
  }
  if ((expected.requiredPromptNodeClasses?.length || 0) > 0) {
    const classTypes = promptGraphNodeClasses(
      looksLikeComfyPromptGraph(root.prompt) ? root.prompt : root.umbra_api_workflow,
    );
    for (const classType of expected.requiredPromptNodeClasses || []) {
      if (!classTypes.has(classType)) {
        metadataIssues.push(`The embedded API prompt graph is missing required node class ${classType}.`);
        workflowEmbedded = false;
      }
    }
  }

  const inpaint = asRecord(root.umbra_inpaint);
  const inpaintIssues: string[] = [];
  const embeddedPromptGraph = looksLikeComfyPromptGraph(root.prompt)
    ? root.prompt
    : looksLikeComfyPromptGraph(root.umbra_api_workflow)
      ? root.umbra_api_workflow
      : null;
  if (embeddedPromptGraph) {
    inpaintIssues.push(...clipSkipPromptGraphIssues(embeddedPromptGraph, expected.clipSkip));
    inpaintIssues.push(...modelSourcePromptGraphIssues(
      embeddedPromptGraph,
      expected.modelSource,
      expected.checkpointName,
    ));
    inpaintIssues.push(...maskedReferencePromptGraphIssues(
      embeddedPromptGraph,
      expected.referenceLayers,
    ));
  }
  if (!inpaint) {
    inpaintIssues.push('The umbra_inpaint metadata block is missing.');
  } else {
    const version = finiteInteger(inpaint.version);
    if (version === null || version < 4) {
      inpaintIssues.push('The umbra_inpaint metadata version is missing or older than version 4.');
    }
    compareText(inpaintIssues, 'Metadata source', inpaint.source, 'umbra_ui_inpaint');
    compareText(inpaintIssues, 'Canvas project id', inpaint.canvasProjectId, expected.canvasProjectId);
    compareText(inpaintIssues, 'Operation mode', inpaint.operationMode, expected.operationMode, normalizedIdentifier);
    compareText(inpaintIssues, 'Workflow id', inpaint.workflowId, expected.workflowId);
    compareText(inpaintIssues, 'Model family', inpaint.modelFamily, expected.modelFamily, normalizedIdentifier);
    compareText(inpaintIssues, 'Model source', inpaint.modelSource, expected.modelSource, normalizedIdentifier);
    compareText(inpaintIssues, 'Inpaint adapter', inpaint.inpaintAdapter, expected.inpaintAdapter, normalizedIdentifier);
    compareText(inpaintIssues, 'Adapter model name', inpaint.adapterModelName, expected.adapterModelName, normalizedModelPath);
    compareText(inpaintIssues, 'Checkpoint/model name', inpaint.checkpointName, expected.checkpointName, normalizedModelPath);
    compareText(inpaintIssues, 'Positive prompt', inpaint.prompt, expected.prompt);
    compareText(inpaintIssues, 'Negative prompt', inpaint.negativePrompt, expected.negativePrompt);
    compareInteger(inpaintIssues, 'Seed', inpaint.seed, expected.seed);
    compareInteger(inpaintIssues, 'Steps', inpaint.steps, expected.steps);
    compareNumber(inpaintIssues, 'CFG/guidance', inpaint.cfg, expected.cfg);
    compareInteger(inpaintIssues, 'CLIP skip', inpaint.clipSkip, expected.clipSkip);
    compareText(inpaintIssues, 'Sampler', inpaint.samplerName, expected.samplerName, normalizedIdentifier);
    compareText(inpaintIssues, 'Scheduler', inpaint.scheduler, expected.scheduler, normalizedIdentifier);
    compareNumber(inpaintIssues, 'Denoise', inpaint.denoise, expected.denoise);
    compareInteger(inpaintIssues, 'Sample count', inpaint.samples, expected.samples);
    compareInteger(inpaintIssues, 'Mask grow', inpaint.maskGrow, expected.maskGrow);
    compareNumber(inpaintIssues, 'Mask feather', inpaint.maskFeather, expected.maskFeather);
    compareInteger(inpaintIssues, 'Canvas mask grow', inpaint.canvasMaskGrow, expected.canvasMaskGrow);
    compareNumber(inpaintIssues, 'Canvas mask feather', inpaint.canvasMaskFeather, expected.canvasMaskFeather);
    compareInteger(inpaintIssues, 'Context padding', inpaint.contextPadding, expected.contextPadding);
    compareText(inpaintIssues, 'Processing scale mode', inpaint.processingScaleMode, expected.processingScaleMode, normalizedIdentifier);
    compareInteger(inpaintIssues, 'Requested processing width', inpaint.processingWidth, expected.processingWidth);
    compareInteger(inpaintIssues, 'Requested processing height', inpaint.processingHeight, expected.processingHeight);
    compareText(inpaintIssues, 'Coherence mode', inpaint.coherenceMode, expected.coherenceMode, normalizedIdentifier);
    compareInteger(inpaintIssues, 'Coherence edge size', inpaint.coherenceEdgeSize, expected.coherenceEdgeSize);
    compareNumber(inpaintIssues, 'Coherence minimum denoise', inpaint.coherenceMinimumDenoise, expected.coherenceMinimumDenoise);
    compareText(inpaintIssues, 'Fill mode', inpaint.fillMode, expected.fillMode, normalizedIdentifier);
    compareText(inpaintIssues, 'Infill color', inpaint.infillColor, expected.infillColor, normalizedIdentifier);
    compareInteger(inpaintIssues, 'Infill tile size', inpaint.infillTileSize, expected.infillTileSize);
    compareText(inpaintIssues, 'Inpaint model name', inpaint.inpaintModelName, expected.inpaintModelName, normalizedModelPath);
    compareBoolean(inpaintIssues, 'Seamless X', inpaint.seamlessX, expected.seamlessX);
    compareBoolean(inpaintIssues, 'Seamless Y', inpaint.seamlessY, expected.seamlessY);
    compareBoolean(inpaintIssues, 'Masked-only output', inpaint.outputOnlyMaskedRegions, expected.outputOnlyMaskedRegions);
    compareNumber(inpaintIssues, 'Color match', inpaint.colorMatch, expected.colorMatch);
    compareNumber(inpaintIssues, 'Differential strength', inpaint.differentialStrength, expected.differentialStrength);
    if (expected.regionalGuidance) {
      compareEntitySettings(inpaintIssues, 'Regional guidance', inpaint.regionalGuidance, expected.regionalGuidance);
    } else {
      compareEntityIds(inpaintIssues, 'Regional guidance ids', inpaint.regionalGuidance, expected.regionalGuidanceIds);
    }
    if (expected.controlLayers) {
      compareEntitySettings(inpaintIssues, 'Control layer', inpaint.controlLayers, expected.controlLayers);
    } else {
      compareEntityIds(inpaintIssues, 'Control layer ids', inpaint.controlLayers, expected.controlLayerIds);
    }
    if (expected.referenceLayers) {
      compareEntitySettings(inpaintIssues, 'Reference layer', inpaint.referenceLayers, expected.referenceLayers);
    } else {
      compareEntityIds(inpaintIssues, 'Reference layer ids', inpaint.referenceLayers, expected.referenceLayerIds);
    }
    compareInteger(inpaintIssues, 'Output width', inpaint.width, expected.width);
    compareInteger(inpaintIssues, 'Output height', inpaint.height, expected.height);

    const region = asRecord(inpaint.generationRegion);
    if (!region) {
      inpaintIssues.push('The generation region metadata is missing.');
    } else {
      compareInteger(inpaintIssues, 'Generation region x', region.x, expected.generationX);
      compareInteger(inpaintIssues, 'Generation region y', region.y, expected.generationY);
      compareInteger(inpaintIssues, 'Generation region width', region.width, expected.generationWidth);
      compareInteger(inpaintIssues, 'Generation region height', region.height, expected.generationHeight);
    }

    const submissionRegion = asRecord(inpaint.submissionRegion);
    if (!submissionRegion) {
      inpaintIssues.push('The submission region metadata is missing.');
    } else {
      compareInteger(inpaintIssues, 'Submission region x', submissionRegion.x, expected.submissionX);
      compareInteger(inpaintIssues, 'Submission region y', submissionRegion.y, expected.submissionY);
      compareInteger(inpaintIssues, 'Submission region width', submissionRegion.width, expected.submissionWidth);
      compareInteger(inpaintIssues, 'Submission region height', submissionRegion.height, expected.submissionHeight);
    }

    const processing = asRecord(inpaint.processing);
    if (!processing) {
      inpaintIssues.push('The processing raster metadata is missing.');
    } else {
      compareText(inpaintIssues, 'Processing raster mode', processing.mode, expected.processingScaleMode, normalizedIdentifier);
      compareInteger(inpaintIssues, 'Processing raster requested width', processing.requestedWidth, expected.processingWidth);
      compareInteger(inpaintIssues, 'Processing raster requested height', processing.requestedHeight, expected.processingHeight);
      compareInteger(inpaintIssues, 'Processing raster width', processing.width, expected.width);
      compareInteger(inpaintIssues, 'Processing raster height', processing.height, expected.height);
    }
  }

  metadataIssues.push(...inpaintIssues);
  return {
    workflowEmbedded,
    inpaintMetadataValid: inpaintIssues.length === 0,
    metadataIssues,
  };
}
