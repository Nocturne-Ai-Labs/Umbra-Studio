import { useCallback, useEffect, useRef, useState } from 'react';
import { createPrompterWsUrl } from '@/components/power-prompter/powerPrompterSupport';
import { controlUmbraQueueActivity, getUmbraQueueActivityControls, useUmbraQueueActivities } from '@/lib/umbraQueueActivity';

type Payload = Record<string, unknown>;
const record = (value: unknown): Payload => value && typeof value === 'object' ? value as Payload : {};

export interface FilmstripRunningJob {
  requestId: string;
  promptId: string;
  prompt: string | undefined;
  origin: string;
  targetBridgeId: string;
}

export function readFilmstripRunningJob(value: unknown): FilmstripRunningJob | null {
  const snapshot = record(value);
  const requests: unknown[] = Array.isArray(snapshot.requests) ? snapshot.requests : [];
  const readRequest = (value: unknown): FilmstripRunningJob | null => {
    const request = record(value);
    if (request.status !== 'running') return null;
    const prompts: unknown[] = Array.isArray(request.prompts) ? request.prompts : [];
    const prompt = record(prompts.find((entry) => record(entry).status === 'running' && String(record(entry).promptId || '').trim()));
    if (!prompt.promptId || !request.requestId) return null;
    return {
      requestId: String(request.requestId), promptId: String(prompt.promptId),
      prompt: typeof prompt.prompt === 'string' ? prompt.prompt : undefined,
      origin: String(request.origin || ''), targetBridgeId: String(request.pipelineId || ''),
    };
  };
  const active = requests.find((request) => record(request).requestId === snapshot.activeRequestId);
  const activeJob = readRequest(active);
  if (activeJob) return activeJob;
  for (const request of requests) {
    const job = readRequest(request);
    if (job) return job;
  }
  return null;
}

export function filmstripSkipMessage(job: FilmstripRunningJob, requestId: string) {
  return {
    type: 'queue_interrupt_active', requestId, activeRequestId: job.requestId,
    promptId: job.promptId, queueTargetType: 'pipeline', targetBridgeId: job.targetBridgeId || undefined,
  };
}

export function useFilmstripGeneration(previewsEnabled: boolean) {
  const activities = useUmbraQueueActivities();
  const [runningJob, setRunningJob] = useState<FilmstripRunningJob | null>(null);
  const [preview, setPreview] = useState<Payload | null>(null);
  const [skipPending, setSkipPending] = useState(false);
  const busyRef = useRef(false);
  const enabledRef = useRef(previewsEnabled);
  enabledRef.current = previewsEnabled;
  const socketRef = useRef<WebSocket | null>(null);
  const jobRef = useRef<FilmstripRunningJob | null>(null);
  const pendingRef = useRef<{ id: string; resolve: () => void; reject: (error: Error) => void; timer: number } | null>(null);

  useEffect(() => {
    if (!previewsEnabled) setPreview(null);
  }, [previewsEnabled]);

  useEffect(() => {
    let disposed = false;
    let reconnect: number | undefined;
    const rejectPending = (message: string) => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      window.clearTimeout(pending.timer);
      pending.reject(new Error(message));
    };
    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(createPrompterWsUrl());
      socketRef.current = socket;
      socket.onopen = () => socket.send(JSON.stringify({
        type: 'register', compactQueueSnapshots: true, role: 'powerprompter', source: 'filmstrip',
      }));
      socket.onmessage = (event) => {
        if (disposed || socketRef.current !== socket) return;
        let payload: Payload;
        try { payload = record(JSON.parse(String(event.data))); } catch { return; }
        if (payload.type === 'queue_snapshot') {
          const job = readFilmstripRunningJob(payload.snapshot);
          jobRef.current = job;
          setRunningJob(job);
          setPreview((current) => current && job && current.requestId === job.requestId && current.promptId === job.promptId ? current : null);
        } else if (payload.type === 'generation_preview' && enabledRef.current) {
          const job = jobRef.current;
          if (!job || payload.requestId !== job.requestId || payload.promptId !== job.promptId) return;
          if (!String(payload.imageDataUrl || '').startsWith('data:image/')) return;
          setPreview({ ...payload, prompt: typeof payload.prompt === 'string' ? payload.prompt : job.prompt });
        } else if (payload.type === 'job_progress') {
          setPreview((current) => current && payload.requestId === current.requestId && payload.promptId === current.promptId
            ? { ...current, step: payload.step, maxStep: payload.maxStep, updatedAt: Date.now() } : current);
        } else if (payload.type === 'queue_interrupt_result' && payload.requestId === pendingRef.current?.id) {
          const pending = pendingRef.current;
          if (!pending) return;
          pendingRef.current = null;
          window.clearTimeout(pending.timer);
          if (payload.success === true) pending.resolve();
          else pending.reject(new Error(String(payload.error || 'Failed to skip current generation.')));
        }
      };
      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        jobRef.current = null;
        setRunningJob(null);
        setPreview(null);
        rejectPending('Queue service disconnected. Refresh the queue before retrying.');
        if (!disposed) reconnect = window.setTimeout(connect, 2500);
      };
    };
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnect);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
      rejectPending('Filmstrip disconnected from the queue service.');
    };
  }, []);

  const activity = activities.find((entry) => entry.status === 'running' && !entry.cancelRequested && getUmbraQueueActivityControls(entry).skip);
  const canSkip = Boolean(runningJob || activity);
  const skip = useCallback(async () => {
    if (busyRef.current || !canSkip) return;
    busyRef.current = true;
    setSkipPending(true);
    try {
      const job = jobRef.current;
      if (job) {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Queue service is disconnected.');
        const id = crypto.randomUUID();
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            pendingRef.current = null;
            reject(new Error('Skip request timed out. Refresh the queue before retrying.'));
          }, 20_000);
          pendingRef.current = { id, resolve, reject, timer };
          try { socket.send(JSON.stringify(filmstripSkipMessage(job, id))); }
          catch (error) {
            window.clearTimeout(timer);
            pendingRef.current = null;
            reject(error);
          }
        });
      } else if (activity) {
        await controlUmbraQueueActivity(activity, 'skip');
      }
    } finally {
      busyRef.current = false;
      setSkipPending(false);
    }
  }, [activity, canSkip]);

  return { preview, runningJob, canSkip, skipPending, skip };
}
