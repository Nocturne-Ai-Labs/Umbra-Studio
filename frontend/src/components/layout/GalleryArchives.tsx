import { useEffect, useState } from 'react';
import { Archive, Download, Loader2, X } from 'lucide-react';
import { archiveIsActive, dismissGalleryArchive, type GalleryArchiveJob } from '@/lib/galleryArchives';

const sizeLabel = (bytes: number) => bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)} GB` : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
const leaf = (path: string) => path.replace(/\\/g, '/').split('/').pop() || path;

export function GalleryArchiveStatus({ job }: { job: GalleryArchiveJob | null }) {
  if (!job) return null;
  const active = archiveIsActive(job);
  const percent = job.bytes ? Math.min(99, Math.round(job.processedBytes / job.bytes * 100)) : 0;
  const labels = { queued: 'ZIP queued', scanning: 'Scanning folder', packing: 'Creating ZIP', saving: 'Saving ZIP', completed: 'ZIP created', failed: 'ZIP failed' };
  return <div data-gallery-archive-status className="shrink-0 border-b border-white/10 px-3 py-2 text-xs">
    <div className="flex items-center gap-2">
      {active ? <Loader2 size={15} className="shrink-0 animate-spin" /> : <Archive size={15} className="shrink-0" />}
      <span className="min-w-0 flex-1 break-words">{labels[job.phase]}: {leaf(job.path || job.folder)}{job.phase === 'packing' ? ` - ${percent}%` : ''}</span>
      {!active && <button type="button" title="Dismiss archive status" onClick={dismissGalleryArchive} className="flex h-8 w-8 shrink-0 items-center justify-center"><X size={15} /></button>}
    </div>
    {active && <progress aria-label="ZIP progress" className="mt-2 h-1.5 w-full accent-[var(--umbra-accent)]" max={100} value={job.phase === 'packing' && job.bytes ? percent : undefined} />}
    {job.currentFile && <div className="mt-1 truncate text-zinc-400" title={job.currentFile}>{job.currentFile}</div>}
    {job.error && <div role="alert" className="mt-1 break-words text-red-300">{job.error}</div>}
    {job.skippedLinks > 0 && <div className="mt-1 text-amber-300">{job.skippedLinks} symbolic links skipped</div>}
  </div>;
}

type ArchiveFile = { name: string; path: string; size: number; modified: number };
export function GalleryArchiveList({ folder, job, query = '', onCount }: { folder: string; job: GalleryArchiveJob | null; query?: string; onCount: (count: number) => void }) {
  const [files, setFiles] = useState<ArchiveFile[]>([]);
  const [loadedFolder, setLoadedFolder] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const completedJob = job?.phase === 'completed' ? job.id : '';
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('umbra:gallery-content-changed', refresh);
    window.addEventListener('umbra:gallery-archives-refresh', refresh);
    return () => {
      window.removeEventListener('umbra:gallery-content-changed', refresh);
      window.removeEventListener('umbra:gallery-archives-refresh', refresh);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/fs/archives?path=${encodeURIComponent(folder)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to list ZIP files');
        if (!controller.signal.aborted) {
          setFiles(payload.archives || []);
          setLoadedFolder(folder);
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to list ZIP files');
      }
    })();
    return () => controller.abort();
  }, [folder, completedJob, revision]);
  const visible = loadedFolder === folder ? files.filter(file => file.name.toLowerCase().includes(query.toLowerCase())) : [];
  useEffect(() => { onCount(visible.length); }, [visible.length, onCount]);
  if (!error && visible.length === 0) return null;
  return <section data-gallery-archives className="mb-4 border-b border-white/10 pb-3">
    <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400"><Archive size={14} /> ZIP archives <span>{visible.length}</span></div>
    {error && <div role="alert" className="text-xs text-red-300">{error}</div>}
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))]">
      {visible.map(file => <a key={file.path} href={`/api/fs/archives/download?path=${encodeURIComponent(file.path)}`} download={file.name} title={`Download ${file.name}`} className="flex min-h-16 min-w-0 items-center gap-3 rounded border border-white/10 bg-zinc-900/40 p-3 hover:border-[var(--umbra-accent)]">
        <Archive size={24} className="shrink-0 text-[var(--umbra-accent)]" />
        <span className="min-w-0 flex-1"><span className="block break-words text-xs text-zinc-100">{file.name}</span><span className="text-[11px] text-zinc-400">{sizeLabel(file.size)}</span></span>
        <Download size={15} className="shrink-0 text-zinc-400" />
      </a>)}
    </div>
  </section>;
}
