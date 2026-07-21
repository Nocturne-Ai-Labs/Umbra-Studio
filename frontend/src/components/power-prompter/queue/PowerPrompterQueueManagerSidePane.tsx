import React from 'react';
import { ImageIcon, RefreshCw } from 'lucide-react';
import type { PowerPrompterOutputPreviewItem } from '@/components/layout/PowerPrompterCardChainEditor';
import { Portal } from '@/components/ui/Portal';
import { buildFsImageUrl } from '@/lib/utils';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import type {
  GenerationPreviewState,
  QueueManagerOutputBucket,
  QueueManagerOutputMenuState,
} from './queueCore';

type PowerPrompterQueueManagerSidePaneProps = {
  queueManagerRightPaneRef: React.RefObject<HTMLDivElement | null>;
  queueManagerPreviewSplit: number;
  beginQueueManagerPaneResize: (event: React.PointerEvent<HTMLButtonElement>) => void;
  hasActiveGenerationPreview: boolean;
  generationPreview: GenerationPreviewState | null;
  generationPreviewStatusLabel: string;
  generationPreviewStepLabel: string;
  isLoadingOutputPreview: boolean;
  queueManagerMediaItems: PowerPrompterOutputPreviewItem[];
  outputPreviewError: string | null;
  queueManagerOutputBuckets: QueueManagerOutputBucket[];
  queueManagerStyleFilter: string;
  setQueueManagerStyleFilter: React.Dispatch<React.SetStateAction<string>>;
  handleRefreshQueueManagerOutputs: () => void;
  openQueueManagerOutputInViewer: (item: PowerPrompterOutputPreviewItem) => void;
  openQueueManagerOutputInLibrary: (item: PowerPrompterOutputPreviewItem) => void;
  pinQueueManagerOutputFolder: (item: PowerPrompterOutputPreviewItem) => void;
  openQueueManagerOutputInExplorer: (item: PowerPrompterOutputPreviewItem) => void | Promise<void>;
  sendQueueManagerOutputToTrash: (item: PowerPrompterOutputPreviewItem) => void | Promise<void>;
  sendQueueManagerOutputToWorkspace: (item: PowerPrompterOutputPreviewItem, workspace: 'waifudiffusion' | 'scanner') => void;
  queueOutputMenu: QueueManagerOutputMenuState | null;
  setQueueOutputMenu: React.Dispatch<React.SetStateAction<QueueManagerOutputMenuState | null>>;
};

const OUTPUT_MENU_MARGIN = 8;

function getQueueOutputMenuBoundary(): DOMRect {
  if (typeof window === 'undefined') {
    return new DOMRect(0, 0, 0, 0);
  }
  const boundary = document.querySelector('[data-umbra-context-menu-boundary="workspace"]')?.getBoundingClientRect();
  return boundary || new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function fitQueueOutputMenu(position: { x: number; y: number }, menuRect: DOMRect): React.CSSProperties {
  if (typeof window === 'undefined') {
    return {
      left: position.x,
      top: position.y,
      visibility: 'hidden',
    };
  }
  const boundary = getQueueOutputMenuBoundary();
  const leftEdge = boundary.left + OUTPUT_MENU_MARGIN;
  const topEdge = boundary.top + OUTPUT_MENU_MARGIN;
  const rightEdge = Math.max(leftEdge, boundary.right - OUTPUT_MENU_MARGIN);
  const bottomEdge = Math.max(topEdge, boundary.bottom - OUTPUT_MENU_MARGIN);
  const width = Math.min(menuRect.width || 300, Math.max(220, rightEdge - leftEdge));
  const height = Math.min(menuRect.height || 320, Math.max(0, bottomEdge - topEdge));
  const openLeft = position.x + width > rightEdge && position.x - width >= leftEdge;
  const openUp = position.y + height > bottomEdge && position.y - height >= topEdge;
  const desiredLeft = openLeft ? position.x - width : position.x;
  const desiredTop = openUp ? position.y - height : position.y;

  return {
    left: Math.min(Math.max(leftEdge, desiredLeft), Math.max(leftEdge, rightEdge - width)),
    top: Math.min(Math.max(topEdge, desiredTop), Math.max(topEdge, bottomEdge - height)),
    maxHeight: Math.max(160, bottomEdge - topEdge),
    visibility: 'visible',
  };
}

export function PowerPrompterQueueManagerSidePane({
  queueManagerRightPaneRef,
  queueManagerPreviewSplit,
  beginQueueManagerPaneResize,
  hasActiveGenerationPreview,
  generationPreview,
  generationPreviewStatusLabel,
  generationPreviewStepLabel,
  isLoadingOutputPreview,
  queueManagerMediaItems,
  outputPreviewError,
  queueManagerOutputBuckets,
  queueManagerStyleFilter,
  setQueueManagerStyleFilter,
  handleRefreshQueueManagerOutputs,
  openQueueManagerOutputInViewer,
  openQueueManagerOutputInLibrary,
  pinQueueManagerOutputFolder,
  openQueueManagerOutputInExplorer,
  sendQueueManagerOutputToTrash,
  sendQueueManagerOutputToWorkspace,
  queueOutputMenu,
  setQueueOutputMenu,
}: PowerPrompterQueueManagerSidePaneProps) {
  const outputMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [outputMenuStyle, setOutputMenuStyle] = React.useState<React.CSSProperties>({
    left: 0,
    top: 0,
    visibility: 'hidden',
  });

  React.useLayoutEffect(() => {
    if (!queueOutputMenu) return;
    setOutputMenuStyle({
      left: queueOutputMenu.x,
      top: queueOutputMenu.y,
      visibility: 'hidden',
    });

    const updatePosition = () => {
      if (!outputMenuRef.current) return;
      setOutputMenuStyle(fitQueueOutputMenu(
        { x: queueOutputMenu.x, y: queueOutputMenu.y },
        outputMenuRef.current.getBoundingClientRect(),
      ));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [queueOutputMenu]);

  const openOutputContextMenu = (
    event: React.MouseEvent | React.PointerEvent,
    item: PowerPrompterOutputPreviewItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setQueueOutputMenu({ item, x: event.clientX, y: event.clientY });
  };

  return (
    <>
        <div
          ref={queueManagerRightPaneRef}
          className="min-h-0 grid gap-3"
          style={{
            gridTemplateRows: `minmax(220px, ${queueManagerPreviewSplit}fr) auto minmax(144px, ${1 - queueManagerPreviewSplit}fr)`,
          }}
        >
          <div className="min-h-0 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] shadow-lg shadow-emerald-900/20 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-emerald-400/20 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Generation Preview</div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-300/80 truncate">
                  {hasActiveGenerationPreview
                    ? `${generationPreviewStatusLabel}${generationPreviewStepLabel ? ` | ${generationPreviewStepLabel}` : ''}`
                    : 'Waiting for queue preview'}
                </div>
              </div>
              {hasActiveGenerationPreview && generationPreview?.status === 'running' && (
                <span className="text-[10px] uppercase tracking-widest px-1.5 py-1 rounded-md border border-emerald-300/55 bg-emerald-500/18 text-emerald-100">
                  Live
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 p-3">
              <div className="h-full rounded-lg border border-white/10 bg-black/35 overflow-hidden flex items-center justify-center">
                {hasActiveGenerationPreview && String(generationPreview?.imageDataUrl || '').trim() ? (
                  <img
                    src={String(generationPreview?.imageDataUrl || '')}
                    alt="Queue manager generation preview"
                    className="umbra-power-prompter-generation-preview w-full h-full object-contain"
                    loading="eager"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <ImageIcon size={26} className="text-emerald-300/70" />
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                        Preview Standing By
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                        Queue Manager will show the active generation here as soon as ComfyUI streams a preview frame.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onPointerDown={beginQueueManagerPaneResize}
            className="group relative h-3 rounded-full border border-white/10 bg-black/20 transition-colors hover:border-cyan-400/35 hover:bg-cyan-500/[0.08] active:cursor-row-resize"
            title="Drag to resize Generation Preview and Queue Outputs"
          >
            <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-4">
              <span className="block h-px rounded-full bg-white/10 group-hover:bg-cyan-300/45" />
            </span>
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/[0.06] group-hover:border-cyan-300/45 group-hover:bg-cyan-400/15" />
          </button>
          <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
              <ImageIcon size={14} className="text-zinc-500" />
              <span className="text-[10px] uppercase tracking-widest font-black text-zinc-500">Queue Outputs</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                Feed Strip
              </span>
              <span
                className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500"
                title="Use the mouse wheel to scrub the output feed strip"
              >
                Wheel Scrub
              </span>
              <button
                onClick={handleRefreshQueueManagerOutputs}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:border-white/20 hover:text-zinc-100"
                title="Refresh queue output preview"
              >
                <RefreshCw size={11} className={isLoadingOutputPreview ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <div className="h-full overflow-y-auto custom-scrollbar rounded-lg border border-white/5 bg-black/20 p-2">
                {isLoadingOutputPreview && queueManagerMediaItems.length === 0 && (
                  <div className="px-2 py-3 text-[10px] uppercase tracking-widest text-zinc-600">Loading outputs...</div>
                )}
                {!isLoadingOutputPreview && queueManagerMediaItems.length === 0 && (
                  <div className="px-2 py-3 text-[10px] uppercase tracking-widest text-zinc-600">
                    {outputPreviewError ? 'Output preview unavailable' : 'No queue outputs to show yet'}
                  </div>
                )}
                <div className="space-y-3">
                  {queueManagerOutputBuckets.map((bucket) => (
                    <div key={`queue-output-bucket-${bucket.key}`} className="rounded-lg border border-white/8 bg-black/25 p-2">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                          {bucket.setLabel}
                        </span>
                        {bucket.styleCounts.map((styleCount) => (
                          <button
                            key={`queue-output-bucket-style-${bucket.key}-${styleCount.label}`}
                            type="button"
                            onClick={() => setQueueManagerStyleFilter((prev) =>
                              prev.toLowerCase() === styleCount.label.toLowerCase() ? '' : styleCount.label
                            )}
                            className={`inline-flex max-w-[190px] items-center rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition-colors ${
                              queueManagerStyleFilter.toLowerCase() === styleCount.label.toLowerCase()
                                ? 'border-amber-300/55 bg-amber-500/14 text-amber-100'
                                : 'border-amber-400/20 bg-amber-500/8 text-amber-200/85 hover:border-amber-300/45 hover:text-amber-100'
                            }`}
                            title={`${styleCount.count} output${styleCount.count === 1 ? '' : 's'} for ${styleCount.label}`}
                          >
                            <span className="truncate">{styleCount.label} · {styleCount.count}</span>
                          </button>
                        ))}
                        <span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-500">
                          {bucket.items.length} output{bucket.items.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div
                        className="overflow-x-auto overflow-y-hidden custom-scrollbar"
                        onWheel={(event) => {
                          if (event.ctrlKey) return;
                          const node = event.currentTarget;
                          const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
                          if (maxLeft <= 0) return;
                          const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
                          const unitScale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? Math.max(1, node.clientWidth) : 1;
                          const nextLeft = Math.max(0, Math.min(maxLeft, node.scrollLeft + dominantDelta * unitScale));
                          if (Math.abs(nextLeft - node.scrollLeft) < 0.5) return;
                          event.preventDefault();
                          event.stopPropagation();
                          node.scrollLeft = nextLeft;
                        }}
                      >
                        <div className="flex min-w-max gap-2">
                          {bucket.items.map((item) => (
                            <button
                              key={`queue-manager-output-${item.id}`}
                              type="button"
                              onDoubleClick={() => openQueueManagerOutputInViewer(item)}
                              onPointerDownCapture={(event) => {
                                if (event.button !== 2) return;
                                openOutputContextMenu(event, item);
                              }}
                              onContextMenu={(event) => openOutputContextMenu(event, item)}
                              className="group overflow-hidden rounded-lg border border-white/10 bg-black/40 text-left transition-colors hover:border-cyan-300/35"
                              style={{ width: '112px', minWidth: '112px' }}
                              title={item.path}
                            >
                              <div className="relative aspect-square overflow-hidden bg-black/60">
                                <img
                                  src={item.type === 'gif' ? item.imageUrl : item.thumbnailUrl}
                                  alt={item.name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(event) => {
                                    event.currentTarget.src = item.imageUrl || buildFsImageUrl(item.path);
                                  }}
                                />
                                <span className="absolute right-1 top-1 rounded bg-black/70 border border-white/15 px-1 py-0.5 text-[9px] uppercase tracking-wider text-zinc-200">
                                  {item.type}
                                </span>
                              </div>
                              <div className="px-2 py-1.5">
                                <div className="truncate text-[10px] font-semibold text-zinc-200 group-hover:text-cyan-100">{item.name}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      {queueOutputMenu ? (
        <Portal>
        <div
          ref={outputMenuRef}
          className="fixed z-[10000] w-[min(300px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-white/15 bg-[#050508] shadow-2xl shadow-black/70"
          style={outputMenuStyle}
          onMouseDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-3 py-2 border-b border-white/10">
            <div className="text-[11px] font-bold text-zinc-200 truncate">{queueOutputMenu.item.name}</div>
            <div className="text-[10px] text-zinc-500 truncate">{queueOutputMenu.item.path}</div>
          </div>
          <div className="px-2 py-2 space-y-1">
            <button
              onClick={() => {
                openQueueManagerOutputInLibrary(queueOutputMenu.item);
                setQueueOutputMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-200 hover:bg-white/10"
            >
              Open in Gallery
            </button>
            <button
              onClick={() => {
                pinQueueManagerOutputFolder(queueOutputMenu.item);
                setQueueOutputMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-amber-200 hover:bg-amber-500/15"
            >
              Pin Folder (Gallery + Filmstrip)
            </button>
            {!isUmbraRemoteClient() ? (
              <button
                onClick={() => {
                  void openQueueManagerOutputInExplorer(queueOutputMenu.item);
                  setQueueOutputMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-300 hover:bg-white/10"
              >
                Reveal Folder in Explorer
              </button>
            ) : null}
            <button
              onClick={() => {
                void sendQueueManagerOutputToTrash(queueOutputMenu.item);
                setQueueOutputMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-red-300 hover:bg-red-500/15"
            >
              Send to Trash
            </button>
            <button
              onClick={() => {
                sendQueueManagerOutputToWorkspace(queueOutputMenu.item, 'waifudiffusion');
                setQueueOutputMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-fuchsia-200 hover:bg-fuchsia-500/15"
            >
              Send to Waifu Diffusion
            </button>
            <button
              onClick={() => {
                sendQueueManagerOutputToWorkspace(queueOutputMenu.item, 'scanner');
                setQueueOutputMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-cyan-200 hover:bg-cyan-500/15"
            >
              Send to Metadata Scanner
            </button>
          </div>
        </div>
        </Portal>
      ) : null}

    </>
  );
}
