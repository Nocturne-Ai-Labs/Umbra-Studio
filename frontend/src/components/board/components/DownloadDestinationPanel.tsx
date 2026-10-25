import { useState } from 'react';
import { Check, Folder, FolderOpen, Plus, Pencil, RefreshCw, Search, X } from 'lucide-react';
import type { Dataset } from '../types';

export function DownloadDestinationPanel({ datasets, selected, folders, loading, error, onSelect, onToggle, onCreate, onRename, onRefresh, onClose }: {
  datasets: Dataset[]; selected: string; folders: Set<string>; loading: boolean; error: string | null;
  onSelect: (name: string) => void; onToggle: (folder: string) => void; onCreate: () => void;
  onRename: () => void; onRefresh: () => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const visible = datasets.filter(dataset => dataset.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <aside id="booru-download-folders" aria-label="Download folders" className="forge-destination-panel absolute inset-y-0 right-0 z-40 flex w-72 max-w-[92vw] shrink-0 flex-col border-l xl:relative xl:z-auto">
    <header className="flex items-center gap-2 border-b border-white/10 p-3">
      <FolderOpen size={15} className="text-[var(--umbra-accent)]" /><h2 className="mr-auto text-xs font-semibold">Download folder</h2>
      <button type="button" className="forge-button forge-button-icon" aria-label="Refresh download folders" title="Refresh folders" onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
      <button type="button" className="forge-button forge-button-icon" aria-label="Close download folders" onClick={onClose}><X size={14} /></button>
    </header>
    <div className="space-y-2 border-b border-white/10 p-3">
      <button type="button" className="forge-button w-full" onClick={onCreate}><Plus size={14} />New dataset folder</button>
      <label className="flex items-center gap-2 rounded border border-white/10 px-2"><Search size={13} className="shrink-0 text-zinc-500" /><input aria-label="Find download folder" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a folder…" className="h-8 min-w-0 w-full bg-transparent text-xs outline-none" /></label>
    </div>
    <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {error && <p role="alert" className="p-2 text-xs text-red-300">{error}</p>}
      {!visible.length && <p role="status" className="p-3 text-xs text-zinc-500">{loading ? 'Loading folders…' : query ? 'No matching folders.' : 'Create a dataset folder to start collecting.'}</p>}
      {visible.map(dataset => <div key={dataset.name}>
        <button type="button" aria-pressed={selected === dataset.name} className="forge-button w-full !justify-start !py-2" onClick={() => onSelect(dataset.name)} title={dataset.name}>
          <Folder size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate text-left">{dataset.name}</span>{selected === dataset.name && <Check size={14} className="shrink-0" />}
        </button>
        {dataset.name === selected && dataset.layout !== 'flat' && <div className="ml-3 space-y-1 border-l border-white/10 py-2 pl-2">
          <p className="px-1 text-[10px] text-zinc-500">Choose destination subfolders</p>
          {dataset.concepts.map(folder => <button key={folder.folder} type="button" aria-pressed={folders.has(folder.folder)} className="forge-button w-full !justify-start" onClick={() => onToggle(folder.folder)} title={folder.folder}><span className="w-3 shrink-0">{folders.has(folder.folder) && <Check size={12} />}</span><span className="truncate">{folder.folder}</span></button>)}
        </div>}
      </div>)}
    </div>
    {selected && <footer className="space-y-2 border-t border-white/10 p-3">
      <p className="break-words text-xs text-zinc-400">{selected}{folders.size > 1 ? ` · ${folders.size} subfolders` : ''}</p>
      <button type="button" className="forge-button" onClick={onRename} disabled={!datasets.some(dataset => dataset.name === selected)}><Pencil size={13} />Rename folder</button>
    </footer>}
  </aside>;
}
