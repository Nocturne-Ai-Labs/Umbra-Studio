const STORAGE_KEY = 'umbra-ui:img2img-replacement-intents:v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LIMIT = 100;

export interface Img2ImgReplacementIntent {
  originalPath: string;
  queuedAt: number;
}

function prune(intents: Map<string, Img2ImgReplacementIntent>): void {
  const now = Date.now();
  for (const [requestId, intent] of intents) {
    if (!requestId || !intent.originalPath || !Number.isFinite(intent.queuedAt)
      || intent.queuedAt > now || now - intent.queuedAt > MAX_AGE_MS) {
      intents.delete(requestId);
    }
  }
  const oldest = [...intents.entries()].sort((left, right) => left[1].queuedAt - right[1].queuedAt);
  for (const [requestId] of oldest.slice(0, Math.max(0, oldest.length - LIMIT))) intents.delete(requestId);
}

export function readImg2ImgReplacementIntents(): Map<string, Img2ImgReplacementIntent> {
  const intents = new Map<string, Img2ImgReplacementIntent>();
  if (typeof window === 'undefined') return intents;
  try {
    const entries = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || !entry[1] || typeof entry[1] !== 'object') continue;
        const requestId = String(entry[0] || '').trim();
        const originalPath = String(entry[1].originalPath || '').trim();
        const queuedAt = Number(entry[1].queuedAt);
        if (requestId && originalPath) intents.set(requestId, { originalPath, queuedAt });
      }
    }
  } catch { /* A missing or unavailable journal cannot authorize a replacement. */ }
  prune(intents);
  return intents;
}

export function writeImg2ImgReplacementIntents(intents: Map<string, Img2ImgReplacementIntent>): boolean {
  prune(intents);
  if (typeof window === 'undefined') return false;
  try {
    if (intents.size > 0) window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...intents]));
    else window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch { return false; }
}
