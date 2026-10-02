import { normalizeOfficialVideoWorkflowSelection } from './officialVideoWorkflow';
export const VIDEO_ROUTE_POLICY_KEY = 'video.routePolicy' as const;
export type UmbraVideoRoutePolicy = 'dasiwa-only' | 'all-routes';
export type DasiwaVideoRoute = 'h3-director' | 'ltx23-omniforge';
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const isVideoOutputClass = (type: string) => /^(SaveVideo|SaveAnimatedWEBP|SaveAnimatedPNG|DaSiWa_EnhancedVideoCombine)$/.test(type)
  || /VideoCombine(?:$|[_:])/i.test(type);
export const normalizeVideoRoutePolicy = (value: unknown): UmbraVideoRoutePolicy => value === 'all-routes' ? 'all-routes' : 'dasiwa-only';
export function videoControlsPolicyIssue(value: unknown, policy: UmbraVideoRoutePolicy): string | null {
  if (policy === 'all-routes') return null;
  return 'Held by official DaSiWa video routing. Load a pinned official workflow in ComfyUI and capture its native graph, or explicitly restore All video routes to run adapted jobs. Saved settings and work are retained.';
}
export function videoGraphNodes(value: unknown): Record<string, any> {
  const document = record(value);
  const isGraph = (candidate: Record<string, any>) => Object.keys(candidate).length > 0
    && Object.values(candidate).every(node => typeof record(node).class_type === 'string' && node.class_type.trim());
  // Match Umbra's accepted root/.prompt/.output graph formats. A node ID
  // named "prompt" is still part of a root graph.
  if (isGraph(document)) return document;
  if (isGraph(record(document.prompt))) return record(document.prompt);
  if (isGraph(record(document.output))) return record(document.output);
  return {};
}
export function isVideoGenerationGraph(value: unknown): boolean {
  return Object.values(videoGraphNodes(value)).some(node => {
    const type = String(node?.class_type || '');
    const meta = record(node?._meta);
    const pipelines = Array.isArray(meta.umbra_ui_pipelines) ? meta.umbra_ui_pipelines : [];
    return meta.umbra_media_type === 'video' || pipelines.some(pipeline => ['txt2vid','img2vid','ref2vid','vid2vid'].includes(record(pipeline).feature))
      || isVideoOutputClass(type) || type === 'CreateVideo'
      || /^(MiniMaxH3|LTXV|LTXDirector|Wan.*ToVideo|WanVideo|SVD_img2vid_Conditioning)/.test(type);
  });
}
// Check only nodes connected to video outputs: an unused Director cannot
// authorize a legacy branch in the same graph.
export function dasiwaVideoGraphRoute(value: unknown): DasiwaVideoRoute | null {
  const graph = videoGraphNodes(value);
  const outputs = Object.entries(graph).filter(([,node]) => isVideoOutputClass(String(node?.class_type || '')));
  if (!outputs.length) return null;
  let route: DasiwaVideoRoute | null = null;
  for (const [id] of outputs) {
    const seen = new Set<string>();
    const visit = (nodeId: string) => {
      if (seen.has(nodeId) || !graph[nodeId]) return;
      seen.add(nodeId);
      for (const input of Object.values(record(graph[nodeId].inputs))) {
        if (Array.isArray(input) && input.length === 2 && typeof input[0] === 'string' && typeof input[1] === 'number') visit(input[0]);
      }
    };
    visit(id);
    const types = new Set([...seen].map(nodeId => graph[nodeId].class_type));
    const current: DasiwaVideoRoute | null = types.has('MiniMaxH3Director') && types.has('MiniMaxH3DirectorGuide') ? 'h3-director'
      : ['LTXDirector', 'LTXDirectorGuide', 'DaSiWa_LTX2LoraLoader', 'DaSiWa_EnhancedVideoCombine'].every(type => types.has(type)) ? 'ltx23-omniforge' : null;
    if (!current || (route && route !== current)) return null;
    route = current;
  }
  return route;
}
export function videoGenerationPolicyIssue(generationValue: unknown, policy: UmbraVideoRoutePolicy, graph?: unknown): string | null {
  if (policy === 'all-routes') return null;
  const generation = record(generationValue);
  const official = normalizeOfficialVideoWorkflowSelection(generation.officialWorkflow);
  if (official) {
    if (generation.mediaType !== 'video') return 'Held: official workflow captures require an explicit video job.';
    const expected = official.workflowId === 'h3-26' ? 'h3-director' : 'ltx23-omniforge';
    if (graph !== undefined && dasiwaVideoGraphRoute(graph) !== expected) return 'Held: the captured graph does not match its official DaSiWa workflow. Capture the pinned original again.';
    return null;
  }
  if (generation.officialWorkflow != null) return 'Held: the official workflow capture selection is invalid. Capture the pinned original again.';
  const video = record(generation.video);
  // Image generation also carries inactive normalized video defaults.
  const isVideo = generation.mediaType === 'video' || (generation.mediaType !== 'image' && Object.keys(video).length > 0)
    || ['txt2vid','img2vid','ref2vid','vid2vid'].includes(generation.outputMode) || isVideoGenerationGraph(graph);
  if (!isVideo) return null;
  if (generation.mediaType !== 'video') return 'Held: this saved job has no explicit video generation controls. Its settings are retained; choose a Dasiwa route before creating a new video job. No saved-session fallback is allowed.';
  const issue = videoControlsPolicyIssue(video, policy);
  if (issue) return issue;
  if (graph !== undefined) {
    const route = dasiwaVideoGraphRoute(graph);
    if (route !== (video.family === 'minimax_h3' ? 'h3-director' : 'ltx23-omniforge')) return 'Held: the selected workflow is not the matching Dasiwa video route. No legacy fallback is allowed.';
  }
  return null;
}
export function assertVideoGenerationPolicy(generation: unknown, policy: UmbraVideoRoutePolicy, graph?: unknown): void {
  const issue = videoGenerationPolicyIssue(generation, policy, graph);
  if (issue) throw new Error(issue);
}
export function videoGraphPolicyIssue(graph: unknown, policy: UmbraVideoRoutePolicy): string | null {
  return policy === 'dasiwa-only' && isVideoGenerationGraph(graph)
    ? 'Official DaSiWa video routing requires a verified native capture through the Umbra queue. Manual and adapted video submissions are held; All video routes is the explicit rollback.' : null;
}
