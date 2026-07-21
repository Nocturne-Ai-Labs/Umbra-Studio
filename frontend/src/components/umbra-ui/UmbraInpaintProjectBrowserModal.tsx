'use client';

import React from 'react';
import {
  Check,
  Clock3,
  FolderOpen,
  Image,
  Layers3,
  Loader2,
  Search,
} from 'lucide-react';
import { BaseModal } from '@/components/modals/BaseModal';
import { cn } from '@/lib/utils';
import type { UmbraCanvasProjectSummary } from '@/lib/umbraUiCanvasProjects';

interface UmbraInpaintProjectBrowserModalProps {
  isOpen: boolean;
  projects: UmbraCanvasProjectSummary[];
  activeProjectId?: string;
  onClose: () => void;
  onOpenProject: (projectId: string) => Promise<boolean>;
}

const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function ProjectThumbnail({ project }: { project: UmbraCanvasProjectSummary }) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => setFailed(false), [project.thumbnailUrl]);

  return (
    <span className="relative block h-20 w-24 shrink-0 overflow-hidden rounded border border-white/10 bg-black/60">
      {project.thumbnailUrl && !failed ? (
        <img
          src={project.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-zinc-700">
          <Image size={20} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 text-center font-mono text-[8px] font-black text-zinc-300">
        {project.width}x{project.height}
      </span>
    </span>
  );
}

export function UmbraInpaintProjectBrowserModal({
  isOpen,
  projects,
  activeProjectId = '',
  onClose,
  onOpenProject,
}: UmbraInpaintProjectBrowserModalProps) {
  const [query, setQuery] = React.useState('');
  const [openingProjectId, setOpeningProjectId] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setOpeningProjectId('');
    }
  }, [isOpen]);

  const visibleProjects = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...projects]
      .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name))
      .filter((project) => !normalizedQuery || project.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [projects, query]);

  const openProject = React.useCallback(async (projectId: string) => {
    if (openingProjectId) return;
    if (projectId === activeProjectId) {
      onClose();
      return;
    }
    setOpeningProjectId(projectId);
    const opened = await onOpenProject(projectId);
    setOpeningProjectId('');
    if (opened) onClose();
  }, [activeProjectId, onClose, onOpenProject, openingProjectId]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Inpaint Projects"
      size="lg"
      closeOnBackdrop={!openingProjectId}
      closeOnEscape={!openingProjectId}
    >
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <label className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              aria-label="Search inpaint projects"
              className="h-10 w-full border border-white/10 bg-black/40 pl-9 pr-3 font-mono text-[11px] text-zinc-200 outline-none focus:border-cyan-300/40"
            />
          </label>
          <span className="shrink-0 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-zinc-600">
            {visibleProjects.length}/{projects.length}
          </span>
        </div>

        <div className="max-h-[58vh] min-h-56 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar" role="listbox" aria-label="Saved inpaint projects">
          {visibleProjects.map((project) => {
            const active = project.id === activeProjectId;
            const opening = project.id === openingProjectId;
            return (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => void openProject(project.id)}
                disabled={Boolean(openingProjectId)}
                className={cn(
                  'grid w-full grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-2.5 text-left transition-colors disabled:cursor-wait',
                  active
                    ? 'border-cyan-300/45 bg-cyan-500/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                )}
              >
                <ProjectThumbnail project={project} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderOpen size={14} className={active ? 'shrink-0 text-cyan-200' : 'shrink-0 text-zinc-500'} />
                    <span className="truncate text-[12px] font-black text-zinc-100">{project.name}</span>
                    {active ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-cyan-300/25 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase text-cyan-200">
                        <Check size={8} /> Active
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-5 font-mono text-[9px] text-zinc-600">
                    <span className="inline-flex items-center gap-1"><Layers3 size={10} /> {project.layerCount} layers</span>
                    <span>{project.stagingCount} staged</span>
                    <span className="inline-flex items-center gap-1"><Clock3 size={10} /> {UPDATED_AT_FORMATTER.format(project.updatedAt)}</span>
                  </div>
                </div>
                <span className={cn(
                  'inline-flex h-8 min-w-20 items-center justify-center gap-1.5 rounded border px-2 font-mono text-[9px] font-black uppercase',
                  active
                    ? 'border-cyan-300/25 text-cyan-100'
                    : 'border-white/10 text-zinc-400',
                )}>
                  {opening ? <Loader2 size={11} className="animate-spin" /> : active ? <Check size={11} /> : <FolderOpen size={11} />}
                  {opening ? 'Opening' : active ? 'Current' : 'Open'}
                </span>
              </button>
            );
          })}

          {visibleProjects.length <= 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center border border-dashed border-white/10 text-zinc-700">
              <FolderOpen size={28} className="mb-3" />
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.14em]">
                {projects.length <= 0 ? 'No saved projects' : 'No matching projects'}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </BaseModal>
  );
}
