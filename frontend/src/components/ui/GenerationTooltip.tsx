'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, AlertCircle, Clock, ListChecks } from 'lucide-react';

interface GenerationTooltipProps {
  backend: 'comfyui';
  children: React.ReactNode;
  delay?: number;
  powerPrompterQueue?: PowerPrompterQueueTooltipStatus | null;
}

export interface PowerPrompterQueueTooltipStatus {
  total: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
  position: number;
  remaining: number;
  activePrompt: string;
  nextPrompt: string;
  statusLabel: string;
  previewImageDataUrl: string;
  previewStepLabel: string;
  estimatedMsRemaining?: number | null;
  updatedAt: number;
}

function normalizePowerPrompterQueueStatus(detail: Partial<PowerPrompterQueueTooltipStatus> | null | undefined): PowerPrompterQueueTooltipStatus | null {
  const total = Math.max(0, Math.floor(Number(detail?.total) || 0));
  const previewImageDataUrl = String(detail?.previewImageDataUrl || '').trim();
  if (total <= 0 && !previewImageDataUrl) return null;
  return {
    total,
    running: Math.max(0, Math.floor(Number(detail?.running) || 0)),
    pending: Math.max(0, Math.floor(Number(detail?.pending) || 0)),
    completed: Math.max(0, Math.floor(Number(detail?.completed) || 0)),
    failed: Math.max(0, Math.floor(Number(detail?.failed) || 0)),
    position: Math.max(0, Math.floor(Number(detail?.position) || 0)),
    remaining: Math.max(0, Math.floor(Number(detail?.remaining) || 0)),
    activePrompt: String(detail?.activePrompt || '').trim(),
    nextPrompt: String(detail?.nextPrompt || '').trim(),
    statusLabel: String(detail?.statusLabel || '').trim(),
    previewImageDataUrl,
    previewStepLabel: String(detail?.previewStepLabel || '').trim(),
    estimatedMsRemaining: Number.isFinite(Number(detail?.estimatedMsRemaining))
      ? Math.max(0, Math.floor(Number(detail?.estimatedMsRemaining)))
      : null,
    updatedAt: Math.max(0, Math.floor(Number(detail?.updatedAt) || Date.now())),
  };
}

function formatQueueEtaDuration(ms: number | null | undefined): string {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  const totalSeconds = Math.max(0, Math.ceil(numeric / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function GenerationTooltip({ backend, children, delay = 500, powerPrompterQueue = null }: GenerationTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [livePowerPrompterQueue, setLivePowerPrompterQueue] = useState<PowerPrompterQueueTooltipStatus | null>(null);
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    setMounted(true);
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/umbrabridge/${backend}/queue`);
      if (!isMountedRef.current) return;
      if (res.ok) {
        setData(await res.json());
      } else {
        setData({ error: 'Failed to fetch' });
      }
    } catch {
      if (isMountedRef.current) setData({ error: 'Offline' });
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [backend]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchorRect(rect);
    setPosition({ x: rect.right + 12, y: rect.top + rect.height / 2 });
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      fetchStatus();
      pollIntervalRef.current = setInterval(fetchStatus, 2000);
    }, delay);
  }, [delay, fetchStatus]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setIsVisible(false);
    setData(null);
    setAnchorRect(null);
    setLivePowerPrompterQueue(null);
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const onQueueStatus = (event: Event) => {
      setLivePowerPrompterQueue(
        normalizePowerPrompterQueueStatus((event as CustomEvent<Partial<PowerPrompterQueueTooltipStatus>>).detail),
      );
    };
    window.addEventListener('umbra:powerprompter-queue-status', onQueueStatus as EventListener);
    return () => {
      window.removeEventListener('umbra:powerprompter-queue-status', onQueueStatus as EventListener);
    };
  }, [isVisible]);

  const updateTooltipPosition = useCallback(() => {
    if (!anchorRect) return;
    const tooltip = tooltipRef.current;
    const width = tooltip?.offsetWidth || 372;
    const height = tooltip?.offsetHeight || 320;
    const viewportPadding = 12;
    const gap = 12;
    const styles = window.getComputedStyle(document.documentElement);
    const filmstripOffset = Number.parseFloat(styles.getPropertyValue('--umbra-filmstrip-toast-offset')) || 0;
    const maxTop = Math.max(
      viewportPadding,
      window.innerHeight - filmstripOffset - height - viewportPadding,
    );
    const centeredTop = anchorRect.top + anchorRect.height / 2 - height / 2;
    const top = Math.min(Math.max(viewportPadding, centeredTop), maxTop);
    let left = anchorRect.right + gap;
    const maxLeft = window.innerWidth - width - viewportPadding;
    if (left > maxLeft) {
      left = anchorRect.left - width - gap;
    }
    left = Math.min(Math.max(viewportPadding, left), Math.max(viewportPadding, maxLeft));
    setPosition({ x: left, y: top });
  }, [anchorRect]);

  useEffect(() => {
    if (!isVisible) return;
    updateTooltipPosition();
    const handleResize = () => updateTooltipPosition();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, isLoading, isVisible, livePowerPrompterQueue, powerPrompterQueue, updateTooltipPosition]);

  const readQueueNumber = (item: any, fallback: number): number => {
    const value = Array.isArray(item) ? item[0] : (item?.number ?? item?.queueNumber ?? item?.id);
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const readQueueLabel = (item: any, fallback: string): string => {
    if (Array.isArray(item)) {
      const promptId = String(item[1] || '').trim();
      if (promptId) return promptId;
      const workflow = item[2];
      if (workflow && typeof workflow === 'object') {
        const title = String((workflow as any)?.title || (workflow as any)?.name || '').trim();
        if (title) return title;
      }
      return fallback;
    }
    return String(item?.prompt_id || item?.label || item?.name || item?.id || fallback).trim();
  };

  const renderComfyContent = () => {
    if (!data) return null;
    if (data.error) return <ErrorState message={data.error} />;

    const running = data.queue_running || [];
    const pending = data.queue_pending || [];
    const rawTotal = running.length + pending.length;
    const effectivePowerPrompterQueue = livePowerPrompterQueue || powerPrompterQueue;
    const prompterTotal = Math.max(0, Math.floor(Number(effectivePowerPrompterQueue?.total) || 0));
    const usingPrompterQueue = prompterTotal > rawTotal;
    const total = usingPrompterQueue ? prompterTotal : rawTotal;
    const runningCount = usingPrompterQueue ? Math.max(0, Math.floor(Number(effectivePowerPrompterQueue?.running) || 0)) : running.length;
    const pendingCount = usingPrompterQueue ? Math.max(0, Math.floor(Number(effectivePowerPrompterQueue?.pending) || 0)) : pending.length;
    const liveRemaining = runningCount + pendingCount;
    const remaining = usingPrompterQueue
      ? (liveRemaining > 0 ? liveRemaining : Math.max(0, Math.floor(Number(effectivePowerPrompterQueue?.remaining) || 0)))
      : liveRemaining;
    const activeLabel = usingPrompterQueue
      ? String(effectivePowerPrompterQueue?.activePrompt || '').trim()
      : (running.length > 0 ? readQueueLabel(running[0], 'Active prompt') : '');
    const nextLabel = usingPrompterQueue
      ? String(effectivePowerPrompterQueue?.nextPrompt || '').trim()
      : (pending.length > 0 ? readQueueLabel(pending[0], 'Next prompt') : '');
    const previewImageDataUrl = String(effectivePowerPrompterQueue?.previewImageDataUrl || '').trim();
    const previewStepLabel = String(effectivePowerPrompterQueue?.previewStepLabel || '').trim();
    const statusLabel = String(effectivePowerPrompterQueue?.statusLabel || '').trim();
    const etaMs = Number(effectivePowerPrompterQueue?.estimatedMsRemaining);
    const etaLabel = remaining > 0 && Number.isFinite(etaMs) && etaMs > 1000
      ? formatQueueEtaDuration(etaMs)
      : '';
    const promptTextClampStyle: React.CSSProperties = {
      display: '-webkit-box',
      WebkitLineClamp: 3,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    };

    return (
      <div className="space-y-2.5 min-w-[260px] max-w-[340px]">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--umbra-accent)]">
            {usingPrompterQueue ? 'Power Prompter Queue' : 'ComfyUI Queue'}
          </span>
          <span className="rounded-full border border-cyan-300/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-100">
            {total} Prompt{total === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-2 py-1.5">
            <div className="text-[8px] font-black uppercase tracking-wider text-emerald-300">Running</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-white">{runningCount}</div>
          </div>
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-2 py-1.5">
            <div className="text-[8px] font-black uppercase tracking-wider text-cyan-300">Waiting</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-white">{pendingCount}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
            <div className="text-[8px] font-black uppercase tracking-wider text-zinc-400">Remaining</div>
            <div className="mt-0.5 font-mono text-sm font-bold text-white">{remaining}</div>
          </div>
        </div>

        {etaLabel && (
          <div className="flex items-center justify-between rounded-lg border border-amber-300/15 bg-amber-500/[0.08] px-2 py-1.5">
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300">
              <Clock size={10} /> Time Remaining
            </div>
            <div className="font-mono text-sm font-black text-amber-100">{etaLabel}</div>
          </div>
        )}

        {previewImageDataUrl && (
          <div className="overflow-hidden rounded-lg border border-cyan-300/20 bg-black/35">
            <div className="flex items-center justify-between border-b border-white/10 px-2 py-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-cyan-200">Generation Preview</span>
              {previewStepLabel && <span className="text-[9px] text-zinc-500">{previewStepLabel}</span>}
            </div>
            <div className="flex h-[180px] items-center justify-center overflow-hidden bg-black/60">
              <img
                src={previewImageDataUrl}
                alt="ComfyUI generation preview"
                className="block h-full w-full object-contain object-center"
                loading="eager"
              />
            </div>
          </div>
        )}

        {(runningCount > 0 || activeLabel) && (
          <div className="space-y-1 rounded-lg border border-emerald-300/15 bg-emerald-500/[0.06] p-2">
            <div className="text-[9px] uppercase text-emerald-400 font-bold flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Active Prompt
            </div>
            <div className="pl-2 text-[10px] font-medium leading-relaxed text-zinc-200" style={promptTextClampStyle} title={activeLabel}>
              {activeLabel || 'Processing...'}
            </div>
            {usingPrompterQueue && statusLabel && (
              <div className="pl-2 text-[9px] uppercase tracking-wider text-zinc-500">{statusLabel}</div>
            )}
          </div>
        )}

        {pendingCount > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase text-zinc-500 font-bold flex items-center gap-1">
                <Clock size={10} /> Queue Countdown
              </div>
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">
                {remaining} remaining
              </div>
            </div>
            {nextLabel && (
              <div className="rounded-md border border-cyan-300/15 bg-cyan-500/[0.06] px-2 py-1 text-[10px] leading-relaxed text-cyan-100">
                <span className="text-cyan-300/80">Next:</span>{' '}
                <span className="block font-medium" style={promptTextClampStyle} title={nextLabel}>{nextLabel}</span>
              </div>
            )}
            {!usingPrompterQueue && (
              <div className="space-y-1 pt-1">
                {pending.slice(0, 5).map((item: any, i: number) => {
                const label = readQueueLabel(item, `Prompt ${i + 1}`);
                return (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-zinc-700/60 bg-black/20 px-2 py-1 text-[10px] text-zinc-400">
                    <span className="w-9 shrink-0 font-mono text-[9px] text-zinc-500">#{readQueueNumber(item, i + 1)}</span>
                    <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
                    <span className="shrink-0 text-[9px] text-zinc-600">{i + 1}/{pending.length}</span>
                  </div>
                );
                })}
              </div>
            )}
            {!usingPrompterQueue && pending.length > 5 && (
              <div className="text-[9px] text-zinc-600 pl-2 italic">+ {pending.length - 5} more prompt{pending.length - 5 === 1 ? '' : 's'}</div>
            )}
          </div>
        )}

        {total === 0 && (
          <div className="flex items-center justify-center gap-2 py-2 text-[10px] text-zinc-600 italic">
            <ListChecks size={13} />
            Queue is empty
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {mounted && isVisible && createPortal(
        <div
          ref={tooltipRef}
          className="pointer-events-none animate-fade-in"
          style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 9999 }}
        >
          <div className="glass-panel max-h-[calc(100vh-2rem)] overflow-hidden border border-[var(--umbra-accent)] bg-black/90 backdrop-blur-xl p-3 rounded-xl shadow-2xl">
            {isLoading && !data ? (
              <div className="flex items-center gap-2 text-zinc-400 text-xs p-2">
                <Loader2 className="animate-spin" size={14} />
                <span>Syncing...</span>
              </div>
            ) : renderComfyContent()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-400 text-xs py-2 px-1">
      <AlertCircle size={14} />
      <span>Status: {message}</span>
    </div>
  );
}
