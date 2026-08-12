'use client';

import React from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { normalizePowerPrompterWildcardDraftName } from '@/lib/powerPrompterWildcardBuilder';

export interface WildcardLibraryEntry {
  name: string;
  folder: string;
  path: string;
  values: string[];
  source: 'umbra' | 'legacy';
  structured: boolean;
  generatorDefinition?: Record<string, unknown>;
}

interface WildcardFolderNode {
  name: string;
  path: string;
  directCount: number;
  totalCount: number;
  children: WildcardFolderNode[];
}

interface WildcardEditorState {
  originalPath: string;
  name: string;
  folder: string;
  values: string;
}

interface WildcardLibraryManagerProps {
  open: boolean;
  activeSaveFolder: string;
  onClose: () => void;
  onChooseSaveFolder: (folder: string) => void;
  onEditStructured: (wildcard: WildcardLibraryEntry) => void;
}

function normalizeFolderPath(value: unknown): string {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function mapWildcardEntries(payload: unknown): WildcardLibraryEntry[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((entry) => {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const name = String(record.name || '').trim();
    const folder = normalizeFolderPath(record.folder);
    return {
      name,
      folder,
      path: String(record.path || (folder ? `${folder}/${name}` : name)).trim(),
      values: Array.isArray(record.values) ? record.values.map((value) => String(value || '').trim()).filter(Boolean) : [],
      source: record.source === 'umbra' ? 'umbra' : 'legacy',
      structured: record.structured === true && Boolean(record.generatorDefinition),
      ...(record.generatorDefinition && typeof record.generatorDefinition === 'object' && !Array.isArray(record.generatorDefinition)
        ? { generatorDefinition: record.generatorDefinition as Record<string, unknown> }
        : {}),
    };
  }).filter((entry) => entry.name && entry.path);
}

function buildFolderTree(wildcards: WildcardLibraryEntry[], virtualFolders: string[]): WildcardFolderNode[] {
  type MutableNode = WildcardFolderNode & { childMap: Map<string, MutableNode> };
  const root = new Map<string, MutableNode>();
  const ensurePath = (rawPath: string) => {
    const parts = normalizeFolderPath(rawPath).split('/').filter(Boolean);
    let currentMap = root;
    let currentPath = '';
    let node: MutableNode | null = null;
    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      node = currentMap.get(part) || {
        name: part,
        path: currentPath,
        directCount: 0,
        totalCount: 0,
        children: [],
        childMap: new Map<string, MutableNode>(),
      };
      currentMap.set(part, node);
      currentMap = node.childMap;
    });
    return node;
  };

  virtualFolders.forEach(ensurePath);
  wildcards.forEach((wildcard) => {
    const node = wildcard.folder ? ensurePath(wildcard.folder) : null;
    if (node) node.directCount += 1;
  });

  const finalize = (nodes: Map<string, MutableNode>): WildcardFolderNode[] => (
    [...nodes.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((node) => {
        const children = finalize(node.childMap);
        const totalCount = node.directCount + children.reduce((sum, child) => sum + child.totalCount, 0);
        return { name: node.name, path: node.path, directCount: node.directCount, totalCount, children };
      })
  );

  return finalize(root);
}

function parseWildcardValues(value: string): string[] {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function WildcardLibraryManager({
  open,
  activeSaveFolder,
  onClose,
  onChooseSaveFolder,
  onEditStructured,
}: WildcardLibraryManagerProps) {
  const showToast = useStore((state) => state.showToast);
  const [wildcards, setWildcards] = React.useState<WildcardLibraryEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [browseFolder, setBrowseFolder] = React.useState('all');
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [virtualFolders, setVirtualFolders] = React.useState<string[]>([]);
  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [editor, setEditor] = React.useState<WildcardEditorState | null>(null);
  const [deleteArmed, setDeleteArmed] = React.useState(false);

  const loadWildcards = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/powerprompter/wildcards', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not load wildcards.'));
      setWildcards(mapWildcardEntries(payload?.wildcards));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load wildcards.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    if (!open) return;
    setBrowseFolder(activeSaveFolder || 'all');
    setQuery('');
    setDeleteArmed(false);
    void loadWildcards();
  }, [activeSaveFolder, loadWildcards, open]);

  const folderTree = React.useMemo(() => buildFolderTree(wildcards, virtualFolders), [virtualFolders, wildcards]);
  const rootCount = React.useMemo(() => wildcards.filter((entry) => !entry.folder).length, [wildcards]);
  const visibleWildcards = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return wildcards.filter((entry) => {
      if (browseFolder !== 'all' && entry.folder !== browseFolder) return false;
      if (!normalizedQuery) return true;
      return entry.name.toLowerCase().includes(normalizedQuery)
        || entry.folder.toLowerCase().includes(normalizedQuery)
        || entry.values.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [browseFolder, query, wildcards]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const openEditor = (wildcard: WildcardLibraryEntry) => {
    setEditor({
      originalPath: wildcard.path,
      name: wildcard.name,
      folder: wildcard.folder,
      values: wildcard.values.join('\n'),
    });
    setDeleteArmed(false);
  };

  const createFolder = () => {
    const parent = browseFolder === 'all' ? '' : browseFolder;
    const folderName = normalizeFolderPath(newFolderName);
    if (!folderName) return;
    const nextPath = normalizeFolderPath(parent ? `${parent}/${folderName}` : folderName);
    setVirtualFolders((current) => current.includes(nextPath) ? current : [...current, nextPath]);
    setBrowseFolder(nextPath);
    setExpandedFolders((current) => {
      const next = new Set(current);
      let path = '';
      nextPath.split('/').forEach((segment) => {
        path = path ? `${path}/${segment}` : segment;
        next.add(path);
      });
      return next;
    });
    setNewFolderName('');
    setNewFolderOpen(false);
  };

  const saveEditor = async () => {
    if (!editor) return;
    const values = parseWildcardValues(editor.values);
    const normalizedName = normalizePowerPrompterWildcardDraftName(editor.name);
    if (!normalizedName || values.length === 0) {
      showToast('Enter a wildcard name and at least one value.', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/powerprompter/wildcards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: editor.originalPath,
          name: normalizedName,
          folder: editor.folder,
          values,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not update wildcard.'));
      const nextWildcards = mapWildcardEntries(payload?.wildcards);
      const nextPath = editor.folder ? `${normalizeFolderPath(editor.folder)}/${normalizedName}` : normalizedName;
      setWildcards(nextWildcards);
      const saved = nextWildcards.find((entry) => entry.path === nextPath);
      if (saved) openEditor(saved);
      showToast(`__${normalizedName}__ updated.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update wildcard.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteEditor = async () => {
    if (!editor) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/powerprompter/wildcards?path=${encodeURIComponent(editor.originalPath)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not delete wildcard.'));
      setWildcards(mapWildcardEntries(payload?.wildcards));
      setEditor(null);
      setDeleteArmed(false);
      showToast('Wildcard deleted.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete wildcard.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const renderFolderNodes = (nodes: WildcardFolderNode[], depth = 0): React.ReactNode => nodes.map((node) => {
    const expanded = expandedFolders.has(node.path);
    const selected = browseFolder === node.path;
    const hasChildren = node.children.length > 0;
    return (
      <React.Fragment key={node.path}>
        <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: `${depth * 0.8}rem` }}>
          <button
            type="button"
            onClick={() => hasChildren && toggleFolder(node.path)}
            disabled={!hasChildren}
            className="inline-flex h-8 w-6 shrink-0 items-center justify-center text-zinc-600 disabled:opacity-20"
            title={expanded ? 'Collapse folder' : 'Expand folder'}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.path}`}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <button
            type="button"
            onClick={() => setBrowseFolder(node.path)}
            className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm border px-2 text-left text-[9px] font-bold ${selected ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-transparent text-zinc-400 hover:border-white/10 hover:text-zinc-100'}`}
          >
            {expanded ? <FolderOpen size={13} className="shrink-0" /> : <Folder size={13} className="shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            <span className="font-mono text-[8px] opacity-60">{node.totalCount}</span>
          </button>
        </div>
        {expanded ? renderFolderNodes(node.children, depth + 1) : null}
      </React.Fragment>
    );
  });

  if (!open || typeof document === 'undefined') return null;

  const selectedSaveFolder = browseFolder === 'all' ? '' : browseFolder;
  const editorLineCount = editor ? parseWildcardValues(editor.values).length : 0;

  return (
    <section data-umbra-wildcard-library-manager="" className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--umbra-bg)]">
        <header className="flex min-h-14 items-center gap-3 border-b border-white/10 px-4 py-2">
          <FolderTree className="h-4 w-4 shrink-0 text-cyan-200" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-100">Wildcard Library</h2>
            <p className="mt-0.5 text-[9px] text-zinc-600">Browse, edit, rename, move, and remove Power Prompter wildcards.</p>
          </div>
          <button type="button" onClick={() => void loadWildcards()} disabled={loading || busy} className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:opacity-40" title="Refresh wildcard library"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-cyan-300/20 bg-cyan-500/[0.06] px-3 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100 hover:border-cyan-300/40" title="Return to wildcard generator"><ArrowLeft className="h-3.5 w-3.5" /> Create New</button>
        </header>

        <div className="custom-scrollbar grid min-h-0 flex-1 grid-cols-[11rem_15rem_minmax(19rem,1fr)] overflow-x-auto xl:grid-cols-[13rem_18rem_minmax(22rem,1fr)]">
          <aside className="custom-scrollbar min-h-0 overflow-y-auto border-r border-white/10 bg-black/20 p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-[8px] font-black uppercase tracking-[0.14em] text-zinc-600">Folders</span>
              <button type="button" onClick={() => setNewFolderOpen((value) => !value)} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-100" title="Add folder"><FolderPlus size={12} /></button>
            </div>
            {newFolderOpen ? (
              <div className="mb-2 space-y-1.5 rounded-sm border border-cyan-300/15 bg-cyan-500/[0.04] p-2">
                <div className="text-[8px] text-zinc-500">Create under {browseFolder === 'all' ? 'Root' : browseFolder}</div>
                <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && createFolder()} placeholder="Folder name" className="settings-input h-8 !py-1 text-[10px]" autoFocus />
                <div className="flex gap-1.5">
                  <button type="button" onClick={createFolder} className="h-7 flex-1 rounded-sm border border-cyan-300/25 text-[8px] font-black uppercase text-cyan-100">Create</button>
                  <button type="button" onClick={() => setNewFolderOpen(false)} className="h-7 rounded-sm border border-white/10 px-2 text-[8px] font-black uppercase text-zinc-500">Cancel</button>
                </div>
              </div>
            ) : null}
            <button type="button" onClick={() => setBrowseFolder('all')} className={`mb-1 flex h-9 w-full items-center gap-2 rounded-sm border px-2 text-left text-[9px] font-bold ${browseFolder === 'all' ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-transparent text-zinc-400 hover:border-white/10'}`}><FolderTree size={13} /><span className="min-w-0 flex-1">All Wildcards</span><span className="font-mono text-[8px] opacity-60">{wildcards.length}</span></button>
            <button type="button" onClick={() => setBrowseFolder('')} className={`mb-1 flex h-9 w-full items-center gap-2 rounded-sm border px-2 text-left text-[9px] font-bold ${browseFolder === '' ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-transparent text-zinc-400 hover:border-white/10'}`}><Folder size={13} /><span className="min-w-0 flex-1">Root</span><span className="font-mono text-[8px] opacity-60">{rootCount}</span></button>
            <div className="space-y-0.5">{renderFolderNodes(folderTree)}</div>
          </aside>

          <section className="flex min-h-0 flex-col border-r border-white/10">
            <div className="border-b border-white/10 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wildcards or values" className="settings-input h-9 !py-1.5 pl-8 text-xs" />
              </div>
              <div className="mt-1.5 truncate text-[8px] font-bold uppercase tracking-[0.1em] text-zinc-600">{browseFolder === 'all' ? 'All folders' : browseFolder || 'Root'} · {visibleWildcards.length} files</div>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-cyan-200" /></div> : null}
              {!loading && visibleWildcards.length === 0 ? <div className="rounded-sm border border-dashed border-white/10 p-5 text-center text-[10px] text-zinc-600">No wildcards in this folder.</div> : null}
              {!loading ? visibleWildcards.map((wildcard) => {
                const selected = editor?.originalPath === wildcard.path;
                return (
                  <button key={wildcard.path} type="button" onClick={() => openEditor(wildcard)} className={`mb-1.5 flex min-h-14 w-full items-center gap-2 rounded-sm border px-2.5 py-2 text-left ${selected ? 'border-fuchsia-300/40 bg-fuchsia-500/10' : 'border-white/[0.08] bg-white/[0.018] hover:border-white/15'}`}>
                    <FileText size={14} className={selected ? 'shrink-0 text-fuchsia-200' : 'shrink-0 text-zinc-600'} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate font-mono text-[10px] text-zinc-200">__{wildcard.name}__</strong>
                      <small className="mt-1 flex items-center gap-1.5 truncate text-[8px] uppercase tracking-[0.08em] text-zinc-600">
                        <span className={`shrink-0 rounded-sm border px-1 py-0.5 ${wildcard.structured ? 'border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-200' : wildcard.source === 'umbra' ? 'border-cyan-300/20 bg-cyan-500/[0.06] text-cyan-200' : 'border-white/10 text-zinc-500'}`}>{wildcard.structured ? 'Umbra Structured' : wildcard.source === 'umbra' ? 'Umbra Legacy' : 'Legacy Text'}</span>
                        <span className="truncate">{wildcard.folder || 'Root'} · {wildcard.values.length} lines</span>
                      </small>
                    </span>
                    <Pencil size={12} className="shrink-0 text-zinc-600" />
                  </button>
                );
              }) : null}
            </div>
          </section>

          <section className="custom-scrollbar min-h-0 overflow-y-auto p-4">
            {!editor ? (
              <div className="flex h-full min-h-64 items-center justify-center text-center">
                <div><Pencil className="mx-auto h-8 w-8 text-zinc-700" /><div className="mt-3 text-sm font-bold text-zinc-400">Select a wildcard to edit</div><p className="mt-1 text-[10px] text-zinc-600">Names, folders, and every prompt line can be changed here.</p></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-mono text-sm font-bold text-fuchsia-100">__{editor.name}__</h3><p className="mt-1 text-[9px] text-zinc-600">{editorLineCount} prompt lines · source {editor.originalPath}.txt</p></div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {wildcards.find((entry) => entry.path === editor.originalPath)?.structured ? <button type="button" disabled={busy} onClick={() => { const wildcard = wildcards.find((entry) => entry.path === editor.originalPath); if (wildcard) onEditStructured(wildcard); }} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-emerald-300/25 bg-emerald-500/[0.08] px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-100"><Pencil size={12} /> Edit Groups</button> : null}
                    <button type="button" disabled={busy} onClick={() => void deleteEditor()} className={`inline-flex h-9 items-center gap-1.5 rounded-sm border px-2.5 text-[9px] font-black uppercase tracking-[0.08em] disabled:opacity-40 ${deleteArmed ? 'border-red-300/55 bg-red-500/15 text-red-100' : 'border-red-300/20 text-red-200/70 hover:text-red-100'}`}><Trash2 size={12} /> {deleteArmed ? 'Confirm Delete' : 'Delete'}</button>
                  </div>
                </div>
                {deleteArmed ? <div className="flex items-center justify-between gap-3 rounded-sm border border-red-300/20 bg-red-500/[0.06] p-2 text-[9px] text-red-100/80"><span>This permanently removes the wildcard and its WCUID metadata.</span><button type="button" onClick={() => setDeleteArmed(false)} className="shrink-0 text-zinc-400 hover:text-zinc-100">Cancel</button></div> : null}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <label><span className="mb-1 block text-[8px] font-black uppercase tracking-[0.12em] text-zinc-600">Wildcard Name</span><input value={editor.name} onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)} className="settings-input h-9 !py-1.5 font-mono text-xs" /></label>
                  <div className="self-end"><button type="button" disabled={browseFolder === 'all'} onClick={() => setEditor((current) => current ? { ...current, folder: selectedSaveFolder } : current)} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-cyan-300/20 px-2.5 text-[8px] font-black uppercase text-cyan-100 disabled:opacity-30"><FolderOpen size={12} /> Move Here</button></div>
                </div>
                <div className="rounded-sm border border-white/10 bg-black/25 px-3 py-2"><span className="block text-[8px] font-black uppercase tracking-[0.12em] text-zinc-600">Target Folder</span><strong className="mt-1 block truncate text-[10px] text-cyan-100">{editor.folder || 'Root'}</strong></div>
                <label><span className="mb-1 block text-[8px] font-black uppercase tracking-[0.12em] text-zinc-600">Wildcard Values · One Per Line</span><textarea value={editor.values} onChange={(event) => setEditor((current) => current ? { ...current, values: event.target.value } : current)} className="custom-scrollbar min-h-[22rem] w-full resize-y rounded-sm border border-white/12 bg-black/40 p-3 font-mono text-[10px] leading-5 text-zinc-200 outline-none focus:border-fuchsia-300/45" spellCheck={false} /></label>
                <button type="button" disabled={busy || !editor.name.trim() || editorLineCount === 0} onClick={() => void saveEditor()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm border border-fuchsia-300/35 bg-fuchsia-500/[0.12] text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/[0.18] disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes</button>
              </div>
            )}
          </section>
        </div>

        <footer className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-2">
          <div className="min-w-0"><span className="block text-[8px] font-black uppercase tracking-[0.12em] text-zinc-600">Generator Save Folder</span><strong className="mt-0.5 block truncate text-[10px] text-cyan-100">{selectedSaveFolder || 'Root'}</strong></div>
          <button type="button" disabled={browseFolder === 'all'} onClick={() => onChooseSaveFolder(selectedSaveFolder)} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-emerald-300/30 bg-emerald-500/10 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100 disabled:opacity-30"><Check size={12} /> Use This Folder</button>
        </footer>
    </section>
  );
}
