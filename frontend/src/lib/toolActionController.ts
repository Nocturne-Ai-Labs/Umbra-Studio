import { emptyReplay, mergeActionReplay, type ActionReplay, type ActionSnapshot } from './toolActionReplay';

export interface ToolActionState {
  launchReady: boolean;
  busy: boolean;
  pending: boolean;
  action: string | null;
  actionId: string | null;
  status: ActionSnapshot['status'] | 'unknown' | null;
  replay: ActionReplay;
  error: string | null;
  transportError: string | null;
}
interface ActiveAction { tool: string; action: string; actionId?: string; startedAt: number }
interface Discovery { activeActions?: ActiveAction[]; latestByTool?: Record<string, ActionSnapshot | null> }
interface Options {
  fetch?: typeof fetch;
  pollDelay?: number;
  retryMin?: number;
  retryMax?: number;
  requestTimeout?: number;
}

export function createToolActionController(options: Options = {}) {
  const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const pollDelay = options.pollDelay ?? 1000;
  const retryMin = options.retryMin ?? 1000;
  const retryMax = options.retryMax ?? 15000;
  let state: ToolActionState = { launchReady: false, busy: false, pending: false, action: null, actionId: null, status: null, replay: emptyReplay(''), error: null, transportError: null };
  const listeners = new Set<() => void>();
  const requests = new Set<AbortController>();
  const retired = new Set<string>();
  const retire = (id: string) => {
    retired.add(id);
    if (retired.size > 64) retired.delete(retired.values().next().value!);
  };
  let epoch = 0;
  let startedAt = 0;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let live = false;
  let suspended = false;
  let disposed = false;
  let checking = false;
  let posting = false;
  let uncertain = false;
  let serverPending = false;
  let lifecycle: symbol | null = null;
  let socket: WebSocket | null = null;
  let socketTimer: ReturnType<typeof setTimeout> | null = null;
  let owners = 0;

  const publish = (patch: Partial<ToolActionState>) => {
    state = { ...state, ...patch, ...(patch.busy === true ? { launchReady: false } : {}) };
    listeners.forEach(listener => listener());
  };
  const schedule = (delay = pollDelay) => {
    if (disposed || suspended || (!live && !state.busy)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void refresh(); }, delay);
  };
  async function request(url: string, init: RequestInit = {}) {
    const controller = new AbortController();
    requests.add(controller);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(url, { ...init, signal: controller.signal });
          const data = await response.json();
          return { response, data };
        })(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
          timeout = setTimeout(() => controller.abort(), options.requestTimeout ?? 15000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      requests.delete(controller);
    }
  }
  function adopt(snapshot: ActionSnapshot, token = epoch, correlatedPost = false) {
    if (disposed || token !== epoch || !snapshot.id || retired.has(snapshot.id)) return;
    // Neither action name nor a running job identifies our unresolved local POST.
    if ((posting || uncertain) && !state.actionId && !correlatedPost) return;
    // Another server job is not exit proof for a possibly surviving lost installer.
    if (state.actionId && (state.status === 'running' || state.status === 'unknown') && snapshot.id !== state.actionId) return;
    if (snapshot.id !== state.actionId) {
      if (state.actionId && (!snapshot.startedAt || snapshot.startedAt <= startedAt)) return;
      if (state.actionId) {
        retire(state.actionId);
      }
      startedAt = snapshot.startedAt ?? 0;
      publish({ actionId: snapshot.id, action: snapshot.action ?? state.action, replay: emptyReplay(snapshot.id), status: null, error: null });
    }
    // POST only supplies an ID; hydrate its clock before comparing other jobs.
    if (snapshot.startedAt) startedAt = Math.max(startedAt, snapshot.startedAt);
    // An older running GET cannot undo a terminal WS snapshot.
    const terminal = state.status === 'completed' || state.status === 'failed' || state.status === 'unknown';
    const status = terminal && snapshot.status === 'running' ? state.status : snapshot.status ?? state.status;
    const busy = status === 'running' || status === 'unknown' || (status == null && state.busy);
    publish({
      replay: mergeActionReplay(state.replay, snapshot), status,
      busy: busy || posting || serverPending || lifecycle !== null, pending: serverPending,
      error: status === 'failed' ? snapshot.verifyFailure?.nextSteps?.[0] || snapshot.verifyFailure?.title || snapshot.error || state.error || 'Tool action failed' : status === 'completed' && state.status === 'unknown' ? null : state.error,
      transportError: null,
    });
    if (!serverPending && (status === 'completed' || status === 'failed')) uncertain = false;
  }
  function activeSample(active: ActiveAction | null | undefined) {
    if (disposed) return;
    if (active?.tool === 'comfyui') {
      serverPending = !active.actionId || (Boolean(state.actionId) && (state.status === 'running' || state.status === 'unknown') && active.actionId !== state.actionId);
      if (active.actionId) adopt({ id: active.actionId, action: active.action, startedAt: active.startedAt, status: 'running' });
      else publish({ busy: true, action: (posting || uncertain) && !state.actionId ? state.action : active.action, pending: true });
      schedule(0);
    } else if (active === null) {
      // Status/detect are cached samples: only discovery/terminal snapshots release an action.
      schedule(0);
    }
  }
  async function refresh() {
    if (disposed || checking) return;
    checking = true;
    const token = epoch;
    try {
      const { response, data } = await request('/api/tools/actions');
      if (!response.ok) throw new Error(data.error || 'Unable to discover tool actions');
      if (disposed || token !== epoch) return;
      const discovery = data as Discovery;
      const active = discovery.activeActions?.find(item => item.tool === 'comfyui');
      const latest = discovery.latestByTool?.comfyui;
      // Only authoritative discovery can release a server claim without an ID.
      serverPending = Boolean(active && (!active.actionId || (Boolean(state.actionId) && (state.status === 'running' || state.status === 'unknown') && active.actionId !== state.actionId)));
      if (active?.actionId) {
        adopt({ id: active.actionId, action: active.action, startedAt: active.startedAt, status: 'running' }, token);
      } else if (active) {
        publish({ busy: true, pending: true, action: (posting || uncertain) && !state.actionId ? state.action : active.action });
      }
      if (latest && (!active || active.actionId === latest.id)) adopt(latest, token);
      const id = state.actionId && (state.status === 'running' || state.status === 'unknown')
        ? state.actionId : active ? active.actionId : state.busy ? state.actionId : null;
      if (id) {
        const result = await request(`/api/tools/actions/${encodeURIComponent(id)}`);
        if (disposed || token !== epoch) return;
        if (result.response.status === 404 && Array.isArray(discovery.activeActions) && !active && latest === null &&
          id === state.actionId && (state.status === 'running' || state.status === 'unknown') && !posting && !serverPending && !lifecycle) {
          // Admission/history are in-memory: absence cannot prove a pre-restart installer exited.
          uncertain = true;
          publish({ busy: true, pending: false, status: 'unknown', transportError: null,
            error: 'Tool action history is unavailable. Umbra cannot confirm the previous installer stopped or completed. Check the installer process before recovering this session; no action has been retried.' });
          failures = 0;
          return;
        }
        if (!result.response.ok) throw new Error(result.data.error || 'Unable to read tool action');
        adopt(result.data, token);
      } else if (!active && !posting && token === epoch && !lifecycle) {
        if (uncertain) publish({ busy: true, pending: false, status: 'unknown' });
        else publish({ busy: false, pending: false });
      }
      if (!state.busy) {
        const readyId = state.actionId;
        const readyStatus = state.status;
        const detected = await request('/api/tools/detect');
        if (disposed || token !== epoch || state.busy || state.actionId !== readyId || state.status !== readyStatus) return;
        if (!detected.response.ok) throw new Error('Unable to verify ComfyUI installation');
        activeSample(detected.data?.comfyui?.activeAction);
        publish({ launchReady: !state.busy && detected.data?.comfyui?.launchReady === true });
      }
      failures = 0;
      if (token === epoch) publish({ transportError: null });
    } catch (error) {
      if (!disposed && token === epoch) {
        failures++;
        publish({ launchReady: false, transportError: error instanceof Error ? error.message : 'Reconnecting to tool action' });
      }
    } finally {
      checking = false;
      schedule(failures ? Math.min(retryMax, retryMin * 2 ** Math.min(failures - 1, 5)) : pollDelay);
    }
  }
  async function start(action: string, ref?: string) {
    if (disposed || state.busy || lifecycle) return false;
    if (state.actionId) retire(state.actionId);
    const token = ++epoch;
    posting = true;
    uncertain = true;
    // Acquire before POST and before React has a chance to render.
    publish({ busy: true, pending: true, action, actionId: null, status: null, error: null, transportError: null });
    schedule(pollDelay);
    try {
      const { response, data } = await request(ref === undefined ? '/api/tools/actions' : '/api/tools/comfyui/version', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ref === undefined ? { tool: 'comfyui', action } : { ref }),
      });
      if (disposed || token !== epoch) return false;
      if (!response.ok) {
        // A received rejection is definitive; a lost response is not.
        uncertain = false;
        posting = false;
        if (data.activeAction) activeSample(data.activeAction);
        if (!data.busy && !data.activeAction) publish({ busy: false, pending: false, error: data.error || 'Failed to start tool action', status: 'failed' });
        return false;
      }
      if (!data.actionId) return false;
      adopt({ id: String(data.actionId), action, status: 'running' }, token, true);
      return true;
    } catch (error) {
      if (!disposed && token === epoch) publish({ transportError: error instanceof Error ? error.message : 'Discovering pending tool action' });
      return false;
    } finally {
      if (token === epoch) { posting = false; schedule(0); }
    }
  }
  function acquireLifecycle() {
    if (disposed || state.busy || lifecycle) return null;
    const claim = Symbol('comfy-lifecycle');
    lifecycle = claim;
    publish({ busy: true });
    return () => {
      if (lifecycle !== claim) return;
      lifecycle = null;
      publish({ busy: posting || uncertain || state.status === 'running' || state.status === 'unknown' || state.pending });
      schedule(0);
    };
  }
  function receive(event: { type: string; data: Record<string, unknown> }) {
    const data = event.data;
    if (data?.tool !== 'comfyui' || typeof data.actionId !== 'string') return;
    if (data.actionId !== state.actionId) { schedule(0); return; }
    if (event.type === 'log_tool_action' && typeof data.sequence === 'number' && typeof data.message === 'string') {
      adopt({ id: data.actionId, logs: [data.message], logStart: data.sequence, logEnd: data.sequence + 1, droppedLogs: typeof data.droppedLogs === 'number' ? data.droppedLogs : 0 });
    } else if (event.type === 'log_tool_action_status') {
      adopt({ ...data, id: data.actionId } as ActionSnapshot);
      schedule(0);
    }
  }
  function connect() {
    if (!live || disposed || typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/logs`);
    socket.onopen = () => { void refresh(); };
    socket.onmessage = event => { try { receive(JSON.parse(event.data)); } catch { /* Ignore unrelated events. */ } };
    socket.onclose = () => {
      socket = null;
      if (live && !disposed) socketTimer = setTimeout(connect, Math.min(retryMax, Math.max(retryMin, pollDelay)));
    };
    socket.onerror = () => socket?.close();
  }
  const online = () => { schedule(0); };
  function stop() {
    live = false;
    suspended = true;
    if (timer) clearTimeout(timer);
    if (socketTimer) clearTimeout(socketTimer);
    timer = socketTimer = null;
    if (socket) { socket.onclose = null; socket.close(); socket = null; }
    requests.forEach(request => request.abort());
    if (typeof window !== 'undefined') window.removeEventListener('online', online);
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, refresh, adopt, activeSample, receive, acquireLifecycle,
    attach() {
      owners++;
      if (!live && !disposed) { live = true; suspended = false; schedule(0); connect(); if (typeof window !== 'undefined') window.addEventListener('online', online); }
      return () => { owners = Math.max(0, owners - 1); if (!owners) stop(); };
    },
    dispose() { disposed = true; stop(); listeners.clear(); },
  };
}

export const comfyToolActions = createToolActionController();
