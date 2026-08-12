'use client';

import React from 'react';
import {
  CheckCircle2,
  Download,
  EyeOff,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Move,
  Stamp,
  Trash2,
  Upload,
  Video,
  XCircle,
} from 'lucide-react';
import { cn, buildFsImageUrl } from '@/lib/utils';
import {
  browseUmbraUiMediaToolsOutputFolder,
  browseUmbraUiMediaToolsSourceFiles,
  submitUmbraUiVideoToGif,
  submitUmbraUiImageCensor,
  submitUmbraUiWatermark,
  uploadUmbraUiWatermarkAsset,
  type UmbraUiMediaToolResult,
  type UmbraUiWatermarkAsset,
} from '@/lib/umbraUiMediaTools';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  runUmbraUiMediaBatch,
  type UmbraUiMediaBatchKind,
} from '@/lib/umbraUiMediaBatch';
import {
  normalizeUmbraUiMediaToolsHandoff,
  UMBRA_UI_MEDIA_TOOLS_HANDOFF_EVENT,
  UMBRA_UI_MEDIA_TOOLS_HANDOFF_KEY,
} from '@/lib/umbraUiMediaToolsHandoff';
import { useStore } from '@/store/useStore';
import {
  UmbraImageExportControls,
  type UmbraImageExportSettings,
} from '@/components/umbra-ui/UmbraImageExportControls';
import { UmbraExtrasPresetControl } from '@/components/umbra-ui/UmbraExtrasPresetControl';

export type UmbraExtrasMediaToolMode = 'censor' | 'watermark' | 'video-watermark' | 'gif';

type BatchItemStatus = 'staged' | 'running' | 'completed' | 'failed';

interface StagedMediaItem {
  id: string;
  name: string;
  kind: UmbraUiMediaBatchKind;
  path?: string;
  file?: File;
  previewUrl?: string;
  status: BatchItemStatus;
  result?: UmbraUiMediaToolResult;
  error?: string;
}

const controlClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500';
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|bmp|jpe?g|png|tiff?|webp)$/i;
const VIDEO_EXTENSION_PATTERN = /\.(?:avi|m4v|mkv|mov|mp4|webm|wmv)$/i;
const OUTPUT_FOLDER_STORAGE_KEY = 'umbra-ui:extras-media-tools-output-folder-v2';
const WATERMARK_EXPORT_SETTINGS_KEY = 'umbra-ui:watermark-export-settings';
const VIDEO_WATERMARK_WIDTH_KEY = 'umbra-ui:video-watermark-output-width';

type CensorTarget = 'femaleNipples' | 'maleGenitals' | 'femaleGenitals';

const CENSOR_TARGETS: Array<{ id: CensorTarget; label: string }> = [
  { id: 'femaleNipples', label: 'Female Nipples' },
  { id: 'maleGenitals', label: 'Male Genitals' },
  { id: 'femaleGenitals', label: 'Female Genitals' },
];

const ANCHORS = [
  { x: 0, y: 0, title: 'Top left' },
  { x: 0.5, y: 0, title: 'Top center' },
  { x: 1, y: 0, title: 'Top right' },
  { x: 0, y: 0.5, title: 'Center left' },
  { x: 0.5, y: 0.5, title: 'Center' },
  { x: 1, y: 0.5, title: 'Center right' },
  { x: 0, y: 1, title: 'Bottom left' },
  { x: 0.5, y: 1, title: 'Bottom center' },
  { x: 1, y: 1, title: 'Bottom right' },
] as const;

function createId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
}

function mediaKind(name: string): UmbraUiMediaBatchKind | null {
  if (VIDEO_EXTENSION_PATTERN.test(name)) return 'video';
  if (IMAGE_EXTENSION_PATTERN.test(name)) return 'image';
  return null;
}

function useFilePreview(file: File | null): string {
  const [url, setUrl] = React.useState('');
  React.useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function itemPreviewUrl(item: StagedMediaItem | undefined): string {
  if (item?.previewUrl) return item.previewUrl;
  if (!item?.path) return '';
  return `/api/fs/image?${new URLSearchParams({ path: item.path }).toString()}`;
}

function useOutputFolder(scope: UmbraExtrasMediaToolMode) {
  const showToast = useStore((state) => state.showToast);
  const storageKey = `${OUTPUT_FOLDER_STORAGE_KEY}:${scope}`;
  const [outputFolder, setOutputFolder] = React.useState(() => {
    if (typeof window === 'undefined') return '';
    try { return window.localStorage.getItem(storageKey) || window.localStorage.getItem(OUTPUT_FOLDER_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [browsing, setBrowsing] = React.useState(false);
  React.useEffect(() => {
    try { window.localStorage.setItem(storageKey, outputFolder); } catch { /* best effort */ }
  }, [outputFolder, storageKey]);
  const browse = React.useCallback(async () => {
    if (browsing) return;
    setBrowsing(true);
    try {
      const next = await browseUmbraUiMediaToolsOutputFolder(outputFolder);
      if (next) setOutputFolder(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to select an output destination.', 'error');
    } finally {
      setBrowsing(false);
    }
  }, [browsing, outputFolder, showToast]);
  return { outputFolder, setOutputFolder, browsing, browse };
}

function useStagedMedia(mode: UmbraExtrasMediaToolMode) {
  const targetKind: UmbraUiMediaBatchKind = mode === 'watermark' || mode === 'censor' ? 'image' : 'video';
  const [items, setItems] = React.useState<StagedMediaItem[]>([]);
  const addPaths = React.useCallback((paths: string[], previewUrls: Record<string, string> = {}) => {
    setItems((current) => {
      const seen = new Set(current.map((item) => String(item.path || item.file?.name || '').toLowerCase()));
      const additions = paths.flatMap((path) => {
        const kind = mediaKind(path);
        const key = path.toLowerCase();
        if (!kind || kind !== targetKind || seen.has(key)) return [];
        seen.add(key);
        return [{ id: createId(), name: path.replace(/\\/g, '/').split('/').pop() || path, path, previewUrl: previewUrls[path], kind, status: 'staged' as const }];
      });
      return [...current, ...additions];
    });
  }, [targetKind]);
  const addFiles = React.useCallback((files: File[]) => {
    setItems((current) => {
      const seen = new Set(current.map((item) => String(item.path || item.file?.name || '').toLowerCase()));
      const additions = files.flatMap((file) => {
        const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : mediaKind(file.name);
        const key = `${file.name}:${file.size}:${file.lastModified}`.toLowerCase();
        if (!kind || kind !== targetKind || seen.has(key)) return [];
        seen.add(key);
        return [{ id: createId(), name: file.webkitRelativePath || file.name, file, kind, status: 'staged' as const }];
      });
      return [...current, ...additions];
    });
  }, [targetKind]);
  React.useEffect(() => {
    const consume = (raw: unknown) => {
      const handoff = normalizeUmbraUiMediaToolsHandoff(raw);
      if (!handoff || handoff.mode !== mode) return;
      addPaths(handoff.paths, handoff.previewUrls);
      try { window.sessionStorage.removeItem(UMBRA_UI_MEDIA_TOOLS_HANDOFF_KEY); } catch { /* best effort */ }
    };
    try { consume(JSON.parse(window.sessionStorage.getItem(UMBRA_UI_MEDIA_TOOLS_HANDOFF_KEY) || 'null')); } catch { /* best effort */ }
    const onHandoff = (event: Event) => consume((event as CustomEvent).detail);
    window.addEventListener(UMBRA_UI_MEDIA_TOOLS_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(UMBRA_UI_MEDIA_TOOLS_HANDOFF_EVENT, onHandoff);
  }, [addPaths, mode]);
  return { items, setItems, addFiles, addPaths };
}

function SourceBatchList({
  items,
  disabled,
  onSelect,
  onRemove,
  onClear,
}: {
  items: StagedMediaItem[];
  disabled: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const images = items.filter((item) => item.kind === 'image').length;
  const videos = items.length - images;
  return (
    <div className="rounded-md border border-white/10 bg-black/25">
      <div className="flex min-h-9 items-center gap-2 border-b border-white/10 px-2.5">
        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">Staged Batch</span>
        <span className="font-mono text-[8px] text-zinc-600">{images} image{images === 1 ? '' : 's'} · {videos} video{videos === 1 ? '' : 's'}</span>
        <button type="button" disabled={disabled || items.length === 0} onClick={onClear} className="ml-auto inline-flex h-7 items-center gap-1 rounded border border-white/10 px-2 text-[8px] font-black uppercase text-zinc-500 hover:text-red-200 disabled:opacity-30">
          <Trash2 size={10} /> Clear
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto custom-scrollbar">
        {items.slice(0, 150).map((item) => (
          <button key={item.id} type="button" title={item.error || item.name} onClick={() => onSelect(item.id)} className="flex min-h-8 w-full items-center gap-2 border-b border-white/[0.05] px-2.5 text-left last:border-b-0 hover:bg-white/[0.035]">
            {item.status === 'running' ? <Loader2 size={11} className="animate-spin text-cyan-300" /> : item.status === 'completed' ? <CheckCircle2 size={11} className="text-emerald-300" /> : item.status === 'failed' ? <XCircle size={11} className="text-red-300" /> : item.kind === 'video' ? <Video size={11} className="text-amber-300" /> : <ImageIcon size={11} className="text-cyan-300" />}
            <span className="min-w-0 flex-1 truncate font-mono text-[8px] text-zinc-400">{item.name}</span>
            <span className="text-[7px] font-black uppercase text-zinc-700">{item.status}</span>
            {!disabled ? <span onClick={(event) => { event.stopPropagation(); onRemove(item.id); }} className="text-zinc-700 hover:text-red-300"><XCircle size={11} /></span> : null}
          </button>
        ))}
        {items.length > 150 ? <div className="px-2.5 py-2 font-mono text-[8px] text-zinc-600">+{items.length - 150} more staged</div> : null}
        {items.length === 0 ? <div className="px-3 py-4 text-center text-[9px] uppercase tracking-[0.12em] text-zinc-700">No media staged</div> : null}
      </div>
    </div>
  );
}

function OutputDestination({
  value,
  onChange,
  browsing,
  onBrowse,
  automaticSubfolder,
}: {
  value: string;
  onChange: (value: string) => void;
  browsing: boolean;
  onBrowse: () => void;
  automaticSubfolder: 'Censored' | 'Watermarked' | 'GIF';
}) {
  return (
    <div>
      <div className={cn(labelClass, 'mb-1.5 flex items-center justify-between')}>
        <span>Output Destination</span>
        {!value ? <span className="text-emerald-300/70">Automatic by source</span> : null}
      </div>
      <div className="flex gap-2">
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`[Source Folder]/${automaticSubfolder}`} className={controlClass} />
        <button type="button" onClick={onBrowse} disabled={browsing} title="Choose output folder" className="inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-cyan-300/30 hover:text-cyan-100 disabled:opacity-40">
          {browsing ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
        </button>
        <button type="button" onClick={() => onChange('')} disabled={!value || browsing} title={`Use automatic ${automaticSubfolder} subfolders`} className="inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:border-emerald-300/30 hover:text-emerald-200 disabled:opacity-25">
          <XCircle size={13} />
        </button>
      </div>
    </div>
  );
}

function BatchSummary({ completed, failed, total }: { completed: number; failed: number; total: number }) {
  if (completed + failed === 0) return null;
  return (
    <div className="rounded-md border border-emerald-300/15 bg-emerald-500/[0.035] px-2.5 py-2 font-mono text-[8px] uppercase text-zinc-500">
      {completed} completed · {failed} failed · {total} total
    </div>
  );
}

function WatermarkTool({ targetKind }: { targetKind: 'image' | 'video' }) {
  const showToast = useStore((state) => state.showToast);
  const mode: UmbraExtrasMediaToolMode = targetKind === 'video' ? 'video-watermark' : 'watermark';
  const videoMode = targetKind === 'video';
  const { items, setItems, addFiles, addPaths } = useStagedMedia(mode);
  const { outputFolder, setOutputFolder, browsing, browse } = useOutputFolder(mode);
  const [selectedId, setSelectedId] = React.useState('');
  const [watermark, setWatermark] = React.useState<File | null>(null);
  const [watermarkAsset, setWatermarkAsset] = React.useState<UmbraUiWatermarkAsset | null>(null);
  const [watermarkUploading, setWatermarkUploading] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 1, y: 1 });
  const [scale, setScale] = React.useState(0.2);
  const [opacity, setOpacity] = React.useState(0.7);
  const [videoOutputWidth, setVideoOutputWidth] = React.useState(() => {
    try { return Math.max(64, Math.min(7680, Number(window.localStorage.getItem(VIDEO_WATERMARK_WIDTH_KEY)) || 1920)); } catch { return 1920; }
  });
  const [exportSettings, setExportSettings] = React.useState<UmbraImageExportSettings>(() => {
    const fallback: UmbraImageExportSettings = { resizeEnabled: false, longEdge: 1024, format: 'png', quality: 90 };
    try { return { ...fallback, ...JSON.parse(window.localStorage.getItem(WATERMARK_EXPORT_SETTINGS_KEY) || '{}') }; } catch { return fallback; }
  });
  const [dimensions, setDimensions] = React.useState({ width: 16, height: 9 });
  const [watermarkDimensions, setWatermarkDimensions] = React.useState({ width: 1, height: 1 });
  const [previewViewport, setPreviewViewport] = React.useState({ width: 0, height: 0 });
  const [processing, setProcessing] = React.useState(false);
  const [browsingSources, setBrowsingSources] = React.useState(false);
  const [summary, setSummary] = React.useState({ completed: 0, failed: 0, total: 0 });
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const sourceInputRef = React.useRef<HTMLInputElement | null>(null);
  const watermarkInputRef = React.useRef<HTMLInputElement | null>(null);
  const previewViewportRef = React.useRef<HTMLDivElement | null>(null);
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const watermarkRef = React.useRef<HTMLImageElement | null>(null);
  const draggingRef = React.useRef(false);
  const remoteClient = isUmbraRemoteClient();
  const selected = items.find((item) => item.id === selectedId) || items[0];
  const localSourceUrl = useFilePreview(selected?.file || null);
  const sourceUrl = localSourceUrl || itemPreviewUrl(selected);
  const localWatermarkUrl = useFilePreview(watermark);
  const watermarkUrl = localWatermarkUrl || watermarkAsset?.previewUrl || '';
  const outputDimensions = React.useMemo(() => {
    if (!exportSettings.resizeEnabled) return dimensions;
    const ratio = exportSettings.longEdge / Math.max(dimensions.width, dimensions.height);
    return {
      width: Math.max(1, Math.round(dimensions.width * ratio)),
      height: Math.max(1, Math.round(dimensions.height * ratio)),
    };
  }, [dimensions, exportSettings.longEdge, exportSettings.resizeEnabled]);
  const previewDimensions = React.useMemo(() => {
    const availableWidth = Math.max(1, previewViewport.width);
    const availableHeight = Math.max(1, previewViewport.height);
    const sourceRatio = Math.max(1, dimensions.width) / Math.max(1, dimensions.height);
    let width = availableWidth;
    let height = width / sourceRatio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * sourceRatio;
    }
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }, [dimensions.height, dimensions.width, previewViewport.height, previewViewport.width]);
  const watermarkPreviewDimensions = React.useMemo(() => {
    const aspect = Math.max(1, watermarkDimensions.width) / Math.max(1, watermarkDimensions.height);
    let width = previewDimensions.width * scale;
    let height = width / aspect;
    if (height > previewDimensions.height) {
      height = previewDimensions.height;
      width = height * aspect;
    }
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }, [previewDimensions.height, previewDimensions.width, scale, watermarkDimensions.height, watermarkDimensions.width]);
  const watermarkPresetExtra = React.useMemo<Record<string, unknown>>(() => ({
    watermarkAsset,
    position,
    scale,
    opacity,
    outputFolder,
    ...(videoMode ? { outputWidth: videoOutputWidth } : {}),
  }), [opacity, outputFolder, position, scale, videoMode, videoOutputWidth, watermarkAsset]);

  React.useEffect(() => {
    try { window.localStorage.setItem(WATERMARK_EXPORT_SETTINGS_KEY, JSON.stringify(exportSettings)); } catch { /* best effort */ }
  }, [exportSettings]);

  React.useEffect(() => {
    if (!videoMode) return;
    try { window.localStorage.setItem(VIDEO_WATERMARK_WIDTH_KEY, String(videoOutputWidth)); } catch { /* best effort */ }
  }, [videoMode, videoOutputWidth]);

  React.useEffect(() => setPreviewFailed(false), [selected?.id, sourceUrl]);

  React.useLayoutEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;
    const update = () => {
      const rect = viewport.getBoundingClientRect();
      setPreviewViewport({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const chooseWatermark = React.useCallback(async (file: File | null) => {
    if (!file) return;
    setWatermark(file);
    setWatermarkAsset(null);
    setWatermarkUploading(true);
    try {
      setWatermarkAsset(await uploadUmbraUiWatermarkAsset(file));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save the watermark for presets.', 'error');
    } finally {
      setWatermarkUploading(false);
    }
  }, [showToast]);

  const applyWatermarkPresetExtra = React.useCallback((value: Record<string, unknown>) => {
    const rawAsset = value.watermarkAsset && typeof value.watermarkAsset === 'object'
      ? value.watermarkAsset as Record<string, unknown>
      : null;
    const path = String(rawAsset?.path || '').trim();
    if (path) {
      setWatermark(null);
      setWatermarkAsset({
        path,
        filename: String(rawAsset?.filename || path.replace(/\\/g, '/').split('/').pop() || 'Watermark'),
        previewUrl: String(rawAsset?.previewUrl || `/api/fs/image?${new URLSearchParams({ path }).toString()}`),
      });
    }
    const rawPosition = value.position && typeof value.position === 'object'
      ? value.position as Record<string, unknown>
      : {};
    setPosition({
      x: Math.max(0, Math.min(1, Number(rawPosition.x) || 0)),
      y: Math.max(0, Math.min(1, Number(rawPosition.y) || 0)),
    });
    setScale(Math.max(0.03, Math.min(0.75, Number(value.scale) || 0.2)));
    setOpacity(Math.max(0.05, Math.min(1, Number(value.opacity) || 0.7)));
    setOutputFolder(String(value.outputFolder || '').trim());
    if (videoMode) setVideoOutputWidth(Math.max(64, Math.min(7680, Number(value.outputWidth) || 1920)));
  }, [setOutputFolder, videoMode]);

  const chooseSources = React.useCallback(async () => {
    if (remoteClient) {
      sourceInputRef.current?.click();
      return;
    }
    if (browsingSources) return;
    setBrowsingSources(true);
    try {
      addPaths(await browseUmbraUiMediaToolsSourceFiles(targetKind, selected?.path || outputFolder));
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Failed to select source ${targetKind === 'video' ? 'videos' : 'images'}.`, 'error');
    } finally {
      setBrowsingSources(false);
    }
  }, [addPaths, browsingSources, outputFolder, remoteClient, selected?.path, showToast, targetKind]);

  React.useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].id);
    if (selectedId && !items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id || '');
  }, [items, selectedId]);

  const updatePositionFromPointer = React.useCallback((clientX: number, clientY: number) => {
    const preview = previewRef.current;
    const overlay = watermarkRef.current;
    if (!preview || !overlay) return;
    const previewRect = preview.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    setPosition({
      x: Math.max(0, Math.min(1, (clientX - previewRect.left - overlayRect.width / 2) / Math.max(1, previewRect.width - overlayRect.width))),
      y: Math.max(0, Math.min(1, (clientY - previewRect.top - overlayRect.height / 2) / Math.max(1, previewRect.height - overlayRect.height))),
    });
  }, []);

  const run = React.useCallback(async () => {
    if (processing || items.length === 0 || (!watermark && !watermarkAsset)) return;
    setProcessing(true);
    setSummary({ completed: 0, failed: 0, total: items.length });
    setItems((current) => current.map((item) => ({ ...item, status: 'staged', error: undefined, result: undefined })));
    const imageSequence = new Map(items.filter((item) => item.kind === 'image').map((item, index) => [item.id, index + 1]));
    const videoSequence = new Map(items.filter((item) => item.kind === 'video').map((item, index) => [item.id, index + 1]));
    const result = await runUmbraUiMediaBatch({
      items,
      onItemStart: (item) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'running' } : entry)),
      runItem: async (item) => {
        const next = await submitUmbraUiWatermark({
          source: item.file,
          sourcePath: item.path,
          watermark: watermarkAsset ? undefined : watermark || undefined,
          watermarkPath: watermarkAsset?.path,
          outputFolder: outputFolder.trim(),
          sequenceNumber: item.kind === 'video' ? videoSequence.get(item.id) || 1 : imageSequence.get(item.id) || 1,
          x: position.x,
          y: position.y,
          scale,
          opacity,
          resizeEnabled: item.kind === 'image' && exportSettings.resizeEnabled,
          longEdge: exportSettings.longEdge,
          imageFormat: exportSettings.format,
          quality: exportSettings.quality,
          outputWidth: videoMode ? videoOutputWidth : 0,
        });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, result: next } : entry));
      },
      onItemSettled: (item, error) => {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: error ? 'failed' : 'completed', error: error instanceof Error ? error.message : error ? String(error) : undefined } : entry));
        setSummary((current) => ({ ...current, completed: current.completed + (error ? 0 : 1), failed: current.failed + (error ? 1 : 0) }));
      },
    });
    setProcessing(false);
    window.dispatchEvent(new CustomEvent('umbra:umbra-ui-output-refresh'));
    showToast(result.failed ? `${result.completed} watermark${result.completed === 1 ? '' : 's'} completed; ${result.failed} failed.` : `${result.completed} watermark${result.completed === 1 ? '' : 's'} completed.`, result.failed ? 'error' : 'success');
  }, [exportSettings, items, opacity, outputFolder, position.x, position.y, processing, scale, setItems, showToast, videoMode, videoOutputWidth, watermark, watermarkAsset]);

  return (
    <div data-umbra-ui-watermark-tool="" className="grid min-h-0 flex-1 grid-cols-[minmax(300px,360px)_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:overflow-y-auto">
      <section data-umbra-ui-media-tool-controls="" className="min-h-0 overflow-y-auto border-r border-white/10 bg-black/15 p-3 custom-scrollbar max-[900px]:overflow-visible max-[900px]:border-b max-[900px]:border-r-0">
        <div className="mb-3 flex items-center gap-2">{videoMode ? <Video size={13} className="text-amber-300" /> : <Stamp size={13} className="text-cyan-300" />}<h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300">{videoMode ? 'Video Watermark Batch' : 'Image Watermark Batch'}</h2><span className="ml-auto font-mono text-[8px] uppercase text-zinc-600">{videoMode ? '1 video at a time' : '25 images at a time'}</span></div>
        <input ref={sourceInputRef} type="file" multiple accept={videoMode ? 'video/mp4,video/webm,video/quicktime,video/x-matroska,.avi,.m4v,.mkv,.mov,.mp4,.webm,.wmv' : 'image/png,image/jpeg,image/webp,image/avif,image/bmp,image/tiff'} className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files || [])); setSummary({ completed: 0, failed: 0, total: 0 }); event.currentTarget.value = ''; }} />
        <input ref={watermarkInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/tiff" className="hidden" onChange={(event) => { const file = event.target.files?.[0] || null; event.currentTarget.value = ''; void chooseWatermark(file); }} />
        <div className="space-y-3">
          <button type="button" disabled={processing || browsingSources} onClick={() => void chooseSources()} className="flex min-h-11 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 text-left hover:border-cyan-300/30 disabled:opacity-40">{browsingSources ? <Loader2 size={14} className="animate-spin text-cyan-300" /> : <Upload size={14} className="text-cyan-300" />}<span className="flex-1 text-[9px] font-black uppercase tracking-[0.13em] text-zinc-300">{videoMode ? 'Add Videos' : 'Add Images'}</span></button>
          <SourceBatchList items={items} disabled={processing} onSelect={setSelectedId} onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))} onClear={() => { setItems([]); setSummary({ completed: 0, failed: 0, total: 0 }); }} />
          <button type="button" disabled={processing || watermarkUploading} onClick={() => watermarkInputRef.current?.click()} className="flex min-h-11 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 text-left hover:border-emerald-300/30 disabled:opacity-40">{watermarkUploading ? <Loader2 size={14} className="animate-spin text-emerald-300" /> : <Stamp size={14} className="text-emerald-300" />}<span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.13em] text-zinc-300">Watermark</span><span className="block truncate font-mono text-[8px] text-zinc-600">{watermarkUploading ? 'Saving to watermark library...' : watermarkAsset?.filename || watermark?.name || 'Choose a logo or mark'}</span></span></button>
          <OutputDestination value={outputFolder} onChange={setOutputFolder} browsing={browsing} onBrowse={() => void browse()} automaticSubfolder="Watermarked" />
          {videoMode ? <>
            <UmbraExtrasPresetControl
              scope="video-watermark"
              label="Video Watermark Preset"
              value={watermarkPresetExtra}
              onApply={applyWatermarkPresetExtra}
              saveDisabled={!watermarkAsset || watermarkUploading}
            />
            <label className="block space-y-1.5">
              <span className={labelClass}>Output Width</span>
              <input type="number" min={64} max={7680} step={2} value={videoOutputWidth} onChange={(event) => setVideoOutputWidth(Math.max(64, Math.min(7680, Number(event.target.value) || 64)))} className={controlClass} />
            </label>
            <div className="rounded-md border border-amber-300/15 bg-amber-500/[0.04] px-2.5 py-2 font-mono text-[8px] uppercase text-zinc-500">Full source duration · Original frame timing and audio · {videoOutputWidth}px wide</div>
          </> : <UmbraImageExportControls
              value={exportSettings}
              onChange={setExportSettings}
              presetScope="watermark"
              presetLabel="Image Watermark Preset"
              presetExtra={watermarkPresetExtra}
              onPresetExtraChange={applyWatermarkPresetExtra}
              presetSaveDisabled={!watermarkAsset || watermarkUploading}
            />}
          <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-t border-white/10 pt-3">
            <div><div className={cn(labelClass, 'mb-1.5')}>Anchor</div><div className="grid aspect-square grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/30 p-1.5">{ANCHORS.map((anchor) => <button key={anchor.title} type="button" title={anchor.title} onClick={() => setPosition({ x: anchor.x, y: anchor.y })} className={cn('flex items-center justify-center rounded-sm border', Math.abs(position.x - anchor.x) < 0.01 && Math.abs(position.y - anchor.y) < 0.01 ? 'border-cyan-300/55 bg-cyan-500/[0.14] text-cyan-200' : 'border-white/[0.06] text-zinc-700')}><span className="h-1.5 w-1.5 rounded-full bg-current" /></button>)}</div></div>
            <div className="space-y-4"><label className="block space-y-1.5"><span className="flex justify-between"><span className={labelClass}>Size</span><span className="font-mono text-[9px] text-cyan-200">{Math.round(scale * 100)}%</span></span><input type="range" min={0.03} max={0.75} step={0.01} value={scale} onChange={(event) => setScale(Number(event.target.value))} className="w-full accent-cyan-300" /></label><label className="block space-y-1.5"><span className="flex justify-between"><span className={labelClass}>Opacity</span><span className="font-mono text-[9px] text-cyan-200">{Math.round(opacity * 100)}%</span></span><input type="range" min={0.05} max={1} step={0.01} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} className="w-full accent-cyan-300" /></label></div>
          </div>
          <button type="button" onClick={() => void run()} disabled={items.length === 0 || (!watermark && !watermarkAsset) || watermarkUploading || processing} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-500/[0.1] text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600">{processing ? <Loader2 size={13} className="animate-spin" /> : videoMode ? <Video size={13} /> : <Stamp size={13} />}{processing ? `Processing ${summary.completed + summary.failed}/${summary.total}` : videoMode ? 'Run Video Watermark Batch' : 'Run Image Watermark Batch'}</button>
          <BatchSummary {...summary} />
        </div>
      </section>
      <main data-umbra-ui-media-tool-preview="" className="flex min-h-0 min-w-0 flex-col bg-black/20">
        <div className="flex min-h-10 items-center gap-2 border-b border-white/10 px-3"><Move size={13} className="text-zinc-500" /><span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Placement Preview</span>{videoMode ? <span className="font-mono text-[8px] text-amber-300/70">{videoOutputWidth}px wide · original timing</span> : selected?.kind === 'image' ? <span className="font-mono text-[8px] text-cyan-300/70">{outputDimensions.width} x {outputDimensions.height} · {exportSettings.format.toUpperCase()}</span> : null}<span className="ml-auto max-w-[45%] truncate font-mono text-[8px] text-zinc-600">{selected?.name || 'No source selected'}</span></div>
        <div className="min-h-[320px] flex-1 overflow-hidden p-4 max-[900px]:min-h-[280px]">
          <div ref={previewViewportRef} data-umbra-watermark-preview-viewport="" className="flex h-full min-h-[288px] w-full items-center justify-center max-[900px]:min-h-[248px]">
            {sourceUrl && !previewFailed ? <div ref={previewRef} data-umbra-watermark-preview="" className="relative shrink-0 cursor-crosshair touch-none overflow-hidden bg-black shadow-2xl" style={{ width: `${previewDimensions.width}px`, height: `${previewDimensions.height}px` }} onPointerDown={(event) => { if (!watermarkUrl) return; draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); updatePositionFromPointer(event.clientX, event.clientY); }} onPointerMove={(event) => { if (draggingRef.current) updatePositionFromPointer(event.clientX, event.clientY); }} onPointerUp={(event) => { draggingRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { draggingRef.current = false; }}>
              {selected?.kind === 'video' ? <video src={sourceUrl} muted loop autoPlay playsInline className="pointer-events-none absolute inset-0 h-full w-full object-fill" onError={() => setPreviewFailed(true)} onLoadedMetadata={(event) => setDimensions({ width: event.currentTarget.videoWidth || 16, height: event.currentTarget.videoHeight || 9 })} /> : <img src={sourceUrl} alt="Watermark source preview" className="pointer-events-none absolute inset-0 h-full w-full object-fill" onError={() => setPreviewFailed(true)} onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth || 16, height: event.currentTarget.naturalHeight || 9 })} />}
              {watermarkUrl ? <img ref={watermarkRef} src={watermarkUrl} alt="Watermark placement" draggable={false} className="pointer-events-none absolute select-none object-fill drop-shadow-lg" onLoad={(event) => setWatermarkDimensions({ width: event.currentTarget.naturalWidth || 1, height: event.currentTarget.naturalHeight || 1 })} style={{ width: `${watermarkPreviewDimensions.width}px`, height: `${watermarkPreviewDimensions.height}px`, left: `${position.x * 100}%`, top: `${position.y * 100}%`, transform: `translate(-${position.x * 100}%, -${position.y * 100}%)`, opacity }} /> : null}
            </div> : <div className="max-w-sm text-center text-zinc-700"><Stamp size={34} className="mx-auto mb-3" /><div className="text-[10px] font-black uppercase tracking-[0.16em]">{previewFailed ? 'Source preview unavailable' : 'Stage media to preview'}</div>{previewFailed ? <div className="mt-2 text-[9px] leading-relaxed text-zinc-600">This Gallery file is not present in the current Umbra Studio build. Choose an available source to preview and process it.</div> : null}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}

function ImageCensorTool() {
  const showToast = useStore((state) => state.showToast);
  const { items, setItems, addFiles, addPaths } = useStagedMedia('censor');
  const { outputFolder, setOutputFolder, browsing, browse } = useOutputFolder('censor');
  const [selectedId, setSelectedId] = React.useState('');
  const [censorMode, setCensorMode] = React.useState<'mosaic' | 'overlay'>('mosaic');
  const [regionMode, setRegionMode] = React.useState<'manual' | 'detect'>('detect');
  const [censorTargets, setCensorTargets] = React.useState<Record<CensorTarget, boolean>>({
    femaleNipples: true,
    maleGenitals: true,
    femaleGenitals: true,
  });
  const [detectionThreshold, setDetectionThreshold] = React.useState(0.278);
  const [detectionPadding, setDetectionPadding] = React.useState(0.12);
  const [overlay, setOverlay] = React.useState<File | null>(null);
  const [overlayAsset, setOverlayAsset] = React.useState<UmbraUiWatermarkAsset | null>(null);
  const [overlayUploading, setOverlayUploading] = React.useState(false);
  const [region, setRegion] = React.useState({ x: 0.325, y: 0.68, width: 0.35, height: 0.18 });
  const [mosaicSize, setMosaicSize] = React.useState(24);
  const [exportSettings, setExportSettings] = React.useState<UmbraImageExportSettings>({ resizeEnabled: false, longEdge: 1024, format: 'png', quality: 90 });
  const [processing, setProcessing] = React.useState(false);
  const [browsingSources, setBrowsingSources] = React.useState(false);
  const [summary, setSummary] = React.useState({ completed: 0, failed: 0, total: 0 });
  const [dimensions, setDimensions] = React.useState({ width: 4, height: 3 });
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const sourceInputRef = React.useRef<HTMLInputElement | null>(null);
  const overlayInputRef = React.useRef<HTMLInputElement | null>(null);
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ kind: 'move' | 'resize'; x: number; y: number; region: typeof region } | null>(null);
  const remoteClient = isUmbraRemoteClient();
  const selected = items.find((item) => item.id === selectedId) || items[0];
  const localSourceUrl = useFilePreview(selected?.file || null);
  const sourceUrl = localSourceUrl || itemPreviewUrl(selected);
  const localOverlayUrl = useFilePreview(overlay);
  const overlayUrl = localOverlayUrl || overlayAsset?.previewUrl || '';

  React.useEffect(() => {
    if (!selectedId && items[0]) setSelectedId(items[0].id);
    if (selectedId && !items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id || '');
  }, [items, selectedId]);
  React.useEffect(() => setPreviewFailed(false), [sourceUrl]);

  const updateRegion = React.useCallback((next: Partial<typeof region>) => {
    setRegion((current) => {
      const width = Math.max(0.03, Math.min(1, Number(next.width ?? current.width) || current.width));
      const height = Math.max(0.03, Math.min(1, Number(next.height ?? current.height) || current.height));
      return {
        x: Math.max(0, Math.min(1 - width, Number(next.x ?? current.x) || 0)),
        y: Math.max(0, Math.min(1 - height, Number(next.y ?? current.y) || 0)),
        width,
        height,
      };
    });
  }, []);
  const chooseOverlay = React.useCallback(async (file: File | null) => {
    if (!file) return;
    setOverlay(file);
    setOverlayAsset(null);
    setOverlayUploading(true);
    try {
      setOverlayAsset(await uploadUmbraUiWatermarkAsset(file));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save the censor overlay for presets.', 'error');
    } finally {
      setOverlayUploading(false);
    }
  }, [showToast]);
  const selectedTargets = React.useMemo(
    () => CENSOR_TARGETS.filter((target) => censorTargets[target.id]).map((target) => target.id),
    [censorTargets],
  );
  const presetExtra = React.useMemo<Record<string, unknown>>(() => ({
    censorMode,
    regionMode,
    censorTargets,
    detectionThreshold,
    detectionPadding,
    overlayAsset,
    region,
    mosaicSize,
    outputFolder,
  }), [censorMode, censorTargets, detectionPadding, detectionThreshold, mosaicSize, outputFolder, overlayAsset, region, regionMode]);
  const applyPreset = React.useCallback((value: Record<string, unknown>) => {
    setCensorMode(value.censorMode === 'overlay' ? 'overlay' : 'mosaic');
    setRegionMode(value.regionMode === 'manual' ? 'manual' : 'detect');
    const rawTargets = value.censorTargets && typeof value.censorTargets === 'object'
      ? value.censorTargets as Record<string, unknown>
      : {};
    setCensorTargets({
      femaleNipples: rawTargets.femaleNipples !== false,
      maleGenitals: rawTargets.maleGenitals !== false,
      femaleGenitals: rawTargets.femaleGenitals !== false,
    });
    setDetectionThreshold(Math.max(0.05, Math.min(0.95, Number(value.detectionThreshold) || 0.278)));
    setDetectionPadding(Math.max(0, Math.min(0.5, Number(value.detectionPadding) || 0.12)));
    const rawRegion = value.region && typeof value.region === 'object' ? value.region as Record<string, unknown> : {};
    updateRegion({ x: Number(rawRegion.x), y: Number(rawRegion.y), width: Number(rawRegion.width), height: Number(rawRegion.height) });
    setMosaicSize(Math.max(2, Math.min(160, Math.round(Number(value.mosaicSize) || 24))));
    setOutputFolder(String(value.outputFolder || '').trim());
    const rawAsset = value.overlayAsset && typeof value.overlayAsset === 'object' ? value.overlayAsset as Record<string, unknown> : null;
    const path = String(rawAsset?.path || '').trim();
    if (path) {
      setOverlay(null);
      setOverlayAsset({ path, filename: String(rawAsset?.filename || 'Censor overlay'), previewUrl: String(rawAsset?.previewUrl || `/api/fs/image?${new URLSearchParams({ path }).toString()}`) });
    }
  }, [setOutputFolder, updateRegion]);
  const chooseSources = React.useCallback(async () => {
    if (remoteClient) { sourceInputRef.current?.click(); return; }
    if (browsingSources) return;
    setBrowsingSources(true);
    try {
      addPaths(await browseUmbraUiMediaToolsSourceFiles('image', selected?.path || outputFolder));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to select source images.', 'error');
    } finally {
      setBrowsingSources(false);
    }
  }, [addPaths, browsingSources, outputFolder, remoteClient, selected?.path, showToast]);
  const run = React.useCallback(async () => {
    if (
      processing
      || items.length === 0
      || (regionMode === 'detect' && selectedTargets.length === 0)
      || (censorMode === 'overlay' && !overlay && !overlayAsset)
    ) return;
    setProcessing(true);
    setSummary({ completed: 0, failed: 0, total: items.length });
    setItems((current) => current.map((item) => ({ ...item, status: 'staged', error: undefined, result: undefined })));
    const result = await runUmbraUiMediaBatch({
      items,
      onItemStart: (item) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'running' } : entry)),
      runItem: async (item, sequenceNumber) => {
        const next = await submitUmbraUiImageCensor({ source: item.file, sourcePath: item.path, mode: censorMode, regionMode, targets: selectedTargets, detectionThreshold, detectionPadding, overlay: overlayAsset ? undefined : overlay || undefined, overlayPath: overlayAsset?.path, outputFolder: outputFolder.trim(), sequenceNumber, ...region, mosaicSize, resizeEnabled: exportSettings.resizeEnabled, longEdge: exportSettings.longEdge, imageFormat: exportSettings.format, quality: exportSettings.quality });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, result: next } : entry));
      },
      onItemSettled: (item, error) => {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: error ? 'failed' : 'completed', error: error instanceof Error ? error.message : error ? String(error) : undefined } : entry));
        setSummary((current) => ({ ...current, completed: current.completed + (error ? 0 : 1), failed: current.failed + (error ? 1 : 0) }));
      },
    });
    setProcessing(false);
    window.dispatchEvent(new CustomEvent('umbra:umbra-ui-output-refresh'));
    showToast(result.failed ? `${result.completed} censored; ${result.failed} failed.` : `${result.completed} image${result.completed === 1 ? '' : 's'} censored.`, result.failed ? 'error' : 'success');
  }, [censorMode, detectionPadding, detectionThreshold, exportSettings, items, mosaicSize, outputFolder, overlay, overlayAsset, processing, region, regionMode, selectedTargets, setItems, showToast]);
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>, kind: 'move' | 'resize') => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, x: event.clientX, y: event.clientY, region };
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const frame = previewRef.current;
    if (!drag || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / Math.max(1, bounds.width);
    const dy = (event.clientY - drag.y) / Math.max(1, bounds.height);
    if (drag.kind === 'move') updateRegion({ x: drag.region.x + dx, y: drag.region.y + dy });
    else updateRegion({ width: drag.region.width + dx, height: drag.region.height + dy });
  };
  return (
    <div data-umbra-ui-censor-tool="" className="grid min-h-0 flex-1 grid-cols-[minmax(300px,360px)_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:overflow-y-auto">
      <section className="min-h-0 overflow-y-auto border-r border-white/10 bg-black/15 p-3 custom-scrollbar max-[900px]:overflow-visible max-[900px]:border-b max-[900px]:border-r-0">
        <div className="mb-3 flex items-center gap-2"><EyeOff size={13} className="text-fuchsia-300" /><h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300">Image Censor Batch</h2><span className="ml-auto font-mono text-[8px] uppercase text-zinc-600">25 images at a time</span></div>
        <input ref={sourceInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/tiff" className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files || [])); setSummary({ completed: 0, failed: 0, total: 0 }); event.currentTarget.value = ''; }} />
        <input ref={overlayInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/tiff" className="hidden" onChange={(event) => { const file = event.target.files?.[0] || null; event.currentTarget.value = ''; void chooseOverlay(file); }} />
        <div className="space-y-3">
          <button type="button" disabled={processing || browsingSources} onClick={() => void chooseSources()} className="flex min-h-11 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 text-left hover:border-fuchsia-300/30 disabled:opacity-40">{browsingSources ? <Loader2 size={14} className="animate-spin text-fuchsia-300" /> : <Upload size={14} className="text-fuchsia-300" />}<span className="flex-1 text-[9px] font-black uppercase tracking-[0.13em] text-zinc-300">Add Images</span></button>
          <SourceBatchList items={items} disabled={processing} onSelect={setSelectedId} onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))} onClear={() => { setItems([]); setSummary({ completed: 0, failed: 0, total: 0 }); }} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRegionMode('detect')} className={cn('h-9 rounded-md border text-[9px] font-black uppercase tracking-[0.12em]', regionMode === 'detect' ? 'border-fuchsia-300/50 bg-fuchsia-500/[0.12] text-fuchsia-100' : 'border-white/10 text-zinc-500')}>Auto Detect</button>
            <button type="button" onClick={() => setRegionMode('manual')} className={cn('h-9 rounded-md border text-[9px] font-black uppercase tracking-[0.12em]', regionMode === 'manual' ? 'border-fuchsia-300/50 bg-fuchsia-500/[0.12] text-fuchsia-100' : 'border-white/10 text-zinc-500')}>Manual Region</button>
          </div>
          {regionMode === 'detect' ? (
            <div className="space-y-3 rounded-md border border-fuchsia-300/15 bg-fuchsia-500/[0.04] p-2.5">
              <div className="flex items-center justify-between"><span className={labelClass}>Body Parts</span><span className="font-mono text-[8px] text-zinc-600">On-device detection</span></div>
              <div className="grid grid-cols-1 gap-1.5">
                {CENSOR_TARGETS.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    aria-pressed={censorTargets[target.id]}
                    onClick={() => setCensorTargets((current) => ({ ...current, [target.id]: !current[target.id] }))}
                    className={cn('flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-left text-[9px] font-black uppercase tracking-[0.1em]', censorTargets[target.id] ? 'border-fuchsia-300/35 bg-fuchsia-500/[0.1] text-fuchsia-100' : 'border-white/10 text-zinc-600')}
                  >
                    <span className={cn('h-3 w-3 rounded-sm border', censorTargets[target.id] ? 'border-fuchsia-200 bg-fuchsia-400' : 'border-white/20 bg-black/30')} />
                    {target.label}
                  </button>
                ))}
              </div>
              <label className="block space-y-1.5"><span className="flex justify-between"><span className={labelClass}>Detection Confidence</span><span className="font-mono text-[9px] text-fuchsia-200">{Math.round(detectionThreshold * 100)}%</span></span><input type="range" min={10} max={90} step={1} value={Math.round(detectionThreshold * 100)} onChange={(event) => setDetectionThreshold(Number(event.target.value) / 100)} className="w-full accent-fuchsia-300" /></label>
              <label className="block space-y-1.5"><span className="flex justify-between"><span className={labelClass}>Censor Padding</span><span className="font-mono text-[9px] text-fuchsia-200">{Math.round(detectionPadding * 100)}%</span></span><input type="range" min={0} max={50} step={1} value={Math.round(detectionPadding * 100)} onChange={(event) => setDetectionPadding(Number(event.target.value) / 100)} className="w-full accent-fuchsia-300" /></label>
              <p className="font-mono text-[8px] leading-relaxed text-zinc-600">The MIT-licensed anime detector downloads once on first use. Each image is scanned independently.</p>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setCensorMode('mosaic')} className={cn('h-9 rounded-md border text-[9px] font-black uppercase tracking-[0.12em]', censorMode === 'mosaic' ? 'border-fuchsia-300/50 bg-fuchsia-500/[0.12] text-fuchsia-100' : 'border-white/10 text-zinc-500')}>Mosaic</button><button type="button" onClick={() => setCensorMode('overlay')} className={cn('h-9 rounded-md border text-[9px] font-black uppercase tracking-[0.12em]', censorMode === 'overlay' ? 'border-fuchsia-300/50 bg-fuchsia-500/[0.12] text-fuchsia-100' : 'border-white/10 text-zinc-500')}>Image Overlay</button></div>
          {censorMode === 'mosaic' ? <label className="block space-y-1.5"><span className="flex justify-between"><span className={labelClass}>Mosaic block size</span><span className="font-mono text-[9px] text-fuchsia-200">{mosaicSize}px</span></span><input type="range" min={2} max={128} step={1} value={mosaicSize} onChange={(event) => setMosaicSize(Number(event.target.value))} className="w-full accent-fuchsia-300" /></label> : <button type="button" disabled={overlayUploading} onClick={() => overlayInputRef.current?.click()} className="flex min-h-11 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 text-left hover:border-fuchsia-300/30 disabled:opacity-40">{overlayUploading ? <Loader2 size={14} className="animate-spin text-fuchsia-300" /> : <ImageIcon size={14} className="text-fuchsia-300" />}<span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.13em] text-zinc-300">Censor Overlay</span><span className="block truncate font-mono text-[8px] text-zinc-600">{overlayUploading ? 'Saving for presets...' : overlayAsset?.filename || overlay?.name || 'Choose image'}</span></span></button>}
          {regionMode === 'manual' ? <div className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key} className="block space-y-1"><span className={labelClass}>{key === 'x' || key === 'y' ? `${key.toUpperCase()} position` : key}</span><input type="number" min={0} max={100} step={1} value={Math.round(region[key] * 100)} onChange={(event) => updateRegion({ [key]: Number(event.target.value) / 100 })} className={controlClass} /></label>)}</div> : null}
          <OutputDestination value={outputFolder} onChange={setOutputFolder} browsing={browsing} onBrowse={() => void browse()} automaticSubfolder="Censored" />
          <UmbraImageExportControls value={exportSettings} onChange={setExportSettings} presetScope="image-censor" presetLabel="Image Censor Preset" presetExtra={presetExtra} onPresetExtraChange={applyPreset} presetSaveDisabled={censorMode === 'overlay' && !overlayAsset} />
          <button type="button" onClick={() => void run()} disabled={items.length === 0 || processing || (regionMode === 'detect' && selectedTargets.length === 0) || (censorMode === 'overlay' && !overlay && !overlayAsset)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-fuchsia-300/30 bg-fuchsia-500/[0.1] text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600">{processing ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} />}{processing ? `Processing ${summary.completed + summary.failed}/${summary.total}` : 'Run Image Censor Batch'}</button>
          <BatchSummary {...summary} />
        </div>
      </section>
      <main className="flex min-h-0 min-w-0 flex-col bg-black/20">
        <div className="flex min-h-10 items-center gap-2 border-b border-white/10 px-3">
          <Move size={13} className="text-zinc-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">{regionMode === 'detect' ? 'Detection Preview' : 'Censor Region Preview'}</span>
          <span className="ml-auto max-w-[45%] truncate font-mono text-[8px] text-zinc-600">{selected?.name || 'No source selected'}</span>
        </div>
        <div className="flex min-h-[320px] flex-1 items-center justify-center overflow-auto p-4 max-[900px]:min-h-[280px]">
          {sourceUrl && !previewFailed ? (
            <div ref={previewRef} className="relative max-h-full max-w-full touch-none overflow-hidden bg-black shadow-2xl" style={{ aspectRatio: `${dimensions.width}/${dimensions.height}`, width: 'min(100%, calc((100vh - 220px) * ' + (dimensions.width / Math.max(1, dimensions.height)) + '))' }} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
              <img src={sourceUrl} alt="Censor source preview" className="pointer-events-none block h-full w-full object-contain" onError={() => setPreviewFailed(true)} onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth || 4, height: event.currentTarget.naturalHeight || 3 })} />
              {regionMode === 'manual' ? (
                <div className="absolute border-2 border-fuchsia-300 bg-fuchsia-500/15 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} onPointerDown={(event) => beginDrag(event, 'move')}>
                  <div className={cn('pointer-events-none absolute inset-0', censorMode === 'mosaic' ? 'bg-[repeating-linear-gradient(45deg,rgba(217,70,239,0.35)_0,rgba(217,70,239,0.35)_8px,rgba(0,0,0,0.35)_8px,rgba(0,0,0,0.35)_16px)]' : '')}>{censorMode === 'overlay' && overlayUrl ? <img src={overlayUrl} alt="Censor overlay preview" className="h-full w-full object-fill" /> : null}</div>
                  <button type="button" aria-label="Resize censor region" onPointerDown={(event) => beginDrag(event, 'resize')} className="absolute -bottom-2 -right-2 h-4 w-4 rounded-sm border border-fuchsia-100 bg-fuchsia-500 shadow-lg" />
                </div>
              ) : (
                <>
                  {(selected?.result?.detections || []).map((detection, index) => (
                    <div key={`${detection.target}-${index}`} className="pointer-events-none absolute border-2 border-fuchsia-300 bg-fuchsia-500/20 shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" style={{ left: `${detection.x * 100}%`, top: `${detection.y * 100}%`, width: `${detection.width * 100}%`, height: `${detection.height * 100}%` }}>
                      <span className="absolute -top-5 left-0 whitespace-nowrap rounded-sm bg-black/85 px-1.5 py-0.5 font-mono text-[7px] uppercase text-fuchsia-200">{CENSOR_TARGETS.find((target) => target.id === detection.target)?.label || detection.target} {Math.round(detection.score * 100)}%</span>
                    </div>
                  ))}
                  {!selected?.result ? <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md border border-white/10 bg-black/75 px-3 py-2 text-center font-mono text-[8px] uppercase text-zinc-400">Detections appear after this image is processed</div> : null}
                </>
              )}
            </div>
          ) : <div className="text-center text-zinc-700"><EyeOff size={34} className="mx-auto mb-3" /><div className="text-[10px] font-black uppercase tracking-[0.16em]">{previewFailed ? 'Source preview unavailable' : 'Stage images to preview'}</div></div>}
        </div>
      </main>
    </div>
  );
}

function VideoToGifTool() {
  const showToast = useStore((state) => state.showToast);
  const { items, setItems, addFiles, addPaths } = useStagedMedia('gif');
  const { outputFolder, setOutputFolder, browsing, browse } = useOutputFolder('gif');
  const [selectedId, setSelectedId] = React.useState('');
  const [width, setWidth] = React.useState(720);
  const [processing, setProcessing] = React.useState(false);
  const [browsingSources, setBrowsingSources] = React.useState(false);
  const [summary, setSummary] = React.useState({ completed: 0, failed: 0, total: 0 });
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const remoteClient = isUmbraRemoteClient();
  const selected = items.find((item) => item.id === selectedId) || items[0];
  const localSourceUrl = useFilePreview(selected?.file || null);
  const sourceUrl = localSourceUrl || itemPreviewUrl(selected);
  React.useEffect(() => { if (!selectedId && items[0]) setSelectedId(items[0].id); }, [items, selectedId]);
  const gifPresetValue = React.useMemo<Record<string, unknown>>(() => ({
    outputFolder,
    width,
  }), [outputFolder, width]);
  const applyGifPreset = React.useCallback((value: Record<string, unknown>) => {
    setOutputFolder(String(value.outputFolder || '').trim());
    setWidth(Math.max(64, Math.min(3840, Math.round(Number(value.width) || 720))));
  }, [setOutputFolder]);

  const chooseSources = React.useCallback(async () => {
    if (remoteClient) {
      inputRef.current?.click();
      return;
    }
    if (browsingSources) return;
    setBrowsingSources(true);
    try {
      addPaths(await browseUmbraUiMediaToolsSourceFiles('video', selected?.path || outputFolder));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to select source videos.', 'error');
    } finally {
      setBrowsingSources(false);
    }
  }, [addPaths, browsingSources, outputFolder, remoteClient, selected?.path, showToast]);

  const run = React.useCallback(async () => {
    if (processing || items.length === 0) return;
    setProcessing(true);
    setSummary({ completed: 0, failed: 0, total: items.length });
    setItems((current) => current.map((item) => ({ ...item, status: 'staged', error: undefined, result: undefined })));
    const result = await runUmbraUiMediaBatch({
      items,
      onItemStart: (item) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'running' } : entry)),
      runItem: async (item, sequenceNumber) => {
        const next = await submitUmbraUiVideoToGif({ source: item.file, sourcePath: item.path, outputFolder: outputFolder.trim(), sequenceNumber, width });
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, result: next } : entry));
      },
      onItemSettled: (item, error) => {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: error ? 'failed' : 'completed', error: error instanceof Error ? error.message : error ? String(error) : undefined } : entry));
        setSummary((current) => ({ ...current, completed: current.completed + (error ? 0 : 1), failed: current.failed + (error ? 1 : 0) }));
      },
    });
    setProcessing(false);
    window.dispatchEvent(new CustomEvent('umbra:umbra-ui-output-refresh'));
    showToast(result.failed ? `${result.completed} GIF${result.completed === 1 ? '' : 's'} completed; ${result.failed} failed.` : `${result.completed} GIF${result.completed === 1 ? '' : 's'} completed.`, result.failed ? 'error' : 'success');
  }, [items, outputFolder, processing, setItems, showToast, width]);

  return (
    <div data-umbra-ui-gif-tool="" className="grid min-h-0 flex-1 grid-cols-[minmax(300px,360px)_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:overflow-y-auto">
      <section data-umbra-ui-media-tool-controls="" className="min-h-0 overflow-y-auto border-r border-white/10 bg-black/15 p-3 custom-scrollbar max-[900px]:overflow-visible max-[900px]:border-b max-[900px]:border-r-0">
        <div className="mb-3 flex items-center gap-2"><Film size={13} className="text-amber-300" /><h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300">Video to GIF Batch</h2><span className="ml-auto font-mono text-[8px] uppercase text-zinc-600">1 video at a time</span></div>
        <input ref={inputRef} type="file" multiple accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.avi,.m4v,.mkv,.mov,.mp4,.webm,.wmv" className="hidden" onChange={(event) => { addFiles(Array.from(event.target.files || [])); setSummary({ completed: 0, failed: 0, total: 0 }); event.currentTarget.value = ''; }} />
        <div className="space-y-3">
          <button type="button" disabled={processing || browsingSources} onClick={() => void chooseSources()} className="flex min-h-11 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 text-left hover:border-amber-300/30 disabled:opacity-40">{browsingSources ? <Loader2 size={14} className="animate-spin text-amber-300" /> : <Upload size={14} className="text-amber-300" />}<span className="flex-1 text-[9px] font-black uppercase tracking-[0.13em] text-zinc-300">Add Videos</span></button>
          <SourceBatchList items={items} disabled={processing} onSelect={setSelectedId} onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))} onClear={() => { setItems([]); setSummary({ completed: 0, failed: 0, total: 0 }); }} />
          <UmbraExtrasPresetControl scope="video-to-gif" label="GIF Preset" value={gifPresetValue} onApply={applyGifPreset} />
          <OutputDestination value={outputFolder} onChange={setOutputFolder} browsing={browsing} onBrowse={() => void browse()} automaticSubfolder="GIF" />
          <div className="border-t border-white/10 pt-3">
            <label className="block space-y-1.5"><span className={labelClass}>Output Width</span><input type="number" min={64} max={3840} step={2} value={width} onChange={(event) => setWidth(Math.max(64, Math.min(3840, Number(event.target.value) || 720)))} className={controlClass} /></label>
          </div>
          <div className="rounded-md border border-amber-300/15 bg-amber-500/[0.04] px-2.5 py-2 font-mono text-[8px] uppercase text-zinc-500">Full source duration · Original frame timing · {width}px wide</div>
          <button type="button" onClick={() => void run()} disabled={items.length === 0 || processing} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-amber-300/30 bg-amber-500/[0.1] text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600">{processing ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}{processing ? `Encoding ${summary.completed + summary.failed}/${summary.total}` : 'Create GIF Batch'}</button>
          <BatchSummary {...summary} />
        </div>
      </section>
      <main data-umbra-ui-media-tool-preview="" className="flex min-h-0 min-w-0 flex-col bg-black/20">
        <div className="flex min-h-10 items-center gap-2 border-b border-white/10 px-3"><Video size={13} className="text-zinc-500" /><span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Clip Preview</span><span className="ml-auto max-w-[45%] truncate font-mono text-[8px] text-zinc-600">{selected?.name || 'No video selected'}</span></div>
        <div className="flex min-h-[320px] flex-1 items-center justify-center overflow-auto p-4 max-[900px]:min-h-[280px]">{sourceUrl ? <video key={selected?.id} src={sourceUrl} controls playsInline className="max-h-full max-w-full bg-black shadow-2xl" /> : <div className="text-center text-zinc-700"><Film size={34} className="mx-auto mb-3" /><div className="text-[10px] font-black uppercase tracking-[0.16em]">Stage videos to preview</div></div>}</div>
        {selected?.result ? <div className="flex items-center gap-2 border-t border-emerald-300/15 bg-emerald-500/[0.035] px-3 py-2.5"><CheckCircle2 size={13} className="text-emerald-300" /><span className="min-w-0 flex-1 truncate font-mono text-[8px] text-zinc-500">{selected.result.filename}</span><a href={`${buildFsImageUrl(selected.result.path, String(Date.now()), { preferServer: true })}&download=1`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[9px] font-black uppercase text-zinc-300"><Download size={11} /> Save</a></div> : null}
      </main>
    </div>
  );
}

export function UmbraExtrasMediaTools({ mode }: { mode: UmbraExtrasMediaToolMode }) {
  if (mode === 'censor') return <ImageCensorTool />;
  if (mode === 'watermark') return <WatermarkTool targetKind="image" />;
  if (mode === 'video-watermark') return <WatermarkTool targetKind="video" />;
  return <VideoToGifTool />;
}

export default UmbraExtrasMediaTools;
