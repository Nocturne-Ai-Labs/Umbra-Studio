import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Preserve the reviewed shared MOSS sampling/detailer/output graph.
const directory = join(process.cwd(), 'defaults', 'PowerPrompter', 'API Workflows');
const graph = JSON.parse(await readFile(join(directory, '[Umbra UI] MOSS Image Image Pipeline.json'), 'utf8'));
graph['1']._meta.umbra_ui_pipelines[0].feature = 'ref2img';
graph['1']._meta.title = 'MOSS Reference2IMG Model';
graph.reference_image = {
  class_type: 'LoadImage', inputs: { image: 'reference.png' },
  _meta: { title: 'Reference Image', umbra_role: 'reference_image' },
};
graph.moss_vision = {
  class_type: 'TextEncodeMOSSImageVision',
  inputs: { clip: ['5', 1], prompt: ['5', 2], negative_prompt: ['2', 8], image: ['reference_image', 0],
    image_weight: 1, vision_megapixels: 1, system_prompt: '', print_prompt: false },
  _meta: { title: 'MOSS Visual Reference Prompt' },
};
for (const node of Object.values(graph) as any[]) {
  for (const [name, input] of Object.entries(node.inputs || {})) {
    if (!Array.isArray(input)) continue;
    if (input[0] === '5' && input[1] === 3) node.inputs[name] = ['moss_vision', 0];
    if (input[0] === '6' && input[1] === 0) node.inputs[name] = ['moss_vision', 1];
  }
  if (node.class_type === 'UmbraLabSaveImage') node.inputs.output_folder = 'Umbra UI/ref2img';
}
delete graph['6'];
await writeFile(join(directory, '[Umbra UI] MOSS Image Reference to Image Pipeline.json'), JSON.stringify(graph, null, 2) + '\n');
