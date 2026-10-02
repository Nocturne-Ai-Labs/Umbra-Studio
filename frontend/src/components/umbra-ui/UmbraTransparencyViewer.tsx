import React from 'react';
import { Brush, Eraser, Eye, Hand, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { CensorIconButton } from './UmbraCensorReviewViewer';
import { composeTransparencyPixels, renderTransparencyMask, type TransparencyMask, type TransparencyPoint, type TransparencyStroke } from '@/lib/umbraTransparencyMask';

export interface TransparencySource {
  id: string;
  name: string;
  image: HTMLImageElement;
  url: string;
  width: number;
  height: number;
}
type Tool = 'pan' | 'erase' | 'restore';
interface Gesture {
  pointerId: number;
  client: TransparencyPoint;
  pan: TransparencyPoint;
  stroke?: TransparencyStroke;
}
const checkerboard = { backgroundColor: '#18181b', backgroundImage: 'conic-gradient(#3f3f46 25%, transparent 0 50%, #3f3f46 0 75%, transparent 0)', backgroundSize: '20px 20px' };
export function transparencyCanvas(source: TransparencySource, mask: TransparencyMask, preview = false): HTMLCanvasElement {
  const ratio = preview ? Math.min(1, 1600 / Math.max(source.width, source.height)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * ratio));
  canvas.height = Math.max(1, Math.round(source.height * ratio));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The transparency image editor is unavailable in this browser.');
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  pixels.data.set(composeTransparencyPixels(pixels.data, renderTransparencyMask(mask, canvas.width, canvas.height)));
  context.putImageData(pixels, 0, 0);
  return canvas;
}
export function transparencyPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The PNG could not be exported.')), 'image/png'));
}

function TransparencyPane({ source, mask, draft, showMask, after, tool, brush, zoom, pan, disabled, onPan, onDraft, onCommit, onDrawing }: {
  source: TransparencySource; mask: TransparencyMask; draft: TransparencyStroke | null; showMask: boolean; after: boolean;
  tool: Tool; brush: { diameter: number; hardness: number; strength: number }; zoom: number; pan: TransparencyPoint;
  disabled: boolean; onPan: (point: TransparencyPoint) => void; onDraft: (stroke: TransparencyStroke | null) => void;
  onCommit: (stroke: TransparencyStroke) => void; onDrawing: (value: boolean) => void;
}) {
  const viewport = React.useRef<HTMLDivElement>(null), stage = React.useRef<HTMLDivElement>(null), canvas = React.useRef<HTMLCanvasElement>(null);
  const gesture = React.useRef<Gesture | null>(null);
  const [size, setSize] = React.useState({ width: 600, height: 500 });
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    gesture.current = null;
    onDraft(null);
    onDrawing(false);
  }, [source.id, disabled]);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const target = canvas.current;
        if (!target) return;
        const document = draft ? { ...mask, strokes: [...mask.strokes, draft] } : mask;
        const result = transparencyCanvas(source, document, true);
        target.width = result.width;
        target.height = result.height;
        const context = target.getContext('2d');
        if (!context) throw new Error('The transparency preview could not be drawn.');
        if (after) context.drawImage(result, 0, 0);
        else {
          const alpha = renderTransparencyMask(document, result.width, result.height);
          const overlay = context.createImageData(result.width, result.height);
          for (let pixel = 0; pixel < alpha.length; pixel++) {
            overlay.data[pixel * 4] = 255; overlay.data[pixel * 4 + 1] = 68; overlay.data[pixel * 4 + 2] = 102;
            overlay.data[pixel * 4 + 3] = Math.round((255 - alpha[pixel]) * 0.5);
          }
          context.putImageData(overlay, 0, 0);
        }
        setError('');
      } catch (error) { setError(error instanceof Error ? error.message : 'The transparency preview failed.'); }
    });
    return () => cancelAnimationFrame(frame);
  }, [source, mask, draft, after]);
  const scale = Math.min(Math.max(1, size.width - 24) / source.width, Math.max(1, size.height - 24) / source.height);
  const width = source.width * scale, height = source.height * scale;
  const point = (event: React.PointerEvent): TransparencyPoint => {
    const bounds = stage.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))];
  };
  const finish = (event: React.PointerEvent, canceled = false) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!canceled && current.stroke) onCommit(current.stroke);
    onDraft(null); onDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={after ? 'Transparent preview' : 'Original mask editor'}>
    <div className="shrink-0 border-b border-white/10 px-3 py-2 text-xs">{after ? 'After · transparency' : 'Before · editable mask'}</div>
    <div ref={viewport} className="relative min-h-[180px] flex-1 overflow-hidden" style={{ ...checkerboard, touchAction: 'none' }}>
      <div ref={stage} data-transparency-stage={after ? 'after' : 'before'} className={`absolute ${after || tool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
        style={{ width, height, left: (size.width - width) / 2 + pan[0], top: (size.height - height) / 2 + pan[1], transform: `scale(${zoom})`, touchAction: 'none' }}
        onPointerDown={event => {
          if (disabled || gesture.current || event.button !== 0) return;
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          const stroke = !after && tool !== 'pan' ? { mode: tool, radius: brush.diameter / (2 * Math.min(source.width, source.height)), hardness: brush.hardness / 100, strength: brush.strength / 100, points: [point(event)] } : undefined;
          gesture.current = { pointerId: event.pointerId, client: [event.clientX, event.clientY], pan, stroke };
          onDrawing(true); if (stroke) onDraft(stroke);
        }}
        onPointerMove={event => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          if (current.stroke) {
            const next = point(event), previous = current.stroke.points[current.stroke.points.length - 1];
            if (Math.hypot((next[0] - previous[0]) * source.width, (next[1] - previous[1]) * source.height) < 0.5) return;
            current.stroke = { ...current.stroke, points: [...current.stroke.points, next] }; onDraft(current.stroke);
          } else onPan([current.pan[0] + event.clientX - current.client[0], current.pan[1] + event.clientY - current.client[1]]);
        }}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}>
        {!after && <img src={source.url} alt="Original" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />}
        <canvas ref={canvas} aria-label={after ? 'Transparent image preview' : 'Editable transparency mask'} className={`pointer-events-none absolute inset-0 h-full w-full ${!after && !showMask ? 'invisible' : ''}`} />
      </div>
      {error && <p role="alert" className="absolute bottom-2 left-2 bg-black p-2 text-xs text-red-300">{error}</p>}
    </div>
  </div>;
}

export function UmbraTransparencyViewer({ source, mask, disabled, onCommit, onDrawing }: {
  source: TransparencySource; mask: TransparencyMask; disabled: boolean; onCommit: (stroke: TransparencyStroke) => void; onDrawing: (value: boolean) => void;
}) {
  const [tool, setTool] = React.useState<Tool>('erase'), [zoom, setZoom] = React.useState(1), [pan, setPan] = React.useState<TransparencyPoint>([0, 0]);
  const [diameter, setDiameter] = React.useState(48), [hardness, setHardness] = React.useState(80), [strength, setStrength] = React.useState(100);
  const [showMask, setShowMask] = React.useState(true), [draft, setDraft] = React.useState<TransparencyStroke | null>(null);
  React.useEffect(() => { setZoom(1); setPan([0, 0]); setDraft(null); }, [source.id]);
  return <section className="flex min-h-[300px] min-w-0 flex-1 shrink-0 flex-col max-sm:min-h-[620px]" aria-label="Transparency comparison and mask editor">
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/10 p-2">
      {([['pan', Hand, 'Pan image'], ['erase', Eraser, 'Erase pixels'], ['restore', Brush, 'Restore pixels']] as const).map(([value, Icon, title]) => <CensorIconButton key={value} title={title} active={tool === value} disabled={disabled} onClick={() => setTool(value)}><Icon size={16} /></CensorIconButton>)}
      <CensorIconButton title="Show editable mask" active={showMask} onClick={() => setShowMask(value => !value)}><Eye size={16} /></CensorIconButton>
      <CensorIconButton title="Zoom out" onClick={() => setZoom(value => Math.max(1, value / 1.25))}><ZoomOut size={16} /></CensorIconButton>
      <CensorIconButton title="Zoom in" onClick={() => setZoom(value => Math.min(12, value * 1.25))}><ZoomIn size={16} /></CensorIconButton>
      <CensorIconButton title="Fit image" onClick={() => { setZoom(1); setPan([0, 0]); }}><Scan size={16} /></CensorIconButton>
      <span className="px-1 text-xs text-zinc-500">{Math.round(zoom * 100)}%</span>
      {tool !== 'pan' && <>
        <label className="flex items-center gap-2 px-1 text-xs">Size <input aria-label="Brush size" type="range" min={1} max={512} value={diameter} disabled={disabled} onChange={event => setDiameter(Number(event.target.value))} className="w-24" /><span className="w-10 tabular-nums">{diameter}px</span></label>
        <label className="flex items-center gap-2 px-1 text-xs">Hardness <input aria-label="Brush hardness" type="range" min={0} max={100} value={hardness} disabled={disabled} onChange={event => setHardness(Number(event.target.value))} className="w-20" /><span>{hardness}%</span></label>
        <label className="flex items-center gap-2 px-1 text-xs">Strength <input aria-label="Brush strength" type="range" min={1} max={100} value={strength} disabled={disabled} onChange={event => setStrength(Number(event.target.value))} className="w-20" /><span>{strength}%</span></label>
      </>}
    </div>
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 divide-white/15 max-sm:overflow-y-auto sm:grid-cols-2 sm:divide-x">
      {[false, true].map(after => <TransparencyPane key={String(after)} source={source} mask={mask} draft={draft} showMask={showMask} after={after} tool={tool} brush={{ diameter, hardness, strength }} zoom={zoom} pan={pan} disabled={disabled} onPan={setPan} onDraft={setDraft} onCommit={onCommit} onDrawing={onDrawing} />)}
    </div>
  </section>;
}
