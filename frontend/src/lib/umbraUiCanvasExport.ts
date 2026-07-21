export interface UmbraUiCanvasSaveMetadata {
  canvasProjectId: string;
  documentName: string;
  operationMode: 'inpaint' | 'outpaint';
  regionOnly: boolean;
  prompt: string;
  negativePrompt: string;
  checkpointName: string;
  modelFamily: string;
  modelSource: string;
  loras: Array<{
    id: string;
    name: string;
    enabled: boolean;
    strengthModel: number;
    strengthClip: number;
  }>;
  seed: number;
  steps: number;
  cfg: number;
  clipSkip: number;
  samplerName: string;
  scheduler: string;
  samples: number;
  denoise: number;
  maskGrow: number;
  maskFeather: number;
  contextPadding: number;
  processingScaleMode: 'none' | 'auto' | 'manual';
  processingWidth: number;
  processingHeight: number;
  coherenceMode: 'none' | 'gaussian' | 'box' | 'staged';
  coherenceEdgeSize: number;
  coherenceMinimumDenoise: number;
  seamlessX: boolean;
  seamlessY: boolean;
  outputOnlyMaskedRegions: boolean;
  fillMode: 'neutral' | 'telea' | 'navier-stokes' | 'color' | 'tile' | 'lama';
  infillColor: string;
  infillTileSize: number;
  inpaintModelName: string;
  colorMatch: number;
  differentialStrength: number;
  regionalGuidanceCount: number;
  controlLayerCount: number;
  referenceLayerCount: number;
  width: number;
  height: number;
}

export interface UmbraUiCanvasSaveResult {
  path: string;
  filename: string;
}

export async function saveUmbraUiCanvasToGallery(
  image: Blob,
  name: string,
  metadata: UmbraUiCanvasSaveMetadata,
  signal?: AbortSignal,
): Promise<UmbraUiCanvasSaveResult> {
  if (!image.size) throw new Error('The rendered canvas is empty.');
  const form = new FormData();
  form.append('image', image, `${String(name || 'umbra-canvas').replace(/\.png$/i, '')}.png`);
  form.append('name', name);
  form.append('metadata', JSON.stringify(metadata));
  const response = await fetch('/api/umbra-ui/canvas/save', { method: 'POST', body: form, signal });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.success !== true) {
    throw new Error(String(payload.error || `Failed to save the canvas (${response.status}).`));
  }
  return {
    path: String(payload.path || '').trim(),
    filename: String(payload.filename || '').trim(),
  };
}
