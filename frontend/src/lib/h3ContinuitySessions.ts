export interface H3ContinuitySessionSummary {
  session: string;
  ready_count: number;
  latest_completed_ns: number;
}

export interface H3ContinuityCheckpoint {
  clip_id: string;
  seconds: number;
  completed_ns: number;
  filename: string;
  thumbnailUrl: string;
}

export interface H3ContinuitySelection {
  session: string;
  clipId: string | null;
}

export const H3_SESSION_NAME = /^[a-zA-Z0-9_-]{1,80}$/;
const CLIP_ID = /^[a-zA-Z0-9_-]{1,80}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeH3Sessions(value: unknown): H3ContinuitySessionSummary[] {
  if (!Array.isArray(value)) return [];
  const sessions = new Map<string, H3ContinuitySessionSummary>();
  for (const raw of value) {
    const item = record(raw);
    if (!item || typeof item.session !== 'string' || !H3_SESSION_NAME.test(item.session) || item.session === '_imports') continue;
    const count = Number(item.ready_count);
    const completed = Number(item.latest_completed_ns);
    sessions.set(item.session, {
      session: item.session,
      ready_count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
      latest_completed_ns: Number.isFinite(completed) ? Math.max(0, completed) : 0,
    });
  }
  return [...sessions.values()].sort((a, b) => b.latest_completed_ns - a.latest_completed_ns || a.session.localeCompare(b.session));
}

function thumbnailUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/api/fs/thumbnail?')) return '';
  const url = new URL(value, 'http://umbra.local');
  const path = url.searchParams.get('path') || '';
  const parts = path.replace(/\\/g, '/').split('/');
  return url.origin === 'http://umbra.local' && url.pathname === '/api/fs/thumbnail'
    && parts.slice(0, 3).join('/') === 'Tools/ComfyUI/output'
    && !parts.some(part => part === '..' || part === '.') ? value : '';
}

export function normalizeH3Checkpoints(value: unknown): H3ContinuityCheckpoint[] {
  if (!Array.isArray(value)) return [];
  const clips = new Map<string, H3ContinuityCheckpoint>();
  for (const raw of value) {
    const item = record(raw);
    if (!item || typeof item.clip_id !== 'string' || !CLIP_ID.test(item.clip_id)) continue;
    const seconds = Number(item.seconds);
    const completed = Number(item.completed_ns);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    clips.set(item.clip_id, {
      clip_id: item.clip_id,
      seconds,
      completed_ns: Number.isFinite(completed) ? Math.max(0, completed) : 0,
      filename: typeof item.filename === 'string' ? item.filename : '',
      thumbnailUrl: thumbnailUrl(item.thumbnailUrl),
    });
  }
  return [...clips.values()].sort((a, b) => b.completed_ns - a.completed_ns || a.clip_id.localeCompare(b.clip_id));
}

export function h3ContinuitySessionUrl(session: string, selected = ''): string {
  const query = selected ? `?${new URLSearchParams({ selected })}` : '';
  return `/api/umbra-ui/h3-continuity/session/${encodeURIComponent(session)}${query}`;
}

export function h3ContinuitySelectionPatch(selection: H3ContinuitySelection) {
  return {
    session: selection.session,
    sourceKind: 'checkpoint' as const,
    sourceId: selection.clipId || '',
    sourceVideoId: '',
    capture: true,
    idea: '',
  };
}
