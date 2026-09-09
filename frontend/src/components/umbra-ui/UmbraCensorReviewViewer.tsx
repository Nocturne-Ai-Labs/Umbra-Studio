import React from 'react';
import { Brush, Eraser, Hand, Scan, Square, ZoomIn, ZoomOut, Eye, Columns2 } from 'lucide-react';
import {
  censorReviewApi,
  censorReviewId,
  type CensorReviewItem,
  type CensorReviewRect,
  type CensorReviewStroke,
} from '@/lib/umbraCensorReview';
import { useNsfwPrivacy, NsfwPrivacyShield } from '@/components/privacy/NsfwPrivacyProvider';

export const censorButton =
  'inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded border border-white/15 px-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed';
type Tool = 'pan' | 'rectangle' | 'brush' | 'eraser';
type Point = [number, number];
interface MaskGesture {
  pointerId: number;
  start: Point;
  client: Point;
  pan: { x: number; y: number };
  rect?: CensorReviewRect;
  nextRect?: CensorReviewRect;
  resize?: boolean;
  stroke?: CensorReviewStroke;
}
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const uuid = censorReviewId;
export function CensorIconButton({
  title,
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string; active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`${censorButton} ${active ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-100' : ''} ${props.className || ''}`}
    >
      {children}
    </button>
  );
}
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Mask image could not load.'));
    image.src = url;
  });
}
export function UmbraCensorReviewViewer({
  projectId,
  item,
  disabled,
  onEdit,
  selectedRect,
  onSelectRect,
  onDrawing,
}: {
  projectId: string;
  item: CensorReviewItem;
  disabled: boolean;
  onEdit: (edits: { rectangles?: CensorReviewRect[]; strokes?: CensorReviewStroke[] }) => void;
  selectedRect: string;
  onSelectRect: (id: string) => void;
  onDrawing: (active: boolean) => void;
}) {
  const privacy = useNsfwPrivacy();
  const hidden = item.protectedMedia && privacy.locked;
  const blurred = item.protectedMedia && privacy.mode === 'blur';
  const [tool, setTool] = React.useState<Tool>('pan');
  const [compare, setCompare] = React.useState(true);
  const [split, setSplit] = React.useState(50);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [radius, setRadius] = React.useState(0.025);
  const [showMask, setShowMask] = React.useState(true);
  const [size, setSize] = React.useState({ width: 600, height: 500 });
  const [draftRect, setDraftRect] = React.useState<CensorReviewRect | null>(null);
  const [draftStroke, setDraftStroke] = React.useState<CensorReviewStroke | null>(null);
  const [maskError, setMaskError] = React.useState('');
  const viewport = React.useRef<HTMLDivElement>(null),
    stage = React.useRef<HTMLDivElement>(null),
    canvas = React.useRef<HTMLCanvasElement>(null);
  const drag = React.useRef<MaskGesture | null>(null);
  const imageCache = React.useRef(new Map<string, Promise<HTMLImageElement>>());
  React.useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDraftRect(null);
    setDraftStroke(null);
    imageCache.current.clear();
  }, [item.id]);
  React.useEffect(() => {
    if (item.previewFile) {
      setTool('pan');
      setCompare(true);
    }
  }, [item.previewFile]);
  React.useEffect(() => {
    if (!selectedRect) return;
    setShowMask(true);
    setCompare(false);
    if (item.rectangles.some((r) => r.id === selectedRect)) setTool('rectangle');
  }, [selectedRect]);
  const scale = Math.min(
    Math.max(1, size.width - 24) / item.width,
    Math.max(1, size.height - 24) / item.height,
  );
  const width = item.width * scale,
    height = item.height * scale;
  const editing = tool !== 'pan';
  const asset = (file: string) => censorReviewApi.asset(projectId, item.id, file);
  React.useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const target = canvas.current;
      if (!target || hidden || blurred || !showMask || (!editing && compare)) return;
      const ratio = Math.min(1, 1024 / Math.max(item.width, item.height));
      const w = Math.max(1, Math.round(item.width * ratio)),
        h = Math.max(1, Math.round(item.height * ratio));
      const mask = document.createElement('canvas');
      mask.width = w;
      mask.height = h;
      const context = mask.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.fillStyle = '#000';
      context.fillRect(0, 0, w, h);
      context.fillStyle = '#fff';
      if (item.settings.autoDetect)
        for (const region of item.regions) {
          if (
            !region.enabled ||
            region.score < item.settings.cutoff ||
            !item.settings.targets.includes(region.target)
          )
            continue;
          if (region.maskFile) {
            const url = censorReviewApi.asset(projectId, item.id, region.maskFile);
            let pending = imageCache.current.get(url);
            if (!pending) {
              pending = loadImage(url);
              imageCache.current.set(url, pending);
            }
            const image = await pending;
            if (cancelled) return;
            context.globalCompositeOperation = 'lighten';
            context.drawImage(image, region.x * w, region.y * h, region.width * w, region.height * h);
            context.globalCompositeOperation = 'source-over';
          } else context.fillRect(region.x * w, region.y * h, region.width * w, region.height * h);
        }
      for (const rect of [
        ...item.rectangles.filter((r) => r.enabled && r.id !== draftRect?.id),
        ...(draftRect ? [draftRect] : []),
      ])
        context.fillRect(rect.x * w, rect.y * h, rect.width * w, rect.height * h);
      context.lineJoin = 'round';
      context.lineCap = 'round';
      for (const stroke of [...item.strokes, ...(draftStroke ? [draftStroke] : [])]) {
        context.fillStyle = context.strokeStyle = stroke.erase ? '#000' : '#fff';
        const r = stroke.radius * Math.min(w, h);
        context.lineWidth = r * 2;
        context.beginPath();
        if (stroke.points.length === 1) {
          context.arc(stroke.points[0][0] * w, stroke.points[0][1] * h, r, 0, Math.PI * 2);
          context.fill();
        } else {
          context.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * h);
          for (const [x, y] of stroke.points.slice(1)) context.lineTo(x * w, y * h);
          context.stroke();
        }
      }
      if (cancelled) return;
      const pixels = context.getImageData(0, 0, w, h);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const a = pixels.data[i];
        pixels.data[i] = 255;
        pixels.data[i + 1] = 68;
        pixels.data[i + 2] = 102;
        pixels.data[i + 3] = Math.round(a * 0.5);
      }
      target.width = w;
      target.height = h;
      target.getContext('2d')?.putImageData(pixels, 0, 0);
      setMaskError('');
    };
    void draw().catch((error) => {
      if (!cancelled) setMaskError(error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [
    item.id,
    item.width,
    item.height,
    item.settings,
    item.regions,
    item.rectangles,
    item.strokes,
    projectId,
    draftRect,
    draftStroke,
    hidden,
    blurred,
    showMask,
    editing,
    compare,
  ]);
  const point = (event: React.PointerEvent): Point => {
    const bounds = stage.current!.getBoundingClientRect();
    return [
      clamp((event.clientX - bounds.left) / bounds.width),
      clamp((event.clientY - bounds.top) / bounds.height),
    ];
  };
  const start = (event: React.PointerEvent) => {
    if (disabled || hidden || blurred || event.button !== 0 || drag.current) return;
    onDrawing(true);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    const current: MaskGesture = { pointerId: event.pointerId, start: p, client: [event.clientX, event.clientY], pan };
    if (tool === 'rectangle') {
      const rect = [...item.rectangles]
        .reverse()
        .find(
          (r) => r.enabled && p[0] >= r.x && p[0] <= r.x + r.width && p[1] >= r.y && p[1] <= r.y + r.height,
        );
      if (rect) {
        current.rect = rect;
        current.resize =
          Math.abs((p[0] - rect.x - rect.width) * width * zoom) < 18 &&
          Math.abs((p[1] - rect.y - rect.height) * height * zoom) < 18;
        onSelectRect(rect.id);
      } else {
        current.rect = { id: uuid(), x: p[0], y: p[1], width: 0, height: 0, enabled: true };
        onSelectRect(current.rect.id);
      }
      setDraftRect(current.rect);
      current.nextRect = current.rect;
    }
    if (tool === 'brush' || tool === 'eraser') {
      current.stroke = { id: uuid(), erase: tool === 'eraser', radius, points: [p] };
      setDraftStroke(current.stroke);
    }
    drag.current = current;
  };
  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (tool === 'pan') {
      setPan({ x: d.pan.x + event.clientX - d.client[0], y: d.pan.y + event.clientY - d.client[1] });
      return;
    }
    const p = point(event);
    if (d.stroke) {
      const last = d.stroke.points[d.stroke.points.length - 1];
      if (Math.hypot((last[0] - p[0]) * width * zoom, (last[1] - p[1]) * height * zoom) < 2) return;
      d.stroke = { ...d.stroke, points: [...d.stroke.points, p] };
      setDraftStroke(d.stroke);
    }
    if (d.rect) {
      const r = d.rect,
        existing = item.rectangles.some((v) => v.id === r.id);
      const update = (value: CensorReviewRect) => { d.nextRect = value; setDraftRect(value); };
      if (!existing)
        update({
          ...r,
          x: Math.min(d.start[0], p[0]),
          y: Math.min(d.start[1], p[1]),
          width: Math.abs(d.start[0] - p[0]),
          height: Math.abs(d.start[1] - p[1]),
        });
      else if (d.resize)
        update({
          ...r,
          width: clamp(p[0] - r.x, 0.001, 1 - r.x),
          height: clamp(p[1] - r.y, 0.001, 1 - r.y),
        });
      else
        update({
          ...r,
          x: clamp(r.x + p[0] - d.start[0], 0, 1 - r.width),
          y: clamp(r.y + p[1] - d.start[1], 0, 1 - r.height),
        });
    }
  };
  const finish = (event: React.PointerEvent) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    onDrawing(false);
    const draftRect = drag.current.nextRect;
    if (drag.current.stroke) onEdit({ strokes: [...item.strokes, drag.current.stroke] });
    if (draftRect && draftRect.width * width >= 2 && draftRect.height * height >= 2)
      onEdit({ rectangles: [...item.rectangles.filter((r) => r.id !== draftRect.id), draftRect] });
    drag.current = null;
    setDraftRect(null);
    setDraftStroke(null);
  };
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Censor comparison and mask editor">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 p-2">
        {(
          [
            ['pan', Hand, 'Pan image'],
            ['rectangle', Square, 'Draw, move or resize rectangle'],
            ['brush', Brush, 'Paint censor mask'],
            ['eraser', Eraser, 'Erase censor mask'],
          ] as const
        ).map(([value, Icon, label]) => (
          <CensorIconButton
            key={value}
            title={label}
            active={tool === value}
            disabled={disabled}
            onClick={() => setTool(value)}
          >
            <Icon size={16} />
          </CensorIconButton>
        ))}
        <span className="mx-1 h-5 border-l border-white/15" />
        <CensorIconButton
          title="Before and after comparison"
          active={compare}
          onClick={() => {
            setCompare(!compare);
            setTool('pan');
          }}
        >
          <Columns2 size={16} />
        </CensorIconButton>
        <CensorIconButton
          title="Show editable mask"
          active={showMask}
          onClick={() => {
            setShowMask(!showMask);
            setCompare(false);
          }}
        >
          <Eye size={16} />
        </CensorIconButton>
        <CensorIconButton title="Zoom out" onClick={() => setZoom((v) => clamp(v / 1.25, 1, 12))}>
          <ZoomOut size={16} />
        </CensorIconButton>
        <CensorIconButton title="Zoom in" onClick={() => setZoom((v) => clamp(v * 1.25, 1, 12))}>
          <ZoomIn size={16} />
        </CensorIconButton>
        <CensorIconButton
          title="Fit image"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <Scan size={16} />
        </CensorIconButton>
        {(tool === 'brush' || tool === 'eraser') && (
          <label className="flex min-w-0 items-center gap-2 text-xs">
            Brush{' '}
            <input
              aria-label="Brush diameter"
              type="range"
              min={0.002}
              max={0.15}
              step={0.001}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-24"
            />
            <span>{Math.round(radius * Math.min(item.width, item.height) * 2)}px</span>
          </label>
        )}
      </div>
      <div
        ref={viewport}
        className="relative min-h-0 flex-1 overflow-hidden bg-black/50"
        style={{ touchAction: 'none' }}
      >
        {!hidden && (
          <div
            ref={stage}
            className="absolute"
            style={{
              width,
              height,
              left: (size.width - width) / 2 + pan.x,
              top: (size.height - height) / 2 + pan.y,
              transform: `scale(${zoom})`,
              filter: blurred ? 'blur(24px)' : undefined,
            }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={(event) => {
              if (drag.current?.pointerId !== event.pointerId) return;
              onDrawing(false);
              drag.current = null;
              setDraftRect(null);
              setDraftStroke(null);
            }}
          >
            <img
              src={asset(item.sourceFile)}
              alt="Original"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            {compare && !editing && item.previewFile && (
              <img
                src={asset(item.previewFile)}
                alt="Censored preview"
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ clipPath: `inset(0 0 0 ${split}%)` }}
              />
            )}
            {(!compare || editing) && showMask && (
              <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
            )}
            {(!compare || editing) &&
              showMask &&
              item.settings.autoDetect &&
              item.regions
                .filter((r) => r.id === selectedRect)
                .map((region) => (
                  <div
                    key={region.id}
                    className="pointer-events-none absolute border-2 border-yellow-300"
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.width * 100}%`,
                      height: `${region.height * 100}%`,
                    }}
                  >
                    <span className="absolute bottom-full bg-black/80 px-1 text-xs text-yellow-100">
                      {Math.round(region.score * 100)}%
                    </span>
                  </div>
                ))}
            {editing &&
              item.rectangles
                .filter((r) => r.enabled && r.id !== draftRect?.id)
                .concat(draftRect ? [draftRect] : [])
                .map((rect) => (
                  <div
                    key={rect.id}
                    className={`pointer-events-none absolute border ${selectedRect === rect.id ? 'border-yellow-300' : 'border-white'}`}
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`,
                    }}
                  >
                    <span className="absolute -bottom-1 -right-1 h-2 w-2 bg-yellow-300" />
                  </div>
                ))}
            {compare && !editing && item.previewFile && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 border-l border-white"
                style={{ left: `${split}%` }}
              />
            )}
          </div>
        )}
        <NsfwPrivacyShield protectedMedia={item.protectedMedia} />
        {!editing && compare && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between text-xs">
            <span className="bg-black/75 px-2 py-1">Original</span>
            <span className="bg-black/75 px-2 py-1">{item.previewFile ? 'Preview' : 'Not rendered'}</span>
          </div>
        )}
        {maskError && (
          <div role="alert" className="absolute bottom-2 left-2 bg-black p-2 text-xs text-red-300">
            {maskError}
          </div>
        )}
      </div>
      {compare && !editing && (
        <label className="flex items-center gap-3 border-t border-white/10 px-3 py-2 text-xs">
          <span>Before</span>
          <input
            aria-label="Before and after split"
            type="range"
            min={0}
            max={100}
            value={100 - split}
            onChange={(e) => setSplit(100 - Number(e.target.value))}
            aria-valuetext={`${100 - split}% after`}
            className="min-w-0 flex-1"
          />
          <span>After</span>
        </label>
      )}
    </section>
  );
}
