import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Copy, FolderOpen, Loader2, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { showInFileExplorer } from '@/utils/fileExplorer';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  getWaifuPrependPresetsSnapshot,
  normalizeWaifuPreset,
  setWaifuPrependPresets,
  subscribeWaifuPrependPresets,
} from '@/lib/waifuPrependPresets';

interface WaifuTagScore {
  tag: string;
  score: number;
}

interface WaifuTagResult {
  modelRepo: string;
  generalThreshold: number;
  characterThreshold: number;
  ratingThreshold: number;
  generalMcutEnabled: boolean;
  characterMcutEnabled: boolean;
  usedGeneralThreshold: number;
  usedCharacterThreshold: number;
  rating: Record<string, number>;
  general: WaifuTagScore[];
  character: WaifuTagScore[];
  booruTags: string[];
  booruTagString: string;
  generalTagString: string;
  characterTagString: string;
}

interface WaifuTaggerState {
  status: 'idle' | 'loading' | 'done' | 'error';
  result?: WaifuTagResult;
  error?: string;
}

interface WaifuItem {
  id: string;
  path: string;
  name: string;
  blob?: Blob;
  blobUrl: string;
  previewUrl: string;
  ownsBlobUrl: boolean;
  size: number;
  isVideo: boolean;
  waifuTagger: WaifuTaggerState;
}

const WAIFU_WORKSPACE_PERSIST_KEY = 'umbra_waifu_workspace_paths_v1';
const WAIFU_FILE_EXT_VIDEO_RE = /\.(mp4|webm|mov|mkv|avi|m4v)$/i;
const GALLERY_DRAG_PATHS_MIME = 'application/x-umbra-gallery-paths';

const normalizePersistPath = (input: string): string => String(input || '').replace(/\\/g, '/').trim();

const buildFsMediaUrl = (path: string): string => {
  const normalized = normalizePersistPath(path);
  return normalized ? `/api/fs/image?path=${encodeURIComponent(normalized)}` : '';
};

const buildFsThumbnailUrl = (path: string): string => {
  const normalized = normalizePersistPath(path);
  return normalized ? `/api/fs/thumbnail?path=${encodeURIComponent(normalized)}&size=small&q=70&fit=cover&lane=waifu` : '';
};

const revokeWaifuItemUrl = (item: Pick<WaifuItem, 'blobUrl' | 'ownsBlobUrl'> | null | undefined) => {
  if (item?.ownsBlobUrl && item.blobUrl) {
    URL.revokeObjectURL(item.blobUrl);
  }
};

const clearLegacyWaifuPersistence = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(WAIFU_WORKSPACE_PERSIST_KEY);
  } catch {}
};

const readGalleryDragPaths = (dataTransfer: DataTransfer): string[] => {
  try {
    const raw = dataTransfer.getData(GALLERY_DRAG_PATHS_MIME);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
};

const WAIFU_MODEL_OPTIONS = [
  { id: 'SmilingWolf/wd-vit-tagger-v3', label: 'wd-vit-tagger-v3' },
  { id: 'SmilingWolf/wd-convnext-tagger-v3', label: 'wd-convnext-tagger-v3' },
  { id: 'SmilingWolf/wd-eva02-large-tagger-v3', label: 'wd-eva02-large-tagger-v3' },
  { id: 'SmilingWolf/wd-swinv2-tagger-v3', label: 'wd-swinv2-tagger-v3' },
];
export function WaifuDiffusionWorkspace({ hideHeader = false }: { hideHeader?: boolean }) {
  const [items, setItems] = useState<WaifuItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchTagging, setBatchTagging] = useState(false);
  const itemsRef = useRef<WaifuItem[]>([]);
  const [waifuOptions, setWaifuOptions] = useState(() => ({
    modelRepo: WAIFU_MODEL_OPTIONS[0].id,
    generalThreshold: 0.35,
    characterThreshold: 0.85,
    ratingThreshold: 0.25,
    generalMcutEnabled: false,
    characterMcutEnabled: false,
    maxTags: 120,
    exportUseUnderscores: true,
    exportUseCommas: false,
    prependTags: '',
  }));
  const [prependPresetDraft, setPrependPresetDraft] = useState('');
  const { activeWorkspace, showToast, ui, clearScannedImport } = useStore();
  const prependPresets = useSyncExternalStore(
    subscribeWaifuPrependPresets,
    getWaifuPrependPresetsSnapshot,
    () => []
  );

  const isActive = activeWorkspace === 'waifudiffusion' || (activeWorkspace === 'imageinspector' && ui.imageInspectorTab === 'waifu');

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    clearLegacyWaifuPersistence();
    return () => {
      for (const item of itemsRef.current) {
        revokeWaifuItemUrl(item);
      }
    };
  }, []);

  const loadFile = useCallback(async (blob: Blob, filename: string, path?: string) => {
    const isVideo = WAIFU_FILE_EXT_VIDEO_RE.test(filename);
    const nextPath = path || filename;
    const nextPathNormalized = normalizePersistPath(nextPath);
    const canUseFileUrl = Boolean(path && /[\\/]/.test(String(path || '')));
    const blobUrl = canUseFileUrl ? buildFsMediaUrl(nextPath) : URL.createObjectURL(blob);

    const item: WaifuItem = {
      id: Date.now().toString() + Math.random(),
      path: nextPath,
      name: filename,
      ...(canUseFileUrl ? {} : { blob }),
      blobUrl,
      previewUrl: canUseFileUrl ? buildFsThumbnailUrl(nextPath) : blobUrl,
      ownsBlobUrl: !canUseFileUrl,
      size: blob.size,
      isVideo: !!isVideo,
      waifuTagger: { status: 'idle' },
    };

    setItems((prev) => {
      const existing = prev.find((entry) => normalizePersistPath(entry.path) === nextPathNormalized);
      if (existing) {
        revokeWaifuItemUrl(item);
        setSelectedId(existing.id);
        return prev;
      }
      setSelectedId(item.id);
      return [item, ...prev];
    });
  }, []);

  const loadFromPath = useCallback(async (path: string) => {
    try {
      const filename = path.split(/[/\\]/).pop() || 'unknown';
      const normalizedPath = normalizePersistPath(path);
      if (!normalizedPath) return;
      const isVideo = WAIFU_FILE_EXT_VIDEO_RE.test(filename);
      const item: WaifuItem = {
        id: Date.now().toString() + Math.random(),
        path: normalizedPath,
        name: filename,
        blobUrl: buildFsMediaUrl(normalizedPath),
        previewUrl: buildFsThumbnailUrl(normalizedPath),
        ownsBlobUrl: false,
        size: 0,
        isVideo,
        waifuTagger: { status: 'idle' },
      };

      setItems((prev) => {
        const existing = prev.find((entry) => normalizePersistPath(entry.path) === normalizedPath);
        if (existing) {
          setSelectedId(existing.id);
          return prev;
        }
        setSelectedId(item.id);
        return [item, ...prev];
      });
    } catch (error) {
      console.error('[WaifuDiffusionWorkspace] Failed to load from path:', error);
      showToast('Failed to load dropped image', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (!isActive) return;
    const queuedPaths = Array.isArray(ui.scannedImportQueue) ? ui.scannedImportQueue : [];
    if (queuedPaths.length === 0) return;

    const uniquePaths: string[] = [];
    const seen = new Set<string>();
    for (const rawPath of queuedPaths) {
      const nextPath = String(rawPath || '').trim();
      if (!nextPath) continue;
      const key = nextPath.replace(/\\/g, '/');
      if (seen.has(key)) continue;
      seen.add(key);
      uniquePaths.push(nextPath);
    }
    if (uniquePaths.length === 0) {
      clearScannedImport();
      return;
    }

    let cancelled = false;
    const importQueuedPaths = async () => {
      for (const path of uniquePaths) {
        if (cancelled) return;
        await loadFromPath(path);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      if (!cancelled) clearScannedImport();
    };
    void importQueuedPaths();
    return () => { cancelled = true; };
  }, [clearScannedImport, isActive, loadFromPath, ui.scannedImportQueue]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isActive) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, [isActive]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!isActive) return;

    const galleryPaths = readGalleryDragPaths(e.dataTransfer);
    if (galleryPaths.length > 0) {
      for (const path of galleryPaths) {
        await loadFromPath(path);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        const osPath = String((file as any)?.path || '').trim();
        if (osPath) {
          await loadFromPath(osPath);
        } else {
          await loadFile(file, file.name);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      return;
    }

    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (!jsonData) return;
      const data = JSON.parse(jsonData);
      if (data.type === 'multi-select' && Array.isArray(data.images)) {
        for (const image of data.images) {
          const path = image?.path || image?.relativePath;
          if (path) {
            await loadFromPath(path);
            await new Promise((resolve) => window.setTimeout(resolve, 0));
          }
        }
        return;
      }
    if (data.type === 'filmstrip-image' || data.type === 'library-image' || data.type === 'image') {
        const path = data.image?.path || data.image?.relativePath || data.path;
        if (path) await loadFromPath(path);
      }
    } catch (error) {
      console.error('[WaifuDiffusionWorkspace] Failed to parse drop data:', error);
    }
  }, [isActive, loadFile, loadFromPath]);

  const selectedItem = items.find((item) => item.id === selectedId);

  const clearAll = useCallback(() => {
    for (const item of items) revokeWaifuItemUrl(item);
    setItems([]);
    setSelectedId(null);
    clearLegacyWaifuPersistence();
  }, [items]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) revokeWaifuItemUrl(target);
      const next = prev.filter((item) => item.id !== id);
      setSelectedId((current) => (current === id ? (next[0]?.id || null) : current));
      return next;
    });
  }, []);

  const setItemTaggerState = useCallback((itemId: string, nextState: WaifuTaggerState) => {
    setItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, waifuTagger: nextState } : item
    )));
  }, []);

  const copyToClipboard = useCallback(async (text: string, successMessage: string) => {
    try {
      if (!text.trim()) return;
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [showToast]);

  const revealInExplorer = useCallback(async (path?: string) => {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) return;
    try {
      await showInFileExplorer(normalizedPath);
      showToast('Opened file location', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open file location', 'error');
    }
  }, [showToast]);

  const runWaifuTaggerForItem = useCallback(async (item: WaifuItem) => {
    if (item.isVideo) {
      showToast('Waifu tagger only supports images', 'error');
      return;
    }

    setItemTaggerState(item.id, { status: 'loading' });

    try {
      const normalizedPath = String(item.path || '').trim();
      const hasPath = normalizedPath.length > 0 && /[\\/]/.test(normalizedPath);
      const endpoint = '/api/metadata/tag-waifu';
      let response: Response;

      if (hasPath) {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: normalizedPath,
            modelRepo: waifuOptions.modelRepo,
            generalThreshold: waifuOptions.generalThreshold,
            characterThreshold: waifuOptions.characterThreshold,
            ratingThreshold: waifuOptions.ratingThreshold,
            generalMcutEnabled: waifuOptions.generalMcutEnabled,
            characterMcutEnabled: waifuOptions.characterMcutEnabled,
            maxTags: waifuOptions.maxTags,
          }),
        });
      } else {
        if (!item.blob) {
          throw new Error('This image is no longer available in memory. Drop it again or use a saved file path.');
        }
        const formData = new FormData();
        formData.append('image', item.blob, item.name);
        formData.append('modelRepo', waifuOptions.modelRepo);
        formData.append('generalThreshold', String(waifuOptions.generalThreshold));
        formData.append('characterThreshold', String(waifuOptions.characterThreshold));
        formData.append('ratingThreshold', String(waifuOptions.ratingThreshold));
        formData.append('generalMcutEnabled', String(waifuOptions.generalMcutEnabled));
        formData.append('characterMcutEnabled', String(waifuOptions.characterMcutEnabled));
        formData.append('maxTags', String(waifuOptions.maxTags));
        response = await fetch(endpoint, { method: 'POST', body: formData });
      }

      const payload = await response.json().catch(() => null) as (WaifuTagResult & { error?: string; success?: boolean }) | null;
      if (!response.ok || !payload || payload.error || payload.success === false) {
        const message = payload?.error || `Tagging failed (${response.status})`;
        throw new Error(message);
      }

      setItemTaggerState(item.id, { status: 'done', result: payload });
    } catch (error: any) {
      const errorMessage = error?.message || 'Tagging failed';
      setItemTaggerState(item.id, { status: 'error', error: errorMessage });
      showToast(errorMessage, 'error');
    }
  }, [setItemTaggerState, showToast, waifuOptions]);

  const runWaifuTaggerForAll = useCallback(async () => {
    if (batchTagging) return;
    const taggableItems = itemsRef.current.filter((item) => (
      !item.isVideo && item.waifuTagger.status !== 'loading'
    ));
    if (taggableItems.length === 0) {
      showToast('No images ready to tag', 'error');
      return;
    }

    setBatchTagging(true);
    try {
      for (const item of taggableItems) {
        await runWaifuTaggerForItem(item);
      }
      showToast(`Tagged ${taggableItems.length} image${taggableItems.length === 1 ? '' : 's'}`, 'success');
    } finally {
      setBatchTagging(false);
    }
  }, [batchTagging, runWaifuTaggerForItem, showToast]);

  const getBooruExportString = useCallback((result: WaifuTagResult): string => {
    const toTagArray = (raw: string): string[] => {
      const text = String(raw || '').trim();
      if (!text) return [];
      if (text.includes(',')) {
        return text.split(',').map((part) => part.trim()).filter(Boolean);
      }
      return text.split(/\s+/).map((part) => part.trim()).filter(Boolean);
    };

    const normalizeTag = (raw: string): string => {
      const cleaned = String(raw || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return '';
      return waifuOptions.exportUseUnderscores
        ? cleaned.replace(/ /g, '_')
        : cleaned.replace(/_/g, ' ');
    };

    const prependTags = toTagArray(waifuOptions.prependTags).map(normalizeTag).filter(Boolean);
    const generatedTags = (result.booruTags || []).map(normalizeTag).filter(Boolean);
    const merged = [...prependTags, ...generatedTags];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const tag of merged) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(tag);
    }
    const separator = waifuOptions.exportUseCommas ? ', ' : ' ';
    return unique.join(separator).trim();
  }, [waifuOptions.exportUseCommas, waifuOptions.exportUseUnderscores, waifuOptions.prependTags]);

  const booruExportString = selectedItem?.waifuTagger.result
    ? getBooruExportString(selectedItem.waifuTagger.result)
    : '';

  const addPrependPreset = useCallback((rawPreset: string) => {
    const preset = normalizeWaifuPreset(rawPreset);
    if (!preset) {
      showToast('Enter tags to save as a preset', 'error');
      return;
    }

    const currentPresets = getWaifuPrependPresetsSnapshot();
    const exists = currentPresets.some((entry) => entry.toLowerCase() === preset.toLowerCase());
    if (exists) {
      showToast('Preset already exists', 'error');
      return;
    }
    setWaifuPrependPresets([preset, ...currentPresets]);
    setPrependPresetDraft('');
    showToast('Saved prepend preset', 'success');
  }, [showToast]);

  const applyPrependPreset = useCallback((preset: string) => {
    const cleanedPreset = normalizeWaifuPreset(preset);
    if (!cleanedPreset) return;

    setWaifuOptions((prev) => {
      const current = normalizeWaifuPreset(prev.prependTags);
      if (!current) return { ...prev, prependTags: cleanedPreset };
      if (current.toLowerCase() === cleanedPreset.toLowerCase()) return prev;
      return { ...prev, prependTags: `${cleanedPreset}, ${current}` };
    });
    showToast('Preset prepended', 'success');
  }, [showToast]);

  const removePrependPreset = useCallback((preset: string) => {
    const currentPresets = getWaifuPrependPresetsSnapshot();
    setWaifuPrependPresets(currentPresets.filter((entry) => entry !== preset));
  }, []);

  return (
    <div
      className="relative h-full flex bg-[var(--umbra-bg)] text-[var(--umbra-text)]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[var(--umbra-accent)]/15 border-4 border-dashed border-[var(--umbra-accent)] backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload className="w-16 h-16 text-[var(--umbra-accent)] mx-auto mb-4 animate-bounce" />
            <p className="text-[var(--umbra-text)] text-2xl font-bold">Drop To Tag</p>
            <p className="umbra-text-muted text-sm mt-2">Images from filmstrip or your file explorer</p>
          </div>
        </div>
      )}

      <div className="custom-scrollbar w-24 space-y-2 overflow-y-auto border-r border-white/10 p-2 umbra-surface-deep">
        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] umbra-text-faint">
          {items.length} Media
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            className={`relative h-20 w-20 cursor-pointer overflow-hidden rounded-md border transition ${selectedId === item.id
              ? 'border-[var(--umbra-accent)] shadow-[0_0_16px_var(--umbra-accent-glow)]'
              : 'border-white/10 opacity-60 hover:border-white/25 hover:opacity-100'
              }`}
          >
            {item.isVideo ? (
              <video src={item.blobUrl} className="h-full w-full object-cover" muted preload="metadata" />
            ) : (
              <img src={item.previewUrl || item.blobUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            )}
            {item.waifuTagger.status !== 'idle' ? (
              <div className="absolute bottom-1 right-1 rounded border border-black/40 bg-black/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-200">
                {item.waifuTagger.status}
              </div>
            ) : null}
          </div>
        ))}
        {items.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-black/25 p-2 text-center text-[10px] umbra-text-faint">
            Drop media
          </div>
        ) : null}
      </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!hideHeader && (
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-[var(--umbra-text)]">
                  <Sparkles size={16} className="text-[var(--umbra-accent)]" />
                  Waifu Diffusion
                </h2>
                <p className="mt-0.5 text-xs umbra-text-muted">Dedicated WD tagger workspace for booru-ready tags</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => selectedItem && runWaifuTaggerForItem(selectedItem)}
                  disabled={batchTagging || !selectedItem || selectedItem.waifuTagger.status === 'loading' || selectedItem.isVideo}
                  className="inline-flex items-center gap-1.5 rounded border border-[var(--umbra-accent)]/45 bg-[var(--umbra-accent)]/25 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:border-white/10 disabled:bg-zinc-800/60 disabled:text-zinc-500"
                >
                  {selectedItem?.waifuTagger.status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {selectedItem?.waifuTagger.status === 'loading' ? 'Tagging' : 'Tag Selected'}
                </button>
                <button
                  onClick={() => void runWaifuTaggerForAll()}
                  disabled={batchTagging || items.every((item) => item.isVideo || item.waifuTagger.status === 'loading')}
                  className="inline-flex items-center gap-1.5 rounded border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition umbra-surface-soft hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchTagging ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {batchTagging ? 'Tagging Batch' : 'Tag All'}
                </button>
                {!isUmbraRemoteClient() ? (
                  <button
                    onClick={() => void revealInExplorer(selectedItem?.path)}
                    disabled={!selectedItem}
                    className="inline-flex items-center gap-1.5 rounded border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition umbra-surface-soft hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Show selected file in file explorer"
                  >
                    <FolderOpen size={14} />
                    Show in File Explorer
                  </button>
                ) : null}
                <button
                  onClick={clearAll}
                  className="p-2 rounded transition umbra-icon-button hover:text-red-400"
                  title="Clear All"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          )}
          {hideHeader && (
            <div className="flex items-center justify-end gap-2 border-b border-white/10 bg-black/20 px-3 py-1.5 backdrop-blur-xl z-10">
              <button
                onClick={() => selectedItem && runWaifuTaggerForItem(selectedItem)}
                disabled={batchTagging || !selectedItem || selectedItem.waifuTagger.status === 'loading' || selectedItem.isVideo}
                className="inline-flex items-center gap-1.5 rounded border border-[var(--umbra-accent)]/45 bg-[var(--umbra-accent)]/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:border-white/10 disabled:bg-zinc-800/60 disabled:text-zinc-500"
              >
                {selectedItem?.waifuTagger.status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {selectedItem?.waifuTagger.status === 'loading' ? 'Tagging' : 'Tag Selected'}
              </button>
              <button
                onClick={() => void runWaifuTaggerForAll()}
                disabled={batchTagging || items.every((item) => item.isVideo || item.waifuTagger.status === 'loading')}
                className="inline-flex items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition umbra-surface-soft hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchTagging ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {batchTagging ? 'Batch' : 'Tag All'}
              </button>
              {!isUmbraRemoteClient() ? (
                <button
                  onClick={() => void revealInExplorer(selectedItem?.path)}
                  disabled={!selectedItem}
                  className="inline-flex items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition umbra-surface-soft hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Show selected file in file explorer"
                >
                  <FolderOpen size={12} />
                  Explorer
                </button>
              ) : null}
              <button
                onClick={clearAll}
                className="p-1.5 rounded transition umbra-icon-button hover:text-red-400"
                title="Clear All"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(320px,1.15fr)_minmax(360px,1fr)]">
          <div className="flex min-h-0 items-center justify-center overflow-hidden border-r border-white/10 p-4 umbra-surface-deep">
            {!selectedItem ? (
              <div className="text-center umbra-text-faint">
                <Upload size={56} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Drag images into Waifu Diffusion</p>
                <p className="mt-1 text-xs umbra-text-muted">Then run Tag Selected</p>
              </div>
            ) : selectedItem.isVideo ? (
              <video src={selectedItem.blobUrl} controls className="h-full max-h-full w-full max-w-full rounded-md border border-white/10 object-contain shadow-2xl shadow-black/50 umbra-surface-soft" preload="metadata" />
            ) : (
              <img src={selectedItem.blobUrl} alt={selectedItem.name} className="h-full max-h-full w-full max-w-full rounded-md border border-white/10 object-contain shadow-2xl shadow-black/50 umbra-surface-soft" decoding="async" />
            )}
          </div>

          <div className="custom-scrollbar space-y-3 overflow-y-auto bg-[var(--umbra-bg)]/60 p-4">
            {!selectedItem ? null : (
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-[var(--umbra-text)] text-sm font-semibold truncate">{selectedItem.name}</h3>
                  <p className="text-[11px] umbra-text-faint">
                    {selectedItem.size > 0 ? formatBytes(selectedItem.size) : 'Path-backed media'}
                  </p>
                </div>
                <button
                  onClick={() => removeItem(selectedItem.id)}
                  className="ml-2 p-1 rounded transition umbra-icon-button hover:text-red-400"
                  title="Remove from queue"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
              <p className="text-[11px] umbra-text-faint uppercase tracking-wide mb-2">Model & Thresholds</p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <label className="text-[11px] umbra-text-faint">
                  Model
                  <select
                    value={waifuOptions.modelRepo}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, modelRepo: e.target.value }))}
                    className="umbra-input umbra-themed-select mt-1 w-full rounded px-2 py-1 text-xs"
                  >
                    {WAIFU_MODEL_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] umbra-text-faint">
                  Max Tags
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={waifuOptions.maxTags}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setWaifuOptions((prev) => ({
                        ...prev,
                        maxTags: Number.isFinite(next) ? Math.max(1, Math.min(500, Math.floor(next))) : prev.maxTags,
                      }));
                    }}
                    className="umbra-input mt-1 w-full rounded px-2 py-1 text-xs"
                  />
                </label>
              </div>

              <div className="space-y-2 mb-3">
                <label className="block text-[11px] umbra-text-faint">
                  General Threshold: {waifuOptions.generalThreshold.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={waifuOptions.generalThreshold}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, generalThreshold: Number(e.target.value) }))}
                    className="w-full mt-1 accent-[var(--umbra-accent)]"
                    disabled={waifuOptions.generalMcutEnabled}
                  />
                </label>
                <label className="block text-[11px] umbra-text-faint">
                  Character Threshold: {waifuOptions.characterThreshold.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={waifuOptions.characterThreshold}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, characterThreshold: Number(e.target.value) }))}
                    className="w-full mt-1 accent-[var(--umbra-accent)]"
                    disabled={waifuOptions.characterMcutEnabled}
                  />
                </label>
                <label className="block text-[11px] umbra-text-faint">
                  Rating Threshold: {waifuOptions.ratingThreshold.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={waifuOptions.ratingThreshold}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, ratingThreshold: Number(e.target.value) }))}
                    className="w-full mt-1 accent-[var(--umbra-accent)]"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-3 text-[11px] umbra-text-muted">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={waifuOptions.generalMcutEnabled}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, generalMcutEnabled: e.target.checked }))}
                    className="accent-[var(--umbra-accent)]"
                  />
                  Auto general threshold (MCut)
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={waifuOptions.characterMcutEnabled}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, characterMcutEnabled: e.target.checked }))}
                    className="accent-[var(--umbra-accent)]"
                  />
                  Auto character threshold (MCut)
                </label>
              </div>
            </div>

            <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
              <p className="text-[11px] umbra-text-faint uppercase tracking-wide mb-2">Booru Export Format</p>
              <div className="flex flex-wrap gap-3 text-[11px] umbra-text-muted mb-2">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={waifuOptions.exportUseUnderscores}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, exportUseUnderscores: e.target.checked }))}
                    className="accent-[var(--umbra-accent)]"
                  />
                  Replace spaces with underscores
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={waifuOptions.exportUseCommas}
                    onChange={(e) => setWaifuOptions((prev) => ({ ...prev, exportUseCommas: e.target.checked }))}
                    className="accent-[var(--umbra-accent)]"
                  />
                  Use commas between tags
                </label>
              </div>
              <label className="block text-[11px] umbra-text-faint">
                Prepend Tags
                <input
                  type="text"
                  value={waifuOptions.prependTags}
                  onChange={(e) => setWaifuOptions((prev) => ({ ...prev, prependTags: e.target.value }))}
                  placeholder="masterpiece, best_quality"
                  className="umbra-input mt-1 w-full rounded px-2 py-1 text-xs"
                />
              </label>

              <div className="mt-3 space-y-2">
                <p className="text-[11px] umbra-text-faint uppercase tracking-wide">Saved Prepend Presets</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={prependPresetDraft}
                    onChange={(e) => setPrependPresetDraft(e.target.value)}
                    placeholder="artist_name, style_tag"
                    className="umbra-input flex-1 rounded px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => addPrependPreset(prependPresetDraft)}
                    className="px-2 py-1 rounded text-[11px] font-semibold transition umbra-chip-neutral hover:brightness-110"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => addPrependPreset(waifuOptions.prependTags)}
                    className="px-2 py-1 rounded bg-[var(--umbra-accent)]/25 hover:bg-[var(--umbra-accent)]/35 text-white text-[11px] font-semibold"
                  >
                    Save Current
                  </button>
                </div>

                {prependPresets.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {prependPresets.map((preset) => (
                      <div key={preset} className="inline-flex items-center rounded umbra-chip-row">
                        <button
                          type="button"
                          onClick={() => applyPrependPreset(preset)}
                          className="px-2 py-1 text-[11px] umbra-text-muted hover:text-[var(--umbra-text)]"
                          title="Apply preset"
                        >
                          {preset}
                        </button>
                        <button
                          type="button"
                          onClick={() => removePrependPreset(preset)}
                          className="px-1 py-1 umbra-icon-button hover:text-red-400"
                          title="Remove preset"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] umbra-text-faint">No saved presets yet.</p>
                )}
              </div>
            </div>

            {selectedItem && selectedItem.waifuTagger.status === 'error' && (
              <div className="rounded bg-red-500/10 border border-red-500/30 p-2 text-xs text-red-300">
                {selectedItem.waifuTagger.error || 'Tagging failed'}
              </div>
            )}

            {selectedItem?.waifuTagger.status === 'done' && selectedItem.waifuTagger.result && (
              <div className="space-y-3">
                <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] umbra-text-faint uppercase tracking-wide">Booru Tags</p>
                    <button
                      onClick={() => copyToClipboard(booruExportString, 'Copied booru tags')}
                      className="p-1 rounded transition umbra-icon-button"
                      title="Copy booru tags"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--umbra-text)] mt-1 break-words">{booruExportString || 'No tags'}</p>
                </div>

                {Object.keys(selectedItem.waifuTagger.result.rating || {}).length > 0 && (
                  <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                    <p className="text-[11px] umbra-text-faint uppercase tracking-wide mb-1">Rating</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(selectedItem.waifuTagger.result.rating).map(([tag, score]) => (
                        <span key={tag} className="px-2 py-1 rounded text-[11px] umbra-chip-neutral">
                          {tag} ({(score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.waifuTagger.result.character.length > 0 && (
                  <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[11px] umbra-text-faint uppercase tracking-wide">Character Tags</p>
                      <button
                        onClick={() => copyToClipboard(selectedItem.waifuTagger.result?.characterTagString || '', 'Copied character tags')}
                        className="p-1 rounded transition umbra-icon-button"
                        title="Copy character tags"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItem.waifuTagger.result.character.map(({ tag, score }) => (
                        <span key={tag} className="px-2 py-1 rounded bg-[var(--umbra-accent)]/15 border border-[var(--umbra-accent)]/25 text-[11px] text-[var(--umbra-accent)]">
                          {tag} ({(score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.waifuTagger.result.general.length > 0 && (
                  <div className="glass-panel rounded-lg p-3 border-white/10 umbra-surface-soft">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[11px] umbra-text-faint uppercase tracking-wide">General Tags</p>
                      <button
                        onClick={() => copyToClipboard(selectedItem.waifuTagger.result?.generalTagString || '', 'Copied general tags')}
                        className="p-1 rounded transition umbra-icon-button"
                        title="Copy general tags"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItem.waifuTagger.result.general.map(({ tag, score }) => (
                        <span key={tag} className="px-2 py-1 rounded text-[11px] umbra-chip-neutral">
                          {tag} ({(score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
