import type {
  CensorReviewItem,
  CensorReviewProject,
  CensorReviewProjectSummary,
  CensorReviewSettings,
} from '../../../shared/umbra-ui/censorReview';
export * from '../../../shared/umbra-ui/censorReview';
const base = '/api/umbra-ui/censor-review/projects';
export function censorReviewId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers:
      data instanceof FormData || data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data instanceof FormData ? data : data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result && typeof result === 'object' && 'error' in result
        ? String(result.error)
        : `Review request failed (${response.status}).`,
    );
  return result as T;
}
const itemPath = (project: string, item: string) =>
  `/${encodeURIComponent(project)}/items/${encodeURIComponent(item)}`;
export const censorReviewApi = {
  list: () => request<CensorReviewProjectSummary[]>(''),
  create: (name: string) => request<CensorReviewProject>('', 'POST', { name }),
  project: (id: string) => request<CensorReviewProject>(`/${id}`),
  rename: (id: string, name: string) => request<CensorReviewProject>(`/${id}`, 'PATCH', { name }),
  item: (project: string, item: string) => request<CensorReviewItem>(itemPath(project, item)),
  import: (project: string, source: File | string, settings: CensorReviewSettings) => {
    const data = new FormData();
    data.set(typeof source === 'string' ? 'path' : 'file', source);
    data.set('settings', JSON.stringify(settings));
    return request<CensorReviewProject>(`/${project}/items`, 'POST', data);
  },
  save: (project: string, item: CensorReviewItem) =>
    request<CensorReviewItem>(itemPath(project, item.id), 'PUT', {
      revision: item.revision,
      settings: item.settings,
      rectangles: item.rectangles,
      strokes: item.strokes,
      regionEnabled: Object.fromEntries(item.regions.map((region) => [region.id, region.enabled])),
    }),
  action: (
    project: string,
    item: CensorReviewItem,
    action: 'detect' | 'render' | 'review',
    extra: Record<string, unknown> = {},
  ) =>
    request<CensorReviewItem>(`${itemPath(project, item.id)}/${action}`, 'POST', {
      revision: item.revision,
      ...extra,
    }),
  export: (project: string, item: CensorReviewItem, outputFolder: string, pinnedOutputFolder: string) =>
    request<{ item: CensorReviewItem; path: string }>(`${itemPath(project, item.id)}/export`, 'POST', {
      revision: item.revision,
      outputFolder,
      pinnedOutputFolder,
    }),
  asset: (project: string, item: string, filename: string) =>
    `${base}${itemPath(project, item)}/assets/${encodeURIComponent(filename)}`,
};

export type CensorReviewEditSnapshot = Pick<
  CensorReviewItem,
  'settings' | 'rectangles' | 'strokes' | 'regions'
>;
export function censorReviewSnapshot(item: CensorReviewItem): CensorReviewEditSnapshot {
  return {
    settings: item.settings,
    rectangles: item.rectangles,
    strokes: item.strokes,
    regions: item.regions,
  };
}
