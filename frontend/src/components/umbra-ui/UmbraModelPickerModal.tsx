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
import type {
  PowerPrompterLoraInfoPayload,
  PowerPrompterModelInfoPayload,
} from '@/components/power-prompter/powerPrompterSupport';

export type UmbraModelPickerKind = 'checkpoint' | 'lora';
export type UmbraModelPickerInfo = PowerPrompterLoraInfoPayload | PowerPrompterModelInfoPayload;

interface UmbraModelPickerModalProps {
  open: boolean;
  kind: UmbraModelPickerKind;
  items: string[];
  selectedValue: string;
  catalogLoading?: boolean;
  onClose: () => void;
  onRefresh?: () => void | Promise<unknown>;
  onRequestInfo?: (name: string) => Promise<UmbraModelPickerInfo>;
  onConfirm: (name: string, info: UmbraModelPickerInfo | null) => void;
  titleOverride?: string;
  searchPlaceholder?: string;
  confirmLabel?: string;
}

interface CatalogFile {
  path: string;
  folder: string;
  name: string;
}

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

function normalizeHttpUrl(value: unknown): string {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
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
      return type === '' || type === 'image';
    })
    .map((entry) => normalizeHttpUrl(entry.url))
    .filter(Boolean)))
    .slice(0, 6);
}

function infoName(info: UmbraModelPickerInfo | null): string {
  if (!info) return '';
  return normalizeCatalogPath('loraName' in info ? info.loraName : info.modelName);
}

export function UmbraModelPickerModal({
  open,
  kind,
  items,
  selectedValue,
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
  const [selection, setSelection] = React.useState('');
  const [info, setInfo] = React.useState<UmbraModelPickerInfo | null>(null);
  const [infoLoading, setInfoLoading] = React.useState(false);
  const [infoError, setInfoError] = React.useState('');

  const files = React.useMemo<CatalogFile[]>(() => Array.from(new Set(items
    .map(normalizeCatalogPath)
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
    .map((path) => ({ path, folder: getFolder(path), name: getFileLabel(path) })), [items]);

  const folders = React.useMemo(() => {
    const counts = new Map<string, number>();
    counts.set('', files.length);
    for (const file of files) {
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
  }, [files]);

  const visibleFiles = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return files.filter((file) => {
      if (folder && file.folder !== folder && !file.folder.startsWith(`${folder}/`)) return false;
      return !query || file.path.toLowerCase().includes(query);
    });
  }, [files, folder, search]);

  React.useEffect(() => {
    if (!open) return;
    const normalizedSelected = normalizeCatalogPath(selectedValue);
    setSelection(files.some((file) => file.path === normalizedSelected) ? normalizedSelected : '');
    setSearch('');
    setFolder('');
    setInfo(null);
    setInfoError('');
  }, [files, open, selectedValue]);

  React.useEffect(() => {
    if (!open || !selection || !onRequestInfo) {
      setInfo(null);
      setInfoLoading(false);
      return;
    }
    let canceled = false;
    setInfoLoading(true);
    setInfoError('');
    void onRequestInfo(selection)
      .then((nextInfo) => {
        if (!canceled) setInfo(nextInfo);
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
  }, [onRequestInfo, open, selection]);

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
  const previewUrls = extractPreviewUrls(info);
  const displayedInfoMatches = infoName(info).toLowerCase() === selection.toLowerCase();

  return (
    <div className="fixed inset-0 z-[12200] flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[76vh] min-h-[520px] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-cyan-300/25 bg-[#05070a] shadow-2xl shadow-black/80"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-14 items-center gap-3 border-b border-white/10 px-4">
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
            <RefreshCw size={12} className={catalogLoading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:text-zinc-100" title="Close">
            <X size={14} />
          </button>
        </header>

        <div className="border-b border-white/10 p-3">
          <label className="relative block">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder || `Search ${kind === 'checkpoint' ? 'checkpoints' : 'LoRAs'} by name or folder...`}
              className="h-10 w-full rounded-md border border-white/10 bg-black/40 pl-9 pr-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/45"
            />
          </label>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_260px]">
          <aside className="overflow-y-auto border-r border-white/10 p-2 custom-scrollbar">
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

          <main className="min-h-0 overflow-y-auto p-3 custom-scrollbar">
            {visibleFiles.length <= 0 ? (
              <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.14em] text-zinc-700">No matching files</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {visibleFiles.map((file) => {
                  const active = selection === file.path;
                  const activePreview = active && displayedInfoMatches ? previewUrls[0] : '';
                  return (
                    <button
                      type="button"
                      key={file.path}
                      onClick={() => setSelection(file.path)}
                      onDoubleClick={() => onConfirm(file.path, active && displayedInfoMatches ? info : null)}
                      className={cn(
                        'min-w-0 overflow-hidden rounded-md border bg-black/30 text-left transition-colors',
                        active ? 'border-cyan-300/50 bg-cyan-500/[0.08]' : 'border-white/10 hover:border-white/25',
                      )}
                      title={file.path}
                    >
                      <div className="relative flex h-24 items-center justify-center overflow-hidden border-b border-white/10 bg-black/35">
                        {activePreview ? (
                          <img src={activePreview} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : active && infoLoading ? (
                          <Loader2 size={17} className="animate-spin text-cyan-300" />
                        ) : (
                          <ImageIcon size={17} className="text-zinc-700" />
                        )}
                        {active ? <Check size={12} className="absolute right-2 top-2 text-cyan-200" /> : null}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-[11px] font-bold text-zinc-100">{file.name}</div>
                        <div className="mt-0.5 truncate font-mono text-[9px] text-zinc-500">{file.folder || 'Root'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </main>

          <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-black/15 p-3 custom-scrollbar">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Selection</div>
            {selection ? (
              <>
                <div className="mt-2 break-words font-mono text-[10px] text-zinc-200">{selection}</div>
                <div className="mt-3 aspect-square overflow-hidden rounded-md border border-white/10 bg-black/35">
                  {previewUrls[0] && displayedInfoMatches ? (
                    <img src={previewUrls[0]} alt={`${getFileLabel(selection)} preview`} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      {infoLoading ? <Loader2 size={18} className="animate-spin text-cyan-300" /> : <ImageIcon size={20} className="text-zinc-700" />}
                    </div>
                  )}
                </div>
                {infoError ? <div className="mt-2 text-[10px] leading-relaxed text-amber-200/80">{infoError}</div> : null}
                {displayedInfoMatches && info?.trainedTags?.length ? (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-zinc-500">Trained Tokens</div>
                    <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto custom-scrollbar">
                      {info.trainedTags.slice(0, 40).map((tag) => (
                        <span key={tag} className="max-w-full truncate rounded-sm border border-emerald-300/20 bg-emerald-500/[0.07] px-1.5 py-1 font-mono text-[9px] text-emerald-100" title={tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-3 text-[10px] leading-relaxed text-zinc-500">Choose an item to inspect its metadata and preview.</div>
            )}
          </aside>
        </div>

        <footer className="flex min-h-14 items-center gap-3 border-t border-white/10 px-4">
          <div className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-500">{selection ? `Selected: ${selection}` : 'Nothing selected'}</div>
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-white/10 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:text-zinc-100">Cancel</button>
          <button
            type="button"
            disabled={!selection}
            onClick={() => onConfirm(selection, displayedInfoMatches ? info : null)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-cyan-300/30 bg-cyan-500/[0.1] px-4 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 hover:bg-cyan-500/[0.16] disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-700"
          >
            <Check size={12} /> {confirmLabel || (kind === 'checkpoint' ? 'Use Checkpoint' : 'Add LoRA')}
          </button>
        </footer>
      </div>
    </div>
  );
}
