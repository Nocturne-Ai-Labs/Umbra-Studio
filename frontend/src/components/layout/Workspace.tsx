'use client';

import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { ArrowDown, ArrowUp, Power, Zap, RefreshCw, Loader2, ExternalLink, Pencil, Globe2, Plus, Save, Trash2, FolderOpen } from 'lucide-react';
import { useComponentDebug } from '@/hooks/useComponentDebug';
import { DropZone } from '@/lib/dnd';
import { useToastStore } from '@/store/useToastStore';
import type { ImageItem } from '@/types/media';
import { extractMetadataFromPath } from '@/utils/metadata';
import { copyImagesToWorkspace, type WorkspaceCopyResult } from '@/lib/workspaceFileActions';
import { governorShouldRun, governorTryAcquire } from '@/lib/loadGovernor';
import { logDiagnostic } from '@/lib/diagnostics';
import { UmbraFilmstrip } from './UmbraFilmstrip';
import { PowerPrompter } from '@/components/layout/PowerPrompter';
import type { WorkspaceType } from '@/store/useStore';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  buildLocalServerApp,
  getLocalServerFrameUrl,
  loadLocalServerApps,
  openLocalServerAppFolder,
  saveLocalServerApps,
  validateLocalServerUrl,
  type LocalServerApp,
} from '@/lib/localServerApps';

const LAZY_CHUNK_RELOAD_PREFIX = 'umbra.lazyChunkReload.';

async function importWithChunkRecovery<T>(key: string, importer: () => Promise<T>): Promise<T> {
  try {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`${LAZY_CHUNK_RELOAD_PREFIX}${key}`);
      } catch {
        // ignore sessionStorage access failures
      }
    }
    return await importer();
  } catch (error: any) {
    const message = String(error?.message || error || '');
    const isChunkLoadFailure = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(message);
    if (typeof window !== 'undefined' && isChunkLoadFailure) {
      const storageKey = `${LAZY_CHUNK_RELOAD_PREFIX}${key}`;
      let alreadyRetried = false;
      try {
        alreadyRetried = window.sessionStorage.getItem(storageKey) === '1';
      } catch {
        alreadyRetried = false;
      }
      if (!alreadyRetried) {
        try {
          window.sessionStorage.setItem(storageKey, '1');
        } catch {
          // ignore sessionStorage access failures
        }
        window.location.reload();
        return new Promise<T>(() => undefined);
      }
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // ignore sessionStorage access failures
      }
    }
    throw error;
  }
}

const SUCCESS_TOAST_THRESHOLD = 3;
const COMFY_BRIDGE_MESSAGE_TIMEOUT_MS = 4500;

const loadImageInspectorWorkspaceModule = () => importWithChunkRecovery('image-inspector-workspace', () => import('./ImageInspectorWorkspace'));
const loadModelManagerWorkspaceModule = () => importWithChunkRecovery('model-manager-workspace', () => import('./ModelManagerWorkspace'));
const loadBoardBrowserModule = () => importWithChunkRecovery('board-browser', () => import('@/components/board/BoardBrowser'));
const loadReactGalleryWorkspaceModule = () => importWithChunkRecovery('react-gallery-workspace', () => import('./ReactGalleryWorkspace'));
const loadUmbraRemoteWorkspaceModule = () => importWithChunkRecovery('umbra-remote-workspace', () => import('./UmbraRemoteWorkspace'));
const loadUmbraUIWorkspaceModule = () => importWithChunkRecovery('umbra-ui-workspace', () => import('./UmbraUIWorkspace'));

const WORKSPACE_NAV_ORDER: WorkspaceType[] = [
  'umbraui',
  'powerprompter',
  'comfyui',
  'library',
  'modelmanager',
  'imageinspector',
  'board',
  'localserver',
  'remote',
];
const WORKSPACE_SLIDE_ANIMATION_MS = 280;

function getWorkspaceNavRank(workspace: WorkspaceType): number {
  const index = WORKSPACE_NAV_ORDER.indexOf(workspace);
  return index >= 0 ? index : WORKSPACE_NAV_ORDER.length;
}

const ImageInspectorWorkspace = lazy(async () => {
  const module = await loadImageInspectorWorkspaceModule();
  return { default: module.ImageInspectorWorkspace };
});

const ModelManagerWorkspace = lazy(async () => {
  const module = await loadModelManagerWorkspaceModule();
  return { default: module.ModelManagerWorkspace };
});

const BoardBrowser = lazy(async () => {
  const module = await loadBoardBrowserModule();
  return { default: module.BoardBrowser };
});

const UmbraRemoteWorkspace = lazy(async () => {
  const module = await loadUmbraRemoteWorkspaceModule();
  return { default: module.default };
});

const ReactGalleryWorkspace = lazy(async () => {
  const module = await loadReactGalleryWorkspaceModule();
  return { default: module.ReactGalleryWorkspace };
});

const UmbraUIWorkspace = lazy(async () => {
  const module = await loadUmbraUIWorkspaceModule();
  return { default: module.UmbraUIWorkspace };
});


interface ComfyImageNodeOption {
  id: number;
  title: string;
  type: string;
  selected: boolean;
  widgetName?: string;
  widgetValue?: string;
}

interface ComfyHandoffResult {
  ok?: boolean;
  error?: string;
  createdNode?: boolean;
  assigned?: {
    nodeId?: number;
    filename?: string;
    widgetName?: string;
  };
  skipped?: string[];
}

interface ComfyVersionOption {
  ref: string;
  commit: string;
  date: string | null;
  subject: string | null;
}

interface VersionCatalogResponse {
  available?: boolean;
  unavailableReason?: string | null;
  currentRef?: string;
  currentCommit?: string;
  versions?: ComfyVersionOption[];
  error?: string;
}

type VersionManagedBackend = 'comfyui';

function useIframeVisibilityRecovery<T extends HTMLIFrameElement>(
  iframeRef: React.RefObject<T | null>,
  isActive: boolean,
  isRendered: boolean,
  src: string,
) {
  const lastActiveAtRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive || !isRendered) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    lastActiveAtRef.current = Date.now();
    const activationId = lastActiveAtRef.current;
    iframe.style.visibility = 'visible';
    iframe.style.opacity = '1';
    iframe.style.transform = 'translateZ(0)';

    const repaint = () => {
      if (lastActiveAtRef.current !== activationId) return;
      try {
        iframe.contentWindow?.postMessage({ type: 'UMBRA_WORKSPACE_VISIBLE' }, '*');
        iframe.contentWindow?.dispatchEvent(new Event('resize'));
      } catch {
        // Cross-origin frames can reject direct dispatch; CSS repaint still helps.
      }
      iframe.style.transform = 'translateZ(0.001px)';
      window.setTimeout(() => {
        if (lastActiveAtRef.current === activationId) {
          iframe.style.transform = 'translateZ(0)';
        }
      }, 32);
    };

    repaint();
    window.setTimeout(repaint, 80);
    window.setTimeout(repaint, 240);

    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      if (lastActiveAtRef.current !== activationId) return;
      const currentSrc = String(iframe.getAttribute('src') || '').trim();
      if (!currentSrc && src) {
        iframe.setAttribute('src', src);
      }
    }, 800);
  }, [iframeRef, isActive, isRendered, src]);
}

const extractFileName = (value: string): string => {
  const normalized = String(value || '').replace(/\\/g, '/').trim();
  if (!normalized) return '';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
};

const getWorkspaceCopyFilename = (result: WorkspaceCopyResult, fallback?: ImageItem): string => {
  return extractFileName(
    result.filename ||
    result.destPath ||
    result.path ||
    result.name ||
    fallback?.path ||
    fallback?.name ||
    ''
  );
};

const readFilmstripImagesFromTransfer = (dataTransfer: DataTransfer): ImageItem[] => {
  const types = Array.from(dataTransfer.types || []);
  if (!types.includes('application/json')) return [];

  try {
    const payload = JSON.parse(dataTransfer.getData('application/json'));
    const rawImages = Array.isArray(payload?.images)
      ? payload.images
      : payload?.image
        ? [payload.image]
        : [];

    return rawImages
      .map((image: any) => ({
        ...image,
        name: String(image?.name || extractFileName(image?.path || image?.url || 'Dropped image')),
        path: String(image?.path || ''),
      }) as ImageItem)
      .filter((image: ImageItem) => Boolean(image.path));
  } catch {
    return [];
  }
};

const openExternal = (url: string, label = 'external link') => {
  const href = String(url || '').trim();
  if (!href) return;
  try {
    window.open(href, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.warn(`Failed to open ${label}`, error);
  }
};

const BackendSplash = ({ name, backend, icon }: { name: string, backend: 'comfyui', icon: string }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [startupProgress, setStartupProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toolInstalled, setToolInstalled] = useState<boolean | null>(null);
  const [hasToolUpdate, setHasToolUpdate] = useState(false);
  const [hasPyTorchUpdate, setHasPyTorchUpdate] = useState(false);
  const [toolActionLoading, setToolActionLoading] = useState<'install' | 'update' | 'custom_nodes' | 'update_pytorch' | 'install_sageattention' | null>(null);
  const [comfyVersions, setComfyVersions] = useState<ComfyVersionOption[]>([]);
  const [currentComfyRef, setCurrentComfyRef] = useState('');
  const [currentComfyCommit, setCurrentComfyCommit] = useState('');
  const [selectedComfyRef, setSelectedComfyRef] = useState('');
  const [isLoadingComfyVersions, setIsLoadingComfyVersions] = useState(false);
  const [isSwitchingComfyVersion, setIsSwitchingComfyVersion] = useState(false);
  const [comfyVersionError, setComfyVersionError] = useState<string | null>(null);
  const fetchSystemStatus = useStore((state) => state.fetchSystemStatus);
  const isLaunching = useStore((state) => state.booting[backend]);
  const setBooting = useStore((state) => state.setBooting);
  const setComfyLaunchPhase = useStore((state) => state.setComfyLaunchPhase);
  const versionBackend: VersionManagedBackend | null = backend === 'comfyui'
    ? backend
    : null;
  const versionBackendLabel = backend === 'comfyui'
    ? 'ComfyUI'
    : name;
  const isRemoteClient = isUmbraRemoteClient();

  const setIsLaunching = (value: boolean) => setBooting(backend, value);
  const consoleScrollRef = React.useRef<HTMLDivElement>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const activeToolActionIdRef = React.useRef<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const isMountedRef = React.useRef(true);

  // Track mounted state to prevent state updates after unmount
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Abort any in-flight requests on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (backend === 'comfyui') {
        useStore.getState().setBooting('comfyuiVersions', false);
      }
    };
  }, [backend]);

  // Auto-detect if backend is already running on mount
  React.useEffect(() => {
    const checkIfAlreadyRunning = async () => {
      try {
        await fetchSystemStatus({ force: true });
      } catch (err) {
        // Ignore - server might not be up yet
      }
    };
    checkIfAlreadyRunning();
  }, [fetchSystemStatus]);

  const loadToolMeta = React.useCallback(async () => {
    try {
      const [detectRes, updatesRes] = await Promise.all([
        fetch('/api/tools/detect'),
        fetch('/api/tools/updates/summary')
      ]);
      if (detectRes.ok) {
        const detect = await detectRes.json();
        setToolInstalled(Boolean(detect?.[backend]?.detected));
      }
      if (updatesRes.ok) {
        const updates = await updatesRes.json();
        const toolName = backend === 'comfyui'
          ? 'ComfyUI'
          : 'Unknown';
        setHasToolUpdate(Boolean(updates?.updates?.some((u: any) => u.tool === toolName && u.type === 'tool')));
        setHasPyTorchUpdate(Boolean(updates?.updates?.some((u: any) => u.tool === toolName && u.type === 'pytorch')));
      }
    } catch {
      // Keep UI responsive even if this fails.
    }
  }, [backend]);

  React.useEffect(() => {
    void loadToolMeta();
    const timer = setInterval(() => {
      if (!governorShouldRun(`workspace:${backend}:tool-meta-poll`, 60000)) return;
      const release = governorTryAcquire('background');
      if (!release) return;
      void loadToolMeta().finally(() => {
        release();
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [backend, loadToolMeta]);

  const loadComfyVersions = React.useCallback(async () => {
    if (!versionBackend) return;
    setIsLoadingComfyVersions(true);
    setComfyVersionError(null);

    try {
      const response = await fetch(`/api/tools/${versionBackend}/versions?limit=500`);
      const data = await response.json() as VersionCatalogResponse;
      if (!response.ok) {
        throw new Error(data?.error || `Failed to load ${versionBackendLabel} versions`);
      }
      if (data?.available === false) {
        setComfyVersions([]);
        setCurrentComfyRef('');
        setCurrentComfyCommit('');
        setComfyVersionError(String(data?.unavailableReason || `${versionBackendLabel} version switching is unavailable.`));
        return;
      }

      const versions = Array.isArray(data?.versions) ? data.versions as ComfyVersionOption[] : [];
      const currentRef = String(data?.currentRef || '').trim();
      const currentCommit = String(data?.currentCommit || '').trim();

      setComfyVersions(versions);
      setCurrentComfyRef(currentRef);
      setCurrentComfyCommit(currentCommit);
      setSelectedComfyRef((prev) => {
        const normalizedPrev = String(prev || '').trim();
        if (normalizedPrev && versions.some((entry) => entry.ref === normalizedPrev)) {
          return normalizedPrev;
        }
        return currentRef || normalizedPrev || (versions[0]?.ref || '');
      });
    } catch (err: any) {
      const message = err?.message || `Failed to load ${versionBackendLabel} versions`;
      setComfyVersions([]);
      setCurrentComfyRef('');
      setCurrentComfyCommit('');
      setComfyVersionError(message);
    } finally {
      setIsLoadingComfyVersions(false);
      useStore.getState().setBooting('comfyuiVersions', false);
    }
  }, [versionBackend, versionBackendLabel]);

  React.useEffect(() => {
    if (!versionBackend) return;
    void loadComfyVersions().catch(() => {});
    const timer = setInterval(() => {
      if (!governorShouldRun(`workspace:${versionBackend}:versions-poll`, 120000)) return;
      const release = governorTryAcquire('background');
      if (!release) return;
      void loadComfyVersions().catch(() => {}).finally(() => {
        release();
      });
    }, 120000);
    return () => clearInterval(timer);
  }, [versionBackend, loadComfyVersions]);

  // Auto-scroll console panel to bottom without scrolling the whole page.
  React.useEffect(() => {
    const container = consoleScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [consoleLines]);

  // WebSocket for real-time logs - connect to /ws/logs
  React.useEffect(() => {
    if (!isLaunching && !toolActionLoading && !isSwitchingComfyVersion) {
      return;
    }

    // Connect to the logs WebSocket endpoint on the same host serving the app.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);
    wsRef.current = ws;

    ws.onopen = () => {
      logDiagnostic('[BackendSplash] WebSocket connected to /ws/logs', undefined, 'log');
      setConsoleLines(prev => [...prev, `[Umbra] Connected to log stream...`]);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'backend_log' && data.data.backend === backend) {
          const message = data.data.message;
          // Handle batched messages (may contain newlines)
          const lines = message.split('\n').filter((l: string) => l.trim());
          setConsoleLines(prev => [...prev.slice(-100), ...lines]); // Keep last 100 lines

          // Update progress based on log content
          const lowerMsg = message.toLowerCase();
          if (lowerMsg.includes('starting') || lowerMsg.includes('initializing')) {
            setStartupProgress(prev => Math.max(prev, 20));
            setStatusText('Initializing...');
          } else if (lowerMsg.includes('loading') || lowerMsg.includes('importing')) {
            setStartupProgress(prev => Math.max(prev, 40));
            setStatusText('Loading modules...');
          } else if (lowerMsg.includes('cuda') || lowerMsg.includes('gpu') || lowerMsg.includes('torch')) {
            setStartupProgress(prev => Math.max(prev, 60));
            setStatusText('Initializing GPU...');
          } else if (lowerMsg.includes('listening') || lowerMsg.includes('running on') || lowerMsg.includes('server')) {
            setStartupProgress(prev => Math.max(prev, 80));
            setStatusText('Starting server...');
          }
        } else if (data.type === 'log_tool_action' && data.data?.tool === backend) {
          const message = String(data.data.message || '');
          if (!message) return;
          const actionId = data.data.actionId as string | undefined;
          if (actionId && activeToolActionIdRef.current && actionId !== activeToolActionIdRef.current) {
            return;
          }
          setConsoleLines(prev => [...prev.slice(-100), message]);
        }
      } catch (err) {
        // Ignore parse errors for non-JSON messages
      }
    };

    ws.onerror = (error) => {
      console.error('[BackendSplash] WebSocket error:', error);
    };

    ws.onclose = () => {
      logDiagnostic('[BackendSplash] WebSocket closed', undefined, 'log');
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isLaunching, toolActionLoading, isSwitchingComfyVersion, backend]);

  const handleLaunch = async () => {
    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setComfyLaunchPhase('starting');
    setStartupProgress(5);
    setStatusText('Starting backend...');
    setConsoleLines([`[Umbra] Launching ${name}...`]);
    setError(null);

    try {
      // Step 1: Start the backend
      const startResponse = await fetch('/api/umbrabridge/backend/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend }),
        signal,
      });

      if (!isMountedRef.current) return;

      if (!startResponse.ok) {
        const err = await startResponse.json();
        throw new Error(err.message || err.error || `Failed to start backend (${startResponse.status})`);
      }

      const startResult = await startResponse.json();
      logDiagnostic(`[BackendSplash] ${name} start response:`, startResult, 'log');
      if (startResult?.success === false) {
        throw new Error(startResult.error || startResult.message || 'Failed to start backend');
      }

      // If already running, still verify it's accepting connections
      if (startResult.message === 'Already running') {
        setConsoleLines(prev => [...prev, `[Umbra] ${name} process is running, checking server...`]);
        setStartupProgress(50);
        setStatusText('Checking server status...');
        // Don't return - fall through to wait-ready check
      } else {
        setStartupProgress(10);
        setStatusText('Backend process started...');
        setConsoleLines(prev => [...prev, `[Umbra] Process started, waiting for server...`]);
      }

      // Step 2: Wait for the server to be ready using wait-ready endpoint
      const waitResponse = await fetch('/api/umbrabridge/backend/wait-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No startup timeout: wait until ready or user cancels.
        body: JSON.stringify({ backend, timeout: null }),
        signal,
      });

      if (!isMountedRef.current) return;

      if (waitResponse.ok) {
        const waitResult = await waitResponse.json();
        if (waitResult.ready) {
          if (!isMountedRef.current) return;
          setStartupProgress(100);
          setStatusText('Ready!');
          setConsoleLines(prev => [...prev, `[Umbra] OK: ${name} is ready.`]);
          // The readiness probe is authoritative. Commit it atomically so the
          // iframe does not wait for the separately cached status sampler.
          setComfyLaunchPhase('ready');
          void fetchSystemStatus({ force: true });
        } else {
          throw new Error(waitResult.error || 'Server failed to start');
        }
      } else {
        const err = await waitResponse.json();
        throw new Error(err.message || err.error || `Timeout waiting for server (${waitResponse.status})`);
      }
    } catch (err: any) {
      // Ignore abort errors (user navigated away or refreshed)
      if (err.name === 'AbortError') {
        logDiagnostic(`[BackendSplash] ${name} launch aborted`, undefined, 'log');
        setIsLaunching(false);
        return;
      }
      if (!isMountedRef.current) return;
      console.error(`[BackendSplash] Error launching ${name}:`, err);
      setError(err.message || 'Unknown error');
      setStatusText('Failed to start');
      setConsoleLines(prev => [...prev, `[Umbra] ERROR: ${err.message}`]);
      setComfyLaunchPhase('offline');
      void fetchSystemStatus({ force: true });
    }
  };

  const handleCheckConnection = async () => {
    setIsChecking(true);
    await fetchSystemStatus({ force: true });
    setTimeout(() => setIsChecking(false), 1000);
  };

  const handleRetry = () => {
    setError(null);
    setIsLaunching(false);
    setStartupProgress(0);
    setConsoleLines([]);
    setStatusText('');
  };

  const handleToolAction = async (action: 'install' | 'update' | 'custom_nodes' | 'update_pytorch' | 'install_sageattention') => {
    if (isRemoteClient) {
      setError('Install and update actions are only available from the host PC.');
      setStatusText('Host-only action blocked');
      return;
    }
    setToolActionLoading(action);
    setError(null);
    const actionLabel = String(action ?? '').replace('_', ' ');
    setStatusText(`Running ${actionLabel}...`);
    setConsoleLines(prev => [...prev, `[Umbra] Running ${actionLabel} for ${name}...`]);

    try {
      const res = await fetch('/api/tools/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tool: backend })
      });
      const data = await res.json();
      if (!res.ok || !data?.actionId) {
        throw new Error(data?.error || 'Failed to start action');
      }

      const actionId = data.actionId as string;
      activeToolActionIdRef.current = actionId;
      let lastLogCount = 0;
      let complete = false;
      while (!complete) {
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await fetch(`/api/tools/actions/${actionId}`);
        if (!statusRes.ok) throw new Error('Failed to read action status');
        const status = await statusRes.json();

        if (Array.isArray(status.logs)) {
          const hasWsConnection = wsRef.current?.readyState === WebSocket.OPEN;
          if (!hasWsConnection && status.logs.length > lastLogCount) {
            const newLines = status.logs.slice(lastLogCount);
            setConsoleLines(prev => [...prev.slice(-80), ...newLines]);
          }
          lastLogCount = status.logs.length;
        }

        if (status.status === 'completed') {
          complete = true;
          setStatusText('Action complete');
          setConsoleLines(prev => [...prev, `[Umbra] ✓ ${actionLabel} complete`]);
        } else if (status.status === 'failed') {
          throw new Error(status.error || 'Tool action failed');
        }
      }

      if (versionBackend) {
        await Promise.all([fetchSystemStatus(), loadToolMeta(), loadComfyVersions()]);
      } else {
        await Promise.all([fetchSystemStatus(), loadToolMeta()]);
      }
    } catch (err: any) {
      setError(err?.message || 'Tool action failed');
      setStatusText('Action failed');
      setConsoleLines(prev => [...prev, `[Umbra] ✗ ${err?.message || 'Tool action failed'}`]);
    } finally {
      setToolActionLoading(null);
      activeToolActionIdRef.current = null;
    }
  };

  const formatComfyVersionDate = (value: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const handleComfyVersionSwitch = async () => {
    if (!versionBackend) return;
    if (isRemoteClient) {
      const message = 'Version switching is only available from the host PC.';
      setComfyVersionError(message);
      setError(message);
      setStatusText('Host-only action blocked');
      return;
    }
    const targetRef = String(selectedComfyRef || '').trim();
    if (!targetRef || isSwitchingComfyVersion) return;

    setIsSwitchingComfyVersion(true);
    setComfyVersionError(null);
    setError(null);
    setStatusText(`Switching to ${targetRef}...`);
    setConsoleLines(prev => [...prev, `[Umbra] Switching ${versionBackendLabel} to ${targetRef}...`]);

    try {
      const startRes = await fetch(`/api/tools/${versionBackend}/version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: targetRef })
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData?.actionId) {
        throw new Error(startData?.error || `Failed to start ${versionBackendLabel} version switch`);
      }

      const actionId = String(startData.actionId);
      activeToolActionIdRef.current = actionId;
      let lastLogCount = 0;
      let complete = false;
      while (!complete) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusRes = await fetch(`/api/tools/actions/${actionId}`);
        if (!statusRes.ok) throw new Error('Failed to read version switch status');
        const status = await statusRes.json();

        if (Array.isArray(status.logs)) {
          const hasWsConnection = wsRef.current?.readyState === WebSocket.OPEN;
          if (!hasWsConnection && status.logs.length > lastLogCount) {
            const newLines = status.logs.slice(lastLogCount);
            setConsoleLines(prev => [...prev.slice(-80), ...newLines]);
          }
          lastLogCount = status.logs.length;
        }

        if (status.status === 'completed') {
          complete = true;
          setStatusText('Version switch complete');
          setConsoleLines(prev => [...prev, `[Umbra] OK: ${versionBackendLabel} switched to ${targetRef}`]);
        } else if (status.status === 'failed') {
          const verifyFailureMessage = status?.verifyFailure?.nextSteps?.[0] || status?.verifyFailure?.title;
          throw new Error(verifyFailureMessage || status.error || `${versionBackendLabel} version switch failed`);
        }
      }

      useStore.getState().showToast(`${versionBackendLabel} switched to ${targetRef}`, 'success');
      await Promise.all([fetchSystemStatus(), loadToolMeta(), loadComfyVersions()]);
    } catch (err: any) {
      const message = err?.message || `Failed to switch ${versionBackendLabel} version`;
      setComfyVersionError(message);
      setError(message);
      setStatusText('Version switch failed');
      setConsoleLines(prev => [...prev, `[Umbra] ERROR: ${message}`]);
      useStore.getState().showToast(message, 'error');
    } finally {
      setIsSwitchingComfyVersion(false);
      activeToolActionIdRef.current = null;
    }
  };

  const showConsolePanel = isLaunching || !!toolActionLoading || isSwitchingComfyVersion || !!error || consoleLines.length > 0;

  return (
    <div className="w-full h-full text-zinc-500 bg-black/60 backdrop-blur-3xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--umbra-accent-glow)] to-transparent opacity-10" />

      <div className="relative z-10 w-full h-full overflow-y-auto overscroll-contain custom-scrollbar">
        <div className="text-center w-full max-w-2xl mx-auto px-8 py-8">
        <div className="text-6xl mb-6 opacity-20">{icon}</div>
        <div className="text-4xl font-black text-white mb-2 tracking-tighter uppercase">
          {name} <span className={error ? 'text-red-500' : 'text-[var(--umbra-accent)]'}>
            {error ? 'Error' : isLaunching ? 'Starting...' : 'Offline'}
          </span>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] opacity-40 mb-8">
          {error ? 'Failed to start backend' : isLaunching ? statusText || 'Starting backend...' : 'Backend not connected'}
        </p>

        {showConsolePanel && (
          <div className="mb-8 w-full">
            {/* Progress Bar */}
            <div className="w-full bg-black/40 rounded-full h-3 mb-3 overflow-hidden border border-white/10">
              <div
                className={`h-full ${error ? 'bg-red-500' : 'bg-gradient-to-r from-[var(--umbra-accent)] to-[var(--umbra-accent-glow)]'}`}
                style={{ width: `${startupProgress}%`, transition: 'width 300ms ease-out' }}
              />
            </div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-zinc-400 font-mono">
                {statusText || 'Initializing...'}
              </p>
              {isLaunching && (
                <p className="text-xs text-zinc-500 font-mono">
                  {startupProgress}%
                </p>
              )}
            </div>

            {/* Console Logs */}
            <div className="glass-panel bg-black/80 border-white/10 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-black/40">
                <div className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'} ${!error && 'animate-pulse'}`} />
                <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider flex-1">Console Output</p>
                <p className="text-xs text-zinc-600 font-mono">{consoleLines.length} lines</p>
              </div>
              <div
                ref={consoleScrollRef}
                className="p-4 max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
              >
                <div className="space-y-0.5 font-mono text-xs">
                  {consoleLines.length === 0 && (
                    <p className="text-zinc-600 italic">Waiting for output...</p>
                  )}
                  {consoleLines.map((line, i) => (
                    <div
                      key={i}
                      className={`leading-relaxed whitespace-pre-wrap break-all ${
                        line.includes('[Umbra]') ? 'text-[var(--umbra-accent)]' :
                        line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') ? 'text-red-400' :
                        line.toLowerCase().includes('warning') ? 'text-yellow-400' :
                        line.toLowerCase().includes('✓') || line.toLowerCase().includes('ready') ? 'text-green-400' :
                        'text-zinc-400'
                      }`}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm font-mono">{error}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-4 justify-center mb-6">
          {error ? (
            <button
              onClick={handleRetry}
              className="glass-panel px-6 py-3 bg-red-500/20 hover:bg-red-500/30 border-red-500 transition-all duration-200 flex items-center gap-2 group"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="font-bold text-sm uppercase tracking-wider">Try Again</span>
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={isLaunching || isSwitchingComfyVersion}
              className="glass-panel px-6 py-3 bg-[var(--umbra-accent)]/20 hover:bg-[var(--umbra-accent)]/30 border-[var(--umbra-accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 group"
            >
              {isLaunching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="font-bold text-sm uppercase tracking-wider">Launching...</span>
                </>
              ) : (
                <>
                  <Power className="w-4 h-4 group-hover:text-[var(--umbra-accent)] transition-colors" />
                  <span className="font-bold text-sm uppercase tracking-wider">Launch {name}</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={handleCheckConnection}
            disabled={isChecking || (isLaunching && !error) || !!toolActionLoading || isSwitchingComfyVersion}
            className="glass-panel px-6 py-3 bg-white/5 hover:bg-white/10 border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 group"
          >
            {isChecking ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="font-bold text-sm uppercase tracking-wider">Checking...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 group-hover:text-[var(--umbra-accent)] transition-colors" />
                <span className="font-bold text-sm uppercase tracking-wider">Check Connection</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-3 justify-center mb-6">
          <button
            onClick={() => handleToolAction('install')}
            disabled={isRemoteClient || isLaunching || isChecking || !!toolActionLoading || isSwitchingComfyVersion}
            className="glass-panel px-4 py-2 bg-white/5 hover:bg-white/10 border-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-wider"
          >
            {toolActionLoading === 'install' ? 'Installing...' : (toolInstalled ? `Reinstall ${name}` : `Install ${name}`)}
          </button>
          <button
            onClick={() => handleToolAction('update')}
            disabled={isRemoteClient || isLaunching || isChecking || !!toolActionLoading || isSwitchingComfyVersion}
            className="glass-panel px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-wider"
          >
            {toolActionLoading === 'update' ? 'Updating...' : `Update ${name}`}
          </button>
          {(backend === 'comfyui') && (
            <button
              onClick={() => handleToolAction('custom_nodes')}
              disabled={isRemoteClient || isLaunching || isChecking || !!toolActionLoading || isSwitchingComfyVersion}
              className="glass-panel px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-wider"
            >
              {toolActionLoading === 'custom_nodes' ? 'Installing Nodes...' : 'Install Custom Nodes'}
            </button>
          )}
          {backend === 'comfyui' && (
            <button
              onClick={() => handleToolAction('update_pytorch')}
              disabled={isRemoteClient || isLaunching || isChecking || !!toolActionLoading || isSwitchingComfyVersion}
              className="glass-panel px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-wider"
            >
              {toolActionLoading === 'update_pytorch' ? 'Updating Torch...' : 'Update CUDA/PyTorch'}
            </button>
          )}
          {backend === 'comfyui' && (
            <button
              onClick={() => handleToolAction('install_sageattention')}
              disabled={isRemoteClient || isLaunching || isChecking || !!toolActionLoading || isSwitchingComfyVersion}
              className="glass-panel px-4 py-2 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border-fuchsia-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-wider"
            >
              {toolActionLoading === 'install_sageattention' ? 'Installing Sage...' : 'Install SageAttention'}
            </button>
          )}
        </div>

        {versionBackend && !isLaunching && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left">
            <p className="text-[11px] leading-relaxed text-amber-200">
              If {versionBackendLabel} has issues after updating Umbra Studio or {versionBackendLabel},
              press <span className="font-bold text-amber-100">Reinstall {versionBackendLabel}</span>. It fixes most startup/runtime problems.
            </p>
          </div>
        )}

        {versionBackend && (
          <div className="glass-panel p-4 bg-black/40 border-white/5 mb-6 text-left">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-bold">{versionBackendLabel} Version</p>
              <button
                type="button"
                onClick={() => loadComfyVersions()}
                disabled={isRemoteClient || isLoadingComfyVersions || isSwitchingComfyVersion || isLaunching || !!toolActionLoading}
                className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingComfyVersions ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <p className="text-xs text-zinc-300 mb-3">
              Current: <span className="font-bold text-white">{currentComfyRef || 'Unknown'}</span>
              {currentComfyCommit && <span className="text-zinc-500 ml-2">({currentComfyCommit})</span>}
            </p>

            <div className="flex flex-wrap gap-2">
              <select
                value={selectedComfyRef}
                onChange={(event) => setSelectedComfyRef(event.target.value)}
                disabled={isRemoteClient || isLoadingComfyVersions || isSwitchingComfyVersion || isLaunching || !!toolActionLoading || comfyVersions.length === 0}
                className="flex-1 min-w-[240px] px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:border-[var(--umbra-accent)] outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Select {versionBackendLabel} version...</option>
                {comfyVersions.map((version) => (
                  <option key={`${version.ref}-${version.commit}`} value={version.ref}>
                    {version.ref}
                    {version.date ? ` • ${formatComfyVersionDate(version.date)}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleComfyVersionSwitch}
                disabled={
                  isLoadingComfyVersions ||
                  isRemoteClient ||
                  isSwitchingComfyVersion ||
                  isLaunching ||
                  !!toolActionLoading ||
                  !selectedComfyRef ||
                  selectedComfyRef === currentComfyRef
                }
                className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSwitchingComfyVersion ? 'Switching...' : (toolInstalled ? 'Switch to Selected Version' : 'Install Selected Version')}
              </button>
            </div>
            <p className="mt-2 text-xs font-semibold text-red-400">
              {backend === 'comfyui'
                ? 'Warning: Switching ComfyUI versions will uninstall all custom nodes not set to preinstall with Umbra Studio. To update ComfyUI while preserving your custom nodes, use the Update ComfyUI button instead of switching versions.'
                : `Warning: Switching ${versionBackendLabel} versions performs a source/runtime rebuild at the selected reference. Stop running jobs before switching.`}
            </p>

            {(comfyVersionError || (selectedComfyRef && selectedComfyRef === currentComfyRef)) && (
              <p className={`mt-2 text-xs ${comfyVersionError ? 'text-red-400' : 'text-zinc-500'}`}>
                {comfyVersionError || 'Selected version is already active.'}
              </p>
            )}
          </div>
        )}

        {!isLaunching && !error && (
          <div className="glass-panel p-4 bg-black/40 border-white/5">
            <p className="text-xs text-zinc-400 leading-relaxed">
              <strong className="text-white">Launch:</strong> Start {name} automatically from Umbra Studio
              <br />
              <strong className="text-white">Check Connection:</strong> Detect if {name} is running externally
              <br />
              <strong className="text-white">Install/Update:</strong> Manage native tool installs directly from Umbra
              {hasToolUpdate && (
                <>
                  <br />
                  <strong className="text-amber-400">Update Available:</strong> A new {name} update is ready
                </>
              )}
              {hasPyTorchUpdate && (
                <>
                  <br />
                  <strong className="text-cyan-400">PyTorch Update:</strong> New CUDA/PyTorch build is available
                </>
              )}
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

const ComfyUIWorkspace = ({ isActive }: { isActive: boolean }) => {
  const comfyConnection = useStore((state) => state.connections.comfyui);
  const isConnected = comfyConnection === 'connected';
  const comfyUrl = useStore((state) => state.urls.comfyui);
  const isBooting = useStore((state) => state.booting.comfyui);
  const isHealthy = useStore((state) => state.backendHealth.comfyui === true);
  const { addToast } = useToastStore();
  const comfyIframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadedComfyWorkflowToastRef = useRef<{ key: string; at: number } | null>(null);
  const [remoteClientRevision, setRemoteClientRevision] = useState(0);
  const isRemoteClient = useMemo(() => isUmbraRemoteClient(), [remoteClientRevision]);
  const comfyFrameUrl = useMemo(() => {
    if (isRemoteClient) {
      return '/comfy/';
    }
    return comfyUrl;
  }, [comfyUrl, isRemoteClient]);
  const comfyOrigin = useMemo(() => {
    if (isRemoteClient) {
      return window.location.origin;
    }
    try {
      return new URL(comfyUrl).origin;
    } catch {
      return null;
    }
  }, [comfyUrl, isRemoteClient]);
  const [nodePickerOpen, setNodePickerOpen] = useState(false);
  const [nodePickerLoading, setNodePickerLoading] = useState(false);
  const [nodePickerAssigning, setNodePickerAssigning] = useState(false);
  const [nodePickerError, setNodePickerError] = useState<string | null>(null);
  const [nodePickerNodes, setNodePickerNodes] = useState<ComfyImageNodeOption[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [droppedFilenames, setDroppedFilenames] = useState<string[]>([]);
  const [isFilmstripDragging, setIsFilmstripDragging] = useState(false);

  useEffect(() => {
    const readRemoteClient = () => setRemoteClientRevision((revision) => revision + 1);
    window.addEventListener('umbra:remote-client-change', readRemoteClient);
    return () => window.removeEventListener('umbra:remote-client-change', readRemoteClient);
  }, []);

  const closeNodePicker = useCallback(() => {
    setNodePickerOpen(false);
    setNodePickerLoading(false);
    setNodePickerAssigning(false);
    setNodePickerError(null);
    setNodePickerNodes([]);
    setSelectedNodeId(null);
    setDroppedFilenames([]);
  }, []);

  const requestComfyBridge = useCallback(async (
    messageType: 'UMBRA_COMFY_GET_IMAGE_NODES' | 'UMBRA_COMFY_ASSIGN_IMAGE' | 'UMBRA_COMFY_HANDOFF_IMAGES' | 'UMBRA_COMFY_LOAD_WORKFLOW',
    expectedResponseType: 'UMBRA_COMFY_IMAGE_NODES' | 'UMBRA_COMFY_ASSIGN_RESULT' | 'UMBRA_COMFY_HANDOFF_RESULT' | 'UMBRA_COMFY_LOAD_WORKFLOW_RESULT',
    payload: Record<string, unknown> = {},
    timeoutMs: number = COMFY_BRIDGE_MESSAGE_TIMEOUT_MS
  ) => {
    const iframeWindow = comfyIframeRef.current?.contentWindow;
    if (!iframeWindow) {
      throw new Error('ComfyUI iframe not ready. Open ComfyUI and try again.');
    }

    const requestId = `umbra-${messageType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return await new Promise<any>((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timeoutId);
      };

      const onMessage = (event: MessageEvent) => {
        if (comfyOrigin && event.origin !== comfyOrigin) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if ((data as any).requestId !== requestId) return;

        cleanup();
        if ((data as any).type !== expectedResponseType) {
          reject(new Error((data as any).error || `Unexpected response from Comfy bridge: ${(data as any).type}`));
          return;
        }
        resolve(data);
      };

      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Comfy bridge timed out. Reload ComfyUI to refresh Umbra bridge extension.'));
      }, timeoutMs);

      window.addEventListener('message', onMessage);
      iframeWindow.postMessage(
        { type: messageType, requestId, ...payload },
        comfyOrigin || '*'
      );
    });
  }, [comfyOrigin]);

  const loadWorkflowIntoComfy = useCallback(async (payload: Record<string, unknown>, options?: { silent?: boolean }) => {
    const workflow = payload?.workflow;
    if (!workflow || typeof workflow !== 'object') {
      throw new Error('No workflow document was provided.');
    }
    const workflowName = String(payload?.workflowName || payload?.name || 'API workflow').trim() || 'API workflow';
    const result = await requestComfyBridge(
      'UMBRA_COMFY_LOAD_WORKFLOW',
      'UMBRA_COMFY_LOAD_WORKFLOW_RESULT',
      { workflow, workflowName },
      12000
    );
    if (!result?.ok) {
      throw new Error(String(result?.error || 'ComfyUI could not open the workflow.'));
    }
    if (!options?.silent) {
      addToast({
        type: 'success',
        message: `Opened ${workflowName} in ComfyUI.`,
      });
    }
  }, [addToast, requestComfyBridge]);

  useEffect(() => {
    if (!isActive) return;
    let canceled = false;
    const pendingStorageKey = 'umbra.pendingComfyWorkflowLoad';

    const readStoredPayload = (): Record<string, unknown> | null => {
      try {
        const raw = window.sessionStorage.getItem(pendingStorageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null;
      } catch {
        return null;
      }
    };

    const runLoad = (payload: Record<string, unknown>, attempt = 0) => {
      if (canceled) return;
      const workflowName = String(payload?.workflowName || payload?.name || 'API workflow').trim() || 'API workflow';
      const workflowKey = String(payload?.workflowId || workflowName).trim() || workflowName;
      const lastToast = loadedComfyWorkflowToastRef.current;
      const shouldToast = !lastToast || lastToast.key !== workflowKey || Date.now() - lastToast.at > 5000;
      void loadWorkflowIntoComfy(payload, { silent: !shouldToast })
        .then(() => {
          loadedComfyWorkflowToastRef.current = { key: workflowKey, at: Date.now() };
          try {
            window.sessionStorage.removeItem(pendingStorageKey);
          } catch {
            // ignore storage cleanup failures
          }
        })
        .catch((error: any) => {
          if (canceled) return;
          if (attempt < 6) {
            window.setTimeout(() => runLoad(payload, attempt + 1), 450);
            return;
          }
          addToast({
            type: 'error',
            message: String(error?.message || 'Failed to open workflow in ComfyUI.'),
          });
        });
    };

    const onLoadWorkflow = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return;
      runLoad(detail as Record<string, unknown>);
    };

    window.addEventListener('umbra:comfyui-load-workflow', onLoadWorkflow);
    const storedPayload = readStoredPayload();
    if (storedPayload) {
      window.setTimeout(() => runLoad(storedPayload), 250);
    }
    return () => {
      canceled = true;
      window.removeEventListener('umbra:comfyui-load-workflow', onLoadWorkflow);
    };
  }, [addToast, isActive, loadWorkflowIntoComfy]);

  const refreshNodePickerNodes = useCallback(async () => {
    if (!nodePickerOpen) {
      setNodePickerOpen(true);
    }
    setNodePickerLoading(true);
    setNodePickerError(null);
    setNodePickerNodes([]);
    setSelectedNodeId(null);

    try {
      const response = await requestComfyBridge('UMBRA_COMFY_GET_IMAGE_NODES', 'UMBRA_COMFY_IMAGE_NODES');
      const parsed: ComfyImageNodeOption[] = Array.isArray(response?.nodes)
        ? response.nodes
          .map((node: any) => ({
            id: Number(node?.id),
            title: String(node?.title || node?.type || `Node ${node?.id}`),
            type: String(node?.type || 'Unknown'),
            selected: Boolean(node?.selected),
            widgetName: typeof node?.widgetName === 'string' ? node.widgetName : undefined,
            widgetValue: typeof node?.widgetValue === 'string' ? node.widgetValue : undefined,
          }) as ComfyImageNodeOption)
          .filter((node: ComfyImageNodeOption) => Number.isFinite(node.id))
          .sort((a: ComfyImageNodeOption, b: ComfyImageNodeOption) => {
            if (a.selected !== b.selected) return a.selected ? -1 : 1;
            return a.id - b.id;
          })
        : [];

      setNodePickerNodes(parsed);
      if (parsed.length === 0) {
        setNodePickerError('No Load Image-style nodes found in the active Comfy workflow. Add one, then refresh.');
      } else {
        const selected = parsed.find((node) => node.selected)?.id ?? parsed[0].id;
        setSelectedNodeId(selected);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch Comfy nodes.';
      setNodePickerError(message);
      addToast({
        type: 'info',
        message: 'Copied to Comfy input. Node assignment bridge is not ready yet.',
      });
    } finally {
      setNodePickerLoading(false);
    }
  }, [addToast, nodePickerOpen, requestComfyBridge]);

  const openNodePicker = useCallback(async (filenames: string[]) => {
    if (filenames.length === 0) return;

    setDroppedFilenames(filenames);
    setNodePickerOpen(true);
    await refreshNodePickerNodes();
  }, [refreshNodePickerNodes]);

  const handleAssignNode = useCallback(async () => {
    if (!selectedNodeId || droppedFilenames.length === 0) {
      setNodePickerError('Choose a node and drop at least one image.');
      return;
    }

    const filename = droppedFilenames[0];
    setNodePickerAssigning(true);
    setNodePickerError(null);

    try {
      const response = await requestComfyBridge(
        'UMBRA_COMFY_ASSIGN_IMAGE',
        'UMBRA_COMFY_ASSIGN_RESULT',
        { nodeId: selectedNodeId, filename }
      );

      if (!response?.ok) {
        throw new Error(response?.error || 'Comfy bridge could not assign image to node.');
      }

      addToast({
        type: 'success',
        message: `Assigned ${filename} to Comfy node #${selectedNodeId}.`,
      });

      if (droppedFilenames.length > 1) {
        addToast({
          type: 'info',
          message: `Assigned first image only. ${droppedFilenames.length - 1} additional image(s) remain in Comfy input.`,
        });
      }

      closeNodePicker();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to assign image to Comfy node.';
      setNodePickerError(message);
      addToast({ type: 'error', message });
    } finally {
      setNodePickerAssigning(false);
    }
  }, [selectedNodeId, droppedFilenames, requestComfyBridge, addToast, closeNodePicker]);

  // COPY: Images are copied to ComfyUI input folder, originals stay in place
  const handleDrop = async (images: ImageItem[]) => {
    setIsFilmstripDragging(false);
    try {
      const copyResults = await copyImagesToWorkspace(images, 'comfy');
      const comfyFilenames = copyResults
        .map((result, index) => getWorkspaceCopyFilename(result, images[index]))
        .filter(Boolean);

      // Seamless handoff: auto-copy embedded ComfyUI workflow JSON when available.
      let copiedWorkflow = false;
      for (const image of images) {
        try {
          const metadata = await extractMetadataFromPath(image.path);
          const payload = metadata?.workflow || metadata?.prompt;
          if (!payload) continue;

          await navigator.clipboard.writeText(JSON.stringify(payload));
          copiedWorkflow = true;
          break;
        } catch {
          // Ignore per-image metadata/clipboard errors so copy action always succeeds.
        }
      }

      if (copiedWorkflow) {
        addToast({
          type: 'success',
          message: 'Copied embedded workflow JSON to clipboard for ComfyUI.',
        });
      }

      if (images.length >= SUCCESS_TOAST_THRESHOLD) {
        addToast({
          type: 'success',
          message: `Copied ${images.length} images to ComfyUI.`,
        });
      }

      try {
        const handoff = await requestComfyBridge(
          'UMBRA_COMFY_HANDOFF_IMAGES',
          'UMBRA_COMFY_HANDOFF_RESULT',
          { filenames: comfyFilenames },
          6500
        ) as ComfyHandoffResult;

        if (!handoff?.ok) {
          throw new Error(handoff?.error || 'Comfy bridge could not complete the image handoff.');
        }

        const assignedFilename = handoff.assigned?.filename || comfyFilenames[0];
        const nodeId = handoff.assigned?.nodeId;
        addToast({
          type: 'success',
          message: handoff.createdNode
            ? `Created a Load Image node and assigned ${assignedFilename}.`
            : `Assigned ${assignedFilename}${nodeId ? ` to Comfy node #${nodeId}` : ' in ComfyUI'}.`,
        });

        const skippedCount = Array.isArray(handoff.skipped) ? handoff.skipped.length : Math.max(0, comfyFilenames.length - 1);
        if (skippedCount > 0) {
          addToast({
            type: 'info',
            message: `Assigned first image only. ${skippedCount} additional image(s) remain in Comfy input.`,
          });
        }
      } catch (handoffError) {
        await openNodePicker(comfyFilenames);
        addToast({
          type: 'info',
          message: handoffError instanceof Error
            ? `Copied to Comfy input. Pick a node manually: ${handoffError.message}`
            : 'Copied to Comfy input. Pick a Comfy node manually.',
        });
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to copy images to ComfyUI.',
      });
    }
  };

  const handleComfyShieldDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const images = readFilmstripImagesFromTransfer(event.dataTransfer);
    if (images.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleComfyShieldDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const images = readFilmstripImagesFromTransfer(event.dataTransfer);
    event.preventDefault();
    event.stopPropagation();
    setIsFilmstripDragging(false);

    if (images.length === 0) {
      addToast({
        type: 'error',
        message: 'Comfy drop did not include a usable filmstrip image path.',
      });
      return;
    }

    void handleDrop(images);
  }, [addToast, handleDrop]);

  const [hasReadyIframe, setHasReadyIframe] = useState(false);
  const [comfyFrameRevision, setComfyFrameRevision] = useState(0);
  const [comfyFrameLoadState, setComfyFrameLoadState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [isComfyFrameSlow, setIsComfyFrameSlow] = useState(false);
  const comfyFrameLoadedRef = useRef(false);
  const shouldRenderIframe = hasReadyIframe || isHealthy;

  useEffect(() => {
    if (isHealthy) setHasReadyIframe(true);
  }, [isHealthy]);

  useEffect(() => {
    if (comfyConnection !== 'disconnected') return;
    setHasReadyIframe(false);
    comfyFrameLoadedRef.current = false;
    setComfyFrameLoadState('idle');
    setIsComfyFrameSlow(false);
  }, [comfyConnection]);

  useLayoutEffect(() => {
    if (!shouldRenderIframe || !comfyFrameUrl) {
      comfyFrameLoadedRef.current = false;
      setComfyFrameLoadState('idle');
      setIsComfyFrameSlow(false);
      return;
    }

    comfyFrameLoadedRef.current = false;
    setComfyFrameLoadState('loading');
    setIsComfyFrameSlow(false);
    const slowTimer = window.setTimeout(() => {
      if (!comfyFrameLoadedRef.current) setIsComfyFrameSlow(true);
    }, 6500);
    return () => window.clearTimeout(slowTimer);
  }, [comfyFrameRevision, comfyFrameUrl, shouldRenderIframe]);

  useEffect(() => {
    const handleDragStart = () => setIsFilmstripDragging(true);
    const handleDragEnd = () => setIsFilmstripDragging(false);
    window.addEventListener('umbra:filmstrip-drag-start', handleDragStart);
    window.addEventListener('umbra:filmstrip-drag-end', handleDragEnd);
    window.addEventListener('drop', handleDragEnd, true);
    window.addEventListener('dragend', handleDragEnd, true);

    const handleRefreshIframe = () => {
      setComfyFrameRevision((revision) => revision + 1);
    };
    window.addEventListener('umbra:refresh-comfyui-iframe', handleRefreshIframe);

    return () => {
      window.removeEventListener('umbra:filmstrip-drag-start', handleDragStart);
      window.removeEventListener('umbra:filmstrip-drag-end', handleDragEnd);
      window.removeEventListener('drop', handleDragEnd, true);
      window.removeEventListener('dragend', handleDragEnd, true);
      window.removeEventListener('umbra:refresh-comfyui-iframe', handleRefreshIframe);
    };
  }, []);

  // Only mount the iframe after the service is actually healthy. A running
  // process can still be mid-boot, and loading the iframe during that window
  // can leave the embedded browser holding a blank page. Once healthy, keep it mounted
  // through health dips while the process still exists, but tear it down after a confirmed stop.
  const showSplash = !shouldRenderIframe;
  const showHealthWarning = hasReadyIframe && isConnected && !isBooting && !isHealthy;
  useIframeVisibilityRecovery(comfyIframeRef, isActive, shouldRenderIframe, comfyFrameUrl);

  return (
    <DropZone id="workspace-comfy" type="workspace" workspaceType="comfy" actionType="copy" label="ComfyUI" onDrop={handleDrop}>
      <div className="w-full h-full relative">
        {showSplash && <BackendSplash name="ComfyUI" backend="comfyui" icon="🧠" />}
        {!showSplash && comfyFrameUrl && (
          <iframe
            key={comfyFrameRevision}
            ref={comfyIframeRef}
            src={comfyFrameUrl}
            className="w-full h-full border-none bg-black"
            style={{
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
              opacity: comfyFrameLoadState === 'ready' ? 1 : 0,
              transition: 'opacity 160ms ease-out',
            }}
            title="ComfyUI"
            onLoad={() => {
              comfyFrameLoadedRef.current = true;
              setComfyFrameLoadState('ready');
              setIsComfyFrameSlow(false);
            }}
            onError={() => setIsComfyFrameSlow(true)}
          />
        )}
        {!showSplash && comfyFrameLoadState !== 'ready' && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-black"
            role="status"
            aria-live="polite"
          >
            <div className="flex max-w-md flex-col items-center px-6 text-center">
              <Loader2 className="mb-4 h-7 w-7 animate-spin text-[var(--umbra-accent)]" />
              <p className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                {isComfyFrameSlow ? 'ComfyUI interface is still loading' : 'ComfyUI server ready'}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {isComfyFrameSlow
                  ? 'The backend is responding, but the browser interface has not painted yet.'
                  : 'Connecting the embedded workspace...'}
              </p>
              {isComfyFrameSlow && (
                <button
                  type="button"
                  onClick={() => setComfyFrameRevision((revision) => revision + 1)}
                  className="mt-4 inline-flex h-9 items-center gap-2 border border-white/15 bg-white/5 px-3 text-xs font-bold uppercase text-zinc-200 hover:bg-white/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reload Interface
                </button>
              )}
            </div>
          </div>
        )}
        {isFilmstripDragging && !nodePickerOpen && (
          <div
            className="absolute inset-0 z-20 pointer-events-auto"
            onDragOver={handleComfyShieldDragOver}
            onDragEnter={handleComfyShieldDragOver}
            onDrop={handleComfyShieldDrop}
            aria-hidden="true"
          />
        )}
        {showHealthWarning && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-md border border-amber-400/35 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
            ComfyUI health check delayed
          </div>
        )}
        {nodePickerOpen && (
          <div className="absolute inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-950/95 shadow-2xl">
              <div className="px-5 py-4 border-b border-white/10">
                <h3 className="text-white text-base font-semibold">Assign Filmstrip Drop To Comfy Node</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Choose a node by ID. First dropped image will be assigned: <span className="text-zinc-200">{droppedFilenames[0] || '(none)'}</span>
                </p>
              </div>

              <div className="p-5 space-y-3">
                {nodePickerLoading && (
                  <div className="text-sm text-zinc-300">Scanning Comfy graph for image loader nodes...</div>
                )}

                {!nodePickerLoading && nodePickerNodes.length > 0 && (
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {nodePickerNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition ${selectedNodeId === node.id
                          ? 'border-cyan-400 bg-cyan-500/15'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-white font-medium truncate">{node.title}</span>
                          <span className="text-xs text-cyan-200 font-mono">#{node.id}</span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-1">
                          {node.type}
                          {node.selected ? ' • selected in ComfyUI' : ''}
                          {node.widgetName ? ` • widget: ${node.widgetName}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!nodePickerLoading && nodePickerError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {nodePickerError}
                  </div>
                )}
              </div>

              <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={refreshNodePickerNodes}
                  disabled={nodePickerLoading || nodePickerAssigning}
                  className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-xs text-white disabled:opacity-50"
                >
                  Refresh Nodes
                </button>
                <button
                  type="button"
                  onClick={closeNodePicker}
                  disabled={nodePickerAssigning}
                  className="px-3 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-xs text-white disabled:opacity-50"
                >
                  Skip Assign
                </button>
                <button
                  type="button"
                  onClick={handleAssignNode}
                  disabled={nodePickerLoading || nodePickerAssigning || !selectedNodeId || nodePickerNodes.length === 0}
                  className="px-3 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-xs font-semibold text-black disabled:opacity-50"
                >
                  {nodePickerAssigning ? 'Assigning...' : 'Assign To Node'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DropZone>
  );
};

type LocalServerEditorState = {
  id: string | null;
  name: string;
  url: string;
  folderPath: string;
};

function emptyLocalServerEditor(): LocalServerEditorState {
  return { id: null, name: '', url: 'http://127.0.0.1:', folderPath: '' };
}

const LocalServerWorkspace = ({ isActive }: { isActive: boolean }) => {
  const selectedLocalServerAppId = useStore((state) => state.selectedLocalServerAppId);
  const setSelectedLocalServerAppId = useStore((state) => state.setSelectedLocalServerAppId);
  const showToast = useStore((state) => state.showToast);
  const [apps, setApps] = useState<LocalServerApp[]>([]);
  const [editor, setEditor] = useState<LocalServerEditorState>(() => emptyLocalServerEditor());
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameFailed, setFrameFailed] = useState(false);
  const [remoteClientRevision, setRemoteClientRevision] = useState(0);
  const isRemoteClient = useMemo(() => isUmbraRemoteClient(), [remoteClientRevision]);

  const reloadApps = useCallback(async () => {
    const loaded = await loadLocalServerApps().catch(() => []);
    setApps(loaded);
    if (selectedLocalServerAppId && loaded.length > 0 && !loaded.some((app) => app.id === selectedLocalServerAppId)) {
      setSelectedLocalServerAppId(loaded[0].id);
    }
  }, [selectedLocalServerAppId, setSelectedLocalServerAppId]);

  useEffect(() => {
    void reloadApps();
    const onChanged = () => void reloadApps();
    window.addEventListener('umbra:local-server-apps-changed', onChanged);
    return () => window.removeEventListener('umbra:local-server-apps-changed', onChanged);
  }, [reloadApps]);

  useEffect(() => {
    const readRemoteClient = () => setRemoteClientRevision((revision) => revision + 1);
    window.addEventListener('umbra:remote-client-change', readRemoteClient);
    return () => window.removeEventListener('umbra:remote-client-change', readRemoteClient);
  }, []);

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedLocalServerAppId) || null,
    [apps, selectedLocalServerAppId]
  );
  const selectedFrameUrl = useMemo(
    () => selectedApp ? getLocalServerFrameUrl(selectedApp.url, isRemoteClient) : '',
    [isRemoteClient, selectedApp]
  );

  const sortedApps = useMemo(() => [...apps].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)), [apps]);

  const persistApps = useCallback(async (nextApps: LocalServerApp[]) => {
    const normalized = await saveLocalServerApps(nextApps.map((app, index) => ({ ...app, order: index })));
    setApps(normalized);
    return normalized;
  }, []);

  const startAdd = useCallback(() => {
    setEditor(emptyLocalServerEditor());
    setSelectedLocalServerAppId(null);
  }, [setSelectedLocalServerAppId]);

  const startEdit = useCallback((app: LocalServerApp) => {
    setEditor({ id: app.id, name: app.name, url: app.url, folderPath: app.folderPath || '' });
    setSelectedLocalServerAppId(null);
  }, [setSelectedLocalServerAppId]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const validated = validateLocalServerUrl(editor.url);
    if (!validated.ok) {
      showToast(validated.error, 'error');
      return;
    }
    setSaving(true);
    try {
      const existing = editor.id ? apps.find((app) => app.id === editor.id) || null : null;
      const nextApp = buildLocalServerApp({ name: editor.name, url: validated.url, folderPath: editor.folderPath }, existing || undefined);
      const withoutExisting = apps.filter((app) => app.id !== nextApp.id);
      const nextApps = [...withoutExisting, { ...nextApp, order: existing?.order ?? withoutExisting.length }]
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
      await persistApps(nextApps);
      setEditor(emptyLocalServerEditor());
      setSelectedLocalServerAppId(nextApp.id);
      showToast(existing ? 'Local server updated' : 'Local server added', 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to save local server'), 'error');
    } finally {
      setSaving(false);
    }
  }, [apps, editor, persistApps, saving, setSelectedLocalServerAppId, showToast]);

  const handleDelete = useCallback(async (app: LocalServerApp) => {
    if (!window.confirm(`Delete local server "${app.name}"?`)) return;
    const saved = await persistApps(apps.filter((entry) => entry.id !== app.id));
    if (selectedLocalServerAppId === app.id) setSelectedLocalServerAppId(saved[0]?.id || null);
    if (editor.id === app.id) setEditor(emptyLocalServerEditor());
    showToast('Local server deleted', 'success');
  }, [apps, editor.id, persistApps, selectedLocalServerAppId, setSelectedLocalServerAppId, showToast]);

  const moveApp = useCallback(async (app: LocalServerApp, direction: -1 | 1) => {
    const index = sortedApps.findIndex((entry) => entry.id === app.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sortedApps.length) return;
    const next = [...sortedApps];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    await persistApps(next);
  }, [persistApps, sortedApps]);

  useEffect(() => {
    setFrameLoaded(false);
    setFrameFailed(false);
  }, [selectedApp?.id, selectedFrameUrl, reloadKey]);

  useEffect(() => {
    if (!isActive || !selectedApp || frameLoaded) return;
    const timer = window.setTimeout(() => {
      setFrameFailed(true);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [frameLoaded, isActive, selectedApp, selectedFrameUrl, reloadKey]);

  const handleOpenExternal = useCallback(() => {
    if (!selectedApp?.url) return;
    window.open(isRemoteClient ? selectedFrameUrl || selectedApp.url : selectedApp.url, '_blank', 'noopener,noreferrer');
  }, [isRemoteClient, selectedApp?.url, selectedFrameUrl]);

  const handleOpenAppFolder = useCallback(async (folderPath?: string) => {
    const targetPath = String(folderPath || selectedApp?.folderPath || '').trim();
    if (!targetPath) {
      showToast('No app folder is set for this local server', 'error');
      return;
    }
    try {
      await openLocalServerAppFolder(targetPath);
      showToast('Opened app folder', 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to open app folder'), 'error');
    }
  }, [selectedApp?.folderPath, showToast]);

  const handleEdit = useCallback(() => {
    if (selectedApp) startEdit(selectedApp);
    else startAdd();
  }, [selectedApp, startAdd, startEdit]);

  if (!selectedApp) {
    return (
      <div className="h-full overflow-y-auto bg-[var(--umbra-bg)] p-6">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center gap-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--umbra-accent)]/35 bg-[var(--umbra-accent)]/10 text-[var(--umbra-accent)] shadow-[0_0_24px_color-mix(in_srgb,var(--umbra-accent)_20%,transparent)]">
                <Globe2 size={20} />
              </div>
              <div>
                <div className="text-xl font-black uppercase tracking-wider text-zinc-100">Local Servers</div>
                <div className="mt-1 text-xs text-zinc-500">Add localhost and LAN apps, then open one inside Umbra.</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-xl border border-white/10 bg-black/25 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Saved Servers</div>
                <button
                  type="button"
                  onClick={startAdd}
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-500/10 px-3 text-[10px] font-black uppercase tracking-wider text-cyan-100 hover:border-cyan-200/45"
                >
                  <Plus size={13} />
                  New Server
                </button>
              </div>

              {sortedApps.length === 0 ? (
                <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.015] p-6 text-center">
                  <div>
                    <Globe2 className="mx-auto mb-3 text-zinc-600" size={30} />
                    <div className="text-sm font-black uppercase tracking-wider text-zinc-300">No Servers Added</div>
                    <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-600">
                      Save a local or LAN server URL that can be opened inside Umbra.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {sortedApps.map((app, index) => (
                    <div key={app.id} className="rounded-lg border border-white/10 bg-zinc-950/70 p-3 hover:border-white/20">
                      <button
                        type="button"
                        onClick={() => setSelectedLocalServerAppId(app.id)}
                        className="block w-full text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Globe2 size={14} className="text-[var(--umbra-accent)]" />
                          <div className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-100">{app.name}</div>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">{app.url}</div>
                        {app.folderPath ? (
                          <div className="mt-1 truncate font-mono text-[10px] text-zinc-600" title={app.folderPath}>{app.folderPath}</div>
                        ) : null}
                      </button>
                      <div className="mt-3 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(app)}
                          className="rounded border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:border-white/20"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(getLocalServerFrameUrl(app.url, isRemoteClient), '_blank', 'noopener,noreferrer')}
                          className="rounded border border-white/10 bg-white/[0.035] p-1.5 text-zinc-400 hover:border-white/20 hover:text-zinc-100"
                          title="Open externally"
                        >
                          <ExternalLink size={12} />
                        </button>
                        {app.folderPath ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenAppFolder(app.folderPath)}
                            className="rounded border border-white/10 bg-white/[0.035] p-1.5 text-zinc-400 hover:border-white/20 hover:text-zinc-100"
                            title="Open app folder"
                          >
                            <FolderOpen size={12} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void moveApp(app, -1)}
                          disabled={index === 0}
                          className="ml-auto rounded border border-white/10 bg-white/[0.03] p-1.5 text-zinc-500 hover:text-zinc-100 disabled:opacity-30"
                          title="Move up"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveApp(app, 1)}
                          disabled={index >= sortedApps.length - 1}
                          className="rounded border border-white/10 bg-white/[0.03] p-1.5 text-zinc-500 hover:text-zinc-100 disabled:opacity-30"
                          title="Move down"
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(app)}
                          className="rounded border border-red-300/20 bg-red-500/10 p-1.5 text-red-200 hover:border-red-200/45"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-white/10 bg-black/25 p-4">
              <div className="mb-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{editor.id ? 'Edit Server' : 'Add Server'}</div>
                <div className="mt-1 text-xs text-zinc-600">Only localhost, private LAN, plain hostnames, and .local URLs are allowed.</div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500">Name</label>
                  <input
                    value={editor.name}
                    onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
                    placeholder="ComfyUI"
                    className="w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[var(--umbra-accent)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500">URL</label>
                  <input
                    value={editor.url}
                    onChange={(event) => setEditor((current) => ({ ...current, url: event.target.value }))}
                    placeholder="http://127.0.0.1:8188"
                    className="w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-[var(--umbra-accent)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500">App Folder</label>
                  <input
                    value={editor.folderPath}
                    onChange={(event) => setEditor((current) => ({ ...current, folderPath: event.target.value }))}
                    placeholder="D:\\Tools\\ComfyUI"
                    className="w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-[var(--umbra-accent)]"
                  />
                  <div className="mt-1 text-[10px] leading-relaxed text-zinc-600">
                    Optional. Opens the app location in File Explorer from the host PC.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-emerald-300/25 bg-emerald-500/12 px-3 py-2 text-xs font-black uppercase tracking-wider text-emerald-100 hover:border-emerald-200/45 disabled:opacity-50"
                  >
                    <Save size={13} />
                    {saving ? 'Saving...' : editor.id ? 'Save Changes' : 'Add Server'}
                  </button>
                  {editor.id ? (
                    <button
                      type="button"
                      onClick={startAdd}
                      className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:border-white/20"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--umbra-bg)]">
      <div className="flex min-h-11 items-center gap-2 border-b border-white/10 bg-black/30 px-3">
        <Globe2 size={14} className="text-[var(--umbra-accent)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-black uppercase tracking-wider text-zinc-100">{selectedApp.name}</div>
          <div className="truncate font-mono text-[10px] text-zinc-500">{selectedApp.url}</div>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]"
          title="Reload local server frame"
        >
          <RefreshCw size={12} />
          Reload
        </button>
        <button
          type="button"
          onClick={handleOpenExternal}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]"
          title="Open local server externally"
        >
          <ExternalLink size={12} />
          Open
        </button>
        {selectedApp.folderPath ? (
          <button
            type="button"
            onClick={() => void handleOpenAppFolder()}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]"
            title="Open app folder"
          >
            <FolderOpen size={12} />
            Folder
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleEdit}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]"
          title="Edit local server apps"
        >
          <Pencil size={12} />
          Edit
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <iframe
          key={`${selectedApp.id}-${reloadKey}`}
          src={selectedFrameUrl || selectedApp.url}
          title={selectedApp.name}
          data-local-server-app-id={selectedApp.id}
          className="h-full w-full border-none bg-black"
          onLoad={() => {
            setFrameLoaded(true);
            setFrameFailed(false);
          }}
          onError={() => setFrameFailed(true)}
        />
        {frameFailed && !frameLoaded ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 p-6">
            <div className="pointer-events-auto max-w-lg rounded-lg border border-amber-300/25 bg-zinc-950/95 p-4 text-center shadow-2xl">
              <div className="text-sm font-black uppercase tracking-wider text-amber-100">Local Server Did Not Load</div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                The server may be offline, slow to respond, or blocking embedded frames.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:border-white/20"
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="inline-flex items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-cyan-100 hover:border-cyan-200/45"
                >
                  <ExternalLink size={13} />
                  Open Externally
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const Workspace = () => {
  const activeWorkspace = useStore((state) => state.activeWorkspace);
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const showFilmstrip = useStore((state) => state.ui.showFilmstrip);
  const isAppBarCollapsed = useStore((state) => state.ui.isAppBarCollapsed);
  const [remoteMode, setRemoteMode] = useState<string>(() => {
    if (typeof document === 'undefined') return 'desktop';
    return document.documentElement.dataset.umbraRemoteMode || 'desktop';
  });
  const [remoteClientRevision, setRemoteClientRevision] = useState(0);
  const isRemoteClient = useMemo(() => isUmbraRemoteClient(), [remoteClientRevision]);
  const isPowerPrompterWorkspace = activeWorkspace === 'powerprompter';
  const previousWorkspaceRef = useRef(activeWorkspace);
  const [workspaceTransition, setWorkspaceTransition] = useState<{
    from: WorkspaceType;
    to: WorkspaceType;
    direction: 'up' | 'down';
    key: number;
  } | null>(null);
  const getWorkspaceLayerStyle = (workspace: WorkspaceType): React.CSSProperties => {
    const isActive = activeWorkspace === workspace;
    const isTransitionFrom = workspaceTransition?.from === workspace;
    const isTransitionTo = workspaceTransition?.to === workspace;
    const isTransitionLayer = isTransitionFrom || isTransitionTo;
    // Browser workspaces must remain laid out while hidden so their iframe
    // document, canvas state, and in-progress sessions survive navigation.
    const keepWarmHostActive = workspace === 'library' || workspace === 'localserver';
    const animationName = isTransitionTo
      ? workspaceTransition.direction === 'down'
        ? 'umbraWorkspaceSlideInDown'
        : 'umbraWorkspaceSlideInUp'
      : isTransitionFrom
        ? workspaceTransition.direction === 'down'
          ? 'umbraWorkspaceSlideOutDown'
          : 'umbraWorkspaceSlideOutUp'
        : undefined;
    return {
      opacity: isActive || isTransitionFrom ? 1 : 0,
      pointerEvents: isActive ? 'auto' : 'none',
      visibility: isActive || isTransitionFrom ? 'visible' : 'hidden',
      zIndex: isActive ? 20 : isTransitionFrom ? 15 : 0,
      transform: 'translate3d(0, 0, 0)',
      backfaceVisibility: 'hidden',
      transition: 'visibility 0ms linear',
      animation: animationName
        ? `${animationName} ${WORKSPACE_SLIDE_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both`
        : undefined,
      willChange: isTransitionLayer ? 'transform, opacity' : undefined,
      contain: 'layout paint style',
      contentVisibility: isActive || isTransitionFrom || keepWarmHostActive ? 'visible' : 'hidden',
    };
  };
  const [filmstripDockHeight, setFilmstripDockHeight] = useState<number>(() => {
    try { window.localStorage.removeItem('filmstrip-height'); } catch {}
    return 180;
  });
  const [loadedWorkspaces, setLoadedWorkspaces] = useState<Record<string, boolean>>(() => ({
    [activeWorkspace]: true,
    library: true,
  }));
  useComponentDebug('Workspace', { activeWorkspace });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const readRemoteMode = () => setRemoteMode(document.documentElement.dataset.umbraRemoteMode || 'desktop');
    readRemoteMode();
    window.addEventListener('umbra:remote-mode-change', readRemoteMode);
    return () => window.removeEventListener('umbra:remote-mode-change', readRemoteMode);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const readRemoteClient = () => setRemoteClientRevision((current) => current + 1);
    window.addEventListener('umbra:remote-client-change', readRemoteClient);
    return () => window.removeEventListener('umbra:remote-client-change', readRemoteClient);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.umbraActiveWorkspace = activeWorkspace;
    return () => {
      if (document.documentElement.dataset.umbraActiveWorkspace === activeWorkspace) {
        delete document.documentElement.dataset.umbraActiveWorkspace;
      }
    };
  }, [activeWorkspace]);

  useLayoutEffect(() => {
    const previousWorkspace = previousWorkspaceRef.current;
    if (previousWorkspace === activeWorkspace) return;

    previousWorkspaceRef.current = activeWorkspace;
    const direction = getWorkspaceNavRank(activeWorkspace) < getWorkspaceNavRank(previousWorkspace)
      ? 'down'
      : 'up';
    const key = Date.now();
    setWorkspaceTransition({
      from: previousWorkspace,
      to: activeWorkspace,
      direction,
      key,
    });

    const timer = window.setTimeout(() => {
      setWorkspaceTransition((current) => current?.key === key ? null : current);
    }, WORKSPACE_SLIDE_ANIMATION_MS + 60);

    return () => window.clearTimeout(timer);
  }, [activeWorkspace]);

  useEffect(() => {
    if (isRemoteClient && activeWorkspace === 'remote') {
      setActiveWorkspace('comfyui');
      return;
    }
    setLoadedWorkspaces((prev) => {
      if (prev[activeWorkspace]) return prev;
      return { ...prev, [activeWorkspace]: true };
    });
  }, [activeWorkspace, isRemoteClient, setActiveWorkspace]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const warmLazyWorkspaces = () => {
      void loadImageInspectorWorkspaceModule().catch(() => {});
      void loadModelManagerWorkspaceModule().catch(() => {});
      void loadBoardBrowserModule().catch(() => {});
      if (!isRemoteClient) {
        void loadUmbraRemoteWorkspaceModule().catch(() => {});
      }
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(warmLazyWorkspaces, { timeout: 2500 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(warmLazyWorkspaces, 250);
    return () => window.clearTimeout(timer);
  }, [isRemoteClient]);

  const effectiveShowFilmstrip = showFilmstrip && remoteMode !== 'phone';

  const reservedFilmstripHeight = effectiveShowFilmstrip
    ? Math.max(120, Math.min(420, Math.round(filmstripDockHeight)))
    : 0;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const offset = effectiveShowFilmstrip
      ? `${reservedFilmstripHeight}px`
      : '0px';
    document.documentElement.style.setProperty('--umbra-filmstrip-toast-offset', offset);
    return () => {
      document.documentElement.style.removeProperty('--umbra-filmstrip-toast-offset');
    };
  }, [effectiveShowFilmstrip, reservedFilmstripHeight]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-[var(--umbra-bg)]">
      <div
        className="absolute inset-x-0 top-0 z-10 overflow-hidden"
        style={{ bottom: `${reservedFilmstripHeight}px` }}
        data-umbra-context-menu-boundary="workspace"
      >
      {/* 
        WARM HOST PERSISTENCE:
        Workspaces mount the first time they are opened, then remain in the DOM
        so long-running tool state survives workspace switches.
      */}
      
      {/* ComfyUI Layer */}
      <div
        className="absolute inset-0 workspace-comfyui"
        style={getWorkspaceLayerStyle('comfyui')}
      >
        {loadedWorkspaces.comfyui ? <ComfyUIWorkspace isActive={activeWorkspace === 'comfyui'} /> : null}
      </div>

      {/* Umbra UI Layer */}
      <div
        className="absolute inset-0 workspace-umbraui"
        style={getWorkspaceLayerStyle('umbraui')}
      >
        {loadedWorkspaces.umbraui ? (
          <Suspense fallback={null}>
            <UmbraUIWorkspace />
          </Suspense>
        ) : null}
      </div>

      {/* Image Inspector Layer (Metadata Scanner + Waifu Diffusion) */}
      <div
        className="absolute inset-0"
        style={getWorkspaceLayerStyle('imageinspector')}
      >
        {loadedWorkspaces.imageinspector ? (
          <Suspense fallback={null}>
            <ImageInspectorWorkspace />
          </Suspense>
        ) : null}
      </div>

      {/* Library Gallery Layer (React app surface) */}
      <div
        className="absolute inset-0 workspace-library"
        style={getWorkspaceLayerStyle('library')}
      >
        {loadedWorkspaces.library ? (
          <Suspense fallback={null}>
            <ReactGalleryWorkspace />
          </Suspense>
        ) : null}
      </div>

      {/* Model Manager Layer */}
      <div
        className="absolute inset-0 workspace-modelmanager"
        style={getWorkspaceLayerStyle('modelmanager')}
      >
        {loadedWorkspaces.modelmanager ? (
          <Suspense fallback={null}>
            <ModelManagerWorkspace />
          </Suspense>
        ) : null}
      </div>

      {/* Data Forge Layer */}
      <div
        className="absolute inset-0 workspace-board"
        style={getWorkspaceLayerStyle('board')}
      >
        {loadedWorkspaces.board ? (
          <Suspense fallback={null}>
            <BoardBrowser />
          </Suspense>
        ) : null}
      </div>

      {/* Umbra Remote Layer */}
      <div
        className="absolute inset-0 workspace-remote"
        style={getWorkspaceLayerStyle('remote')}
      >
        {!isRemoteClient && loadedWorkspaces.remote ? (
          <Suspense fallback={null}>
            <UmbraRemoteWorkspace isActive={activeWorkspace === 'remote'} />
          </Suspense>
        ) : null}
      </div>

      {/* Local Server Browser Layer */}
      <div
        className="absolute inset-0 workspace-localserver"
        style={getWorkspaceLayerStyle('localserver')}
      >
        {loadedWorkspaces.localserver ? <LocalServerWorkspace isActive={activeWorkspace === 'localserver'} /> : null}
      </div>

      {/* Power Prompter Layer */}
      <div
        className="absolute inset-0"
        style={getWorkspaceLayerStyle('powerprompter')}
      >
        {loadedWorkspaces.powerprompter ? (
          <Suspense fallback={null}>
            <PowerPrompter overlayMode={false} isActive={isPowerPrompterWorkspace} />
          </Suspense>
        ) : null}
      </div>
      </div>

      {effectiveShowFilmstrip ? (
        <div
          className="absolute inset-x-0 bottom-0 z-[30] transition-all duration-200 ease-out"
          data-appbar-collapsed={isAppBarCollapsed ? '1' : '0'}
        >
          <UmbraFilmstrip
            initialHeight={180}
            minHeight={120}
            maxHeight={420}
            onHeightChange={setFilmstripDockHeight}
          />
        </div>
      ) : null}

    </div>
  );
};

