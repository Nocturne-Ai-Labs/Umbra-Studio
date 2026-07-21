import { describe, expect, test } from 'bun:test';
import {
  deriveUmbraUiInpaintCanvasCapabilities,
  deriveUmbraUiTxt2ImgCapabilities,
  listUmbraUiInpaintPipelineGraphIssues,
  listUmbraUiVid2VidPipelineGraphIssues,
  getUmbraUiRuntimeNodeExecutionError,
  listUmbraUiRequiredResourceIssues,
  resolveUmbraUiPipelineResourceReadinessStatus,
  resolveUmbraUiOptionalStagePolicy,
} from './UmbraUiPipelineCapabilities';
import {
  matchUmbraUiPipelineDescriptors,
  matchUmbraUiResourceCatalog,
  normalizeUmbraUiInpaintCanvasCapabilities,
  normalizeUmbraUiPipelineCapabilities,
  normalizeUmbraUiPipelineReadiness,
  type UmbraUiPipelineDescriptor,
} from '../shared/umbra-ui/pipelineTypes';
import { resolveUmbraUiPipeline } from '../frontend/src/lib/umbraUiPipelines';

describe('listUmbraUiVid2VidPipelineGraphIssues', () => {
  const graph = {
    source: { class_type: 'LoadVideo', inputs: { file: 'source.mp4' }, _meta: { umbra_role: 'source_video' } },
    components: { class_type: 'GetVideoComponents', inputs: { video: ['source', 0] }, _meta: { umbra_role: 'source_video_components' } },
    frames: { class_type: 'ImageFromBatch', inputs: { image: ['components', 0], batch_index: 0, length: 81 }, _meta: { umbra_role: 'source_video_frames' } },
    scale: { class_type: 'ImageScale', inputs: { image: ['frames', 0], width: 832, height: 480, upscale_method: 'lanczos', crop: 'center' }, _meta: { umbra_role: 'source_video_scale' } },
    encode: { class_type: 'VAEEncode', inputs: { pixels: ['scale', 0], vae: ['vae', 0] }, _meta: { umbra_role: 'source_video_encode' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: 'video-vae.safetensors' } },
    sample: { class_type: 'KSamplerAdvanced', inputs: { latent_image: ['encode', 0], start_at_step: 2, end_at_step: 4 }, _meta: { umbra_role: 'wan_high_sampler' } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } },
    create: { class_type: 'CreateVideo', inputs: { images: ['decode', 0], fps: 16 } },
    output: { class_type: 'SaveVideo', inputs: { video: ['create', 0] }, _meta: { umbra_role: 'video_output' } },
  };

  test('accepts a connected source-video latent pipeline', () => {
    expect(listUmbraUiVid2VidPipelineGraphIssues(graph)).toEqual([]);
  });

  test('rejects a source chain that does not feed frame extraction', () => {
    const malformed = structuredClone(graph);
    malformed.frames.inputs.image = ['source', 0];
    expect(listUmbraUiVid2VidPipelineGraphIssues(malformed)).toContain('VID2VID components-to-frames binding');
  });
});

describe('deriveUmbraUiTxt2ImgCapabilities', () => {
  test('treats CLIPSetLastLayer -1 as a legacy mutation instead of normal CLIP', () => {
    const capabilities = deriveUmbraUiTxt2ImgCapabilities({
      loader: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
      clipSkip: {
        class_type: 'CLIPSetLastLayer',
        inputs: { clip: ['loader', 1], stop_at_clip_layer: -1 },
      },
    }, { modelSources: ['checkpoint'], defaults: { clipSkip: 1 } });

    expect(capabilities.clipSkip.support).toBe('adjustable');
    expect(capabilities.clipSkip.value).toBe(2);
  });

  test('does not advertise an arbitrary role-only clip skip contract', () => {
    const capabilities = deriveUmbraUiTxt2ImgCapabilities({
      custom: {
        class_type: 'UnknownClipMutation',
        inputs: { stop_at_clip_layer: -2 },
        _meta: { umbra_role: 'clip_skip' },
      },
    }, { modelSources: ['checkpoint'], defaults: { clipSkip: 2 } });

    expect(capabilities.clipSkip.support).toBe('unsupported');
  });

  test('separates Flux conditioning guidance from sampler CFG', () => {
    const capabilities = deriveUmbraUiTxt2ImgCapabilities({
      reader: {
        class_type: 'UmbraPowerPrompterReader',
        inputs: { prompt_text: '', negative_prompt: '', seed: 1, width: 1024, height: 1024 },
      },
      conditioning: {
        class_type: 'CLIPTextEncodeFlux',
        inputs: { clip_l: ['prompt', 0], t5xxl: ['prompt', 0], guidance: 3.5 },
        _meta: { title: 'FLUX Positive Conditioning' },
      },
      negative: {
        class_type: 'ConditioningZeroOut',
        inputs: { conditioning: ['conditioning', 0] },
        _meta: { title: 'FLUX Zero Negative Conditioning' },
      },
      sampler: {
        class_type: 'UmbraKSamplerHiResFix',
        inputs: {
          steps: 4,
          cfg: 1,
          sampler_name: 'euler',
          scheduler: 'simple',
          enabled: false,
          upscaler: 'Latent',
          scale_by: 2,
          resize_width: 0,
          resize_height: 0,
          hires_steps: 0,
          hires_cfg: 0,
          hires_sampler_name: 'Use same',
          hires_scheduler: 'Use same',
          hires_denoise: 0.35,
        },
      },
      lora: { class_type: 'UmbraA1111LoraSyntax', inputs: { prompt_text: ['reader', 0] } },
      detailer: {
        class_type: 'UmbraImageDetailer',
        inputs: { pipeline_json: '', face_detail: true, eye_detail: true },
      },
      upscale: {
        class_type: 'UmbraImageUpscale',
        inputs: { enabled: false, upscale_model: '4x-Test.pth', max_dimension: 3840 },
      },
    }, {
      modelSources: ['checkpoint', 'diffusion_model'],
      defaults: { cfg: 1, samplerName: 'euler', scheduler: 'simple' },
    });

    expect(capabilities.guidance.support).toBe('adjustable');
    expect(capabilities.guidance.mode).toBe('guidance');
    expect(capabilities.guidance.value).toBe(3.5);
    expect(capabilities.negativePrompt.support).toBe('unsupported');
    expect(capabilities.clipSkip.support).toBe('unsupported');
    expect(capabilities.hiresFix.support).toBe('adjustable');
    expect(capabilities.hiresFix.controls.cfg).toBe(false);
    expect(capabilities.detailerStages.stages).toEqual(['face', 'eyes']);
    expect(capabilities.finalModelUpscale.value).toBe('4x-Test.pth');
  });

  test('reports a specialized sampler and absent hires stage as fixed or unsupported', () => {
    const capabilities = deriveUmbraUiTxt2ImgCapabilities({
      reader: {
        class_type: 'UmbraPowerPrompterReader',
        inputs: { prompt_text: '', negative_prompt: '', seed: 10, width: 2048, height: 2048 },
      },
      negative: {
        class_type: 'CLIPTextEncode',
        inputs: { text: ['reader', 1], clip: ['loader', 1] },
        _meta: { title: 'Negative Conditioning' },
      },
      scheduler: {
        class_type: 'BasicScheduler',
        inputs: { scheduler: 'normal', steps: 28, denoise: 1 },
      },
      samplerProvider: { class_type: 'SamplerLCM', inputs: {} },
      sampler: { class_type: 'SamplerCustom', inputs: { noise_seed: 12, cfg: 1 } },
      detailer: {
        class_type: 'UmbraImageDetailer',
        inputs: { pipeline_json: '', face_detail: true },
      },
    }, {
      modelSources: ['checkpoint'],
      defaults: { samplerName: 'lcm', scheduler: 'normal', steps: 28, cfg: 1 },
    });

    expect(capabilities.modelSources.support).toBe('fixed');
    expect(capabilities.negativePrompt.support).toBe('adjustable');
    expect(capabilities.guidance.mode).toBe('cfg');
    expect(capabilities.sampler.support).toBe('fixed');
    expect(capabilities.sampler.value).toBe('lcm');
    expect(capabilities.scheduler.support).toBe('adjustable');
    expect(capabilities.hiresFix.support).toBe('unsupported');
    expect(capabilities.detailerStages.support).toBe('unsupported');
    expect(capabilities.detailerStages.reason).toContain('explicit native detailer provider');
  });

  test('does not unlock an advanced detailer when its provider is unconnected', () => {
    const capabilities = deriveUmbraUiTxt2ImgCapabilities({
      sampler: { class_type: 'SamplerCustomAdvanced', inputs: { noise_seed: 1 } },
      detailer: {
        class_type: 'UmbraImageDetailer',
        inputs: { pipeline_json: '', face_detail: true },
      },
      provider: {
        class_type: 'UmbraFlux2DetailerSamplingProvider',
        inputs: {},
      },
    }, { modelSources: ['diffusion_model'] });

    expect(capabilities.detailerStages.support).toBe('unsupported');
    expect(capabilities.detailerStages.reason).toContain('explicit native detailer provider');
  });

  test('recognizes a connected registered provider class without role metadata', () => {
    const capabilities = deriveUmbraUiTxt2ImgCapabilities({
      sampler: { class_type: 'Flux2Scheduler', inputs: { steps: 20 } },
      detailer: {
        class_type: 'UmbraImageDetailer',
        inputs: { pipeline_json: '', face_detail: true, sampling_provider: ['provider', 0] },
      },
      provider: {
        class_type: 'UmbraFlux2DetailerSamplingProvider',
        inputs: {},
      },
    }, { modelSources: ['diffusion_model'] });

    expect(capabilities.detailerStages.support).toBe('adjustable');
    expect(capabilities.detailerStages.nodeClassTypes).toContain('UmbraFlux2DetailerSamplingProvider');
  });

  test('does not mistake a provider for a detailer stage pipeline', () => {
    const capabilities = deriveUmbraUiTxt2ImgCapabilities({
      sampler: { class_type: 'Flux2Scheduler', inputs: { steps: 20 } },
      provider: {
        class_type: 'UmbraFlux2DetailerSamplingProvider',
        inputs: { face_detail: true },
      },
    }, { modelSources: ['diffusion_model'] });

    expect(capabilities.detailerStages.support).toBe('unsupported');
    expect(capabilities.detailerStages.stages).toEqual([]);
    expect(capabilities.detailerStages.reason).toContain('No detailer stage');
  });

  test('rejects classic detailer controls for advanced graph contracts by semantics', () => {
    const incompatibleClasses = [
      'SamplerCustomAdvanced',
      'DualModelGuider',
      'DualCFGGuider',
      'Flux2Scheduler',
      'Ideogram4Scheduler',
      'KSamplerAdvanced',
    ];
    for (const classType of incompatibleClasses) {
      const capabilities = deriveUmbraUiTxt2ImgCapabilities({
        reader: {
          class_type: 'UmbraPowerPrompterReader',
          inputs: { prompt_text: '', seed: 1, width: 1024, height: 1024 },
        },
        sampler: { class_type: classType, inputs: { steps: 20, cfg: 4 } },
        detailer: {
          class_type: 'UmbraImageDetailer',
          inputs: { pipeline_json: '', person_detail: true, face_detail: true },
        },
      }, { modelSources: ['diffusion_model'] });

      expect(capabilities.detailerStages.support).toBe('unsupported');
      expect(capabilities.detailerStages.nodeClassTypes).toContain(classType);
      expect(capabilities.detailerStages.reason).toContain('advanced sampling contract');
    }
  });

  test('allows an advanced graph only when it declares a native detailer provider', () => {
    const capabilities = deriveUmbraUiTxt2ImgCapabilities({
      sampler: { class_type: 'SamplerCustomAdvanced', inputs: { noise_seed: 1 } },
      detailer: {
        class_type: 'UmbraImageDetailer',
        inputs: { pipeline_json: '', face_detail: true, sampling_provider: ['provider', 0] },
      },
      provider: {
        class_type: 'UmbraNativeDetailerProvider',
        inputs: {},
      },
    }, { modelSources: ['diffusion_model'] });

    expect(capabilities.detailerStages.support).toBe('adjustable');
    expect(capabilities.detailerStages.stages).toEqual(['face']);
    expect(capabilities.detailerStages.reason).toContain('explicit native detailer provider');
  });

  test('recognizes Umbra native sampling providers through workflow role metadata', () => {
    const providerClasses = [
      'UmbraFlux2DetailerSamplingProvider',
      'UmbraHiDreamO1DetailerSamplingProvider',
      'UmbraIdeogram4DetailerSamplingProvider',
      'UmbraOmniGen2DetailerSamplingProvider',
    ];

    for (const classType of providerClasses) {
      const capabilities = deriveUmbraUiTxt2ImgCapabilities({
        sampler: { class_type: 'SamplerCustomAdvanced', inputs: { noise_seed: 1 } },
        detailer: {
          class_type: 'UmbraImageDetailer',
          inputs: { pipeline_json: '', face_detail: true, sampling_provider: ['provider', 0] },
        },
        provider: {
          class_type: classType,
          inputs: {},
          _meta: { umbra_role: 'native_detailer_provider' },
        },
      }, { modelSources: ['diffusion_model'] });

      expect(capabilities.detailerStages.support).toBe('adjustable');
      expect(capabilities.detailerStages.stages).toEqual(['face']);
      expect(capabilities.detailerStages.nodeClassTypes).toContain(classType);
      expect(capabilities.detailerStages.reason).toContain('explicit native detailer provider');
    }
  });

  test('derives architecture-safe latent geometry from the locked graph', () => {
    const common = {
      reader: { class_type: 'UmbraPowerPrompterReader', inputs: { width: 1024, height: 1024, seed: 1 } },
    };
    const flux = deriveUmbraUiTxt2ImgCapabilities({
      ...common,
      latent: { class_type: 'EmptyFlux2LatentImage', inputs: { width: ['reader', 4], height: ['reader', 5], batch_size: 1 } },
    }, { modelSources: ['diffusion_model'] });
    expect(flux.resolution).toMatchObject({ step: 16, maximumWidth: 16384, maximumHeight: 16384 });

    const hiDream = deriveUmbraUiTxt2ImgCapabilities({
      ...common,
      latent: { class_type: 'EmptyHiDreamO1LatentImage', inputs: { width: ['reader', 4], height: ['reader', 5], batch_size: 1 } },
    }, { modelSources: ['checkpoint'] });
    expect(hiDream.resolution).toMatchObject({ step: 32, maximumWidth: 4096, maximumHeight: 4096 });
  });
});

describe('deriveUmbraUiInpaintCanvasCapabilities', () => {
  test('advertises only the canvas layers the classic builder can actually wire', () => {
    const capabilities = deriveUmbraUiInpaintCanvasCapabilities({
      sampler: { class_type: 'KSampler', inputs: { steps: 20 } },
    }, {
      modelSources: ['checkpoint'],
      inpaintAdapter: 'classic_conditioning',
    });

    expect(capabilities.regionalGuidance).toMatchObject({
      support: 'adjustable',
      maxLayers: 16,
      positivePrompt: true,
      negativePrompt: true,
      autoNegative: true,
    });
    expect(capabilities.controlLayers).toMatchObject({
      support: 'adjustable',
      maxLayers: 8,
      adapterTypes: ['controlnet', 't2i_adapter', 'control_lora'],
      modes: ['balanced'],
    });
    expect(capabilities.referenceLayers).toMatchObject({
      support: 'adjustable',
      maxLayers: 8,
      methods: ['style_model', 'ip_adapter'],
    });
    expect(capabilities.referenceLayers.nodeClassTypes).toContain('IPAdapterAdvanced');
    expect(capabilities.seamless).toMatchObject({
      support: 'adjustable',
      axes: ['x', 'y'],
      nodeClassTypes: ['UmbraSeamlessTiling'],
    });
  });

  test('advertises Anima LLLite only for the Anima classic pipeline', () => {
    const anima = deriveUmbraUiInpaintCanvasCapabilities({
      sampler: { class_type: 'KSampler', inputs: { steps: 20 } },
    }, {
      modelFamily: 'Anima',
      modelFamilyKey: 'anima',
      modelSources: ['checkpoint'],
      inpaintAdapter: 'classic_conditioning',
    });
    expect(anima.controlLayers.adapterTypes).toEqual([
      'controlnet',
      't2i_adapter',
      'control_lora',
      'anima_lllite',
    ]);
    expect(anima.controlLayers.nodeClassTypes).toContain('AnimaLLLiteApply');

    const sdxl = deriveUmbraUiInpaintCanvasCapabilities({}, {
      modelFamily: 'SDXL',
      modelFamilyKey: 'sdxl',
      modelSources: ['checkpoint'],
      inpaintAdapter: 'classic_conditioning',
    });
    expect(sdxl.controlLayers.adapterTypes).not.toContain('anima_lllite');
  });

  test('does not project classic canvas controls onto native model contracts', () => {
    const capabilities = deriveUmbraUiInpaintCanvasCapabilities({
      source: {
        class_type: 'LoadImage',
        inputs: { image: 'source.png' },
        _meta: { umbra_role: 'inpaint_source' },
      },
    }, {
      modelSources: ['diffusion_model', 'gguf'],
      inpaintAdapter: 'native_edit',
    });

    expect(capabilities.regionalGuidance.support).toBe('unsupported');
    expect(capabilities.controlLayers.support).toBe('unsupported');
    expect(capabilities.referenceLayers.support).toBe('unsupported');
    expect(capabilities.controlLayers.adapterTypes).toEqual([]);
    expect(capabilities.controlLayers.modes).toEqual([]);
    expect(capabilities.referenceLayers.methods).toEqual([]);
    expect(capabilities.seamless).toMatchObject({ support: 'unsupported', axes: [] });
    expect(capabilities.controlLayers.reason).toContain('native_edit');
  });

  test('opens native regional guidance only through exact encoder and sink contracts', () => {
    const flux = deriveUmbraUiInpaintCanvasCapabilities({
      clip: {
        class_type: 'UmbraA1111LoraSyntax',
        inputs: {},
        _meta: { umbra_role: 'inpaint_regional_clip_source', umbra_output_index: 1 },
      },
      base: { class_type: 'NativeConditioning', inputs: {} },
      guidance: {
        class_type: 'FluxGuidance',
        inputs: { conditioning: ['base', 0], guidance: 4 },
        _meta: { umbra_role: 'inpaint_regional_positive_transform' },
      },
      sink: {
        class_type: 'ReferenceLatent',
        inputs: { conditioning: ['guidance', 0], latent: ['latent', 0] },
        _meta: {
          umbra_regional_method: 'flux_guidance_masked_conditioning',
          umbra_regional_positive_input: 'conditioning',
        },
      },
      latent: { class_type: 'NativeLatent', inputs: {} },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'native_edit' });
    expect(flux.regionalGuidance).toMatchObject({
      support: 'adjustable',
      positivePrompt: true,
      negativePrompt: false,
      autoNegative: false,
    });
    expect(flux.regionalGuidance.nodeClassTypes).toContain('ConditioningSetMask');

    const hiDream = deriveUmbraUiInpaintCanvasCapabilities({
      clip: {
        class_type: 'UmbraA1111LoraSyntax',
        inputs: {},
        _meta: { umbra_role: 'inpaint_regional_clip_source', umbra_output_index: 1 },
      },
      positive: { class_type: 'PositiveConditioning', inputs: {} },
      negative: { class_type: 'NegativeConditioning', inputs: {} },
      sink: {
        class_type: 'HiDreamO1ReferenceImages',
        inputs: { positive: ['positive', 0], negative: ['negative', 0] },
        _meta: {
          umbra_regional_method: 'clip_masked_conditioning',
          umbra_regional_positive_input: 'positive',
          umbra_regional_negative_input: 'negative',
        },
      },
    }, { modelSources: ['checkpoint'], inpaintAdapter: 'native_edit' });
    expect(hiDream.regionalGuidance).toMatchObject({
      support: 'adjustable',
      positivePrompt: true,
      negativePrompt: true,
      autoNegative: true,
    });

    const qwen = deriveUmbraUiInpaintCanvasCapabilities({
      source: { class_type: 'LoadImage', inputs: { image: 'source.png' }, _meta: { umbra_role: 'inpaint_source' } },
      clip: { class_type: 'QwenClip', inputs: {} },
      vae: { class_type: 'VAELoader', inputs: {} },
      positive: {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['clip', 0], vae: ['vae', 0], prompt: 'edit', image1: ['source', 0] },
        _meta: {
          umbra_role: 'inpaint_reference_positive_encoder',
          umbra_roles: ['inpaint_regional_positive_encoder'],
          umbra_reference_method: 'qwen_image_reference',
        },
      },
      negative: {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['clip', 0], vae: ['vae', 0], prompt: '', image1: ['source', 0] },
        _meta: {
          umbra_role: 'inpaint_reference_negative_encoder',
          umbra_roles: ['inpaint_regional_negative_encoder'],
          umbra_reference_method: 'qwen_image_reference',
        },
      },
      sink: {
        class_type: 'NativeSampler',
        inputs: { positive: ['positive', 0], negative: ['negative', 0] },
        _meta: {
          umbra_regional_method: 'qwen_image_edit_masked_conditioning',
          umbra_regional_positive_input: 'positive',
          umbra_regional_negative_input: 'negative',
        },
      },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'native_edit' });
    expect(qwen.regionalGuidance).toMatchObject({
      support: 'adjustable', positivePrompt: true, negativePrompt: true, autoNegative: true,
    });
    expect(qwen.referenceLayers).toMatchObject({ support: 'adjustable', methods: ['qwen_image_reference'] });
  });

  test('keeps malformed native regional declarations closed', () => {
    const capabilities = deriveUmbraUiInpaintCanvasCapabilities({
      clip: {
        class_type: 'UmbraA1111LoraSyntax',
        inputs: {},
        _meta: { umbra_role: 'inpaint_regional_clip_source', umbra_output_index: 1 },
      },
      base: { class_type: 'NativeConditioning', inputs: {} },
      wrongTransform: {
        class_type: 'ConditioningAverage',
        inputs: { conditioning: ['base', 0], guidance: 4 },
        _meta: { umbra_role: 'inpaint_regional_positive_transform' },
      },
      sink: {
        class_type: 'ReferenceLatent',
        inputs: { conditioning: ['wrongTransform', 0] },
        _meta: {
          umbra_regional_method: 'flux_guidance_masked_conditioning',
          umbra_regional_positive_input: 'conditioning',
        },
      },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'native_edit' });
    expect(capabilities.regionalGuidance).toMatchObject({
      support: 'unsupported',
      positivePrompt: false,
      negativePrompt: false,
      autoNegative: false,
    });
  });

  test('opens Qwen ControlNet and FLUX Fill regional controls only from their exact encoder contracts', () => {
    const qwen = deriveUmbraUiInpaintCanvasCapabilities({
      clip: {
        class_type: 'UmbraA1111LoraSyntax',
        inputs: {},
        _meta: { umbra_role: 'inpaint_regional_clip_source', umbra_output_index: 1 },
      },
      positive: { class_type: 'PositiveConditioning', inputs: {} },
      negative: { class_type: 'NegativeConditioning', inputs: {} },
      sampler: {
        class_type: 'KSampler',
        inputs: { positive: ['positive', 0], negative: ['negative', 0] },
        _meta: {
          umbra_regional_method: 'clip_masked_conditioning',
          umbra_regional_positive_input: 'positive',
          umbra_regional_negative_input: 'negative',
        },
      },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'qwen_image_controlnet' });
    expect(qwen.regionalGuidance).toMatchObject({
      support: 'adjustable', positivePrompt: true, negativePrompt: true, autoNegative: true,
    });

    const flux = deriveUmbraUiInpaintCanvasCapabilities({
      clip: { class_type: 'DualCLIPLoader', inputs: {} },
      encoder: {
        class_type: 'CLIPTextEncodeFlux',
        inputs: { clip: ['clip', 0], clip_l: 'prompt', t5xxl: 'prompt', guidance: 3.5 },
        _meta: { umbra_role: 'inpaint_regional_positive_encoder' },
      },
      sampler: {
        class_type: 'KSampler',
        inputs: { positive: ['encoder', 0] },
        _meta: {
          umbra_regional_method: 'flux_text_encode_masked_conditioning',
          umbra_regional_positive_input: 'positive',
        },
      },
    }, { modelSources: ['gguf'], inpaintAdapter: 'flux_fill' });
    expect(flux.regionalGuidance).toMatchObject({
      support: 'adjustable', positivePrompt: true, negativePrompt: false, autoNegative: false,
    });
  });

  test('opens native Z-Image controls only through an exact model-patch sink', () => {
    const capabilities = deriveUmbraUiInpaintCanvasCapabilities({
      model: { class_type: 'NativeModel', inputs: {} },
      vae: { class_type: 'VAELoader', inputs: {}, _meta: { umbra_role: 'inpaint_control_vae' } },
      sink: {
        class_type: 'ModelPassThrough',
        inputs: { model: ['model', 0] },
        _meta: { umbra_role: 'inpaint_control_model_sink', umbra_control_adapter: 'z_image_control', umbra_control_mode: 'balanced' },
      },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'native_edit' });
    expect(capabilities.controlLayers).toMatchObject({
      support: 'adjustable',
      maxLayers: 4,
      adapterTypes: ['z_image_control'],
      modes: ['balanced'],
    });
    expect(capabilities.controlLayers.nodeClassTypes).toContain('ZImageFunControlnet');
  });

  test('opens only an explicitly declared native reference sink', () => {
    const capabilities = deriveUmbraUiInpaintCanvasCapabilities({
      conditioning: { class_type: 'NativeConditioning', inputs: { text: 'edit' } },
      vae: { class_type: 'VAELoader', inputs: { vae_name: 'model.safetensors' }, _meta: { umbra_role: 'inpaint_reference_vae' } },
      guider: {
        class_type: 'BasicGuider',
        inputs: { conditioning: ['conditioning', 0] },
        _meta: { umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'flux2_reference' },
      },
    }, {
      modelSources: ['diffusion_model', 'gguf'],
      inpaintAdapter: 'native_edit',
    });

    expect(capabilities.referenceLayers).toMatchObject({
      support: 'adjustable',
      maxLayers: 8,
      methods: ['flux2_reference'],
    });
    expect(capabilities.referenceLayers.nodeClassTypes).toContain('ReferenceLatent');
    expect(capabilities.controlLayers).toMatchObject({ support: 'unsupported', adapterTypes: [], modes: [] });
  });

  test('declares Qwen and HiDream references only through their architecture-specific graph roles', () => {
    const qwen = deriveUmbraUiInpaintCanvasCapabilities({
      source: { class_type: 'LoadImage', inputs: { image: 'source.png' }, _meta: { umbra_role: 'inpaint_source' } },
      clip: { class_type: 'QwenClip', inputs: {} },
      vae: { class_type: 'VAELoader', inputs: {} },
      positive: {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['clip', 0], vae: ['vae', 0], prompt: 'edit', image1: ['source', 0] },
        _meta: { umbra_role: 'inpaint_reference_positive_encoder', umbra_reference_method: 'qwen_image_reference' },
      },
      negative: {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { clip: ['clip', 0], vae: ['vae', 0], prompt: '', image1: ['source', 0] },
        _meta: { umbra_role: 'inpaint_reference_negative_encoder', umbra_reference_method: 'qwen_image_reference' },
      },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'native_edit' });
    expect(qwen.referenceLayers).toMatchObject({ support: 'adjustable', maxLayers: 2, methods: ['qwen_image_reference'] });

    const hiDream = deriveUmbraUiInpaintCanvasCapabilities({
      source: { class_type: 'LoadImage', inputs: { image: 'source.png' }, _meta: { umbra_role: 'inpaint_source' } },
      positive: { class_type: 'PositiveConditioning', inputs: {} },
      negative: { class_type: 'NegativeConditioning', inputs: {} },
      references: {
        class_type: 'HiDreamO1ReferenceImages',
        inputs: { positive: ['positive', 0], negative: ['negative', 0], 'images.image_1': ['source', 0] },
        _meta: { umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'hidream_o1_reference' },
      },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'native_edit' });
    expect(hiDream.referenceLayers).toMatchObject({ support: 'adjustable', maxLayers: 9, methods: ['hidream_o1_reference'] });

    const redux = deriveUmbraUiInpaintCanvasCapabilities({
      conditioning: { class_type: 'FluxConditioning', inputs: {} },
      sink: {
        class_type: 'BasicGuider',
        inputs: { conditioning: ['conditioning', 0] },
        _meta: { umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'flux_redux' },
      },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'native_edit' });
    expect(redux.referenceLayers).toMatchObject({ support: 'adjustable', maxLayers: 8, methods: ['flux_redux'] });

    const ipAdapter = deriveUmbraUiInpaintCanvasCapabilities({
      model: { class_type: 'NativeModel', inputs: {} },
      sink: {
        class_type: 'ModelPassThrough',
        inputs: { model: ['model', 0] },
        _meta: { umbra_role: 'inpaint_reference_model_sink', umbra_reference_method: 'ip_adapter' },
      },
    }, { modelSources: ['checkpoint'], inpaintAdapter: 'native_edit' });
    expect(ipAdapter.referenceLayers).toMatchObject({ support: 'adjustable', maxLayers: 8, methods: ['ip_adapter'] });
    expect(ipAdapter.referenceLayers.nodeClassTypes).toContain('IPAdapterAdvanced');
  });

  test('exposes FLUX Redux only for the exact FLUX Fill adapter contract', () => {
    const fluxFill = deriveUmbraUiInpaintCanvasCapabilities({
      positive: { class_type: 'CLIPTextEncodeFlux', inputs: { clip: ['clip', 0], clip_l: 'prompt', t5xxl: 'prompt' } },
    }, { modelSources: ['diffusion_model'], inpaintAdapter: 'flux_fill' });
    expect(fluxFill.referenceLayers).toMatchObject({
      support: 'adjustable',
      maxLayers: 8,
      methods: ['flux_redux'],
    });
    expect(fluxFill.referenceLayers.nodeClassTypes).toContain('StyleModelApply');

    const qwenControl = deriveUmbraUiInpaintCanvasCapabilities({}, {
      modelSources: ['diffusion_model'],
      inpaintAdapter: 'qwen_image_controlnet',
    });
    expect(qwenControl.referenceLayers).toMatchObject({ support: 'unsupported', methods: [] });
  });
});

describe('listUmbraUiInpaintPipelineGraphIssues', () => {
  test('accepts a classic graph with complete sampler bindings', () => {
    const graph = {
      model: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
      positive: { class_type: 'CLIPTextEncode', inputs: { text: 'positive', clip: ['model', 1] } },
      negative: { class_type: 'CLIPTextEncode', inputs: { text: 'negative', clip: ['model', 1] } },
      sampler: {
        class_type: 'KSampler',
        inputs: {
          model: ['model', 0], positive: ['positive', 0], negative: ['negative', 0], latent_image: ['latent', 0],
          seed: 1, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1,
        },
      },
      latent: { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
      decode: { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['model', 2] } },
      output: { class_type: 'UmbraLabSaveImage', inputs: { images: ['decode', 0] } },
    };
    expect(listUmbraUiInpaintPipelineGraphIssues(graph, {
      modelSources: ['checkpoint'],
      inpaintAdapter: 'classic_conditioning',
    })).toEqual([]);
  });

  test('rejects a declared inpaint graph without executable base bindings', () => {
    expect(listUmbraUiInpaintPipelineGraphIssues({
      output: { class_type: 'UmbraLabSaveImage', inputs: { images: ['image', 0] } },
      image: { class_type: 'LoadImage', inputs: { image: 'input.png' } },
    }, {
      modelSources: ['checkpoint'],
      inpaintAdapter: 'classic_conditioning',
    })).toContain('inpaint sampler binding');
  });

  test('requires a Qwen inpaint adapter resource', () => {
    const graph = {
      root: { class_type: 'UmbraPowerPrompter', inputs: {} },
      output: { class_type: 'UmbraLabSaveImage', inputs: { images: ['root', 5] } },
    };
    expect(listUmbraUiInpaintPipelineGraphIssues(graph, {
      modelSources: ['diffusion_model'],
      inpaintAdapter: 'qwen_image_controlnet',
      defaults: {},
    })).toContain('Qwen inpainting ControlNet default');
  });

  test('rejects malformed and adapter-incompatible regional declarations', () => {
    const descriptor = {
      modelSources: ['diffusion_model' as const],
      inpaintAdapter: 'qwen_image_controlnet' as const,
      defaults: { adapterModelName: 'qwen-inpaint-controlnet.safetensors' },
    };
    const malformed = {
      root: { class_type: 'UmbraPowerPrompter', inputs: {} },
      clip: {
        class_type: 'DualCLIPLoader',
        inputs: {},
        _meta: { umbra_role: 'inpaint_regional_clip_source', umbra_output_index: 0 },
      },
    };
    expect(listUmbraUiInpaintPipelineGraphIssues(malformed, descriptor)).toContain(
      'exact regional-conditioning contract',
    );

    const wrongFamily = {
      root: { class_type: 'UmbraPowerPrompter', inputs: {} },
      clip: { class_type: 'DualCLIPLoader', inputs: {} },
      encoder: {
        class_type: 'CLIPTextEncodeFlux',
        inputs: { clip: ['clip', 0], clip_l: 'prompt', t5xxl: 'prompt', guidance: 3.5 },
        _meta: { umbra_role: 'inpaint_regional_positive_encoder' },
      },
      sink: {
        class_type: 'KSampler',
        inputs: { positive: ['encoder', 0] },
        _meta: {
          umbra_regional_method: 'flux_text_encode_masked_conditioning',
          umbra_regional_positive_input: 'positive',
        },
      },
    };
    expect(listUmbraUiInpaintPipelineGraphIssues(wrongFamily, descriptor)).toContain(
      'exact regional-conditioning contract',
    );
  });

  test('requires native source and mask roles to reach an output', () => {
    const disconnected = {
      source: {
        class_type: 'LoadImage', inputs: { image: 'source.png' }, _meta: { umbra_role: 'inpaint_source' },
      },
      mask: {
        class_type: 'LoadImageMask', inputs: { image: 'mask.png' }, _meta: { umbra_role: 'inpaint_mask' },
      },
      generated: { class_type: 'LoadImage', inputs: { image: 'generated.png' } },
      output: { class_type: 'UmbraLabSaveImage', inputs: { images: ['generated', 0] } },
    };
    expect(listUmbraUiInpaintPipelineGraphIssues(disconnected, {
      modelSources: ['diffusion_model'],
      inpaintAdapter: 'native_edit',
    })).toContain('inpaint source and mask output path');

    const connected = {
      ...disconnected,
      composite: {
        class_type: 'ImageCompositeMasked',
        inputs: { destination: ['source', 0], source: ['generated', 0], mask: ['mask', 0], x: 0, y: 0 },
      },
      output: { class_type: 'UmbraLabSaveImage', inputs: { images: ['composite', 0] } },
    };
    expect(listUmbraUiInpaintPipelineGraphIssues(connected, {
      modelSources: ['diffusion_model'],
      inpaintAdapter: 'native_edit',
    })).toEqual([]);
  });
});

describe('pipeline contract normalization', () => {
  test('normalizes inpaint canvas layer limits and defaults undeclared contracts closed', () => {
    const capabilities = normalizeUmbraUiInpaintCanvasCapabilities({
      regional_guidance: { support: 'adjustable', max_layers: 16 },
      controlLayers: {
        support: 'fixed',
        maxLayers: 3,
        adapter_types: ['controlnet', 'control_lora', 'made_up'],
        modes: ['balanced', 'more_control', 'made_up'],
      },
      referenceLayers: {
        support: 'adjustable',
        maxLayers: 2,
        methods: ['style_model', 'flux_redux', 'made_up'],
      },
      seamless: {
        support: 'adjustable',
        axes: ['x', 'y', 'z'],
        nodeClassTypes: ['UmbraSeamlessTiling'],
      },
    });

    expect(capabilities.regionalGuidance.maxLayers).toBe(16);
    expect(capabilities.regionalGuidance).toMatchObject({
      positivePrompt: true,
      negativePrompt: true,
      autoNegative: true,
    });
    expect(capabilities.controlLayers).toMatchObject({
      support: 'fixed',
      maxLayers: 3,
      adapterTypes: ['controlnet', 'control_lora'],
      modes: ['balanced', 'more_control'],
    });
    expect(capabilities.referenceLayers).toMatchObject({
      support: 'adjustable',
      maxLayers: 2,
      methods: ['style_model', 'flux_redux'],
    });
    expect(capabilities.seamless).toMatchObject({ support: 'adjustable', axes: ['x', 'y'] });
    expect(normalizeUmbraUiInpaintCanvasCapabilities(null).controlLayers.support).toBe('unsupported');
    expect(normalizeUmbraUiInpaintCanvasCapabilities(null).regionalGuidance).toMatchObject({
      positivePrompt: false,
      negativePrompt: false,
      autoNegative: false,
    });
  });

  test('does not block a pipeline when only an optional model-source default is absent', () => {
    expect(resolveUmbraUiPipelineResourceReadinessStatus([
      {
        id: 'default-model.checkpoint',
        label: 'Default checkpoint model',
        kind: 'checkpoint',
        value: 'flux1-fill-dev.safetensors',
        required: false,
        source: 'descriptor_default',
        status: 'missing',
      },
      {
        id: 'default-model.gguf',
        label: 'Default GGUF model',
        kind: 'gguf',
        value: 'flux1-fill-dev-Q4_K_S.gguf',
        required: false,
        source: 'descriptor_default',
        status: 'available',
      },
    ], true)).toBe('ready');

    expect(resolveUmbraUiPipelineResourceReadinessStatus([{
      id: 'required-encoder',
      label: 'Required encoder',
      kind: 'text_encoder',
      value: 'missing-encoder.safetensors',
      required: true,
      source: 'graph',
      status: 'missing',
    }], true)).toBe('missing');
  });

  test('fills every absent feature explicitly while preserving descriptor model sources', () => {
    const capabilities = normalizeUmbraUiPipelineCapabilities(null, ['unet', 'gguf', 'unet']);

    expect(capabilities.modelSources.values).toEqual(['unet', 'gguf']);
    expect(capabilities.modelSources.support).toBe('adjustable');
    expect(capabilities.guidance).toMatchObject({ support: 'unsupported', mode: 'none' });
    expect(capabilities.hiresFix.controls).toEqual({
      upscaler: false,
      steps: false,
      denoise: false,
      cfg: false,
      sampler: false,
      scheduler: false,
    });
  });

  test('normalizes readiness independently from graph and runtime availability', () => {
    const capabilities = normalizeUmbraUiPipelineCapabilities({
      guidance: { support: 'adjustable', mode: 'guidance', value: 4, nodeClassTypes: ['FluxGuidance'] },
    }, ['diffusion_model']);
    const readiness = normalizeUmbraUiPipelineReadiness({
      graph: { status: 'valid', issues: [] },
      runtime: {
        comfyUi: 'offline',
        nodes: { status: 'unverified', missing: [] },
        resources: {
          status: 'missing',
          missing: ['encoder.safetensors'],
          requiredMissing: ['encoder.safetensors'],
          items: [{
            id: 'encoder',
            label: 'Text Encoder',
            kind: 'text_encoder',
            value: 'encoder.safetensors',
            required: true,
            source: 'graph',
            status: 'missing',
          }],
        },
      },
    }, capabilities, ['diffusion_model']);

    expect(readiness.graph.status).toBe('valid');
    expect(readiness.runtime.comfyUi).toBe('offline');
    expect(readiness.runtime.nodes.status).toBe('unverified');
    expect(readiness.runtime.resources.requiredMissing).toEqual(['encoder.safetensors']);
    expect(readiness.capabilitySupport.adjustable).toContain('guidance');
  });

  test('preserves selection-required and ambiguous resource readiness states', () => {
    const capabilities = normalizeUmbraUiPipelineCapabilities(null, ['checkpoint']);
    const readiness = normalizeUmbraUiPipelineReadiness({
      graph: { status: 'valid', issues: [] },
      runtime: {
        resources: {
          status: 'selection_required',
          selectionRequired: ['Text Encoder'],
          ambiguous: ['model.safetensors'],
          items: [{
            id: 'encoder',
            label: 'Text Encoder',
            kind: 'text_encoder',
            value: '',
            required: true,
            source: 'graph',
            status: 'selection_required',
          }],
        },
      },
    }, capabilities, ['checkpoint']);

    expect(readiness.runtime.resources.status).toBe('selection_required');
    expect(readiness.runtime.resources.selectionRequired).toEqual(['Text Encoder']);
    expect(readiness.runtime.resources.ambiguous).toEqual(['model.safetensors']);
    expect(readiness.runtime.resources.items[0]?.status).toBe('selection_required');
  });
});

describe('queue capability enforcement helpers', () => {
  const capabilities = normalizeUmbraUiPipelineCapabilities({
    hiresFix: {
      support: 'adjustable',
      resizeModes: ['dimensions'],
      controls: { denoise: true },
    },
    detailerStages: {
      support: 'adjustable',
      stages: ['face'],
      customStages: false,
    },
    finalModelUpscale: {
      support: 'adjustable',
      modelSelection: false,
      maxDimension: true,
    },
  }, ['checkpoint']);

  test('coerces stale optional-stage state to granular capabilities', () => {
    const policy = resolveUmbraUiOptionalStagePolicy(
      capabilities,
      { enabled: true, resizeMode: 'scale' },
      [{ label: 'Face', enabled: true }, { label: 'Hands', enabled: true }, { label: 'Custom', enabled: true }],
      { enabled: true },
    );

    expect(policy.hiresFix).toEqual({ enabled: true, resizeMode: 'dimensions' });
    expect(policy.detailerPipeline.map((stage) => stage.label)).toEqual(['Face']);
    expect(policy.outputUpscale).toEqual({ enabled: true, modelSelection: false, maxDimension: true });
  });

  test('forces unsupported stages off but preserves legacy behavior without capabilities', () => {
    const unsupported = normalizeUmbraUiPipelineCapabilities(null, ['checkpoint']);
    const stages = [{ label: 'Face', enabled: true }];
    const blocked = resolveUmbraUiOptionalStagePolicy(
      unsupported,
      { enabled: true, resizeMode: 'scale' },
      stages,
      { enabled: true },
    );
    const legacy = resolveUmbraUiOptionalStagePolicy(
      undefined,
      { enabled: true, resizeMode: 'scale' },
      stages,
      { enabled: true },
    );

    expect(blocked.hiresFix.enabled).toBe(false);
    expect(blocked.detailerPipeline).toEqual([]);
    expect(blocked.outputUpscale.enabled).toBe(false);
    expect(legacy.hiresFix.enabled).toBe(true);
    expect(legacy.detailerPipeline).toEqual(stages);
    expect(legacy.outputUpscale.enabled).toBe(true);
  });

  test('requires actual selections and rejects missing or ambiguous resources', () => {
    const selectors = [{
      id: 'encoder',
      label: 'Text Encoder',
      kind: 'text_encoder' as const,
      required: true,
      defaultValue: '',
    }];
    const catalog = new Map([
      ['text_encoder' as const, new Set([
        'folder-a/encoder.safetensors',
        'folder-b/encoder.safetensors',
        'replacement/selected.safetensors',
      ])],
    ]);

    expect(listUmbraUiRequiredResourceIssues(selectors, {}, catalog)[0]?.type).toBe('selection_required');
    expect(listUmbraUiRequiredResourceIssues(
      [{ ...selectors[0], defaultValue: 'encoder.safetensors' }],
      {},
      catalog,
    )[0]?.type).toBe('ambiguous');
    expect(listUmbraUiRequiredResourceIssues(
      selectors,
      { encoder: 'missing.safetensors' },
      catalog,
    )[0]?.type).toBe('missing');
    expect(listUmbraUiRequiredResourceIssues(
      selectors,
      { encoder: 'replacement/selected.safetensors' },
      catalog,
    )).toEqual([]);
  });

  test('reports runtime node classes independently from graph compatibility', () => {
    expect(getUmbraUiRuntimeNodeExecutionError({ status: 'missing', missing: ['UmbraImageDetailer'] }))
      .toContain('UmbraImageDetailer');
    expect(getUmbraUiRuntimeNodeExecutionError({ status: 'ready', missing: [] })).toBe('');
  });
});

describe('exact pipeline and resource matching', () => {
  test('uses exact normalized paths and reports basename collisions', () => {
    const catalog = ['folder-a/model.safetensors', 'folder-b/model.safetensors'];
    expect(matchUmbraUiResourceCatalog('folder-a\\model.safetensors', catalog)).toMatchObject({
      status: 'available',
      match: 'folder-a/model.safetensors',
    });
    expect(matchUmbraUiResourceCatalog('model.safetensors', catalog).status).toBe('ambiguous');
  });

  test('selects by family, feature, and source while leaving runtime-missing families selectable', () => {
    const checkpointPipeline: UmbraUiPipelineDescriptor = {
      feature: 'txt2img',
      modelFamily: 'Example',
      modelFamilyKey: 'example',
      modelSources: ['checkpoint'],
      priority: 100,
      locked: true,
    };
    const unetPipeline: UmbraUiPipelineDescriptor = {
      ...checkpointPipeline,
      modelSources: ['unet'],
      capabilities: normalizeUmbraUiPipelineCapabilities(null, ['unet']),
      readiness: normalizeUmbraUiPipelineReadiness({
        graph: { status: 'valid', issues: [] },
        runtime: { nodes: { status: 'missing', missing: ['CustomLoader'] } },
      }, null, ['unet']),
    };
    const workflows = [{
      id: 'workflow',
      name: 'Workflow',
      compatible: false,
      missing: ['ComfyUI node: CustomLoader'],
      umbraUiPipelines: [checkpointPipeline, unetPipeline],
    }];

    expect(matchUmbraUiPipelineDescriptors(
      [checkpointPipeline, unetPipeline],
      'txt2img',
      'Example',
      'unet',
    )).toEqual([unetPipeline]);
    const match = resolveUmbraUiPipeline(workflows, 'txt2img', 'Example', 'unet');
    expect(match.pipeline).toBe(unetPipeline);
    expect(match.error).toBe('');
  });
});
