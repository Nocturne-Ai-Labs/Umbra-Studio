import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Copy,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Loader2,
  Paintbrush,
  Sparkles,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { showInFileExplorer } from '@/utils/fileExplorer';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  stageUmbraUiMediaHandoff,
  type UmbraUiMediaHandoffMode,
} from '@/lib/umbraUiMediaHandoff';
import {
  getWaifuPrependPresetsSnapshot,
  normalizeWaifuPreset,
  setWaifuPrependPresets,
  subscribeWaifuPrependPresets,
} from '@/lib/waifuPrependPresets';
import { UmbraMediaInspectorFrame } from '@/components/umbra-ui/UmbraMediaInspectorFrame';
import { CensorIconButton, censorButton } from '@/components/umbra-ui/UmbraCensorReviewViewer';

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
  style?: WaifuTagScore[];
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

interface NaturalCaptionResult {
  modelRepo: string;
  device: string;
  maxNewTokens: number;
  caption: string;
}

interface NaturalCaptionState {
  status: 'idle' | 'loading' | 'done' | 'error';
  result?: NaturalCaptionResult;
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
  naturalCaption: NaturalCaptionState;
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
  { id: 'pixai-labs/pixai-tagger-v1.0', label: 'PixAI Tagger v1.0' },
];
const NATURAL_MODEL_OPTIONS = [
  {
    id: 'prithivMLmods/Qwen2-VL-2B-Abliterated-Caption-it',
    label: 'Qwen2-VL 2B Uncensored',
  },
];

type VisualAnalysisMode = 'tags' | 'caption';

export function WaifuDiffusionWorkspace({
  hideHeader = false,
  active: activeOverride,
  remoteMode = 'desktop',
}: {
  hideHeader?: boolean;
  active?: boolean;
  remoteMode?: string;
}) {
  const [items, setItems] = useState<WaifuItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchTagging, setBatchTagging] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<VisualAnalysisMode>('tags');
  const itemsRef = useRef<WaifuItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inspectorTab, setInspectorTab] = useState<'settings' | 'results'>('settings');
  const requests = useRef(new Map<string, AbortController>()), stopBatch = useRef(false), mounted = useRef(true), importEpoch = useRef(0);
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
  const [captionOptions, setCaptionOptions] = useState<{
    modelRepo: string;
    device: 'auto' | 'cpu' | 'cuda';
    maxNewTokens: number;
  }>({
    modelRepo: NATURAL_MODEL_OPTIONS[0].id,
    device: 'auto',
    maxNewTokens: 192,
  });
  const { activeWorkspace, setActiveWorkspace, showToast, ui, clearScannedImport } = useStore();
  const prependPresets = useSyncExternalStore(
    subscribeWaifuPrependPresets,
    getWaifuPrependPresetsSnapshot,
    () => []
  );

  const isActive = activeOverride
    ?? (activeWorkspace === 'imageinspector' && ui.imageInspectorTab === 'waifu');
  const interruptAnalysis = useCallback((itemId?: string) => {
    for (const [key, controller] of requests.current) {
      if (!itemId || key.endsWith(`:${itemId}`)) { controller.abort(); requests.current.delete(key); }
    }
    if (!itemId) { stopBatch.current = true; importEpoch.current += 1; setIsDragging(false); }
    setItems(current => current.map(item => itemId && item.id !== itemId ? item : {
      ...item,
      waifuTagger: item.waifuTagger.status === 'loading' ? { status: item.waifuTagger.result ? 'done' : 'idle', result: item.waifuTagger.result } : item.waifuTagger,
      naturalCaption: item.naturalCaption.status === 'loading' ? { status: item.naturalCaption.result ? 'done' : 'idle', result: item.naturalCaption.result } : item.naturalCaption,
    }));
  }, []);
  useEffect(() => { if (!isActive) interruptAnalysis(); }, [isActive, interruptAnalysis]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    clearLegacyWaifuPersistence();
    mounted.current = true;
    return () => {
      mounted.current = false; stopBatch.current = true; importEpoch.current += 1;
      for (const controller of requests.current.values()) controller.abort(); requests.current.clear();
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
      naturalCaption: { status: 'idle' },
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
        naturalCaption: { status: 'idle' },
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

  const importFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const epoch = importEpoch.current;
    for (const file of files) {
      if (epoch !== importEpoch.current) break;
      const osPath = String((file as File & { path?: string })?.path || '').trim();
      if (osPath) {
        await loadFromPath(osPath);
      } else {
        await loadFile(file, file.name);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }, [loadFile, loadFromPath]);

  const handleFileSelection = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files?.length) await importFiles(files);
  }, [importFiles]);

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
    const epoch = importEpoch.current;
    const importQueuedPaths = async () => {
      for (const path of uniquePaths) {
        if (cancelled || epoch !== importEpoch.current) return;
        await loadFromPath(path);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      if (!cancelled && epoch === importEpoch.current) clearScannedImport();
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
    const epoch = importEpoch.current;

    const galleryPaths = readGalleryDragPaths(e.dataTransfer);
    if (galleryPaths.length > 0) {
      for (const path of galleryPaths) {
        if (epoch !== importEpoch.current) return;
        await loadFromPath(path);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await importFiles(e.dataTransfer.files);
      return;
    }

    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (!jsonData) return;
      const data = JSON.parse(jsonData);
      if (data.type === 'multi-select' && Array.isArray(data.images)) {
        for (const image of data.images) {
          if (epoch !== importEpoch.current) return;
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
  }, [importFiles, isActive, loadFromPath]);

  const selectedItem = items.find((item) => item.id === selectedId);

  const clearAll = useCallback(() => {
    interruptAnalysis();
    clearScannedImport();
    for (const item of items) revokeWaifuItemUrl(item);
    setItems([]);
    setSelectedId(null);
    clearLegacyWaifuPersistence();
  }, [clearScannedImport, interruptAnalysis, items]);

  const removeItem = useCallback((id: string) => {
    interruptAnalysis(id);
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) revokeWaifuItemUrl(target);
      const next = prev.filter((item) => item.id !== id);
      setSelectedId((current) => (current === id ? (next[0]?.id || null) : current));
      return next;
    });
  }, [interruptAnalysis]);

  const setItemTaggerState = useCallback((itemId: string, nextState: WaifuTaggerState) => {
    setItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, waifuTagger: nextState } : item
    )));
  }, []);

  const setItemCaptionState = useCallback((itemId: string, nextState: NaturalCaptionState) => {
    setItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, naturalCaption: nextState } : item
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
    const key = `tags:${item.id}`;
    if (requests.current.has(key) || !mounted.current || !itemsRef.current.some(entry => entry.id === item.id)) return false;
    if (item.isVideo) {
      showToast('Waifu tagger only supports images', 'error');
      return;
    }

    const controller = new AbortController(); requests.current.set(key, controller);
    setItemTaggerState(item.id, { status: 'loading', result: item.waifuTagger.result });

    try {
      const normalizedPath = String(item.path || '').trim();
      const hasPath = normalizedPath.length > 0 && /[\\/]/.test(normalizedPath);
      const endpoint = '/api/metadata/tag-waifu';
      let response: Response;

      if (hasPath) {
        response = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
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
        response = await fetch(endpoint, { method: 'POST', body: formData, signal: controller.signal });
      }

      const payload = await response.json().catch(() => null) as (WaifuTagResult & { error?: string; success?: boolean }) | null;
      controller.signal.throwIfAborted();
      if (requests.current.get(key) !== controller || !mounted.current) return false;
      if (!response.ok || !payload || payload.error || payload.success === false) {
        const message = payload?.error || `Tagging failed (${response.status})`;
        throw new Error(message);
      }

      setItemTaggerState(item.id, { status: 'done', result: payload });
      return true;
    } catch (error: any) {
      if (controller.signal.aborted || requests.current.get(key) !== controller || !mounted.current) return false;
      const errorMessage = error?.message || 'Tagging failed';
      setItemTaggerState(item.id, { status: 'error', error: errorMessage });
      showToast(errorMessage, 'error');
      return false;
    } finally { if (requests.current.get(key) === controller) requests.current.delete(key); }
  }, [setItemTaggerState, showToast, waifuOptions]);

  const runNaturalCaptionForItem = useCallback(async (item: WaifuItem) => {
    const key = `caption:${item.id}`;
    if (requests.current.has(key) || !mounted.current || !itemsRef.current.some(entry => entry.id === item.id)) return false;
    if (item.isVideo) {
      showToast('Natural captioning only supports images', 'error');
      return;
    }

    const controller = new AbortController(); requests.current.set(key, controller);
    setItemCaptionState(item.id, { status: 'loading', result: item.naturalCaption.result });
    try {
      const normalizedPath = String(item.path || '').trim();
      const hasPath = normalizedPath.length > 0 && /[\\/]/.test(normalizedPath);
      let response: Response;
      if (hasPath) {
        response = await fetch('/api/metadata/caption-image', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: normalizedPath,
            modelRepo: captionOptions.modelRepo,
            device: captionOptions.device,
            maxNewTokens: captionOptions.maxNewTokens,
          }),
        });
      } else {
        if (!item.blob) {
          throw new Error('This image is no longer available in memory. Drop it again or use a saved file path.');
        }
        const formData = new FormData();
        formData.append('image', item.blob, item.name);
        formData.append('modelRepo', captionOptions.modelRepo);
        formData.append('device', captionOptions.device);
        formData.append('maxNewTokens', String(captionOptions.maxNewTokens));
        response = await fetch('/api/metadata/caption-image', { method: 'POST', body: formData, signal: controller.signal });
      }

      const payload = await response.json().catch(() => null) as (NaturalCaptionResult & {
        error?: string;
        success?: boolean;
      }) | null;
      controller.signal.throwIfAborted();
      if (requests.current.get(key) !== controller || !mounted.current) return false;
      if (!response.ok || !payload || payload.error || payload.success === false) {
        throw new Error(payload?.error || `Captioning failed (${response.status})`);
      }
      setItemCaptionState(item.id, { status: 'done', result: payload });
      return true;
    } catch (error: any) {
      if (controller.signal.aborted || requests.current.get(key) !== controller || !mounted.current) return false;
      const errorMessage = error?.message || 'Captioning failed';
      setItemCaptionState(item.id, { status: 'error', error: errorMessage });
      showToast(errorMessage, 'error');
      return false;
    } finally { if (requests.current.get(key) === controller) requests.current.delete(key); }
  }, [captionOptions, setItemCaptionState, showToast]);

  const runSelectedAnalysis = useCallback(async () => {
    if (!selectedItem) return;
    if (analysisMode === 'caption') {
      await runNaturalCaptionForItem(selectedItem);
    } else {
      await runWaifuTaggerForItem(selectedItem);
    }
  }, [analysisMode, runNaturalCaptionForItem, runWaifuTaggerForItem, selectedItem]);

  const runAnalysisForAll = useCallback(async () => {
    if (batchTagging) return;
    const analyzableItems = itemsRef.current.filter((item) => (
      !item.isVideo
      && (analysisMode === 'caption'
        ? item.naturalCaption.status !== 'loading'
        : item.waifuTagger.status !== 'loading')
    ));
    if (analyzableItems.length === 0) {
      showToast('No images ready to analyze', 'error');
      return;
    }
    setBatchTagging(true);
    stopBatch.current = false;
    try {
      let completed = 0;
      for (const item of analyzableItems) {
        if (stopBatch.current || !mounted.current) break;
        if (!itemsRef.current.some(current => current.id === item.id)) continue;
        const success = analysisMode === 'caption'
          ? await runNaturalCaptionForItem(item)
          : await runWaifuTaggerForItem(item);
        if (success) completed += 1;
      }
      if (stopBatch.current || !mounted.current) return;
      const failed = analyzableItems.length - completed;
      showToast(
        `${analysisMode === 'caption' ? 'Captioned' : 'Tagged'} ${completed} image${completed === 1 ? '' : 's'}${failed ? `. ${failed} failed; retained for retry.` : ''}`,
        failed ? 'error' : 'success',
      );
    } finally {
      if (mounted.current) setBatchTagging(false);
    }
  }, [analysisMode, batchTagging, runNaturalCaptionForItem, runWaifuTaggerForItem, showToast]);

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
  const naturalCaptionText = String(selectedItem?.naturalCaption.result?.caption || '').trim();
  const inspectorPromptText = naturalCaptionText || booruExportString;

  const ensureHandoffPath = useCallback(async (item: WaifuItem): Promise<string> => {
    const normalizedPath = String(item.path || '').trim();
    if (normalizedPath && /[\\/]/.test(normalizedPath)) return normalizedPath;
    if (!item.blob) throw new Error('Drop the image again before sending it to Umbra UI.');

    const formData = new FormData();
    formData.append('files', item.blob, item.name);
    formData.append('destination', 'User/Temp/ImageInspector');
    formData.append('checkDuplicates', 'false');
    const response = await fetch('/api/fs/upload', { method: 'POST', body: formData });
    const payload = await response.json().catch(() => null) as {
      error?: string;
      results?: Array<{ success?: boolean; path?: string; error?: string }>;
    } | null;
    const uploaded = payload?.results?.find((entry) => entry.success && entry.path);
    if (!response.ok || !uploaded?.path) {
      throw new Error(payload?.error || payload?.results?.find((entry) => entry.error)?.error || 'Failed to stage the image');
    }
    setItems((prev) => prev.map((entry) => (
      entry.id === item.id ? { ...entry, path: String(uploaded.path) } : entry
    )));
    return String(uploaded.path);
  }, []);

  const sendSelectedToUmbraUi = useCallback(async (mode: UmbraUiMediaHandoffMode) => {
    if (!selectedItem || selectedItem.isVideo) return;
    try {
      const path = await ensureHandoffPath(selectedItem);
      setActiveWorkspace('umbraui');
      await stageUmbraUiMediaHandoff({
        mode,
        path,
        name: selectedItem.name,
        imageUrl: `/api/fs/image?${new URLSearchParams({ path }).toString()}`,
        source: 'image-inspector',
        promptText: inspectorPromptText || undefined,
        promptLabel: naturalCaptionText ? 'Natural Caption' : 'Booru Tags',
      });
      const label = mode === 'txt2img'
        ? 'TXT2IMG'
        : mode === 'img2img'
          ? 'IMG2IMG'
          : mode === 'inpaint'
            ? 'Inpaint'
            : 'IMG2VID';
      showToast(`Sent image and ${inspectorPromptText ? 'analysis prompt' : 'metadata'} to ${label}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to send image to Umbra UI', 'error');
    }
  }, [
    ensureHandoffPath,
    inspectorPromptText,
    naturalCaptionText,
    selectedItem,
    setActiveWorkspace,
    showToast,
  ]);

  const addPrependPreset = useCallback(async (rawPreset: string) => {
    const preset = normalizeWaifuPreset(rawPreset);
    if (!preset) {
      showToast('Enter tags to save as a preset', 'error');
      return;
    }

    try {
      await setWaifuPrependPresets((currentPresets) => {
        if (currentPresets.some((entry) => entry.toLowerCase() === preset.toLowerCase())) {
          throw new Error('Preset already exists');
        }
        return [preset, ...currentPresets];
      });
      setPrependPresetDraft((current) => normalizeWaifuPreset(current) === preset ? '' : current);
      showToast('Saved prepend preset', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save prepend preset', 'error');
    }
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

  const removePrependPreset = useCallback(async (preset: string) => {
    try {
      await setWaifuPrependPresets((currentPresets) => currentPresets.filter((entry) => entry !== preset));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to remove prepend preset', 'error');
    }
  }, [showToast]);

  const selectedStatus = analysisMode === 'caption' ? selectedItem?.naturalCaption.status : selectedItem?.waifuTagger.status;
  const runDisabled = batchTagging || !selectedItem || selectedItem.isVideo || selectedStatus === 'loading';
  return <UmbraMediaInspectorFrame kind="visual" title={hideHeader ? 'Image Analysis' : 'Visual Analysis'} remoteMode={remoteMode}
    items={items.map(item => ({ ...item, status: analysisMode === 'caption' ? item.naturalCaption.status : item.waifuTagger.status }))}
    selectedId={selectedId} onSelect={setSelectedId} onAdd={() => fileInputRef.current?.click()} onRemove={removeItem} onClear={clearAll}
    status={batchTagging ? 'Analyzing batch' : selectedStatus === 'loading' ? 'Analyzing selected image' : selectedItem ? selectedItem.name + (selectedItem.size ? ' · ' + formatBytes(selectedItem.size) : '') : undefined}
    input={<input ref={fileInputRef} aria-label="Import analysis media" type="file" accept="image/*,video/*" multiple hidden onChange={event => void handleFileSelection(event)} />}
    isDragging={isDragging} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    actions={<>
      <button type="button" className={censorButton} disabled={runDisabled} onClick={() => { setInspectorTab('results'); void runSelectedAnalysis(); }}>{selectedStatus === 'loading' ? <Loader2 size={15} className="animate-spin" /> : analysisMode === 'caption' ? <FileText size={15} /> : <Tags size={15} />}{analysisMode === 'caption' ? 'Caption selected' : 'Tag selected'}</button>
      <button type="button" className={censorButton} disabled={batchTagging || !items.some(item => !item.isVideo)} onClick={() => { setInspectorTab('results'); void runAnalysisForAll(); }}><Sparkles size={15} />{analysisMode === 'caption' ? 'Caption all' : 'Tag all'}</button>
      {batchTagging && <button type="button" className={censorButton} onClick={() => { stopBatch.current = true; }}>Stop after current</button>}
      {remoteMode !== 'phone' && !isUmbraRemoteClient() && <CensorIconButton title="Show selected file in file explorer" disabled={!selectedItem || !/[\\/]/.test(selectedItem.path)} onClick={() => void revealInExplorer(selectedItem?.path)}><FolderOpen size={15} /></CensorIconButton>}
    </>}
    detailsTitle="Analysis inspector" details={<div data-umbra-visual-analysis-controls="" className="space-y-3">
      <div className="flex gap-1 border-b border-white/10 pb-2"><button type="button" className={censorButton} aria-pressed={inspectorTab === 'settings'} onClick={() => setInspectorTab('settings')}>Settings</button><button type="button" className={censorButton} aria-pressed={inspectorTab === 'results'} onClick={() => setInspectorTab('results')}>Results</button></div>
      <div className={inspectorTab === 'settings' ? 'space-y-3' : 'hidden'}>
            <div className="rounded border border-white/10 p-3 umbra-surface-soft">
              <p className="mb-2 text-[11px] uppercase tracking-wide umbra-text-faint">Analysis Type</p>
              <div className="mb-3 grid grid-cols-2 rounded border border-white/10 bg-black/30 p-1">
                <button
                  type="button"
                  onClick={() => setAnalysisMode('tags')}
                  className={`inline-flex min-h-9 items-center justify-center gap-2 rounded px-3 text-xs font-semibold uppercase tracking-wide transition ${
                    analysisMode === 'tags'
                      ? 'bg-[var(--umbra-accent)]/25 text-white'
                      : 'umbra-text-muted hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Tags size={14} />
                  Booru Tags
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisMode('caption')}
                  className={`inline-flex min-h-9 items-center justify-center gap-2 rounded px-3 text-xs font-semibold uppercase tracking-wide transition ${
                    analysisMode === 'caption'
                      ? 'bg-[var(--umbra-accent)]/25 text-white'
                      : 'umbra-text-muted hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <FileText size={14} />
                  Natural Caption
                </button>
              </div>

              {analysisMode === 'caption' ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="text-[11px] umbra-text-faint sm:col-span-3">
                    Caption Model
                    <UmbraSelectControl
                      value={captionOptions.modelRepo}
                      onChange={(event) => setCaptionOptions((prev) => ({ ...prev, modelRepo: event.target.value }))}
                      className="umbra-input umbra-themed-select mt-1 w-full rounded px-2 py-2 text-xs"
                    >
                      {NATURAL_MODEL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </UmbraSelectControl>
                  </label>
                  <label className="text-[11px] umbra-text-faint">
                    Device
                    <UmbraSelectControl
                      value={captionOptions.device}
                      onChange={(event) => setCaptionOptions((prev) => ({
                        ...prev,
                        device: event.target.value as 'auto' | 'cpu' | 'cuda',
                      }))}
                      className="umbra-input umbra-themed-select mt-1 w-full rounded px-2 py-2 text-xs"
                    >
                      <option value="auto">Auto</option>
                      <option value="cpu">CPU</option>
                      <option value="cuda">GPU</option>
                    </UmbraSelectControl>
                  </label>
                  <label className="text-[11px] umbra-text-faint sm:col-span-2">
                    Caption Length
                    <input
                      type="number"
                      min={32}
                      max={512}
                      step={8}
                      value={captionOptions.maxNewTokens}
                      onChange={(event) => setCaptionOptions((prev) => ({
                        ...prev,
                        maxNewTokens: Math.max(32, Math.min(512, Math.floor(Number(event.target.value) || 32))),
                      }))}
                      className="umbra-input mt-1 w-full rounded px-2 py-2 text-xs"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <label className="text-[11px] umbra-text-faint">
                      Model
                      <UmbraSelectControl
                        value={waifuOptions.modelRepo}
                        onChange={(event) => setWaifuOptions((prev) => {
                          const pixai = event.target.value === 'pixai-labs/pixai-tagger-v1.0';
                          return { ...prev, modelRepo: event.target.value,
                            generalThreshold: pixai ? 0.17 : 0.35,
                            characterThreshold: pixai ? 0.27 : 0.85,
                            ratingThreshold: pixai ? 0.41 : 0.25,
                            generalMcutEnabled: false, characterMcutEnabled: false };
                        })}
                        className="umbra-input umbra-themed-select mt-1 w-full rounded px-2 py-1 text-xs"
                      >
                        {WAIFU_MODEL_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </UmbraSelectControl>
                    </label>
                    <label className="text-[11px] umbra-text-faint">
                      Max Tags
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={waifuOptions.maxTags}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setWaifuOptions((prev) => ({
                            ...prev,
                            maxTags: Number.isFinite(next) ? Math.max(1, Math.min(500, Math.floor(next))) : prev.maxTags,
                          }));
                        }}
                        className="umbra-input mt-1 w-full rounded px-2 py-1 text-xs"
                      />
                    </label>
                  </div>

                  <div className="mb-3 space-y-2">
                    <label className="block text-[11px] umbra-text-faint">
                      General Threshold: {waifuOptions.generalThreshold.toFixed(2)}
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={waifuOptions.generalThreshold}
                        onChange={(event) => setWaifuOptions((prev) => ({ ...prev, generalThreshold: Number(event.target.value) }))}
                        className="mt-1 w-full accent-[var(--umbra-accent)]"
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
                        onChange={(event) => setWaifuOptions((prev) => ({ ...prev, characterThreshold: Number(event.target.value) }))}
                        className="mt-1 w-full accent-[var(--umbra-accent)]"
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
                        onChange={(event) => setWaifuOptions((prev) => ({ ...prev, ratingThreshold: Number(event.target.value) }))}
                        className="mt-1 w-full accent-[var(--umbra-accent)]"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3 text-[11px] umbra-text-muted">
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={waifuOptions.generalMcutEnabled}
                        disabled={waifuOptions.modelRepo === 'pixai-labs/pixai-tagger-v1.0'}
                        onChange={(event) => setWaifuOptions((prev) => ({ ...prev, generalMcutEnabled: event.target.checked }))}
                        className="accent-[var(--umbra-accent)]"
                      />
                      Auto general threshold (MCut)
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={waifuOptions.characterMcutEnabled}
                        disabled={waifuOptions.modelRepo === 'pixai-labs/pixai-tagger-v1.0'}
                        onChange={(event) => setWaifuOptions((prev) => ({ ...prev, characterMcutEnabled: event.target.checked }))}
                        className="accent-[var(--umbra-accent)]"
                      />
                      Auto character threshold (MCut)
                    </label>
                  </div>
                </>
              )}
            </div>

            {analysisMode === 'tags' ? (
            <div className="rounded border p-3 border-white/10 umbra-surface-soft">
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
            ) : null}


      </div>
      <div data-umbra-analysis-results="" className={inspectorTab === 'results' ? 'space-y-3' : 'hidden'}>
        {selectedStatus === 'loading' && <p role="status" className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 size={14} className="animate-spin" />Analyzing image</p>}
        {(!selectedItem || (selectedItem.waifuTagger.status === 'idle' && selectedItem.naturalCaption.status === 'idle')) && <p className="text-xs text-zinc-500">Choose settings, then analyze an image to view its tags or caption.</p>}
            {selectedItem?.naturalCaption.status === 'error' ? (
              <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {selectedItem.naturalCaption.error || 'Captioning failed'}
              </div>
            ) : null}

            {selectedItem?.naturalCaption.status === 'done' && naturalCaptionText ? (
              <div className="rounded border border-white/10 p-3 umbra-surface-soft">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide umbra-text-faint">Natural Caption</p>
                    <p className="mt-0.5 text-[10px] umbra-text-faint">
                      {selectedItem.naturalCaption.result?.device?.toUpperCase()} · {selectedItem.naturalCaption.result?.maxNewTokens} tokens max
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(naturalCaptionText, 'Copied natural caption')}
                    className="rounded p-1.5 transition umbra-icon-button"
                    title="Copy natural caption"
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <p className="mt-2 break-words text-sm leading-6 text-[var(--umbra-text)]">{naturalCaptionText}</p>
              </div>
            ) : null}

            {selectedItem && !selectedItem.isVideo ? (
              <div className="rounded border border-[var(--umbra-accent)]/25 p-3 umbra-surface-soft">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--umbra-accent)]">Send To Umbra UI</p>
                    <p className="mt-0.5 text-[10px] umbra-text-faint">
                      {inspectorPromptText ? 'Uses the current caption or tags as the positive prompt.' : 'Uses embedded image metadata when available.'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void sendSelectedToUmbraUi('txt2img')}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/10 px-2 text-xs font-semibold uppercase tracking-wide transition hover:border-[var(--umbra-accent)]/45 hover:bg-[var(--umbra-accent)]/10"
                    title="Use this analysis prompt in TXT2IMG"
                  >
                    <ImageIcon size={14} />
                    TXT2IMG
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendSelectedToUmbraUi('img2img')}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/10 px-2 text-xs font-semibold uppercase tracking-wide transition hover:border-[var(--umbra-accent)]/45 hover:bg-[var(--umbra-accent)]/10"
                    title="Use this image as the IMG2IMG source"
                  >
                    <Images size={14} />
                    IMG2IMG
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendSelectedToUmbraUi('inpaint')}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/10 px-2 text-xs font-semibold uppercase tracking-wide transition hover:border-[var(--umbra-accent)]/45 hover:bg-[var(--umbra-accent)]/10"
                    title="Open this image in Inpaint"
                  >
                    <Paintbrush size={14} />
                    Inpaint
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendSelectedToUmbraUi('video')}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/10 px-2 text-xs font-semibold uppercase tracking-wide transition hover:border-[var(--umbra-accent)]/45 hover:bg-[var(--umbra-accent)]/10"
                    title="Use this image as the first IMG2VID frame"
                  >
                    <Film size={14} />
                    IMG2VID
                  </button>
                </div>
              </div>
            ) : null}

            {selectedItem && selectedItem.waifuTagger.status === 'error' && (
              <div role="alert" className="rounded bg-red-500/10 border border-red-500/30 p-2 text-xs text-red-300">
                {selectedItem.waifuTagger.error || 'Tagging failed'}
              </div>
            )}

            {selectedItem?.waifuTagger.status === 'done' && selectedItem.waifuTagger.result && (
              <div className="space-y-3">
                <div className="rounded border p-3 border-white/10 umbra-surface-soft">
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
                  <div className="rounded border p-3 border-white/10 umbra-surface-soft">
                    <p className="text-[11px] umbra-text-faint uppercase tracking-wide mb-1">Rating</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(selectedItem.waifuTagger.result.rating).map(([tag, score]) => (
                        <span key={tag} className="px-2 py-1 rounded text-[11px] umbra-chip-neutral">
                          <span data-i18n-skip="">{tag}</span> ({(score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.waifuTagger.result.character.length > 0 && (
                  <div className="rounded border p-3 border-white/10 umbra-surface-soft">
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
                          <span data-i18n-skip="">{tag}</span> ({(score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.waifuTagger.result.general.length > 0 && (
                  <div className="rounded border p-3 border-white/10 umbra-surface-soft">
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
                          <span data-i18n-skip="">{tag}</span> ({(score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(selectedItem.waifuTagger.result.style?.length || 0) > 0 && (
                  <div className="rounded border p-3 border-white/10 umbra-surface-soft">
                    <p className="text-[11px] umbra-text-faint uppercase tracking-wide mb-1">Style Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedItem.waifuTagger.result.style?.map(({ tag, score }) => (
                        <span key={tag} className="px-2 py-1 rounded text-[11px] umbra-chip-neutral">
                          <span data-i18n-skip="">{tag}</span> ({(score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

      </div>
    </div>} />;

}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
