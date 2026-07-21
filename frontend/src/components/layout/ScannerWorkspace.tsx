import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileJson, Upload, Trash2, X, Copy, Download } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { loadAppSettings, subscribeToAppSettings } from '@/lib/appSettings';
import { extractMetadataFromPath, getComfyUiJsonText, getLegacyGenerationParametersText, getWorkflowJsonExport } from '@/utils/metadata';

interface ScanItem {
  id: string;
  path: string;
  name: string;
  blob?: Blob;
  blobUrl: string;
  previewUrl?: string;
  ownsBlobUrl: boolean;
  metadata: any;
  isVideo: boolean;
}

const SCANNER_WORKSPACE_PERSIST_KEY = 'umbra_scanner_workspace_paths_v1';
const GALLERY_DRAG_PATHS_MIME = 'application/x-umbra-gallery-paths';

const normalizePersistPath = (input: string): string => String(input || '').replace(/\\/g, '/').trim();

const buildFsMediaUrl = (path: string): string => {
  const normalized = normalizePersistPath(path);
  return normalized ? `/api/fs/image?path=${encodeURIComponent(normalized)}` : '';
};

const buildFsThumbnailUrl = (path: string): string => {
  const normalized = normalizePersistPath(path);
  return normalized ? `/api/fs/thumbnail?path=${encodeURIComponent(normalized)}&size=small&q=70&fit=cover&lane=scanner` : '';
};

const clearLegacyScannerPersistence = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SCANNER_WORKSPACE_PERSIST_KEY);
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

export function ScannerWorkspace({ hideHeader = false }: { hideHeader?: boolean }) {
  const [items, setItems] = useState<ScanItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const itemsRef = useRef<ScanItem[]>([]);
  const [scannerPrefs, setScannerPrefs] = useState(() => {
    const settings = loadAppSettings();
    return {
      autoCopyWorkflow: settings['scanner.autoCopyWorkflow'] !== false,
      showRawMetadata: settings['scanner.showRawMetadata'] === true,
    };
  });
  const { activeWorkspace, ui, clearScannedImport } = useStore();

  const copyExportText = useCallback(async (text: string | null) => {
    if (!text || !navigator?.clipboard?.writeText) return;
    await navigator.clipboard.writeText(text);
  }, []);

  const downloadExportText = useCallback((text: string | null, filename: string) => {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const isActive = activeWorkspace === 'scanner' || (activeWorkspace === 'imageinspector' && ui.imageInspectorTab === 'scanner');
  const scannerCardClass = 'glass-panel umbra-surface-soft rounded-lg border-white/10 p-3';
  const scannerLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.16em] umbra-text-faint';
  const scannerToolButtonClass = 'inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300 transition hover:border-[var(--umbra-accent)]/45 hover:text-white';

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    clearLegacyScannerPersistence();
    return () => {
      for (const item of itemsRef.current) {
        if (item.ownsBlobUrl) URL.revokeObjectURL(item.blobUrl);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAppSettings((settings) => {
      setScannerPrefs({
        autoCopyWorkflow: settings['scanner.autoCopyWorkflow'] !== false,
        showRawMetadata: settings['scanner.showRawMetadata'] === true,
      });
    });
    return () => unsubscribe();
  }, []);

  // Native drag and drop handlers.
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

  // Load file as blob and extract metadata
  const loadFile = useCallback(async (blob: Blob, filename: string, path?: string) => {
    const isVideo = filename.match(/\.(mp4|webm|mov)$/i);
    const blobUrl = URL.createObjectURL(blob);
    const nextPath = path || filename;
    const nextPathNormalized = normalizePersistPath(nextPath);

    // Extract metadata for images
    let metadata: any = {
      type: isVideo ? 'video' : 'image',
      name: filename,
      size: blob.size,
    };

    if (!isVideo) {
      // Try to extract PNG metadata
      try {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        metadata = await extractPNGMetadata(bytes, metadata);
      } catch (error) {
        console.error('[ScannerWorkspace] Failed to extract metadata:', error);
      }
    }

    if (!isVideo && scannerPrefs.autoCopyWorkflow && (metadata.workflow || metadata.prompt)) {
      try {
        const workflowValue = metadata.workflow || metadata.prompt;
        const workflowText = typeof workflowValue === 'string'
          ? workflowValue
          : JSON.stringify(workflowValue, null, 2);
        if (workflowText && navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(workflowText);
        }
      } catch (error) {
        console.warn('[ScannerWorkspace] Failed to auto-copy workflow:', error);
      }
    }

    const item: ScanItem = {
      id: Date.now().toString() + Math.random(),
      path: nextPath,
      name: filename,
      blob,
      blobUrl,
      previewUrl: blobUrl,
      ownsBlobUrl: true,
      metadata,
      isVideo: !!isVideo,
    };

    setItems((prev) => {
      const existing = prev.find((entry) => normalizePersistPath(entry.path) === nextPathNormalized);
      if (existing) {
        URL.revokeObjectURL(blobUrl);
        setSelectedId(existing.id);
        return prev;
      }
      setSelectedId(item.id);
      return [item, ...prev];
    });
  }, [scannerPrefs.autoCopyWorkflow]);

  // Load file from filesystem path
  const loadFromPath = useCallback(async (path: string) => {
    try {
      const filename = path.split(/[/\\]/).pop() || 'unknown';
      const normalizedPath = normalizePersistPath(path);
      if (!normalizedPath) return;
      const isVideo = /\.(mp4|webm|mov)$/i.test(filename);
      const metadata = await extractMetadataFromPath(normalizedPath) || {
        type: isVideo ? 'video' : 'image',
        name: filename,
        size: 0,
      };
      const item: ScanItem = {
        id: Date.now().toString() + Math.random(),
        path: normalizedPath,
        name: filename,
        blobUrl: buildFsMediaUrl(normalizedPath),
        previewUrl: buildFsThumbnailUrl(normalizedPath),
        ownsBlobUrl: false,
        metadata: {
          type: isVideo ? 'video' : 'image',
          name: filename,
          size: Number((metadata as any)?.size || 0),
          ...metadata,
        },
        isVideo: !!isVideo,
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
      console.error('[ScannerWorkspace] Failed to load from path:', error);
    }
  }, []);

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

    // Check for native OS file drops
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

    // Check for filmstrip drops (custom drag data)
    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        const data = JSON.parse(jsonData);

        // Handle single image
    if (data.type === 'filmstrip-image' || data.type === 'library-image' || data.type === 'image') {
          const path = data.image?.path || data.image?.relativePath || data.path;
          if (path) {
            await loadFromPath(path);
          }
        }

        // Handle multi-select
        if (data.type === 'multi-select' && data.images) {
          const images = Array.isArray(data.images) ? data.images : [];
          for (const image of images) {
            const path = image?.path || image?.relativePath;
            if (path) {
              await loadFromPath(path);
              await new Promise((resolve) => window.setTimeout(resolve, 0));
            }
          }
        }
      }
    } catch (error) {
      console.error('[ScannerWorkspace] Failed to parse drop data:', error);
    }
  }, [isActive, loadFile, loadFromPath]);

  const selectedItem = items.find(i => i.id === selectedId);

  const clearAll = () => {
    items.forEach(item => {
      if (item.ownsBlobUrl) URL.revokeObjectURL(item.blobUrl);
    });
    setItems([]);
    setSelectedId(null);
    clearLegacyScannerPersistence();
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.ownsBlobUrl) URL.revokeObjectURL(item.blobUrl);
      const remaining = prev.filter((i) => i.id !== id);
      setSelectedId((current) => (current === id ? (remaining[0]?.id || null) : current));
      return remaining;
    });
  };
  // Render metadata display
  const renderMetadata = (item: ScanItem) => {
    const parsed = parseGenerationParams(item.metadata);
    const workflowExport = getWorkflowJsonExport(item.metadata);
    const comfyJsonText = workflowExport?.text ?? getComfyUiJsonText(item.metadata);
    const legacyParametersText = getLegacyGenerationParametersText(item.metadata);
    const exportStem = item.name.replace(/\.[^.]+$/, '') || 'metadata';

    return (
      <div className="space-y-3">
        {/* Generation Parameters */}
        {parsed.hasParams && (
          <>
            {/* Positive Prompt */}
            {parsed.positive && (
              <div className={scannerCardClass}>
                <h4 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.45)]"></span>
                  Positive Prompt
                </h4>
                <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {parsed.positive}
                </p>
              </div>
            )}

            {/* Negative Prompt */}
            {parsed.negative && (
              <div className={scannerCardClass}>
                <h4 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-300 shadow-[0_0_10px_rgba(252,165,165,0.45)]"></span>
                  Negative Prompt
                </h4>
                <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {parsed.negative}
                </p>
              </div>
            )}

            {/* Parameters Grid */}
            <div className="grid grid-cols-2 gap-2">
              {parsed.model && (
                <div className={scannerCardClass}>
                  <h4 className={scannerLabelClass}>Model</h4>
                  <p className="text-zinc-200 text-xs font-medium truncate" title={parsed.model}>
                    {parsed.model}
                  </p>
                </div>
              )}

              {parsed.seed !== null && parsed.seed !== undefined && (
                <div className={scannerCardClass}>
                  <h4 className={scannerLabelClass}>Seed</h4>
                  <p className="text-zinc-200 text-xs font-mono">{parsed.seed}</p>
                </div>
              )}

              {parsed.steps !== null && parsed.steps !== undefined && (
                <div className={scannerCardClass}>
                  <h4 className={scannerLabelClass}>Steps</h4>
                  <p className="text-zinc-200 text-xs font-mono">{parsed.steps}</p>
                </div>
              )}

              {parsed.cfg !== null && parsed.cfg !== undefined && (
                <div className={scannerCardClass}>
                  <h4 className={scannerLabelClass}>CFG Scale</h4>
                  <p className="text-zinc-200 text-xs font-mono">{parsed.cfg}</p>
                </div>
              )}

              {parsed.sampler && (
                <div className={scannerCardClass}>
                  <h4 className={scannerLabelClass}>Sampler</h4>
                  <p className="text-zinc-200 text-xs truncate" title={parsed.sampler}>
                    {parsed.sampler}
                  </p>
                </div>
              )}

              {parsed.scheduler && (
                <div className={scannerCardClass}>
                  <h4 className={scannerLabelClass}>Scheduler</h4>
                  <p className="text-zinc-200 text-xs truncate" title={parsed.scheduler}>
                    {parsed.scheduler}
                  </p>
                </div>
              )}

              {parsed.size && (
                <div className={scannerCardClass}>
                  <h4 className={scannerLabelClass}>Size</h4>
                  <p className="text-zinc-200 text-xs font-mono">{parsed.size}</p>
                </div>
              )}
            </div>

            {/* Raw Workflow (Collapsed) */}
            {scannerPrefs.showRawMetadata && (comfyJsonText || legacyParametersText) && (
              <details className={`${scannerCardClass} overflow-hidden`}>
                <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 hover:text-zinc-200">
                  Raw Metadata Exports
                </summary>
                <div className="space-y-3 pt-3">
                  <div className="flex flex-wrap gap-2">
                    {comfyJsonText && (
                      <>
                        <button
                          onClick={() => void copyExportText(comfyJsonText)}
                          className={scannerToolButtonClass}
                        >
                          <Copy size={12} />
                          Copy ComfyUI
                        </button>
                        <button
                          onClick={() => downloadExportText(comfyJsonText, `${exportStem}.comfyui.json`)}
                          className={scannerToolButtonClass}
                        >
                          <Download size={12} />
                          Save ComfyUI
                        </button>
                      </>
                    )}
                    {legacyParametersText && (
                      <>
                        <button
                          onClick={() => void copyExportText(legacyParametersText)}
                          className={scannerToolButtonClass}
                        >
                          <Copy size={12} />
                          Copy Parameters
                        </button>
                        <button
                          onClick={() => downloadExportText(legacyParametersText, `${exportStem}.parameters.txt`)}
                          className={scannerToolButtonClass}
                        >
                          <Download size={12} />
                          Save Parameters
                        </button>
                      </>
                    )}
                  </div>
                  {comfyJsonText && (
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-orange-300">
                        ComfyUI JSON
                      </div>
                      <pre className="custom-scrollbar max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-zinc-400">
                        {comfyJsonText}
                      </pre>
                    </div>
                  )}
                  {legacyParametersText && (
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-green-300">
                        Legacy Parameters
                      </div>
                      <pre className="custom-scrollbar max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-zinc-400">
                        {legacyParametersText}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </>
        )}

        {workflowExport && (
          <div className={`${scannerCardClass} border-orange-500/20`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-300">
                  <FileJson size={13} />
                  {workflowExport.label}
                </h4>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {workflowExport.kind === 'workflow'
                    ? 'Visual ComfyUI workflow embedded in the image.'
                    : 'API prompt graph embedded in the image.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => void copyExportText(workflowExport.text)}
                  className={scannerToolButtonClass}
                >
                  <Copy size={12} />
                  Copy JSON
                </button>
                <button
                  onClick={() => downloadExportText(workflowExport.text, `${exportStem}.${workflowExport.filenameSuffix}`)}
                  className={scannerToolButtonClass}
                >
                  <Download size={12} />
                  Save JSON
                </button>
              </div>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 hover:text-zinc-300">
                Preview JSON
              </summary>
              <pre className="custom-scrollbar mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded border border-white/10 bg-black/30 p-3 font-mono text-xs text-zinc-400">
                {workflowExport.text}
              </pre>
            </details>
          </div>
        )}

        {/* No metadata found */}
        {!parsed.hasParams && !workflowExport && !legacyParametersText && (
          <div className={`${scannerCardClass} p-6 text-center`}>
            <FileJson className="mx-auto mb-2 h-6 w-6 text-zinc-500" />
            <p className="text-sm font-semibold text-zinc-400">No generation metadata found</p>
            <p className="mt-1 text-xs text-zinc-600">This image does not contain supported generation metadata</p>
          </div>
        )}

        {/* File Info */}
        <div className={scannerCardClass}>
          <h4 className={`${scannerLabelClass} mb-2`}>File Info</h4>
          <div className="text-xs text-zinc-400 space-y-1">
            <p><span className="text-zinc-600">Size:</span> {formatBytes(item.metadata.size)}</p>
            <p><span className="text-zinc-600">Type:</span> {item.metadata.type}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative flex h-full bg-[var(--umbra-bg)] text-[var(--umbra-text)]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop Overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-4 border-dashed border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/15 backdrop-blur-sm">
          <div className="text-center">
            <Upload className="mx-auto mb-4 h-16 w-16 animate-bounce text-[var(--umbra-accent)] drop-shadow-[0_0_18px_var(--umbra-accent-glow)]" />
            <p className="text-2xl font-bold text-white">Scan Metadata</p>
            <p className="mt-2 text-sm text-zinc-300">Drop images to analyze</p>
          </div>
        </div>
      )}

      {/* Sidebar - History */}
      <div className="custom-scrollbar w-24 space-y-2 overflow-y-auto border-r border-white/10 p-2 umbra-surface-deep">
        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] umbra-text-faint">
          {items.length} Scans
        </div>
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            className={`h-20 w-20 cursor-pointer overflow-hidden rounded-md border transition ${selectedId === item.id
                ? 'border-[var(--umbra-accent)] opacity-100 shadow-[0_0_16px_var(--umbra-accent-glow)]'
                : 'border-white/10 opacity-60 hover:border-white/25 hover:opacity-100'
              }`}
          >
            {item.isVideo ? (
              <video
                src={item.blobUrl}
                className="h-full w-full object-cover"
                muted
              />
            ) : (
              <img
                src={item.previewUrl || item.blobUrl}
                alt={item.name}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        ))}
        {items.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-black/25 p-2 text-center text-[10px] umbra-text-faint">
            Drop media
          </div>
        ) : null}
      </div>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        {!hideHeader && (
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white">Metadata Scanner</h2>
              <p className="mt-0.5 text-xs umbra-text-muted">Extract image generation metadata</p>
            </div>
            <button
              onClick={clearAll}
              className="rounded-md border border-white/10 bg-black/25 p-2 text-zinc-400 transition hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-300"
              title="Clear All"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}

        {/* Content Area */}
        {hideHeader && (
          <div className="flex items-center justify-end gap-2 border-b border-white/10 bg-black/20 px-3 py-1.5 backdrop-blur-xl z-10">
            <button
              onClick={clearAll}
              className="rounded-md border border-white/10 bg-black/25 p-1.5 text-zinc-400 transition hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-300"
              title="Clear All"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!selectedItem ? (
            <div className="flex h-full items-center justify-center text-zinc-600">
              <div className="text-center">
                <Upload size={64} className="mx-auto mb-4 opacity-20" />
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">Drag images from filmstrip to scan</p>
                <p className="mt-2 text-xs text-zinc-700">Or drag files from your computer</p>
              </div>
            </div>
          ) : (
            <div className="grid h-full grid-cols-1 lg:grid-cols-2">
              {/* Preview */}
              <div className="flex min-h-0 items-center justify-center overflow-hidden border-r border-white/10 p-4 umbra-surface-deep">
                {selectedItem.isVideo ? (
                  <video
                    src={selectedItem.blobUrl}
                    controls
                    autoPlay
                    loop
                    muted
                    className="h-full max-h-full w-full max-w-full rounded-md border border-white/10 object-contain shadow-2xl shadow-black/50"
                  />
                ) : (
                  <img
                    src={selectedItem.blobUrl}
                    alt={selectedItem.name}
                    className="h-full max-h-full w-full max-w-full rounded-md border border-white/10 object-contain shadow-2xl shadow-black/50"
                    decoding="async"
                  />
                )}
              </div>

              {/* Metadata */}
              <div className="custom-scrollbar overflow-y-auto bg-[var(--umbra-bg)]/60 p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{selectedItem.name}</h3>
                  <button
                    onClick={() => removeItem(selectedItem.id)}
                    className="rounded p-1 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Parse and display generation parameters */}
                {renderMetadata(selectedItem)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper: Parse generation parameters from metadata
function parseGenerationParams(metadata: any) {
  const result: any = {
    hasParams: false,
    positive: null,
    negative: null,
    model: null,
    seed: null,
    steps: null,
    cfg: null,
    sampler: null,
    scheduler: null,
    size: null,
    workflow: null,
  };

  // Direct scalar fallback (from pre-parsed metadata APIs/chunks)
  if (metadata.scheduler !== undefined && metadata.scheduler !== null && metadata.scheduler !== '') {
    result.scheduler = String(metadata.scheduler);
    result.hasParams = true;
  }
  if (metadata.positive_prompt !== undefined && metadata.positive_prompt !== null && metadata.positive_prompt !== '') {
    result.positive = String(metadata.positive_prompt);
    result.hasParams = true;
  }
  if (metadata.negative_prompt !== undefined && metadata.negative_prompt !== null && metadata.negative_prompt !== '') {
    result.negative = String(metadata.negative_prompt);
    result.hasParams = true;
  }
  if (metadata.model !== undefined && metadata.model !== null && metadata.model !== '') {
    result.model = String(metadata.model);
    result.hasParams = true;
  }
  if (metadata.seed !== undefined && metadata.seed !== null && metadata.seed !== '') {
    result.seed = metadata.seed;
    result.hasParams = true;
  }
  if (metadata.steps !== undefined && metadata.steps !== null && metadata.steps !== '') {
    result.steps = metadata.steps;
    result.hasParams = true;
  }
  if (metadata.cfg !== undefined && metadata.cfg !== null && metadata.cfg !== '') {
    result.cfg = metadata.cfg;
    result.hasParams = true;
  }
  if (metadata.sampler !== undefined && metadata.sampler !== null && metadata.sampler !== '') {
    result.sampler = String(metadata.sampler);
    result.hasParams = true;
  }
  if ((metadata.width || metadata.height) && !result.size) {
    result.size = `${metadata.width || '?'}x${metadata.height || '?'}`;
    result.hasParams = true;
  }

  // ComfyUI workflow format
  if (metadata.workflow || metadata.prompt) {
    result.workflow = metadata.workflow || metadata.prompt;
    result.hasParams = true;

    try {
      const workflowInput = metadata.workflow || metadata.prompt;
      const workflow = typeof workflowInput === 'string'
        ? JSON.parse(workflowInput)
        : workflowInput;

      const nodeEntries = Object.entries(workflow);
      const nodeMap = new Map<string, any>();
      for (const [id, node] of nodeEntries) {
        nodeMap.set(String(id), node);
      }

      const resolveLinkedString = (value: any, preferredKeys: string[], visited = new Set<string>(), depth = 0): string | null => {
        if (depth > 40 || value === null || value === undefined) return null;
        if (typeof value === 'string' || typeof value === 'number') return String(value);
        if (!Array.isArray(value) || value.length < 1) return null;

        const sourceId = String(value[0]);
        if (visited.has(sourceId)) return null;
        visited.add(sourceId);

        const sourceNode = nodeMap.get(sourceId);
        if (!sourceNode?.inputs) return null;

        for (const key of preferredKeys) {
          const candidate = sourceNode.inputs[key];
          if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
          const nested = resolveLinkedString(candidate, preferredKeys, visited, depth + 1);
          if (nested) return nested;
        }

        for (const candidate of Object.values(sourceNode.inputs)) {
          if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
        }

        return null;
      };

      // Find KSampler to identify which conditioning is positive/negative
      let positiveConditioningId: string | null = null;
      let negativeConditioningId: string | null = null;

      for (const [, node] of nodeEntries) {
        const n = node as any;

        // KSampler or other sampler nodes
        if (n.class_type?.includes('Sampler') || n.class_type?.includes('KSampler')) {
          // The positive and negative inputs are usually arrays [nodeId, outputIndex]
          if (Array.isArray(n.inputs?.positive)) {
            positiveConditioningId = n.inputs.positive[0];
          }
          if (Array.isArray(n.inputs?.negative)) {
            negativeConditioningId = n.inputs.negative[0];
          }
        }
      }

      // Collect CLIPTextEncode nodes
      const textEncodeNodes: Array<{ id: string; node: any }> = [];
      for (const [id, node] of nodeEntries) {
        const n = node as any;
        if (n.class_type === 'CLIPTextEncode' && n.inputs?.text) {
          textEncodeNodes.push({ id, node: n });
        }
      }

      // Assign prompts based on conditioning links
      for (const { id, node } of textEncodeNodes) {
        if (id === positiveConditioningId) {
          result.positive = node.inputs.text;
        } else if (id === negativeConditioningId) {
          result.negative = node.inputs.text;
        }
      }

      // Fallback: if we didn't find them via links, use order (first = positive, second = negative)
      if (!result.positive && !result.negative && textEncodeNodes.length > 0) {
        result.positive = textEncodeNodes[0].node.inputs.text;
        if (textEncodeNodes.length > 1) {
          result.negative = textEncodeNodes[1].node.inputs.text;
        }
      }

      // Search through all nodes for other parameters
      for (const [, node] of nodeEntries) {
        const n = node as any;
        if (!n.inputs) continue;

        // Model
        if (n.inputs.ckpt_name && !result.model) {
          result.model = n.inputs.ckpt_name;
        }

        // Seed
        if (n.inputs.seed !== undefined && !result.seed) {
          result.seed = n.inputs.seed;
        }

        // Steps
        if (n.inputs.steps && !result.steps) {
          result.steps = n.inputs.steps;
        }

        // CFG
        if (n.inputs.cfg !== undefined && !result.cfg) {
          result.cfg = n.inputs.cfg;
        }

        // Sampler
        if (n.inputs.sampler_name && !result.sampler) {
          result.sampler = n.inputs.sampler_name;
        }

        // Scheduler
        if (n.inputs.scheduler && !result.scheduler) {
          const resolvedScheduler = resolveLinkedString(
            n.inputs.scheduler,
            ['scheduler', 'scheduler_name', 'value', 'text', 'string']
          );
          result.scheduler = resolvedScheduler || String(n.inputs.scheduler);
        }

        // Size
        if (n.inputs.width && n.inputs.height && !result.size) {
          result.size = `${n.inputs.width}x${n.inputs.height}`;
        }
      }
    } catch (error) {
      console.error('Failed to parse ComfyUI workflow:', error);
    }
  }

  // Legacy metadata parameter format.
  if (metadata.parameters) {
    result.hasParams = true;
    const params = metadata.parameters;

    // Parse legacy parameter text format.
    // Format: "prompt\nNegative prompt: negative\nSteps: 20, Sampler: ..., CFG scale: 7, Seed: 123, Size: 512x512, Model: model_name"
    const lines = params.split('\n');

    // First line(s) until "Negative prompt:" is positive prompt
    let currentSection = 'positive';
    let positiveLines: string[] = [];
    let negativeLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('Negative prompt:')) {
        currentSection = 'negative';
        negativeLines.push(line.replace('Negative prompt:', '').trim());
      } else if (line.match(/^(Steps|Sampler|Scheduler|Schedule type|CFG|Seed|Size|Model):/)) {
        // Parameter line
        const paramParts = line.split(',').map((p: string) => p.trim());
        for (const part of paramParts) {
          if (part.startsWith('Steps:')) {
            result.steps = part.split(':')[1].trim();
          } else if (part.startsWith('Sampler:')) {
            result.sampler = part.split(':')[1].trim();
          } else if (part.startsWith('CFG scale:')) {
            result.cfg = part.split(':')[1].trim();
          } else if (part.startsWith('CFG:')) {
            result.cfg = part.split(':')[1].trim();
          } else if (part.startsWith('Seed:')) {
            result.seed = part.split(':')[1].trim();
          } else if (part.startsWith('Size:')) {
            result.size = part.split(':')[1].trim().replace('x', 'x');
          } else if (part.startsWith('Model:')) {
            result.model = part.split(':')[1].trim();
          } else if (part.startsWith('Scheduler:') || part.startsWith('Schedule type:')) {
            result.scheduler = part.split(':').slice(1).join(':').trim();
          }
        }
      } else {
        if (currentSection === 'positive') {
          positiveLines.push(line);
        } else if (currentSection === 'negative') {
          negativeLines.push(line);
        }
      }
    }

    result.positive = positiveLines.join('\n').trim() || null;
    result.negative = negativeLines.join('\n').trim() || null;
  }

  return result;
}

// Helper: Extract PNG metadata
async function extractPNGMetadata(bytes: Uint8Array, metadata: any): Promise<any> {
  // Check PNG signature
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
    return metadata;
  }

  let offset = 8; // Skip PNG signature

  while (offset < bytes.length) {
    // Read chunk length
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 4;

    // Read chunk type
    const type = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    offset += 4;

    // Check for text chunks
    if (type === 'tEXt' || type === 'iTXt') {
      const chunkData = bytes.slice(offset, offset + length);

      // For tEXt: keyword\0text
      // For iTXt: keyword\0compression_flag\0compression_method\0language\0translated_keyword\0text
      let text: string;
      let keyword: string;

      if (type === 'tEXt') {
        text = new TextDecoder('latin1').decode(chunkData);
        const nullIndex = text.indexOf('\0');
        if (nullIndex > 0) {
          keyword = text.substring(0, nullIndex);
          const value = text.substring(nullIndex + 1);

          // Try to parse as JSON for known metadata fields
          try {
            if (keyword === 'workflow' || keyword === 'prompt') {
              metadata[keyword] = JSON.parse(value);
            } else {
              metadata[keyword] = value;
            }
          } catch (e) {
            // Not JSON, store as string
            metadata[keyword] = value;
          }
        }
      } else if (type === 'iTXt') {
        // iTXt chunks can have compression, but we'll handle uncompressed for now
        text = new TextDecoder('utf-8').decode(chunkData);
        const nullIndex = text.indexOf('\0');
        if (nullIndex > 0) {
          keyword = text.substring(0, nullIndex);
          // Skip compression flag and method (2 bytes after first null)
          const textStart = text.indexOf('\0', nullIndex + 3);
          if (textStart > 0) {
            const value = text.substring(textStart + 1);

            // Try to parse as JSON
            try {
              if (keyword === 'workflow' || keyword === 'prompt') {
                metadata[keyword] = JSON.parse(value);
              } else {
                metadata[keyword] = value;
              }
            } catch (e) {
              // Not JSON, store as string
              metadata[keyword] = value;
            }
          }
        }
      }
    }

    offset += length + 4; // Skip chunk data and CRC

    // Stop at IEND
    if (type === 'IEND') break;
  }

  return metadata;
}

// Helper: Format bytes
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

