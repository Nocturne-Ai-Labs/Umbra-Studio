export function formatMissingUmbraUiNodes(missing: string[]): string {
  const message = `ComfyUI is missing required node classes: ${missing.join(', ') || 'unknown node class'}.`;
  if (missing.some((name) => name.startsWith('MiniMaxH3') || name === 'EmptyMiniMaxH3LatentAV')) {
    return `${message} Update ComfyUI through Umbra's managed update controls and restart ComfyUI to enable the native MiniMax H3 pipeline.`;
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
