'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import {
  Image as ImageIcon,
  Laptop,
  Layers,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Monitor,
  Power,
  Sliders,
  RefreshCw,
  Heart,
  ScanSearch,
  Anvil,
  Boxes,
  AlertCircle,
  Plug,
  RotateCcw,
  Square,
  Loader2,
  Notebook,
  PanelsTopLeft,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  Menu,
  MoreHorizontal,
  LogOut,
  Server,
  Settings2,
  Smartphone,
  Tablet,
  X
} from 'lucide-react';
import { Disclosure, DisclosureButton, DisclosurePanel, Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { WatermarkSettings } from '@/components/ui/WatermarkSettings';
import type { PowerPrompterQueueTooltipStatus } from '@/components/ui/GenerationTooltip';
import { GlobalSettings } from '@/components/modals/GlobalSettings';

import { SystemMonitor } from '@/components/SystemMonitor';
import { useComponentDebug } from '@/hooks/useComponentDebug';
import { governorShouldRun, governorTryAcquire } from '@/lib/loadGovernor';
import { DroppableNavItem } from './DroppableNavItem';
import { UmbraRemoteSidebarSection } from './UmbraRemoteSidebarSection';
import { LocalServersSidebarSection } from './LocalServersSidebarSection';
import {
  applyUmbraRemoteMode,
  getUmbraRemoteMode,
  isUmbraRemoteClient,
  normalizeUmbraRemoteMode,
  type UmbraRemoteClientMode,
} from '@/utils/hostOnly';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function runAfterBootIdle(callback: () => void, delayMs = 2500): () => void {
  if (typeof window === 'undefined') return () => {};
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  let idleId: number | null = null;
  const timer = window.setTimeout(() => {
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(callback, { timeout: 5000 });
      return;
    }
    callback();
  }, delayMs);
  return () => {
    window.clearTimeout(timer);
    if (idleId != null) idleWindow.cancelIdleCallback?.(idleId);
  };
}

type VersionManagedTool = 'comfyui';
type NeuralHubTool = 'comfyui' | 'aitoolkit';
type NeuralHubToolAction = 'install' | 'update' | 'custom_nodes' | 'update_pytorch' | 'install_sageattention';

interface NeuralHubAIToolkitStatus {
  installed: boolean;
  detected: boolean;
  path: string;
  url: string;
  running: boolean;
  healthy: boolean;
  ownership: string;
  nodeAvailable: boolean;
  nodeVersion: string;
  uiDependenciesInstalled: boolean;
}

const EMPTY_AI_TOOLKIT_STATUS: NeuralHubAIToolkitStatus = {
  installed: false,
  detected: false,
  path: '',
  url: 'http://127.0.0.1:8675/',
  running: false,
  healthy: false,
  ownership: 'none',
  nodeAvailable: false,
  nodeVersion: '',
  uiDependenciesInstalled: false,
};

type ComfyQueueBadge = {
  running: number;
  pending: number;
  remaining: number;
  total: number;
  status: 'idle' | 'busy' | 'complete' | 'error';
  recentComplete: boolean;
};

type PowerPrompterQueueStatusEvent = PowerPrompterQueueTooltipStatus;
type ComfyAppPreviewEvent = {
  imageDataUrl?: string;
  mimeType?: string;
  step?: number;
  maxStep?: number;
  stepLabel?: string;
  active?: boolean;
  nodeId?: string;
  promptId?: string;
  source?: string;
  updatedAt?: number;
};
const APPBAR_COMFY_IMAGE_PREVIEW_ENABLED = true;
const LIVE_GENERATION_PREVIEW_PATH = 'umbra-live-generation://powerprompter/current.png';
const PHONE_REMOTE_WORKSPACES = new Set([
  'umbraui',
  'powerprompter',
  'comfyui',
  'library',
  'modelmanager',
  'imageinspector',
  'board',
  'localserver',
]);
const PHONE_COMFY_MENU_LONG_PRESS_MS = 420;
const PHONE_COMFY_MENU_CANCEL_MOVE_PX = 10;
const PHONE_COMFY_MENU_SIZE_PX = 36;

type PhoneComfyMenuPosition = { x: number; y: number };

function parsePhoneComfyMenuPosition(value: unknown): PhoneComfyMenuPosition | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PhoneComfyMenuPosition>;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function clampPhoneComfyMenuPosition(position: PhoneComfyMenuPosition): PhoneComfyMenuPosition {
  if (typeof window === 'undefined') return position;
  const margin = 4;
  const maxX = Math.max(margin, window.innerWidth - PHONE_COMFY_MENU_SIZE_PX - margin);
  const maxY = Math.max(margin, window.innerHeight - PHONE_COMFY_MENU_SIZE_PX - margin);
  return {
    x: Math.min(maxX, Math.max(margin, Math.round(position.x))),
    y: Math.min(maxY, Math.max(margin, Math.round(position.y))),
  };
}

function normalizeQueueCount(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeComfyWebSocketUrl(value: unknown): string {
  const raw = String(value || '').trim() || 'http://127.0.0.1:8188';
  const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(normalized);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    url.search = `?clientId=${encodeURIComponent(`umbra-appbar-image-preview-${Date.now().toString(36)}`)}`;
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function sniffComfyPreviewMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) return 'image/png';
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  return '';
}

function readComfyImagePreviewBlob(buffer: ArrayBuffer): { blob: Blob; mimeType: string } | null {
  if (buffer.byteLength < 8) return null;
  const view = new DataView(buffer);
  const eventType = view.getUint32(0, false);

  if (eventType === 1) {
    const imageType = view.getUint32(4, false);
    const bytes = new Uint8Array(buffer, 8);
    const mimeType = sniffComfyPreviewMime(bytes);
    if (!mimeType) return null;
    const fallbackMime = imageType === 2 ? 'image/png' : imageType === 3 ? 'image/webp' : 'image/jpeg';
    return { blob: new Blob([bytes], { type: mimeType || fallbackMime }), mimeType: mimeType || fallbackMime };
  }

  if (eventType === 4) {
    const metadataLength = view.getUint32(4, false);
    const imageStart = 8 + Math.max(0, metadataLength);
    if (imageStart >= buffer.byteLength) return null;
    const bytes = new Uint8Array(buffer, imageStart);
    const sniffedMime = sniffComfyPreviewMime(bytes);
    if (!sniffedMime) return null;
    let mimeType = sniffedMime;
    try {
      const metadataText = new TextDecoder().decode(new Uint8Array(buffer, 8, metadataLength));
      const metadata = JSON.parse(metadataText);
      const metadataMime = String(metadata?.image_type || metadata?.mimeType || '').trim();
      if (metadataMime.startsWith('image/')) mimeType = metadataMime;
    } catch {
      // Metadata is optional; magic-byte detection keeps image previews usable.
    }
    return { blob: new Blob([bytes], { type: mimeType }), mimeType };
  }

  return null;
}

interface ToolVersionOption {
  ref: string;
  commit: string;
  date: string | null;
  subject: string | null;
}

interface ToolVersionCatalogResponse {
  available?: boolean;
  unavailableReason?: string | null;
  currentRef?: string;
  currentCommit?: string;
  versions?: ToolVersionOption[];
  error?: string;
}

export const UmbraAppBar = () => {
  const activeWorkspace = useStore((state) => state.activeWorkspace);
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const gpuUsage = useStore((state) => state.systemStats.gpuUsage);
  const systemStatsStale = useStore((state) => state.systemStats.stale);
  const comfyConnection = useStore((state) => state.connections.comfyui);
  const comfyHealth = useStore((state) => state.backendHealth.comfyui);
  const comfyUrl = useStore((state) => state.urls.comfyui);
  const isAppBarCollapsed = useStore((state) => state.ui.isAppBarCollapsed);
  const showFilmstrip = useStore((state) => state.ui.showFilmstrip);
  const comfySettingsUrl = useStore((state) => state.appSettings['comfyui.url']);
  const phoneComfyMenuPositionSetting = useStore((state) => state.appSettings['remote.phoneComfyMenuPosition']);
  const nsfwThumbnailBlurEnabledSetting = useStore((state) => state.appSettings['ui.nsfwThumbnailBlurEnabled']);
  const nsfwThumbnailBlurIntensitySetting = useStore((state) => state.appSettings['ui.nsfwThumbnailBlurIntensity']);
  const setUI = useStore((state) => state.setUI);
  const setAppSetting = useStore((state) => state.setAppSetting);
  const connections = React.useMemo(() => ({
    comfyui: comfyConnection,
  }), [comfyConnection]);
  const backendHealth = React.useMemo(() => ({
    comfyui: comfyHealth,
  }), [comfyHealth]);
  const urls = React.useMemo(() => ({
    comfyui: comfyUrl,
  }), [comfyUrl]);
  useComponentDebug('UmbraAppBar', { activeWorkspace });

  const [watermarkOpen, setWatermarkOpen] = React.useState(false);
  const [globalSettingsOpen, setGlobalSettingsOpen] = React.useState(false);
  const [remoteMode, setRemoteMode] = React.useState<UmbraRemoteClientMode>(() => {
    if (typeof document === 'undefined') return 'desktop';
    return normalizeUmbraRemoteMode(getUmbraRemoteMode()) || 'desktop';
  });
  const [remoteSessionBusy, setRemoteSessionBusy] = React.useState(false);
  const [remoteSessionError, setRemoteSessionError] = React.useState('');
  const [phoneSidebarOpen, setPhoneSidebarOpen] = React.useState(false);
  const [phoneComfyMenuPosition, setPhoneComfyMenuPosition] = React.useState<PhoneComfyMenuPosition | null>(() => (
    parsePhoneComfyMenuPosition(phoneComfyMenuPositionSetting)
  ));
  const [phoneComfyMenuDragging, setPhoneComfyMenuDragging] = React.useState(false);
  const [checkingConnection, setCheckingConnection] = React.useState<NeuralHubTool | null>(null);
  const [aiToolkitStatus, setAIToolkitStatus] = React.useState<NeuralHubAIToolkitStatus>(EMPTY_AI_TOOLKIT_STATUS);
  const [aiToolkitStatusLoading, setAIToolkitStatusLoading] = React.useState(false);
  const [comfyQueueBadge, setComfyQueueBadge] = React.useState<ComfyQueueBadge>({
    running: 0,
    pending: 0,
    remaining: 0,
    total: 0,
    status: 'idle',
    recentComplete: false,
  });
  const [powerPrompterQueueStatus, setPowerPrompterQueueStatus] = React.useState<PowerPrompterQueueStatusEvent | null>(null);
  const [comfyAppPreview, setComfyAppPreview] = React.useState<ComfyAppPreviewEvent | null>(null);
  const [sidebarSkipBusy, setSidebarSkipBusy] = React.useState(false);
  const comfyQueueWasBusyRef = React.useRef(false);
  const comfyRunningIdsRef = React.useRef<string[]>([]);
  const comfyCompleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const powerPrompterQueueBadgeSignatureRef = React.useRef('');
  const comfyAppPreviewSignatureRef = React.useRef('');

  // Backend operation loading states
  const [backendLoading, setBackendLoading] = React.useState<{
    comfyui: 'starting' | 'stopping' | null;
    aitoolkit: 'starting' | 'stopping' | null;
  }>({ comfyui: null, aitoolkit: null });
  const [restartingAll, setRestartingAll] = React.useState(false);
  const [stoppingAll, setStoppingAll] = React.useState(false);
  const [toolActionLoading, setToolActionLoading] = React.useState<{
    comfyui: NeuralHubToolAction | null;
    aitoolkit: NeuralHubToolAction | null;
  }>({ comfyui: null, aitoolkit: null });
  const [toolUpdates, setToolUpdates] = React.useState<Record<NeuralHubTool, {
    tool: boolean;
    pytorch: boolean;
  }>>({
    comfyui: { tool: false, pytorch: false },
    aitoolkit: { tool: false, pytorch: false },
  });
  const [toolVersions, setToolVersions] = React.useState<Record<VersionManagedTool, ToolVersionOption[]>>({
    comfyui: [],
  });
  const [toolCurrentRef, setToolCurrentRef] = React.useState<Record<VersionManagedTool, string>>({
    comfyui: '',
  });
  const [toolCurrentCommit, setToolCurrentCommit] = React.useState<Record<VersionManagedTool, string>>({
    comfyui: '',
  });
  const [toolSelectedRef, setToolSelectedRef] = React.useState<Record<VersionManagedTool, string>>({
    comfyui: '',
  });
  const [toolVersionLoading, setToolVersionLoading] = React.useState<Record<VersionManagedTool, boolean>>({
    comfyui: false,
  });
  const [toolVersionSwitching, setToolVersionSwitching] = React.useState<Record<VersionManagedTool, boolean>>({
    comfyui: false,
  });

  const liveRemoteMode = typeof document === 'undefined'
    ? remoteMode
    : document.documentElement.dataset.umbraRemoteMode || remoteMode;
  const [remoteClientRevision, setRemoteClientRevision] = React.useState(0);
  const isRemoteClient = React.useMemo(() => isUmbraRemoteClient(), [remoteClientRevision]);
  const isPhoneRemote = remoteMode === 'phone' || liveRemoteMode === 'phone';
  const isPhoneComfyImmersive = isPhoneRemote && activeWorkspace === 'comfyui';
  const phoneComfyMenuDragRef = React.useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const phoneComfyMenuLongPressRef = React.useRef<number | null>(null);
  const suppressPhoneComfyMenuClickRef = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const readRemoteMode = () => {
      const nextMode = normalizeUmbraRemoteMode(document.documentElement.dataset.umbraRemoteMode) || 'desktop';
      setRemoteMode(nextMode);
      if (nextMode !== 'phone') setPhoneSidebarOpen(false);
    };
    readRemoteMode();
    window.addEventListener('umbra:remote-mode-change', readRemoteMode);
    return () => window.removeEventListener('umbra:remote-mode-change', readRemoteMode);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const readRemoteClient = () => setRemoteClientRevision((current) => current + 1);
    window.addEventListener('umbra:remote-client-change', readRemoteClient);
    return () => window.removeEventListener('umbra:remote-client-change', readRemoteClient);
  }, []);

  React.useEffect(() => {
    setPhoneComfyMenuPosition(parsePhoneComfyMenuPosition(phoneComfyMenuPositionSetting));
  }, [phoneComfyMenuPositionSetting]);

  React.useEffect(() => {
    if (!isPhoneComfyImmersive || !phoneComfyMenuPosition) return;
    const onResize = () => {
      setPhoneComfyMenuPosition((current) => current ? clampPhoneComfyMenuPosition(current) : current);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [isPhoneComfyImmersive, phoneComfyMenuPosition]);

  React.useEffect(() => {
    if (!isPhoneRemote || PHONE_REMOTE_WORKSPACES.has(activeWorkspace)) return;
    setActiveWorkspace('powerprompter');
  }, [activeWorkspace, isPhoneRemote, setActiveWorkspace]);

  const handleWorkspaceSelect = React.useCallback((workspace: Parameters<typeof setActiveWorkspace>[0]) => {
    setActiveWorkspace(workspace);
    if (isPhoneRemote) setPhoneSidebarOpen(false);
  }, [isPhoneRemote, setActiveWorkspace]);

  const handleRemoteModeChange = React.useCallback((mode: UmbraRemoteClientMode) => {
    setRemoteSessionError('');
    setRemoteMode(mode);
    applyUmbraRemoteMode(mode);
  }, []);

  const handleRemoteLogout = React.useCallback(async () => {
    if (remoteSessionBusy) return;
    setRemoteSessionBusy(true);
    setRemoteSessionError('');
    try {
      const response = await fetch('/api/remote/auth/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forgetDevice: true }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || `Logout failed (${response.status})`));
      window.location.reload();
    } catch (logoutError) {
      setRemoteSessionError(logoutError instanceof Error ? logoutError.message : 'Logout failed');
      setRemoteSessionBusy(false);
    }
  }, [remoteSessionBusy]);

  const clearPhoneComfyMenuLongPress = React.useCallback(() => {
    if (phoneComfyMenuLongPressRef.current !== null) {
      window.clearTimeout(phoneComfyMenuLongPressRef.current);
      phoneComfyMenuLongPressRef.current = null;
    }
  }, []);

  const persistPhoneComfyMenuPosition = React.useCallback((position: PhoneComfyMenuPosition) => {
    const clamped = clampPhoneComfyMenuPosition(position);
    setPhoneComfyMenuPosition(clamped);
    setAppSetting('remote.phoneComfyMenuPosition', JSON.stringify(clamped));
  }, [setAppSetting]);

  const handlePhoneMenuPointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPhoneComfyImmersive || event.button !== 0) return;
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const startPosition = clampPhoneComfyMenuPosition(phoneComfyMenuPosition || { x: rect.left, y: rect.top });
    phoneComfyMenuDragRef.current = {
      active: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - startPosition.x,
      offsetY: event.clientY - startPosition.y,
      moved: false,
    };
    clearPhoneComfyMenuLongPress();
    phoneComfyMenuLongPressRef.current = window.setTimeout(() => {
      const drag = phoneComfyMenuDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.active = true;
      suppressPhoneComfyMenuClickRef.current = true;
      setPhoneComfyMenuDragging(true);
      setPhoneComfyMenuPosition(startPosition);
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail if the press was already cancelled.
      }
    }, PHONE_COMFY_MENU_LONG_PRESS_MS);
  }, [clearPhoneComfyMenuLongPress, isPhoneComfyImmersive, phoneComfyMenuPosition]);

  const handlePhoneMenuPointerMove = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = phoneComfyMenuDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) > PHONE_COMFY_MENU_CANCEL_MOVE_PX) {
        clearPhoneComfyMenuLongPress();
        phoneComfyMenuDragRef.current = null;
      }
      return;
    }
    drag.moved = true;
    event.preventDefault();
    setPhoneComfyMenuPosition(clampPhoneComfyMenuPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }));
  }, [clearPhoneComfyMenuLongPress]);

  const finishPhoneMenuDrag = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    clearPhoneComfyMenuLongPress();
    const drag = phoneComfyMenuDragRef.current;
    phoneComfyMenuDragRef.current = null;
    setPhoneComfyMenuDragging(false);
    if (!drag || drag.pointerId !== event.pointerId || !drag.active) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    const nextPosition = clampPhoneComfyMenuPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    });
    persistPhoneComfyMenuPosition(nextPosition);
  }, [clearPhoneComfyMenuLongPress, persistPhoneComfyMenuPosition]);

  const handlePhoneMenuClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressPhoneComfyMenuClickRef.current) {
      suppressPhoneComfyMenuClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setPhoneSidebarOpen((open) => !open);
  }, []);
  const phoneWorkspaceLabel = React.useMemo(() => {
    if (activeWorkspace === 'powerprompter') return 'Power Prompter';
    if (activeWorkspace === 'comfyui') return 'ComfyUI';
    if (activeWorkspace === 'library') return 'Gallery';
    if (activeWorkspace === 'localserver') return 'Local Server';
    if (activeWorkspace === 'umbraui') return 'Umbra UI';
    if (activeWorkspace === 'modelmanager') return 'Model Manager';
    if (activeWorkspace === 'imageinspector') return 'Image Inspector';
    if (activeWorkspace === 'board') return 'Data Forge';
    return 'Umbra';
  }, [activeWorkspace]);
  const phoneMoreWorkspaceActive = !['umbraui', 'powerprompter', 'library', 'comfyui'].includes(activeWorkspace);
  const remoteModeOptions: Array<{
    id: UmbraRemoteClientMode;
    label: string;
    icon: typeof Laptop;
  }> = [
    { id: 'desktop', label: 'Desktop', icon: Laptop },
    { id: 'tablet', label: 'Tablet', icon: Tablet },
    { id: 'phone', label: 'Mobile', icon: Smartphone },
  ];
  const renderRemoteSessionControls = (surface: 'sidebar' | 'phone') => (
    <section
      data-umbra-remote-session-controls=""
      data-surface={surface}
      className={cn(
        'border border-cyan-300/15 bg-cyan-500/[0.045]',
        surface === 'phone'
          ? 'mt-3 rounded-lg p-3'
          : 'mx-2 mt-2 rounded-md p-2',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">Remote Device</span>
          <span className="mt-0.5 block truncate text-[10px] text-zinc-500">Choose this browser&apos;s layout</span>
        </div>
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.55)]" title="Authenticated" />
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Remote device layout">
        {remoteModeOptions.map((option) => {
          const Icon = option.icon;
          const selected = remoteMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-active={selected ? '1' : '0'}
              aria-pressed={selected}
              onClick={() => handleRemoteModeChange(option.id)}
              className={cn(
                'inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded border px-1.5 text-[9px] font-black uppercase tracking-[0.08em] transition',
                surface === 'phone' ? 'min-h-12' : 'min-h-10',
                selected
                  ? 'border-cyan-300/45 bg-cyan-500/15 text-cyan-50'
                  : 'border-white/10 bg-black/20 text-zinc-500 hover:border-white/20 hover:text-zinc-200',
              )}
              title={`Use ${option.label} layout`}
            >
              <Icon size={surface === 'phone' ? 16 : 14} />
              <span className="max-w-full truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => void handleRemoteLogout()}
        disabled={remoteSessionBusy}
        className={cn(
          'mt-2 inline-flex w-full items-center justify-center gap-2 rounded border border-red-400/25 bg-red-500/10 font-black uppercase tracking-[0.12em] text-red-200 transition hover:bg-red-500/15 disabled:cursor-wait disabled:opacity-60',
          surface === 'phone' ? 'min-h-11 text-[10px]' : 'min-h-9 text-[9px]',
        )}
      >
        {remoteSessionBusy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
        {remoteSessionBusy ? 'Logging out' : 'Log out and forget device'}
      </button>
      {remoteSessionError ? (
        <p className="mt-2 text-[10px] leading-snug text-red-200">{remoteSessionError}</p>
      ) : null}
    </section>
  );
  const [isHoverExpanded, setIsHoverExpanded] = React.useState(false);
  const [systemMonitorReady, setSystemMonitorReady] = React.useState(false);

  const { fetchSystemStatus, setComfyLaunchPhase } = useStore();

  React.useEffect(() => runAfterBootIdle(() => {
    setSystemMonitorReady(true);
  }, 2500), []);

  const refreshAIToolkitStatus = React.useCallback(async (notify = false) => {
    if (notify) setAIToolkitStatusLoading(true);
    try {
      const response = await fetch('/api/data-forge/ai-toolkit/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `AI-Toolkit status request failed (${response.status})`);
      const next = { ...EMPTY_AI_TOOLKIT_STATUS, ...(payload || {}) } as NeuralHubAIToolkitStatus;
      setAIToolkitStatus(next);
      if (notify) {
        const message = next.healthy
          ? 'AI-Toolkit is connected'
          : next.running
            ? 'AI-Toolkit is starting'
            : next.installed
              ? 'AI-Toolkit is installed but stopped'
              : 'AI-Toolkit is not installed';
        useStore.getState().showToast(message, next.installed || next.running ? 'success' : 'error');
      }
      return next;
    } catch (error) {
      if (notify) {
        useStore.getState().showToast(
          error instanceof Error ? error.message : 'Failed to check AI-Toolkit',
          'error'
        );
      }
      return null;
    } finally {
      if (notify) setAIToolkitStatusLoading(false);
    }
  }, []);

  const refreshToolUpdates = React.useCallback(async () => {
    try {
      const res = await fetch('/api/tools/updates/summary');
      if (!res.ok) return;
      const data = await res.json();
      const updates = Array.isArray(data?.updates) ? data.updates : [];
      setToolUpdates({
        comfyui: {
          tool: updates.some((u: any) => u.tool === 'ComfyUI' && u.type === 'tool'),
          pytorch: updates.some((u: any) => u.tool === 'ComfyUI' && u.type === 'pytorch'),
        },
        aitoolkit: {
          tool: updates.some((u: any) => u.tool === 'AI-Toolkit' && u.type === 'tool'),
          pytorch: updates.some((u: any) => u.tool === 'AI-Toolkit' && u.type === 'pytorch'),
        },
      });
    } catch {
      // Ignore transient update check errors.
    }
  }, []);

  React.useEffect(() => {
    const cancelInitialRefresh = runAfterBootIdle(refreshToolUpdates);
    const timer = setInterval(refreshToolUpdates, 60000);
    return () => {
      cancelInitialRefresh();
      clearInterval(timer);
    };
  }, [refreshToolUpdates]);

  React.useEffect(() => {
    const cancelInitialRefresh = runAfterBootIdle(() => {
      void refreshAIToolkitStatus();
    }, 3000);
    const timer = window.setInterval(() => {
      void refreshAIToolkitStatus();
    }, 15000);
    return () => {
      cancelInitialRefresh();
      window.clearInterval(timer);
    };
  }, [refreshAIToolkitStatus]);

  const getManagedToolLabel = React.useCallback((tool: VersionManagedTool) => {
    if (tool === 'comfyui') return 'ComfyUI';
    return tool;
  }, []);

  const formatToolVersionDate = React.useCallback((value: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  }, []);

  const loadToolVersions = React.useCallback(async (tool: VersionManagedTool, notifyOnError = false) => {
    setToolVersionLoading((prev) => ({ ...prev, [tool]: true }));
    try {
      const res = await fetch(`/api/tools/${tool}/versions?limit=300`);
      const data = await res.json() as ToolVersionCatalogResponse;
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load ${getManagedToolLabel(tool)} versions`);
      }
      if (data?.available === false) {
        setToolVersions((prev) => ({ ...prev, [tool]: [] }));
        setToolCurrentRef((prev) => ({ ...prev, [tool]: '' }));
        setToolCurrentCommit((prev) => ({ ...prev, [tool]: '' }));
        setToolSelectedRef((prev) => ({ ...prev, [tool]: '' }));
        return;
      }
      const versions = Array.isArray(data?.versions) ? data.versions as ToolVersionOption[] : [];
      const currentRef = String(data?.currentRef || '').trim();
      const currentCommit = String(data?.currentCommit || '').trim();
      setToolVersions((prev) => ({ ...prev, [tool]: versions }));
      setToolCurrentRef((prev) => ({ ...prev, [tool]: currentRef }));
      setToolCurrentCommit((prev) => ({ ...prev, [tool]: currentCommit }));
      setToolSelectedRef((prev) => {
        const prevRef = String(prev[tool] || '').trim();
        const nextSelected = prevRef && versions.some((entry) => entry.ref === prevRef)
          ? prevRef
          : (currentRef || prevRef || versions[0]?.ref || '');
        return { ...prev, [tool]: nextSelected };
      });
    } catch (error) {
      setToolVersions((prev) => ({ ...prev, [tool]: [] }));
      setToolCurrentRef((prev) => ({ ...prev, [tool]: '' }));
      setToolCurrentCommit((prev) => ({ ...prev, [tool]: '' }));
      if (notifyOnError) {
        useStore.getState().showToast(
          error instanceof Error ? error.message : `Failed to load ${getManagedToolLabel(tool)} versions`,
          'error'
        );
      }
    } finally {
      setToolVersionLoading((prev) => ({ ...prev, [tool]: false }));
    }
  }, [getManagedToolLabel]);

  const handleToolVersionSwitch = React.useCallback(async (tool: VersionManagedTool) => {
    if (isRemoteClient) {
      useStore.getState().showToast('Tool version switching is only available from the host PC.', 'error');
      return;
    }
    const targetRef = String(toolSelectedRef[tool] || '').trim();
    if (!targetRef) return;
    if (targetRef === String(toolCurrentRef[tool] || '').trim()) return;
    if (toolVersionSwitching[tool]) return;

    setToolVersionSwitching((prev) => ({ ...prev, [tool]: true }));
    try {
      const startRes = await fetch(`/api/tools/${tool}/version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: targetRef }),
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData?.actionId) {
        throw new Error(startData?.error || `Failed to start ${getManagedToolLabel(tool)} version switch`);
      }

      const actionId = String(startData.actionId);
      let done = false;
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusRes = await fetch(`/api/tools/actions/${actionId}`);
        const status = await statusRes.json();
        if (status.status === 'completed') {
          done = true;
        } else if (status.status === 'failed') {
          const verifyMessage = status?.verifyFailure?.nextSteps?.[0] || status?.verifyFailure?.title;
          throw new Error(verifyMessage || status.error || `${getManagedToolLabel(tool)} version switch failed`);
        }
      }

      useStore.getState().showToast(`${getManagedToolLabel(tool)} switched to ${targetRef}`, 'success');
      await loadToolVersions(tool);
      await fetchSystemStatus();
      await refreshToolUpdates();
    } catch (error) {
      useStore.getState().showToast(
        error instanceof Error ? error.message : `Failed to switch ${getManagedToolLabel(tool)} version`,
        'error'
      );
    } finally {
      setToolVersionSwitching((prev) => ({ ...prev, [tool]: false }));
    }
  }, [fetchSystemStatus, getManagedToolLabel, isRemoteClient, loadToolVersions, refreshToolUpdates, toolCurrentRef, toolSelectedRef, toolVersionSwitching]);

  React.useEffect(() => {
    return runAfterBootIdle(() => {
      void loadToolVersions('comfyui');
    }, 3500);
  }, [loadToolVersions]);

  React.useEffect(() => {
    let cancelled = false;

    const pollStatus = async () => {
      if (cancelled) return;
      if (!governorShouldRun('appbar-system-status-poll', 10000)) return;
      const release = governorTryAcquire('background');
      if (!release) return;
      try {
        await fetchSystemStatus();
      } finally {
        release();
      }
    };

    void pollStatus();
    const timer = window.setInterval(() => {
      void pollStatus();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchSystemStatus]);

  React.useEffect(() => {
    const onQueueStatus = (event: Event) => {
      const detail = (event as CustomEvent<Partial<PowerPrompterQueueStatusEvent>>).detail || {};
      const total = Math.max(0, Math.floor(Number(detail.total) || 0));
      const running = Math.max(0, Math.floor(Number(detail.running) || 0));
      const pending = Math.max(0, Math.floor(Number(detail.pending) || 0));
      const completed = Math.max(0, Math.floor(Number(detail.completed) || 0));
      const failed = Math.max(0, Math.floor(Number(detail.failed) || 0));
      const position = Math.max(0, Math.floor(Number(detail.position) || 0));
      const remaining = Math.max(0, Math.floor(Number(detail.remaining) || 0));
      const activePrompt = String(detail.activePrompt || '').trim();
      const nextPrompt = String(detail.nextPrompt || '').trim();
      const statusLabel = String(detail.statusLabel || '').trim();
      const previewImageDataUrl = String(detail.previewImageDataUrl || '').trim();
      const previewStepLabel = String(detail.previewStepLabel || '').trim();
      const estimatedMsRemaining = Number.isFinite(Number(detail.estimatedMsRemaining))
        ? Math.max(0, Math.floor(Number(detail.estimatedMsRemaining)))
        : null;
      if (total <= 0 && !previewImageDataUrl) {
        powerPrompterQueueBadgeSignatureRef.current = '';
        setPowerPrompterQueueStatus(null);
        return;
      }
      const previewSignature = previewImageDataUrl
        ? `${previewImageDataUrl.length}:${previewImageDataUrl.slice(-48)}`
        : '';
      const signature = [
        total,
        running,
        pending,
        completed,
        failed,
        position,
        remaining,
        estimatedMsRemaining ?? '',
        statusLabel,
        activePrompt,
        nextPrompt,
        previewStepLabel,
        previewSignature,
      ].join('|');
      if (signature === powerPrompterQueueBadgeSignatureRef.current) return;
      powerPrompterQueueBadgeSignatureRef.current = signature;

      setPowerPrompterQueueStatus({
        total,
        running,
        pending,
        completed,
        failed,
        position,
        remaining,
        activePrompt,
        nextPrompt,
        statusLabel,
        previewImageDataUrl,
        previewStepLabel,
        estimatedMsRemaining,
        updatedAt: Math.max(0, Math.floor(Number(detail.updatedAt) || Date.now())),
      });
    };

    window.addEventListener('umbra:powerprompter-queue-status', onQueueStatus as EventListener);
    return () => {
      window.removeEventListener('umbra:powerprompter-queue-status', onQueueStatus as EventListener);
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!APPBAR_COMFY_IMAGE_PREVIEW_ENABLED) return;
    if (isRemoteClient || connections.comfyui !== 'connected' || backendHealth.comfyui !== true) return;
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let staleTimer: number | null = null;
    let currentObjectUrl = '';
    const wsUrl = normalizeComfyWebSocketUrl(urls.comfyui || comfySettingsUrl);
    if (!wsUrl) return;

    const clearStaleTimer = () => {
      if (staleTimer != null) {
        window.clearTimeout(staleTimer);
        staleTimer = null;
      }
    };

    const scheduleStaleClear = () => {
      clearStaleTimer();
      staleTimer = window.setTimeout(() => {
        comfyAppPreviewSignatureRef.current = '';
        if (currentObjectUrl) {
          URL.revokeObjectURL(currentObjectUrl);
          currentObjectUrl = '';
        }
        setComfyAppPreview((current) => {
          if (!current?.imageDataUrl) return current?.active ? { active: false, updatedAt: Date.now() } : null;
          return null;
        });
      }, 45_000);
    };

    const setProgress = (data: any) => {
      const step = Math.max(0, Math.floor(Number(data?.value ?? data?.step ?? 0) || 0));
      const maxStep = Math.max(0, Math.floor(Number(data?.max ?? data?.total ?? data?.maxStep ?? 0) || 0));
      if (step <= 0 && maxStep <= 0) return;
      const stepLabel = maxStep > 0 ? `Step ${step}/${maxStep}` : `Step ${step}`;
      const signature = `progress|${step}|${maxStep}|${stepLabel}`;
      if (signature === comfyAppPreviewSignatureRef.current) return;
      comfyAppPreviewSignatureRef.current = signature;
      setComfyAppPreview((current) => ({
        ...(current || {}),
        step,
        maxStep,
        stepLabel,
        active: true,
        source: 'comfy_direct_image_ws',
        updatedAt: Date.now(),
      }));
      scheduleStaleClear();
    };

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';
      socket.onmessage = (event) => {
        try {
          if (typeof event.data === 'string') {
            const message = JSON.parse(String(event.data || '{}'));
            const messageType = String(message?.type || '').trim();
            const data = message?.data || {};
            if (messageType === 'progress') {
              setProgress(data);
              return;
            }
            if (messageType === 'executing') {
              const nodeId = String(data?.node || data?.node_id || '').trim();
              const promptId = String(data?.prompt_id || data?.promptId || '').trim();
              if (!nodeId && !promptId) {
                comfyAppPreviewSignatureRef.current = '';
                setComfyAppPreview((current) => current?.imageDataUrl ? current : null);
                return;
              }
              setComfyAppPreview((current) => ({
                ...(current || {}),
                active: true,
                nodeId,
                promptId,
                source: 'comfy_direct_image_ws',
                updatedAt: Date.now(),
              }));
              scheduleStaleClear();
            }
            return;
          }

          if (!(event.data instanceof ArrayBuffer)) return;
          const frame = readComfyImagePreviewBlob(event.data);
          if (!frame) return;
          const imageDataUrl = URL.createObjectURL(frame.blob);
          const signature = [
            frame.blob.size,
            frame.mimeType,
            Date.now(),
          ].join('|');
          if (signature === comfyAppPreviewSignatureRef.current) return;
          comfyAppPreviewSignatureRef.current = signature;
          if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
          currentObjectUrl = imageDataUrl;
          setComfyAppPreview({
            imageDataUrl,
            mimeType: frame.mimeType,
            active: true,
            source: 'comfy_direct_image_ws',
            updatedAt: Date.now(),
          });
          scheduleStaleClear();
        } catch {
          // Preview messages are best-effort; malformed packets should not disturb the app bar.
        }
      };
      socket.onclose = () => {
        socket = null;
        if (!closed) reconnectTimer = window.setTimeout(connect, 2500);
      };
    };

    connect();
    return () => {
      closed = true;
      clearStaleTimer();
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      try { socket?.close(); } catch {}
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [backendHealth.comfyui, comfySettingsUrl, connections.comfyui, isRemoteClient, urls.comfyui]);

  React.useEffect(() => {
    const clearCompleteTimer = () => {
      if (comfyCompleteTimerRef.current) {
        clearTimeout(comfyCompleteTimerRef.current);
        comfyCompleteTimerRef.current = null;
      }
    };

    if (connections.comfyui !== 'connected' || backendHealth.comfyui !== true) {
      clearCompleteTimer();
      comfyQueueWasBusyRef.current = false;
      comfyRunningIdsRef.current = [];
      setComfyQueueBadge({
        running: 0,
        pending: 0,
        remaining: 0,
        total: 0,
        status: 'idle',
        recentComplete: false,
      });
      return;
    }

    let cancelled = false;

    const readPromptId = (item: any, index: number) => {
      if (Array.isArray(item)) return String(item[1] ?? item[3]?.prompt_id ?? item[0] ?? index);
      return String(item?.prompt_id ?? item?.id ?? item?.number ?? index);
    };

    const markRecentComplete = (running: number, pending: number) => {
      clearCompleteTimer();
      const total = running + pending;
      setComfyQueueBadge({
        running,
        pending,
        remaining: total,
        total,
        status: total > 0 ? 'busy' : 'complete',
        recentComplete: true,
      });
      comfyCompleteTimerRef.current = setTimeout(() => {
        setComfyQueueBadge((current) => ({
          ...current,
          status: current.total > 0 ? 'busy' : 'idle',
          recentComplete: false,
        }));
        comfyCompleteTimerRef.current = null;
      }, 4500);
    };

    const fetchQueueStatus = async () => {
      const release = governorTryAcquire('interactive');
      if (!release) return;
      try {
        const response = await fetch('/api/umbrabridge/comfyui/queue', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;

        if (payload?.unavailable) {
          clearCompleteTimer();
          comfyQueueWasBusyRef.current = false;
          comfyRunningIdsRef.current = [];
          setComfyQueueBadge({
            running: 0,
            pending: 0,
            remaining: 0,
            total: 0,
            status: 'idle',
            recentComplete: false,
          });
          return;
        }

        if (!response.ok || payload?.error) {
          clearCompleteTimer();
          setComfyQueueBadge((current) => ({
            ...current,
            status: 'error',
            recentComplete: false,
          }));
          return;
        }

        const runningRows = Array.isArray(payload?.queue_running) ? payload.queue_running : [];
        const pendingRows = Array.isArray(payload?.queue_pending) ? payload.queue_pending : [];
        const running = runningRows.length;
        const pending = pendingRows.length;
        const total = running + pending;
        const runningIds = runningRows.map(readPromptId);
        const queueDrained = comfyQueueWasBusyRef.current && total === 0;

        comfyQueueWasBusyRef.current = total > 0;
        comfyRunningIdsRef.current = runningIds;

        if (queueDrained) {
          markRecentComplete(running, pending);
          return;
        }

        if (total > 0) {
          setComfyQueueBadge((current) => {
            if (current.recentComplete) {
              return {
                ...current,
                running,
                pending,
                remaining: total,
                total,
                status: 'busy',
              };
            }
            clearCompleteTimer();
            return {
              running,
              pending,
              remaining: total,
              total,
              status: 'busy',
              recentComplete: false,
            };
          });
          return;
        }

        setComfyQueueBadge((current) => (
          current.recentComplete
            ? { ...current, running, pending, remaining: total, total }
            : {
              running,
              pending,
              remaining: total,
              total,
              status: 'idle',
              recentComplete: false,
            }
        ));
      } catch {
        if (!cancelled) {
          clearCompleteTimer();
          setComfyQueueBadge((current) => ({
            ...current,
            status: 'error',
            recentComplete: false,
          }));
        }
      } finally {
        release();
      }
    };

    void fetchQueueStatus();
    const timer = window.setInterval(() => {
      void fetchQueueStatus();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      clearCompleteTimer();
    };
  }, [backendHealth.comfyui, connections.comfyui]);

  React.useEffect(() => {
    if (!isAppBarCollapsed && isHoverExpanded) {
      setIsHoverExpanded(false);
    }
  }, [isAppBarCollapsed, isHoverExpanded]);

  // Calculate heartbeat speed based on GPU load (faster every 33%)
  const getHeartbeatSpeed = () => {
    if (systemStatsStale) return '0s';
    const normalizedGpuUsage = gpuUsage || 0;

    // Speed up every 33% GPU load:
    // 0-33%: 2s (slow, resting)
    // 33-66%: 1.2s (moderate)
    // 66-100%: 0.6s (fast, stressed)
    if (normalizedGpuUsage < 33) return '2s';
    if (normalizedGpuUsage < 66) return '1.2s';
    return '0.6s';
  };

  const handleBackendToggle = async (backend: 'comfyui') => {
    const isRunning = connections[backend] === 'connected';
    const action = isRunning ? 'stop' : 'start';
    const backendName = 'ComfyUI';

    // Set loading state
    setBackendLoading(prev => ({ ...prev, [backend]: action === 'start' ? 'starting' : 'stopping' }));
    if (action === 'start') {
      setComfyLaunchPhase('starting');
    }

    try {
      const res = await fetch(`/api/umbrabridge/backend/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `Failed to ${action} ${backendName}`);
      }

      // Show success toast
      useStore.getState().showToast(
        action === 'start' ? `${backendName} starting...` : `${backendName} stopped`,
        'success'
      );

      // Use the same readiness probe as the workspace splash so Neural Hub and
      // the iframe agree on the exact moment ComfyUI is usable.
      if (action === 'start') {
        const waitResponse = await fetch('/api/umbrabridge/backend/wait-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend, timeout: null }),
        });
        const waitResult = await waitResponse.json();
        if (!waitResponse.ok || waitResult?.ready !== true) {
          throw new Error(waitResult?.error || `${backendName} did not become ready`);
        }
        setComfyLaunchPhase('ready');
        await fetchSystemStatus({ force: true });
        setBackendLoading(prev => ({ ...prev, [backend]: null }));
        useStore.getState().showToast(`${backendName} is ready`, 'success');
      } else {
        // For stop, refresh status and clear loading
        setComfyLaunchPhase('offline');
        await fetchSystemStatus({ force: true });
        setBackendLoading(prev => ({ ...prev, [backend]: null }));
      }
    } catch (err) {
      if (action === 'start') {
        setComfyLaunchPhase('offline');
        void fetchSystemStatus({ force: true });
      }
      console.error(`Failed to ${action} ${backend}:`, err);
      useStore.getState().showToast(
        err instanceof Error ? err.message : `Failed to ${action} ${backendName}`,
        'error'
      );
      setBackendLoading(prev => ({ ...prev, [backend]: null }));
    }
  };

  const handleAIToolkitToggle = async () => {
    const isRunning = aiToolkitStatus.running || aiToolkitStatus.healthy;
    const action = isRunning ? 'stop' : 'start';
    if (action === 'stop' && aiToolkitStatus.ownership === 'external-compatible') {
      useStore.getState().showToast('AI-Toolkit is running outside Umbra and must be stopped by its owner.', 'error');
      return;
    }
    if (action === 'start' && (!aiToolkitStatus.installed || !aiToolkitStatus.nodeAvailable || !aiToolkitStatus.uiDependenciesInstalled)) {
      useStore.getState().showToast('Install or repair AI-Toolkit before launching it.', 'error');
      return;
    }

    setBackendLoading((current) => ({
      ...current,
      aitoolkit: action === 'start' ? 'starting' : 'stopping',
    }));
    try {
      const response = await fetch(`/api/umbrabridge/backend/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'aitoolkit' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || payload?.message || `Failed to ${action} AI-Toolkit`);
      }

      if (action === 'start') {
        const readyResponse = await fetch('/api/umbrabridge/backend/wait-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend: 'aitoolkit', timeout: 10 * 60 * 1000 }),
        });
        const readyPayload = await readyResponse.json().catch(() => null);
        if (!readyResponse.ok || readyPayload?.ready !== true) {
          throw new Error(readyPayload?.error || 'AI-Toolkit did not become ready in time.');
        }
      }

      await refreshAIToolkitStatus();
      useStore.getState().showToast(
        action === 'start' ? 'AI-Toolkit is ready' : 'AI-Toolkit stopped',
        'success'
      );
    } catch (error) {
      useStore.getState().showToast(
        error instanceof Error ? error.message : `Failed to ${action} AI-Toolkit`,
        'error'
      );
      await refreshAIToolkitStatus();
    } finally {
      setBackendLoading((current) => ({ ...current, aitoolkit: null }));
    }
  };

  const handleAIToolkitCheck = async () => {
    setCheckingConnection('aitoolkit');
    await refreshAIToolkitStatus(true);
    window.setTimeout(() => setCheckingConnection(null), 500);
  };

  const handleOpenAIToolkitExternal = () => {
    const rawUrl = String(aiToolkitStatus.url || EMPTY_AI_TOOLKIT_STATUS.url).trim();
    try {
      const targetUrl = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`).toString();
      const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
      if (!opened) useStore.getState().showToast('Unable to open AI-Toolkit in the browser.', 'error');
    } catch {
      useStore.getState().showToast('AI-Toolkit URL is invalid.', 'error');
    }
  };

  const handleCheckConnection = async (backend: 'comfyui') => {
    const backendName = 'ComfyUI';
    setCheckingConnection(backend);

    try {
      await fetchSystemStatus({ force: true });
      // Small delay to let store update
      await new Promise(r => setTimeout(r, 300));
      const currentStatus = useStore.getState().connections[backend];

      if (currentStatus === 'connected') {
        useStore.getState().showToast(`${backendName} is connected`, 'success');
      } else {
        useStore.getState().showToast(`${backendName} is not running`, 'error');
      }
    } catch (err) {
      useStore.getState().showToast(`Failed to check ${backendName} connection`, 'error');
    } finally {
      setTimeout(() => setCheckingConnection(null), 500);
    }
  };

  const handleStopAll = async () => {
    const managedBackends: NeuralHubTool[] = [];
    if (connections.comfyui === 'connected') managedBackends.push('comfyui');
    if (
      (aiToolkitStatus.running || aiToolkitStatus.healthy)
      && aiToolkitStatus.ownership !== 'external-compatible'
    ) {
      managedBackends.push('aitoolkit');
    }

    if (managedBackends.length === 0) {
      useStore.getState().showToast('No managed backends are running', 'error');
      return;
    }

    setStoppingAll(true);
    try {
      for (const backend of managedBackends) {
        const res = await fetch('/api/umbrabridge/backend/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || data.message || `Failed to stop ${backend}`);
        }
      }
      useStore.getState().showToast('Managed backends stopped', 'success');
      setComfyLaunchPhase('offline');
      await Promise.all([
        fetchSystemStatus({ force: true }),
        refreshAIToolkitStatus(),
      ]);
    } catch (err) {
      useStore.getState().showToast(
        err instanceof Error ? err.message : 'Failed to stop managed backends',
        'error'
      );
    } finally {
      setStoppingAll(false);
    }
  };

  const handleRefreshBrowser = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const handleOpenWorkspaceInBrowser = (
    event: React.MouseEvent<HTMLButtonElement>,
    backend: 'comfyui'
  ) => {
    event.stopPropagation();
    const backendName = 'ComfyUI';
    if (typeof window !== 'undefined' && isUmbraRemoteClient()) {
      const targetUrl = new URL('/comfy/', window.location.origin).toString();
      const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        useStore.getState().showToast(`Unable to open ${backendName} in browser`, 'error');
        return;
      }
      opened.focus();
      return;
    }

    const fallbackUrl = 'http://127.0.0.1:8188';
    const candidate = String(
      urls.comfyui || comfySettingsUrl
    ).trim();
    const rawUrl = candidate || fallbackUrl;
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`;

    let targetUrl = '';
    try {
      targetUrl = new URL(normalizedUrl).toString();
    } catch {
      useStore.getState().showToast(`Invalid ${backendName} URL`, 'error');
      return;
    }

    const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      useStore.getState().showToast(`Unable to open ${backendName} in browser`, 'error');
      return;
    }
    opened.focus();
  };

  const handleOpenGalleryPopout = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const currentProtocol = String(window.location.protocol || '').toLowerCase();
    const baseUrl = currentProtocol === 'http:' || currentProtocol === 'https:'
      ? window.location.href
      : `${window.location.origin || 'http://127.0.0.1:8212'}/`;
    const currentUrl = new URL(baseUrl);
    currentUrl.searchParams.set('umbraPopout', 'library');
    const targetUrl = currentUrl.toString();

    // Open in external browser (not an in-app popup window).
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const handleToolAction = async (
    backend: NeuralHubTool,
    action: NeuralHubToolAction
  ) => {
    if (isRemoteClient) {
      useStore.getState().showToast('Install and update actions are only available from the host PC.', 'error');
      return;
    }
    setToolActionLoading(prev => ({ ...prev, [backend]: action }));

    try {
      const res = await fetch('/api/tools/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: backend, action })
      });
      const data = await res.json();
      if (!res.ok || !data?.actionId) {
        throw new Error(data?.error || 'Failed to start tool action');
      }

      const actionId = data.actionId as string;
      let done = false;
      while (!done) {
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await fetch(`/api/tools/actions/${actionId}`);
        const status = await statusRes.json();
        if (status.status === 'completed') {
          done = true;
        } else if (status.status === 'failed') {
          throw new Error(status.error || 'Tool action failed');
        }
      }

      const actionLabel = String(action ?? '').replaceAll('_', ' ');
      const toolLabel = backend === 'comfyui' ? 'ComfyUI' : 'AI-Toolkit';
      useStore.getState().showToast(`Completed ${actionLabel} for ${toolLabel}`, 'success');
      setToolActionLoading(prev => ({ ...prev, [backend]: null }));
      void fetchSystemStatus({ force: true });
      if (backend === 'aitoolkit') void refreshAIToolkitStatus();
      void refreshToolUpdates();
    } catch (err) {
      useStore.getState().showToast(
        err instanceof Error ? err.message : 'Tool action failed',
        'error'
      );
    } finally {
      setToolActionLoading(prev => ({ ...prev, [backend]: null }));
    }
  };

  const handleRestartAll = async () => {
    const connectedBackends: NeuralHubTool[] = [];
    if (connections.comfyui === 'connected') connectedBackends.push('comfyui');
    if (
      (aiToolkitStatus.running || aiToolkitStatus.healthy)
      && aiToolkitStatus.ownership !== 'external-compatible'
    ) {
      connectedBackends.push('aitoolkit');
    }

    if (connectedBackends.length === 0) {
      useStore.getState().showToast('No backends are running', 'error');
      return;
    }

    setRestartingAll(true);
    useStore.getState().showToast(`Restarting ${connectedBackends.length} backend(s)...`, 'success');

    try {
      for (const backend of connectedBackends) {
        const response = await fetch('/api/umbrabridge/backend/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || payload?.message || `Failed to stop ${backend}`);
        }
      }

      // Wait for backends to fully stop
      await new Promise(r => setTimeout(r, 2000));
      setComfyLaunchPhase('offline');

      // Start them back up sequentially
      for (const backend of connectedBackends) {
        if (backend === 'comfyui') setComfyLaunchPhase('starting');
        const startResponse = await fetch('/api/umbrabridge/backend/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend })
        });
        const startPayload = await startResponse.json().catch(() => null);
        if (!startResponse.ok || startPayload?.success === false) {
          throw new Error(startPayload?.error || startPayload?.message || `Failed to start ${backend}`);
        }

        const readyResponse = await fetch('/api/umbrabridge/backend/wait-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backend,
            timeout: backend === 'comfyui' ? null : 10 * 60 * 1000,
          }),
        });
        const readyPayload = await readyResponse.json().catch(() => null);
        if (!readyResponse.ok || readyPayload?.ready !== true) {
          throw new Error(readyPayload?.error || `${backend} did not become ready`);
        }
        if (backend === 'comfyui') setComfyLaunchPhase('ready');
      }

      await Promise.all([
        fetchSystemStatus({ force: true }),
        refreshAIToolkitStatus(),
      ]);
      useStore.getState().showToast('All managed backends are ready', 'success');
    } catch (err) {
      useStore.getState().showToast(
        err instanceof Error ? err.message : 'Failed to restart backends',
        'error'
      );
      await Promise.all([
        fetchSystemStatus({ force: true }),
        refreshAIToolkitStatus(),
      ]);
    } finally {
      setRestartingAll(false);
    }
  };

  const isSidebarExpanded = !isAppBarCollapsed || isHoverExpanded;
  const hasManagedBackendRunning = connections.comfyui === 'connected'
    || (
      (aiToolkitStatus.running || aiToolkitStatus.healthy)
      && aiToolkitStatus.ownership !== 'external-compatible'
    );
  const nsfwThumbnailBlurEnabled = nsfwThumbnailBlurEnabledSetting === true;
  const nsfwThumbnailBlurIntensity = Math.max(
    0,
    Math.min(100, Math.round(Number(nsfwThumbnailBlurIntensitySetting ?? 85))),
  );
  const effectiveComfyQueueBadge = React.useMemo<ComfyQueueBadge>(() => {
    const prompterTotal = normalizeQueueCount(powerPrompterQueueStatus?.total);
    const prompterUpdatedAt = Math.max(0, Number(powerPrompterQueueStatus?.updatedAt) || 0);
    const prompterFresh = prompterUpdatedAt > 0 && (Date.now() - prompterUpdatedAt) <= 15000;
    if (!prompterFresh || prompterTotal <= comfyQueueBadge.total) return comfyQueueBadge;
    const prompterRunning = normalizeQueueCount(powerPrompterQueueStatus?.running);
    const prompterPending = normalizeQueueCount(powerPrompterQueueStatus?.pending);
    const liveRemaining = prompterRunning + prompterPending;
    const fallbackRemaining = normalizeQueueCount(powerPrompterQueueStatus?.remaining);
    const prompterRemaining = fallbackRemaining > 0 ? fallbackRemaining : liveRemaining;
    return {
      running: prompterRunning,
      pending: prompterPending,
      remaining: prompterRemaining,
      total: prompterTotal,
      status: 'busy',
      recentComplete: false,
    };
  }, [comfyQueueBadge, powerPrompterQueueStatus]);

  const handleSidebarToggle = () => {
    const nextCollapsed = !isAppBarCollapsed;
    setUI('isAppBarCollapsed', nextCollapsed);
    if (!nextCollapsed) {
      setIsHoverExpanded(false);
    }
  };

  const renderVersionControls = (tool: VersionManagedTool) => {
    const versions = toolVersions[tool];
    const currentRef = toolCurrentRef[tool];
    const currentCommit = toolCurrentCommit[tool];
    const selectedRef = toolSelectedRef[tool];
    const loading = toolVersionLoading[tool];
    const switching = toolVersionSwitching[tool];
    const disabled = isRemoteClient || loading || switching || !!backendLoading[tool] || !!toolActionLoading[tool];

    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <select
            value={selectedRef}
            onChange={(event) => setToolSelectedRef((prev) => ({ ...prev, [tool]: event.target.value }))}
            disabled={disabled || versions.length === 0}
            className="flex-1 min-w-0 rounded bg-black/35 border border-white/10 px-2 py-1 text-[9px] text-zinc-200 disabled:opacity-50"
          >
            <option value="">Select version...</option>
            {versions.map((version) => (
              <option key={`${tool}:${version.ref}:${version.commit}`} value={version.ref}>
                {version.ref}{version.date ? ` • ${formatToolVersionDate(version.date)}` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => void loadToolVersions(tool, true)}
            disabled={disabled}
            className="text-[8px] uppercase tracking-wider font-bold py-1 px-2 rounded bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50"
            title="Refresh versions"
          >
            {loading ? '...' : '↻'}
          </button>
          <button
            onClick={() => void handleToolVersionSwitch(tool)}
            disabled={disabled || !selectedRef || selectedRef === currentRef}
            className="text-[8px] uppercase tracking-wider font-bold py-1 px-2 rounded bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition-all disabled:opacity-50"
            title="Switch to selected version"
          >
            {switching ? 'Switch...' : 'Switch'}
          </button>
        </div>
        <div className="text-[8px] text-zinc-500 truncate" title={currentCommit ? `${currentRef} (${currentCommit})` : currentRef || ''}>
          Current: {currentRef || 'unknown'}{currentCommit ? ` (${currentCommit})` : ''}
        </div>
      </div>
    );
  };

  const phoneTopbarStyle = React.useMemo(() => {
    if (!isPhoneComfyImmersive || !phoneComfyMenuPosition) return undefined;
    return {
      '--umbra-phone-comfy-menu-x': `${phoneComfyMenuPosition.x}px`,
      '--umbra-phone-comfy-menu-y': `${phoneComfyMenuPosition.y}px`,
    } as React.CSSProperties;
  }, [isPhoneComfyImmersive, phoneComfyMenuPosition]);
  const sidebarNavItemClass = React.useCallback((active: boolean, extra = '') => cn(
    'relative flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-semibold transition-colors',
    'before:pointer-events-none before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:transition-opacity',
    active
      ? 'border-white/12 bg-white/[0.055] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_18px_color-mix(in_srgb,var(--umbra-accent)_15%,transparent)] before:bg-[var(--umbra-accent)] before:opacity-100'
      : 'border-transparent bg-transparent text-zinc-500 hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 before:bg-transparent before:opacity-0',
    extra
  ), []);
  const sidebarAuxButtonClass = 'shrink-0 rounded-md border border-transparent bg-transparent px-2 text-zinc-500 transition-colors hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100';
  const comfyAppPreviewImage = String(comfyAppPreview?.imageDataUrl || '').trim();
  const comfyAppPreviewStep = String(comfyAppPreview?.stepLabel || '').trim();
  const showComfySidebarStatus = effectiveComfyQueueBadge.status !== 'idle'
    || Boolean(comfyAppPreviewImage)
    || Boolean(comfyAppPreview?.active)
    || Boolean(String(powerPrompterQueueStatus?.previewImageDataUrl || '').trim())
    || Boolean(String(powerPrompterQueueStatus?.activePrompt || powerPrompterQueueStatus?.nextPrompt || '').trim());
  const comfySidebarProgress = powerPrompterQueueStatus && powerPrompterQueueStatus.total > 0
    ? Math.max(0, Math.min(100, (powerPrompterQueueStatus.position / Math.max(1, powerPrompterQueueStatus.total)) * 100))
    : (effectiveComfyQueueBadge.status === 'complete' ? 100 : 0);
  const comfySidebarActivePrompt = String(powerPrompterQueueStatus?.activePrompt || '').trim();
  const comfySidebarNextPrompt = String(powerPrompterQueueStatus?.nextPrompt || '').trim();
  const comfySidebarPreviewImage = comfyAppPreviewImage || String(powerPrompterQueueStatus?.previewImageDataUrl || '').trim();
  const comfySidebarPreviewIsVideo = /^data:video\//i.test(comfySidebarPreviewImage);
  const comfySidebarPreviewStep = comfyAppPreviewStep || String(powerPrompterQueueStatus?.previewStepLabel || '').trim();
  const canSkipSidebarJob = effectiveComfyQueueBadge.running > 0 || normalizeQueueCount(powerPrompterQueueStatus?.running) > 0;

  const handleSidebarSkipCurrentJob = React.useCallback(async () => {
    if (sidebarSkipBusy || !canSkipSidebarJob) return;
    setSidebarSkipBusy(true);
    try {
      const skipEvent = new CustomEvent('umbra:powerprompter-skip-active-job', { cancelable: true });
      window.dispatchEvent(skipEvent);
      if (skipEvent.defaultPrevented) return;
      const response = await fetch('/api/umbrabridge/comfyui/interrupt', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || `ComfyUI interrupt failed (${response.status})`));
      }
      useStore.getState().showToast('Skipped current generation', 'success');
    } catch (error: any) {
      useStore.getState().showToast(String(error?.message || 'Failed to skip current generation.'), 'error');
    } finally {
      setSidebarSkipBusy(false);
    }
  }, [canSkipSidebarJob, sidebarSkipBusy]);

  const handleOpenSidebarGenerationPreview = React.useCallback(() => {
    if (!comfySidebarPreviewImage || comfySidebarPreviewIsVideo) return;
    window.dispatchEvent(new CustomEvent('umbra:gallery-open-path', {
      detail: {
        imagePath: LIVE_GENERATION_PREVIEW_PATH,
        source: 'appbar-generation-preview',
        imageDataUrl: comfySidebarPreviewImage,
        prompt: comfySidebarActivePrompt || comfySidebarNextPrompt,
        status: effectiveComfyQueueBadge.status === 'complete' ? 'idle' : 'running',
        updatedAt: Date.now(),
      },
    }));
  }, [
    comfySidebarActivePrompt,
    comfySidebarNextPrompt,
    comfySidebarPreviewImage,
    comfySidebarPreviewIsVideo,
    effectiveComfyQueueBadge.status,
  ]);

  return (
    <>
    <div
      data-umbra-phone-topbar=""
      data-umbra-phone-comfy-dragging={phoneComfyMenuDragging ? '1' : '0'}
      aria-hidden={!isPhoneRemote}
      style={phoneTopbarStyle}
    >
      <button
        type="button"
        data-umbra-phone-menu-button=""
        onClick={handlePhoneMenuClick}
        onPointerDown={handlePhoneMenuPointerDown}
        onPointerMove={handlePhoneMenuPointerMove}
        onPointerUp={finishPhoneMenuDrag}
        onPointerCancel={finishPhoneMenuDrag}
        className="hidden"
        aria-label={phoneSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={phoneSidebarOpen}
        title={isPhoneComfyImmersive ? 'Tap to open menu. Long press and drag to move.' : undefined}
      >
        {phoneSidebarOpen ? <X size={19} /> : <Menu size={19} />}
      </button>
      <div data-umbra-phone-topbar-title="">
        <span>Umbra</span>
        <strong>{phoneWorkspaceLabel}</strong>
      </div>
      <div
        data-umbra-phone-topbar-status=""
        data-status={connections.comfyui === 'connected' ? 'connected' : 'idle'}
        title={`ComfyUI ${connections.comfyui}`}
      />
    </div>
    {isPhoneRemote && !isPhoneComfyImmersive ? (
      <nav data-umbra-phone-bottom-nav="" aria-label="Primary workspace navigation">
        <button
          type="button"
          data-active={activeWorkspace === 'umbraui' ? '1' : '0'}
          onClick={() => handleWorkspaceSelect('umbraui')}
          aria-label="Open Umbra UI"
        >
          <PanelsTopLeft size={19} />
          <span>Generate</span>
        </button>
        <button
          type="button"
          data-active={activeWorkspace === 'powerprompter' ? '1' : '0'}
          onClick={() => handleWorkspaceSelect('powerprompter')}
          aria-label="Open Power Prompter"
        >
          <Notebook size={19} />
          <span>Prompter</span>
        </button>
        <button
          type="button"
          data-active={activeWorkspace === 'library' ? '1' : '0'}
          onClick={() => handleWorkspaceSelect('library')}
          aria-label="Open Gallery"
        >
          <ImageIcon size={19} />
          <span>Gallery</span>
        </button>
        <button
          type="button"
          data-active={activeWorkspace === 'comfyui' ? '1' : '0'}
          onClick={() => handleWorkspaceSelect('comfyui')}
          aria-label="Open ComfyUI"
        >
          <Layers size={19} />
          <span>Comfy</span>
        </button>
        <button
          type="button"
          data-active={phoneSidebarOpen || phoneMoreWorkspaceActive ? '1' : '0'}
          onClick={() => setPhoneSidebarOpen((open) => !open)}
          aria-label={phoneSidebarOpen ? 'Close more workspaces' : 'Open more workspaces'}
          aria-expanded={phoneSidebarOpen}
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>
    ) : null}
    {isPhoneRemote && phoneSidebarOpen ? (
      <button
        type="button"
        data-umbra-phone-menu-backdrop=""
        onClick={() => setPhoneSidebarOpen(false)}
        aria-label="Close navigation menu"
      />
    ) : null}
    {isPhoneRemote && phoneSidebarOpen ? (
      <section
        data-umbra-phone-more-sheet=""
        role="dialog"
        aria-modal="true"
        aria-label="More Umbra workspaces"
      >
        <div data-umbra-phone-sheet-handle="" aria-hidden="true" />
        <div data-umbra-phone-sheet-header="">
          <div>
            <span>Umbra Studio</span>
            <strong>More</strong>
          </div>
          <button
            type="button"
            onClick={() => setPhoneSidebarOpen(false)}
            aria-label="Close more workspaces"
          >
            <X size={18} />
          </button>
        </div>
        <div data-umbra-phone-workspace-grid="">
          <button
            type="button"
            data-active={activeWorkspace === 'modelmanager' ? '1' : '0'}
            onClick={() => handleWorkspaceSelect('modelmanager')}
          >
            <Boxes size={20} />
            <span>Model Manager</span>
          </button>
          <button
            type="button"
            data-active={activeWorkspace === 'imageinspector' ? '1' : '0'}
            onClick={() => handleWorkspaceSelect('imageinspector')}
          >
            <ScanSearch size={20} />
            <span>Image Inspector</span>
          </button>
          <button
            type="button"
            data-active={activeWorkspace === 'board' ? '1' : '0'}
            onClick={() => handleWorkspaceSelect('board')}
          >
            <Anvil size={20} />
            <span>Data Forge</span>
          </button>
          <button
            type="button"
            data-active={activeWorkspace === 'localserver' ? '1' : '0'}
            onClick={() => handleWorkspaceSelect('localserver')}
          >
            <Server size={20} />
            <span>Local Servers</span>
          </button>
        </div>
        {isRemoteClient ? renderRemoteSessionControls('phone') : null}
        <button
          type="button"
          data-umbra-phone-settings-button=""
          onClick={() => {
            setPhoneSidebarOpen(false);
            setGlobalSettingsOpen(true);
          }}
        >
          <Settings2 size={19} />
          <span>
            <strong>Settings</strong>
            <small>Theme, storage, remote, and application preferences</small>
          </span>
          <ChevronDown size={16} className="-rotate-90" />
        </button>
        <div data-umbra-phone-sheet-status="">
          <span data-connected={connections.comfyui === 'connected' ? '1' : '0'} />
          ComfyUI {connections.comfyui === 'connected' ? 'ready' : connections.comfyui}
        </div>
      </section>
    ) : null}
    <aside
      data-umbra-appbar=""
      data-umbra-sidebar-expanded={isSidebarExpanded ? '1' : '0'}
      data-umbra-phone-open={phoneSidebarOpen ? '1' : '0'}
      className={cn(
        "relative h-screen flex-shrink-0 z-[80] overflow-visible",
        isAppBarCollapsed ? "w-7" : "w-64"
      )}
    >
      <div
        data-umbra-appbar-shell=""
        data-umbra-sidebar-expanded={isSidebarExpanded ? '1' : '0'}
        className={cn(
          "umbra-sidebar-shell h-screen glass-panel rounded-none border-y-0 border-l-0 flex flex-col relative overflow-hidden transition-[width] duration-200 ease-out",
          isSidebarExpanded ? "w-64" : "w-7",
          isAppBarCollapsed && !isHoverExpanded && "[animation:none] [box-shadow:none]",
          isAppBarCollapsed && isHoverExpanded
            ? "absolute left-0 top-0 z-[90] shadow-2xl"
            : "z-[85]"
        )}
        onMouseEnter={() => {
          if (isAppBarCollapsed) setIsHoverExpanded(true);
        }}
        onMouseLeave={() => {
          if (isAppBarCollapsed) setIsHoverExpanded(false);
        }}
      >
      <div
        className={cn(
          "flex-1 min-h-0 flex flex-col overflow-hidden transition-opacity duration-150",
          isSidebarExpanded
            ? "visible opacity-100"
            : "invisible opacity-0 pointer-events-none"
        )}
        aria-hidden={!isSidebarExpanded}
      >
      {/* [SYSTEM] - System Monitor */}
      {!isPhoneRemote ? (
      <>
      <div data-umbra-sidebar-system-section="" className="px-2 pt-2">
        <Disclosure defaultOpen>
          {({ open }) => (
            <div className="umbra-sidebar-section bg-black/10 rounded-xl overflow-hidden border border-transparent transition-all">
              <DisclosureButton className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                <Monitor size={16} />
                <span className="flex-1 text-left uppercase tracking-widest text-[10px] font-black">
                  System
                </span>
                <Heart
                  size={12}
                  className="text-[var(--umbra-accent)] fill-current"
                  style={{
                    animation: `heartbeat ${getHeartbeatSpeed()} ease-in-out infinite`
                  }}
                />
                <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
              </DisclosureButton>
              <DisclosurePanel className="px-0 pb-0">
                {systemMonitorReady ? (
                  <SystemMonitor className="bg-transparent border-0" />
                ) : (
                  <div className="h-24" aria-hidden="true" />
                )}
              </DisclosurePanel>
            </div>
          )}
        </Disclosure>
      </div>
      <div data-umbra-sidebar-quick-actions="" className="px-2 pb-2">
        <div className="umbra-sidebar-section bg-black/10 rounded-xl border border-transparent p-2">
          <div className="grid grid-cols-1 gap-1.5">
            <button
              onClick={() => setGlobalSettingsOpen(true)}
              className="h-8 rounded-md border border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-1"
              title="Global Settings (Ctrl+,)"
              aria-label="Open global settings"
            >
              <Sliders size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Settings</span>
            </button>

            <button
              onClick={() => setAppSetting('comfyui.showFilmstrip', !showFilmstrip)}
              className={cn(
                "h-8 rounded-md border transition-all flex items-center justify-center gap-1",
                showFilmstrip
                  ? "border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/15 text-white shadow-[0_0_12px_var(--umbra-accent-glow)] hover:border-[var(--umbra-accent)] hover:bg-[var(--umbra-accent)]/20"
                  : "border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white hover:border-white/30"
              )}
              title={showFilmstrip ? 'Hide filmstrip' : 'Show filmstrip'}
              aria-label={showFilmstrip ? 'Hide filmstrip' : 'Show filmstrip'}
            >
              {showFilmstrip ? <EyeOff size={13} /> : <Eye size={13} />}
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {showFilmstrip ? 'Hide Strip' : 'Show Strip'}
              </span>
            </button>

            <Popover className="relative">
              <PopoverButton className="h-8 rounded-md border border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-1 w-full">
                <Plug size={13} />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Neural Hub</span>
              </PopoverButton>
              <PopoverPanel anchor="bottom start" className="z-[100] mt-2 w-[30rem] max-h-[80vh] overflow-y-auto glass-panel p-5 space-y-5 shadow-2xl border-white/10 backdrop-blur-3xl [&_button]:text-[10px] [&_button]:py-2 [&_button]:px-2.5 [&_button]:tracking-[0.08em] [&_button]:font-semibold [&_button]:rounded-md [&_.tool-status]:text-[10px] [&_.tool-name]:text-sm">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-400 font-black border-b border-white/5 pb-3">Neural Hub Tools</div>
                <button
                  onClick={handleRefreshBrowser}
                  className="w-full bg-white/10 hover:bg-white/20 text-zinc-100 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} />
                  Refresh Browser
                </button>
                <div className="space-y-4">
                  {/* ComfyUI */}
                  <div className="tool-section space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all",
                        backendLoading.comfyui ? "bg-amber-500 animate-pulse shadow-[0_0_5px_#f59e0b]" :
                        connections.comfyui === 'connected' ? "bg-emerald-500 shadow-[0_0_5px_#10b981]" : "bg-zinc-700"
                      )} />
                      <span className="tool-name text-xs font-bold text-white flex-1">ComfyUI</span>
                      {(toolUpdates.comfyui.tool || toolUpdates.comfyui.pytorch) && <AlertCircle size={10} className="text-amber-400" />}
                      <span className={cn("tool-status text-[8px] uppercase font-bold",
                        backendLoading.comfyui ? "text-amber-500" :
                        connections.comfyui === 'connected' ? "text-emerald-500" : "text-zinc-600"
                      )}>
                        {backendLoading.comfyui || connections.comfyui}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleBackendToggle('comfyui')}
                        disabled={!!backendLoading.comfyui || restartingAll || stoppingAll}
                        className={cn(
                          "flex-1 text-[9px] uppercase tracking-wider font-bold py-1.5 px-2 rounded transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed",
                          connections.comfyui === 'connected' ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        )}
                      >
                        {backendLoading.comfyui ? <Loader2 size={10} className="animate-spin" /> : <Power size={10} />}
                        {backendLoading.comfyui === 'starting' ? 'Starting...' : backendLoading.comfyui === 'stopping' ? 'Stopping...' : connections.comfyui === 'connected' ? 'Stop' : 'Launch'}
                      </button>
                      <button
                        onClick={() => handleCheckConnection('comfyui')}
                        disabled={checkingConnection === 'comfyui' || !!backendLoading.comfyui || !!toolActionLoading.comfyui}
                        className="flex-1 text-[9px] uppercase tracking-wider font-bold py-1.5 px-2 rounded bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw size={10} className={cn(checkingConnection === 'comfyui' && 'animate-spin')} />
                        Check
                      </button>
                      <button
                        onClick={() => {
                          window.dispatchEvent(new Event('umbra:refresh-comfyui-iframe'));
                        }}
                        className="flex-1 text-[9px] uppercase tracking-wider font-bold py-1.5 px-2 rounded bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"
                        title="Refresh ComfyUI Frame"
                      >
                        <RefreshCw size={10} />
                        UI
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleToolAction('comfyui', 'install')}
                        disabled={isRemoteClient || !!toolActionLoading.comfyui || !!backendLoading.comfyui}
                        className="flex-1 text-[8px] uppercase tracking-wider font-bold py-1 px-2 rounded bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        {toolActionLoading.comfyui === 'install' ? 'Installing...' : 'Install'}
                      </button>
                      <button
                        onClick={() => handleToolAction('comfyui', 'update')}
                        disabled={isRemoteClient || !!toolActionLoading.comfyui || !!backendLoading.comfyui}
                        className="flex-1 text-[8px] uppercase tracking-wider font-bold py-1 px-2 rounded bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all disabled:opacity-50"
                      >
                        {toolActionLoading.comfyui === 'update' ? 'Updating...' : toolUpdates.comfyui.tool ? 'Update Ready' : 'Update'}
                      </button>
                      <button
                        onClick={() => handleToolAction('comfyui', 'custom_nodes')}
                        disabled={isRemoteClient || !!toolActionLoading.comfyui || !!backendLoading.comfyui}
                        className="flex-1 text-[8px] uppercase tracking-wider font-bold py-1 px-2 rounded bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                      >
                        {toolActionLoading.comfyui === 'custom_nodes' ? 'Nodes...' : 'Nodes'}
                      </button>
                      <button
                        onClick={() => handleToolAction('comfyui', 'update_pytorch')}
                        disabled={isRemoteClient || !!toolActionLoading.comfyui || !!backendLoading.comfyui}
                        className="flex-1 text-[8px] uppercase tracking-wider font-bold py-1 px-2 rounded bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                      >
                        {toolActionLoading.comfyui === 'update_pytorch' ? 'Torch...' : toolUpdates.comfyui.pytorch ? 'Torch Ready' : 'Torch'}
                      </button>
                      <button
                        onClick={() => handleToolAction('comfyui', 'install_sageattention')}
                        disabled={isRemoteClient || !!toolActionLoading.comfyui || !!backendLoading.comfyui}
                        className="flex-1 text-[8px] uppercase tracking-wider font-bold py-1 px-2 rounded bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20 transition-all disabled:opacity-50"
                      >
                        {toolActionLoading.comfyui === 'install_sageattention' ? 'Sage...' : 'Sage'}
                      </button>
                    </div>
                    {renderVersionControls('comfyui')}
                  </div>

                  {/* AI-Toolkit */}
                  <div className="tool-section space-y-2 border-t border-white/5 pt-4">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'h-1.5 w-1.5 rounded-full transition-all',
                        backendLoading.aitoolkit
                          ? 'animate-pulse bg-amber-500 shadow-[0_0_5px_#f59e0b]'
                          : aiToolkitStatus.healthy
                            ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]'
                            : aiToolkitStatus.running
                              ? 'animate-pulse bg-amber-500 shadow-[0_0_5px_#f59e0b]'
                              : 'bg-zinc-700'
                      )} />
                      <GraduationCap size={12} className="text-emerald-300" />
                      <span className="tool-name flex-1 text-xs font-bold text-white">AI-Toolkit</span>
                      {(toolUpdates.aitoolkit.tool || toolUpdates.aitoolkit.pytorch) ? <AlertCircle size={10} className="text-amber-400" /> : null}
                      <span className={cn(
                        'tool-status text-[8px] font-bold uppercase',
                        backendLoading.aitoolkit || (aiToolkitStatus.running && !aiToolkitStatus.healthy)
                          ? 'text-amber-500'
                          : aiToolkitStatus.healthy
                            ? 'text-emerald-500'
                            : aiToolkitStatus.installed
                              ? 'text-zinc-500'
                              : 'text-zinc-600'
                      )}>
                        {backendLoading.aitoolkit
                          || (aiToolkitStatus.healthy
                            ? 'connected'
                            : aiToolkitStatus.running
                              ? 'starting'
                              : aiToolkitStatus.installed
                                ? 'stopped'
                                : 'not installed')}
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => void handleAIToolkitToggle()}
                        disabled={
                          !!backendLoading.aitoolkit
                          || !!toolActionLoading.aitoolkit
                          || restartingAll
                          || stoppingAll
                          || (!aiToolkitStatus.running && (!aiToolkitStatus.installed || !aiToolkitStatus.nodeAvailable || !aiToolkitStatus.uiDependenciesInstalled))
                          || (aiToolkitStatus.running && aiToolkitStatus.ownership === 'external-compatible')
                        }
                        className={cn(
                          'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-50',
                          aiToolkitStatus.running || aiToolkitStatus.healthy
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        )}
                      >
                        {backendLoading.aitoolkit ? <Loader2 size={10} className="animate-spin" /> : <Power size={10} />}
                        {backendLoading.aitoolkit === 'starting'
                          ? 'Starting...'
                          : backendLoading.aitoolkit === 'stopping'
                            ? 'Stopping...'
                            : aiToolkitStatus.running || aiToolkitStatus.healthy
                              ? aiToolkitStatus.ownership === 'external-compatible' ? 'External' : 'Stop'
                              : 'Launch'}
                      </button>
                      <button
                        onClick={() => void handleAIToolkitCheck()}
                        disabled={checkingConnection === 'aitoolkit' || aiToolkitStatusLoading || !!backendLoading.aitoolkit || !!toolActionLoading.aitoolkit}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded bg-white/5 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-white/10 disabled:opacity-50"
                      >
                        <RefreshCw size={10} className={cn((checkingConnection === 'aitoolkit' || aiToolkitStatusLoading) && 'animate-spin')} />
                        Check
                      </button>
                      <button
                        onClick={handleOpenAIToolkitExternal}
                        disabled={!aiToolkitStatus.running && !aiToolkitStatus.healthy}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded bg-white/5 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-white/10 disabled:opacity-50"
                        title="Open AI-Toolkit in the browser"
                      >
                        <ExternalLink size={10} />
                        Open
                      </button>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => void handleToolAction('aitoolkit', 'install')}
                        disabled={isRemoteClient || !aiToolkitStatus.nodeAvailable || aiToolkitStatus.running || !!toolActionLoading.aitoolkit || !!backendLoading.aitoolkit}
                        className="flex-1 rounded bg-white/5 px-2 py-1 text-[8px] font-bold uppercase tracking-wider transition-all hover:bg-white/10 disabled:opacity-50"
                      >
                        {toolActionLoading.aitoolkit === 'install'
                          ? aiToolkitStatus.installed ? 'Repairing...' : 'Installing...'
                          : aiToolkitStatus.installed ? 'Repair' : 'Install'}
                      </button>
                      <button
                        onClick={() => void handleToolAction('aitoolkit', 'update')}
                        disabled={isRemoteClient || !aiToolkitStatus.installed || aiToolkitStatus.running || !!toolActionLoading.aitoolkit || !!backendLoading.aitoolkit}
                        className="flex-1 rounded bg-amber-500/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-amber-300 transition-all hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        {toolActionLoading.aitoolkit === 'update' ? 'Updating...' : toolUpdates.aitoolkit.tool ? 'Update Ready' : 'Update'}
                      </button>
                      <button
                        onClick={() => void handleToolAction('aitoolkit', 'update_pytorch')}
                        disabled={isRemoteClient || !aiToolkitStatus.installed || aiToolkitStatus.running || !!toolActionLoading.aitoolkit || !!backendLoading.aitoolkit}
                        className="flex-1 rounded bg-cyan-500/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-50"
                      >
                        {toolActionLoading.aitoolkit === 'update_pytorch' ? 'Torch...' : toolUpdates.aitoolkit.pytorch ? 'Torch Ready' : 'Torch'}
                      </button>
                    </div>

                    {!aiToolkitStatus.nodeAvailable ? (
                      <div className="text-[8px] leading-4 text-amber-300/80">Node.js 20 or newer is required to install and run AI-Toolkit.</div>
                    ) : (
                      <div className="truncate text-[8px] text-zinc-600" title={aiToolkitStatus.path || aiToolkitStatus.url}>
                        {aiToolkitStatus.path || `Node ${aiToolkitStatus.nodeVersion || 'ready'}`}
                      </div>
                    )}
                  </div>

                  {/* Bulk Actions */}
                  <div className="pt-2 border-t border-white/5 space-y-1.5">
                    <button
                      onClick={handleRestartAll}
                      disabled={restartingAll || stoppingAll || !hasManagedBackendRunning}
                      className="w-full text-[9px] uppercase tracking-wider font-bold py-2 px-3 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {restartingAll ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      {restartingAll ? 'Restarting...' : 'Restart Connected'}
                    </button>
                    <button
                      onClick={handleStopAll}
                      disabled={restartingAll || stoppingAll || !hasManagedBackendRunning}
                      className="w-full text-[9px] uppercase tracking-wider font-bold py-2 px-3 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {stoppingAll ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                      {stoppingAll ? 'Stopping...' : 'Stop All'}
                    </button>
                  </div>
                </div>
              </PopoverPanel>
            </Popover>

            <Popover className="relative">
              <PopoverButton
                className={cn(
                  "h-8 rounded-md border text-[10px] font-black tracking-[0.12em] uppercase transition-all leading-none w-full",
                  nsfwThumbnailBlurEnabled
                    ? "border-red-400/40 bg-red-500/15 text-red-200 hover:bg-red-500/25"
                    : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-red-300 hover:border-red-400/30 hover:bg-red-500/10"
                )}
                title={nsfwThumbnailBlurEnabled ? `NSFW Thumbnail Blur: ON (${nsfwThumbnailBlurIntensity}%)` : 'NSFW Thumbnail Blur: OFF'}
                aria-label="NSFW thumbnail blur settings"
              >
                NSFW
              </PopoverButton>
              <PopoverPanel anchor="bottom start" className="z-[110] mt-2 w-[240px] rounded-xl border border-white/15 bg-[#090b10]/95 p-3 shadow-2xl backdrop-blur-xl space-y-2">
              <div className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-400">
                NSFW Mode
              </div>
              <button
                onClick={() => setAppSetting('ui.nsfwThumbnailBlurEnabled', !nsfwThumbnailBlurEnabled)}
                className={cn(
                  "w-full px-2.5 py-2 rounded-md border text-[11px] font-semibold transition-colors",
                  nsfwThumbnailBlurEnabled
                    ? "border-red-400/40 bg-red-500/15 text-red-200 hover:bg-red-500/22"
                    : "border-white/15 bg-white/[0.04] text-zinc-300 hover:text-zinc-100 hover:border-white/30"
                )}
              >
                {nsfwThumbnailBlurEnabled ? 'Enabled' : 'Disabled'}
              </button>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-500">
                  <span>Blur Intensity</span>
                  <span className="text-zinc-300 tabular-nums">{nsfwThumbnailBlurIntensity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={nsfwThumbnailBlurIntensity}
                  onChange={(event) => {
                    const rawValue = Number(event.target.value);
                    const nextValue = Math.max(0, Math.min(100, Math.round(Number.isFinite(rawValue) ? rawValue : 85)));
                    setAppSetting('ui.nsfwThumbnailBlurIntensity', nextValue);
                  }}
                  className="w-full accent-red-400"
                  aria-label="NSFW blur intensity"
                />
              </div>
            </PopoverPanel>
          </Popover>

        </div>
      </div>
      </div>
      </>
      ) : null}

      <div data-umbra-sidebar-nav="" className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
        <div className="umbra-sidebar-section rounded-lg border border-transparent p-1">
          <div className="space-y-1">
          {!isPhoneRemote ? (
            <button
              onClick={() => handleWorkspaceSelect('umbraui')}
              className={sidebarNavItemClass(activeWorkspace === 'umbraui', 'w-full')}
            >
              <PanelsTopLeft size={14} />
              <span>Umbra UI</span>
            </button>
          ) : null}

          <button
            onClick={() => handleWorkspaceSelect('powerprompter')}
            className={sidebarNavItemClass(activeWorkspace === 'powerprompter', 'w-full')}
          >
            <Notebook size={14} />
            <span>Power Prompter</span>
          </button>

          <div>
            <div className="flex items-stretch gap-1">
                <DroppableNavItem id="nav-comfy" className="flex-1">
                  <button
                    onClick={() => handleWorkspaceSelect('comfyui')}
                    className={sidebarNavItemClass(activeWorkspace === 'comfyui', 'w-full')}
                  >
                    <Layers size={14} />
                    <span>ComfyUI</span>
                    {effectiveComfyQueueBadge.status === 'complete' && (
                      <span
                        className="ml-auto inline-flex items-center rounded-full border border-emerald-300/60 bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-100"
                        title="ComfyUI queue completed"
                      >
                        Complete
                      </span>
                    )}
                    <div
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]",
                        effectiveComfyQueueBadge.status === 'busy' || effectiveComfyQueueBadge.status === 'complete' ? "" : "ml-auto",
                        effectiveComfyQueueBadge.recentComplete || effectiveComfyQueueBadge.status === 'complete'
                          ? "text-emerald-300 bg-emerald-300 animate-pulse"
                          : effectiveComfyQueueBadge.status === 'busy'
                            ? "text-cyan-300 bg-cyan-300 animate-pulse"
                            : effectiveComfyQueueBadge.status === 'error'
                              ? "text-red-400 bg-red-400"
                              : connections.comfyui === 'connected'
                                ? "text-emerald-500 bg-emerald-500"
                                : "text-zinc-700 bg-zinc-700"
                      )}
                    />
                  </button>
                </DroppableNavItem>
                {!isPhoneRemote ? (
                  <button
                    onClick={(event) => handleOpenWorkspaceInBrowser(event, 'comfyui')}
                    className={sidebarAuxButtonClass}
                    title="Open ComfyUI in browser"
                    aria-label="Open ComfyUI in browser"
                  >
                    <ExternalLink size={12} />
                  </button>
                ) : null}
              </div>
              <div
                className={cn(
                  'overflow-hidden transition-[max-height,opacity,transform,margin] duration-200 ease-out',
                  showComfySidebarStatus
                    ? 'mt-1 max-h-[30rem] translate-y-0 opacity-100'
                    : 'mt-0 max-h-0 -translate-y-1 opacity-0 pointer-events-none'
                )}
                aria-hidden={!showComfySidebarStatus}
              >
                <div className="rounded-md border border-cyan-300/15 bg-cyan-500/[0.055] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">
                      {comfyAppPreviewImage ? 'ComfyUI Preview' : powerPrompterQueueStatus?.total ? 'Power Prompter Queue' : 'ComfyUI Queue'}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-zinc-400">
                        {effectiveComfyQueueBadge.remaining > 0
                          ? `${effectiveComfyQueueBadge.remaining} left`
                          : effectiveComfyQueueBadge.status === 'complete'
                            ? 'complete'
                            : effectiveComfyQueueBadge.status}
                      </span>
                      <button
                        type="button"
                        onClick={handleSidebarSkipCurrentJob}
                        disabled={!canSkipSidebarJob || sidebarSkipBusy}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors',
                          canSkipSidebarJob && !sidebarSkipBusy
                            ? 'border-amber-300/35 bg-amber-500/12 text-amber-100 hover:border-amber-200/60'
                            : 'border-white/10 bg-white/[0.03] text-zinc-600'
                        )}
                        title={canSkipSidebarJob ? 'Skip the current ComfyUI generation' : 'No running generation to skip'}
                      >
                        {sidebarSkipBusy ? <Loader2 size={10} className="animate-spin" /> : <Square size={9} />}
                        Skip
                      </button>
                    </div>
                  </div>
                  {comfySidebarPreviewImage ? (
                    <button
                      type="button"
                      onClick={handleOpenSidebarGenerationPreview}
                      disabled={comfySidebarPreviewIsVideo}
                      className="mt-2 block w-full overflow-hidden rounded-md border border-white/10 bg-black/35 text-left transition hover:border-cyan-300/45 hover:shadow-[0_0_18px_rgba(34,211,238,0.16)] disabled:cursor-default disabled:hover:border-white/10 disabled:hover:shadow-none"
                      title={comfySidebarPreviewIsVideo ? 'Video previews do not open in the media viewer yet' : 'Open live generation preview'}
                    >
                      {comfySidebarPreviewIsVideo ? (
                        <video
                          src={comfySidebarPreviewImage}
                          className="h-56 w-full bg-black object-contain"
                          autoPlay
                          muted
                          loop
                          playsInline
                        />
                      ) : (
                        <img
                          src={comfySidebarPreviewImage}
                          alt="Live generation preview"
                          className="h-56 w-full bg-black object-contain"
                          loading="eager"
                        />
                      )}
                    </button>
                  ) : null}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/35">
                    <div
                      className="h-full rounded-full bg-cyan-300/80 transition-[width] duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, comfySidebarProgress))}%` }}
                    />
                  </div>
                  {comfySidebarPreviewStep ? (
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-cyan-100/85">
                      {comfySidebarPreviewStep}
                    </div>
                  ) : null}
                  {comfySidebarActivePrompt || comfySidebarNextPrompt ? (
                    <div className="mt-1.5 min-w-0 text-[10px] leading-snug text-zinc-300">
                      <span className="text-zinc-500">{comfySidebarActivePrompt ? 'Now: ' : 'Next: '}</span>
                      <span className="line-clamp-2">{comfySidebarActivePrompt || comfySidebarNextPrompt}</span>
                    </div>
                  ) : null}
                </div>
              </div>
          </div>

          <div className="flex items-stretch gap-1">
            <button
              onClick={() => handleWorkspaceSelect('library')}
              className={sidebarNavItemClass(activeWorkspace === 'library', 'flex-1')}
            >
              <ImageIcon size={14} />
              <span>Gallery</span>
            </button>
            {!isPhoneRemote ? (
              <button
                onClick={handleOpenGalleryPopout}
                className={sidebarAuxButtonClass}
                title="Pop out Gallery"
                aria-label="Pop out Gallery"
              >
                <ExternalLink size={12} />
              </button>
            ) : null}
          </div>

          {!isPhoneRemote ? (
            <>
              <DroppableNavItem id="nav-modelmanager">
                <button
                  onClick={() => handleWorkspaceSelect('modelmanager')}
                  className={sidebarNavItemClass(activeWorkspace === 'modelmanager', 'w-full')}
                >
                  <Boxes size={14} />
                  <span>Model Manager</span>
                </button>
              </DroppableNavItem>

              <DroppableNavItem id="nav-imageinspector">
                <button
                  onClick={() => handleWorkspaceSelect('imageinspector')}
                  className={sidebarNavItemClass(activeWorkspace === 'imageinspector', 'w-full')}
                >
                  <ScanSearch size={14} />
                  <span>Image Inspector</span>
                </button>
              </DroppableNavItem>
            </>
          ) : null}
        {!isPhoneRemote ? (
          <button
            onClick={() => handleWorkspaceSelect('board')}
            className={sidebarNavItemClass(activeWorkspace === 'board', 'w-full')}
          >
            <Anvil size={14} />
            <span>Data Forge</span>
          </button>
        ) : null}

        {!isPhoneRemote ? (
          <LocalServersSidebarSection
            active={activeWorkspace === 'localserver'}
            navItemClass={sidebarNavItemClass}
            auxButtonClass={sidebarAuxButtonClass}
          />
        ) : null}

        {!isPhoneRemote && !isRemoteClient ? (
          <UmbraRemoteSidebarSection
            active={activeWorkspace === 'remote'}
            onSelect={() => handleWorkspaceSelect('remote')}
          />
        ) : null}

          </div>
        </div>
        {!isPhoneRemote && isRemoteClient ? renderRemoteSessionControls('sidebar') : null}
      </div>
      </div>

      <div className={cn(
        "umbra-sidebar-divider border-t p-2",
        isSidebarExpanded ? "border-white/10" : "border-transparent p-1"
      )}>
        <button
          onClick={handleSidebarToggle}
          className={cn(
            "w-full h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all",
            !isSidebarExpanded && "h-8"
          )}
          title={isAppBarCollapsed ? "Pin Sidebar Open" : "Collapse Sidebar"}
          aria-label={isAppBarCollapsed ? "Pin Sidebar Open" : "Collapse Sidebar"}
        >
          {isAppBarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      </div>
    </aside>
    <WatermarkSettings
      isOpen={watermarkOpen}
      onClose={() => setWatermarkOpen(false)}
    />
    <GlobalSettings
      isOpen={globalSettingsOpen}
      onClose={() => setGlobalSettingsOpen(false)}
    />
    </>
  );
};

