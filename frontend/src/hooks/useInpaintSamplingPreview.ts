import { useEffect, useState } from 'react';
import { isUmbraUiInpaintJobTerminal, type UmbraUiInpaintJob, type UmbraUiInpaintPreviewEvent } from '@/lib/umbraUiInpaint';

export function useInpaintSamplingPreview(job: UmbraUiInpaintJob | null) {
  const [live, setLive] = useState<UmbraUiInpaintPreviewEvent | null>(null);
  const jobId = job?.id;
  const running = !!job && !isUmbraUiInpaintJobTerminal(job);
  useEffect(() => {
    setLive(null);
    if (!running || !jobId) return;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/inpaint-preview`);
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse(String(event.data));
          const preview = message?.data as UmbraUiInpaintPreviewEvent;
          if (message?.type !== 'umbra_ui_inpaint_preview' || preview?.jobId !== jobId) return;
          if (typeof preview.active !== 'boolean' || !Number.isFinite(preview.updatedAt)) return;
          setLive((current) => !current || preview.updatedAt >= current.updatedAt ? preview : current);
        } catch { /* Ignore unrelated or malformed websocket messages. */ }
      };
      socket.onclose = () => { if (!disposed) reconnectTimer = window.setTimeout(connect, 1500); };
    };
    connect();
    return () => { disposed = true; window.clearTimeout(reconnectTimer); socket?.close(); };
  }, [jobId, running]);
  if (!job || !running) return null;
  const event = live?.jobId === job.id ? live : null;
  const snapshot = job.preview;
  const preview = event && (!snapshot || event.updatedAt >= snapshot.updatedAt) ? event : snapshot;
  if (!preview || preview.jobId !== job.id || typeof preview.imageDataUrl !== 'string' || ('active' in preview && preview.active === false)) return null;
  if (!job.items.some((item) => item.id === preview.itemId
    && (item.status === 'queued' || item.status === 'running')
    && (!preview.promptId || !item.promptId || item.promptId === preview.promptId))) return null;
  return preview;
}
