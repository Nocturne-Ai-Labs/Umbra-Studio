import { videoGraphNodes } from './videoRoutePolicy';

export function isLongshotPath(path: string): boolean {
  return path === '/longshot' || path.startsWith('/longshot/');
}

// A separate community route, never a change to DaSiWa queue/capture selection.
export function isLongshotSubmission(requestUrl: string, referer: string | null, graph: unknown): boolean {
  if (!referer) return false;
  try {
    const source = new URL(referer);
    if (source.origin !== new URL(requestUrl).origin || !isLongshotPath(source.pathname)) return false;
  } catch { return false; }
  return Object.values(videoGraphNodes(graph)).some(node =>
    ['MiniMaxH3LongShot', 'MiniMaxH3Take', 'MiniMaxH3UpscaleChunk', 'MiniMaxH3SaveVideo'].includes(node.class_type));
}
