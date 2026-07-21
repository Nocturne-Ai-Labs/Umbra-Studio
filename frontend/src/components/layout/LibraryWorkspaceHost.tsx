'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { useToastStore } from '@/store/useToastStore';

const GALLERY_THEME_VARS = [
  '--umbra-accent',
  '--umbra-accent-primary',
  '--umbra-accent-secondary',
  '--umbra-accent-ratio',
  '--umbra-accent-gradient',
  '--umbra-accent-gradient-soft',
  '--umbra-border-gradient',
  '--umbra-bg',
  '--umbra-panel',
  '--umbra-text',
  '--umbra-border',
  '--umbra-panel-bg',
  '--umbra-blur',
  '--umbra-radius',
  '--umbra-shadow',
  '--umbra-accent-glow',
  '--umbra-library-tree-line',
  '--font-family',
] as const;

type GalleryThemeMessage = {
  type: 'gallery:theme';
  theme: {
    vars: Record<string, string>;
    dna: string;
    typography: string;
  };
};

const FALLBACK_GALLERY_URL = '/gallery/index.html';
const GALLERY_BRIDGE_STATUS_TIMEOUT_MS = 3000;
const GALLERY_BRIDGE_START_TIMEOUT_MS = 10000;
const GALLERY_BRIDGE_WATCHDOG_INTERVAL_MS = 8000;
const GALLERY_BRIDGE_STATUS_CACHE_MS = 30000;
const GALLERY_BRIDGE_RECOVERY_FAILURE_THRESHOLD = 3;
const GALLERY_ACTIVE_INTERACTION_GRACE_MS = 15000;
const GALLERY_BRIDGE_DIRECT_BASE_URLS = [
  'http://127.0.0.1:8313',
  'http://localhost:8313',
] as const;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

type GalleryBridgeStatus = {
  running?: boolean;
  healthy?: boolean;
  url?: string;
};

function isHealthyGalleryBridgeStatus(status: GalleryBridgeStatus | null | undefined): status is GalleryBridgeStatus {
  return Boolean(status?.running && status?.healthy !== false);
}

function isDirectGalleryBridgeUrl(value: string): boolean {
  return GALLERY_BRIDGE_DIRECT_BASE_URLS.some((baseUrl) => value.startsWith(baseUrl));
}

function isLoopbackBrowserHost(): boolean {
  const host = String(window.location.hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function resolveGalleryWorkspaceUrlForBrowser(rawUrl: unknown): string {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (!isLoopbackBrowserHost() && isDirectGalleryBridgeUrl(value)) return FALLBACK_GALLERY_URL;
  return value;
}

type PendingGalleryOpenPathPayload = {
  path?: string;
  folderPath?: string;
  imagePath?: string;
  requestId?: string;
};

type PendingGalleryRevealPathPayload = {
  path?: string;
  folderPath?: string;
  imagePath?: string;
  requestId?: string;
};

type GallerySortBy = 'created' | 'modified' | 'name' | 'custom';
type GallerySortOrder = 'asc' | 'desc';

type GalleryTrashToastItem = {
  trashPath: string;
  originalPath: string;
  name: string;
};

type GallerySavedOutputFile = {
  path: string;
  name?: string;
  type?: string;
  modifiedMs?: number;
  size?: number;
  tags?: string[];
};

function normalizePath(value: string | null | undefined): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

function pathLeaf(pathValue: string): string {
  const normalized = normalizePath(pathValue);
  if (!normalized) return '';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function pathParent(pathValue: string): string {
  const normalized = normalizePath(pathValue);
  if (!normalized) return '';
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalizePath(normalized.slice(0, index));
}

function isLikelyFilePath(pathValue: string): boolean {
  const leaf = pathLeaf(pathValue);
  return Boolean(leaf) && leaf.includes('.');
}

function normalizeSavedOutputTags(values: unknown): string[] {
  const rawValues = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of rawValues) {
    const tag = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 48);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function collectSavedOutputFiles(detail: unknown): GallerySavedOutputFile[] {
  const payload = (detail && typeof detail === 'object')
    ? detail as Record<string, unknown>
    : {};
  const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
  const payloadTags = normalizeSavedOutputTags(payload.tags);
  const seen = new Set<string>();
  const files: GallerySavedOutputFile[] = [];

  for (const output of outputs) {
    const item = (output && typeof output === 'object')
      ? output as Record<string, unknown>
      : {};
    const path = normalizePath(String(item.fullpath || item.fullPath || item.path || ''));
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = String(item.filename || item.name || pathLeaf(path) || '').trim();
    const type = String(item.type || '').trim();
    const modified = Number(item.modified ?? item.modifiedMs ?? Date.now());
    const size = Number(item.size ?? 0);
    const tags = normalizeSavedOutputTags([
      ...payloadTags,
      ...(Array.isArray(item.tags) ? item.tags : []),
      item.promptSetLabel,
    ]);
    files.push({
      path,
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
      ...(Number.isFinite(modified) ? { modifiedMs: modified } : {}),
      ...(Number.isFinite(size) && size > 0 ? { size } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    });
  }

  return files;
}

function resolveRestoredPath(
  entry: unknown,
  fallbackPath?: string,
): string {
  const payload = (entry && typeof entry === 'object'
    ? entry as Record<string, unknown>
    : null);
  return normalizePath(
    String(
      payload?.restoredPath
      || payload?.originalPath
      || payload?.path
      || fallbackPath
      || '',
    ),
  );
}

function normalizeGallerySortBy(input: unknown): GallerySortBy {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'modified' || value === 'name' || value === 'custom') return value;
  return 'created';
}

function normalizeGallerySortOrder(input: unknown): GallerySortOrder {
  return String(input || '').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
}

function consumePendingGalleryOpenPath(): { path: string; imagePath?: string; requestId?: string } | null {
  const scope = window as typeof window & {
    __umbraPendingGalleryOpenPath?: PendingGalleryOpenPathPayload | null;
  };
  const raw = scope.__umbraPendingGalleryOpenPath;
  if (!raw || typeof raw !== 'object') return null;
  scope.__umbraPendingGalleryOpenPath = null;

  const path = normalizePath(String(raw.path || raw.folderPath || ''));
  if (!path) return null;
  const imagePath = normalizePath(String(raw.imagePath || ''));
  const requestId = String(raw.requestId || '').trim();
  return {
    path,
    ...(imagePath ? { imagePath } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

function consumePendingGalleryRevealPath(): { path: string; imagePath?: string } | null {
  const scope = window as typeof window & {
    __umbraPendingGalleryRevealPath?: PendingGalleryRevealPathPayload | null;
  };
  const raw = scope.__umbraPendingGalleryRevealPath;
  if (!raw || typeof raw !== 'object') return null;
  scope.__umbraPendingGalleryRevealPath = null;

  const path = normalizePath(String(raw.path || raw.folderPath || ''));
  if (!path) return null;
  const imagePath = normalizePath(String(raw.imagePath || ''));
  return imagePath ? { path, imagePath } : { path };
}

export const LibraryWorkspaceHost = () => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingOpenPathRef = useRef<{ path: string; imagePath?: string; requestId?: string } | null>(null);
  const pendingRevealPathRef = useRef<{ path: string; imagePath?: string; requestId?: string } | null>(null);
  const openRequestSeqRef = useRef(0);
  const pendingOpenAckRef = useRef<{
    requestId: string;
    path: string;
    imagePath?: string;
    attempts: number;
    timer: number | null;
  } | null>(null);
  const revealRequestSeqRef = useRef(0);
  const pendingRevealAckRef = useRef<{
    requestId: string;
    path: string;
    imagePath?: string;
    attempts: number;
    timer: number | null;
  } | null>(null);
  const pendingTagEditorPathsRef = useRef<string[] | null>(null);
  const pendingGalleryTrashToastRef = useRef<{
    items: GalleryTrashToastItem[];
    failed: Array<{ error?: string }>;
    timer: number | null;
  }>({ items: [], failed: [], timer: null });
  const [url, setUrl] = React.useState<string>(FALLBACK_GALLERY_URL);
  const galleryBridgeStatusCacheRef = useRef<{ status: GalleryBridgeStatus | null; checkedAt: number }>({
    status: null,
    checkedAt: 0,
  });
  const ensureGalleryBridgePromiseRef = useRef<Promise<GalleryBridgeStatus | null> | null>(null);
  const galleryRecoveryFailureCountRef = useRef(0);
  const lastBridgeRecoveryToastAtRef = useRef(0);
  const galleryActiveInteractionUntilRef = useRef(0);
  const activeWorkspace = useStore((state) => state.activeWorkspace);
  const pinnedFoldersSetting = useStore((state) => state.appSettings['library.pinnedFolders']);
  const showFilmstrip = useStore((state) => state.ui.showFilmstrip);
  const nsfwThumbnailBlurEnabled = useStore((state) => state.appSettings['ui.nsfwThumbnailBlurEnabled'] === true);
  const nsfwThumbnailBlurIntensity = useStore((state) => {
    const raw = Number(state.appSettings['ui.nsfwThumbnailBlurIntensity'] ?? 85);
    if (!Number.isFinite(raw)) return 85;
    return Math.max(0, Math.min(100, Math.round(raw)));
  });
  const addToast = useToastStore((state) => state.addToast);

  const fetchGalleryBridgeStatus = useCallback(async (options?: { allowCached?: boolean }): Promise<GalleryBridgeStatus | null> => {
    const now = Date.now();
    if (options?.allowCached !== false) {
      const cached = galleryBridgeStatusCacheRef.current;
      if (cached.status && isHealthyGalleryBridgeStatus(cached.status) && now - cached.checkedAt < GALLERY_BRIDGE_STATUS_CACHE_MS) {
        return cached.status;
      }
    }
    const fetchDirectGalleryBridgeStatus = async (): Promise<GalleryBridgeStatus | null> => {
      if (!isLoopbackBrowserHost()) return null;
      for (const baseUrl of GALLERY_BRIDGE_DIRECT_BASE_URLS) {
        try {
          const response = await fetchWithTimeout(`${baseUrl}/health`, { cache: 'no-store' }, GALLERY_BRIDGE_STATUS_TIMEOUT_MS);
          if (!response.ok) continue;
          const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
          if (payload?.ok !== true) continue;
          const status: GalleryBridgeStatus = {
            running: true,
            healthy: true,
            url: `${baseUrl}/index.html`,
          };
          galleryBridgeStatusCacheRef.current = { status, checkedAt: Date.now() };
          return status;
        } catch {
          // Try the next loopback host before giving up.
        }
      }
      return null;
    };
    try {
      const response = await fetchWithTimeout('/api/gallery-bridge/status', { cache: 'no-store' }, GALLERY_BRIDGE_STATUS_TIMEOUT_MS);
      if (!response.ok) return await fetchDirectGalleryBridgeStatus();
      const status = await response.json() as GalleryBridgeStatus;
      galleryBridgeStatusCacheRef.current = { status, checkedAt: Date.now() };
      return status;
    } catch {
      return await fetchDirectGalleryBridgeStatus();
    }
  }, []);

  const ensureGalleryBridge = useCallback(async (): Promise<GalleryBridgeStatus | null> => {
    if (ensureGalleryBridgePromiseRef.current) return ensureGalleryBridgePromiseRef.current;

    const promise = (async () => {
      let status = await fetchGalleryBridgeStatus({ allowCached: true });
      if (isHealthyGalleryBridgeStatus(status)) return status;

      try {
        const startResponse = await fetchWithTimeout('/api/umbrabridge/backend/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend: 'gallery' }),
        }, GALLERY_BRIDGE_START_TIMEOUT_MS);
        if (!startResponse.ok) return null;

        const waitResponse = await fetchWithTimeout('/api/umbrabridge/backend/wait-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backend: 'gallery', timeout: 30000 }),
        }, GALLERY_BRIDGE_START_TIMEOUT_MS);
        if (!waitResponse.ok) return null;
      } catch {
        // Fall back to in-process URL below if bridge startup fails.
      }

      status = await fetchGalleryBridgeStatus({ allowCached: false });
      return status;
    })();

    ensureGalleryBridgePromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      ensureGalleryBridgePromiseRef.current = null;
    }
  }, [fetchGalleryBridgeStatus]);

  const postToGallery = useCallback((message: unknown) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(message, '*');
  }, []);

  useEffect(() => {
    let disposed = false;

    const resolveIFrameUrl = async () => {
      const status = await ensureGalleryBridge();
      const candidate = resolveGalleryWorkspaceUrlForBrowser(status?.url);
      const nextUrl = candidate || FALLBACK_GALLERY_URL;
      if (!disposed) {
        setUrl((currentUrl) => (currentUrl === nextUrl ? currentUrl : nextUrl));
        useStore.getState().setBooting('gallery', false);
      }
    };

    void resolveIFrameUrl();
    return () => {
      disposed = true;
    };
  }, [ensureGalleryBridge]);

  useEffect(() => {
    if (activeWorkspace !== 'library') return;
    let disposed = false;
    let checking = false;

    const recoverGalleryBridge = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const status = await fetchGalleryBridgeStatus({ allowCached: false });
        const currentUrl = String(url || '').trim();
        const usingBridge = isDirectGalleryBridgeUrl(currentUrl);
        if (isHealthyGalleryBridgeStatus(status)) {
          galleryRecoveryFailureCountRef.current = 0;
          const healthyUrl = resolveGalleryWorkspaceUrlForBrowser(status.url);
          if (healthyUrl && currentUrl !== healthyUrl) {
            if (Date.now() < galleryActiveInteractionUntilRef.current) return;
            setUrl(healthyUrl);
          }
          return;
        }
        galleryRecoveryFailureCountRef.current += 1;
        if (galleryRecoveryFailureCountRef.current < GALLERY_BRIDGE_RECOVERY_FAILURE_THRESHOLD) return;
        if (!usingBridge && currentUrl !== FALLBACK_GALLERY_URL) return;
        if (Date.now() < galleryActiveInteractionUntilRef.current) return;

        const recovered = await ensureGalleryBridge();
        if (disposed) return;
        const recoveredUrl = resolveGalleryWorkspaceUrlForBrowser(recovered?.url);
        const nextUrl = recoveredUrl || FALLBACK_GALLERY_URL;
        if (!recoveredUrl && usingBridge) {
          galleryRecoveryFailureCountRef.current = GALLERY_BRIDGE_RECOVERY_FAILURE_THRESHOLD;
          return;
        }
        if (nextUrl !== currentUrl) {
          setUrl(nextUrl);
        }

        const now = Date.now();
        if (now - lastBridgeRecoveryToastAtRef.current > 30000) {
          lastBridgeRecoveryToastAtRef.current = now;
          addToast({
            type: recoveredUrl ? 'success' : 'error',
            message: recoveredUrl
              ? 'Gallery service recovered'
              : 'Gallery service is unavailable; using fallback gallery',
          });
        }
        galleryRecoveryFailureCountRef.current = recoveredUrl ? 0 : galleryRecoveryFailureCountRef.current;
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(() => {
      void recoverGalleryBridge();
    }, GALLERY_BRIDGE_WATCHDOG_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeWorkspace, addToast, ensureGalleryBridge, fetchGalleryBridgeStatus, url]);

  const buildThemeMessage = useCallback((): GalleryThemeMessage => {
    const computed = window.getComputedStyle(document.documentElement);
    const vars: Record<string, string> = {};
    for (const name of GALLERY_THEME_VARS) {
      const value = computed.getPropertyValue(name).trim();
      if (value) vars[name] = value;
    }
    return {
      type: 'gallery:theme',
      theme: {
        vars,
        dna: String(document.body.getAttribute('data-dna') || '').trim(),
        typography: String(document.body.getAttribute('data-typography') || '').trim(),
      },
    };
  }, []);

  const postTheme = useCallback(() => {
    postToGallery(buildThemeMessage());
  }, [buildThemeMessage, postToGallery]);

  const normalizePinnedFolders = useCallback((raw: unknown): string[] => {
    const next: string[] = [];
    const seen = new Set<string>();
    if (!Array.isArray(raw)) return next;
    for (const entry of raw) {
      const normalized = String(entry || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      next.push(normalized);
    }
    return next;
  }, []);

  const postPinnedFolders = useCallback((raw?: unknown) => {
    const pinnedFolders = normalizePinnedFolders(raw ?? pinnedFoldersSetting);
    postToGallery({
      type: 'gallery:pinned-folders-sync',
      pinnedFolders,
    });
  }, [normalizePinnedFolders, pinnedFoldersSetting, postToGallery]);

  const postFilmstripState = useCallback((visible?: boolean) => {
    const nextVisible = typeof visible === 'boolean' ? visible : Boolean(showFilmstrip);
    postToGallery({
      type: 'gallery:filmstrip-state',
      visible: nextVisible,
    });
  }, [postToGallery, showFilmstrip]);

  const postNsfwSettings = useCallback((enabled?: boolean, intensity?: number) => {
    const nextEnabled = typeof enabled === 'boolean' ? enabled : nsfwThumbnailBlurEnabled;
    const rawIntensity = typeof intensity === 'number' ? intensity : nsfwThumbnailBlurIntensity;
    const nextIntensity = Math.max(0, Math.min(100, Math.round(Number(rawIntensity) || 0)));
    postToGallery({
      type: 'gallery:nsfw-settings',
      enabled: nextEnabled,
      intensity: nextIntensity,
    });
  }, [nsfwThumbnailBlurEnabled, nsfwThumbnailBlurIntensity, postToGallery]);

  const clearPendingOpenAck = useCallback(() => {
    const pending = pendingOpenAckRef.current;
    if (!pending) return;
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pendingOpenAckRef.current = null;
  }, []);

  const postOpenPath = useCallback((payload: { path: string; imagePath?: string; requestId?: string }, attempt = 1) => {
    const normalizedPath = normalizePath(payload.path);
    if (!normalizedPath) return;
    const normalizedImagePath = normalizePath(payload.imagePath);
    const requestId = String(payload.requestId || `gallery-open-${Date.now()}-${openRequestSeqRef.current += 1}`).trim();
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      pendingOpenPathRef.current = {
        path: normalizedPath,
        imagePath: normalizedImagePath || undefined,
        requestId,
      };
      return;
    }
    clearPendingOpenAck();
    pendingOpenAckRef.current = {
      requestId,
      path: normalizedPath,
      imagePath: normalizedImagePath || undefined,
      attempts: attempt,
      timer: null,
    };
    iframe.contentWindow.postMessage({
      type: 'gallery:open-path',
      requestId,
      path: normalizedPath,
      ...(normalizedImagePath ? { imagePath: normalizedImagePath } : {}),
    }, '*');
    pendingOpenAckRef.current.timer = window.setTimeout(() => {
      const current = pendingOpenAckRef.current;
      if (!current || current.requestId !== requestId) return;
      if (current.attempts >= 5) {
        clearPendingOpenAck();
        return;
      }
      postOpenPath({
        path: current.path,
        ...(current.imagePath ? { imagePath: current.imagePath } : {}),
        requestId: current.requestId,
      }, current.attempts + 1);
    }, 350);
  }, [clearPendingOpenAck]);

  const clearPendingRevealAck = useCallback(() => {
    const pending = pendingRevealAckRef.current;
    if (!pending) return;
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pendingRevealAckRef.current = null;
  }, []);

  const postRevealPath = useCallback((payload: { path: string; imagePath?: string; requestId?: string }, attempt = 1) => {
    const normalizedPath = normalizePath(payload.path);
    if (!normalizedPath) return;
    const normalizedImagePath = normalizePath(payload.imagePath);
    const requestId = String(payload.requestId || `gallery-reveal-${Date.now()}-${revealRequestSeqRef.current += 1}`).trim();
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      pendingRevealPathRef.current = {
        path: normalizedPath,
        imagePath: normalizedImagePath || undefined,
        requestId,
      };
      return;
    }
    clearPendingRevealAck();
    pendingRevealAckRef.current = {
      requestId,
      path: normalizedPath,
      imagePath: normalizedImagePath || undefined,
      attempts: attempt,
      timer: null,
    };
    iframe.contentWindow.postMessage({
      type: 'gallery:reveal-path',
      requestId,
      path: normalizedPath,
      ...(normalizedImagePath ? { imagePath: normalizedImagePath } : {}),
    }, '*');
    pendingRevealAckRef.current.timer = window.setTimeout(() => {
      const current = pendingRevealAckRef.current;
      if (!current || current.requestId !== requestId) return;
      if (current.attempts >= 4) {
        clearPendingRevealAck();
        return;
      }
      postRevealPath({
        path: current.path,
        ...(current.imagePath ? { imagePath: current.imagePath } : {}),
        requestId: current.requestId,
      }, current.attempts + 1);
    }, 350);
  }, [clearPendingRevealAck]);

  const postFilmstripFeedRequest = useCallback((payload: { path: string; source?: string }) => {
    const normalizedPath = normalizePath(payload.path);
    if (!normalizedPath) return;
    postToGallery({
      type: 'gallery:request-filmstrip-feed',
      path: normalizedPath,
      source: String(payload.source || '').trim() || 'host',
    });
  }, [postToGallery]);

  const postOpenTagEditor = useCallback((rawPaths: unknown) => {
    const paths = Array.isArray(rawPaths)
      ? rawPaths
        .map((entry) => normalizePath(String(entry || '')))
        .filter(Boolean)
      : [];
    if (paths.length === 0) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      pendingTagEditorPathsRef.current = paths;
      return;
    }
    iframe.contentWindow.postMessage({
      type: 'gallery:open-tag-editor',
      paths,
    }, '*');
  }, []);

  useEffect(() => {
    const pending = consumePendingGalleryOpenPath();
    if (!pending) return;
    postOpenPath(pending);
  }, [postOpenPath, url]);

  useEffect(() => {
    const pending = consumePendingGalleryRevealPath();
    if (!pending) return;
    postRevealPath(pending);
  }, [postRevealPath, url]);

  const openRestoredItem = useCallback((restoredPath: string, restoredType?: 'file' | 'folder') => {
    const normalizedRestoredPath = normalizePath(restoredPath);
    if (!normalizedRestoredPath) return;

    const treatAsFile = restoredType ? restoredType === 'file' : isLikelyFilePath(normalizedRestoredPath);
    const folderPath = treatAsFile
      ? pathParent(normalizedRestoredPath) || normalizedRestoredPath
      : normalizedRestoredPath;
    const imagePath = treatAsFile ? normalizedRestoredPath : '';

    const appStore = useStore.getState();
    appStore.setActiveWorkspace('library');
    postOpenPath({
      path: folderPath,
      ...(imagePath ? { imagePath } : {}),
    });
  }, [postOpenPath]);

  useEffect(() => {
    const onOpenTagEditor = (event: Event) => {
      const custom = event as CustomEvent<{ paths?: string[] }>;
      const paths = Array.isArray(custom?.detail?.paths) ? custom.detail.paths : [];
      if (paths.length === 0) return;
      postOpenTagEditor(paths);
    };
    window.addEventListener('umbra:gallery-open-tag-editor', onOpenTagEditor as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-open-tag-editor', onOpenTagEditor as EventListener);
    };
  }, [postOpenTagEditor]);

  const addRestoredToast = useCallback((
    restoredPath: string,
    fallbackName?: string,
    restoredType?: 'file' | 'folder',
  ) => {
    const normalizedRestoredPath = normalizePath(restoredPath);
    if (!normalizedRestoredPath) return;
    const name = String(fallbackName || pathLeaf(normalizedRestoredPath) || 'item').trim();

    addToast({
      type: 'success',
      message: `Restored ${name}`,
      action: {
        label: 'View',
        onClick: () => {
          openRestoredItem(normalizedRestoredPath, restoredType);
        },
      },
    });
  }, [addToast, openRestoredItem]);

  const addRestoredBatchToast = useCallback((
    restoredPaths: string[],
    fallbackCount: number,
    restoredType?: 'file' | 'folder',
  ) => {
    const normalizedPaths = Array.from(new Set(
      restoredPaths.map((entry) => normalizePath(entry)).filter(Boolean),
    ));
    const count = normalizedPaths.length || fallbackCount;
    if (count <= 0) return;
    if (count === 1 && normalizedPaths[0]) {
      addRestoredToast(normalizedPaths[0], undefined, restoredType);
      return;
    }
    const firstPath = normalizedPaths[0] || '';
    addToast({
      type: 'success',
      message: `Restored ${count} item${count === 1 ? '' : 's'}`,
      ...(firstPath
        ? {
          action: {
            label: 'View',
            onClick: () => {
              openRestoredItem(firstPath, restoredType);
            },
          },
        }
        : {}),
    });
  }, [addRestoredToast, addToast, openRestoredItem]);

  const flushGalleryTrashToast = useCallback(() => {
    const pending = pendingGalleryTrashToastRef.current;
    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
    const items = pending.items.splice(0);
    const failed = pending.failed.splice(0);
    const dedupedItems: GalleryTrashToastItem[] = [];
    const seenTrashPaths = new Set<string>();
    for (const item of items) {
      const trashPath = normalizePath(item.trashPath);
      if (!trashPath || seenTrashPaths.has(trashPath)) continue;
      seenTrashPaths.add(trashPath);
      dedupedItems.push({
        trashPath,
        originalPath: normalizePath(item.originalPath),
        name: String(item.name || pathLeaf(item.originalPath) || pathLeaf(trashPath) || 'item').trim(),
      });
    }

    if (dedupedItems.length > 0) {
      const count = dedupedItems.length;
      const singleName = dedupedItems[0]?.name || 'item';
      addToast({
        type: 'success',
        message: count === 1 ? `Moved ${singleName} to Trash` : `Moved ${count} items to Trash`,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const response = await fetch('/api/trash/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  items: dedupedItems.map(({ trashPath, originalPath }) => ({
                    trashPath,
                    ...(originalPath ? { originalPath } : {}),
                  })),
                }),
              });
              const restorePayload = await response.json().catch(() => ({} as Record<string, unknown>));
              if (!response.ok) {
                throw new Error(String(restorePayload?.error || 'Failed to restore from trash'));
              }
              const restoredItems = Array.isArray((restorePayload as { restored?: unknown[] }).restored)
                ? (restorePayload as {
                  restored?: Array<{ restoredPath?: string; originalPath?: string; type?: 'file' | 'folder' }>;
                }).restored || []
                : [];
              const restoredPaths = restoredItems
                .map((entry, index) => resolveRestoredPath(entry, dedupedItems[index]?.originalPath))
                .filter(Boolean);
              addRestoredBatchToast(restoredPaths, dedupedItems.length, restoredItems[0]?.type);
              if (restoredPaths.length > 0) {
                window.dispatchEvent(new CustomEvent('umbra:gallery-restore-paths', {
                  detail: {
                    paths: restoredPaths,
                    source: 'host',
                  },
                }));
              } else {
                window.dispatchEvent(new CustomEvent('umbra:gallery-trash-updated', {
                  detail: { source: 'host' },
                }));
              }
            } catch (error) {
              addToast({
                type: 'error',
                message: error instanceof Error ? error.message : 'Failed to restore from trash',
              });
            }
          },
        },
      });
    }

    if (failed.length > 0) {
      const first = String(failed[0]?.error || 'Failed to move item to Trash');
      addToast({
        type: 'error',
        message: failed.length > 1 ? `${first} (+${failed.length - 1} more)` : first,
      });
    }
  }, [addRestoredBatchToast, addToast]);

  const queueGalleryTrashToast = useCallback((
    items: GalleryTrashToastItem[],
    failed: Array<{ error?: string }>,
  ) => {
    const pending = pendingGalleryTrashToastRef.current;
    pending.items.push(...items);
    pending.failed.push(...failed);
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = window.setTimeout(() => {
      flushGalleryTrashToast();
    }, 260);
  }, [flushGalleryTrashToast]);

  useEffect(() => {
    const onOpenPath = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string; folderPath?: string; imagePath?: string }>;
      const incoming = String(custom?.detail?.path || custom?.detail?.folderPath || '').trim();
      if (!incoming) return;
      const imagePath = String(custom?.detail?.imagePath || '').trim();
      postOpenPath({ path: incoming, ...(imagePath ? { imagePath } : {}) });
    };
    window.addEventListener('umbra:gallery-open-path', onOpenPath as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-open-path', onOpenPath as EventListener);
    };
  }, [postOpenPath]);

  useEffect(() => {
    const onRevealPath = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string; folderPath?: string; imagePath?: string }>;
      const incoming = String(custom?.detail?.path || custom?.detail?.folderPath || '').trim();
      if (!incoming) return;
      const imagePath = String(custom?.detail?.imagePath || '').trim();
      postRevealPath({ path: incoming, ...(imagePath ? { imagePath } : {}) });
    };
    window.addEventListener('umbra:gallery-reveal-path', onRevealPath as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-reveal-path', onRevealPath as EventListener);
    };
  }, [postRevealPath]);

  useEffect(() => {
    const onPinFolder = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string; folderPath?: string; pinned?: boolean }>;
      const targetPath = normalizePath(String(custom?.detail?.path || custom?.detail?.folderPath || ''));
      if (!targetPath) return;
      const pinned = custom?.detail?.pinned !== false;
      postToGallery({
        type: 'gallery:toggle-pin-folder',
        path: targetPath,
        pinned,
      });
      if (pinned) {
        postFilmstripFeedRequest({
          path: targetPath,
          source: 'pin-folder',
        });
      }
    };
    window.addEventListener('umbra:gallery-pin-folder', onPinFolder as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-pin-folder', onPinFolder as EventListener);
    };
  }, [postFilmstripFeedRequest, postToGallery]);

  useEffect(() => {
    const onRequestFilmstripFeed = (event: Event) => {
      const custom = event as CustomEvent<{ path?: string; folderPath?: string; source?: string }>;
      const targetPath = normalizePath(String(custom?.detail?.path || custom?.detail?.folderPath || ''));
      if (!targetPath) return;
      postFilmstripFeedRequest({
        path: targetPath,
        source: String(custom?.detail?.source || '').trim() || 'host',
      });
    };
    window.addEventListener('umbra:gallery-request-filmstrip-feed', onRequestFilmstripFeed as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-request-filmstrip-feed', onRequestFilmstripFeed as EventListener);
    };
  }, [postFilmstripFeedRequest]);

  useEffect(() => {
    const onTrashUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ source?: string }>;
      const source = String(custom?.detail?.source || '').trim() || 'host';
      postToGallery({ type: 'gallery:trash-updated', source });
    };
    window.addEventListener('umbra:gallery-trash-updated', onTrashUpdated);
    return () => {
      window.removeEventListener('umbra:gallery-trash-updated', onTrashUpdated);
    };
  }, [postToGallery]);

  useEffect(() => {
    const onRemovePaths = (event: Event) => {
      const custom = event as CustomEvent<{ paths?: string[]; source?: string }>;
      const paths = Array.isArray(custom?.detail?.paths)
        ? custom.detail.paths.map((entry) => normalizePath(String(entry || ''))).filter(Boolean)
        : [];
      if (paths.length === 0) return;
      const source = String(custom?.detail?.source || '').trim() || 'host';
      postToGallery({
        type: 'gallery:remove-paths',
        paths,
        source,
      });
    };
    window.addEventListener('umbra:gallery-remove-paths', onRemovePaths as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-remove-paths', onRemovePaths as EventListener);
    };
  }, [postToGallery]);

  useEffect(() => {
    const onRestorePaths = (event: Event) => {
      const custom = event as CustomEvent<{ paths?: string[]; source?: string }>;
      const paths = Array.isArray(custom?.detail?.paths)
        ? custom.detail.paths.map((entry) => normalizePath(String(entry || ''))).filter(Boolean)
        : [];
      if (paths.length === 0) return;
      const source = String(custom?.detail?.source || '').trim() || 'host';
      postToGallery({
        type: 'gallery:restore-paths',
        paths,
        source,
      });
    };
    window.addEventListener('umbra:gallery-restore-paths', onRestorePaths as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-restore-paths', onRestorePaths as EventListener);
    };
  }, [postToGallery]);

  useEffect(() => {
    const onGenerationComplete = (event: Event) => {
      const custom = event as CustomEvent<{ folderPaths?: string[]; source?: string }>;
      const rawFolderPaths = Array.isArray(custom?.detail?.folderPaths) ? custom.detail.folderPaths : [];
      const folderPaths = rawFolderPaths
        .map((entry) => normalizePath(String(entry || '')))
        .filter(Boolean);
      const source = String(custom?.detail?.source || 'powerprompter').trim() || 'powerprompter';
      postToGallery({
        type: 'gallery:sidebar-refresh',
        source,
        folderPaths,
      });
    };
    window.addEventListener('umbra:gallery-generation-complete', onGenerationComplete as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-generation-complete', onGenerationComplete as EventListener);
    };
  }, [postToGallery]);

  useEffect(() => {
    const onPowerPrompterOutputSaved = (event: Event) => {
      const files = collectSavedOutputFiles((event as CustomEvent<unknown>)?.detail);
      if (files.length === 0) return;
      const folderPaths = Array.from(new Set(files.map((file) => pathParent(file.path)).filter(Boolean)));
      postToGallery({
        type: 'gallery:upsert-files',
        source: 'powerprompter-output-saved',
        files,
        folderPaths,
      });
    };
    window.addEventListener('umbra:powerprompter-output-saved', onPowerPrompterOutputSaved as EventListener);
    return () => {
      window.removeEventListener('umbra:powerprompter-output-saved', onPowerPrompterOutputSaved as EventListener);
    };
  }, [postToGallery]);

  useEffect(() => {
    const onSetSort = (event: Event) => {
      const custom = event as CustomEvent<{ sortBy?: string; sortOrder?: string; source?: string }>;
      const sortBy = normalizeGallerySortBy(custom?.detail?.sortBy);
      const sortOrder = normalizeGallerySortOrder(custom?.detail?.sortOrder);
      const source = String(custom?.detail?.source || '').trim() || 'host';
      postToGallery({
        type: 'gallery:set-sort',
        sortBy,
        sortOrder,
        source,
      });
    };
    window.addEventListener('umbra:gallery-set-sort', onSetSort as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-set-sort', onSetSort as EventListener);
    };
  }, [postToGallery]);

  useEffect(() => {
    const onSetSelection = (event: Event) => {
      const custom = event as CustomEvent<{
        paths?: string[];
        primaryPath?: string;
        folderPath?: string;
        source?: string;
      }>;
      const rawPaths = Array.isArray(custom?.detail?.paths) ? custom.detail.paths : [];
      const paths = rawPaths
        .map((entry) => normalizePath(String(entry || '')))
        .filter(Boolean);
      const primaryPath = normalizePath(String(custom?.detail?.primaryPath || ''));
      const folderPath = normalizePath(String(custom?.detail?.folderPath || ''));
      const source = String(custom?.detail?.source || '').trim() || 'host';
      postToGallery({
        type: 'gallery:set-selection',
        paths,
        ...(primaryPath ? { primaryPath } : {}),
        ...(folderPath ? { folderPath } : {}),
        source,
      });
    };
    window.addEventListener('umbra:gallery-set-selection', onSetSelection as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-set-selection', onSetSelection as EventListener);
    };
  }, [postToGallery]);

  useEffect(() => {
    const onLoadMore = (event: Event) => {
      const custom = event as CustomEvent<{ source?: string }>;
      const source = String(custom?.detail?.source || '').trim() || 'host';
      postToGallery({
        type: 'gallery:load-more',
        source,
      });
    };
    window.addEventListener('umbra:gallery-load-more', onLoadMore as EventListener);
    return () => {
      window.removeEventListener('umbra:gallery-load-more', onLoadMore as EventListener);
    };
  }, [postToGallery]);

  useEffect(() => {
    const onGalleryMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      const payload = event.data as {
        type?: string;
        path?: string;
        imagePath?: string;
        folderPath?: string;
        workspace?: string;
        paths?: string[];
        pinnedFolders?: unknown[];
        items?: Array<{ trashPath?: string; originalPath?: string; name?: string }>;
        failed?: Array<{ path?: string; error?: string }>;
        restored?: Array<{
          trashPath?: string;
          originalPath?: string;
          restoredPath?: string;
          name?: string;
          type?: 'file' | 'folder';
        }>;
        sortBy?: string;
        sortOrder?: string;
        source?: string;
        primaryPath?: string;
        viewerOpen?: boolean;
        files?: unknown[];
        mode?: string;
        requestId?: string;
        success?: boolean;
      } | null;
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'gallery:folder-changed') {
        const path = String(payload.path || payload.folderPath || '').trim();
        if (!path) return;
        window.dispatchEvent(new CustomEvent('umbra:gallery-folder-changed', { detail: { path } }));
        return;
      }
      if (payload.type === 'gallery:image-focused') {
        const imagePath = String(payload.imagePath || payload.path || '').trim();
        const folderPath = String(payload.folderPath || '').trim();
        window.dispatchEvent(new CustomEvent('umbra:gallery-image-focused', { detail: { imagePath, folderPath } }));
        return;
      }
      if (payload.type === 'gallery:open-accepted' || payload.type === 'gallery:open-complete') {
        const requestId = String(payload.requestId || '').trim();
        const pending = pendingOpenAckRef.current;
        if (pending && requestId && pending.requestId === requestId) {
          clearPendingOpenAck();
        }
        return;
      }
      if (payload.type === 'gallery:reveal-accepted' || payload.type === 'gallery:reveal-complete') {
        const requestId = String(payload.requestId || '').trim();
        const pending = pendingRevealAckRef.current;
        if (pending && requestId && pending.requestId === requestId) {
          clearPendingRevealAck();
        }
        return;
      }
      if (payload.type === 'gallery:selection-changed') {
        const rawPaths = Array.isArray(payload.paths) ? payload.paths : [];
        const paths = rawPaths
          .map((entry) => normalizePath(String(entry || '')))
          .filter(Boolean);
        const primaryPath = normalizePath(String(payload.primaryPath || ''));
        const folderPath = normalizePath(String(payload.folderPath || ''));
        const source = String(payload.source || '').trim() || 'gallery';
        const viewerOpen = (payload as { viewerOpen?: unknown }).viewerOpen === true;
        if (viewerOpen || paths.length > 0) {
          galleryActiveInteractionUntilRef.current = Date.now() + GALLERY_ACTIVE_INTERACTION_GRACE_MS;
        }
        window.dispatchEvent(new CustomEvent('umbra:gallery-selection-changed', {
          detail: { paths, primaryPath, folderPath, source, viewerOpen },
        }));
        return;
      }
      if (payload.type === 'gallery:sort-changed') {
        const sortBy = normalizeGallerySortBy(payload.sortBy);
        const sortOrder = normalizeGallerySortOrder(payload.sortOrder);
        const source = String(payload.source || '').trim() || 'gallery';
        window.dispatchEvent(new CustomEvent('umbra:gallery-sort-changed', {
          detail: { sortBy, sortOrder, source },
        }));
        return;
      }
      if (payload.type === 'gallery:content-changed') {
        const path = String(payload.path || payload.folderPath || '').trim();
        const reason = String((payload as { reason?: unknown }).reason || '').trim();
        const source = String(payload.source || '').trim() || 'gallery';
        window.dispatchEvent(new CustomEvent('umbra:gallery-content-changed', {
          detail: { path, reason, source },
        }));
        return;
      }
      if (payload.type === 'gallery:filmstrip-feed') {
        const folderPath = normalizePath(String(payload.folderPath || payload.path || ''));
        const files = Array.isArray(payload.files) ? payload.files : [];
        const rawMode = String(payload.mode || '').trim().toLowerCase();
        const mode = rawMode === 'append'
          ? 'append'
          : (rawMode === 'remove' ? 'remove' : 'replace');
        const removedPaths = Array.isArray((payload as { removedPaths?: unknown }).removedPaths)
          ? ((payload as { removedPaths?: unknown[] }).removedPaths || [])
            .map((entry) => normalizePath(String(entry || '')))
            .filter(Boolean)
          : [];
        const sortBy = normalizeGallerySortBy(payload.sortBy);
        const sortOrder = normalizeGallerySortOrder(payload.sortOrder);
        const source = String(payload.source || '').trim() || 'gallery';
        window.dispatchEvent(new CustomEvent('umbra:gallery-filmstrip-feed', {
          detail: { folderPath, files, mode, removedPaths, sortBy, sortOrder, source },
        }));
        return;
      }
      if (payload.type === 'gallery:open-workspace') {
        const workspace = String(payload.workspace || '').trim();
        if (workspace !== 'scanner' && workspace !== 'waifudiffusion') return;
        const appStore = useStore.getState();
        if (workspace === 'scanner' || workspace === 'waifudiffusion') {
          appStore.setUI('imageInspectorTab', workspace === 'scanner' ? 'scanner' : 'waifu');
          appStore.setActiveWorkspace('imageinspector');
        } else {
          appStore.setActiveWorkspace(workspace);
        }
        return;
      }
      if (payload.type === 'gallery:pinned-folders-changed') {
        const next = normalizePinnedFolders(payload.pinnedFolders);
        const appStore = useStore.getState();
        appStore.setAppSetting('library.pinnedFolders', next);
        return;
      }
      if (payload.type === 'gallery:send-to-workspace') {
        const workspace = String(payload.workspace || '').trim();
        if (workspace !== 'scanner' && workspace !== 'waifudiffusion') return;
        const rawPaths = Array.isArray(payload.paths) ? payload.paths : [];
        const unique: string[] = [];
        const seen = new Set<string>();
        for (const entry of rawPaths) {
          const normalized = String(entry || '').trim();
          if (!normalized || seen.has(normalized)) continue;
          seen.add(normalized);
          unique.push(normalized);
        }
        if (unique.length === 0) return;
        const appStore = useStore.getState();
        appStore.addScannedImport(unique);
        
        if (workspace === 'scanner' || workspace === 'waifudiffusion') {
          appStore.setUI('imageInspectorTab', workspace === 'scanner' ? 'scanner' : 'waifu');
          appStore.setActiveWorkspace('imageinspector');
        } else {
          appStore.setActiveWorkspace(workspace);
        }
        
        appStore.showToast(
          workspace === 'scanner'
            ? `Sent ${unique.length} item${unique.length > 1 ? 's' : ''} to Metadata Scanner`
            : `Sent ${unique.length} image${unique.length > 1 ? 's' : ''} to Waifu Diffusion`,
          'success',
        );
        return;
      }
      if (payload.type === 'gallery:toggle-filmstrip') {
        const appStore = useStore.getState();
        const currentVisible = Boolean(appStore.ui.showFilmstrip);
        const requestedVisible = typeof (payload as { visible?: unknown }).visible === 'boolean'
          ? Boolean((payload as { visible?: unknown }).visible)
          : !currentVisible;
        appStore.setAppSetting('comfyui.showFilmstrip', requestedVisible);
        return;
      }
      if (payload.type === 'gallery:trash-moved') {
        const items = Array.isArray(payload.items) ? payload.items : [];
        const failed = Array.isArray(payload.failed) ? payload.failed : [];
        const movedToastItems: GalleryTrashToastItem[] = [];
        for (const item of items) {
          const trashPath = normalizePath(String(item?.trashPath || ''));
          const originalPath = normalizePath(String(item?.originalPath || ''));
          if (!trashPath) continue;
          movedToastItems.push({
            trashPath,
            originalPath,
            name: String(item?.name || pathLeaf(originalPath) || pathLeaf(trashPath) || 'item').trim(),
          });
        }
        if (movedToastItems.length > 0 || failed.length > 0) {
          queueGalleryTrashToast(movedToastItems, failed);
        }
        return;
      }

      if (payload.type === 'gallery:trash-restored') {
        const restored = Array.isArray(payload.restored) ? payload.restored : [];
        const failed = Array.isArray(payload.failed) ? payload.failed : [];
        const restoredPaths = restored
          .map((item) => resolveRestoredPath(item))
          .filter(Boolean);
        addRestoredBatchToast(restoredPaths, restored.length, restored[0]?.type);

        if (failed.length > 0) {
          const first = String(failed[0]?.error || 'Failed to restore item from Trash');
          addToast({
            type: 'error',
            message: failed.length > 1 ? `${first} (+${failed.length - 1} more)` : first,
          });
        }
        return;
      }
    };

    window.addEventListener('message', onGalleryMessage);
    return () => {
      window.removeEventListener('message', onGalleryMessage);
    };
  }, [
    addRestoredBatchToast,
    addToast,
    clearPendingOpenAck,
    clearPendingRevealAck,
    normalizePinnedFolders,
    postToGallery,
    queueGalleryTrashToast,
  ]);

  useEffect(() => {
    return () => {
      clearPendingOpenAck();
      clearPendingRevealAck();
      const pending = pendingGalleryTrashToastRef.current;
      if (pending.timer) {
        clearTimeout(pending.timer);
        pending.timer = null;
      }
    };
  }, [clearPendingOpenAck, clearPendingRevealAck]);

  useEffect(() => {
    postPinnedFolders();
  }, [postPinnedFolders, pinnedFoldersSetting]);

  useEffect(() => {
    postFilmstripState();
  }, [postFilmstripState, showFilmstrip]);

  useEffect(() => {
    postNsfwSettings();
  }, [nsfwThumbnailBlurEnabled, nsfwThumbnailBlurIntensity, postNsfwSettings]);

  useEffect(() => {
    postToGallery({
      type: 'gallery:host-workspace-state',
      workspace: activeWorkspace,
    });
  }, [activeWorkspace, postToGallery]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (event.key === 'umbra-studio-theme' || event.key === 'umbra-studio-theme-live') {
        postTheme();
      }
    };

    const rootObserver = new MutationObserver(() => {
      postTheme();
    });
    rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

    const bodyObserver = new MutationObserver(() => {
      postTheme();
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-dna', 'data-typography'] });

    let themeChannel: BroadcastChannel | null = null;
    try {
      themeChannel = new BroadcastChannel('umbra-theme-sync');
      themeChannel.onmessage = () => postTheme();
    } catch {
      themeChannel = null;
    }

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      rootObserver.disconnect();
      bodyObserver.disconnect();
      themeChannel?.close();
    };
  }, [postTheme]);

  const handleIFrameLoad = useCallback(() => {
    postTheme();
    postPinnedFolders();
    postFilmstripState();
    postNsfwSettings();
    if (pendingOpenPathRef.current) {
      const queued = pendingOpenPathRef.current;
      pendingOpenPathRef.current = null;
      postOpenPath(queued);
    }
    if (pendingRevealPathRef.current) {
      const queued = pendingRevealPathRef.current;
      pendingRevealPathRef.current = null;
      postRevealPath(queued);
    }
    if (pendingTagEditorPathsRef.current && pendingTagEditorPathsRef.current.length > 0) {
      const queuedPaths = pendingTagEditorPathsRef.current.slice();
      pendingTagEditorPathsRef.current = null;
      postOpenTagEditor(queuedPaths);
    }
  }, [postFilmstripState, postNsfwSettings, postOpenPath, postOpenTagEditor, postPinnedFolders, postRevealPath, postTheme]);

  return (
    <iframe
      ref={iframeRef}
      src={url}
      className="h-full w-full border-0"
      title="Gallery"
      onLoad={handleIFrameLoad}
    />
  );
};

export default LibraryWorkspaceHost;
