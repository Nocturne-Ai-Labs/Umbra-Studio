import React from 'react';
import { Hand, ImageMinus, ImagePlus, PanelRight, Scan, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { CensorIconButton, censorButton } from './UmbraCensorReviewViewer';

export interface InspectorMedia {
  id: string;
  name: string;
  blobUrl: string;
  previewUrl?: string;
  isVideo: boolean;
  status?: string;
}
const inspectorStyles = `
[data-umbra-inspector-frame] { container-type: inline-size; --umbra-border: color-mix(in srgb, var(--umbra-text) 12%, transparent); }
[data-umbra-inspector-frame] .inspector-body { display: grid; grid-template-columns: minmax(0,1fr) minmax(300px,420px); flex: 1 0 340px; height: 0; min-height: 340px; }
[data-umbra-inspector-frame] .inspector-body.without-details { grid-template-columns: minmax(0,1fr); }
[data-umbra-inspector-frame] .inspector-preview { min-height: 260px; }
[data-umbra-inspector-frame] .inspector-details { min-width: 0; min-height: 0; overflow: auto; border-left: 1px solid var(--umbra-border); }
[data-umbra-inspector-frame] button:focus-visible { outline: 2px solid var(--umbra-accent); outline-offset: -2px; }
[data-umbra-inspector-frame] input[type="checkbox"] { color-scheme: dark; accent-color: var(--umbra-accent); }
@container (max-width: 800px) {
  [data-umbra-inspector-frame] .inspector-body { grid-template-columns: minmax(0,1fr); flex-basis: auto; height: auto; }
  [data-umbra-inspector-frame] .inspector-details { border-left: 0; border-top: 1px solid var(--umbra-border); max-height: none; overflow: visible; }
}
`;

function InspectorPreview({ item }: { item: InspectorMedia }) {
  const [zoom, setZoom] = React.useState(1), [pan, setPan] = React.useState({ x: 0, y: 0 }), [error, setError] = React.useState('');
  const stage = React.useRef<HTMLDivElement>(null);
  const [mediaHeight, setMediaHeight] = React.useState(220);
  React.useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const update = () => setMediaHeight(Math.max(1, Math.min(550, element.clientHeight - 24)));
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const drag = React.useRef<{ id: number; x: number; y: number; pan: typeof pan } | null>(null);
  const finish = (event: React.PointerEvent) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section className="inspector-preview flex min-w-0 flex-col overflow-hidden" aria-label="Selected media preview">
    <div className="flex shrink-0 items-center gap-1 border-b border-white/10 p-2 umbra-surface-soft">
      <span className="mr-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400"><Hand size={13} />Preview</span>
      <CensorIconButton title="Zoom out" disabled={item.isVideo} onClick={() => setZoom(value => Math.max(1, value / 1.25))}><ZoomOut size={15} /></CensorIconButton>
      <CensorIconButton title="Zoom in" disabled={item.isVideo} onClick={() => setZoom(value => Math.min(12, value * 1.25))}><ZoomIn size={15} /></CensorIconButton>
      <CensorIconButton title="Fit image" disabled={item.isVideo} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Scan size={15} /></CensorIconButton>
      <span className="w-9 text-right font-mono text-[10px] text-zinc-500">{Math.round(zoom * 100)}%</span>
    </div>
    <div ref={stage} data-umbra-inspector-preview="" className="relative flex min-h-[220px] flex-1 items-center justify-center overflow-hidden bg-black/30 p-3">
      {item.isVideo ? <video key={item.id} src={item.blobUrl} controls muted preload="metadata" className="w-full object-contain" style={{ maxHeight: mediaHeight }} onError={() => setError('The video preview could not be loaded.')} /> : <img data-i18n-skip="" key={item.id} src={item.blobUrl} alt={item.name} draggable={false} decoding="async" className="max-w-full cursor-grab object-contain" style={{ maxHeight: mediaHeight, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, touchAction: 'none' }}
        onError={() => setError('The image preview could not be loaded.')}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan }; }}
        onPointerMove={event => { const current = drag.current; if (current?.id === event.pointerId) setPan({ x: current.pan.x + event.clientX - current.x, y: current.pan.y + event.clientY - current.y }); }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />}
      {error && <p role="alert" className="absolute bottom-2 left-2 right-2 rounded border border-red-300/20 bg-[var(--umbra-bg)] p-2 text-xs text-red-300">{error}</p>}
    </div>
  </section>;
}

export function UmbraMediaInspectorFrame({ kind, title, remoteMode, items, selectedId, onSelect, onAdd, onRemove, onClear, busy, status, error, actions, details, detailsTitle, input, isDragging, onDragOver, onDragLeave, onDrop }: {
  kind: 'metadata' | 'visual'; title: string; remoteMode: string; items: InspectorMedia[]; selectedId: string | null;
  onSelect: (id: string) => void; onAdd: () => void; onRemove: (id: string) => void; onClear: () => void;
  busy?: boolean; status?: string; error?: string; actions?: React.ReactNode; details: React.ReactNode; detailsTitle: string; input: React.ReactNode;
  isDragging: boolean; onDragOver: React.DragEventHandler; onDragLeave: React.DragEventHandler; onDrop: React.DragEventHandler;
}) {
  const [showDetails, setShowDetails] = React.useState(true);
  const selected = items.find(item => item.id === selectedId);
  return <div data-umbra-image-inspector={kind} data-umbra-inspector-frame="" data-umbra-image-inspector-remote-mode={remoteMode} className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--umbra-bg)] text-[var(--umbra-text)]" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
    <style>{inspectorStyles}</style>{input}
    <header data-umbra-inspector-toolbar="" className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[var(--umbra-bg)] p-3">
      <h2 className="mr-auto min-w-0 text-sm font-bold max-sm:w-full">{title}</h2>
      <button type="button" className={censorButton} disabled={busy} onClick={onAdd}><ImagePlus size={16} />Add media</button>
      <CensorIconButton title="Remove selected media" disabled={!selected} onClick={() => selected && onRemove(selected.id)}><ImageMinus size={16} /></CensorIconButton>
      <CensorIconButton title="Clear imported media" disabled={!items.length && !busy} onClick={onClear}><Trash2 size={16} /></CensorIconButton>
      {actions}
      <CensorIconButton title={showDetails ? 'Hide inspector panel' : 'Show inspector panel'} active={showDetails} onClick={() => setShowDetails(value => !value)}><PanelRight size={16} /></CensorIconButton>
    </header>
    <div role="status" className="flex min-h-8 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-1 text-xs text-zinc-500"><span className="min-w-0 break-all">{status || selected?.name || 'Add media to begin'}</span><span className="ml-auto shrink-0">{items.length} media</span></div>
    {error && <p role="alert" className="shrink-0 break-words border-b border-red-300/20 px-3 py-2 text-xs text-red-300">{error}</p>}
    <div className={`inspector-body ${showDetails ? '' : 'without-details'}`}>
      {selected ? <InspectorPreview key={`${selected.id}:${selected.blobUrl}`} item={selected} /> : <div className="inspector-preview flex min-h-[260px] items-center justify-center p-4 text-center"><button type="button" className={censorButton} disabled={busy} onClick={onAdd}><ImagePlus size={16} />Add media</button></div>}
      {showDetails && <aside data-umbra-inspector-details="" className="inspector-details glass-panel !rounded-none !border-0 !shadow-none">
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[var(--umbra-bg)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">{detailsTitle}</div>
        <div className="min-w-0 p-3">{details}</div>
      </aside>}
    </div>
    <footer className="shrink-0 border-t border-white/10 umbra-surface-soft">
      <div className="flex h-8 items-center px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Imported media</div>
      <div data-umbra-inspector-strip="" className="flex min-h-[96px] gap-2 overflow-x-auto px-2 pb-2">
        {items.map(item => <button type="button" key={item.id} aria-label={`Select media: ${item.name}`} aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)} className={`w-[100px] shrink-0 overflow-hidden rounded border ${item.id === selectedId ? 'border-[var(--umbra-accent)]' : 'border-white/15 hover:border-white/30'}`} title={item.name}>
          {item.isVideo ? <video src={item.blobUrl} muted preload="metadata" className="h-12 w-full object-contain" /> : <img src={item.previewUrl || item.blobUrl} alt="" loading="lazy" decoding="async" className="h-12 w-full object-contain" />}
          <span data-i18n-skip="" className="block truncate px-1 text-[10px]">{item.name}</span><span className="block truncate px-1 text-[10px] text-zinc-500">{item.status || (item.isVideo ? 'Video' : 'Image')}</span>
        </button>)}
      </div>
    </footer>
    {isDragging && <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-[var(--umbra-accent)] bg-[var(--umbra-bg)]/90 text-sm text-[var(--umbra-text)]">Drop media to import</div>}
  </div>;
}
