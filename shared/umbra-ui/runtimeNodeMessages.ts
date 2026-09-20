export function formatMissingUmbraUiNodes(missing: string[]): string {
  const message = `ComfyUI is missing required node classes: ${missing.join(', ') || 'unknown node class'}.`;
  return missing.includes('TextEncodeQwenImage21')
    ? `${message} Update ComfyUI through Umbra's managed update controls and restart ComfyUI to enable Qwen Image 2.1.`
    : message;
}
