'use client';

import React from 'react';
import {
  Check,
  Database,
  FolderOpen,
  Image as ImageIcon,
  Library,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { readUserConfig } from '@/lib/userConfig';
import { getUmbraRemoteMode } from '@/utils/hostOnly';
import type {
  PowerPrompterInfoRequestOptions,
  PowerPrompterLoraInfoPayload,
  PowerPrompterModelInfoPayload,
} from '@/components/power-prompter/powerPrompterSupport';
import type { PowerPrompterModelType } from '@/types/powerPrompter';

export type UmbraModelPickerKind = 'checkpoint' | 'lora';
export type UmbraModelPickerInfo = PowerPrompterLoraInfoPayload | PowerPrompterModelInfoPayload;

export interface UmbraModelPickerCatalogItem {
  path: string;
  source?: PowerPrompterModelType;
}

export function shouldAutoFocusUmbraModelPickerSearch(remoteMode: string): boolean {
  return remoteMode !== 'phone';
}

interface UmbraModelPickerModalProps {
  open: boolean;
  kind: UmbraModelPickerKind;
  items: Array<string | UmbraModelPickerCatalogItem>;
  selectedValue: string;
  selectedSource?: PowerPrompterModelType;
  catalogLoading?: boolean;
  onClose: () => void;
  onRefresh?: () => void | Promise<unknown>;
  onRequestInfo?: (name: string, options?: PowerPrompterInfoRequestOptions) => Promise<UmbraModelPickerInfo>;
  onConfirm: (name: string, info: UmbraModelPickerInfo | null, source?: PowerPrompterModelType) => void;
  titleOverride?: string;
  searchPlaceholder?: string;
  confirmLabel?: string;
}

interface CatalogFile {
  key: string;
  path: string;
  folder: string;
  name: string;
  source?: PowerPrompterModelType;
}

const MODEL_SOURCE_LABELS: Record<PowerPrompterModelType, string> = {
  checkpoint: 'Checkpoints',
  diffusers: 'Diffusers',
  diffusion_model: 'Diffusion Models',
  unet: 'UNet',
  gguf: 'GGUF',
};

const MODEL_SOURCE_ORDER: PowerPrompterModelType[] = [
  'checkpoint',
  'diffusers',
  'diffusion_model',
  'unet',
  'gguf',
];

function normalizeCatalogPath(value: unknown): string {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

function getFolder(path: string): string {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : '';
}

function getFileLabel(path: string): string {
  return (path.split('/').pop() || path).replace(/\.(?:ckpt|pt|pth|safetensors)$/i, '');
}

function stripFileExtension(value: string): string {
  return String(value || '').replace(/\.[^/.]+$/, '');
}

function getCatalogAliasKeys(rawPath: unknown): string[] {
  const normalized = normalizeCatalogPath(rawPath);
  if (!normalized) return [];
  const fileName = normalized.split('/').pop() || normalized;
  const withoutKnownPrefix = normalized.replace(/^(?:checkpoints|diffusers|diffusion_models|unet|loras)\//i, '');
  return Array.from(new Set([
    normalized,
    stripFileExtension(normalized),
    fileName,
    stripFileExtension(fileName),
    withoutKnownPrefix,
    stripFileExtension(withoutKnownPrefix),
  ].map((entry) => normalizeCatalogPath(entry).toLowerCase()).filter(Boolean)));
}

function normalizeHttpUrl(value: unknown): string {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function isVideoPreviewUrl(value: string): boolean {
  return /\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(value);
}

function toCivitaiSizedImageUrl(rawValue: unknown, longEdge = 640): string {
  const normalized = normalizeHttpUrl(rawValue);
  if (!normalized || isVideoPreviewUrl(normalized)) return normalized;
  try {
    const parsed = new URL(normalized);
    if (!String(parsed.hostname || '').toLowerCase().includes('civitai.com')) return normalized;
    const target = Math.max(256, Math.min(1280, Math.floor(Number(longEdge) || 640)));
    if (/\/width=\d+/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/width=\d+/i, `/width=${target}`);
    } else if (/\/w=\d+/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/w=\d+/i, `/w=${target}`);
    } else {
      parsed.searchParams.set('width', String(target));
    }
    parsed.searchParams.delete('height');
    return parsed.href;
  } catch {
    return normalized;
  }
}

function extractPreviewUrls(info: UmbraModelPickerInfo | null): string[] {
  const civitai = info?.civitai && typeof info.civitai === 'object'
    ? info.civitai as Record<string, unknown>
    : {};
  const model = civitai.model && typeof civitai.model === 'object'
    ? civitai.model as Record<string, unknown>
    : {};
  const images = [
    ...(Array.isArray(civitai.images) ? civitai.images : []),
    ...(Array.isArray(model.images) ? model.images : []),
  ];
  return Array.from(new Set(images
    .map((entry) => entry && typeof entry === 'object' ? entry as Record<string, unknown> : null)
    .filter((entry): entry is Record<string, unknown> => !!entry)
    .filter((entry) => {
      const type = String(entry.type || '').trim().toLowerCase();
      return type === '' || type === 'image' || type === 'video';
    })
    .map((entry) => {
      const url = normalizeHttpUrl(entry.url);
      const type = String(entry.type || '').trim().toLowerCase();
      return type === 'video' || isVideoPreviewUrl(url) ? url : toCivitaiSizedImageUrl(url);
    })
    .filter(Boolean)))
    .slice(0, 4);
}

function infoName(info: UmbraModelPickerInfo | null): string {
  if (!info) return '';
  return normalizeCatalogPath('loraName' in info ? info.loraName : info.modelName);
}

function infoMatchesPath(info: UmbraModelPickerInfo | null, path: string): boolean {
  if (!info || !path) return false;
  const pathAliases = new Set(getCatalogAliasKeys(path));
  return getCatalogAliasKeys(infoName(info)).some((alias) => pathAliases.has(alias));
}

function getInfoCacheKey(kind: UmbraModelPickerKind, alias: string): string {
  return `${kind}:${alias}`;
}

function findCachedInfo(
  cache: Record<string, UmbraModelPickerInfo>,
  kind: UmbraModelPickerKind,
  path: string,
): UmbraModelPickerInfo | null {
  for (const alias of getCatalogAliasKeys(path)) {
    const cached = cache[getInfoCacheKey(kind, alias)];
    if (cached) return cached;
  }
  return null;
}

function normalizeThumbnailOverrides(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const normalized: Record<string, string[]> = {};
  for (const [rawKey, rawSources] of Object.entries(value as Record<string, unknown>)) {
    const aliases = getCatalogAliasKeys(rawKey);
    if (aliases.length === 0) continue;
    const sources = (Array.isArray(rawSources) ? rawSources : [rawSources])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .slice(0, 4);
    if (sources.length === 0) continue;
    const uniqueSources = Array.from(new Set(sources));
    for (const alias of aliases) normalized[alias] = uniqueSources;
  }
  return normalized;
}

function findThumbnailOverrides(overrides: Record<string, string[]>, path: string): string[] {
  for (const alias of getCatalogAliasKeys(path)) {
    const sources = overrides[alias];
    if (sources?.length) return sources;
  }
  return [];
}

function renderPreviewMedia(url: string, alt: string, className: string): React.ReactNode {
  if (isVideoPreviewUrl(url)) {
    return (
      <video
        src={url}
        className={className}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

export function UmbraModelPickerModal({
  open,
  kind,
  items,
  selectedValue,
  selectedSource,
  catalogLoading = false,
  onClose,
  onRefresh,
  onRequestInfo,
  onConfirm,
  titleOverride,
  searchPlaceholder,
  confirmLabel,
}: UmbraModelPickerModalProps) {
  const [search, setSearch] = React.useState('');
  const [folder, setFolder] = React.useState('');
  const [activeSource, setActiveSource] = React.useState<PowerPrompterModelType | undefined>(selectedSource);
  const [selection, setSelection] = React.useState('');
  const [info, setInfo] = React.useState<UmbraModelPickerInfo | null>(null);
  const [infoLoading, setInfoLoading] = React.useState(false);
  const [infoError, setInfoError] = React.useState('');
  const [infoCache, setInfoCache] = React.useState<Record<string, UmbraModelPickerInfo>>({});
  const [previewTick, setPreviewTick] = React.useState(0);
  const [thumbnailOverrides, setThumbnailOverrides] = React.useState<Record<string, string[]>>({});
  const pendingPreviewInfoRef = React.useRef(new Set<string>());
  const infoCacheRef = React.useRef(infoCache);
  infoCacheRef.current = infoCache;

  const cacheInfo = React.useCallback((requestedPath: string, nextInfo: UmbraModelPickerInfo) => {
    const aliases = Array.from(new Set([
      ...getCatalogAliasKeys(requestedPath),
      ...getCatalogAliasKeys(infoName(nextInfo)),
    ]));
    if (aliases.length <= 0) return;
    setInfoCache((current) => {
      const patch = Object.fromEntries(
        aliases.map((alias) => [getInfoCacheKey(kind, alias), nextInfo]),
      );
      const merged = { ...current, ...patch };
      infoCacheRef.current = merged;
      return merged;
    });
  }, [kind]);

  const files = React.useMemo<CatalogFile[]>(() => {
    const merged = new Map<string, CatalogFile>();
    for (const item of items) {
      const path = normalizeCatalogPath(typeof item === 'string' ? item : item.path);
      if (!path) continue;
      const source = typeof item === 'string' ? undefined : item.source;
      const key = `${source || 'unspecified'}:${path.toLowerCase()}`;
      merged.set(key, { key, path, folder: getFolder(path), name: getFileLabel(path), source });
    }
    return Array.from(merged.values()).sort((a, b) => (
      a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true })
      || String(a.source || '').localeCompare(String(b.source || ''))
    ));
  }, [items]);

  const selectedFile = React.useMemo(
    () => files.find((file) => file.key === selection) || null,
    [files, selection],
  );
  const selectedPath = selectedFile?.path || '';

  const sourceCounts = React.useMemo(() => {
    const counts = new Map<PowerPrompterModelType, number>();
    for (const source of MODEL_SOURCE_ORDER) counts.set(source, 0);
    for (const file of files) {
      if (file.source) counts.set(file.source, (counts.get(file.source) || 0) + 1);
    }
    return counts;
  }, [files]);

  const availableSources = React.useMemo(
    () => MODEL_SOURCE_ORDER.filter((source) => (sourceCounts.get(source) || 0) > 0),
    [sourceCounts],
  );

  const sourceFiles = React.useMemo(
    () => kind === 'checkpoint' && activeSource
      ? files.filter((file) => file.source === activeSource)
      : files,
    [activeSource, files, kind],
  );

  const folders = React.useMemo(() => {
    const counts = new Map<string, number>();
    counts.set('', sourceFiles.length);
    for (const file of sourceFiles) {
      if (!file.folder) continue;
      const parts = file.folder.split('/');
      for (let index = 1; index <= parts.length; index += 1) {
        const path = parts.slice(0, index).join('/');
        counts.set(path, (counts.get(path) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([path, count]) => ({ path, count, label: path ? path.split('/').pop() || path : 'All' }))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true }));
  }, [sourceFiles]);

  const visibleFiles = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return sourceFiles.filter((file) => {
      if (folder && file.folder !== folder && !file.folder.startsWith(`${folder}/`)) return false;
      return !query || file.path.toLowerCase().includes(query);
    });
  }, [folder, search, sourceFiles]);

  React.useEffect(() => {
    if (!open) return;
    let disposed = false;
    void readUserConfig<Record<string, unknown>>('powerprompter-thumbnail-overrides', {})
      .then((value) => {
        if (!disposed) setThumbnailOverrides(normalizeThumbnailOverrides(value));
      });
    return () => {
      disposed = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const normalizedSelected = normalizeCatalogPath(selectedValue);
    const selectedAliases = new Set(getCatalogAliasKeys(normalizedSelected));
    const matchingFiles = files.filter((file) => (
      getCatalogAliasKeys(file.path).some((alias) => selectedAliases.has(alias))
    ));
    const matchedSelection = matchingFiles.find((file) => !selectedSource || file.source === selectedSource)
      || matchingFiles[0];
    const nextSource = kind === 'checkpoint'
      ? matchedSelection?.source || (selectedSource && availableSources.includes(selectedSource) ? selectedSource : availableSources[0])
      : undefined;
    setSelection(matchedSelection?.key || '');
    setActiveSource(nextSource);
    setSearch('');
    setFolder('');
    setInfo(null);
    setInfoError('');
  }, [availableSources, files, kind, open, selectedSource, selectedValue]);

  React.useEffect(() => {
    if (!open || kind !== 'checkpoint' || !activeSource) return;
    const selectedInSource = files.some((file) => file.key === selection && file.source === activeSource);
    if (selectedInSource) return;
    setSelection(files.find((file) => file.source === activeSource)?.key || '');
  }, [activeSource, files, kind, open, selection]);

  React.useEffect(() => {
    if (!open || !selectedFile || !onRequestInfo || (kind === 'checkpoint' && selectedFile.source && selectedFile.source !== 'checkpoint')) {
      setInfo(null);
      setInfoLoading(false);
      return;
    }
    let canceled = false;
    setInfoLoading(true);
    setInfoError('');
    void onRequestInfo(selectedPath)
      .then((nextInfo) => {
        if (!canceled) {
          setInfo(nextInfo);
          cacheInfo(selectedPath, nextInfo);
        }
      })
      .catch((error) => {
        if (!canceled) {
          setInfo(null);
          setInfoError(error instanceof Error ? error.message : 'Metadata is unavailable.');
        }
      })
      .finally(() => {
        if (!canceled) setInfoLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [cacheInfo, kind, onRequestInfo, open, selectedFile, selectedPath]);

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      setPreviewTick((current) => current + 1);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [open]);

  React.useEffect(() => {
    if (!open || !onRequestInfo) return;
    const targets = Array.from(new Set([
      ...visibleFiles
        .filter((file) => kind !== 'checkpoint' || !file.source || file.source === 'checkpoint')
        .slice(0, 24)
        .map((file) => file.path),
      ...(selectedFile && (kind !== 'checkpoint' || !selectedFile.source || selectedFile.source === 'checkpoint')
        ? [selectedFile.path]
        : []),
    ].map(normalizeCatalogPath).filter(Boolean)));
    if (targets.length <= 0) return;

    let canceled = false;
    const hydrate = async () => {
      for (const path of targets) {
        if (canceled) return;
        const pendingKey = getInfoCacheKey(kind, path.toLowerCase());
        if (findCachedInfo(infoCacheRef.current, kind, path)) continue;
        if (pendingPreviewInfoRef.current.has(pendingKey)) continue;
        pendingPreviewInfoRef.current.add(pendingKey);
        try {
          const nextInfo = await onRequestInfo(path, { previewOnly: true });
          if (!canceled) cacheInfo(path, nextInfo);
        } catch {
          // Preview metadata is optional; selection still works without it.
        } finally {
          pendingPreviewInfoRef.current.delete(pendingKey);
        }
      }
    };
    void hydrate();
    return () => {
      canceled = true;
    };
  }, [cacheInfo, kind, onRequestInfo, open, selectedFile, visibleFiles]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const title = titleOverride || (kind === 'checkpoint' ? 'Checkpoint Browser' : 'LoRA Browser');
  const displayedInfoMatches = infoMatchesPath(info, selectedPath);
  const selectedInfo = displayedInfoMatches ? info : findCachedInfo(infoCache, kind, selectedPath);
  const previewUrls = Array.from(new Set([
    ...findThumbnailOverrides(thumbnailOverrides, selectedPath),
    ...extractPreviewUrls(selectedInfo),
  ]));
  const selectedPreview = previewUrls.length > 0
    ? previewUrls[previewTick % previewUrls.length]
    : '';
  const remoteMode = getUmbraRemoteMode();
  const isPhoneRemote = remoteMode === 'phone';

  return (
    <div
      data-umbra-model-picker-backdrop
      className="fixed inset-0 z-[12200] flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        data-umbra-model-picker
        data-umbra-model-picker-kind={kind}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[min(78vh,780px)] min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-cyan-300/25 bg-[#05070a] shadow-2xl shadow-black/80 max-md:h-[calc(100dvh-1rem)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header data-umbra-model-picker-header className="flex min-h-14 items-center gap-3 border-b border-white/10 px-4">
          {kind === 'checkpoint' ? <Database size={15} className="text-cyan-300" /> : <Library size={15} className="text-emerald-300" />}
          <div className="min-w-0">
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-100">{title}</h2>
            <div className="font-mono text-[10px] text-zinc-500">{files.length} available through the ComfyUI catalog</div>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh?.()}
            disabled={!onRefresh || catalogLoading}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:border-cyan-300/30 hover:text-cyan-100 disabled:text-zinc-700"
          >
            <RefreshCw size={12} className={catalogLoading ? 'animate-spin' : ''} />
            <span data-umbra-model-picker-refresh-label>Refresh</span>
          </button>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:text-zinc-100" title="Close">
            <X size={14} />
          </button>
        </header>

        <div data-umbra-model-picker-filters className="border-b border-white/10 px-4 py-2">
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              autoFocus={shouldAutoFocusUmbraModelPickerSearch(remoteMode)}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder || `Search ${kind === 'checkpoint' ? 'checkpoints' : 'LoRAs'} by name or folder...`}
              className="h-10 w-full rounded-md border border-white/10 bg-black/40 pl-9 pr-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/45"
            />
          </label>
          {kind === 'checkpoint' ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {MODEL_SOURCE_ORDER.map((source) => {
                const count = sourceCounts.get(source) || 0;
                return (
                  <button
                    key={source}
                    type="button"
                    disabled={count <= 0}
                    onClick={() => {
                      setActiveSource(source);
                      setFolder('');
                    }}
                    className={cn(
                      'h-10 rounded-md border px-3 text-[10px] font-black uppercase tracking-[0.08em] transition-colors',
                      activeSource === source
                        ? 'border-cyan-300/45 bg-cyan-500/[0.12] text-cyan-100'
                        : 'border-white/10 bg-white/[0.025] text-zinc-500 hover:border-white/25 hover:text-zinc-200',
                      count <= 0 && 'cursor-not-allowed opacity-35',
                    )}
                  >
                    {MODEL_SOURCE_LABELS[source]} ({count})
                  </button>
                );
              })}
            </div>
          ) : null}
          </div>
          {kind === 'checkpoint' && activeSource ? (
            <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500" title="The selected catalog route is applied with the model">
              Route: {MODEL_SOURCE_LABELS[activeSource]} via ComfyUI catalog
            </div>
          ) : null}
        </div>

        <div data-umbra-model-picker-catalog className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] max-md:grid-cols-1 max-md:grid-rows-[128px_minmax(0,1fr)]">
          <aside data-umbra-model-picker-folders className="overflow-y-auto border-r border-white/10 p-2 custom-scrollbar max-md:border-b max-md:border-r-0">
            <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Folders</div>
            <div className="space-y-0.5">
              {folders.map((entry) => (
                <button
                  type="button"
                  key={entry.path || 'all'}
                  onClick={() => setFolder(entry.path)}
                  className={cn(
                    'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border px-2 text-left transition-colors',
                    folder === entry.path
                      ? 'border-cyan-300/30 bg-cyan-500/[0.1] text-cyan-100'
                      : 'border-transparent text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200',
                  )}
                  style={{ paddingLeft: `${8 + Math.min(3, entry.path.split('/').length - 1) * 8}px` }}
                >
                  <FolderOpen size={12} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{entry.label}</span>
                  <span className="font-mono text-[9px] text-zinc-500">{entry.count}</span>
                </button>
              ))}
            </div>
          </aside>

          <main data-umbra-model-picker-results className="min-h-0 overflow-y-auto p-3 custom-scrollbar">
            {visibleFiles.length <= 0 ? (
              <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.14em] text-zinc-700">No matching files</div>
            ) : (
              <div data-umbra-model-picker-grid className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                {visibleFiles.map((file) => {
                  const active = selection === file.key;
                  const cardInfo = active && displayedInfoMatches
                    ? info
                    : findCachedInfo(infoCache, kind, file.path);
                  const cardPreviews = Array.from(new Set([
                    ...findThumbnailOverrides(thumbnailOverrides, file.path),
                    ...extractPreviewUrls(cardInfo),
                  ]));
                  const activePreview = cardPreviews.length > 0
                    ? cardPreviews[previewTick % cardPreviews.length]
                    : '';
                  const cardInfoPending = pendingPreviewInfoRef.current.has(
                    getInfoCacheKey(kind, file.path.toLowerCase()),
                  );
                  return (
                    <button
                      data-umbra-model-picker-card
                      data-selected={active ? '1' : '0'}
                      type="button"
                      key={file.key}
                      onClick={() => setSelection(file.key)}
                      onDoubleClick={isPhoneRemote ? undefined : () => onConfirm(file.path, active && displayedInfoMatches ? info : null, file.source)}
                      className={cn(
                        'min-w-0 overflow-hidden rounded-lg border bg-black/30 text-left transition-colors',
                        active ? 'border-cyan-300/55 bg-cyan-500/[0.1]' : 'border-white/10 hover:border-white/25',
                      )}
                      title={file.path}
                    >
                      <div data-umbra-model-picker-preview className="relative flex h-36 items-center justify-center overflow-hidden border-b border-white/10 bg-black/45">
                        {activePreview ? (
                          renderPreviewMedia(activePreview, `${file.name} preview`, 'h-full w-full object-contain')
                        ) : (active && infoLoading) || cardInfoPending ? (
                          <Loader2 size={17} className="animate-spin text-cyan-300" />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 text-zinc-600">
                            <ImageIcon size={18} />
                            <span className="text-[9px] font-black uppercase tracking-[0.12em]">No Preview</span>
                          </div>
                        )}
                        {active ? <Check size={12} className="absolute right-2 top-2 text-cyan-200" /> : null}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-[11px] font-bold text-zinc-100">{file.name}</div>
                        <div className="mt-0.5 truncate font-mono text-[9px] text-zinc-500">{file.folder || 'Root'}</div>
                        <div className="mt-1 flex min-w-0 items-center gap-1">
                          {cardPreviews.length > 1 ? (
                            <span className="rounded-sm border border-cyan-300/25 bg-cyan-500/[0.08] px-1.5 py-0.5 font-mono text-[8px] text-cyan-100">
                              {cardPreviews.length} previews
                            </span>
                          ) : null}
                          <span className="truncate rounded-sm border border-white/10 bg-white/[0.025] px-1.5 py-0.5 font-mono text-[8px] text-zinc-500">
                            {file.source ? MODEL_SOURCE_LABELS[file.source] : kind === 'checkpoint' ? 'Model' : 'LoRA'}
                          </span>
                          {cardInfo?.trainedTags?.length ? (
                            <span className="ml-auto shrink-0 rounded-sm border border-emerald-300/20 bg-emerald-500/[0.06] px-1.5 py-0.5 font-mono text-[8px] text-emerald-100">
                              {cardInfo.trainedTags.length} tokens
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </main>
        </div>

        <footer data-umbra-model-picker-footer className="flex min-h-14 items-center gap-3 border-t border-white/10 px-4 max-md:flex-wrap max-md:py-2">
          <div data-umbra-model-picker-selection className="min-w-0 flex-1">
            <div className="truncate font-mono text-[10px] text-zinc-400">
              {selectedFile ? `Selected${selectedFile.source ? ` ${MODEL_SOURCE_LABELS[selectedFile.source]}` : ''}: ${selectedFile.path}` : 'Nothing selected'}
            </div>
            {infoError ? <div className="truncate text-[9px] text-amber-200/75">{infoError}</div> : null}
            {selectedFile && selectedPreview ? (
              <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-cyan-200/65">
                Preview {previewUrls.length > 1 ? `${(previewTick % previewUrls.length) + 1}/${previewUrls.length}` : 'ready'}
                {selectedInfo?.trainedTags?.length ? ` / ${selectedInfo.trainedTags.length} trained tokens` : ''}
              </div>
            ) : null}
          </div>
          <button data-umbra-model-picker-cancel type="button" onClick={onClose} className="h-10 rounded-md border border-white/10 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:text-zinc-100">Cancel</button>
          <button
            data-umbra-model-picker-confirm
            type="button"
            disabled={!selectedFile}
            onClick={() => selectedFile && onConfirm(selectedFile.path, displayedInfoMatches ? info : null, selectedFile.source)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-cyan-300/30 bg-cyan-500/[0.1] px-4 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 hover:bg-cyan-500/[0.16] disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-700"
          >
            <Check size={12} /> {confirmLabel || (kind === 'checkpoint' ? 'Use Checkpoint' : 'Add LoRA')}
          </button>
        </footer>
      </div>
    </div>
  );
}

export {
  extractPreviewUrls as extractUmbraModelPickerPreviewUrls,
  findThumbnailOverrides as findUmbraModelPickerThumbnailOverrides,
  getCatalogAliasKeys as getUmbraModelPickerCatalogAliasKeys,
  normalizeThumbnailOverrides as normalizeUmbraModelPickerThumbnailOverrides,
  infoMatchesPath as umbraModelPickerInfoMatchesPath,
};
