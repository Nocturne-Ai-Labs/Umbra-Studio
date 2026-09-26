import React, { useEffect, useMemo, useRef } from 'react';
import { ChevronRight, FolderOpen } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { buildGalleryBreadcrumbs } from '@/lib/galleryBreadcrumbs';
import { cn } from '@/lib/utils';

type FolderEntry = { path: string; name: string };
export function GalleryBreadcrumbs({ folder, roots, childrenByPath, loadingPaths, loadChildren, onOpen, onContextMenu, onDragOver, onDragLeave, onDrop, dropTarget }: {
  folder: string;
  roots: Array<{ path: string; label: string }>;
  childrenByPath: Record<string, FolderEntry[]>;
  loadingPaths: Set<string>;
  loadChildren: (path: string) => Promise<FolderEntry[]>;
  onOpen: (path: string) => void;
  onContextMenu: (event: React.MouseEvent, path: string) => void;
  onDragOver: (event: React.DragEvent, path: string) => void;
  onDragLeave: (path: string) => void;
  onDrop: (event: React.DragEvent, path: string) => void;
  dropTarget: string;
}) {
  const trailRef = useRef<HTMLElement>(null);
  const crumbs = useMemo(() => buildGalleryBreadcrumbs(folder, roots), [folder, roots]);
  useEffect(() => {
    const trail = trailRef.current;
    if (!trail) return;
    const revealCurrent = () => { trail.scrollLeft = trail.scrollWidth; };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(trail);
    return () => observer.disconnect();
  }, [folder]);
  return <nav ref={trailRef} aria-label="Gallery folder breadcrumb" className="flex min-w-0 items-center gap-1 overflow-x-auto py-1">
    {crumbs.map((crumb, index) => {
      const current = index === crumbs.length - 1;
      const siblings = crumb.parent ? childrenByPath[crumb.parent] || [] : roots.map(root => ({ path: root.path, name: root.label }));
      const choices = siblings.some(sibling => sibling.path === crumb.path) ? siblings : [{ path: crumb.path, name: crumb.label }, ...siblings];
      const load = () => { if (crumb.parent) void loadChildren(crumb.parent); };
      return <React.Fragment key={crumb.path}>
        {index > 0 && <ChevronRight size={14} className={cn('shrink-0', current ? 'text-[var(--umbra-accent)]' : 'text-zinc-600')} aria-hidden />}
        <div
          className={cn('flex shrink-0 items-center rounded border', current || dropTarget === crumb.path ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)]' : 'border-zinc-800 bg-zinc-900/60')}
          onContextMenu={event => onContextMenu(event, crumb.path)}
          onDragOver={event => onDragOver(event, crumb.path)}
          onDragLeave={() => onDragLeave(crumb.path)}
          onDrop={event => onDrop(event, crumb.path)}
        >
          <button type="button" title={crumb.path} aria-current={current ? 'location' : undefined} onClick={() => onOpen(crumb.path)} className="flex h-8 min-w-0 items-center gap-1.5 px-2 text-xs text-zinc-200 hover:text-white">
            {index === 0 && <FolderOpen size={13} className="shrink-0" />}
            <span className="max-w-40 truncate">{crumb.label}</span>
          </button>
          <div onPointerEnter={load} onFocusCapture={load} onPointerDownCapture={load}>
            <UmbraSelect
              value={crumb.path}
              options={[
                ...choices.map(choice => ({ value: choice.path, label: choice.name, icon: <FolderOpen size={13} /> })),
                ...(loadingPaths.has(crumb.parent) ? [{ value: '__loading__', label: 'Loading folders...', disabled: true }] : []),
              ]}
              onValueChange={onOpen}
              ariaLabel={`Choose folder beside ${crumb.label}`}
              triggerTitle={crumb.parent ? `Folders in ${crumb.parent}` : 'Library roots'}
              menuTitle={crumb.parent ? 'Folders in this directory' : 'Library roots'}
              menuSubtitle={crumb.parent || 'Library'}
              size="sm"
              buttonClassName="!w-7 !rounded-none !border-0 !border-l !border-zinc-800 !bg-transparent !px-1.5 [&>span]:hidden"
            />
          </div>
        </div>
      </React.Fragment>;
    })}
  </nav>;
}
