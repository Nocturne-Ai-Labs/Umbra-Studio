import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import {
  appendUmbraUiControlPreprocessorGraph,
  readComfyNodeInputChoices,
  toComfyNodeInputChoice,
  UmbraUiInpaintService,
  validateUmbraUiInpaintLayerProviderContract,
  type UmbraUiInpaintControlLayer,
  type UmbraUiInpaintRegionalGuidance,
  type UmbraUiInpaintReferenceLayer,
  type UmbraUiInpaintSettings,
} from './UmbraUiInpaintService';

const baseSettings: UmbraUiInpaintSettings = {
  workflowId: 'test',
  canvasProjectId: 'project-test',
  operationMode: 'inpaint',
  generationRegionX: 0,
  generationRegionY: 0,
  generationRegionWidth: 1024,
  generationRegionHeight: 1024,
  submissionRegionX: 0,
  submissionRegionY: 0,
  submissionRegionWidth: 1024,
  submissionRegionHeight: 1024,
  modelFamily: 'Test Family',
  modelSource: 'diffusion_model',
  inpaintAdapter: 'classic_conditioning',
  adapterModelName: '',
  prompt: 'repair the masked area',
  negativePrompt: '',
  checkpointName: 'model.safetensors',
  clipSkip: 1,
  seed: 42,
  steps: 20,
  cfg: 2.5,
  samplerName: 'euler',
  scheduler: 'simple',
  denoise: 0.8,
  samples: 1,
  width: 1024,
  height: 1024,
  maskGrow: 0,
  maskFeather: 0,
  canvasMaskGrow: 0,
  canvasMaskFeather: 0,
  contextPadding: 0,
  processingScaleMode: 'none',
  processingWidth: 1024,
  processingHeight: 1024,
  coherenceMode: 'none',
  coherenceEdgeSize: 16,
  coherenceMinimumDenoise: 0,
  fillMode: 'neutral',
  infillColor: '#7f7f7f',
  infillTileSize: 32,
  inpaintModelName: '',
  seamlessX: false,
  seamlessY: false,
  outputOnlyMaskedRegions: false,
  colorMatch: 0,
  differentialStrength: 1,
  softInpaintEnabled: false,
  softInpaintPreservation: 0.5,
  softInpaintTransitionContrast: 2,
  softInpaintMaskInfluence: 0.25,
  regionalGuidance: [],
  controlLayers: [],
  referenceLayers: [],
};

function buildService() {
  return new UmbraUiInpaintService({
    getComfyBaseUrl: () => 'http://127.0.0.1:8188',
    buildBaseWorkflow: async () => ({ promptGraph: {} }),
  }) as unknown as {
    buildWorkflow: (
      graph: Record<string, unknown>,
      sourceInputName: string,
      maskInputName: string,
      regionalGuidance: Array<Omit<UmbraUiInpaintRegionalGuidance, 'mask'> & { maskInputName: string }>,
      controlLayers: Array<Omit<UmbraUiInpaintControlLayer, 'image'> & { imageInputName: string }>,
      referenceLayers: Array<Omit<UmbraUiInpaintReferenceLayer, 'image'> & { imageInputName: string }>,
      sourceName: string,
      settings: UmbraUiInpaintSettings,
      seed: number,
      nodeTypes: Set<string>,
    ) => Record<string, any>;
  };
}

function splitPipelineGraph(kind: 'qwen' | 'flux') {
  const positiveClass = kind === 'flux' ? 'CLIPTextEncodeFlux' : 'UmbraA1111LoraSyntax';
  return {
    '1': { class_type: 'UmbraLoadCheckpoint', inputs: {} },
    '2': { class_type: 'UmbraPowerPrompterReader', inputs: {} },
    '3': { class_type: kind === 'flux' ? 'DualCLIPLoader' : 'CLIPLoader', inputs: {} },
    '4': { class_type: 'VAELoader', inputs: {} },
    '5': {
      class_type: 'UmbraA1111LoraSyntax',
      inputs: { model: ['1', 0], clip: ['3', 0], prompt_text: ['2', 0] },
      ...(kind === 'qwen' ? { _meta: { umbra_role: 'inpaint_regional_clip_source', umbra_output_index: 1 } } : {}),
    },
    '6': {
      class_type: positiveClass,
      inputs: kind === 'flux'
        ? { clip: ['5', 1], clip_l: ['5', 2], t5xxl: ['5', 2], guidance: 3.5 }
        : { model: ['1', 0], clip: ['3', 0], prompt_text: ['2', 0] },
      ...(kind === 'flux' ? { _meta: { umbra_role: 'inpaint_regional_positive_encoder' } } : {}),
    },
    '7': kind === 'flux'
      ? { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['6', 0] } }
      : { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['5', 1] } },
    '8': kind === 'qwen'
      ? { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['5', 0], shift: 3.1 } }
      : { class_type: 'EmptySD3LatentImage', inputs: {} },
    '9': {
      class_type: 'UmbraKSamplerHiResFix',
      inputs: {
        model: kind === 'qwen' ? ['8', 0] : ['5', 0],
        vae: ['4', 0],
        positive: kind === 'qwen' ? ['5', 3] : ['6', 0],
        negative: ['7', 0],
      },
      _meta: kind === 'qwen'
        ? {
          umbra_regional_method: 'clip_masked_conditioning',
          umbra_regional_positive_input: 'positive',
          umbra_regional_negative_input: 'negative',
        }
        : {
          umbra_regional_method: 'flux_text_encode_masked_conditioning',
          umbra_regional_positive_input: 'positive',
        },
    },
  };
}

const baseNodeTypes = new Set([
  'LoadImage',
  'LoadImageMask',
  'InpaintModelConditioning',
  'ControlNetLoader',
  'ControlNetInpaintingAliMamaApply',
  'VAEEncode',
  'SetLatentNoiseMask',
  'KSampler',
  'VAEDecode',
  'ImageCompositeMasked',
  'UmbraLabSaveImage',
  'DifferentialDiffusion',
  'INPAINT_LoadInpaintModel',
  'INPAINT_InpaintWithModel',
  'INPAINT_ExpandMask',
  'INPAINT_ColorMatch',
  'InvertMask',
  'JoinImageWithAlpha',
  'EmptyImage',
  'UmbraTileInfill',
  'UmbraSeamlessTiling',
  'UmbraSoftInpaintComposite',
  'ReferenceLatent',
  'TextEncodeQwenImageEditPlus',
  'HiDreamO1ReferenceImages',
]);

describe('UmbraUiInpaintService graph providers', () => {
  test('reads model choices from legacy and current ComfyUI input descriptors', () => {
    expect(readComfyNodeInputChoices([
      ['models\\legacy.safetensors'],
      { multiselect: false },
    ])).toEqual(['models/legacy.safetensors']);
    expect(readComfyNodeInputChoices([
      'COMBO',
      { multiselect: false, options: ['MAT_Places512_G_fp16.safetensors'] },
    ])).toEqual(['MAT_Places512_G_fp16.safetensors']);
    expect(readComfyNodeInputChoices(['STRING', { default: '' }])).toEqual([]);
    expect(toComfyNodeInputChoice('control-LoRAs-rank128/control-lora-canny-rank128.safetensors'))
      .toBe(['control-LoRAs-rank128', 'control-lora-canny-rank128.safetensors'].join(sep));
    expect(toComfyNodeInputChoice('nested\\model.safetensors'))
      .toBe(['nested', 'model.safetensors'].join(sep));
  });

  test('builds one canonical graph contract for every control preprocessor', () => {
    const defaults = {
      processorResolution: 768,
      lowThreshold: 220,
      highThreshold: 40,
      detectBody: true,
      detectFace: false,
      detectHands: true,
      maxFaces: 10,
      minimumConfidence: 0.5,
      scoreThreshold: 0.1,
      distanceThreshold: 0.1,
      normalStrength: Math.PI * 2,
      backgroundThreshold: 0.1,
      safeMode: true,
      processorSeed: 42,
    };
    const expectedClasses = {
      canny: 'CannyEdgePreprocessor',
      depth: 'DepthAnythingV2Preprocessor',
      pose: 'DWPreprocessor',
      lineart: 'LineArtPreprocessor',
      lineart_anime: 'AnimeLineArtPreprocessor',
      softedge: 'HEDPreprocessor',
      scribble: 'FakeScribblePreprocessor',
      face_mesh: 'MediaPipe-FaceMeshPreprocessor',
      mlsd: 'M-LSDPreprocessor',
      normal_map: 'MiDaS-NormalMapPreprocessor',
      pidi: 'PiDiNetPreprocessor',
      content_shuffle: 'ShufflePreprocessor',
    } as const;
    for (const [controlType, classType] of Object.entries(expectedClasses)) {
      const graph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
      const result = appendUmbraUiControlPreprocessorGraph(graph, ['1', 0], {
        ...defaults,
        controlType: controlType as keyof typeof expectedClasses,
      });
      expect(result).toEqual(['2', 0]);
      expect(graph['2'].class_type).toBe(classType);
      expect(graph['2'].inputs.image).toEqual(['1', 0]);
      expect(graph['2'].inputs.resolution).toBe(768);
    }
    const cannyGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    appendUmbraUiControlPreprocessorGraph(cannyGraph, ['1', 0], { ...defaults, controlType: 'canny' });
    expect(cannyGraph['2'].inputs).toMatchObject({ low_threshold: 40, high_threshold: 220 });
    const zeroCannyGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    appendUmbraUiControlPreprocessorGraph(zeroCannyGraph, ['1', 0], {
      ...defaults,
      controlType: 'canny',
      lowThreshold: 0,
      highThreshold: 0,
    });
    expect(zeroCannyGraph['2'].inputs).toMatchObject({ low_threshold: 0, high_threshold: 0 });
    const faceMeshGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    appendUmbraUiControlPreprocessorGraph(faceMeshGraph, ['1', 0], {
      ...defaults,
      controlType: 'face_mesh',
      maxFaces: 7,
      minimumConfidence: 0.75,
    });
    expect(faceMeshGraph['2'].inputs).toMatchObject({ max_faces: 7, min_confidence: 0.75 });
    const mlsdGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    appendUmbraUiControlPreprocessorGraph(mlsdGraph, ['1', 0], {
      ...defaults,
      controlType: 'mlsd',
      scoreThreshold: 0.35,
      distanceThreshold: 4.5,
    });
    expect(mlsdGraph['2'].inputs).toMatchObject({ score_threshold: 0.35, dist_threshold: 4.5 });
    const normalGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    appendUmbraUiControlPreprocessorGraph(normalGraph, ['1', 0], {
      ...defaults,
      controlType: 'normal_map',
      normalStrength: 3.5,
      backgroundThreshold: 0.25,
    });
    expect(normalGraph['2'].inputs).toMatchObject({ a: 3.5, bg_threshold: 0.25 });
    const zeroNormalGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    appendUmbraUiControlPreprocessorGraph(zeroNormalGraph, ['1', 0], {
      ...defaults,
      controlType: 'normal_map',
      normalStrength: 0,
      backgroundThreshold: 0,
    });
    expect(zeroNormalGraph['2'].inputs).toMatchObject({ a: 0, bg_threshold: 0 });
    const pidiGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    appendUmbraUiControlPreprocessorGraph(pidiGraph, ['1', 0], { ...defaults, controlType: 'pidi', safeMode: false });
    expect(pidiGraph['2'].inputs.safe).toBe('disable');
    const shuffleGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    appendUmbraUiControlPreprocessorGraph(shuffleGraph, ['1', 0], { ...defaults, controlType: 'content_shuffle', processorSeed: 8675309 });
    expect(shuffleGraph['2'].inputs.seed).toBe(8675309);
    const rawGraph: Record<string, any> = { '1': { class_type: 'LoadImage', inputs: {} } };
    expect(appendUmbraUiControlPreprocessorGraph(rawGraph, ['1', 0], { ...defaults, controlType: 'raw' })).toEqual(['1', 0]);
    expect(Object.keys(rawGraph)).toEqual(['1']);
  });

  test('rejects control and reference semantics that the classic graph does not implement', () => {
    const control: UmbraUiInpaintControlLayer = {
      id: 'control-1',
      name: 'Character pose',
      image: { name: 'control.png', read: async () => new Uint8Array([1]) },
      adapterType: 'control_lora',
      controlMode: 'balanced',
      controlType: 'raw',
      modelName: 'control.safetensors',
      weight: 1,
      beginStepPercent: 0,
      endStepPercent: 1,
      processorResolution: 512,
      lowThreshold: 100,
      highThreshold: 200,
      detectBody: true,
      detectFace: true,
      detectHands: true,
      maxFaces: 10,
      minimumConfidence: 0.5,
      scoreThreshold: 0.1,
      distanceThreshold: 0.1,
      normalStrength: Math.PI * 2,
      backgroundThreshold: 0.1,
      safeMode: true,
      processorSeed: 0,
    };
    expect(() => validateUmbraUiInpaintLayerProviderContract([control], [])).not.toThrow();
    expect(() => validateUmbraUiInpaintLayerProviderContract([
      { ...control, adapterType: 't2i_adapter' },
    ], [])).not.toThrow();
    expect(() => validateUmbraUiInpaintLayerProviderContract([
      { ...control, controlType: 'content_shuffle', adapterType: 'controlnet' },
    ], [])).toThrow('requires a T2I Adapter');
    expect(() => validateUmbraUiInpaintLayerProviderContract([
      { ...control, controlType: 'content_shuffle', adapterType: 't2i_adapter' },
    ], [])).not.toThrow();
    expect(() => validateUmbraUiInpaintLayerProviderContract([
      { ...control, adapterType: 'z_image_control' },
    ], [])).toThrow('z_image_control/balanced');
    expect(() => validateUmbraUiInpaintLayerProviderContract([
      { ...control, adapterType: 'controlnet', controlMode: 'more_control' },
    ], [])).toThrow('controlnet/more_control');
    expect(() => validateUmbraUiInpaintLayerProviderContract([
      { ...control, adapterType: 'anima_lllite' },
    ], [], 'classic_conditioning', 'SDXL')).toThrow('requires the Anima model family');
    expect(() => validateUmbraUiInpaintLayerProviderContract([
      { ...control, adapterType: 'anima_lllite' },
    ], [], 'classic_conditioning', 'Anima')).not.toThrow();

    const reference: UmbraUiInpaintReferenceLayer = {
      id: 'reference-1',
      name: 'Style source',
      image: { name: 'reference.png', read: async () => new Uint8Array([1]) },
      method: 'flux_redux',
      modelName: '',
      visionModelName: '',
      crop: 'center',
      strengthType: 'multiply',
      weight: 1,
    };
    expect(() => validateUmbraUiInpaintLayerProviderContract([], [reference])).toThrow('flux_redux');
    expect(() => validateUmbraUiInpaintLayerProviderContract([], [reference], 'flux_fill', 'FLUX.1')).not.toThrow();
    expect(() => validateUmbraUiInpaintLayerProviderContract(
      [],
      [{ ...reference, method: 'style_model' }],
      'flux_fill',
      'FLUX.1',
    )).toThrow('only accepts FLUX Redux');
    expect(() => validateUmbraUiInpaintLayerProviderContract(
      [{ ...control, adapterType: 'controlnet' }],
      [],
      'flux_fill',
      'FLUX.1',
    )).toThrow('does not declare compatible canvas control layers');
    expect(() => validateUmbraUiInpaintLayerProviderContract(
      [{ ...control, adapterType: 'control_lora', controlMode: 'balanced' }],
      [{ ...reference, method: 'style_model' }],
    )).not.toThrow();
    expect(() => validateUmbraUiInpaintLayerProviderContract(
      [],
      [{ ...reference, method: 'ip_adapter' }],
      'classic_conditioning',
      'Illustrious XL',
    )).not.toThrow();
  });

  test('patches a classic SDXL model chain through the exact IP Adapter contract', () => {
    const reference = {
      id: 'reference-classic-ip',
      name: 'Classic Character Identity',
      imageInputName: 'character.png',
      maskInputName: 'character-mask.png',
      method: 'ip_adapter' as const,
      modelName: 'ip-adapter_sdxl_vit-h.safetensors',
      visionModelName: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
      crop: 'center' as const,
      strengthType: 'multiply' as const,
      weight: 0.65,
      beginStepPercent: 0.15,
      endStepPercent: 0.8,
      ipAdapterWeightType: 'style transfer' as const,
      ipAdapterCombineEmbeds: 'average' as const,
      ipAdapterEmbedsScaling: 'V only' as const,
    };
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [reference],
      'source.png',
      {
        ...baseSettings,
        modelFamily: 'Illustrious XL',
        checkpointName: 'Illustrious-XL-v2.0.safetensors',
        differentialStrength: 0,
      },
      42,
      new Set([
        ...baseNodeTypes,
        'IPAdapterModelLoader',
        'CLIPVisionLoader',
        'IPAdapterAdvanced',
      ]),
    );
    const modelLoader = Object.entries(graph).find(([, node]) => node.class_type === 'IPAdapterModelLoader');
    const visionLoader = Object.entries(graph).find(([, node]) => node.class_type === 'CLIPVisionLoader');
    const mask = Object.entries(graph).find(([, node]) => node._meta?.title === 'Classic Character Identity IP Adapter Influence Mask');
    const apply = Object.entries(graph).find(([, node]) => node.class_type === 'IPAdapterAdvanced');
    const sampler = Object.values(graph).find((node) => node.class_type === 'KSampler');
    expect(modelLoader?.[1]?.inputs.ipadapter_file).toBe(reference.modelName);
    expect(visionLoader?.[1]?.inputs.clip_name).toBe(reference.visionModelName);
    expect(mask?.[1]?.inputs).toEqual({ image: 'character-mask.png', channel: 'red' });
    expect(apply?.[1]?.inputs).toMatchObject({
      ipadapter: [modelLoader?.[0], 0],
      image: expect.any(Array),
      weight: 0.65,
      weight_type: 'style transfer',
      combine_embeds: 'average',
      start_at: 0.15,
      end_at: 0.8,
      embeds_scaling: 'V only',
      clip_vision: [visionLoader?.[0], 0],
      attn_mask: [mask?.[0], 0],
    });
    expect(sampler?.inputs?.model).toEqual([apply?.[0], 0]);
  });

  test('rejects an SDXL IP Adapter on an SD 1.5 classic pipeline', () => {
    expect(() => buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [{
        id: 'reference-mismatch',
        name: 'Mismatched Identity',
        imageInputName: 'character.png',
        method: 'ip_adapter' as const,
        modelName: 'ip-adapter_sdxl_vit-h.safetensors',
        visionModelName: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        crop: 'center' as const,
        strengthType: 'multiply' as const,
        weight: 0.65,
        beginStepPercent: 0,
        endStepPercent: 1,
        ipAdapterWeightType: 'linear' as const,
        ipAdapterCombineEmbeds: 'concat' as const,
        ipAdapterEmbedsScaling: 'V only' as const,
      }],
      'source.png',
      {
        ...baseSettings,
        modelFamily: 'Stable Diffusion 1.5',
        checkpointName: 'sd15-v1-5.safetensors',
      },
      42,
      baseNodeTypes,
    )).toThrow('selected model pipeline is SD 1.5');
  });

  test('patches the Anima model chain through the exact LLLite contract', () => {
    const control = {
      id: 'control-lllite',
      name: 'Anima Pose',
      imageInputName: 'pose.png',
      adapterType: 'anima_lllite' as const,
      controlMode: 'balanced' as const,
      controlType: 'raw' as const,
      modelName: 'anima_pose_lllite.safetensors',
      weight: 0.65,
      beginStepPercent: 0.15,
      endStepPercent: 0.8,
      processorResolution: 768,
      lowThreshold: 100,
      highThreshold: 200,
      detectBody: true,
      detectFace: true,
      detectHands: true,
      maxFaces: 10,
      minimumConfidence: 0.5,
      scoreThreshold: 0.1,
      distanceThreshold: 0.1,
      normalStrength: Math.PI * 2,
      backgroundThreshold: 0.1,
      safeMode: true,
      processorSeed: 0,
    };
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [control],
      [],
      'source.png',
      { ...baseSettings, modelFamily: 'Anima', modelSource: 'checkpoint', differentialStrength: 0 },
      42,
      new Set([...baseNodeTypes, 'AnimaLLLiteApply']),
    );
    const apply = Object.entries(graph).find(([, node]) => node.class_type === 'AnimaLLLiteApply');
    const controlImage = Object.entries(graph).find(([, node]) => node._meta?.title === 'Anima Pose Control Image');
    const mask = Object.entries(graph).find(([, node]) => node._meta?.title === 'Umbra Inpaint Mask');
    const sampler = Object.values(graph).find((node) => node.class_type === 'KSampler');
    expect(apply?.[1]?.inputs).toMatchObject({
      model: ['8', 0],
      lllite_name: control.modelName,
      image: [controlImage?.[0], 0],
      strength: 0.65,
      start_percent: 0.15,
      end_percent: 0.8,
      preserve_wrapper: true,
      mask: [mask?.[0], 0],
    });
    expect(sampler?.inputs?.model).toEqual([apply?.[0], 0]);
    expect(Object.values(graph).some((node) => node.class_type === 'ControlNetApplyAdvanced')).toBe(false);
  });

  test('builds Qwen Image through its dedicated inpainting ControlNet contract', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      {
        ...baseSettings,
        inpaintAdapter: 'qwen_image_controlnet',
        adapterModelName: 'Qwen-Image-InstantX-ControlNet-Inpainting.safetensors',
      },
      42,
      baseNodeTypes,
    );
    const nodes = Object.values(graph);
    expect(nodes.some((node) => node.class_type === 'ControlNetInpaintingAliMamaApply')).toBe(true);
    expect(nodes.some((node) => node.class_type === 'SetLatentNoiseMask')).toBe(true);
    expect(nodes.some((node) => node.class_type === 'InpaintModelConditioning')).toBe(false);
    const sampler = nodes.find((node) => node.class_type === 'KSampler');
    expect(sampler?.inputs?.model).toEqual(['8', 0]);
  });

  test('uses the declared Qwen CLIP contract for paired regional conditioning', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [{
        id: 'region-1', name: 'Subject', maskInputName: 'subject-mask.png',
        positivePrompt: 'ornate red coat', negativePrompt: 'blue coat', autoNegative: true,
        weight: 0.9, beginStepPercent: 0, endStepPercent: 1,
      }],
      [], [], 'source.png', {
        ...baseSettings,
        inpaintAdapter: 'qwen_image_controlnet',
        adapterModelName: 'Qwen-Image-InstantX-ControlNet-Inpainting.safetensors',
      }, 42, baseNodeTypes,
    );
    const encoders = Object.values(graph).filter((node) => node.class_type === 'CLIPTextEncode');
    const positive = encoders.find((node) => node._meta?.title === 'Subject Positive Prompt');
    const negative = encoders.find((node) => node._meta?.title === 'Subject Negative Prompt');
    const autoNegative = encoders.find((node) => node._meta?.title === 'Subject Auto-Negative Prompt');
    expect(positive?.inputs.clip).toEqual(['5', 1]);
    expect(negative?.inputs.clip).toEqual(['5', 1]);
    expect(autoNegative?.inputs.clip).toEqual(['5', 1]);
    expect(Object.values(graph).some((node) => node.class_type === 'InvertMask')).toBe(true);
  });

  test('builds FLUX Fill with classic mask conditioning and differential diffusion', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('flux'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      {
        ...baseSettings,
        operationMode: 'outpaint',
        inpaintAdapter: 'flux_fill',
        checkpointName: 'flux1-fill-dev.safetensors',
        softInpaintEnabled: true,
      },
      42,
      baseNodeTypes,
    );
    const nodes = Object.values(graph);
    expect(nodes.some((node) => node.class_type === 'InpaintModelConditioning')).toBe(true);
    expect(nodes.some((node) => node.class_type === 'DifferentialDiffusion')).toBe(true);
    expect(nodes.some((node) => node.class_type === 'ControlNetInpaintingAliMamaApply')).toBe(false);
    const sampler = nodes.find((node) => node.class_type === 'KSampler');
    const differential = Object.entries(graph).find(([, node]) => node.class_type === 'DifferentialDiffusion');
    expect(sampler?.inputs?.model).toEqual([differential?.[0], 0]);
    const save = nodes.find((node) => node.class_type === 'UmbraLabSaveImage');
    expect(save?.inputs?.output_folder).toBe('Umbra UI/outpainting');
    expect(save?.inputs?.filename_prefix).toContain('UmbraUI_Outpaint_');
  });

  test('applies FLUX Redux to FLUX Fill positive conditioning without changing its model contract', () => {
    const reference = {
      id: 'reference-flux-redux',
      name: 'Composition',
      imageInputName: 'composition.png',
      method: 'flux_redux' as const,
      modelName: 'flux1-redux-dev.safetensors',
      visionModelName: 'sigclip_vision_patch14_384.safetensors',
      crop: 'none' as const,
      strengthType: 'attn_bias' as const,
      weight: 0.7,
    };
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('flux'),
      'source.png',
      'mask.png',
      [],
      [],
      [reference],
      'source.png',
      { ...baseSettings, inpaintAdapter: 'flux_fill', checkpointName: 'flux1-fill-dev.safetensors' },
      42,
      baseNodeTypes,
    );
    const apply = Object.entries(graph).find(([, node]) => node.class_type === 'StyleModelApply');
    const style = Object.entries(graph).find(([, node]) => node.class_type === 'StyleModelLoader');
    const vision = Object.entries(graph).find(([, node]) => node.class_type === 'CLIPVisionLoader');
    const inpaintConditioning = Object.entries(graph).find(([, node]) => node.class_type === 'InpaintModelConditioning');
    const sampler = Object.values(graph).find((node) => node.class_type === 'KSampler');
    expect(style?.[1]?.inputs.style_model_name).toBe(reference.modelName);
    expect(vision?.[1]?.inputs.clip_name).toBe(reference.visionModelName);
    expect(apply?.[1]?.inputs).toMatchObject({
      conditioning: ['6', 0],
      strength: reference.weight,
      strength_type: reference.strengthType,
    });
    expect(inpaintConditioning?.[1]?.inputs?.positive).toEqual([apply?.[0], 0]);
    expect(sampler?.inputs?.positive).toEqual([inpaintConditioning?.[0], 0]);
  });

  test('clones the exact FLUX text encoder for positive-only regional conditioning', () => {
    const region = {
      id: 'region-1', name: 'Sky', maskInputName: 'sky-mask.png',
      positivePrompt: 'dramatic aurora sky', negativePrompt: '', autoNegative: false,
      weight: 0.75, beginStepPercent: 0.2, endStepPercent: 0.9,
    };
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('flux'),
      'source.png', 'mask.png', [region], [], [], 'source.png',
      { ...baseSettings, inpaintAdapter: 'flux_fill', checkpointName: 'flux1-fill-dev.safetensors' },
      42, baseNodeTypes,
    );
    const encoder = Object.values(graph).find((node) => node._meta?.title === 'Sky Positive Prompt');
    expect(encoder).toMatchObject({
      class_type: 'CLIPTextEncodeFlux',
      inputs: { clip_l: region.positivePrompt, t5xxl: region.positivePrompt, clip: ['5', 1] },
    });
    expect(() => buildService().buildWorkflow(
      splitPipelineGraph('flux'),
      'source.png', 'mask.png', [{ ...region, negativePrompt: 'flat sky' }], [], [], 'source.png',
      { ...baseSettings, inpaintAdapter: 'flux_fill', checkpointName: 'flux1-fill-dev.safetensors' },
      42, baseNodeTypes,
    )).toThrow('does not support negative regional prompts');
  });

  test('preserves an explicit zero CFG in the classic sampler contract', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('flux'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      { ...baseSettings, cfg: 0, inpaintAdapter: 'flux_fill', checkpointName: 'flux1-fill-dev.safetensors' },
      42,
      baseNodeTypes,
    );
    const sampler = Object.values(graph).find((node) => node.class_type === 'KSampler');
    expect(sampler?.inputs?.cfg).toBe(0);
  });

  test('applies regional auto-negative conditioning outside the positive mask', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [{
        id: 'face-region',
        name: 'Face',
        maskInputName: 'face-mask.png',
        positivePrompt: 'detailed eyes',
        negativePrompt: '',
        autoNegative: true,
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
      }],
      [],
      [],
      'source.png',
      baseSettings,
      42,
      baseNodeTypes,
    );
    const invertedMask = Object.entries(graph).find(([, node]) => node._meta?.title === 'Face Auto-Negative Inverted Mask');
    const autoNegativeMask = Object.entries(graph).find(([, node]) => node._meta?.title === 'Face Auto-Negative Mask');
    const autoNegativePrompt = Object.entries(graph).find(([, node]) => node._meta?.title === 'Face Auto-Negative Prompt');
    expect(invertedMask?.[1]?.class_type).toBe('InvertMask');
    expect(autoNegativePrompt?.[1]?.inputs.text).toBe('detailed eyes');
    expect(autoNegativeMask?.[1]?.inputs.mask).toEqual([invertedMask?.[0], 0]);
  });

  test('uses an installed LaMa or MAT model as a provider-compatible prefill stage', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      {
        ...baseSettings,
        modelSource: 'checkpoint',
        fillMode: 'lama',
        inpaintModelName: 'lama/big-lama.pt',
      },
      99,
      baseNodeTypes,
    );
    const nodes = Object.values(graph);
    const loader = Object.entries(graph).find(([, node]) => node.class_type === 'INPAINT_LoadInpaintModel');
    const fill = Object.entries(graph).find(([, node]) => node.class_type === 'INPAINT_InpaintWithModel');
    const conditioning = nodes.find((node) => node.class_type === 'InpaintModelConditioning');
    expect(loader?.[1]?.inputs?.model_name).toBe(['lama', 'big-lama.pt'].join(sep));
    expect(fill?.[1]?.inputs).toMatchObject({ inpaint_model: [loader?.[0], 0], seed: 99 });
    expect(conditioning?.inputs?.pixels).toEqual([fill?.[0], 0]);
  });

  test('keeps neutral fill on the original source latent because classic conditioning neutralizes its own concat image', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      { ...baseSettings, modelSource: 'checkpoint', fillMode: 'neutral' },
      42,
      baseNodeTypes,
    );
    const nodes = Object.entries(graph);
    const source = nodes.find(([, node]) => node._meta?.title === 'Umbra Inpaint Working Image');
    const conditioning = nodes.find(([, node]) => node.class_type === 'InpaintModelConditioning');
    expect(nodes.some(([, node]) => node.class_type === 'INPAINT_MaskedFill')).toBe(false);
    expect(conditioning?.[1]?.inputs?.pixels).toEqual([source?.[0], 0]);
  });

  test('uses one feathered mask for conditioning and adaptive soft compositing', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      {
        ...baseSettings,
        modelSource: 'checkpoint',
        maskGrow: 8,
        maskFeather: 32,
        softInpaintEnabled: true,
        softInpaintPreservation: 0.7,
        softInpaintTransitionContrast: 3.25,
        softInpaintMaskInfluence: 0.15,
      },
      42,
      baseNodeTypes,
    );
    const nodes = Object.entries(graph);
    const source = nodes.find(([, node]) => node._meta?.title === 'Umbra Inpaint Working Image');
    const expandedMask = nodes.find(([, node]) => node.class_type === 'INPAINT_ExpandMask');
    const conditioning = nodes.find(([, node]) => node.class_type === 'InpaintModelConditioning');
    const differential = nodes.find(([, node]) => node.class_type === 'DifferentialDiffusion');
    const composite = nodes.find(([, node]) => node.class_type === 'UmbraSoftInpaintComposite');

    expect(expandedMask?.[1]?.inputs).toMatchObject({ grow: 8, blur: 32, blur_type: 'gaussian' });
    expect(conditioning?.[1]?.inputs?.mask).toEqual([expandedMask?.[0], 0]);
    expect(differential).toBeDefined();
    expect(composite?.[1]?.inputs).toMatchObject({
      original: [source?.[0], 0],
      mask: [expandedMask?.[0], 0],
      preservation: 0.7,
      transition_contrast: 3.25,
      mask_influence: 0.15,
    });
    expect(nodes.some(([, node]) => node._meta?.title === 'Non-Destructive Inpaint Composite')).toBe(false);
  });

  test('uses the fixed masked composite when adaptive soft inpaint is disabled', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      { ...baseSettings, modelSource: 'checkpoint', softInpaintEnabled: false },
      42,
      baseNodeTypes,
    );
    const nodes = Object.values(graph);
    expect(nodes.some((node) => node.class_type === 'UmbraSoftInpaintComposite')).toBe(false);
    expect(nodes.some((node) => node.class_type === 'DifferentialDiffusion')).toBe(false);
    expect(nodes.some((node) => node._meta?.title === 'Non-Destructive Inpaint Composite')).toBe(true);
  });

  test('can save a transparent masked region without baking the source into the sample', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      { ...baseSettings, modelSource: 'checkpoint', outputOnlyMaskedRegions: true },
      42,
      baseNodeTypes,
    );
    const nodes = Object.entries(graph);
    const inverted = nodes.find(([, node]) => node.class_type === 'InvertMask');
    const alpha = nodes.find(([, node]) => node.class_type === 'JoinImageWithAlpha');
    const save = nodes.find(([, node]) => node.class_type === 'UmbraLabSaveImage');
    expect(alpha?.[1]?.inputs?.alpha).toEqual([inverted?.[0], 0]);
    expect(save?.[1]?.inputs?.images).toEqual([alpha?.[0], 0]);
    expect(nodes.some(([, node]) => node.class_type === 'ImageCompositeMasked')).toBe(false);
  });

  test('clips a semantic subject cutout to the generated region', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      {
        ...baseSettings,
        modelSource: 'checkpoint',
        outputOnlyMaskedRegions: true,
        semanticCutout: true,
      },
      42,
      new Set([
        ...baseNodeTypes,
        'Image Rembg (Remove Background)',
        'SplitImageWithAlpha',
        'MaskComposite',
      ]),
    );
    const nodes = Object.entries(graph);
    const inverted = nodes.find(([, node]) => node.class_type === 'InvertMask');
    const removeBackground = nodes.find(([, node]) => node.class_type === 'Image Rembg (Remove Background)');
    const split = nodes.find(([, node]) => node.class_type === 'SplitImageWithAlpha');
    const combined = nodes.find(([, node]) => node.class_type === 'MaskComposite');
    const alpha = nodes.find(([, node]) => node.class_type === 'JoinImageWithAlpha');
    const save = nodes.find(([, node]) => node.class_type === 'UmbraLabSaveImage');

    expect(removeBackground?.[1]?.inputs).toMatchObject({
      model: 'isnet-anime',
      transparency: true,
      only_mask: false,
    });
    expect(split?.[1]?.inputs?.image).toEqual([removeBackground?.[0], 0]);
    expect(combined?.[1]?.inputs).toMatchObject({
      destination: [inverted?.[0], 0],
      source: [split?.[0], 1],
      operation: 'add',
    });
    expect(alpha?.[1]?.inputs).toEqual({
      image: [split?.[0], 0],
      alpha: [combined?.[0], 0],
    });
    expect(save?.[1]?.inputs?.images).toEqual([alpha?.[0], 0]);
    expect(nodes.some(([, node]) => node.class_type === 'ImageCompositeMasked')).toBe(false);
  });

  test('prefills the mask with an exact solid color before model conditioning', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      { ...baseSettings, modelSource: 'checkpoint', fillMode: 'color', infillColor: '#12abef' },
      42,
      baseNodeTypes,
    );
    const nodes = Object.entries(graph);
    const color = nodes.find(([, node]) => node.class_type === 'EmptyImage');
    const fill = nodes.find(([, node]) => node._meta?.title === 'Color Prefill Masked Area');
    const conditioning = nodes.find(([, node]) => node.class_type === 'InpaintModelConditioning');
    expect(color?.[1]?.inputs).toMatchObject({ width: 1024, height: 1024, color: 0x12abef });
    expect(fill?.[1]?.inputs?.source).toEqual([color?.[0], 0]);
    expect(conditioning?.[1]?.inputs?.pixels).toEqual([fill?.[0], 0]);
  });

  test('routes deterministic tile infill through the selected mask and seed', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      { ...baseSettings, modelSource: 'checkpoint', fillMode: 'tile', infillTileSize: 48 },
      31415,
      baseNodeTypes,
    );
    const nodes = Object.entries(graph);
    const fill = nodes.find(([, node]) => node.class_type === 'UmbraTileInfill');
    const mask = nodes.find(([, node]) => node.class_type === 'LoadImageMask');
    const conditioning = nodes.find(([, node]) => node.class_type === 'InpaintModelConditioning');
    expect(fill?.[1]?.inputs).toMatchObject({ mask: [mask?.[0], 0], tile_size: 48, seed: 31415 });
    expect(conditioning?.[1]?.inputs?.pixels).toEqual([fill?.[0], 0]);
  });

  test('patches both the classic model and VAE for axis-specific seamless generation', () => {
    const graph = buildService().buildWorkflow(
      splitPipelineGraph('qwen'),
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      {
        ...baseSettings,
        modelSource: 'checkpoint',
        seamlessX: true,
        seamlessY: false,
        softInpaintEnabled: true,
      },
      42,
      baseNodeTypes,
    );
    const nodes = Object.entries(graph);
    const seamless = nodes.find(([, node]) => node.class_type === 'UmbraSeamlessTiling');
    const differential = nodes.find(([, node]) => node.class_type === 'DifferentialDiffusion');
    const conditioning = nodes.find(([, node]) => node.class_type === 'InpaintModelConditioning');
    const decode = nodes.find(([, node]) => node.class_type === 'VAEDecode');
    expect(seamless?.[1]?.inputs).toMatchObject({ seamless_x: true, seamless_y: false });
    expect(differential?.[1]?.inputs?.model).toEqual([seamless?.[0], 0]);
    expect(conditioning?.[1]?.inputs?.vae).toEqual([seamless?.[0], 1]);
    expect(decode?.[1]?.inputs?.vae).toEqual([seamless?.[0], 1]);
  });

  test('binds native edit workflows only through explicit source and mask roles', () => {
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'GrowMask', inputs: { mask: ['2', 0], grow: 0, feather: 0 }, _meta: { umbra_role: 'inpaint_mask_processor' } },
        '4': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['3', 0], noise_seed: 1, denoise_strength: 1 }, _meta: { umbra_role: 'inpaint_sampler' } },
        '5': { class_type: 'UmbraLabSaveImage', inputs: { images: ['4', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png',
      'mask.png',
      [],
      [],
      [],
      'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit', maskGrow: 12, maskFeather: 6, denoise: 0.55 },
      8675309,
      baseNodeTypes,
    );
    expect(graph['1'].inputs.image).toBe('source.png');
    expect(graph['2'].inputs.image).toBe('mask.png');
    expect(graph['3'].inputs).toMatchObject({ grow: 12, feather: 6 });
    expect(graph['4'].inputs).toMatchObject({ noise_seed: 8675309, denoise_strength: 0.55 });
    expect(graph['4'].class_type).toBe('NativeEditSampler');
  });

  test('builds positive-only FLUX native regional guidance through its declared transform and sink', () => {
    const region = {
      id: 'region-1',
      name: 'Face',
      maskInputName: 'face-mask.png',
      positivePrompt: 'detailed expressive face',
      negativePrompt: '',
      autoNegative: false,
      weight: 0.85,
      beginStepPercent: 0.1,
      endStepPercent: 0.8,
    };
    const sourceGraph = {
      '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
      '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
      '3': { class_type: 'UmbraA1111LoraSyntax', inputs: {}, _meta: { umbra_role: 'inpaint_regional_clip_source', umbra_output_index: 1 } },
      '4': { class_type: 'NativeConditioning', inputs: {} },
      '5': {
        class_type: 'FluxGuidance',
        inputs: { conditioning: ['4', 0], guidance: 4 },
        _meta: { umbra_role: 'inpaint_regional_positive_transform' },
      },
      '6': { class_type: 'NativeLatent', inputs: {} },
      '7': {
        class_type: 'ReferenceLatent',
        inputs: { conditioning: ['5', 0], latent: ['6', 0] },
        _meta: {
          umbra_regional_method: 'flux_guidance_masked_conditioning',
          umbra_regional_positive_input: 'conditioning',
        },
      },
      '8': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0], conditioning: ['7', 0] }, _meta: { umbra_role: 'inpaint_sampler' } },
      '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] }, _meta: { umbra_role: 'inpaint_output' } },
    };
    const graph = buildService().buildWorkflow(
      sourceGraph,
      'source.png', 'mask.png', [region], [], [], 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const encoder = Object.entries(graph).find(([, node]) => node._meta?.title === 'Face Positive Prompt');
    const guidance = Object.entries(graph).find(([, node]) => node._meta?.title === 'Face FLUX Guidance');
    const range = Object.entries(graph).find(([, node]) => node._meta?.title === 'Face Positive Step Range');
    const mask = Object.entries(graph).find(([, node]) => node._meta?.title === 'Face Positive Mask');
    const combine = Object.entries(graph).find(([, node]) => node._meta?.title === 'Combine Face Positive');
    expect(encoder?.[1]).toMatchObject({ class_type: 'CLIPTextEncode', inputs: { text: region.positivePrompt, clip: ['3', 1] } });
    expect(guidance?.[1]).toMatchObject({ class_type: 'FluxGuidance', inputs: { conditioning: [encoder?.[0], 0], guidance: 4 } });
    expect(range?.[1]?.inputs).toEqual({ conditioning: [guidance?.[0], 0], start: 0.1, end: 0.8 });
    expect(mask?.[1]?.inputs).toMatchObject({ conditioning: [range?.[0], 0], strength: 0.85 });
    expect(combine?.[1]?.inputs).toEqual({ conditioning_1: ['5', 0], conditioning_2: [mask?.[0], 0] });
    expect(graph['7'].inputs.conditioning).toEqual([combine?.[0], 0]);

    expect(() => buildService().buildWorkflow(
      sourceGraph,
      'source.png', 'mask.png', [{ ...region, negativePrompt: 'deformed face' }], [], [], 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    )).toThrow('does not support negative regional prompts');
  });

  test('builds paired HiDream native regional guidance and auto-negative through its reference sink', () => {
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'UmbraA1111LoraSyntax', inputs: {}, _meta: { umbra_role: 'inpaint_regional_clip_source', umbra_output_index: 1 } },
        '4': { class_type: 'PositiveConditioning', inputs: {} },
        '5': { class_type: 'NegativeConditioning', inputs: {} },
        '6': {
          class_type: 'HiDreamO1ReferenceImages',
          inputs: { positive: ['4', 0], negative: ['5', 0], image_1: ['1', 0] },
          _meta: {
            umbra_role: 'inpaint_reference_sink',
            umbra_reference_method: 'hidream_o1_reference',
            umbra_regional_method: 'clip_masked_conditioning',
            umbra_regional_positive_input: 'positive',
            umbra_regional_negative_input: 'negative',
          },
        },
        '7': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0], positive: ['6', 0], negative: ['6', 1] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '8': { class_type: 'SaveImage', inputs: { images: ['7', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png',
      'mask.png',
      [{
        id: 'region-1', name: 'Outfit', maskInputName: 'outfit-mask.png',
        positivePrompt: 'red formal dress', negativePrompt: 'casual clothes', autoNegative: true,
        weight: 1, beginStepPercent: 0, endStepPercent: 1,
      }],
      [], [], 'source.png', { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const positiveCombine = Object.entries(graph).find(([, node]) => node._meta?.title === 'Combine Outfit Positive');
    const negativeCombine = Object.entries(graph).find(([, node]) => node._meta?.title === 'Combine Outfit Negative');
    const autoNegativeCombine = Object.entries(graph).find(([, node]) => node._meta?.title === 'Combine Outfit Auto-Negative');
    const invertedMask = Object.entries(graph).find(([, node]) => node._meta?.title === 'Outfit Auto-Negative Inverted Mask');
    expect(positiveCombine?.[1]?.inputs.conditioning_1).toEqual(['4', 0]);
    expect(negativeCombine?.[1]?.inputs.conditioning_1).toEqual(['5', 0]);
    expect(autoNegativeCombine?.[1]?.inputs.conditioning_1).toEqual([negativeCombine?.[0], 0]);
    expect(invertedMask?.[1]?.class_type).toBe('InvertMask');
    expect(graph['6'].inputs.positive).toEqual([positiveCombine?.[0], 0]);
    expect(graph['6'].inputs.negative).toEqual([autoNegativeCombine?.[0], 0]);
  });

  test('rejects native regional guidance when the locked graph has no exact contract', () => {
    expect(() => buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '4': { class_type: 'SaveImage', inputs: { images: ['3', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [{
        id: 'region-1', name: 'Region', maskInputName: 'region.png', positivePrompt: 'detail', negativePrompt: '',
        autoNegative: false, weight: 1, beginStepPercent: 0, endStepPercent: 1,
      }], [], [], 'source.png', { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    )).toThrow('does not declare an exact regional-conditioning contract');
  });

  test('patches a declared native model sink with exact Z-Image control inputs', () => {
    const control = {
      id: 'control-1',
      name: 'Pose Guide',
      imageInputName: 'pose.png',
      adapterType: 'z_image_control' as const,
      controlMode: 'balanced' as const,
      controlType: 'raw' as const,
      modelName: 'z-image-control.safetensors',
      weight: 0.8,
      beginStepPercent: 0,
      endStepPercent: 1,
      processorResolution: 1024,
      lowThreshold: 100,
      highThreshold: 200,
      detectBody: true,
      detectFace: true,
      detectHands: true,
      maxFaces: 10,
      minimumConfidence: 0.5,
      scoreThreshold: 0.1,
      distanceThreshold: 0.1,
      normalStrength: Math.PI * 2,
      backgroundThreshold: 0.1,
      safeMode: true,
      processorSeed: 0,
    };
    expect(() => validateUmbraUiInpaintLayerProviderContract([], [], 'native_edit')).not.toThrow();
    expect(() => validateUmbraUiInpaintLayerProviderContract([{
      ...control,
      image: { name: 'pose.png', read: async () => new Uint8Array([1]) },
    }], [], 'native_edit')).not.toThrow();
    expect(() => validateUmbraUiInpaintLayerProviderContract([{
      ...control,
      beginStepPercent: 0.2,
      image: { name: 'pose.png', read: async () => new Uint8Array([1]) },
    }], [], 'native_edit')).toThrow('full fixed step range');
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'VAELoader', inputs: {}, _meta: { umbra_role: 'inpaint_control_vae' } },
        '4': { class_type: 'NativeModel', inputs: {} },
        '5': {
          class_type: 'ModelPassThrough',
          inputs: { model: ['4', 0] },
          _meta: { umbra_role: 'inpaint_control_model_sink', umbra_control_adapter: 'z_image_control', umbra_control_mode: 'balanced' },
        },
        '6': { class_type: 'NativeEditSampler', inputs: { model: ['5', 0], image: ['1', 0], mask: ['2', 0] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '7': { class_type: 'SaveImage', inputs: { images: ['6', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [], [control], [], 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const loader = Object.entries(graph).find(([, node]) => node.class_type === 'ModelPatchLoader');
    const apply = Object.entries(graph).find(([, node]) => node.class_type === 'ZImageFunControlnet');
    const controlImage = Object.entries(graph).find(([, node]) => node._meta?.title === 'Pose Guide Control Image');
    expect(loader?.[1]?.inputs.name).toBe(control.modelName);
    expect(apply?.[1]?.inputs).toMatchObject({
      model: ['4', 0],
      model_patch: [loader?.[0], 0],
      vae: ['3', 0],
      strength: 0.8,
      image: [controlImage?.[0], 0],
      inpaint_image: ['1', 0],
      mask: ['2', 0],
    });
    expect(graph['5'].inputs.model).toEqual([apply?.[0], 0]);
  });

  test('chains exact native references only through a declared sink and VAE binding', () => {
    const reference = {
      id: 'reference-1',
      name: 'Character Reference',
      imageInputName: 'reference.png',
      method: 'flux2_reference' as const,
      modelName: '',
      visionModelName: '',
      crop: 'center' as const,
      strengthType: 'multiply' as const,
      weight: 1,
    };
    expect(() => validateUmbraUiInpaintLayerProviderContract([], [{
      ...reference,
      image: { name: 'reference.png', read: async () => new Uint8Array([1]) },
    }], 'native_edit')).not.toThrow();
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'NativeConditioning', inputs: { text: 'edit this image' } },
        '4': { class_type: 'VAELoader', inputs: { vae_name: 'model.safetensors' }, _meta: { umbra_role: 'inpaint_reference_vae' } },
        '5': { class_type: 'BasicGuider', inputs: { model: ['7', 0], conditioning: ['3', 0] }, _meta: { umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'flux2_reference' } },
        '6': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0], guider: ['5', 0] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '7': { class_type: 'NativeModel', inputs: {} },
        '8': { class_type: 'UmbraLabSaveImage', inputs: { images: ['6', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png',
      'mask.png',
      [],
      [],
      [reference],
      'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' },
      42,
      baseNodeTypes,
    );
    const referenceNode = Object.entries(graph).find(([, node]) => node.class_type === 'ReferenceLatent');
    const encodeNode = Object.entries(graph).find(([, node]) => node.class_type === 'VAEEncode');
    const imageNode = Object.entries(graph).find(([, node]) => node._meta?.title === 'Character Reference Native Reference');
    expect(imageNode?.[1]?.inputs.image).toBe('reference.png');
    expect(encodeNode?.[1]?.inputs).toEqual({ pixels: [imageNode?.[0], 0], vae: ['4', 0] });
    expect(referenceNode?.[1]?.inputs).toEqual({ conditioning: ['3', 0], latent: [encodeNode?.[0], 0] });
    expect(graph['5'].inputs.conditioning).toEqual([referenceNode?.[0], 0]);
  });

  test('applies FLUX Redux through the built-in style-model conditioning contract', () => {
    const reference = {
      id: 'reference-1',
      name: 'Composition',
      imageInputName: 'composition.png',
      method: 'flux_redux' as const,
      modelName: 'flux1-redux-dev.safetensors',
      visionModelName: 'sigclip_vision_patch14_384.safetensors',
      crop: 'none' as const,
      strengthType: 'attn_bias' as const,
      weight: 0.7,
    };
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'FluxConditioning', inputs: {} },
        '4': { class_type: 'BasicGuider', inputs: { conditioning: ['3', 0] }, _meta: { umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'flux_redux' } },
        '5': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0], guider: ['4', 0] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '6': { class_type: 'SaveImage', inputs: { images: ['5', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [], [], [reference], 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const apply = Object.entries(graph).find(([, node]) => node.class_type === 'StyleModelApply');
    const style = Object.entries(graph).find(([, node]) => node.class_type === 'StyleModelLoader');
    const vision = Object.entries(graph).find(([, node]) => node.class_type === 'CLIPVisionLoader');
    expect(style?.[1]?.inputs.style_model_name).toBe(reference.modelName);
    expect(vision?.[1]?.inputs.clip_name).toBe(reference.visionModelName);
    expect(apply?.[1]?.inputs).toMatchObject({ conditioning: ['3', 0], strength: 0.7, strength_type: 'attn_bias' });
    expect(graph['4'].inputs.conditioning).toEqual([apply?.[0], 0]);
  });

  test('patches an exact IP Adapter model sink with persisted timing and embedding controls', () => {
    const reference = {
      id: 'reference-1',
      name: 'Character Identity',
      imageInputName: 'character.png',
      method: 'ip_adapter' as const,
      modelName: 'ip-adapter-plus_sdxl_vit-h.safetensors',
      visionModelName: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
      crop: 'center' as const,
      strengthType: 'multiply' as const,
      weight: 0.85,
      beginStepPercent: 0.1,
      endStepPercent: 0.75,
      ipAdapterWeightType: 'strong style transfer' as const,
      ipAdapterCombineEmbeds: 'average' as const,
      ipAdapterEmbedsScaling: 'K+V w/ C penalty' as const,
      maskInputName: 'character-mask.png',
    };
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'NativeModel', inputs: {} },
        '4': { class_type: 'ModelPassThrough', inputs: { model: ['3', 0] }, _meta: { umbra_role: 'inpaint_reference_model_sink', umbra_reference_method: 'ip_adapter' } },
        '5': { class_type: 'NativeEditSampler', inputs: { model: ['4', 0], image: ['1', 0], mask: ['2', 0] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '6': { class_type: 'SaveImage', inputs: { images: ['5', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [], [], [reference], 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const modelLoader = Object.entries(graph).find(([, node]) => node.class_type === 'IPAdapterModelLoader');
    const visionLoader = Object.entries(graph).find(([, node]) => node.class_type === 'CLIPVisionLoader');
    const apply = Object.entries(graph).find(([, node]) => node.class_type === 'IPAdapterAdvanced');
    const attentionMask = Object.entries(graph).find(([, node]) => node._meta?.title === 'Character Identity IP Adapter Influence Mask');
    expect(modelLoader?.[1]?.inputs.ipadapter_file).toBe(reference.modelName);
    expect(visionLoader?.[1]?.inputs.clip_name).toBe(reference.visionModelName);
    expect(apply?.[1]?.inputs).toMatchObject({
      model: ['3', 0],
      ipadapter: [modelLoader?.[0], 0],
      weight: 0.85,
      weight_type: 'strong style transfer',
      combine_embeds: 'average',
      start_at: 0.1,
      end_at: 0.75,
      embeds_scaling: 'K+V w/ C penalty',
      clip_vision: [visionLoader?.[0], 0],
      attn_mask: [attentionMask?.[0], 0],
    });
    expect(attentionMask?.[1]?.inputs).toEqual({ image: 'character-mask.png', channel: 'red' });
    expect(graph['4'].inputs.model).toEqual([apply?.[0], 0]);
  });

  test('preserves an explicit zero end step for reference timing', () => {
    const reference = {
      id: 'reference-zero',
      name: 'Zero Step Reference',
      imageInputName: 'reference.png',
      method: 'ip_adapter' as const,
      modelName: 'ip-adapter-plus_sdxl_vit-h.safetensors',
      visionModelName: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
      crop: 'center' as const,
      strengthType: 'multiply' as const,
      weight: 0.5,
      beginStepPercent: 0,
      endStepPercent: 0,
      ipAdapterWeightType: 'linear' as const,
      ipAdapterCombineEmbeds: 'concat' as const,
      ipAdapterEmbedsScaling: 'V only' as const,
    };
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'NativeModel', inputs: {} },
        '4': { class_type: 'ModelPassThrough', inputs: { model: ['3', 0] }, _meta: { umbra_role: 'inpaint_reference_model_sink', umbra_reference_method: 'ip_adapter' } },
        '5': { class_type: 'NativeEditSampler', inputs: { model: ['4', 0], image: ['1', 0], mask: ['2', 0] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '6': { class_type: 'SaveImage', inputs: { images: ['5', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [], [], [reference], 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const apply = Object.values(graph).find((node) => node.class_type === 'IPAdapterAdvanced');
    expect(apply?.inputs).toMatchObject({ start_at: 0, end_at: 0 });
  });

  test('binds Qwen references to both exact edit encoders while reserving image1 for the source', () => {
    const references = ['Face', 'Outfit'].map((name, index) => ({
      id: `reference-${index + 1}`,
      name,
      imageInputName: `${name.toLowerCase()}.png`,
      method: 'qwen_image_reference' as const,
      modelName: '',
      visionModelName: '',
      crop: 'center' as const,
      strengthType: 'multiply' as const,
      weight: 1,
    }));
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'QwenClip', inputs: {} },
        '4': { class_type: 'VAELoader', inputs: {} },
        '5': {
          class_type: 'TextEncodeQwenImageEditPlus',
          inputs: { clip: ['3', 0], vae: ['4', 0], prompt: 'edit', image1: ['1', 0], image2: ['1', 0] },
          _meta: { umbra_role: 'inpaint_reference_positive_encoder', umbra_reference_method: 'qwen_image_reference' },
        },
        '6': {
          class_type: 'TextEncodeQwenImageEditPlus',
          inputs: { clip: ['3', 0], vae: ['4', 0], prompt: '', image1: ['1', 0], image3: ['1', 0] },
          _meta: { umbra_role: 'inpaint_reference_negative_encoder', umbra_reference_method: 'qwen_image_reference' },
        },
        '7': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0], positive: ['5', 0], negative: ['6', 0] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '8': { class_type: 'SaveImage', inputs: { images: ['7', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [], [], references, 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const face = Object.entries(graph).find(([, node]) => node._meta?.title === 'Face Native Reference');
    const outfit = Object.entries(graph).find(([, node]) => node._meta?.title === 'Outfit Native Reference');
    expect(graph['5'].inputs).toMatchObject({ image1: ['1', 0], image2: [face?.[0], 0], image3: [outfit?.[0], 0] });
    expect(graph['6'].inputs).toMatchObject({ image1: ['1', 0], image2: [face?.[0], 0], image3: [outfit?.[0], 0] });
  });

  test('preserves Qwen source and extra references in cloned regional encoders', () => {
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'QwenClip', inputs: {} },
        '4': { class_type: 'VAELoader', inputs: {} },
        '5': {
          class_type: 'TextEncodeQwenImageEditPlus',
          inputs: { clip: ['3', 0], vae: ['4', 0], prompt: 'edit', image1: ['1', 0] },
          _meta: {
            umbra_role: 'inpaint_reference_positive_encoder',
            umbra_roles: ['inpaint_regional_positive_encoder'],
            umbra_reference_method: 'qwen_image_reference',
          },
        },
        '6': {
          class_type: 'TextEncodeQwenImageEditPlus',
          inputs: { clip: ['3', 0], vae: ['4', 0], prompt: '', image1: ['1', 0] },
          _meta: {
            umbra_role: 'inpaint_reference_negative_encoder',
            umbra_roles: ['inpaint_regional_negative_encoder'],
            umbra_reference_method: 'qwen_image_reference',
          },
        },
        '7': {
          class_type: 'NativeEditSampler',
          inputs: { image: ['1', 0], mask: ['2', 0], positive: ['5', 0], negative: ['6', 0] },
          _meta: {
            umbra_role: 'inpaint_sampler',
            umbra_regional_method: 'qwen_image_edit_masked_conditioning',
            umbra_regional_positive_input: 'positive',
            umbra_regional_negative_input: 'negative',
          },
        },
        '8': { class_type: 'SaveImage', inputs: { images: ['7', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png',
      'mask.png',
      [{
        id: 'region-1', name: 'Hands', maskInputName: 'hands-mask.png',
        positivePrompt: 'correct hands', negativePrompt: 'extra fingers', autoNegative: false,
        weight: 1, beginStepPercent: 0, endStepPercent: 1,
      }],
      [],
      [{
        id: 'reference-1', name: 'Character', imageInputName: 'character.png', method: 'qwen_image_reference',
        modelName: '', visionModelName: '', crop: 'center', strengthType: 'multiply', weight: 1,
      }],
      'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' },
      42,
      baseNodeTypes,
    );
    const reference = Object.entries(graph).find(([, node]) => node._meta?.title === 'Character Native Reference');
    const positiveRegion = Object.entries(graph).find(([, node]) => node._meta?.title === 'Hands Positive Prompt');
    const negativeRegion = Object.entries(graph).find(([, node]) => node._meta?.title === 'Hands Negative Prompt');
    expect(positiveRegion?.[1]).toMatchObject({
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { prompt: 'correct hands', image1: ['1', 0], image2: [reference?.[0], 0] },
    });
    expect(negativeRegion?.[1]).toMatchObject({
      class_type: 'TextEncodeQwenImageEditPlus',
      inputs: { prompt: 'extra fingers', image1: ['1', 0], image2: [reference?.[0], 0] },
    });
  });

  test('binds HiDream references through its native positive and negative conditioning sink', () => {
    const references = ['Subject', 'Style'].map((name, index) => ({
      id: `reference-${index + 1}`,
      name,
      imageInputName: `${name.toLowerCase()}.png`,
      method: 'hidream_o1_reference' as const,
      modelName: '',
      visionModelName: '',
      crop: 'center' as const,
      strengthType: 'multiply' as const,
      weight: 1,
    }));
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'PositiveConditioning', inputs: {} },
        '4': { class_type: 'NegativeConditioning', inputs: {} },
        '5': {
          class_type: 'HiDreamO1ReferenceImages',
          inputs: { positive: ['3', 0], negative: ['4', 0], image_1: ['1', 0], image_10: ['1', 0] },
          _meta: { umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'hidream_o1_reference' },
        },
        '6': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0], positive: ['5', 0], negative: ['5', 1] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '7': { class_type: 'SaveImage', inputs: { images: ['6', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [], [], references, 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const subject = Object.entries(graph).find(([, node]) => node._meta?.title === 'Subject Native Reference');
    const style = Object.entries(graph).find(([, node]) => node._meta?.title === 'Style Native Reference');
    expect(graph['5'].inputs).toMatchObject({
      positive: ['3', 0],
      negative: ['4', 0],
      'images.image_1': ['1', 0],
      'images.image_2': [subject?.[0], 0],
      'images.image_3': [style?.[0], 0],
    });
    expect(graph['5'].inputs['images.image_10']).toBeUndefined();
  });

  test('binds HiDream references through the current COMFY_AUTOGROW_V3 prompt paths', () => {
    const graph = buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'PositiveConditioning', inputs: {} },
        '4': { class_type: 'NegativeConditioning', inputs: {} },
        '5': {
          class_type: 'HiDreamO1ReferenceImages',
          inputs: {
            positive: ['3', 0],
            negative: ['4', 0],
            'images.image_1': ['1', 0],
            'images.image_10': ['1', 0],
          },
          _meta: { umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'hidream_o1_reference' },
        },
        '6': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0], positive: ['5', 0], negative: ['5', 1] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '7': { class_type: 'SaveImage', inputs: { images: ['6', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [], [], [{
        id: 'reference-1', name: 'Subject', imageInputName: 'subject.png', method: 'hidream_o1_reference',
        modelName: '', visionModelName: '', crop: 'center', strengthType: 'multiply', weight: 1,
      }], 'source.png', { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    );
    const subject = Object.entries(graph).find(([, node]) => node._meta?.title === 'Subject Native Reference');
    expect(graph['5'].inputs['images.image_1']).toEqual(['1', 0]);
    expect(graph['5'].inputs['images.image_2']).toEqual([subject?.[0], 0]);
    expect(graph['5'].inputs['images.image_10']).toBeUndefined();
    expect(graph['5'].inputs.images).toBeUndefined();
    expect(graph['5'].inputs.image_1).toBeUndefined();
  });

  test('rejects a HiDream reference sink that does not reserve image_1 for the source', () => {
    expect(() => buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png', channel: 'red' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'PositiveConditioning', inputs: {} },
        '4': { class_type: 'NegativeConditioning', inputs: {} },
        '5': {
          class_type: 'HiDreamO1ReferenceImages',
          inputs: { positive: ['3', 0], negative: ['4', 0], image_1: ['9', 0] },
          _meta: { umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'hidream_o1_reference' },
        },
        '6': { class_type: 'NativeEditSampler', inputs: { image: ['1', 0], mask: ['2', 0], positive: ['5', 0], negative: ['5', 1] }, _meta: { umbra_role: 'inpaint_sampler' } },
        '7': { class_type: 'SaveImage', inputs: { images: ['6', 0] }, _meta: { umbra_role: 'inpaint_output' } },
        '9': { class_type: 'LoadImage', inputs: { image: 'wrong.png' } },
      },
      'source.png', 'mask.png', [], [], [{
        id: 'reference-1', name: 'Reference', imageInputName: 'reference.png', method: 'hidream_o1_reference',
        modelName: '', visionModelName: '', crop: 'center', strengthType: 'multiply', weight: 1,
      }], 'source.png',
      { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    )).toThrow('reserve image_1');
  });

  test('rejects mixed native reference architectures and undeclared Qwen encoder pairs', () => {
    const source = { name: 'reference.png', read: async () => new Uint8Array([1]) };
    expect(() => validateUmbraUiInpaintLayerProviderContract([], [
      { id: '1', name: 'Qwen', image: source, method: 'qwen_image_reference', modelName: '', visionModelName: '', crop: 'center', strengthType: 'multiply', weight: 1 },
      { id: '2', name: 'HiDream', image: source, method: 'hidream_o1_reference', modelName: '', visionModelName: '', crop: 'center', strengthType: 'multiply', weight: 1 },
    ], 'native_edit')).toThrow('cannot mix');
    expect(() => buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'LoadImageMask', inputs: { image: 'placeholder-mask.png' }, _meta: { umbra_role: 'inpaint_mask' } },
        '3': { class_type: 'SaveImage', inputs: { images: ['1', 0] }, _meta: { umbra_role: 'inpaint_output' } },
      },
      'source.png', 'mask.png', [], [], [{
        id: '1', name: 'Qwen', imageInputName: 'reference.png', method: 'qwen_image_reference', modelName: '', visionModelName: '', crop: 'center', strengthType: 'multiply', weight: 1,
      }], 'source.png', { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    )).toThrow('paired positive and negative');
  });

  test('rejects native edit workflows that do not declare their mask role', () => {
    expect(() => buildService().buildWorkflow(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' }, _meta: { umbra_role: 'inpaint_source' } },
        '2': { class_type: 'SaveImage', inputs: { images: ['1', 0] } },
      },
      'source.png', 'mask.png', [], [], [], 'source.png', { ...baseSettings, inpaintAdapter: 'native_edit' }, 42, baseNodeTypes,
    )).toThrow('inpaint_mask');
  });

  test('hydrates completed jobs from the persistent job store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({
        version: 1,
        jobs: [{
          id: 'persisted-job',
          status: 'completed',
          sourceName: 'source.png',
          workflowId: 'test',
          prompt: 'restored',
          width: 512,
          height: 512,
          total: 1,
          completed: 1,
          failed: 0,
          createdAt: now,
          updatedAt: now,
          items: [{ id: '1', seed: 42, status: 'completed', promptId: 'prompt-1', outputs: [], error: '' }],
        }],
      }), 'utf8');
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      expect(service.listJobs()[0]).toMatchObject({ id: 'persisted-job', status: 'completed', completed: 1 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('recovers an interrupted Windows job-ledger replacement before hydration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    try {
      const stateRoot = join(root, 'UmbraUI');
      const statePath = join(stateRoot, 'inpaint-jobs.json');
      await mkdir(stateRoot, { recursive: true });
      const now = Date.now();
      await writeFile(`${statePath}.backup-interrupted`, JSON.stringify({ version: 1, jobs: [{
        id: 'recovered-ledger-job', status: 'completed', sourceName: 'source.png', workflowId: 'test', prompt: 'restored',
        width: 512, height: 512, total: 1, completed: 1, failed: 0, createdAt: now, updatedAt: now,
        items: [{ id: '1', seed: 42, status: 'completed', promptId: 'prompt-1', outputs: [], error: '' }],
      }] }), 'utf8');
      await writeFile(`${statePath}.write-abandoned.tmp`, '{"jobs":[]}', 'utf8');

      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });

      expect(service.getJob('recovered-ledger-job')).toMatchObject({ status: 'completed', completed: 1 });
      expect(JSON.parse(await readFile(statePath, 'utf8')).jobs[0].id).toBe('recovered-ledger-job');
      expect((await readdir(stateRoot)).some((name) => name.includes('atomic-backup') || name.includes('.backup-') || name.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('restores a valid job-ledger backup instead of trusting malformed final JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    try {
      const stateRoot = join(root, 'UmbraUI');
      const statePath = join(stateRoot, 'inpaint-jobs.json');
      await mkdir(stateRoot, { recursive: true });
      const now = Date.now();
      const committed = JSON.stringify({ version: 1, jobs: [{
        id: 'valid-backup-job', status: 'completed', sourceName: 'source.png', workflowId: 'test', prompt: 'restored',
        width: 512, height: 512, total: 1, completed: 1, failed: 0, createdAt: now, updatedAt: now,
        items: [{ id: '1', seed: 42, status: 'completed', promptId: 'prompt-1', outputs: [], error: '' }],
      }] });
      await writeFile(`${statePath}.backup-interrupted`, committed, 'utf8');
      await writeFile(statePath, '{"jobs":[', 'utf8');

      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });

      expect(service.getJob('valid-backup-job')).toMatchObject({ status: 'completed', completed: 1 });
      expect(JSON.parse(await readFile(statePath, 'utf8')).jobs[0].id).toBe('valid-backup-job');
      expect((await readdir(stateRoot)).some((name) => name.includes('atomic-backup') || name.includes('.backup-') || name.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('reconciles interrupted staging counts and preserves partial completed work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'staging-job', status: 'staging', sourceName: 'source.png', workflowId: 'test', prompt: 'restore',
        width: 512, height: 512, total: 2, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [
          { id: '1', seed: 1, status: 'completed', promptId: 'done', outputs: [{ filename: 'done.png', subfolder: '', type: 'output', fullpath: '' }], error: '' },
          { id: '2', seed: 2, status: 'staging', promptId: '', outputs: [], error: '' },
        ],
      }] }), 'utf8');
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      expect(service.getJob('staging-job')).toMatchObject({ status: 'partial', total: 2, completed: 1, failed: 1 });
      let repaired: any = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        repaired = JSON.parse(await readFile(statePath, 'utf8'));
        if (repaired?.jobs?.[0]?.status === 'partial') break;
        await Bun.sleep(10);
      }
      expect(repaired.jobs[0]).toMatchObject({ status: 'partial', total: 2, completed: 1, failed: 1 });
      expect(repaired.jobs[0].items[1]).toMatchObject({
        status: 'failed',
        error: 'Umbra restarted before this sample reached ComfyUI.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('preserves exact partial-job identities and outputs across repeated restart without resubmission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    const originalFetch = globalThis.fetch;
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'mixed-terminal-job', status: 'running', sourceName: 'source.png', workflowId: 'test', prompt: 'restore',
        width: 512, height: 512, total: 99, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [
          {
            id: 'sample-completed', seed: 101, status: 'completed', promptId: 'prompt-completed', error: '',
            outputs: [{ filename: 'completed.png', subfolder: 'Umbra UI/inpainting', type: 'output', fullpath: 'D:/output/completed.png' }],
          },
          {
            id: 'sample-failed', seed: 102, status: 'failed', promptId: 'prompt-failed', outputs: [], error: 'provider failed',
          },
        ],
      }] }), 'utf8');
      const calls: string[] = [];
      globalThis.fetch = (async (input: string | URL | Request) => {
        calls.push(String(input));
        return new Response('unexpected request', { status: 500 });
      }) as typeof fetch;
      const createService = () => new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });

      const first = createService().getJob('mixed-terminal-job');
      expect(first).toMatchObject({
        id: 'mixed-terminal-job', status: 'partial', total: 2, completed: 1, failed: 1,
        items: [
          {
            id: 'sample-completed', seed: 101, status: 'completed', promptId: 'prompt-completed',
            outputs: [{ fullpath: 'D:/output/completed.png' }],
          },
          {
            id: 'sample-failed', seed: 102, status: 'failed', promptId: 'prompt-failed', error: 'provider failed',
          },
        ],
      });
      let persisted: any = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        persisted = JSON.parse(await readFile(statePath, 'utf8'));
        if (persisted?.jobs?.[0]?.status === 'partial') break;
        await Bun.sleep(10);
      }
      const second = createService().getJob('mixed-terminal-job');
      expect(second).toEqual(first);
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('resumes already submitted samples from a partially staged job after restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    const originalFetch = globalThis.fetch;
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'partially-staged-job', status: 'staging', sourceName: 'source.png', workflowId: 'test', prompt: 'restore',
        width: 512, height: 512, total: 3, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [
          { id: '1', seed: 1, status: 'completed', promptId: 'prompt-complete', outputs: [{ filename: 'first.png', subfolder: 'Umbra UI/inpainting', type: 'output', fullpath: '' }], error: '' },
          { id: '2', seed: 2, status: 'queued', promptId: 'prompt-submitted', outputs: [], error: '' },
          { id: '3', seed: 3, status: 'staging', promptId: '', outputs: [], error: '' },
        ],
      }] }), 'utf8');
      const calls: string[] = [];
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/history/prompt-submitted')) {
          return Response.json({ 'prompt-submitted': {
            status: { status_str: 'success', completed: true },
            outputs: { save: { images: [{ filename: 'second.png', subfolder: 'Umbra UI/inpainting', type: 'output' }] } },
          } });
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        historyPollIntervalMs: 1,
        queueCheckIntervalMs: 1,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });

      for (let attempt = 0; attempt < 100 && service.getJob('partially-staged-job')?.status !== 'partial'; attempt += 1) {
        await Bun.sleep(2);
      }

      expect(service.getJob('partially-staged-job')).toMatchObject({
        status: 'partial',
        total: 3,
        completed: 2,
        failed: 1,
      });
      expect(service.getJob('partially-staged-job')?.items).toMatchObject([
        { id: '1', status: 'completed', outputs: [{ filename: 'first.png' }] },
        { id: '2', status: 'completed', outputs: [{ filename: 'second.png' }] },
        { id: '3', status: 'failed', error: 'Umbra restarted before this sample reached ComfyUI.' },
      ]);
      expect(calls.some((url) => url.endsWith('/prompt'))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('skips a malformed persisted job without hiding valid recovery records', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [
        { id: 'broken-job', status: 'completed', items: [{ outputs: null }] },
        {
          id: 'valid-job', status: 'completed', sourceName: 'source.png', workflowId: 'test', prompt: 'restore',
          width: 512, height: 512, total: 1, completed: 1, failed: 0, createdAt: now, updatedAt: now,
          items: [{ id: '1', seed: 1, status: 'completed', promptId: 'done', outputs: [], error: '' }],
        },
      ] }), 'utf8');
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      expect(service.listJobs().map((job) => job.id)).toEqual(['valid-job']);
      let repaired: any = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        repaired = JSON.parse(await readFile(statePath, 'utf8'));
        if (repaired?.jobs?.length === 1) break;
        await Bun.sleep(10);
      }
      expect(repaired.jobs.map((job: { id: string }) => job.id)).toEqual(['valid-job']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('runs a control preprocessor through Comfy and returns its preview bytes', async () => {
    const originalFetch = globalThis.fetch;
    let queuedGraph: Record<string, any> | null = null;
    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/object_info')) {
          return Response.json({ LoadImage: {}, PreviewImage: {}, CannyEdgePreprocessor: {} });
        }
        if (url.endsWith('/upload/image')) {
          return Response.json({ name: 'control_source.png', subfolder: 'umbra-ui-inpaint/control-preview-test' });
        }
        if (url.endsWith('/prompt')) {
          const body = JSON.parse(String(init?.body || '{}'));
          queuedGraph = body.prompt;
          return Response.json({ prompt_id: 'control-preview-prompt' });
        }
        if (url.endsWith('/history/control-preview-prompt')) {
          return Response.json({ 'control-preview-prompt': {
            status: { status_str: 'success', completed: true },
            outputs: { preview: { images: [{ filename: 'preview.png', subfolder: '', type: 'temp' }] } },
          } });
        }
        if (url.includes('/view?')) {
          return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      const result = await service.preprocessControl({
        name: 'source.png',
        read: async () => new Uint8Array([1, 2, 3]),
      }, {
        controlType: 'canny',
        processorResolution: 640,
        lowThreshold: 32,
        highThreshold: 160,
        detectBody: true,
        detectFace: true,
        detectHands: true,
        maxFaces: 10,
        minimumConfidence: 0.5,
        scoreThreshold: 0.1,
        distanceThreshold: 0.1,
        normalStrength: Math.PI * 2,
        backgroundThreshold: 0.1,
        safeMode: true,
        processorSeed: 0,
      });
      expect(Array.from(result.bytes)).toEqual([137, 80, 78, 71]);
      expect(result.contentType).toBe('image/png');
      expect(result.output).toMatchObject({ filename: 'preview.png', type: 'temp' });
      expect(Object.values(queuedGraph || {}).some((node: any) => node.class_type === 'CannyEdgePreprocessor' && node.inputs.resolution === 640)).toBe(true);
      expect(Object.values(queuedGraph || {}).some((node: any) => node.class_type === 'PreviewImage')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('upscales one canvas layer through a temporary preview without saving gallery output', async () => {
    const originalFetch = globalThis.fetch;
    let queuedGraph: Record<string, any> | null = null;
    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/object_info')) {
          return Response.json({
            LoadImage: {},
            PreviewImage: {},
            UmbraImageUpscale: { input: { required: { upscale_model: [['4x-Test.pth']] } } },
          });
        }
        if (url.endsWith('/upload/image')) {
          return Response.json({ name: 'layer_source.png', subfolder: 'umbra-ui-inpaint/layer-upscale-test' });
        }
        if (url.endsWith('/prompt')) {
          const body = JSON.parse(String(init?.body || '{}'));
          queuedGraph = body.prompt;
          return Response.json({ prompt_id: 'layer-upscale-prompt' });
        }
        if (url.endsWith('/history/layer-upscale-prompt')) {
          return Response.json({ 'layer-upscale-prompt': {
            status: { status_str: 'success', completed: true },
            outputs: { preview: { images: [{ filename: 'upscaled.png', subfolder: '', type: 'temp' }] } },
          } });
        }
        if (url.includes('/view?')) {
          return new Response(new Uint8Array([137, 80, 78, 71, 13]), { headers: { 'Content-Type': 'image/png' } });
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      const result = await service.upscaleLayer({
        name: 'paint.png',
        read: async () => new Uint8Array([1, 2, 3]),
      }, {
        modelName: '4x-Test.pth',
        maxDimension: 4096,
      });
      expect(Array.from(result.bytes)).toEqual([137, 80, 78, 71, 13]);
      expect(result.output).toMatchObject({ filename: 'upscaled.png', type: 'temp' });
      expect(queuedGraph?.['2']).toMatchObject({
        class_type: 'UmbraImageUpscale',
        inputs: { upscale_model: '4x-Test.pth', max_dimension: 4096, enabled: true },
      });
      expect(queuedGraph?.['3']).toMatchObject({ class_type: 'PreviewImage', inputs: { images: ['2', 0] } });
      expect(Object.values(queuedGraph || {}).some((node: any) => node.class_type === 'UmbraLabSaveImage')).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('removes a character background through a temporary transparent preview', async () => {
    const originalFetch = globalThis.fetch;
    let queuedGraph: Record<string, any> | null = null;
    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/object_info')) {
          return Response.json({
            LoadImage: {},
            PreviewImage: {},
            'Image Rembg (Remove Background)': {},
          });
        }
        if (url.endsWith('/upload/image')) {
          return Response.json({ name: 'character_source.png', subfolder: 'umbra-ui-inpaint/background-removal-test' });
        }
        if (url.endsWith('/prompt')) {
          const body = JSON.parse(String(init?.body || '{}'));
          queuedGraph = body.prompt;
          return Response.json({ prompt_id: 'background-removal-prompt' });
        }
        if (url.endsWith('/history/background-removal-prompt')) {
          return Response.json({ 'background-removal-prompt': {
            status: { status_str: 'success', completed: true },
            outputs: { preview: { images: [{ filename: 'character-cutout.png', subfolder: '', type: 'temp' }] } },
          } });
        }
        if (url.includes('/view?')) {
          return new Response(new Uint8Array([137, 80, 78, 71, 26]), { headers: { 'Content-Type': 'image/png' } });
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      const result = await service.removeBackground({
        name: 'character.png',
        read: async () => new Uint8Array([1, 2, 3]),
      }, { model: 'isnet-anime' });
      expect(Array.from(result.bytes)).toEqual([137, 80, 78, 71, 26]);
      expect(result.contentType).toBe('image/png');
      expect(result.output).toMatchObject({ filename: 'character-cutout.png', type: 'temp' });
      expect(queuedGraph?.['2']).toMatchObject({
        class_type: 'Image Rembg (Remove Background)',
        inputs: {
          images: ['1', 0],
          transparency: true,
          model: 'isnet-anime',
          post_processing: true,
          only_mask: false,
        },
      });
      expect(queuedGraph?.['3']).toMatchObject({ class_type: 'PreviewImage', inputs: { images: ['2', 0] } });
      expect(Object.values(queuedGraph || {}).some((node: any) => node.class_type === 'UmbraLabSaveImage')).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('submits a versioned recovery receipt with every generation control', async () => {
    const originalFetch = globalThis.fetch;
    let queuedBody: Record<string, any> | null = null;
    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/object_info')) {
          const objectInfo = Object.fromEntries([
            ...baseNodeTypes,
            ...Object.values(splitPipelineGraph('flux')).map((node: any) => node.class_type),
          ].map((nodeType) => [nodeType, {}]));
          objectInfo.StyleModelLoader = { input: { required: { style_model_name: [['flux1-redux-dev.safetensors']] } } };
          objectInfo.CLIPVisionLoader = { input: { required: { clip_name: [['sigclip_vision_patch14_384.safetensors']] } } };
          objectInfo.CLIPVisionEncode = {};
          objectInfo.StyleModelApply = {};
          return Response.json(objectInfo);
        }
        if (url.endsWith('/upload/image')) {
          return Response.json({ name: 'uploaded.png', subfolder: 'umbra-ui-inpaint/metadata-test' });
        }
        if (url.endsWith('/prompt')) {
          queuedBody = JSON.parse(String(init?.body || '{}'));
          return Response.json({ prompt_id: 'metadata-prompt' });
        }
        if (url.endsWith('/history/metadata-prompt')) {
          return Response.json({ 'metadata-prompt': {
            status: { status_str: 'success', completed: true },
            outputs: { save: { images: [{ filename: 'metadata.png', subfolder: 'Umbra UI/inpainting', type: 'output' }] } },
          } });
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const settings: UmbraUiInpaintSettings = {
        ...baseSettings,
        workflowId: 'flux-fill-test',
        canvasProjectId: 'canvas-metadata-test',
        modelFamily: 'FLUX.1',
        modelSource: 'diffusion_model',
        inpaintAdapter: 'flux_fill',
        adapterModelName: 'fill-adapter.safetensors',
        checkpointName: 'flux1-fill-dev.safetensors',
        negativePrompt: 'seams',
        clipSkip: 2,
        seed: 73,
        steps: 24,
        cfg: 1.25,
        samplerName: 'euler_ancestral',
        scheduler: 'simple',
        denoise: 0.71,
        samples: 1,
        maskGrow: 12,
        maskFeather: 6,
        canvasMaskGrow: 8,
        canvasMaskFeather: 4,
        generationRegionX: 32,
        generationRegionY: 48,
        generationRegionWidth: 768,
        generationRegionHeight: 896,
        submissionRegionX: 16,
        submissionRegionY: 24,
        submissionRegionWidth: 800,
        submissionRegionHeight: 944,
        contextPadding: 24,
        processingScaleMode: 'manual',
        processingWidth: 1280,
        processingHeight: 1536,
        coherenceMode: 'staged',
        coherenceEdgeSize: 28,
        coherenceMinimumDenoise: 0.2,
        fillMode: 'color',
        infillColor: '#123456',
        infillTileSize: 48,
        inpaintModelName: 'MAT.safetensors',
        seamlessX: false,
        seamlessY: false,
        outputOnlyMaskedRegions: true,
        colorMatch: 0.35,
        differentialStrength: 0.9,
        referenceLayers: [{
          id: 'receipt-redux-reference',
          name: 'Receipt Redux Reference',
          image: { name: 'reference.png', read: async () => new Uint8Array([7, 8, 9]) },
          method: 'flux_redux',
          modelName: 'flux1-redux-dev.safetensors',
          visionModelName: 'sigclip_vision_patch14_384.safetensors',
          crop: 'none',
          strengthType: 'multiply',
          weight: 0.7,
          beginStepPercent: 0,
          endStepPercent: 1,
          ipAdapterWeightType: 'style transfer',
          ipAdapterCombineEmbeds: 'average',
          ipAdapterEmbedsScaling: 'V only',
        }],
      };
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        historyPollIntervalMs: 1,
        buildBaseWorkflow: async () => ({ promptGraph: splitPipelineGraph('flux') }),
      });
      const job = await service.submit(
        { name: 'source.png', read: async () => new Uint8Array([1, 2, 3]) },
        { name: 'mask.png', read: async () => new Uint8Array([4, 5, 6]) },
        settings,
      );
      for (let attempt = 0; attempt < 50 && service.getJob(job.id)?.status !== 'completed'; attempt += 1) {
        await Bun.sleep(2);
      }

      expect(queuedBody?.extra_data?.extra_pnginfo?.umbra_inpaint).toMatchObject({
        version: 4,
        source: 'umbra_ui_inpaint',
        canvasProjectId: 'canvas-metadata-test',
        workflowId: 'flux-fill-test',
        modelFamily: 'FLUX.1',
        modelSource: 'diffusion_model',
        inpaintAdapter: 'flux_fill',
        adapterModelName: 'fill-adapter.safetensors',
        checkpointName: 'flux1-fill-dev.safetensors',
        generationRegion: { x: 32, y: 48, width: 768, height: 896 },
        submissionRegion: { x: 16, y: 24, width: 800, height: 944 },
        processing: { mode: 'manual', requestedWidth: 1280, requestedHeight: 1536, width: 1024, height: 1024 },
        negativePrompt: 'seams',
        seed: 73,
        steps: 24,
        cfg: 1.25,
        clipSkip: 2,
        samplerName: 'euler_ancestral',
        scheduler: 'simple',
        denoise: 0.71,
        samples: 1,
        maskGrow: 12,
        maskFeather: 6,
        canvasMaskGrow: 8,
        canvasMaskFeather: 4,
        contextPadding: 24,
        processingScaleMode: 'manual',
        processingWidth: 1280,
        processingHeight: 1536,
        coherenceMode: 'staged',
        coherenceEdgeSize: 28,
        coherenceMinimumDenoise: 0.2,
        fillMode: 'color',
        infillColor: '#123456',
        infillTileSize: 48,
        inpaintModelName: 'MAT.safetensors',
        seamlessX: false,
        seamlessY: false,
        outputOnlyMaskedRegions: true,
        colorMatch: 0.35,
        differentialStrength: 0.9,
        regionalGuidance: [],
        controlLayers: [],
        referenceLayers: [{
          id: 'receipt-redux-reference',
          name: 'Receipt Redux Reference',
          method: 'flux_redux',
          modelName: 'flux1-redux-dev.safetensors',
          visionModelName: 'sigclip_vision_patch14_384.safetensors',
          crop: 'none',
          strengthType: 'multiply',
          weight: 0.7,
          beginStepPercent: 0,
          endStepPercent: 1,
          ipAdapterWeightType: 'style transfer',
          ipAdapterCombineEmbeds: 'average',
          ipAdapterEmbedsScaling: 'V only',
          hasInfluenceMask: false,
        }],
      });
      expect(service.getJob(job.id)?.status).toBe('completed');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('resumes persisted running prompts from Comfy history after restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    const originalFetch = globalThis.fetch;
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'running-job', status: 'running', sourceName: 'source.png', workflowId: 'test', prompt: 'restore',
        width: 512, height: 512, total: 1, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [{ id: '1', seed: 1, status: 'running', promptId: 'prompt-running', outputs: [], error: '' }],
      }] }), 'utf8');
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/history/prompt-running')) {
          return Response.json({ 'prompt-running': {
            status: { status_str: 'success', completed: true },
            outputs: { save: { images: [{ filename: 'restored.png', subfolder: 'Umbra UI/inpainting', type: 'output' }] } },
          } });
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      for (let attempt = 0; attempt < 50 && service.getJob('running-job')?.status === 'running'; attempt += 1) {
        await Bun.sleep(5);
      }
      expect(service.getJob('running-job')).toMatchObject({ status: 'completed', completed: 1, failed: 0 });
      expect(service.getJob('running-job')?.items[0].outputs[0].filename).toBe('restored.png');
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('resumes a persisted queued prompt without resubmitting or disturbing unrelated queue work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    const originalFetch = globalThis.fetch;
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'queued-job', status: 'queued', sourceName: 'source.png', workflowId: 'test', prompt: 'restore',
        width: 512, height: 512, total: 1, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [{ id: '1', seed: 1, status: 'queued', promptId: 'prompt-queued', outputs: [], error: '' }],
      }] }), 'utf8');
      let historyChecks = 0;
      const calls: string[] = [];
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/history/prompt-queued')) {
          historyChecks += 1;
          if (historyChecks === 1) return Response.json({});
          return Response.json({ 'prompt-queued': {
            status: { status_str: 'success', completed: true },
            outputs: { save: { images: [{ filename: 'queued-restored.png', subfolder: 'Umbra UI/inpainting', type: 'output' }] } },
          } });
        }
        if (url.endsWith('/queue')) {
          return Response.json({
            queue_running: [[0, 'unrelated-running']],
            queue_pending: [[1, 'prompt-queued'], [2, 'unrelated-pending']],
          });
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        historyPollIntervalMs: 1,
        queueCheckIntervalMs: 1,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      for (let attempt = 0; attempt < 100 && service.getJob('queued-job')?.status !== 'completed'; attempt += 1) {
        await Bun.sleep(2);
      }
      expect(service.getJob('queued-job')).toMatchObject({ status: 'completed', completed: 1, failed: 0 });
      expect(service.getJob('queued-job')?.items[0].outputs[0].filename).toBe('queued-restored.png');
      expect(calls.some((url) => url.endsWith('/prompt'))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('fails a recovered prompt that vanished from both Comfy history and queue', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    const originalFetch = globalThis.fetch;
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'orphaned-job', status: 'running', sourceName: 'source.png', workflowId: 'test', prompt: 'restore',
        width: 512, height: 512, total: 1, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [{ id: '1', seed: 1, status: 'running', promptId: 'missing-prompt', outputs: [], error: '' }],
      }] }), 'utf8');
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/history/missing-prompt')) return Response.json({});
        if (url.endsWith('/queue')) return Response.json({ queue_running: [], queue_pending: [] });
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        historyPollIntervalMs: 1,
        queueCheckIntervalMs: 1,
        orphanedPromptGraceMs: 4,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      for (let attempt = 0; attempt < 100 && service.getJob('orphaned-job')?.status === 'running'; attempt += 1) {
        await Bun.sleep(2);
      }
      expect(service.getJob('orphaned-job')).toMatchObject({ status: 'failed', completed: 0, failed: 1 });
      expect(service.getJob('orphaned-job')?.items[0].error).toContain('no longer reports');
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('cancel deletes only its prompts and interrupts only when it owns the running prompt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    const originalFetch = globalThis.fetch;
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'cancel-job', status: 'running', sourceName: 'source.png', workflowId: 'test', prompt: 'cancel',
        width: 512, height: 512, total: 1, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [{ id: '1', seed: 1, status: 'running', promptId: 'owned-prompt', outputs: [], error: '' }],
      }] }), 'utf8');
      const calls: Array<{ url: string; method: string }> = [];
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || 'GET');
        calls.push({ url, method });
        if (url.endsWith('/queue') && method === 'GET') return Response.json({ queue_running: [[0, 'unrelated-prompt']] });
        return Response.json({});
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      await service.cancel('cancel-job');
      expect(calls.some((call) => call.url.endsWith('/queue') && call.method === 'POST')).toBe(true);
      expect(calls.some((call) => call.url.endsWith('/interrupt'))).toBe(false);
      expect(service.getJob('cancel-job')?.status).toBe('canceled');
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('cancel interrupts Comfy only when this job owns the running prompt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    const originalFetch = globalThis.fetch;
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'owned-cancel-job', status: 'running', sourceName: 'source.png', workflowId: 'test', prompt: 'cancel',
        width: 512, height: 512, total: 1, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [{ id: '1', seed: 1, status: 'running', promptId: 'owned-prompt', outputs: [], error: '' }],
      }] }), 'utf8');
      const calls: Array<{ url: string; method: string }> = [];
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || 'GET');
        calls.push({ url, method });
        if (url.endsWith('/queue') && method === 'GET') return Response.json({ queue_running: [[0, 'owned-prompt']] });
        return Response.json({});
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });
      await service.cancel('owned-cancel-job');
      expect(calls.some((call) => call.url.endsWith('/interrupt') && call.method === 'POST')).toBe(true);
      expect(service.getJob('owned-cancel-job')?.status).toBe('canceled');
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('cancel removes only a mixed job batch while preserving unrelated pending prompts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-jobs-'));
    const originalFetch = globalThis.fetch;
    try {
      const statePath = join(root, 'UmbraUI', 'inpaint-jobs.json');
      await mkdir(join(root, 'UmbraUI'), { recursive: true });
      const now = Date.now();
      await writeFile(statePath, JSON.stringify({ version: 1, jobs: [{
        id: 'mixed-cancel-job', status: 'running', sourceName: 'source.png', workflowId: 'test', prompt: 'cancel',
        width: 512, height: 512, total: 2, completed: 0, failed: 0, createdAt: now, updatedAt: now,
        items: [
          { id: '1', seed: 1, status: 'running', promptId: 'own-running', outputs: [], error: '' },
          { id: '2', seed: 2, status: 'queued', promptId: 'own-pending', outputs: [], error: '' },
        ],
      }] }), 'utf8');
      const deleteBodies: unknown[] = [];
      let interrupts = 0;
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = String(init?.method || 'GET');
        if (url.endsWith('/queue') && method === 'GET') {
          return Response.json({
            queue_running: [[0, 'own-running']],
            queue_pending: [[1, 'own-pending'], [2, 'unrelated-pending']],
          });
        }
        if (url.endsWith('/queue') && method === 'POST') {
          deleteBodies.push(JSON.parse(String(init?.body || '{}')));
          return Response.json({});
        }
        if (url.endsWith('/interrupt')) {
          interrupts += 1;
          return Response.json({});
        }
        return new Response('not found', { status: 404 });
      }) as typeof fetch;
      const service = new UmbraUiInpaintService({
        getComfyBaseUrl: () => 'http://127.0.0.1:8188',
        jobStatePath: statePath,
        buildBaseWorkflow: async () => ({ promptGraph: {} }),
      });

      await service.cancel('mixed-cancel-job');

      expect(deleteBodies).toEqual([{ delete: ['own-running', 'own-pending'] }]);
      expect(interrupts).toBe(1);
      expect(service.getJob('mixed-cancel-job')?.items.map((item) => item.status)).toEqual(['canceled', 'canceled']);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });
});
