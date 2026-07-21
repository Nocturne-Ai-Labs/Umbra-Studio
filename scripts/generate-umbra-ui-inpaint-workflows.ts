import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type PromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

type PromptGraph = Record<string, PromptNode>;

const root = process.cwd();
const bundledWorkflowDirectory = join(root, 'defaults', 'PowerPrompter', 'API Workflows');
const workflowDirectories = [
  bundledWorkflowDirectory,
  join(root, 'User', 'PowerPrompter', 'API Workflows'),
];

async function readGraph(fileName: string): Promise<PromptGraph> {
  return JSON.parse(await readFile(join(bundledWorkflowDirectory, fileName), 'utf8')) as PromptGraph;
}

function cloneNode(graph: PromptGraph, id: string, overrides: Partial<PromptNode> = {}): PromptNode {
  const source = structuredClone(graph[id]);
  if (!source) throw new Error(`Workflow node ${id} was not found.`);
  return {
    ...source,
    ...overrides,
    inputs: overrides.inputs ? structuredClone(overrides.inputs) : source.inputs,
    _meta: overrides._meta ? structuredClone(overrides._meta) : source._meta,
  };
}

function node(classType: string, inputs: Record<string, unknown>, meta: Record<string, unknown>): PromptNode {
  return { class_type: classType, inputs, _meta: meta };
}

function inpaintDescriptor(
  modelFamily: string,
  modelSources: string[],
  defaults: Record<string, unknown>,
) {
  return {
    feature: 'inpainting',
    model_family: modelFamily,
    model_sources: modelSources,
    inpaint_adapter: 'native_edit',
    priority: 100,
    defaults,
  };
}

async function writeGraph(fileName: string, graph: PromptGraph) {
  for (const workflowDirectory of workflowDirectories) {
    await mkdir(workflowDirectory, { recursive: true });
    await writeFile(join(workflowDirectory, fileName), `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  }
}

async function buildHiDreamO1Inpaint() {
  const base = await readGraph('[Umbra UI] HiDream O1 Image Pipeline.json');
  const graph: PromptGraph = {
    '1': cloneNode(base, '1', {
      _meta: {
        title: 'Umbra UI HiDream O1 Native Inpaint',
        umbra_model_family: 'HiDream O1',
        umbra_ui_pipelines: [inpaintDescriptor('HiDream O1', ['checkpoint'], {
          modelName: 'hidream_o1_image_dev_fp8_scaled.safetensors',
          modelNamesBySource: { checkpoint: 'hidream_o1_image_dev_fp8_scaled.safetensors' },
          steps: 28,
          cfg: 1,
          samplerName: 'lcm',
          scheduler: 'normal',
          width: 2048,
          height: 2048,
          clipSkip: 1,
        })],
      },
    }),
    '2': cloneNode(base, '2'),
    '3': cloneNode(base, '3', {
      _meta: {
        ...(base['3']?._meta || {}),
        umbra_role: 'inpaint_regional_clip_source',
        umbra_output_index: 1,
      },
    }),
    '4': cloneNode(base, '4'),
    '5': node('LoadImage', { image: 'umbra-native-source.png' }, {
      title: 'Editable Source Image',
      umbra_role: 'inpaint_source',
      umbra_output_index: 0,
    }),
    '6': node('LoadImageMask', { image: 'umbra-native-mask.png', channel: 'red' }, {
      title: 'Editable Source Mask',
      umbra_role: 'inpaint_mask',
      umbra_output_index: 0,
    }),
    '7': node('INPAINT_ExpandMask', { mask: ['6', 0], grow: 0, blur: 0, blur_type: 'gaussian' }, {
      title: 'Grow + Feather Native Mask',
      umbra_role: 'inpaint_mask_processor',
    }),
    '8': node('HiDreamO1ReferenceImages', {
      positive: ['3', 3],
      negative: ['4', 0],
      'images.image_1': ['5', 0],
    }, {
      title: 'HiDream-O1 Editable Source + References',
      umbra_role: 'inpaint_reference_sink',
      umbra_reference_method: 'hidream_o1_reference',
      umbra_regional_method: 'clip_masked_conditioning',
      umbra_regional_positive_input: 'positive',
      umbra_regional_negative_input: 'negative',
      umbra_regional_max_layers: 16,
    }),
    '9': cloneNode(base, '5'),
    '10': node('SetLatentNoiseMask', { samples: ['9', 0], mask: ['7', 0] }, {
      title: 'HiDream-O1 Masked Pixel Latent',
    }),
    '11': cloneNode(base, '6'),
    '12': cloneNode(base, '7', {
      inputs: { model: ['11', 0], scheduler: 'normal', steps: 28, denoise: 0.8 },
      _meta: { title: 'HiDream-O1 Inpaint Scheduler', umbra_role: 'inpaint_sampler' },
    }),
    '13': cloneNode(base, '8'),
    '14': cloneNode(base, '9', {
      inputs: {
        model: ['11', 0],
        add_noise: true,
        noise_seed: ['2', 3],
        cfg: 1,
        positive: ['8', 0],
        negative: ['8', 1],
        sampler: ['13', 0],
        sigmas: ['12', 0],
        latent_image: ['10', 0],
      },
      _meta: { title: 'Sample HiDream-O1 Masked Edit' },
    }),
    '15': cloneNode(base, '10', {
      inputs: { samples: ['14', 0], vae: ['1', 2] },
      _meta: { title: 'Decode HiDream-O1 Edit' },
    }),
    '16': node('ImageCompositeMasked', {
      destination: ['5', 0],
      source: ['15', 0],
      x: 0,
      y: 0,
      resize_source: false,
      mask: ['7', 0],
    }, { title: 'Non-Destructive HiDream-O1 Composite' }),
    '17': cloneNode(base, '13', {
      inputs: {
        images: ['16', 0],
        filename_prefix: 'UmbraUI_Inpaint_HiDreamO1_%date%',
        positive_prompt: ['3', 2],
        negative_prompt: ['2', 8],
        positive: ['8', 0],
        negative: ['8', 1],
        output_folder: 'Umbra UI/inpainting',
        save_to_yyyy_mm_dd_folder: true,
        save_to_set_subfolder: false,
        set_subfolder: '',
        save_set_to_style_subfolder: '',
        model_name: ['1', 3],
        seed: ['2', 3],
        steps: 28,
        cfg: 1,
        sampler_name: 'lcm',
        scheduler: 'normal',
      },
      _meta: { title: 'Save HiDream-O1 Inpaint', umbra_role: 'inpaint_output' },
    }),
  };
  await writeGraph('[Umbra UI] HiDream O1 Inpaint Pipeline.json', graph);
}

async function buildZImageTurboInpaint() {
  const base = await readGraph('[Umbra UI] Z-Image Turbo Pipeline.json');
  const graph: PromptGraph = {
    '1': cloneNode(base, '1', {
      _meta: {
        title: 'Umbra UI Z-Image Turbo Native Inpaint',
        umbra_model_family: 'Z-Image Turbo',
        umbra_ui_pipelines: [inpaintDescriptor('Z-Image Turbo', ['diffusion_model', 'unet', 'gguf'], {
          modelName: 'z_image_turbo_int8_convrot.safetensors',
          modelNamesBySource: {
            diffusion_model: 'z_image_turbo_int8_convrot.safetensors',
            unet: 'z_image_turbo_int8_convrot.safetensors',
            gguf: 'z-image-turbo-q4_k_s.gguf',
          },
          steps: 8,
          cfg: 1,
          samplerName: 'res_multistep',
          scheduler: 'simple',
          width: 1024,
          height: 1024,
          clipSkip: 1,
        })],
      },
    }),
    '2': cloneNode(base, '2'),
    '3': cloneNode(base, '3'),
    '4': cloneNode(base, '4', {
      _meta: {
        ...(base['4']?._meta || {}),
        umbra_role: 'inpaint_control_vae',
        umbra_output_index: 0,
      },
    }),
    '5': cloneNode(base, '5', {
      _meta: {
        ...(base['5']?._meta || {}),
        umbra_role: 'inpaint_regional_clip_source',
        umbra_output_index: 1,
      },
    }),
    '6': cloneNode(base, '6'),
    '7': node('LoadImage', { image: 'umbra-zimage-source.png' }, {
      title: 'Editable Source Image',
      umbra_role: 'inpaint_source',
      umbra_output_index: 0,
    }),
    '8': node('LoadImageMask', { image: 'umbra-zimage-mask.png', channel: 'red' }, {
      title: 'Editable Source Mask',
      umbra_role: 'inpaint_mask',
      umbra_output_index: 0,
    }),
    '9': node('INPAINT_ExpandMask', { mask: ['8', 0], grow: 0, blur: 0, blur_type: 'gaussian' }, {
      title: 'Grow + Feather Z-Image Mask',
      umbra_role: 'inpaint_mask_processor',
    }),
    '10': node('ModelPatchLoader', {
      name: 'Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors',
    }, {
      title: 'Z-Image Native Inpaint Patch',
      umbra_resources: [{
        id: 'zimage.inpaint_patch',
        label: 'Z-Image Inpaint Model Patch',
        kind: 'model',
        input: 'name',
        required: true,
        order: 40,
      }],
    }),
    '11': node('ZImageFunControlnet', {
      model: ['5', 0],
      model_patch: ['10', 0],
      vae: ['4', 0],
      strength: 0.85,
      inpaint_image: ['7', 0],
      mask: ['9', 0],
    }, { title: 'Apply Native Z-Image Inpaint' }),
    '12': cloneNode(base, '8', {
      inputs: { shift: 3, model: ['11', 0] },
      _meta: {
        title: 'Z-Image Native Edit Sampling Model',
        umbra_role: 'inpaint_control_model_sink',
        umbra_control_adapter: 'z_image_control',
        umbra_control_mode: 'balanced',
      },
    }),
    '13': cloneNode(base, '7'),
    '14': cloneNode(base, '9', {
      inputs: {
        ...structuredClone(base['9'].inputs),
        model: ['12', 0],
        vae: ['4', 0],
        positive: ['5', 3],
        negative: ['6', 0],
        latent_image: ['13', 0],
        denoise: 0.8,
        enabled: false,
      },
      _meta: {
        title: 'Sample Z-Image Native Edit',
        umbra_role: 'inpaint_sampler',
        umbra_regional_method: 'clip_masked_conditioning',
        umbra_regional_positive_input: 'positive',
        umbra_regional_negative_input: 'negative',
        umbra_regional_max_layers: 16,
      },
    }),
    '15': cloneNode(base, '10', {
      inputs: { samples: ['14', 0], vae: ['4', 0] },
      _meta: { title: 'Decode Z-Image Native Edit' },
    }),
    '16': node('ImageCompositeMasked', {
      destination: ['7', 0],
      source: ['15', 0],
      x: 0,
      y: 0,
      resize_source: false,
      mask: ['9', 0],
    }, { title: 'Non-Destructive Z-Image Composite' }),
    '17': cloneNode(base, '13', {
      inputs: {
        images: ['16', 0],
        filename_prefix: 'UmbraUI_Inpaint_ZImage_%date%',
        positive_prompt: ['5', 2],
        negative_prompt: ['2', 8],
        positive: ['5', 3],
        negative: ['6', 0],
        output_folder: 'Umbra UI/inpainting',
        save_to_yyyy_mm_dd_folder: true,
        save_to_set_subfolder: false,
        set_subfolder: '',
        save_set_to_style_subfolder: '',
        model_name: ['1', 3],
        seed: ['2', 3],
        steps: 8,
        cfg: 1,
        sampler_name: 'res_multistep',
        scheduler: 'simple',
      },
      _meta: { title: 'Save Z-Image Native Edit', umbra_role: 'inpaint_output' },
    }),
  };
  await writeGraph('[Umbra UI] Z-Image Turbo Inpaint Pipeline.json', graph);
}

async function buildFlux2EditInpaint() {
  const base = await readGraph('[Umbra UI] FLUX.2 Image Pipeline.json');
  const graph: PromptGraph = {
    '1': cloneNode(base, '1', {
      _meta: {
        title: 'Umbra UI FLUX.2 Edit Native Inpaint',
        umbra_model_family: 'FLUX.2 Edit',
        umbra_ui_pipelines: [inpaintDescriptor('FLUX.2 Edit', ['diffusion_model', 'unet', 'gguf'], {
          modelName: '',
          modelNamesBySource: {},
          steps: 20,
          cfg: 4,
          samplerName: 'euler',
          scheduler: 'simple',
          width: 1024,
          height: 1024,
          clipSkip: 1,
        })],
      },
    }),
    '2': cloneNode(base, '2'),
    '3': cloneNode(base, '3'),
    '4': cloneNode(base, '4', {
      _meta: {
        ...(base['4']._meta || {}),
        umbra_role: 'inpaint_reference_vae',
        umbra_output_index: 0,
      },
    }),
    '5': cloneNode(base, '5'),
    '6': cloneNode(base, '6'),
    '7': cloneNode(base, '7'),
    '8': node('LoadImage', { image: 'umbra-native-source.png' }, {
      title: 'Editable Source Image',
      umbra_role: 'inpaint_source',
      umbra_output_index: 0,
    }),
    '9': node('LoadImageMask', { image: 'umbra-native-mask.png', channel: 'red' }, {
      title: 'Editable Source Mask',
      umbra_role: 'inpaint_mask',
      umbra_output_index: 0,
    }),
    '10': node('INPAINT_ExpandMask', { mask: ['9', 0], grow: 0, blur: 0, blur_type: 'gaussian' }, {
      title: 'Grow + Feather Native Mask',
      umbra_role: 'inpaint_mask_processor',
    }),
    '11': node('VAEEncode', { pixels: ['8', 0], vae: ['4', 0] }, {
      title: 'Encode FLUX.2 Editable Source',
    }),
    '12': node('SetLatentNoiseMask', { samples: ['11', 0], mask: ['10', 0] }, {
      title: 'FLUX.2 Masked Source Latent',
    }),
    '13': node('ReferenceLatent', { conditioning: ['6', 0], latent: ['11', 0] }, {
      title: 'FLUX.2 Editable Source Reference',
    }),
    '14': cloneNode(base, '8', {
      inputs: { model: ['5', 0], conditioning: ['13', 0] },
      _meta: {
        title: 'FLUX.2 Edit Guider',
        umbra_role: 'inpaint_reference_sink',
        umbra_reference_method: 'flux2_reference',
      },
    }),
    '15': cloneNode(base, '10'),
    '16': cloneNode(base, '11'),
    '17': cloneNode(base, '12'),
    '18': node('SplitSigmasDenoise', { sigmas: ['17', 0], denoise: 0.8 }, {
      title: 'FLUX.2 Inpaint Denoise Range',
      umbra_role: 'inpaint_sampler',
    }),
    '19': cloneNode(base, '13', {
      inputs: {
        noise: ['15', 0],
        guider: ['14', 0],
        sampler: ['16', 0],
        sigmas: ['18', 1],
        latent_image: ['12', 0],
      },
      _meta: { title: 'Sample FLUX.2 Masked Edit' },
    }),
    '20': cloneNode(base, '14', {
      inputs: { samples: ['19', 0], vae: ['4', 0] },
      _meta: { title: 'Decode FLUX.2 Edit' },
    }),
    '21': node('ImageCompositeMasked', {
      destination: ['8', 0],
      source: ['20', 0],
      x: 0,
      y: 0,
      resize_source: false,
      mask: ['10', 0],
    }, { title: 'Non-Destructive FLUX.2 Composite' }),
    '22': cloneNode(base, '17', {
      inputs: {
        images: ['21', 0],
        filename_prefix: 'UmbraUI_Inpaint_FLUX2_%date%',
        positive_prompt: ['5', 2],
        negative_prompt: ['2', 8],
        positive: ['13', 0],
        negative: ['7', 0],
        output_folder: 'Umbra UI/inpainting',
        save_to_yyyy_mm_dd_folder: true,
        save_to_set_subfolder: false,
        set_subfolder: '',
        save_set_to_style_subfolder: '',
        model_name: ['1', 3],
        seed: ['2', 3],
        steps: 20,
        cfg: 4,
        sampler_name: 'euler',
        scheduler: 'simple',
      },
      _meta: { title: 'Save FLUX.2 Inpaint', umbra_role: 'inpaint_output' },
    }),
  };
  await writeGraph('[Umbra UI] FLUX.2 Edit Inpaint Pipeline.json', graph);
}

async function buildQwenImageEditInpaint() {
  const base = await readGraph('[Umbra UI] Qwen Image Pipeline.json');
  const modelName = 'qwen_image_edit_fp8_e4m3fn.safetensors';
  const graph: PromptGraph = {
    '1': cloneNode(base, '1', {
      inputs: {
        model_type: 'diffusion_model',
        checkpoint_name: '[None]',
        diffusers_model: '',
        diffusion_model_name: modelName,
        unet_name: '',
        gguf_name: '',
        weight_dtype: 'default',
      },
      _meta: {
        title: 'Umbra UI Qwen Image Edit Native Inpaint',
        umbra_model_family: 'Qwen Image Edit',
        umbra_ui_pipelines: [inpaintDescriptor('Qwen Image Edit', ['diffusion_model', 'unet'], {
          modelName,
          modelNamesBySource: { diffusion_model: modelName, unet: modelName },
          steps: 20,
          cfg: 4,
          samplerName: 'euler',
          scheduler: 'simple',
          width: 1024,
          height: 1024,
          clipSkip: 1,
        })],
      },
    }),
    '2': cloneNode(base, '2'),
    '3': cloneNode(base, '3'),
    '4': cloneNode(base, '4', {
      _meta: {
        ...(base['4']?._meta || {}),
        umbra_role: 'inpaint_reference_vae',
        umbra_output_index: 0,
      },
    }),
    '5': cloneNode(base, '5'),
    '6': node('LoadImage', { image: 'umbra-native-source.png' }, {
      title: 'Editable Source Image',
      umbra_role: 'inpaint_source',
      umbra_output_index: 0,
    }),
    '7': node('LoadImageMask', { image: 'umbra-native-mask.png', channel: 'red' }, {
      title: 'Editable Source Mask',
      umbra_role: 'inpaint_mask',
      umbra_output_index: 0,
    }),
    '8': node('INPAINT_ExpandMask', { mask: ['7', 0], grow: 0, blur: 0, blur_type: 'gaussian' }, {
      title: 'Grow + Feather Qwen Edit Mask',
      umbra_role: 'inpaint_mask_processor',
    }),
    '9': node('TextEncodeQwenImageEditPlus', {
      prompt: ['5', 2],
      clip: ['5', 1],
      vae: ['4', 0],
      image1: ['6', 0],
    }, {
      title: 'Qwen Edit Positive + Source',
      umbra_role: 'inpaint_reference_positive_encoder',
      umbra_roles: ['inpaint_regional_positive_encoder'],
      umbra_reference_method: 'qwen_image_reference',
    }),
    '10': node('TextEncodeQwenImageEditPlus', {
      prompt: ['2', 8],
      clip: ['5', 1],
      vae: ['4', 0],
      image1: ['6', 0],
    }, {
      title: 'Qwen Edit Negative + Source',
      umbra_role: 'inpaint_reference_negative_encoder',
      umbra_roles: ['inpaint_regional_negative_encoder'],
      umbra_reference_method: 'qwen_image_reference',
    }),
    '11': cloneNode(base, '7', {
      inputs: { model: ['5', 0], shift: 3.1 },
      _meta: { title: 'Qwen Edit Model Sampling' },
    }),
    '12': node('CFGNorm', { model: ['11', 0], strength: 1 }, {
      title: 'Qwen Edit CFG Normalization',
    }),
    '13': node('VAEEncode', { pixels: ['6', 0], vae: ['4', 0] }, {
      title: 'Encode Qwen Editable Source',
    }),
    '14': node('SetLatentNoiseMask', { samples: ['13', 0], mask: ['8', 0] }, {
      title: 'Qwen Masked Source Latent',
    }),
    '15': cloneNode(base, '9', {
      inputs: {
        model: ['12', 0],
        vae: ['4', 0],
        seed: ['2', 3],
        steps: 20,
        cfg: 4,
        sampler_name: 'euler',
        scheduler: 'simple',
        positive: ['9', 0],
        negative: ['10', 0],
        latent_image: ['14', 0],
        denoise: 0.8,
        enabled: false,
        upscaler: 'Latent',
        resize_mode: 'upscale by',
        scale_by: 2,
        resize_width: 0,
        resize_height: 0,
        hires_steps: 0,
        hires_cfg: 0,
        hires_sampler_name: 'Use same',
        hires_scheduler: 'Use same',
        hires_denoise: 0.35,
      },
      _meta: {
        title: 'Sample Qwen Masked Edit',
        umbra_role: 'inpaint_sampler',
        umbra_regional_method: 'qwen_image_edit_masked_conditioning',
        umbra_regional_positive_input: 'positive',
        umbra_regional_negative_input: 'negative',
        umbra_regional_max_layers: 16,
      },
    }),
    '16': cloneNode(base, '10', {
      inputs: { samples: ['15', 0], vae: ['4', 0] },
      _meta: { title: 'Decode Qwen Edit' },
    }),
    '17': node('ImageCompositeMasked', {
      destination: ['6', 0],
      source: ['16', 0],
      x: 0,
      y: 0,
      resize_source: false,
      mask: ['8', 0],
    }, { title: 'Non-Destructive Qwen Edit Composite' }),
    '18': cloneNode(base, '13', {
      inputs: {
        images: ['17', 0],
        filename_prefix: 'UmbraUI_Inpaint_QwenEdit_%date%',
        positive_prompt: ['5', 2],
        negative_prompt: ['2', 8],
        positive: ['9', 0],
        negative: ['10', 0],
        output_folder: 'Umbra UI/inpainting',
        save_to_yyyy_mm_dd_folder: true,
        save_to_set_subfolder: false,
        set_subfolder: '',
        save_set_to_style_subfolder: '',
        model_name: ['1', 3],
        seed: ['2', 3],
        steps: 20,
        cfg: 4,
        sampler_name: 'euler',
        scheduler: 'simple',
      },
      _meta: { title: 'Save Qwen Image Edit', umbra_role: 'inpaint_output' },
    }),
  };
  await writeGraph('[Umbra UI] Qwen Image Edit Inpaint Pipeline.json', graph);
}

await buildHiDreamO1Inpaint();
await buildFlux2EditInpaint();
await buildQwenImageEditInpaint();
await buildZImageTurboInpaint();
console.log(`Generated native HiDream-O1, FLUX.2 Edit, Qwen Image Edit, and Z-Image Turbo inpaint workflows in ${workflowDirectories.length} locations.`);
