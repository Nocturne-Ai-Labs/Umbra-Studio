export type UmbraSamDeviceMode = 'CPU' | 'AUTO' | 'Prefer GPU';

export interface UmbraSamPoint {
  x: number;
  y: number;
  positive: boolean;
}

export interface UmbraSamBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectUmbraSamMaskRequest {
  image: Blob;
  modelName: string;
  deviceMode: UmbraSamDeviceMode;
  threshold: number;
  points: UmbraSamPoint[];
  box?: UmbraSamBox | null;
}

export interface UmbraClipSegCapabilities {
  available: boolean;
  modelId: string;
  supportsPrompt: boolean;
}

export interface DetectUmbraClipSegMaskRequest {
  image: Blob;
  prompt: string;
  deviceMode: UmbraSamDeviceMode;
  threshold: number;
}

async function readAssistedSelectionError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    const message = String(payload?.error || '').trim();
    if (message) return message;
  }
  const text = (await response.text().catch(() => '')).trim();
  return text || `Assisted selection failed (${response.status}).`;
}

export async function detectUmbraSamMask(request: DetectUmbraSamMaskRequest): Promise<Blob> {
  const modelName = String(request.modelName || '').trim();
  if (!modelName) throw new Error('Choose a SAM model before using assisted selection.');
  if (request.points.length <= 0 && !request.box) {
    throw new Error('Add at least one positive point or a box guide.');
  }

  const form = new FormData();
  form.append('image', request.image, `umbra-sam-${Date.now()}.png`);
  form.append('model_name', modelName);
  form.append('device_mode', request.deviceMode);
  form.append('threshold', String(Math.max(0, Math.min(1, request.threshold))));
  form.append('points', JSON.stringify(request.points));
  if (request.box) form.append('box', JSON.stringify(request.box));

  const response = await fetch('/comfy/umbra/sam/detect', {
    method: 'POST',
    body: form,
  });
  if (!response.ok) throw new Error(await readAssistedSelectionError(response));
  const mask = await response.blob();
  if (!mask.size) throw new Error('SAM returned an empty mask.');
  return mask;
}

export async function fetchUmbraClipSegCapabilities(signal?: AbortSignal): Promise<UmbraClipSegCapabilities> {
  const response = await fetch('/comfy/umbra/clipseg/capabilities', { cache: 'no-store', signal });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) throw new Error(String(payload.error || 'Text-selection capabilities are unavailable.'));
  return {
    available: payload.available === true,
    modelId: String(payload.modelId || '').trim(),
    supportsPrompt: payload.supportsPrompt === true,
  };
}

export async function installUmbraClipSegModel(): Promise<UmbraClipSegCapabilities> {
  const response = await fetch('/comfy/umbra/clipseg/install', { method: 'POST' });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) throw new Error(String(payload.error || 'Text-selection model installation failed.'));
  return {
    available: payload.available === true,
    modelId: String(payload.modelId || '').trim(),
    supportsPrompt: true,
  };
}

export async function detectUmbraClipSegMask(request: DetectUmbraClipSegMaskRequest): Promise<Blob> {
  const prompt = String(request.prompt || '').trim();
  if (!prompt) throw new Error('Enter an object or region to select.');
  const form = new FormData();
  form.append('image', request.image, `umbra-text-selection-${Date.now()}.png`);
  form.append('prompt', prompt);
  form.append('device_mode', request.deviceMode);
  form.append('threshold', String(Math.max(0, Math.min(1, request.threshold))));
  const response = await fetch('/comfy/umbra/clipseg/detect', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await readAssistedSelectionError(response));
  const mask = await response.blob();
  if (!mask.size) throw new Error('Text selection returned an empty mask.');
  return mask;
}
