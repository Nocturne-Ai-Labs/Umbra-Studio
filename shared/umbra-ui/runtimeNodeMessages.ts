export function formatMissingUmbraUiNodes(missing: string[]): string {
  const message = `ComfyUI is missing required node classes: ${missing.join(', ') || 'unknown node class'}.`;
  if (missing.some((name) => name === 'MiniMaxH3Director' || name === 'MiniMaxH3DirectorGuide')) {
    return `${message} Install or update the separate ComfyUI-DaSiWa-Nodes extension through Umbra's managed custom-node setup, then restart ComfyUI.`;
  }
  if (missing.some((name) => name.startsWith('MiniMaxH3') || name === 'EmptyMiniMaxH3LatentAV')) {
    return `${message} Update ComfyUI through Umbra's managed update controls and restart ComfyUI to enable the native MiniMax H3 pipeline.`;
  }
  if (missing.some((name) => ['Anima38BV2Loader', 'Anima38BV2Prompt', 'AnimaQwen35Loader'].includes(name))) {
    return `${message} Update ComfyUI and install/update comfyui-anima-3-8B through Umbra's managed custom-node setup, then restart ComfyUI. The extension needs native Anima support.`;
  }
  if (missing.includes('Anima38LoRALoaderModelOnly')) {
    return `${message} Install ComfyUI-Anima-3.8B-LoRA-Bridge through Umbra's managed custom-node setup, then restart ComfyUI.`;
  }
  if (missing.includes('UmbraAnimaQwen35CpuLoader')) {
    return `${message} Run Umbra's managed ComfyUI custom-node setup and restart ComfyUI to use Anima CPU text encoding.`;
  }
  if (missing.includes('PathchSageAttentionKJ')) {
    return `${message} Disable Sage Attention to use standard mode, or install/update KJNodes and its SageAttention dependency through the managed ComfyUI environment, then restart ComfyUI.`;
  }
  if (missing.includes('EasyCache')) {
    return `${message} Disable EasyCache to use standard mode, or update ComfyUI through Umbra's managed update controls and restart ComfyUI.`;
  }
  return missing.includes('TextEncodeQwenImage21')
    ? `${message} Update ComfyUI through Umbra's managed update controls and restart ComfyUI to enable Qwen Image 2.1.`
    : message;
}
