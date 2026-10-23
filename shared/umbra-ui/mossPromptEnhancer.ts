/** Add enhancement only to native MOSS graphs. Disabled jobs retain the original graph. */
export function applyMossPromptEnhancer(graph: Record<string, any>, enabled: boolean): void {
  if (!enabled) return;
  const clip = Object.entries(graph).find(([, node]) => node?.class_type === 'CLIPLoader' && node.inputs?.type === 'moss_image');
  if (!clip) return;
  const lora = Object.entries(graph).find(([, node]) => node?.class_type === 'UmbraA1111LoraSyntax');
  if (!lora) throw new Error('This MOSS workflow does not expose a supported prompt binding for enhancement.');
  const allocate = (base: string) => {
    let id = base;
    for (let n = 1; graph[id]; n++) id = `${base}_${n}`;
    return id;
  };
  let enhancer = Object.entries(graph).find(([, node]) => node?._meta?.umbra_role === 'moss_prompt_enhancer');
  if (!enhancer) {
    const id = allocate('umbra_moss_enhancer');
    const reader = Object.entries(graph).find(([, node]) => node?.class_type === 'UmbraPowerPrompterReader');
    graph[id] = {
      class_type: 'UmbraMossPromptEnhancer',
      inputs: { clip: [clip[0], 0], prompt: [lora[0], 2], seed: reader ? [reader[0], 3] : 0 },
      _meta: { title: 'MOSS Prompt Enhancer', umbra_role: 'moss_prompt_enhancer' },
    };
    const visionNodes = Object.values(graph).filter(node => node?.class_type === 'TextEncodeMOSSImageVision');
    if (visionNodes.length) {
      // Enhance the text, keeping the visual conditioning intact.
      for (const node of visionNodes) node.inputs.prompt = [id, 0];
    } else {
      const encodeId = allocate('umbra_moss_enhanced_encode');
      graph[encodeId] = { class_type: 'CLIPTextEncode', inputs: { clip: [lora[0], 1], text: [id, 0] },
        _meta: { title: 'MOSS Enhanced Positive Prompt' } };
      for (const node of Object.values(graph)) {
        for (const [name, input] of Object.entries(node.inputs || {})) {
          if (Array.isArray(input) && input[0] === lora[0] && input[1] === 3) node.inputs[name] = [encodeId, 0];
        }
      }
    }
    enhancer = [id, graph[id]];
  }
  const source = Object.entries(graph).find(([, node]) => node?.class_type === 'LoadImage'
    && (node._meta?.umbra_role === 'reference_image' || node._meta?.umbra_role === 'img2img_source' || node._meta?.title === 'Umbra Inpaint Working Image'));
  if (source) enhancer[1].inputs.image = [source[0], 0];
  // Inpaint/Canvas can create their save node after the base graph was compiled.
  for (const node of Object.values(graph)) {
    if (['UmbraLabSaveImage', 'UmbraLabSaveImageSimple'].includes(node?.class_type)) {
      node.inputs.positive_prompt = [enhancer[0], 0];
    }
  }
}

export function assertMossPromptEnhancerAvailable(graph: Record<string, any>, objectInfo: Record<string, unknown> | null): void {
  if (!Object.values(graph).some(node => node?.class_type === 'UmbraMossPromptEnhancer')) return;
  if (!objectInfo?.UmbraMossPromptEnhancer || !objectInfo?.TextGenerate) {
    throw new Error('MOSS prompt enhancement needs current ComfyUI and the bundled Umbra MOSS node. Update ComfyUI in Umbra Setup and restart it through Umbra, or turn off Prompt enhancer.');
  }
}
