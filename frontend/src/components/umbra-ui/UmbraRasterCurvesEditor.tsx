'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  defaultCanvasCurves,
  normalizeCanvasCurves,
  type UmbraCanvasCurveChannel,
  type UmbraCanvasCurvePoint,
  type UmbraCanvasCurves,
} from '@/lib/umbraUiCanvasDocument';
import { cn } from '@/lib/utils';

interface UmbraRasterCurvesEditorProps {
  curves: UmbraCanvasCurves;
  disabled?: boolean;
  imageUrl?: string;
  onChange: (curves: UmbraCanvasCurves) => void;
}

type Histograms = Record<UmbraCanvasCurveChannel, number[]>;

const CHANNELS: Array<{ id: UmbraCanvasCurveChannel; label: string; color: string }> = [
  { id: 'master', label: 'RGB', color: '#e4e4e7' },
  { id: 'r', label: 'R', color: '#fb7185' },
  { id: 'g', label: 'G', color: '#4ade80' },
  { id: 'b', label: 'B', color: '#60a5fa' },
];

function emptyHistograms(): Histograms {
  return { master: Array(256).fill(0), r: Array(256).fill(0), g: Array(256).fill(0), b: Array(256).fill(0) };
}

function findPointIndex(points: UmbraCanvasCurvePoint[], x: number, y: number, radius = 14): number {
  let closest = -1;
  let distance = radius;
  points.forEach((point, index) => {
    const pointDistance = Math.hypot(point[0] - x, point[1] - y);
    if (pointDistance <= distance) {
      closest = index;
      distance = pointDistance;
    }
  });
  return closest;
}

export function UmbraRasterCurvesEditor({ curves, disabled = false, imageUrl, onChange }: UmbraRasterCurvesEditorProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const draggingIndexRef = React.useRef<number | null>(null);
  const [channel, setChannel] = React.useState<UmbraCanvasCurveChannel>('master');
  const [draft, setDraft] = React.useState(() => normalizeCanvasCurves(curves));
  const [histograms, setHistograms] = React.useState<Histograms>(() => emptyHistograms());

  React.useEffect(() => {
    if (draggingIndexRef.current === null) setDraft(normalizeCanvasCurves(curves));
  }, [curves]);

  React.useEffect(() => {
    let disposed = false;
    if (!imageUrl) {
      setHistograms(emptyHistograms());
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      const sample = document.createElement('canvas');
      const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
      sample.width = Math.max(1, Math.round(image.naturalWidth * scale));
      sample.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = sample.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      const next = emptyHistograms();
      for (let index = 0; index < pixels.length; index += 16) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (pixels[index + 3] <= 0) continue;
        next.r[red] += 1;
        next.g[green] += 1;
        next.b[blue] += 1;
        next.master[Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)] += 1;
      }
      setHistograms(next);
    };
    image.onerror = () => { if (!disposed) setHistograms(emptyHistograms()); };
    image.src = imageUrl;
    return () => { disposed = true; };
  }, [imageUrl]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#08090b';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(255,255,255,0.07)';
    context.lineWidth = 1;
    for (let step = 0; step <= 4; step += 1) {
      const x = Math.round((step / 4) * width) + 0.5;
      const y = Math.round((step / 4) * height) + 0.5;
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
    const histogram = histograms[channel];
    const peak = Math.max(1, ...histogram);
    context.fillStyle = 'rgba(161,161,170,0.16)';
    for (let index = 0; index < 256; index += 1) {
      const barHeight = Math.log1p(histogram[index]) / Math.log1p(peak) * height * 0.72;
      const x = index / 255 * width;
      context.fillRect(x, height - barHeight, Math.max(1, width / 256), barHeight);
    }
    const points = draft[channel];
    const color = CHANNELS.find((entry) => entry.id === channel)?.color || '#e4e4e7';
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    points.forEach((point, index) => {
      const x = point[0] / 255 * width;
      const y = height - point[1] / 255 * height;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    points.forEach((point) => {
      context.beginPath();
      context.fillStyle = '#08090b';
      context.strokeStyle = color;
      context.arc(point[0] / 255 * width, height - point[1] / 255 * height, 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
  }, [channel, draft, histograms]);

  const pointFromEvent = React.useCallback((event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(255, Math.round((event.clientX - rect.left) / Math.max(1, rect.width) * 255))),
      Math.max(0, Math.min(255, Math.round((1 - (event.clientY - rect.top) / Math.max(1, rect.height)) * 255))),
    ] as UmbraCanvasCurvePoint;
  }, []);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const point = pointFromEvent(event);
    const points = draft[channel].slice();
    let index = findPointIndex(points, point[0], point[1]);
    if (index < 0) {
      points.push(point);
      points.sort((left, right) => left[0] - right[0]);
      index = points.findIndex((candidate) => candidate === point);
      setDraft((current) => ({ ...current, [channel]: points }));
    }
    draggingIndexRef.current = index;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [channel, disabled, draft, pointFromEvent]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const index = draggingIndexRef.current;
    if (disabled || index === null) return;
    const point = pointFromEvent(event);
    setDraft((current) => {
      const points = current[channel].slice();
      const previous = points[index - 1];
      const next = points[index + 1];
      const x = index === 0 ? 0 : index === points.length - 1 ? 255 : Math.max((previous?.[0] ?? 0) + 1, Math.min((next?.[0] ?? 255) - 1, point[0]));
      points[index] = [x, point[1]];
      return { ...current, [channel]: points };
    });
  }, [channel, disabled, pointFromEvent]);

  const commitDrag = React.useCallback(() => {
    if (draggingIndexRef.current === null) return;
    draggingIndexRef.current = null;
    onChange(normalizeCanvasCurves(draft));
  }, [draft, onChange]);

  const removePoint = React.useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const index = findPointIndex(draft[channel], point[0], point[1]);
    if (index <= 0 || index >= draft[channel].length - 1) return;
    const next = { ...draft, [channel]: draft[channel].filter((_, pointIndex) => pointIndex !== index) };
    setDraft(next);
    onChange(normalizeCanvasCurves(next));
  }, [channel, disabled, draft, onChange, pointFromEvent]);

  const resetChannel = React.useCallback(() => {
    const next = { ...draft, [channel]: defaultCanvasCurves()[channel] };
    setDraft(next);
    onChange(next);
  }, [channel, draft, onChange]);

  return (
    <div className={cn('flex h-[126px] w-[310px] shrink-0 gap-1.5', disabled && 'opacity-30')}>
      <div className="flex w-8 shrink-0 flex-col gap-1">
        {CHANNELS.map((entry) => (
          <button key={entry.id} type="button" onClick={() => setChannel(entry.id)} disabled={disabled} className={cn('h-6 border font-mono text-[7px] font-black', channel === entry.id ? 'border-white/20 bg-white/[0.07]' : 'border-white/[0.07] text-zinc-600')} style={{ color: channel === entry.id ? entry.color : undefined }}>{entry.label}</button>
        ))}
        <button type="button" onClick={resetChannel} disabled={disabled} title="Reset selected curve" className="inline-flex h-6 items-center justify-center border border-white/[0.07] text-zinc-600"><RotateCcw size={9} /></button>
      </div>
      <canvas
        ref={canvasRef}
        width={270}
        height={126}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commitDrag}
        onPointerCancel={commitDrag}
        onDoubleClick={removePoint}
        onContextMenu={removePoint}
        className="h-[126px] w-[270px] touch-none border border-white/10"
        title="Click to add, drag to adjust, and right-click or double-click to remove a point"
      />
    </div>
  );
}
