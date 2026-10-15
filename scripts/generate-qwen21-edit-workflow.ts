import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Native contract: ComfyUI 20b46065, TextEncodeQwenImage21. The encoder
// supplies both conditioning streams and the correctly shaped 64-channel latent.
const directory = join(import.meta.dir, '..', 'defaults', 'PowerPrompter', 'API Workflows');
const graph = JSON.parse(readFileSync(join(directory, '[Umbra UI] Qwen Image 2.1 Image Pipeline.json'), 'utf8'));
const legacy = JSON.parse(readFileSync(join(directory, '[Umbra UI] Qwen Image Pipeline.json'), 'utf8'));
const descriptor = graph['1']._meta.umbra_ui_pipelines[0];
Object.assign(descriptor, { feature: 'inpainting', inpaint_adapter: 'native_edit', instruction_editing: true });
descriptor.defaults.denoise = 1;
graph['1']._meta.title = 'Qwen Image 2.1 Native Edit';
graph['2'].inputs.prompt_text = 'Describe the changes to <image1>. Keep everything else unchanged.';
graph['4']._meta.umbra_role = 'inpaint_reference_vae';
graph['10'] = structuredClone(legacy['5']);
graph['10'].inputs.model = ['1', 0];
graph['10'].inputs.clip = ['3', 0];
graph['10'].inputs.prompt_text = ['2', 0];
graph['10'].inputs.lora_strength_clip = 0;
graph['5'].inputs = {
  clip: ['10', 1], prompt: ['10', 2], negative_prompt: ['2', 8],
  vae: ['4', 0], resolution: 0, 'images.image_1': ['6', 0],
};
graph['5']._meta = {
  title: 'Qwen Image 2.1 Source + Reference Conditioning',
  umbra_role: 'inpaint_reference_sink', umbra_reference_method: 'qwen_image21_reference',
};
graph['6'] = { class_type: 'LoadImage', inputs: { image: 'umbra-native-source.png' },
  _meta: { title: 'Editable Source Image', umbra_role: 'inpaint_source', umbra_output_index: 0 } };
graph['11'] = { class_type: 'LoadImageMask', inputs: { image: 'umbra-native-mask.png', channel: 'red' },
  _meta: { title: 'Edit Mask', umbra_role: 'inpaint_mask', umbra_output_index: 0 } };
graph['12'] = { class_type: 'INPAINT_ExpandMask', inputs: { mask: ['11', 0], grow: 0, blur: 0, blur_type: 'gaussian' },
  _meta: { title: 'Grow + Feather Edit Mask', umbra_role: 'inpaint_mask_processor' } };
graph['7'].inputs.model = ['10', 0];
graph['7'].inputs.latent_image = ['5', 2];
graph['7']._meta.umbra_role = 'inpaint_sampler';
// Masking happens after generation so reference conditioning stays intact.
graph['13'] = { class_type: 'ImageCompositeMasked', inputs: {
  destination: ['6', 0], source: ['8', 0], x: 0, y: 0, resize_source: true, mask: ['12', 0],
}, _meta: { title: 'Preserve Unedited Source' } };
graph['9'].inputs.images = ['13', 0];
graph['9'].inputs.positive_prompt = ['10', 2];
graph['9'].inputs.filename_prefix = 'UmbraUI_Edit_Qwen21_%date%';
graph['9'].inputs.output_folder = 'Umbra UI/inpainting';
graph['9']._meta.umbra_role = 'inpaint_output';
writeFileSync(join(directory, '[Umbra UI] Qwen Image 2.1 Edit Inpaint Pipeline.json'), `${JSON.stringify(graph, null, 2)}\n`);
