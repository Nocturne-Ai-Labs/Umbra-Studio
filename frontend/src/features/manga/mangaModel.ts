import {parseMangaAnimation,type MangaAnimation} from './mangaAnimation';
import {parseMangaImageProvenance,type MangaImageProvenance} from './mangaImageProvenance';
import {parseMangaGeneration, type MangaGenerationSettings, type MangaGenerationRequest} from './mangaGeneration';
import { MANGA_TEMPLATES } from './mangaTemplates';
export { MANGA_TEMPLATES, MANGA_TEMPLATE_CATEGORIES } from './mangaTemplates';
import type { UmbraCanvasRect } from '../canvas/canvasModel';
import { mangaBalloonStyle } from './mangaBubbles';

export type MangaBubbleShape = 'manga' | 'rough' | 'telepathy' | 'joined' | 'round' | 'square' | 'spiky' | 'thought';
export const MANGA_BUBBLE_SHAPES: Array<{ value: MangaBubbleShape; label: string }> = [
  { value: 'manga', label: 'Natural balloon' }, { value: 'rough', label: 'Angular balloon' },
  { value: 'telepathy', label: 'Double outline' }, { value: 'joined', label: 'Connected balloons' },
  { value: 'round', label: 'Round' }, { value: 'square', label: 'Square' },
  { value: 'spiky', label: 'Spiky' }, { value: 'thought', label: 'Thought cloud' },
];
export type MangaTextType = 'speech' | 'thought' | 'thought-box' | 'thought-free' | 'off-screen' | 'telepathy' | 'strained' | 'surprised' | 'angry' | 'sound-effect' | 'custom';
export const MANGA_TEXT_TYPES: Array<{ value: MangaTextType; label: string }> = [
  { value: 'speech', label: 'Speech' },
  { value: 'thought', label: 'Thought · cloud bubble' },
  { value: 'thought-box', label: 'Thought · boxed' },
  { value: 'thought-free', label: 'Thought · no box' },
  { value: 'off-screen', label: 'Off-screen dialogue' },
  { value: 'telepathy', label: 'Telepathic conversation' },
  { value: 'strained', label: 'Strained dialogue' },
  { value: 'surprised', label: 'Surprised' },
  { value: 'angry', label: 'Angry' },
  { value: 'sound-effect', label: 'Sound effect' },
  { value: 'custom', label: 'Custom text' },
];
export type MangaBackground = 'white' | 'transparent';
export interface MangaPanel extends UmbraCanvasRect { id: string; points?: number[] }
export interface MangaLettering {
  weight: number;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  wrap: boolean;
  autoFit: boolean;
  color?: string;
  outlineColor?: string;
  outlineWidth: number;
}
export interface MangaLayer extends UmbraCanvasRect {
  id: string;
  kind: 'image' | 'bubble' | 'sfx';
  name: string;
  rotation: number;
  visible: boolean;
  panelId: string | null;
  imageUrl: string;
  provenance?: MangaImageProvenance;
  animation?: MangaAnimation;
  text: string;
  font: string;
  fontSize: number;
  shape: MangaBubbleShape;
  inverted: boolean;
  tail: boolean;
  tailX: number;
  tailY: number;
  cropX: number;
  cropY: number;
  zoom: number;
  lettering?: MangaLettering;
  textType?: MangaTextType;
  bubbleVisible?: boolean;
  locked?: boolean;
  imageMode?: 'background' | 'overlay';
  imageFit?: 'cover' | 'contain';
  opacity?: number;
  placement?: UmbraCanvasRect;
  balloon?: { strokeWidth: number; padding: number; tailWidth: number; irregularity: number; outlineGap: number; spikeStrength: number; edgeWobble?: number; spikeCount?: number };
  textTransform?: { scaleX: number; scaleY: number; skewX: number; skewY?: number; rotation?: number; offsetX?: number; offsetY?: number; tiltX?: number; tiltY?: number };
  textFit?: 'manual' | 'text' | 'balloon';
  textFitWidth?: number;
  clipPanelId?: string;
}
export interface MangaPage {
  id: string;
  name: string;
  width: number;
  height: number;
  background: MangaBackground;
  panelGap?: number;
  panels: MangaPanel[];
  layers: MangaLayer[];
}
export interface MangaAsset { id: string; name: string; imageUrl: string; provenance?: MangaImageProvenance; animation?: MangaAnimation }
export interface MangaProject { format: 'umbra-manga'; version: 1; id: string; name: string; pages: MangaPage[]; assets?: MangaAsset[]; fonts?: Array<{ id: string; filename: string }>; generation?:MangaGenerationSettings; generationRequests?:MangaGenerationRequest[] }

export const MANGA_FONTS = [
  { value: 'comic-neue', label: 'Comic Neue', css: '"Umbra Comic Neue", sans-serif' },
  { value: 'bangers', label: 'Bangers', css: '"Umbra Bangers", sans-serif' },
  { value: 'comic', label: 'Comic Sans', css: '"Comic Sans MS", "Comic Sans", cursive' },
  { value: 'sans', label: 'Clean sans', css: 'Arial, Helvetica, sans-serif' },
  { value: 'impact', label: 'Impact', css: 'Impact, "Arial Black", sans-serif' },
  { value: 'serif', label: 'Narration serif', css: 'Georgia, "Times New Roman", serif' },
  { value: 'mono', label: 'Monospace', css: '"Courier New", monospace' },
];
export function mangaPanelPoints(panel: MangaPanel, inset = 0, local = false): number[] {
  const shape = panel.points || [0,0,1,0,1,1,0,1];
  let points = Array.from({ length: shape.length / 2 }, (_, i) => ({ x: shape[i * 2] * panel.width, y: shape[i * 2 + 1] * panel.height }));
  if (inset > 0 && points.length >= 3) {
    const area = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0);
    const winding = area >= 0 ? 1 : -1;
    const edges = points.map((p, i) => { const next = points[(i + 1) % points.length]; return { ...p, dx: next.x - p.x, dy: next.y - p.y, length: Math.hypot(next.x - p.x, next.y - p.y) }; });
    const convex = edges.every((edge, i) => { const next = edges[(i + 1) % edges.length]; return edge.length > 1e-8 && winding * (edge.dx * next.dy - edge.dy * next.dx) >= -1e-8; });
    if (convex && Math.abs(area) > 1e-8) {
      const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
      // Preserve a visible panel even if a gutter is larger than a narrow wedge.
      const distance = Math.min(inset, ...edges.map(edge => winding * (edge.dx * (center.y - edge.y) - edge.dy * (center.x - edge.x)) / edge.length * .9));
      for (const edge of edges) {
        const input = points; points = [];
        const signed = (p: { x: number; y: number }) => winding * (edge.dx * (p.y - edge.y) - edge.dy * (p.x - edge.x)) / edge.length - distance;
        for (let i = 0; i < input.length; i++) {
          const p = input[i], next = input[(i + 1) % input.length], a = signed(p), b = signed(next);
          if (a >= -1e-8) points.push(p);
          if ((a >= -1e-8) !== (b >= -1e-8)) { const t = a / (a - b); points.push({ x: p.x + t * (next.x - p.x), y: p.y + t * (next.y - p.y) }); }
        }
      }
    } else {
      // Imported concave panels retain their contour instead of being convexified.
      const dx = Math.min(inset, panel.width * .45), dy = Math.min(inset, panel.height * .45);
      points = points.map(p => ({ x: dx + p.x * (panel.width - 2 * dx) / panel.width, y: dy + p.y * (panel.height - 2 * dy) / panel.height }));
    }
  }
  return points.flatMap(p => [p.x + (local ? 0 : panel.x), p.y + (local ? 0 : panel.y)]);
}
export function mangaPanelPath(panel: MangaPanel, local = false, inset = 0): string {
  const points = mangaPanelPoints(panel, inset, local);
  return points.reduce((path, value, index) => index % 2 ? path : `${path}${index ? ' L' : 'M'} ${value} ${points[index + 1]}`, '') + ' Z';
}
export const mangaId = () => crypto.randomUUID();
export const isMangaUserFont = (id: string) => /^user-font:[a-f0-9]{64}$/.test(id);
export const isMangaSystemFont = (id: string) => id.startsWith('system-font:') && id.slice(12).trim().length > 0 && id.length <= 212 && !/[\x00-\x1f]/.test(id);
export const mangaFont = (id: string) => isMangaUserFont(id) ? `"UmbraManga_${id.slice(10)}", sans-serif` : isMangaSystemFont(id) ? `${JSON.stringify(id.slice(12))}, sans-serif` : MANGA_FONTS.find(font => font.value === id)?.css || MANGA_FONTS[0].css;
export function mangaLettering(layer: MangaLayer): MangaLettering {
  // Existing projects keep their old appearance; new layers opt into editable styles.
  return layer.lettering || { weight: 700, italic: layer.kind === 'sfx', underline: false, align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, wrap: true, autoFit: true, outlineWidth: layer.kind === 'sfx' ? 5 : 0 };
}

export function mangaTextType(layer: MangaLayer): MangaTextType {
  return layer.textType || (layer.kind === 'sfx' ? 'sound-effect' : layer.shape === 'thought' ? 'thought' : layer.shape === 'telepathy' ? 'telepathy' : layer.shape === 'rough' ? 'strained' : layer.shape === 'spiky' ? 'surprised' : ['round', 'manga', 'joined'].includes(layer.shape) ? 'speech' : 'custom');
}
export function mangaApplyTextType(layer: MangaLayer, textType: MangaTextType): MangaLayer {
  if (layer.kind === 'image') return layer;
  // Type presets change the container; custom lettering and geometry stay editable.
  const shared = { ...layer, textType };
  if (textType === 'custom') return shared;
  if (textType === 'sound-effect') return { ...shared, kind: 'sfx', bubbleVisible: false, tail: false };
  const shape: MangaBubbleShape = textType === 'thought' ? 'thought' : textType === 'thought-box' ? 'square' : textType === 'telepathy' ? 'telepathy' : textType === 'strained' ? 'rough' : textType === 'surprised' || textType === 'angry' ? 'spiky' : 'manga';
  return { ...shared, kind: 'bubble', shape, balloon: mangaBalloonStyle(layer), bubbleVisible: textType !== 'thought-free', tail: ['speech', 'thought', 'strained', 'surprised', 'angry'].includes(textType) };
}

export function createMangaPage(templateId = 'three', name = 'Page 1', background: MangaBackground = 'white', panelGap = 0): MangaPage {
  const width = 1200, height = 1800;
  const template = MANGA_TEMPLATES.find(item => item.id === templateId) || MANGA_TEMPLATES[0];
  const margin = template.bleed ? 0 : 60;
  return { id: mangaId(), name, width, height, background, panelGap, layers: [], panels: template.boxes.map(([x, y, w, h], index) => ({
    ...(template.shapes?.[index] ? { points: [...template.shapes[index]] } : {}),
    id: mangaId(), x: margin + x * (width - margin * 2), y: margin + y * (height - margin * 2), width: w * (width - margin * 2), height: h * (height - margin * 2),
  })) };
}
export function mangaProjectAssets(project:MangaProject):MangaAsset[] {
  return project.assets || [...new Map(project.pages.flatMap(page => page.layers.filter(layer => layer.kind === 'image').map(layer => [layer.imageUrl,{id:`asset-${layer.id}`,name:layer.name,imageUrl:layer.imageUrl,provenance:layer.provenance,animation:layer.animation}] as const))).values()];
}
export function createMangaProject(): MangaProject {
  return { format: 'umbra-manga', version: 1, id: mangaId(), name: 'Untitled manga', pages: [createMangaPage()] };
}
export function createMangaLayer(kind: MangaLayer['kind'], rect: UmbraCanvasRect, text = ''): MangaLayer {
  return { ...rect, id: mangaId(), kind, name: kind === 'bubble' ? 'Speech bubble' : kind === 'sfx' ? text.slice(0, 200) : 'Imported art', rotation: 0, visible: true, panelId: null, imageUrl: '', text,
    font: kind === 'sfx' ? 'bangers' : 'comic-neue', fontSize: kind === 'sfx' ? 96 : 36, shape: kind === 'bubble' ? 'manga' : 'round', inverted: false, tail: kind === 'bubble', tailX: rect.width * .6, tailY: rect.height + 70, cropX: 0, cropY: 0, zoom: 1,
    lettering: { weight: 400, italic: false, underline: false, align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, wrap: kind === 'bubble', autoFit: false, outlineWidth: 0 } };
}
export function duplicateMangaPage(page: MangaPage): MangaPage {
  const panelIds = new Map(page.panels.map(panel => [panel.id, mangaId()]));
  return { ...page, id: mangaId(), name: `${page.name} copy`, panels: page.panels.map(panel => ({ ...panel, id: panelIds.get(panel.id)! })), layers: page.layers.map(layer => ({ ...layer, id: mangaId(), panelId: layer.panelId ? panelIds.get(layer.panelId) || null : null, ...(layer.clipPanelId ? { clipPanelId: panelIds.get(layer.clipPanelId) } : {}) })) };
}
export const mangaIsPanelBackground = (layer: MangaLayer) => !!layer.panelId && layer.kind === 'image' && layer.imageMode !== 'overlay';
export function duplicateMangaPanel(page: MangaPage, id: string): { page: MangaPage; panelId: string } {
  const panel = page.panels.find(item => item.id === id); if (!panel) throw new Error('Select a panel to duplicate.');
  const sceneLayers = page.layers.filter(layer => layer.panelId === id || layer.clipPanelId === id);
  if (page.panels.length >= 100 || page.layers.length + sceneLayers.length > 500) throw new Error('This page supports 100 panels and 500 layers.');
  const panelId = mangaId(), copy = { ...panel, id: panelId, x: Math.min(8192, panel.x + 20), y: Math.min(8192, panel.y + 20) };
  return { panelId, page: { ...page, panels: [...page.panels, copy], layers: [...page.layers, ...sceneLayers.map(layer => ({ ...layer, id: mangaId(), panelId: layer.panelId === id ? panelId : layer.panelId, ...(layer.clipPanelId === id ? {clipPanelId:panelId} : {}), x: Math.min(8192, layer.x + 20), y: Math.min(8192, layer.y + 20) }))] } };
}
export function mangaLayerFrame(layer: MangaLayer, page: MangaPage): UmbraCanvasRect {
  const panel = page.panels.find(panel => panel.id === layer.panelId);
  if (panel && mangaIsPanelBackground(layer)) return { x: panel.x, y: panel.y, width: panel.width, height: panel.height };
  if (panel && layer.placement) return { x: panel.x + layer.placement.x * panel.width, y: panel.y + layer.placement.y * panel.height, width: layer.placement.width * panel.width, height: layer.placement.height * panel.height };
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}
export function mangaSetLayerFrame(layer: MangaLayer, page: MangaPage, frame: UmbraCanvasRect): MangaLayer {
  const panel = page.panels.find(panel => panel.id === layer.panelId);
  return { ...layer, ...frame, ...(panel && !mangaIsPanelBackground(layer) ? { placement: { x: (frame.x - panel.x) / panel.width, y: (frame.y - panel.y) / panel.height, width: frame.width / panel.width, height: frame.height / panel.height } } : {}) };
}
export function createMangaPanelImage(asset: MangaAsset, panel: MangaPanel, mode: 'background' | 'overlay'): MangaLayer {
  const width = Math.max(8, panel.width * .7), height = Math.max(8, panel.height * .7);
  const frame = mode === 'background' ? { x: panel.x, y: panel.y, width: panel.width, height: panel.height } : { x: panel.x + (panel.width - width) / 2, y: panel.y + (panel.height - height) / 2, width, height };
  return { ...createMangaLayer('image', frame), name: asset.name, imageUrl: asset.imageUrl, provenance: asset.provenance, animation:asset.animation, panelId: panel.id, imageMode: mode, imageFit: mode === 'background' ? 'cover' : 'contain', ...(mode === 'overlay' ? { placement: { x: (frame.x - panel.x) / panel.width, y: (frame.y - panel.y) / panel.height, width: frame.width / panel.width, height: frame.height / panel.height } } : {}) };
}
export function mangaInsertPanelImage(page: MangaPage, layer: MangaLayer): MangaPage {
  const replacing = mangaIsPanelBackground(layer);
  const replaced = page.layers.filter(item => item.id === layer.id || replacing && item.panelId === layer.panelId && mangaIsPanelBackground(item));
  if (replaced.some(item => item.locked)) throw new Error('Unlock the background layer before replacing it.');
  const layers = page.layers.filter(item => !replaced.includes(item));
  if (layers.length >= 500) throw new Error('This page already has 500 layers. Remove a layer first.');
  const index = replacing ? layers.findIndex(item => item.panelId === layer.panelId) : -1;
  layers.splice(index < 0 ? layers.length : index, 0, layer);
  return { ...page, layers };
}
export function mangaMoveLayer(layers: MangaLayer[], id: string, delta: number): MangaLayer[] {
  const layer = layers.find(item => item.id === id); if (!layer || layer.locked || mangaIsPanelBackground(layer)) return layers;
  const bucket = layers.filter(item => item.panelId === layer.panelId && !mangaIsPanelBackground(item));
  const index = bucket.findIndex(item => item.id === id), next = bucket[index + delta]; if (!next) return layers;
  const result = [...layers], a = result.indexOf(layer), b = result.indexOf(next);
  [result[a], result[b]] = [result[b], result[a]]; return result;
}
export function moveMangaItem<T>(items: T[], index: number, delta: number): T[] {
  const next = index + delta;
  if (index < 0 || next < 0 || next >= items.length) return items;
  const result = [...items];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

// A project import is data, never an executable SVG, remote URL or HTML payload.
export function parseMangaProject(input: unknown): MangaProject {
  const fail = (): never => { throw new Error('Invalid Manga Studio project. Expected a supported v1 project with embedded PNG, JPEG or WebP art.'); };
  const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
  const text = (value: unknown, limit = 200) => typeof value === 'string' && value.length <= limit ? value : fail();
  const number = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fail();
  const bool = (value: unknown) => typeof value === 'boolean' ? value : fail();
  const ids = new Set<string>();
  const id = (value: unknown) => { const candidate = text(value, 100); if (!/^[a-zA-Z0-9-]+$/.test(candidate) || ids.has(candidate)) fail(); ids.add(candidate); return candidate; };
  const rect = (value: Record<string, unknown>): UmbraCanvasRect => ({ x: number(value.x, -8192, 8192), y: number(value.y, -8192, 8192), width: number(value.width, 8, 4096), height: number(value.height, 8, 4096) });
  const raw = object(input);
  if (raw.format !== 'umbra-manga' || raw.version !== 1 || !Array.isArray(raw.pages) || raw.pages.length < 1 || raw.pages.length > 100) fail();
  let fonts: MangaProject['fonts'];
  if (raw.fonts !== undefined) {
    if (!Array.isArray(raw.fonts) || raw.fonts.length > 100) fail();
    fonts = (raw.fonts as unknown[]).map(value => { const font = object(value); const fontId = text(font.id); const filename = text(font.filename, 120); if (!isMangaUserFont(fontId) || /[\\/\x00-\x1f]/.test(filename)) fail(); return { id: fontId, filename }; });
  }
  const raster = (value: unknown) => { const url = text(value, 30_000_000); if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url)) fail(); return url; };
  let assets: MangaAsset[] | undefined;
  if (raw.assets !== undefined) { if (!Array.isArray(raw.assets) || raw.assets.length > 500) fail(); assets = (raw.assets as unknown[]).map(value => { const asset = object(value); return { id: id(asset.id), name: text(asset.name), imageUrl: raster(asset.imageUrl), ...(asset.animation !== undefined ? {animation:parseMangaAnimation(asset.animation)} : {}), ...(asset.provenance !== undefined ? {provenance:parseMangaImageProvenance(asset.provenance)} : {}) }; }); }
  const generation = raw.generation === undefined ? undefined : parseMangaGeneration(raw.generation);
  let generationRequests:MangaGenerationRequest[]|undefined;
  if(raw.generationRequests !== undefined){
    if(!Array.isArray(raw.generationRequests) || raw.generationRequests.length>100)fail();
    const requestIds=new Set<string>();
    generationRequests=(raw.generationRequests as unknown[]).map(value=>{const request=object(value),requestId=text(request.requestId,128);if(!/^[a-zA-Z0-9_-]{8,128}$/.test(requestId) || requestIds.has(requestId) || !Array.isArray(request.received) || request.received.length>500)fail();requestIds.add(requestId);return {requestId,received:(request.received as unknown[]).map(path=>text(path,32768))};});
  }
  return { format: 'umbra-manga', version: 1, ...(assets ? { assets } : {}), ...(generation ? {generation} : {}), ...(generationRequests ? {generationRequests} : {}), id: id(raw.id), name: text(raw.name), ...(fonts ? { fonts } : {}), pages: (raw.pages as unknown[]).map(value => {
    const page = object(value);
    if (!Array.isArray(page.panels) || page.panels.length > 100 || !Array.isArray(page.layers) || page.layers.length > 500 || !['white', 'transparent'].includes(String(page.background))) fail();
    const panels = (page.panels as unknown[]).map(value => { const panel = object(value); let points: number[] | undefined; if (panel.points !== undefined) { if (!Array.isArray(panel.points) || panel.points.length < 6 || panel.points.length > 32 || panel.points.length % 2) fail(); points = (panel.points as unknown[]).map(value => number(value, 0, 1)); } return { ...rect(panel), id: id(panel.id), ...(points ? { points } : {}) }; });
    const layers = (page.layers as unknown[]).map(value => {
      const layer = object(value);
      const kind = layer.kind;
      if (!['image', 'bubble', 'sfx'].includes(String(kind)) || !MANGA_BUBBLE_SHAPES.some(shape => shape.value === layer.shape) || !(MANGA_FONTS.some(font => font.value === layer.font) || typeof layer.font === 'string' && (isMangaUserFont(layer.font) || isMangaSystemFont(layer.font)))) fail();
      if (layer.textType !== undefined && (kind === 'image' || !MANGA_TEXT_TYPES.some(type => type.value === layer.textType))) fail();
      if (layer.bubbleVisible !== undefined && kind === 'image') fail();
      const textOptions = { ...(layer.textType !== undefined ? { textType: layer.textType as MangaTextType } : {}), ...(layer.bubbleVisible !== undefined ? { bubbleVisible: bool(layer.bubbleVisible) } : {}) };
      let balloon: MangaLayer['balloon'], textTransform: MangaLayer['textTransform'];
      if (layer.balloon !== undefined) {
        if (kind === 'image') fail(); const style = object(layer.balloon);
        balloon = { strokeWidth: number(style.strokeWidth, 0, 4096), padding: number(style.padding, 0, .49), tailWidth: number(style.tailWidth, 0, 4096), irregularity: number(style.irregularity, 0, 1), outlineGap: number(style.outlineGap, 0, 4096), spikeStrength: number(style.spikeStrength, 0, 1) };
        if (style.edgeWobble !== undefined) balloon.edgeWobble = number(style.edgeWobble, 0, 1);
        if (style.spikeCount !== undefined) { balloon.spikeCount = number(style.spikeCount, 0, 256); if (!Number.isInteger(balloon.spikeCount)) fail(); }
      }
      if (layer.textTransform !== undefined) {
        if (kind === 'image') fail(); const transform = object(layer.textTransform);
        textTransform = { scaleX: number(transform.scaleX, .01, 100), scaleY: number(transform.scaleY, .01, 100), skewX: number(transform.skewX, -85, 85) };
        for (const key of ['skewY', 'rotation', 'offsetX', 'offsetY', 'tiltX', 'tiltY'] as const) if (transform[key] !== undefined) {
          const limit = key.startsWith('tilt') ? 75 : key.startsWith('offset') ? 8192 : key === 'rotation' ? 360 : 85;
          textTransform[key] = number(transform[key], -limit, limit);
        }
      }
      if (layer.textFit !== undefined && (kind === 'image' || !['manual','text','balloon'].includes(String(layer.textFit)))) fail();
      const textFitWidth = layer.textFitWidth === undefined ? undefined : kind === 'image' ? fail() : number(layer.textFitWidth,32,4096);
      const clipPanelId = layer.clipPanelId === undefined ? undefined : text(layer.clipPanelId, 100);
      if (clipPanelId !== undefined && (kind === 'image' || !panels.some(panel => panel.id === clipPanelId))) fail();
      const imageUrl = text(layer.imageUrl, 30_000_000);
      if (kind === 'image' && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(imageUrl)) fail();
      const panelId = layer.panelId === null ? null : text(layer.panelId, 100);
      if (panelId && (kind !== 'image' || !panels.some(panel => panel.id === panelId))) fail();
      let placement: UmbraCanvasRect | undefined;
      if (layer.imageMode !== undefined && (kind !== 'image' || !['background', 'overlay'].includes(String(layer.imageMode)))) fail();
      if (layer.imageFit !== undefined && (kind !== 'image' || !['cover', 'contain'].includes(String(layer.imageFit)))) fail();
      if (layer.placement !== undefined) {
        if (!panelId || layer.imageMode !== 'overlay') fail();
        const value = object(layer.placement);
        placement = { x: number(value.x, -1024, 1024), y: number(value.y, -1024, 1024), width: number(value.width, .0001, 512), height: number(value.height, .0001, 512) };
      }
      const imageOptions = { ...(layer.imageMode !== undefined ? { imageMode: layer.imageMode as MangaLayer['imageMode'] } : {}), ...(layer.imageFit !== undefined ? { imageFit: layer.imageFit as MangaLayer['imageFit'] } : {}), ...(layer.opacity !== undefined ? { opacity: kind === 'image' ? number(layer.opacity, 0, 1) : fail() } : {}), ...(layer.locked !== undefined ? { locked: bool(layer.locked) } : {}), ...(placement ? { placement } : {}) };
      let lettering: MangaLettering | undefined;
      if (layer.lettering !== undefined) {
        const style = object(layer.lettering);
        const color = (value: unknown) => value === undefined ? undefined : typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value) ? value : fail();
        if (!['left', 'center', 'right'].includes(String(style.align)) || !['top', 'middle', 'bottom'].includes(String(style.verticalAlign))) fail();
        lettering = { weight: number(style.weight, 1, 1000), italic: bool(style.italic), underline: bool(style.underline), align: style.align as MangaLettering['align'], verticalAlign: style.verticalAlign as MangaLettering['verticalAlign'], lineHeight: number(style.lineHeight, .1, Number.MAX_SAFE_INTEGER), letterSpacing: number(style.letterSpacing, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), wrap: bool(style.wrap), autoFit: bool(style.autoFit), outlineWidth: number(style.outlineWidth, 0, Number.MAX_SAFE_INTEGER), ...(style.color !== undefined ? { color: color(style.color) } : {}), ...(style.outlineColor !== undefined ? { outlineColor: color(style.outlineColor) } : {}) };
      }
      return { ...rect(layer), id: id(layer.id), kind: kind as MangaLayer['kind'], name: text(layer.name), imageUrl: kind === 'image' ? imageUrl : '', panelId, text: text(layer.text, 100_000_000), font: text(layer.font, 212), shape: layer.shape as MangaBubbleShape,
        ...imageOptions, ...textOptions, ...(kind === 'image' && layer.animation !== undefined ? {animation:parseMangaAnimation(layer.animation)} : {}), ...(kind === 'image' && layer.provenance !== undefined ? {provenance:parseMangaImageProvenance(layer.provenance)} : {}), ...(balloon ? { balloon } : {}), ...(textTransform ? { textTransform } : {}), ...(layer.textFit !== undefined ? { textFit: layer.textFit as MangaLayer['textFit'] } : {}), ...(textFitWidth !== undefined ? {textFitWidth} : {}), ...(clipPanelId ? { clipPanelId } : {}), rotation: number(layer.rotation, -360, 360), visible: bool(layer.visible), inverted: bool(layer.inverted), tail: bool(layer.tail), tailX: number(layer.tailX, -8192, 8192), tailY: number(layer.tailY, -8192, 8192), fontSize: number(layer.fontSize, .1, Number.MAX_SAFE_INTEGER), cropX: number(layer.cropX, -100, 100), cropY: number(layer.cropY, -100, 100), zoom: number(layer.zoom, 1, 5), ...(lettering ? { lettering } : {}) };
    });
    return { id: id(page.id), name: text(page.name), width: number(page.width, 320, 4096), height: number(page.height, 320, 4096), background: page.background as MangaBackground, ...(page.panelGap !== undefined ? { panelGap: number(page.panelGap, 0, 4096) } : {}), panels, layers };
  }) };
}
