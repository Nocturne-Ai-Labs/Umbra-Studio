import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Reviewed native contracts: ComfyUI 20b46065ef7f34fa21e8abebe8d0cca90a904d6d,
// Comfy-Org/workflow_templates image_flux3_klein[_distilled]_image_edit.
// The base and step-distilled checkpoints use the same nodes; users choose
// their checkpoint and sampling settings rather than a separate Turbo pipeline.
const directory = join(import.meta.dir, '..', 'defaults', 'PowerPrompter', 'API Workflows');
const template = JSON.parse(readFileSync(join(directory, '[Umbra UI] FLUX.2 Image Pipeline.json'), 'utf8'));
type Node = { class_type: string; inputs: Record<string, unknown>; _meta?: Record<string, unknown> };
type Graph = Record<string, Node>;
const node = (class_type: string, inputs: Record<string, unknown>, title: string, meta = {}): Node => ({ class_type, inputs, _meta: { title, ...meta } });

function graphFor(feature: 'txt2img' | 'img2img' | 'inpainting'): Graph {
  const edit = feature !== 'txt2img';
  const masked = feature === 'inpainting';
  const graph: Graph = {
    '1': structuredClone(template['1']),
    '2': structuredClone(template['2']),
    '3': node('CLIPLoader', { clip_name: 'qwen3vl_4b_int8_convrot.safetensors', type: 'flux3', device: 'default' }, 'FLUX.3 Qwen3-VL 4B', {
      umbra_resources: [{ id: 'flux3.text_encoder', label: 'FLUX.3 Qwen3-VL 4B', kind: 'text_encoder', input: 'clip_name', required: true, order: 10 }],
    }),
    '4': node('VAELoader', { vae_name: 'flux3/flux2-vae.safetensors' }, 'FLUX.3 VAE', {
      umbra_role: 'inpaint_reference_vae', umbra_output_index: 0,
      umbra_resources: [{ id: 'flux3.vae', label: 'FLUX.2 / FLUX.3 VAE', kind: 'vae', input: 'vae_name', required: true, order: 20 }],
    }),
    '5': structuredClone(template['5']),
    '6': node('CLIPTextEncode', { clip: ['5', 1], text: ['5', 2] }, 'FLUX.3 Positive'),
    '7': node('CLIPTextEncode', { clip: ['5', 1], text: ['2', 8] }, 'FLUX.3 Negative Prompt', { umbra_role: 'negative_prompt' }),
    '8': node('KSampler', { model: ['5', 0], positive: [edit ? '23' : '6', 0], negative: [edit ? '23' : '7', edit ? 1 : 0],
      seed: ['2', 3], steps: 16, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1, latent_image: ['9', 0] }, 'Sample FLUX.3', { umbra_role: 'inpaint_sampler' }),
    '9': node('EmptyFlux2LatentImage', { width: ['2', 4], height: ['2', 5], batch_size: ['2', 6] }, 'FLUX.3 Output Dimensions'),
    '10': node('VAEDecode', { samples: ['8', 0], vae: ['4', 0] }, 'Decode FLUX.3'),
    '11': node('UmbraImageUpscale', { image: [masked ? '24' : '10', 0], upscale_model: 'RealESRGAN_x4plus.safetensors', max_dimension: 3840, enabled: false }, 'Optional Output Upscale'),
    '12': structuredClone(template['17']),
    '20': node('Flux3LayoutPrompt', { prompt: ['2', 0], element: [] }, 'FLUX.3 Layout Regions', { umbra_role: 'edit_layout_prompt' }),
  };
  graph['1'].inputs.diffusion_model_name = 'flux3_image_klein_sd_int8_convrot.safetensors';
  graph['1']._meta = { title: 'Umbra FLUX.3 Image Klein', umbra_model_family: 'FLUX.3', umbra_ui_pipelines: [{
    feature, model_family: 'FLUX.3', model_sources: ['diffusion_model', 'unet'], priority: 100,
    ...(masked ? { inpaint_adapter: 'native_edit' } : {}),
    defaults: { modelName: 'flux3_image_klein_sd_int8_convrot.safetensors', modelNamesBySource: {
      diffusion_model: 'flux3_image_klein_sd_int8_convrot.safetensors', unet: 'flux3_image_klein_sd_int8_convrot.safetensors',
    }, steps: 16, cfg: 1, samplerName: 'euler', scheduler: 'simple', width: 1024, height: 1024, clipSkip: 1, denoise: 1 },
  }] };
  graph['2'].inputs.prompt_text = 'Describe the image or the changes to make.';
  graph['5'].inputs.prompt_text = ['20', 0];
  graph['5'].inputs.lora_strength_clip = 0;
  graph['12'].inputs = { ...graph['12'].inputs, images: ['11', 0], positive_prompt: ['5', 2], positive: [edit ? '23' : '6', 0],
    negative: [edit ? '23' : '7', edit ? 1 : 0], filename_prefix: `UmbraUI_${feature}_FLUX3_%date%`,
    output_folder: `Umbra UI/${feature}`, steps: 16, cfg: 1, sampler_name: 'euler', scheduler: 'simple' };
  graph['12']._meta = { title: 'Save FLUX.3', ...(masked ? { umbra_role: 'inpaint_output' } : {}) };
  if (edit) {
    graph['21'] = node('LoadImage', { image: 'umbra-native-source.png' }, 'FLUX.3 Editable Image', { umbra_role: masked ? 'inpaint_source' : 'img2img_source', umbra_output_index: 0 });
    graph['23'] = node('ReferenceMultiLatent', { positive: ['6', 0], negative: ['7', 0], vae: ['4', 0], resolution: 'keep resolution', 'images.image0': ['21', 0] }, 'FLUX.3 Image References', {
      umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'flux3_reference',
    });
  }
  if (masked) {
    graph['22'] = node('LoadImageMask', { image: 'umbra-native-mask.png', channel: 'red' }, 'Edit Acceptance Mask', { umbra_role: 'inpaint_mask', umbra_output_index: 0 });
    graph['25'] = node('INPAINT_ExpandMask', { mask: ['22', 0], grow: 0, blur: 0, blur_type: 'gaussian' }, 'Edit Mask Feather', { umbra_role: 'inpaint_mask_processor' });
    graph['24'] = node('ImageCompositeMasked', { destination: ['21', 0], source: ['10', 0], x: 0, y: 0, resize_source: false, mask: ['25', 0] }, 'Preserve Unedited Pixels');
  }
  if (feature === 'img2img') {
    graph['26'] = node('ImageScale', { image: ['21', 0], upscale_method: 'lanczos', width: 1024, height: 1024, crop: 'disabled' }, 'IMG2IMG Working Resolution', { umbra_role: 'img2img_resize' });
    graph['27'] = node('VAEEncode', { pixels: ['26', 0], vae: ['4', 0] }, 'Encode IMG2IMG Source', { umbra_role: 'img2img_encode' });
    graph['8'].inputs.latent_image = ['27', 0];
    graph['8']._meta.umbra_role = 'img2img_sampler';
  }
  return graph;
}

for (const [feature, title] of [['txt2img', 'Image'], ['img2img', 'Image to Image'], ['inpainting', 'Edit Inpaint']] as const) {
  writeFileSync(join(directory, `[Umbra UI] FLUX.3 ${title} Pipeline.json`), `${JSON.stringify(graphFor(feature), null, 2)}\n`);
}
console.log('Generated shared FLUX.3 base/distilled generation and native image-edit workflows.');
