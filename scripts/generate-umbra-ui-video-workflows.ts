import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

type NodeInputs = Record<string, unknown>;
type PromptNode = {
  class_type: string;
  inputs: NodeInputs;
  _meta?: Record<string, unknown>;
};
type PromptGraph = Record<string, PromptNode>;

const ROOT = join(import.meta.dir, '..');
const TARGET_DIRS = [
  join(ROOT, 'defaults', 'PowerPrompter', 'API Workflows'),
  join(ROOT, 'User', 'PowerPrompter', 'API Workflows'),
  join(ROOT, 'Umbra-Nodes', 'example_workflows'),
  join(ROOT, 'Umbra-Nodes', 'examples'),
];

function meta(title: string, role?: string, descriptor?: { family: 'wan22' | 'ltx23'; mode: 'text_to_video' | 'image_to_video' }) {
  return {
    title,
    ...(role ? { umbra_role: role } : {}),
    ...(descriptor ? {
      umbra_media_type: 'video',
      umbra_video_family: descriptor.family,
      umbra_video_mode: descriptor.mode,
    } : {}),
  };
}

function node(classType: string, inputs: NodeInputs, title: string, role?: string, descriptor?: { family: 'wan22' | 'ltx23'; mode: 'text_to_video' | 'image_to_video' }): PromptNode {
  return { class_type: classType, inputs, _meta: meta(title, role, descriptor) };
}

function buildWanWorkflow(mode: 'text_to_video' | 'image_to_video'): PromptGraph {
  const i2v = mode === 'image_to_video';
  const familyDescriptor = { family: 'wan22' as const, mode };
  const highModel = i2v ? 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors' : 'wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors';
  const lowModel = i2v ? 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors' : 'wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors';
  const highLora = i2v ? 'wan2.2_lightx2v_i2v_high_noise_lora.safetensors' : 'wan2.2_lightx2v_t2v_high_noise_lora.safetensors';
  const lowLora = i2v ? 'wan2.2_lightx2v_i2v_low_noise_lora.safetensors' : 'wan2.2_lightx2v_t2v_low_noise_lora.safetensors';
  const graph: PromptGraph = {
    '1': node('UNETLoader', { unet_name: highModel, weight_dtype: 'default' }, 'Wan High Noise Model', 'wan_high_model', familyDescriptor),
    '2': node('LoraLoaderModelOnly', { model: ['1', 0], lora_name: highLora, strength_model: 1 }, 'Wan High Noise LoRA', 'wan_high_lora'),
    '3': node('ModelSamplingSD3', { model: ['2', 0], shift: 5 }, 'Wan High Noise Shift', 'wan_high_shift'),
    '4': node('UNETLoader', { unet_name: lowModel, weight_dtype: 'default' }, 'Wan Low Noise Model', 'wan_low_model'),
    '5': node('LoraLoaderModelOnly', { model: ['4', 0], lora_name: lowLora, strength_model: 1 }, 'Wan Low Noise LoRA', 'wan_low_lora'),
    '6': node('ModelSamplingSD3', { model: ['5', 0], shift: 5 }, 'Wan Low Noise Shift', 'wan_low_shift'),
    '7': node('CLIPLoader', { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' }, 'Wan Text Encoder', 'wan_text_encoder'),
    '8': node('CLIPTextEncode', { clip: ['7', 0], text: 'A cinematic subject moving naturally through the scene.' }, 'Positive Prompt', 'positive_prompt'),
    '9': node('CLIPTextEncode', { clip: ['7', 0], text: 'low quality, distorted motion, flicker, bad anatomy' }, 'Negative Prompt', 'negative_prompt'),
    '10': node('VAELoader', { vae_name: 'wan_2.1_vae.safetensors' }, 'Wan VAE', 'wan_vae'),
    '12': node('KSamplerAdvanced', {
      model: ['3', 0], add_noise: 'enable', noise_seed: 0, steps: 4, cfg: 1,
      sampler_name: 'euler', scheduler: 'simple', positive: i2v ? ['11', 0] : ['8', 0],
      negative: i2v ? ['11', 1] : ['9', 0], latent_image: i2v ? ['11', 2] : ['11', 0],
      start_at_step: 0, end_at_step: 2, return_with_leftover_noise: 'enable',
    }, 'Wan High Noise Sampler', 'wan_high_sampler'),
    '13': node('KSamplerAdvanced', {
      model: ['6', 0], add_noise: 'disable', noise_seed: 0, steps: 4, cfg: 1,
      sampler_name: 'euler', scheduler: 'simple', positive: i2v ? ['11', 0] : ['8', 0],
      negative: i2v ? ['11', 1] : ['9', 0], latent_image: ['12', 0],
      start_at_step: 2, end_at_step: 4, return_with_leftover_noise: 'disable',
    }, 'Wan Low Noise Sampler', 'wan_low_sampler'),
    '14': node('VAEDecodeTiled', {
      samples: ['13', 0], vae: ['10', 0], tile_size: 768, overlap: 64, temporal_size: 64, temporal_overlap: 8,
    }, 'Wan Video Decode', 'video_decode'),
    '15': node('CreateVideo', { images: ['14', 0], fps: 16 }, 'Create Wan Video', 'video_create'),
    '16': node('SaveVideo', { video: ['15', 0], filename_prefix: 'video/Umbra_Wan', format: 'auto', codec: 'h264' }, 'Save Wan Video', 'video_output'),
  };
  if (i2v) {
    graph['17'] = node('CLIPVisionLoader', { clip_name: 'clip_vision_h.safetensors' }, 'Wan Vision Encoder', 'wan_clip_vision');
    graph['18'] = node('LoadImage', { image: 'example.png' }, 'Source Image', 'source_image');
    graph['19'] = node('CLIPVisionEncode', { clip_vision: ['17', 0], image: ['18', 0], crop: 'center' }, 'Encode Source Image');
    graph['11'] = node('WanImageToVideo', {
      positive: ['8', 0], negative: ['9', 0], vae: ['10', 0], width: 832, height: 480,
      length: 81, batch_size: 1, clip_vision_output: ['19', 0], start_image: ['18', 0],
    }, 'Wan Image to Video Latent', 'wan_video_latent');
  } else {
    graph['11'] = node('EmptyHunyuanLatentVideo', { width: 832, height: 480, length: 81, batch_size: 1 }, 'Wan Video Latent', 'wan_video_latent');
  }
  return graph;
}

function buildLtxWorkflow(mode: 'text_to_video' | 'image_to_video'): PromptGraph {
  const i2v = mode === 'image_to_video';
  const descriptor = { family: 'ltx23' as const, mode };
  const graph: PromptGraph = {
    '1': node('CheckpointLoaderSimple', { ckpt_name: 'ltx-2.3-22b-dev.safetensors' }, 'LTX-2.3 Checkpoint', 'ltx_checkpoint', descriptor),
    '2': node('LTXAVTextEncoderLoader', {
      text_encoder: 'gemma_3_12B_it_fp8_scaled.safetensors', ckpt_name: 'ltx-2.3-22b-dev.safetensors', device: 'default',
    }, 'LTX-2.3 Text Encoder', 'ltx_text_encoder'),
    '3': node('LoraLoaderModelOnly', {
      model: ['1', 0], lora_name: 'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors', strength_model: 0.5,
    }, 'LTX Distilled Model LoRA', 'ltx_distilled_lora'),
    '4': node('LoraLoader', {
      model: ['3', 0], clip: ['2', 0], lora_name: 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors', strength_model: 1, strength_clip: 1,
    }, 'LTX Prompt LoRA', 'ltx_prompt_lora'),
    '5': node('CLIPTextEncode', { clip: ['4', 1], text: 'A cinematic subject moving naturally through the scene.' }, 'Positive Prompt', 'positive_prompt'),
    '6': node('CLIPTextEncode', { clip: ['4', 1], text: 'low quality, distorted motion, flicker, bad anatomy' }, 'Negative Prompt', 'negative_prompt'),
    '7': node('LTXVConditioning', { positive: ['5', 0], negative: ['6', 0], frame_rate: 25 }, 'LTX Video Conditioning', 'ltx_conditioning'),
    '8': node('EmptyLTXVLatentVideo', { width: 640, height: 360, length: 121, batch_size: 1 }, 'LTX Base Video Latent', i2v ? 'ltx_empty_video_latent' : 'ltx_base_video_latent'),
    '9': node('LTXVAudioVAELoader', { ckpt_name: 'ltx-2.3-22b-dev.safetensors' }, 'LTX Audio VAE', 'ltx_audio_vae'),
    '10': node('LTXVEmptyLatentAudio', { frames_number: 121, frame_rate: 25, batch_size: 1, audio_vae: ['9', 0] }, 'LTX Empty Audio', 'ltx_empty_audio'),
    '11': node('LTXVConcatAVLatent', { video_latent: [i2v ? '33' : '8', 0], audio_latent: ['10', 0] }, 'LTX Base AV Latent', 'ltx_base_concat'),
    '12': node('RandomNoise', { noise_seed: 0 }, 'LTX Base Noise', 'ltx_base_noise'),
    '13': node('CFGGuider', { model: ['4', 0], positive: ['7', 0], negative: ['7', 1], cfg: 1 }, 'LTX Base Guidance', 'ltx_base_cfg'),
    '14': node('KSamplerSelect', { sampler_name: 'euler' }, 'LTX Base Sampler', 'ltx_base_sampler'),
    '15': node('ManualSigmas', { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' }, 'LTX Base Sigmas', 'ltx_base_sigmas'),
    '16': node('SamplerCustomAdvanced', { noise: ['12', 0], guider: ['13', 0], sampler: ['14', 0], sigmas: ['15', 0], latent_image: ['11', 0] }, 'LTX Base Sample', 'ltx_base_sample'),
    '17': node('LTXVSeparateAVLatent', { av_latent: ['16', 0] }, 'Separate LTX Base AV', 'ltx_base_separate'),
    '18': node('LatentUpscaleModelLoader', { model_name: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors' }, 'LTX Latent Upscaler', 'ltx_upscale_model'),
    '19': node('LTXVLatentUpsampler', { samples: ['17', 0], upscale_model: ['18', 0], vae: ['1', 2] }, 'LTX Spatial Upscale', 'ltx_upscale'),
    '20': node('LTXVConcatAVLatent', { video_latent: [i2v ? '34' : '19', 0], audio_latent: ['17', 1] }, 'LTX Refine AV Latent', 'ltx_refine_concat'),
    '21': node('RandomNoise', { noise_seed: 0 }, 'LTX Refine Noise', 'ltx_refine_noise'),
    '22': node('CFGGuider', { model: ['4', 0], positive: ['7', 0], negative: ['7', 1], cfg: 1 }, 'LTX Refine Guidance', 'ltx_refine_cfg'),
    '23': node('KSamplerSelect', { sampler_name: 'euler' }, 'LTX Refine Sampler', 'ltx_refine_sampler'),
    '24': node('ManualSigmas', { sigmas: '0.85, 0.7250, 0.4219, 0.0' }, 'LTX Refine Sigmas', 'ltx_refine_sigmas'),
    '25': node('SamplerCustomAdvanced', { noise: ['21', 0], guider: ['22', 0], sampler: ['23', 0], sigmas: ['24', 0], latent_image: ['20', 0] }, 'LTX Refine Sample', 'ltx_refine_sample'),
    '26': node('LTXVSeparateAVLatent', { av_latent: ['25', 0] }, 'Separate LTX Refined AV', 'ltx_refine_separate'),
    '27': node('VAEDecodeTiled', { samples: ['26', 0], vae: ['1', 2], tile_size: 768, overlap: 64, temporal_size: 64, temporal_overlap: 8 }, 'LTX Video Decode', 'video_decode'),
    '28': node('LTXVAudioVAEDecode', { samples: ['26', 1], audio_vae: ['9', 0] }, 'LTX Audio Decode', 'ltx_audio_decode'),
    '29': node('CreateVideo', { images: ['27', 0], audio: ['28', 0], fps: 25 }, 'Create LTX Video', 'video_create'),
    '30': node('SaveVideo', { video: ['29', 0], filename_prefix: 'video/Umbra_LTX23', format: 'auto', codec: 'h264' }, 'Save LTX Video', 'video_output'),
  };
  if (i2v) {
    graph['31'] = node('LoadImage', { image: 'example.png' }, 'Source Image', 'source_image');
    graph['32'] = node('ImageScale', { image: ['31', 0], upscale_method: 'lanczos', width: 1280, height: 720, crop: 'center' }, 'Scale Source Image', 'source_image_scale');
    graph['35'] = node('LTXVPreprocess', { image: ['32', 0], img_compression: 18 }, 'LTX Source Preprocess', 'ltx_preprocess');
    graph['33'] = node('LTXVImgToVideoInplace', { vae: ['1', 2], image: ['35', 0], latent: ['8', 0], strength: 0.7, bypass: false }, 'LTX Base Image Conditioning', 'ltx_base_video_latent');
    graph['34'] = node('LTXVImgToVideoInplace', { vae: ['1', 2], image: ['35', 0], latent: ['19', 0], strength: 1, bypass: false }, 'LTX Refine Image Conditioning', 'ltx_refine_video_latent');
  }
  return graph;
}

const workflows: Array<[string, PromptGraph]> = [
  ['[Umbra UI] WAN 2.2 Text to Video.json', buildWanWorkflow('text_to_video')],
  ['[Umbra UI] WAN 2.2 Image to Video.json', buildWanWorkflow('image_to_video')],
  ['[Umbra UI] LTX-2.3 Text to Video.json', buildLtxWorkflow('text_to_video')],
  ['[Umbra UI] LTX-2.3 Image to Video.json', buildLtxWorkflow('image_to_video')],
];

for (const targetDir of TARGET_DIRS) {
  mkdirSync(targetDir, { recursive: true });
  for (const [fileName, graph] of workflows) {
    writeFileSync(join(targetDir, fileName), `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  }
}

console.log(`Generated ${workflows.length} Umbra UI video workflows in ${TARGET_DIRS.length} locations.`);
