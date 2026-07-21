import { useMemo, useState, type MouseEvent } from 'react';
import { Archive, ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Trash2, Image, Pencil, FolderPlus, Loader2, MousePointer2 } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuItem } from '@/hooks/useContextMenu';
import type { Dataset } from '../types';

interface DatasetTreeProps {
  datasets: Dataset[];
  selectedDataset: string | null;
  selectedConcept: string | null;
  onSelectDataset: (name: string) => void;
  onSelectConcept: (dataset: string, concept: string) => void;
  onCreateDataset: () => void;
  onCreateConcept: (dataset: string) => void;
  onArchiveDataset: (dataset: string) => void;
  onOpenDatasetArchive: (path: string) => void;
  onRenameDataset: (name: string) => void;
  onDeleteDataset: (name: string) => void;
  onDeleteConcept: (dataset: string, concept: string) => void;
  archivingDataset: string | null;
}

type DatasetTreeContextMenu =
  | { type: 'dataset'; x: number; y: number; dataset: Dataset }
  | { type: 'concept'; x: number; y: number; dataset: Dataset; conceptKey: string; conceptName: string }
  | { type: 'empty'; x: number; y: number };

export function DatasetTree({
  datasets,
  selectedDataset,
  selectedConcept,
  onSelectDataset,
  onSelectConcept,
  onCreateDataset,
  onCreateConcept,
  onArchiveDataset,
  onOpenDatasetArchive,
  onRenameDataset,
  onDeleteDataset,
  onDeleteConcept,
  archivingDataset,
}: DatasetTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<DatasetTreeContextMenu | null>(null);

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const openDatasetMenu = (event: MouseEvent, dataset: Dataset) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ type: 'dataset', x: event.clientX, y: event.clientY, dataset });
  };

  const openConceptMenu = (
    event: MouseEvent,
    dataset: Dataset,
    conceptKey: string,
    conceptName: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ type: 'concept', x: event.clientX, y: event.clientY, dataset, conceptKey, conceptName });
  };

  const runMenuAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];

    if (contextMenu.type === 'dataset') {
      return [
        {
          label: 'Open Dataset',
          icon: <MousePointer2 className="h-3.5 w-3.5 text-cyan-300" />,
          action: () => runMenuAction(() => {
            onSelectDataset(contextMenu.dataset.name);
            setExpanded(prev => new Set(prev).add(contextMenu.dataset.name));
          }),
        },
        {
          label: 'New Concept',
          icon: <FolderPlus className="h-3.5 w-3.5 text-emerald-300" />,
          action: () => runMenuAction(() => {
            setExpanded(prev => new Set(prev).add(contextMenu.dataset.name));
            onCreateConcept(contextMenu.dataset.name);
          }),
        },
        {
          label: contextMenu.dataset.archive ? 'Rebuild Dataset ZIP' : 'Create Dataset ZIP',
          icon: archivingDataset === contextMenu.dataset.name
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
            : <Archive className="h-3.5 w-3.5 text-cyan-300" />,
          disabled: Boolean(archivingDataset),
          action: () => runMenuAction(() => onArchiveDataset(contextMenu.dataset.name)),
        },
        ...(contextMenu.dataset.archive?.path ? [{
          label: 'Open ZIP Path',
          icon: <FolderOpen className="h-3.5 w-3.5 text-amber-300" />,
          action: () => runMenuAction(() => onOpenDatasetArchive(contextMenu.dataset.archive!.path)),
        }] : []),
        {
          label: 'Rename Dataset',
          icon: <Pencil className="h-3.5 w-3.5 text-amber-300" />,
          action: () => runMenuAction(() => onRenameDataset(contextMenu.dataset.name)),
        },
        { separator: true },
        {
          label: 'Delete Dataset',
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          action: () => runMenuAction(() => onDeleteDataset(contextMenu.dataset.name)),
        },
      ];
    }

    if (contextMenu.type === 'concept') {
      return [
        {
          label: 'Open Concept',
          icon: <Image className="h-3.5 w-3.5 text-cyan-300" />,
          action: () => runMenuAction(() => onSelectConcept(contextMenu.dataset.name, contextMenu.conceptKey)),
        },
        {
          label: 'New Concept',
          icon: <FolderPlus className="h-3.5 w-3.5 text-emerald-300" />,
          action: () => runMenuAction(() => onCreateConcept(contextMenu.dataset.name)),
        },
        { separator: true },
        {
          label: `Delete ${contextMenu.conceptName}`,
          icon: <Trash2 className="h-3.5 w-3.5" />,
          danger: true,
          action: () => runMenuAction(() => onDeleteConcept(contextMenu.dataset.name, contextMenu.conceptKey)),
        },
      ];
    }

    return [
      {
        label: 'New Dataset',
        icon: <Plus className="h-3.5 w-3.5 text-emerald-300" />,
        action: () => runMenuAction(onCreateDataset),
      },
    ];
  }, [archivingDataset, contextMenu, onArchiveDataset, onCreateConcept, onCreateDataset, onDeleteConcept, onDeleteDataset, onOpenDatasetArchive, onRenameDataset, onSelectConcept, onSelectDataset]);

  return (
    <div
      className="h-full flex flex-col"
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({ type: 'empty', x: event.clientX, y: event.clientY });
      }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
          Datasets
        </span>
        <button
          onClick={onCreateDataset}
          className="umbra-icon-button rounded p-1 transition-colors hover:text-cyan-300"
          title="New Dataset"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-2">
        {datasets.map(dataset => {
          const isExpanded = expanded.has(dataset.name);
          const isSelected = selectedDataset === dataset.name && !selectedConcept;

          return (
            <div key={dataset.name}>
              {/* Dataset row */}
              <div
                className={`group flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1.5 transition-colors
                           ${isSelected ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100' : 'border-transparent text-zinc-300 hover:border-white/10 hover:bg-white/5'}`}
                onContextMenu={(event) => openDatasetMenu(event, dataset)}
              >
                <button
                  onClick={() => toggleExpand(dataset.name)}
                  className="umbra-icon-button rounded p-0.5 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  )}
                </button>

                <button
                  onClick={() => {
                    onSelectDataset(dataset.name);
                    if (!isExpanded) toggleExpand(dataset.name);
                  }}
                  className="flex-1 flex items-center gap-2 text-left"
                >
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Folder className="w-4 h-4 text-amber-500" />
                  )}
                  <span className="text-sm truncate">{dataset.name}</span>
                </button>

                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => onCreateConcept(dataset.name)}
                    className="umbra-icon-button rounded p-1 transition-colors hover:text-cyan-300"
                    title="Add Concept"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteDataset(dataset.name)}
                    className="umbra-icon-button rounded p-1 transition-colors hover:text-red-400"
                    title="Delete Dataset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Concepts */}
              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                  {dataset.concepts.map(concept => {
                    const conceptKey = `${concept.repeats}_${concept.isReg ? 'reg_' : ''}${concept.name}`;
                    const isConceptSelected = selectedDataset === dataset.name && selectedConcept === conceptKey;

                    return (
                      <div
                        key={conceptKey}
                        className={`group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 transition-colors
                                   ${isConceptSelected ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-100' : 'border-transparent text-zinc-300 hover:border-white/10 hover:bg-white/5'}`}
                        onClick={() => onSelectConcept(dataset.name, conceptKey)}
                        onContextMenu={(event) => openConceptMenu(event, dataset, conceptKey, concept.name)}
                      >
                        <Image className="w-3.5 h-3.5 text-zinc-500" />
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${
                          concept.isReg ? 'border-cyan-400/30 bg-cyan-500/12 text-cyan-200' : 'border-emerald-400/30 bg-emerald-500/12 text-emerald-300'
                        }`}>
                          {concept.repeats}
                        </span>
                        <span className="text-sm flex-1 truncate">
                          {concept.isReg && <span className="text-cyan-300">reg_</span>}
                          {concept.name}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {concept.images.length}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConcept(dataset.name, conceptKey);
                          }}
                          className="rounded p-0.5 text-zinc-500 opacity-0 transition-colors hover:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}

                  {dataset.concepts.length === 0 && (
                    <p className="px-2 py-1 text-xs italic text-zinc-500">
                      No concepts yet
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {datasets.length === 0 && (
          <div className="py-8 text-center text-zinc-500">
            <Folder className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No datasets</p>
            <button
              onClick={onCreateDataset}
              className="mt-2 text-xs text-cyan-300 hover:text-cyan-200"
            >
              Create your first dataset
            </button>
          </div>
        )}
      </div>

      <ContextMenu
        isOpen={Boolean(contextMenu)}
        position={{ x: contextMenu?.x || 0, y: contextMenu?.y || 0 }}
        items={contextMenuItems}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}
