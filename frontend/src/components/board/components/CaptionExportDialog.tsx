import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, FolderOpen, Loader2, X } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { showInFileExplorer } from '@/utils/fileExplorer';
import { isUmbraRemoteClient } from '@/utils/hostOnly';

type Options = { mode: 'natural' | 'tags' | 'combined'; order: 'natural-first' | 'tags-first'; separator: string; tagPrefix: string; replaceUnderscores: boolean };
type Preview = { revision: string; total: number; ready: number; entries: { path: string; output: string; caption: string; error?: string }[]; warnings: string[]; trainer: { note: string } };
export function CaptionExportDialog({ dataset, onClose }: { dataset: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<Options>({ mode: 'combined', order: 'natural-first', separator: '\n\n', tagPrefix: 'Tags: ', replaceUnderscores: false });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  function change(patch: Partial<Options>) { setOptions(prev => ({ ...prev, ...patch })); setPreview(null); setOutput(''); setError(''); setIndex(0); }
  async function run(action: 'preview' | 'export') {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(dataset)}/caption-export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, options, revision: preview?.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Caption export failed.');
      if (action === 'preview') { setPreview(data); setIndex(0); }
      else setOutput(data.imagesPath);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  const entry = preview?.entries[index];
  // Keep the native top layer unfiltered: glass blur would offset fixed-position menu portals.
  return createPortal(<dialog ref={dialog} aria-labelledby="caption-export-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(900px,94vw)] overflow-visible border-0 bg-transparent p-0 text-[var(--umbra-text)] backdrop:bg-black/80">
    <div className="glass-panel flex max-h-[90dvh] flex-col rounded-lg border border-white/10 bg-[var(--umbra-surface-deep,#08090b)] shadow-2xl">
    <header className="flex items-center justify-between border-b border-white/10 p-3"><h2 id="caption-export-title" className="text-xs font-bold uppercase tracking-widest">Training captions · {dataset}</h2><button type="button" aria-label="Close caption export" disabled={busy} onClick={onClose} className="umbra-icon-button p-2"><X size={16} /></button></header>
    <div className="custom-scrollbar min-h-0 space-y-3 overflow-y-auto p-4 text-xs">
      <p className="text-zinc-400">Exports the complete dataset to a new folder. Images keep their original bytes; existing captions and source records stay intact. One image and one .txt are consumed per sample.</p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">Caption content<UmbraSelectControl aria-label="Caption content" value={options.mode} onChange={e => change({ mode: e.target.value as Options['mode'] })} className="umbra-input block w-full rounded p-2"><option value="natural">Natural language only</option><option value="tags">Tags only</option><option value="combined">Natural language + tags</option></UmbraSelectControl></label>
        {options.mode === 'combined' && <><label className="space-y-1">Order<UmbraSelectControl aria-label="Caption combination order" value={options.order} onChange={e => change({ order: e.target.value as Options['order'] })} className="umbra-input block w-full rounded p-2"><option value="natural-first">Description, then tags</option><option value="tags-first">Tags, then description</option></UmbraSelectControl></label>
          <label className="space-y-1">Between sources<UmbraSelectControl aria-label="Caption separator" value={options.separator} onChange={e => change({ separator: e.target.value })} className="umbra-input block w-full rounded p-2"><option value={'\n\n'}>Blank line</option><option value={'\n'}>New line</option><option value=", ">Comma and space</option></UmbraSelectControl></label>
          <label className="space-y-1">Tag segment label<input aria-label="Tag segment label" value={options.tagPrefix} maxLength={80} onChange={e => change({ tagPrefix: e.target.value })} className="umbra-input block w-full rounded p-2" /></label></>}
        {options.mode !== 'natural' && <label className="flex items-center gap-2"><input type="checkbox" checked={options.replaceUnderscores} onChange={e => change({ replaceUnderscores: e.target.checked })} />Use spaces instead of underscores in exported tags</label>}
      </fieldset>
      <p className="rounded border border-amber-400/20 bg-amber-400/5 p-2 text-amber-200">For prose or combined captions in AI Toolkit, set shuffle_tokens: false and token_dropout_rate: 0. These files do not change your training configuration. Tokenizer truncation is not validated.</p>
      <button type="button" disabled={busy} onClick={() => void run('preview')} className="umbra-icon-button rounded border border-white/10 px-3 py-2">{busy ? 'Working…' : 'Review export'}</button>
      {preview && <section className="space-y-2 rounded border border-white/10 p-3" aria-label="Caption export preview">
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{preview.ready} / {preview.total} ready · {preview.total - preview.ready} require attention</span><div className="flex items-center gap-2"><button type="button" aria-label="Previous caption" disabled={index === 0 || busy} onClick={() => setIndex(i => i - 1)} className="umbra-icon-button p-2"><ChevronLeft size={16} /></button><span>{index + 1} / {preview.total}</span><button type="button" aria-label="Next caption" disabled={index + 1 >= preview.total || busy} onClick={() => setIndex(i => i + 1)} className="umbra-icon-button p-2"><ChevronRight size={16} /></button></div></div>
        {entry && <><p className="break-all text-zinc-400">{entry.path}</p><pre data-i18n-skip="" className="custom-scrollbar max-h-60 min-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-3 text-sm">{entry.error || entry.caption}</pre></>}
        {preview.ready !== preview.total && <div role="status" className="text-amber-200">{preview.entries.filter(e => e.error).slice(0, 8).map(e => <p key={e.path} className="break-words">{e.path}: {e.error}</p>)}</div>}
        {preview.warnings.length > 0 && <div role="status" className="text-amber-200">{preview.warnings.length} source records have no image and will be excluded.{preview.warnings.slice(0, 8).map(warning => <p key={warning} className="break-words">{warning}</p>)}</div>}
        <p className="text-zinc-500">Exported filenames are stable hashes of source paths to avoid basename collisions. caption-export.json maps them back to each original path and media identity. Original producer history is included separately and is not training text. Concept folders are flattened; configure repeats and weights in your trainer.</p>
      </section>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {output && <div role="status" className="space-y-2"><p>Export complete. Point your trainer at:</p><p data-i18n-skip="" className="break-all select-all text-zinc-300">{output}</p>{!isUmbraRemoteClient() && <button type="button" className="umbra-icon-button flex items-center gap-2 p-2" onClick={() => void showInFileExplorer(output).catch(err => setError(String(err)))}><FolderOpen size={14} />Show export folder</button>}</div>}
    </div>
    <footer className="flex justify-end border-t border-white/10 p-3"><button type="button" disabled={busy || !preview || preview.ready !== preview.total || !!output} onClick={() => void run('export')} className="umbra-icon-button flex items-center gap-2 rounded border border-[var(--umbra-accent)] px-3 py-2 text-xs disabled:opacity-40">{busy && <Loader2 size={14} className="animate-spin" />}Export reviewed captions</button></footer>
    </div>
  </dialog>, document.body);
}
