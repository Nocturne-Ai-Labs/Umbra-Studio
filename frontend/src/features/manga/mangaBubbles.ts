import type { MangaLayer } from './mangaModel';

interface Point { x: number; y: number; corner?: boolean }
export const mangaBalloonStyle = (layer: MangaLayer) => layer.balloon || {
  strokeWidth: 3, padding: .16, tailWidth: Math.min(layer.width, layer.height) * .13,
  irregularity: .35, outlineGap: 9, spikeStrength: .45, edgeWobble: .55,
};
export const mangaSpikeCount = (layer: MangaLayer) => layer.balloon?.spikeCount ?? (layer.shape === 'telepathy' ? 7 : layer.textType === 'angry' ? 14 : 24);
const pointText = (point: Point) => `${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function contour(layer: MangaLayer, inset = 0): Point[] {
  const { irregularity, spikeStrength } = mangaBalloonStyle(layer);
  const width = Math.max(1, layer.width - inset * 2), height = Math.max(1, layer.height - inset * 2);
  if (layer.shape === 'joined') {
    // Union of two overlapping lobes, with an open neck between dialogue beats.
    const edge = (y: number) => Math.max(...[height * .28, height * .72].map(center =>
      width * .48 * Math.sqrt(Math.max(0, 1 - ((y - center) / (height * .28)) ** 2))));
    return [...Array.from({ length: 33 }, (_, i) => { const y = height * i / 32; return { x: inset + width / 2 + edge(y), y: inset + y }; }),
      ...Array.from({ length: 31 }, (_, i) => { const y = height * (31 - i) / 32; return { x: inset + width / 2 - edge(y), y: inset + y }; })];
  }
  const spikes = mangaSpikeCount(layer);
  const count = layer.shape === 'rough' ? 12 : layer.shape === 'spiky' && spikes >= 3 ? spikes * 2 : 64;
  return Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count;
    let radius = .97;
    if (layer.shape === 'rough') radius = .89 + irregularity * (.045 * Math.sin(i * 2.3) + .035 * Math.cos(i * 1.7));
    else if (layer.shape === 'spiky' && spikes >= 3) radius = i % 2 ? 1 - (.1 + spikeStrength * .3) : 1;
    else if (layer.shape === 'spiky' && spikes > 0) { const phase = i * spikes / count % 1; radius = phase < .12 || phase > .88 ? 1 : 1 - (.1 + spikeStrength * .3); }
    else if (layer.shape === 'thought') radius = .94 + .06 * Math.cos(angle * 12);
    else if (layer.shape === 'manga' || layer.shape === 'telepathy') radius += irregularity * (.035 * Math.sin(angle * 3 + .6) + .018 * Math.cos(angle * 5));
    return { x: inset + width / 2 + Math.cos(angle) * width / 2 * radius, y: inset + height / 2 + Math.sin(angle) * height / 2 * radius };
  });
}

function handDrawnContour(layer: MangaLayer, points: Point[], angular: boolean): Point[] {
  const strength = layer.balloon?.edgeWobble ?? .55;
  if (!strength) return points;
  const lengths = points.map((point, i) => Math.hypot(point.x - points[(i + 1) % points.length].x, point.y - points[(i + 1) % points.length].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const waves = Math.max(5, Math.round(total / 65)), amplitude = strength * (1.5 + Math.min(layer.width, layer.height, 700) * .012);
  let distance = 0;
  return points.flatMap((a, i) => {
    const b = points[(i + 1) % points.length], length = lengths[i], count = Math.max(1, Math.ceil(length / 10));
    const result = Array.from({length:count}, (_, step) => {
      const t = step / count, point = mix(a,b,t), phase = (distance + length * t) / total * Math.PI * 2;
      const wobble = amplitude * (.6 * Math.sin(phase * waves + .7) + .25 * Math.sin(phase * (waves + 3) + 1.8) + .15 * Math.sin(phase * (waves - 2) + .1));
      return {x:point.x - (b.y - a.y) / (length || 1) * wobble, y:point.y + (b.x - a.x) / (length || 1) * wobble, corner:angular && step === 0};
    });
    distance += length; return result;
  });
}

function curve(points: Point[], closed: boolean, angular: boolean): string {
  let path = `M ${pointText(points[0])}`;
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (angular) { path += ` L ${pointText(b)}`; continue; }
    const previous = points[i - 1] || (closed ? points[points.length - 1] : a);
    const next = points[i + 2] || (closed ? points[(i + 2) % points.length] : b);
    const first = a.corner ? a : { x: a.x + (b.x - previous.x) / 6, y: a.y + (b.y - previous.y) / 6 };
    const second = b.corner ? b : { x: b.x - (next.x - a.x) / 6, y: b.y - (next.y - a.y) / 6 };
    path += ` C ${pointText(first)} ${pointText(second)} ${pointText(b)}`;
  }
  return path;
}

function isOutside(point: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return !inside;
}

export function mangaBalloonPath(layer: MangaLayer, inset = 0, includeTail = true): string {
  const corners = layer.shape === 'rough' || layer.shape === 'spiky';
  const angular = corners && (layer.balloon?.edgeWobble ?? .55) === 0;
  let points = contour(layer, inset);
  if (layer.shape === 'square') {
    const x = inset, y = inset, w = Math.max(1, layer.width - 2 * inset), h = Math.max(1, layer.height - 2 * inset), r = Math.min(12, w / 4, h / 4);
    points = [{ x: x + r, y }, { x: x + w - r, y }, { x: x + w, y: y + r }, { x: x + w, y: y + h - r }, { x: x + w - r, y: y + h }, { x: x + r, y: y + h }, { x, y: y + h - r }, { x, y: y + r }];
  }
  points = handDrawnContour(layer,points,corners);
  const tip = { x: layer.tailX, y: layer.tailY };
  if (!includeTail || !layer.tail || layer.shape === 'thought' || !isOutside(tip, points)) return curve(points, true, angular) + ' Z';
  // Replace a short arc of the perimeter with the tail. There is no seam or
  // overlapping triangle, and the attachment follows the speaker on every side.
  let nearest = 0;
  for (let i = 1; i < points.length; i++) if (Math.hypot(points[i].x - tip.x, points[i].y - tip.y) < Math.hypot(points[nearest].x - tip.x, points[nearest].y - tip.y)) nearest = i;
  const halfWidth = Math.min(mangaBalloonStyle(layer).tailWidth / 2, Math.min(layer.width, layer.height) * .22);
  const steps = (direction: number) => {
    let distance = 0, count = 0;
    while (count < Math.floor(points.length / 5) && distance < halfWidth) {
      const a = points[(nearest + direction * count + points.length) % points.length];
      const b = points[(nearest + direction * (count + 1) + points.length) % points.length];
      distance += Math.hypot(b.x - a.x, b.y - a.y); count++;
    }
    return Math.max(1, count);
  };
  if (halfWidth <= 0) return curve(points, true, angular) + ' Z';
  const before = steps(-1), after = steps(1);
  const body = Array.from({ length: points.length - before - after + 1 }, (_, i) => points[(nearest + after + i) % points.length]);
  const start = body[0], end = body[body.length - 1], shoulder = mix(start, end, .5);
  const bend = mix(shoulder, tip, .24);
  return curve(body, false, angular) + ` Q ${pointText(mix(end, bend, .5))} ${pointText(tip)} Q ${pointText(mix(start, bend, .5))} ${pointText(start)} Z`;
}

export function mangaTelepathySpikes(layer: MangaLayer): string[] {
  const strength = mangaBalloonStyle(layer).spikeStrength;
  if (!strength) return [];
  const shape = handDrawnContour(layer, contour(layer), false);
  return Array.from({length:mangaSpikeCount(layer)}, (_, i) => {
    const index = Math.floor((i + .5) * shape.length / mangaSpikeCount(layer));
    const span = Math.max(1, Math.floor(shape.length / Math.max(1, mangaSpikeCount(layer)) * .18));
    const a = shape[index], b = shape[(index + span) % shape.length], center = mix(a, b, .5);
    const tip = { x: center.x + (center.x - layer.width / 2) * strength * .15, y: center.y + (center.y - layer.height / 2) * strength * .15 };
    return `M ${pointText(a)} L ${pointText(tip)} L ${pointText(b)}`;
  });
}

export function mangaTextFrames(layer: MangaLayer): MangaLayer[] {
  if (layer.shape !== 'joined' || layer.kind !== 'bubble' || layer.bubbleVisible === false) return [layer];
  const paragraphs = layer.text.split(/\n\s*\n/);
  const split = Math.ceil(paragraphs.length / 2);
  return [paragraphs.slice(0, split).join('\n\n'), paragraphs.slice(split).join('\n\n')].map((text, i) => ({ ...layer, text, y: layer.y + i * layer.height * .5, height: layer.height * .5, shape: 'manga' }));
}
