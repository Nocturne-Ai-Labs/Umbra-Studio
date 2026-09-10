import React from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  ImagePlus,
  ImageOff,
  Loader2,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  ScanSearch,
  Settings2,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  censorReviewApi as api,
  censorReviewId,
  censorReviewCanApprove,
  censorReviewNeedsDetection,
  censorReviewSnapshot,
  normalizeCensorReviewSettings,
  summarizeCensorReviewItem,
  type CensorReviewItem,
  type CensorReviewProject,
  type CensorReviewProjectSummary,
  type CensorReviewSettings,
  type CensorReviewEditSnapshot,
} from '@/lib/umbraCensorReview';
import { UmbraCensorReviewViewer, CensorIconButton, censorButton } from './UmbraCensorReviewViewer';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { UmbraPinnedOutputControl, usePinnedOutputFolder } from './UmbraPinnedOutputControl';
import { UmbraImageExportControls } from './UmbraImageExportControls';
import { UmbraExtrasPresetControl } from './UmbraExtrasPresetControl';
import {
  browseUmbraUiMediaToolsSourceFiles,
  browseUmbraUiMediaToolsOutputFolder,
  uploadUmbraUiWatermarkAsset,
} from '@/lib/umbraUiMediaTools';
import {
  normalizeUmbraUiMediaToolsHandoff,
  UMBRA_UI_MEDIA_TOOLS_HANDOFF_EVENT,
  UMBRA_UI_MEDIA_TOOLS_HANDOFF_KEY,
} from '@/lib/umbraUiMediaToolsHandoff';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { useNsfwPrivacy, NsfwPrivacyShield } from '@/components/privacy/NsfwPrivacyProvider';
import { runUmbraUiMediaBatch } from '@/lib/umbraUiMediaBatch';
import {
  usePublishUmbraQueueActivity,
  useUmbraQueueActivityActions,
  type UmbraQueueActivity,
} from '@/lib/umbraQueueActivity';

const inputClass =
  'min-w-0 w-full rounded border border-white/15 bg-black/30 px-2 py-2 text-xs text-zinc-100';
const LAST_PROJECT = 'umbra:censor-review:last-project';
const DEFAULT_SETTINGS_KEY = 'umbra:censor-review:import-settings';
const OUTPUT_KEY = 'umbra-ui:extras-media-tools-output-folder-v2:censor';
// Retain failed saves when switching workspaces within the current app session.
const pendingEdits = new Map<string, CensorReviewItem>();
const draftKey = (projectId: string, itemId: string) => `${projectId}:${itemId}`;
const statusLabel = (value: string) =>
  value === 'needs-review' ? 'Needs review' : value === 'approved' ? 'Approved' : 'Pending';
const newId = censorReviewId;
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-2 text-xs">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <output className="tabular-nums text-emerald-200">
          {Math.round(value * 100) / 100}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}
export function UmbraCensorReviewWorkspace() {
  const [project, setProject] = React.useState<CensorReviewProject | null>(null);
  const projectRef = React.useRef(project);
  projectRef.current = project;
  const [item, setItem] = React.useState<CensorReviewItem | null>(null);
  const itemRef = React.useRef(item);
  itemRef.current = item;
  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const [busy, setBusy] = React.useState('');
  const [drawing, setDrawing] = React.useState(false);
  const drawingRef = React.useRef(false);
  const busyRef = React.useRef(false);
  const [error, setError] = React.useState('');
  const [showProjects, setShowProjects] = React.useState(false);
  const projectDialog = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    if (showProjects && projectDialog.current && !projectDialog.current.open) projectDialog.current.showModal();
  }, [showProjects]);
  const [projects, setProjects] = React.useState<CensorReviewProjectSummary[]>([]);
  const [projectName, setProjectName] = React.useState('Censor review');
  const [showSettings, setShowSettings] = React.useState(() => window.innerWidth >= 1024);
  const [filter, setFilter] = React.useState('all');
  const [selectedRect, setSelectedRect] = React.useState('');
  const [defaults, setDefaults] = React.useState<CensorReviewSettings>(() => {
    try {
      return normalizeCensorReviewSettings(JSON.parse(localStorage.getItem(DEFAULT_SETTINGS_KEY) || '{}'));
    } catch {
      return normalizeCensorReviewSettings({});
    }
  });
  const [outputFolder, setOutputFolder] = React.useState(() => {
    try {
      return localStorage.getItem(OUTPUT_KEY) || '';
    } catch {
      return '';
    }
  });
  const [pinned, setPinned] = usePinnedOutputFolder('censor');
  const [history, setHistory] = React.useState<{
    undo: CensorReviewEditSnapshot[];
    redo: CensorReviewEditSnapshot[];
  }>({ undo: [], redo: [] });
  const [progress, setProgress] = React.useState({
    total: 0,
    completed: 0,
    failed: 0,
    startedAt: 0,
    running: false,
  });
  const stop = React.useRef(false),
    mounted = React.useRef(true);
  const files = React.useRef<HTMLInputElement>(null),
    overlay = React.useRef<HTMLInputElement>(null),
    strip = React.useRef<HTMLDivElement>(null);
  const privacy = useNsfwPrivacy();
  React.useEffect(() => {
    try {
      localStorage.setItem(DEFAULT_SETTINGS_KEY, JSON.stringify(defaults));
    } catch {
      /* optional */
    }
  }, [defaults]);
  React.useEffect(() => {
    try {
      localStorage.setItem(OUTPUT_KEY, outputFolder);
    } catch {
      /* optional */
    }
  }, [outputFolder]);
  const filtered = React.useMemo(
    () =>
      (project?.items || []).filter(
        (i) => filter === 'all' || i.status === filter || (filter === 'failed' && i.error),
      ),
    [project, filter],
  );
  const virtual = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => strip.current,
    estimateSize: () => 104,
    horizontal: true,
    overscan: 4,
  });
  const markDirty = (value: boolean, retain = true) => {
    dirtyRef.current = value;
    setDirty(value);
    if (value && retain && projectRef.current && itemRef.current)
      pendingEdits.set(draftKey(projectRef.current.id, itemRef.current.id), itemRef.current);
  };
  const receive = (next: CensorReviewItem, selected = true) => {
    if (!mounted.current) return;
    setProject((p) =>
      p
        ? {
            ...p,
            items: p.items.map((i) => (i.id === next.id ? summarizeCensorReviewItem(next) : i)),
            updatedAt: next.updatedAt,
          }
        : p,
    );
    if (selected || itemRef.current?.id === next.id) {
      itemRef.current = next;
      setItem(next);
      markDirty(false);
    }
  };
  const flush = async () => {
    if (!itemRef.current || !project) return itemRef.current;
    if (!dirtyRef.current) return itemRef.current;
    const draft = itemRef.current;
    const saved = await api.save(project.id, draft);
    if (pendingEdits.get(draftKey(project.id, draft.id)) === draft)
      pendingEdits.delete(draftKey(project.id, draft.id));
    receive(saved);
    return saved;
  };
  const perform = async (label: string, task: () => Promise<void>) => {
    if (busyRef.current || drawingRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError('');
    try {
      await task();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      if (!dirtyRef.current && itemRef.current && projectRef.current) {
        const current = await api.item(projectRef.current.id, itemRef.current.id).catch(() => null);
        if (current) receive(current);
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy('');
    }
  };
  const select = async (id: string, currentProject = project) => {
    if (!currentProject) return;
    const saved = await api.item(currentProject.id, id);
    const draft = pendingEdits.get(draftKey(currentProject.id, id));
    const alreadySaved = draft && JSON.stringify(censorReviewSnapshot(draft)) === JSON.stringify(censorReviewSnapshot(saved));
    if (alreadySaved) pendingEdits.delete(draftKey(currentProject.id, id));
    const next = draft && !alreadySaved ? draft : saved;
    itemRef.current = next;
    setItem(next);
    markDirty(!!draft && !alreadySaved, false);
    if (draft && !alreadySaved && draft.revision !== saved.revision)
      setError('Unsaved edits were recovered, but this image changed in another session. Reload the saved image to discard this draft.');
    setSelectedRect('');
    setHistory({ undo: [], redo: [] });
  };
  const openProject = async (id: string) => {
    await flush();
    const next = await api.project(id);
    setProject(next);
    setProjectName(next.name);
    try {
      localStorage.setItem(LAST_PROJECT, id);
    } catch {
      /* storage is optional */
    }
    if (next.items.length) await select(next.items[0].id, next);
    else {
      setItem(null);
      itemRef.current = null;
    }
    setShowProjects(false);
  };
  const edit = (changes: Partial<CensorReviewEditSnapshot>) => {
    if (!itemRef.current || busyRef.current) return;
    const previous = itemRef.current;
    setHistory((h) => ({ undo: [...h.undo.slice(-39), censorReviewSnapshot(previous)], redo: [] }));
    const next = { ...previous, ...changes, status: 'needs-review' as const };
    itemRef.current = next;
    setItem(next);
    markDirty(true);
  };
  const undo = (redo = false) => {
    if (!item || busyRef.current || drawingRef.current) return;
    const source = redo ? history.redo : history.undo;
    const previous = source.at(-1);
    if (!previous) return;
    setHistory(
      redo
        ? { undo: [...history.undo, censorReviewSnapshot(item)], redo: source.slice(0, -1) }
        : { undo: source.slice(0, -1), redo: [...history.redo, censorReviewSnapshot(item)] },
    );
    const next = { ...item, ...previous, status: 'needs-review' as const };
    itemRef.current = next;
    setItem(next);
    markDirty(true);
  };
  const settings = item?.settings || defaults;
  const changeSettings = (changes: Partial<CensorReviewSettings>) =>
    item ? edit({ settings: { ...settings, ...changes } }) : setDefaults({ ...settings, ...changes });
  const saveAndRender = async (forceDetection = false) => {
    let current = await flush();
    if (!current || !project) return;
    if (forceDetection || censorReviewNeedsDetection(current)) {
      current = await api.action(project.id, current, 'detect');
      receive(current);
      setHistory({ undo: [], redo: [] });
    }
    current = await api.action(project.id, current, 'render');
    receive(current);
  };
  const runBatch = async (kind: 'preview' | 'export') => {
    if (!project) return;
    await flush();
    stop.current = false;
    const refreshed = await api.project(project.id);
    setProject(refreshed);
    const rows = refreshed.items.filter((i) =>
      kind === 'export'
        ? i.status === 'approved'
        : i.status !== 'approved' && (!!i.error || i.renderedEditRevision !== i.editRevision),
    );
    setProgress({ total: rows.length, completed: 0, failed: 0, startedAt: Date.now(), running: true });
    try {
      await runUmbraUiMediaBatch({
        items: rows.map((i) => ({ ...i, kind: 'image' as const })),
        imageConcurrency: 1,
        shouldStop: () => stop.current,
        runItem: async (row) => {
          let current = await api.item(project.id, row.id);
          if (kind === 'preview') {
            if (censorReviewNeedsDetection(current))
              current = await api.action(project.id, current, 'detect');
            current = await api.action(project.id, current, 'render');
          } else current = (await api.export(project.id, current, outputFolder, pinned)).item;
          receive(current, false);
        },
        onItemSettled: (row, failure) => {
          if (!mounted.current) return;
          setProgress((p) => ({
            ...p,
            completed: p.completed + (failure ? 0 : 1),
            failed: p.failed + (failure ? 1 : 0),
          }));
          if (failure) {
            setError(`${row.name}: ${failure instanceof Error ? failure.message : String(failure)}`);
          }
        },
      });
      if (mounted.current) {
        const next = await api.project(project.id);
        setProject(next);
        if (itemRef.current) await select(itemRef.current.id, next);
      }
    } finally {
      if (mounted.current) setProgress((p) => ({ ...p, running: false }));
    }
  };
  const importSources = async (sources: Array<File | string>) => {
    if (!sources.length) return;
    await flush();
    let currentProject = project;
    if (!currentProject) {
      currentProject = await api.create(projectName);
      setProject(currentProject);
    }
    stop.current = false;
    setProgress({ total: sources.length, completed: 0, failed: 0, startedAt: Date.now(), running: true });
    try {
      for (const source of sources) {
        if (stop.current) break;
        try {
          currentProject = await api.import(currentProject.id, source, defaults);
          if (mounted.current) {
            setProject(currentProject);
            setProgress((p) => ({ ...p, completed: p.completed + 1 }));
          }
        } catch (e) {
          if (mounted.current) {
            setError(e instanceof Error ? e.message : String(e));
            setProgress((p) => ({ ...p, failed: p.failed + 1 }));
          }
        }
      }
      if (mounted.current && currentProject.items.length)
        await select(currentProject.items.at(-1)!.id, currentProject);
      try {
        localStorage.setItem(LAST_PROJECT, currentProject.id);
      } catch {
        /* optional */
      }
    } finally {
      if (mounted.current) setProgress((p) => ({ ...p, running: false }));
    }
  };
  const pendingHandoff = React.useRef<string[]>([]);
  const importRef = React.useRef(importSources);
  importRef.current = importSources;
  React.useEffect(() => {
    mounted.current = true;
    const handoff = (value: unknown) => {
      const data = normalizeUmbraUiMediaToolsHandoff(value);
      if (data?.mode !== 'censor') return;
      pendingHandoff.current.push(...data.paths);
      if (!busyRef.current)
        void perform('Importing images', async () => {
          const paths = pendingHandoff.current.splice(0);
          await importRef.current(paths);
        });
    };
    const listener = (event: Event) => handoff((event as CustomEvent).detail);
    window.addEventListener(UMBRA_UI_MEDIA_TOOLS_HANDOFF_EVENT, listener);
    void perform('Opening review', async () => {
      let last = '';
      try {
        last = localStorage.getItem(LAST_PROJECT) || '';
      } catch {
        /* optional */
      }
      if (last) {
        try {
          await openProject(last);
        } catch {
          /* Project can have been removed outside Umbra. */
        }
      }
      let pending: unknown;
      try {
        pending = JSON.parse(sessionStorage.getItem(UMBRA_UI_MEDIA_TOOLS_HANDOFF_KEY) || 'null');
      } catch {
        /* optional */
      }
      const normalized = normalizeUmbraUiMediaToolsHandoff(pending);
      if (normalized?.mode === 'censor') {
        sessionStorage.removeItem(UMBRA_UI_MEDIA_TOOLS_HANDOFF_KEY);
        pendingHandoff.current.push(...normalized.paths);
      }
    });
    return () => {
      mounted.current = false;
      stop.current = true;
      window.removeEventListener(UMBRA_UI_MEDIA_TOOLS_HANDOFF_EVENT, listener);
      if (dirtyRef.current && !busyRef.current && projectRef.current && itemRef.current) {
        const draft = itemRef.current;
        const key = draftKey(projectRef.current.id, draft.id);
        void api.save(projectRef.current.id, draft).then(() => {
          if (pendingEdits.get(key) === draft) pendingEdits.delete(key);
        }).catch(() => undefined);
      }
    };
    // Project initialization and Gallery handoffs are intentionally registered once.
  }, []);
  React.useEffect(() => {
    if (!busy && pendingHandoff.current.length)
      void perform('Importing images', async () => {
        const paths = pendingHandoff.current.splice(0);
        await importRef.current(paths);
      });
  }, [busy]);
  React.useEffect(() => {
    if (!dirty || busy || error || drawing) return;
    const timer = window.setTimeout(() => {
      void perform('Saving edits', async () => {
        await flush();
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [item, dirty, busy, error, drawing]);
  React.useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || busyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const activity = React.useMemo<UmbraQueueActivity | null>(
    () =>
      progress.total
        ? {
            id: `censor-review:${progress.startedAt}`,
            owner: 'umbra-ui-extras-censor-review',
            feature: 'censor',
            label: 'Censor review batch',
            detail: project?.name || '',
            status: progress.running
              ? 'running'
              : progress.failed
                ? 'partial'
                : progress.completed < progress.total
                  ? 'canceled'
                  : 'completed',
            total: progress.total,
            completed: progress.completed,
            failed: progress.failed,
            createdAt: progress.startedAt,
            updatedAt: Date.now(),
            placement: 'parallel',
            readonly: true,
          }
        : null,
    [progress, project?.name],
  );
  usePublishUmbraQueueActivity('umbra-ui-extras-censor-review', activity);
  useUmbraQueueActivityActions(activity?.id, {
    remove: async () => {
      stop.current = true;
    },
  });
  const chooseImage = () =>
    isUmbraRemoteClient()
      ? files.current?.click()
      : void perform('Choosing images', async () => {
          await importSources(await browseUmbraUiMediaToolsSourceFiles('image'));
        });
  const approve = (uncensored = false) =>
    perform('Approving image', async () => {
      const current = await flush();
      if (!current || !project) return;
      receive(await api.action(project.id, current, uncensored ? 'approve-uncensored' : 'review', { approve: true }));
      const index = filtered.findIndex((i) => i.id === current.id);
      const next = [...filtered.slice(index + 1), ...filtered.slice(0, index)].find((i) => i.status !== 'approved');
      if (next) await select(next.id);
    });
  const canApprove = item && !dirty && censorReviewCanApprove(item);
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--umbra-bg)] text-zinc-200"
      data-censor-review="workspace"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
        <h2 className="mr-auto min-w-0 truncate text-sm font-bold max-sm:w-full" title={project?.name}>
          {project?.name || 'Censor review'}
        </h2>
        <CensorIconButton
          title="Open or create review project"
          disabled={!!busy}
          onClick={() =>
            void perform('Loading projects', async () => {
              await flush();
              setProjects(await api.list());
              setShowProjects(true);
            })
          }
        >
          <FolderOpen size={16} />
        </CensorIconButton>
        <CensorIconButton
          title="Save review edits"
          disabled={!dirty || !!busy}
          onClick={() =>
            void perform('Saving edits', async () => {
              await flush();
            })
          }
        >
          <Save size={16} />
        </CensorIconButton>
        <span className={`text-xs max-sm:hidden ${dirty ? 'text-amber-300' : 'text-zinc-500'}`}>
          {dirty ? 'Unsaved edits' : project ? 'Saved' : ''}
        </span>
        <button className={censorButton} title="Add images" disabled={!!busy} onClick={chooseImage}>
          <ImagePlus size={16} />
          <span className="max-sm:sr-only">Add images</span>
        </button>
        {!isUmbraRemoteClient() && (
          <CensorIconButton title="Upload images" disabled={!!busy} onClick={() => files.current?.click()}>
            <Upload size={16} />
          </CensorIconButton>
        )}
        <button
          className={censorButton}
          title="Preview batch"
          disabled={!project?.items.length || !!busy}
          onClick={() => void perform('Building previews', () => runBatch('preview'))}
        >
          <ScanSearch size={16} />
          <span className="max-sm:sr-only">Preview batch</span>
        </button>
        <button
          className={censorButton}
          title="Export approved"
          disabled={!project?.items.some((i) => i.status === 'approved') || !!busy || dirty}
          onClick={() => void perform('Exporting approved images', () => runBatch('export'))}
        >
          <Download size={16} />
          <span className="max-sm:sr-only">Export approved</span>
        </button>
        <CensorIconButton
          title="Image settings"
          active={showSettings}
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings2 size={16} />
        </CensorIconButton>
      </header>
      <input
        ref={files}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/tiff"
        multiple
        hidden
        onChange={(e) => {
          const selected = Array.from(e.target.files || []);
          e.target.value = '';
          void perform('Importing images', () => importSources(selected));
        }}
      />
      <input
        ref={overlay}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file)
            void perform('Saving overlay', async () => {
              const saved = await uploadUmbraUiWatermarkAsset(file);
              if (itemRef.current) {
                const next = {
                  ...itemRef.current,
                  settings: { ...itemRef.current.settings, overlayPath: saved.path },
                };
                itemRef.current = next;
                setItem(next);
                markDirty(true);
              } else setDefaults((d) => ({ ...d, overlayPath: saved.path }));
            });
        }}
      />
      {(busy || progress.total > 0) && (
        <div
          className="flex flex-wrap items-center gap-3 border-b border-white/10 px-3 py-2 text-xs"
          role="status"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          <span>{busy || 'Batch finished'}</span>
          {progress.total > 0 && (
            <>
              <progress
                aria-label="Review batch progress"
                className="h-2 min-w-20 flex-1 accent-emerald-400"
                max={progress.total}
                value={progress.completed + progress.failed}
              />
              <span>
                {progress.completed + progress.failed}/{progress.total}{' '}
                {progress.failed ? `(${progress.failed} failed)` : ''}
              </span>
            </>
          )}
          {progress.running && (
            <button
              className={censorButton}
              onClick={() => {
                stop.current = true;
              }}
            >
              Stop after image
            </button>
          )}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-400/20 bg-red-500/10 p-3 text-xs text-red-200"
        >
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <CensorIconButton title="Dismiss error" onClick={() => setError('')}>
            <X size={14} />
          </CensorIconButton>
          <CensorIconButton
            title="Reload saved image (discard unsaved edits)"
            disabled={!!busy || !item}
            onClick={() =>
              void perform('Reloading image', async () => {
                if (item && project) {
                  pendingEdits.delete(draftKey(project.id, item.id));
                  await select(item.id);
                }
              })
            }
          >
            <RefreshCw size={14} />
          </CensorIconButton>
        </div>
      )}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {item ? (
            <UmbraCensorReviewViewer
              key={item.id}
              projectId={project!.id}
              item={item}
              disabled={!!busy}
              selectedRect={selectedRect}
              onSelectRect={setSelectedRect}
              onEdit={edit}
              onDrawing={active => { drawingRef.current = active; setDrawing(active); }}
            />
          ) : (
            <div className="flex min-h-[340px] flex-1 items-center justify-center">
              <button className={censorButton} disabled={!!busy} onClick={chooseImage}>
                <ImagePlus size={20} />
                Add images
              </button>
            </div>
          )}
          {item && (
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-2">
              <CensorIconButton
                title="Previous image"
                disabled={!!busy || filtered.findIndex((i) => i.id === item.id) <= 0}
                onClick={() =>
                  void perform('Opening image', async () => {
                    await flush();
                    await select(filtered[filtered.findIndex((i) => i.id === item.id) - 1].id);
                  })
                }
              >
                <ChevronLeft size={16} />
              </CensorIconButton>
              <span className="min-w-0 flex-1 truncate text-xs" title={item.name}>
                {item.name}
              </span>
              <span
                className={`text-xs ${item.status === 'approved' ? 'text-emerald-300' : 'text-amber-200'}`}
              >
                {statusLabel(item.status)}
              </span>
              <CensorIconButton
                title="Undo mask or settings edit"
                disabled={!!busy || !history.undo.length}
                onClick={() => undo()}
              >
                <Undo2 size={16} />
              </CensorIconButton>
              <CensorIconButton
                title="Redo edit"
                disabled={!!busy || !history.redo.length}
                onClick={() => undo(true)}
              >
                <Redo2 size={16} />
              </CensorIconButton>
              <button
                className={censorButton}
                title="Render preview"
                disabled={!!busy}
                onClick={() => void perform('Rendering preview', () => saveAndRender())}
              >
                <RefreshCw size={14} />
                <span className="max-sm:sr-only">Render preview</span>
              </button>
              <button
                className={`${censorButton} border-emerald-400/40 text-emerald-200`}
                title="Approve original without censorship and go to next image (clears masks; preserves original format and size)"
                disabled={!!busy}
                onClick={() => void approve(true)}
              >
                <ImageOff size={16} />
                <span>Approve uncensored</span>
              </button>
              <button
                className={`${censorButton} border-emerald-400/40 text-emerald-200`}
                title="Approve and next image"
                disabled={!!busy || !canApprove}
                onClick={() => void approve()}
              >
                <Check size={16} />
                <span className="max-sm:sr-only">Approve & next</span>
              </button>
              <CensorIconButton
                title="Next image"
                disabled={!!busy || filtered.findIndex((i) => i.id === item.id) >= filtered.length - 1}
                onClick={() =>
                  void perform('Opening image', async () => {
                    await flush();
                    await select(filtered[filtered.findIndex((i) => i.id === item.id) + 1].id);
                  })
                }
              >
                <ChevronRight size={16} />
              </CensorIconButton>
            </div>
          )}
          {item && (dirty || item.renderedEditRevision !== item.editRevision) && (
            <div className="border-t border-amber-400/15 px-3 py-1 text-xs text-amber-200" role="status">
              Preview needs rendering
            </div>
          )}
          {item?.previewFile &&
            !item.censored &&
            !dirty &&
            item.renderedEditRevision === item.editRevision && (
              <div className="px-3 py-1 text-xs text-amber-200">Uncensored output - no mask coverage</div>
            )}
        </div>
        {showSettings && (
          <aside
            className="absolute inset-y-0 right-0 z-30 w-[300px] max-w-full shrink-0 space-y-4 overflow-y-auto border-l border-white/10 bg-[var(--umbra-bg,#101010)] p-3 lg:static"
            aria-label="Per-image censor settings"
          >
            <div className="flex justify-end lg:hidden">
              <CensorIconButton title="Close image settings" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </CensorIconButton>
            </div>
            <fieldset disabled={!!busy} className="min-w-0 space-y-4 disabled:opacity-60">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold">{item ? 'This image' : 'Import defaults'}</h3>
                {item && (
                  <button
                    className={censorButton}
                    title="Use these settings for subsequently added images"
                    onClick={() => setDefaults(item.settings)}
                  >
                    Use for imports
                  </button>
                )}
              </div>
              <UmbraExtrasPresetControl
                scope="censor-review"
                label="Censor"
                value={{ ...settings }}
                onApply={(v) => {
                  const next = { ...settings };
                  for (const key of ['cutoff', 'padding', 'mosaicSize', 'longEdge', 'quality'] as const)
                    if (typeof v[key] === 'number' && Number.isFinite(v[key])) next[key] = v[key];
                  for (const key of ['autoDetect', 'resizeEnabled'] as const)
                    if (typeof v[key] === 'boolean') next[key] = v[key];
                  if (Array.isArray(v.targets))
                    next.targets = v.targets.filter(
                      (t): t is 'maleGenitals' | 'femaleGenitals' =>
                        t === 'maleGenitals' || t === 'femaleGenitals',
                    );
                  if (v.mode === 'mosaic' || v.mode === 'overlay') next.mode = v.mode;
                  if (v.format === 'png' || v.format === 'jpeg' || v.format === 'webp')
                    next.format = v.format;
                  if (typeof v.overlayPath === 'string') next.overlayPath = v.overlayPath;
                  changeSettings(next);
                }}
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={settings.autoDetect}
                  onChange={(e) => changeSettings({ autoDetect: e.target.checked })}
                />
                Automatic detection
              </label>
              {settings.autoDetect && (
                <>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        ['maleGenitals', 'Male anatomy'],
                        ['femaleGenitals', 'Female anatomy'],
                      ] as const
                    ).map(([target, label]) => (
                      <label key={target} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={settings.targets.includes(target)}
                          onChange={(e) =>
                            changeSettings({
                              targets: e.target.checked
                                ? [...settings.targets, target]
                                : settings.targets.filter((t) => t !== target),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <Range
                    label="Censor cutoff"
                    value={settings.cutoff * 100}
                    min={5}
                    max={95}
                    suffix="%"
                    onChange={(v) => changeSettings({ cutoff: v / 100 })}
                  />
                  <Range
                    label="Detection padding"
                    value={settings.padding * 100}
                    min={0}
                    max={50}
                    suffix="%"
                    onChange={(v) => changeSettings({ padding: v / 100 })}
                  />
                  {item && (
                    <button
                      className={censorButton}
                      onClick={() => void perform('Detecting regions', () => saveAndRender(true))}
                    >
                      <ScanSearch size={16} />
                      Detect again
                    </button>
                  )}
                </>
              )}
              <label className="block space-y-2 text-xs">
                Censor style
                <UmbraSelectControl
                  value={settings.mode}
                  onChange={(e) => changeSettings({ mode: e.target.value as 'mosaic' | 'overlay' })}
                  className={inputClass}
                >
                  <option value="mosaic">Mosaic</option>
                  <option value="overlay">Image overlay</option>
                </UmbraSelectControl>
              </label>
              {settings.mode === 'mosaic' ? (
                <Range
                  label="Mosaic block size"
                  value={settings.mosaicSize}
                  min={2}
                  max={160}
                  suffix="px"
                  onChange={(v) => changeSettings({ mosaicSize: v })}
                />
              ) : (
                <button className={`${censorButton} max-w-full`} onClick={() => overlay.current?.click()}>
                  <Upload size={16} />
                  <span className="truncate">
                    {settings.overlayPath ? settings.overlayPath.split(/[\\/]/).pop() : 'Choose overlay'}
                  </span>
                </button>
              )}
              {item && (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <h3 className="text-xs font-bold">Detected regions ({item.regions.length})</h3>
                  {item.regions.map((region, index) => (
                    <div key={region.id} className="flex items-center gap-2 text-xs">
                      <input
                        aria-label={`Enable detected region ${index + 1}`}
                        type="checkbox"
                        checked={region.enabled}
                        onChange={(e) =>
                          edit({
                            regions: item.regions.map((r) =>
                              r.id === region.id ? { ...r, enabled: e.target.checked } : r,
                            ),
                          })
                        }
                      />
                      <button
                        className="min-h-8 min-w-0 flex-1 text-left"
                        title="Locate detected region"
                        onClick={() => setSelectedRect(region.id)}
                      >
                        {index + 1}. {region.target === 'maleGenitals' ? 'Male' : 'Female'}
                        {region.maskKind === 'box-fallback' ? ' (box)' : ''}
                      </button>
                      <span
                        className={region.score < settings.cutoff ? 'text-zinc-500' : 'text-emerald-200'}
                        title={
                          region.score < settings.cutoff
                            ? 'Below cutoff; not rendered'
                            : 'Detector confidence'
                        }
                      >
                        {Math.round(region.score * 100)}%
                      </span>
                    </div>
                  ))}
                  {item.warnings.map((warning, index) => (
                    <p key={index} className="break-words text-xs text-amber-200">
                      {warning}
                    </p>
                  ))}
                  {item.error && <p className="break-words text-xs text-red-300">{item.error}</p>}
                </div>
              )}
              {item && (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold">Manual regions ({item.rectangles.length})</h3>
                    <CensorIconButton
                      title="Add rectangle"
                      onClick={() => {
                        const id = newId();
                        edit({
                          rectangles: [
                            ...item.rectangles,
                            { id, x: 0.3, y: 0.3, width: 0.3, height: 0.3, enabled: true },
                          ],
                        });
                        setSelectedRect(id);
                      }}
                    >
                      <Plus size={14} />
                    </CensorIconButton>
                  </div>
                  {item.rectangles.map((rect, index) => (
                    <div key={rect.id} className="flex items-center gap-2">
                      <input
                        aria-label={`Enable rectangle ${index + 1}`}
                        type="checkbox"
                        checked={rect.enabled}
                        onChange={(e) =>
                          edit({
                            rectangles: item.rectangles.map((r) =>
                              r.id === rect.id ? { ...r, enabled: e.target.checked } : r,
                            ),
                          })
                        }
                      />
                      <button
                        className={`${censorButton} min-w-0 flex-1`}
                        onClick={() => setSelectedRect(rect.id)}
                      >
                        <Square size={12} />
                        Region {index + 1}
                      </button>
                      <CensorIconButton
                        title={`Delete rectangle ${index + 1}`}
                        onClick={() => edit({ rectangles: item.rectangles.filter((r) => r.id !== rect.id) })}
                      >
                        <Trash2 size={14} />
                      </CensorIconButton>
                    </div>
                  ))}
                  {item.rectangles
                    .filter((r) => r.id === selectedRect)
                    .map((rect) => (
                      <div key={rect.id} className="grid grid-cols-2 gap-2">
                        {(['x', 'y', 'width', 'height'] as const).map((key) => (
                          <label key={key} className="text-xs">
                            {key} %
                            <input
                              aria-label={`Rectangle ${key}`}
                              className={inputClass}
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={Math.round(rect[key] * 1000) / 10}
                              onChange={(e) =>
                                edit({
                                  rectangles: item.rectangles.map((r) =>
                                    r.id === rect.id ? { ...r, [key]: Number(e.target.value) / 100 } : r,
                                  ),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    ))}
                  {!!item.strokes.length && (
                    <button className={censorButton} onClick={() => edit({ strokes: [] })}>
                      <Trash2 size={14} />
                      Clear brush strokes ({item.strokes.length})
                    </button>
                  )}
                  <button
                    className={censorButton}
                    title="Disable automatic censorship and clear manual masks. Undo is available."
                    onClick={() =>
                      edit({ settings: { ...item.settings, autoDetect: false }, rectangles: [], strokes: [] })
                    }
                  >
                    <X size={14} />
                    Remove censorship
                  </button>
                </div>
              )}
              <div className="border-t border-white/10 pt-3">
                <UmbraImageExportControls value={settings} onChange={(v) => changeSettings(v)} />
              </div>
            </fieldset>
            <div className="space-y-3 border-t border-white/10 pt-3">
              <UmbraPinnedOutputControl
                value={pinned}
                onChange={setPinned}
                task="Censored"
                disabled={!!busy}
              />
              <label className="block text-xs">
                Output folder
                <input
                  className={inputClass}
                  value={outputFolder}
                  placeholder="Source folder / Censored"
                  disabled={!!busy || !!pinned}
                  onChange={(e) => setOutputFolder(e.target.value)}
                />
              </label>
              {!isUmbraRemoteClient() && (
                <button
                  className={censorButton}
                  disabled={!!busy || !!pinned}
                  onClick={() =>
                    void perform('Choosing output', async () => {
                      const folder = await browseUmbraUiMediaToolsOutputFolder(outputFolder);
                      if (folder) setOutputFolder(folder);
                    })
                  }
                >
                  <FolderOpen size={14} />
                  Choose folder
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="shrink-0 border-t border-white/10">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
          <span>{project?.items.length || 0} images</span>
          <span className="text-emerald-200">
            {project?.items.filter((i) => i.status === 'approved').length || 0} approved
          </span>
          <UmbraSelectControl
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter review images"
            className="h-8 w-36 rounded border border-white/15 bg-black/30 text-xs"
          >
            <option value="all">All images</option>
            <option value="pending">Pending</option>
            <option value="needs-review">Needs review</option>
            <option value="approved">Approved</option>
            <option value="failed">Failed</option>
          </UmbraSelectControl>
        </div>
        <div ref={strip} className="h-[96px] overflow-x-auto overflow-y-hidden sm:h-[110px]">
          <div className="relative h-full" style={{ width: virtual.getTotalSize() }}>
            {virtual.getVirtualItems().map((row) => {
              const image = filtered[row.index],
                hidden = image.protectedMedia && privacy.locked;
              return (
                <div key={image.id} className="absolute top-0 w-[100px] px-1" style={{ left: row.start }}>
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void perform('Opening image', async () => {
                        await flush();
                        await select(image.id);
                      })
                    }
                    className={`w-full overflow-hidden rounded border ${item?.id === image.id ? 'border-emerald-300' : 'border-white/15'}`}
                    title={`${image.name} - ${statusLabel(image.status)}`}
                  >
                    <div className="relative h-12 bg-black sm:h-16">
                      {!hidden && (
                        <img
                          loading="lazy"
                          src={api.asset(project!.id, image.id, 'thumbnail.jpg')}
                          alt={image.name}
                          className={`h-full w-full object-contain ${image.protectedMedia && privacy.mode === 'blur' ? 'blur-xl' : ''}`}
                        />
                      )}
                    </div>
                    <div className="truncate px-1 text-[10px]">{image.name}</div>
                    <div
                      className={`truncate px-1 text-[10px] ${image.status === 'approved' ? 'text-emerald-300' : 'text-amber-200'}`}
                    >
                      {statusLabel(image.status)}
                    </div>
                  </button>
                  {hidden && (
                    <div className="absolute inset-x-1 top-0 h-12 sm:h-16">
                      <NsfwPrivacyShield protectedMedia compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </footer>
      {showProjects && createPortal(
        <dialog
          ref={projectDialog}
          className="m-auto max-h-[85dvh] w-[520px] max-w-[calc(100vw-24px)] rounded-lg border border-white/15 bg-zinc-950 p-0 text-zinc-200 backdrop:bg-black/80"
          aria-label="Censor review projects"
          onCancel={(e) => {
            e.preventDefault(); if (!busy) setShowProjects(false);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-white/15 bg-zinc-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Review projects</h3>
              <CensorIconButton
                title="Close projects"
                disabled={!!busy}
                onClick={() => setShowProjects(false)}
              >
                <X size={16} />
              </CensorIconButton>
            </div>
            {error && <p role="alert" className="mb-3 break-words text-xs text-red-300">{error}</p>}
            <div className="flex gap-2">
              <input
                autoFocus
                aria-label="Project name"
                className={inputClass}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
              <button
                className={censorButton}
                disabled={!!busy || !projectName.trim()}
                onClick={() =>
                  void perform('Creating project', async () => {
                    const created = await api.create(projectName);
                    await openProject(created.id);
                  })
                }
              >
                <Plus size={14} />
                New
              </button>
            </div>
            {project && (
              <button
                className={`${censorButton} mt-2`}
                disabled={!!busy || !projectName.trim()}
                onClick={() =>
                  void perform('Renaming project', async () => {
                    setProject(await api.rename(project.id, projectName));
                    setShowProjects(false);
                  })
                }
              >
                Rename current
              </button>
            )}
            <div className="mt-4 divide-y divide-white/10">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-white/5"
                  disabled={!!busy}
                  onClick={() => void perform('Opening project', () => openProject(p.id))}
                >
                  <FolderOpen size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{p.name}</span>
                    <span className="text-xs text-zinc-400">
                      {p.itemCount} images / {p.approvedCount} approved
                    </span>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>
        </dialog>, document.body
      )}
    </div>
  );
}
