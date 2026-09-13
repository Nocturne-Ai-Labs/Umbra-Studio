export type CensorReviewStatus = 'pending' | 'needs-review' | 'approved';
export type CensorReviewTarget = 'maleGenitals' | 'femaleGenitals';
export interface CensorReviewRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
}
export interface CensorReviewStroke {
  id: string;
  erase: boolean;
  radius: number;
  points: Array<[number, number]>;
}
export interface CensorReviewRegion extends CensorReviewRect {
  reviewOnly?: boolean;
  target: CensorReviewTarget;
  score: number;
  maskKind: 'contour' | 'box-fallback';
  maskFile?: string;
}
export interface CensorReviewSettings {
  autoDetect: boolean;
  targets: CensorReviewTarget[];
  cutoff: number;
  reviewThreshold: number;
  padding: number;
  mosaicSize: number;
  mode: 'mosaic' | 'overlay';
  overlayPath: string;
  resizeEnabled: boolean;
  longEdge: number;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
}
export const DEFAULT_CENSOR_REVIEW_SETTINGS: CensorReviewSettings = {
  autoDetect: true,
  targets: ['maleGenitals', 'femaleGenitals'],
  cutoff: 0.5,
  reviewThreshold: 0.15,
  padding: 0,
  mosaicSize: 24,
  mode: 'mosaic',
  overlayPath: '',
  resizeEnabled: false,
  longEdge: 1024,
  format: 'png',
  quality: 90,
};
export interface CensorReviewItem {
  id: string;
  name: string;
  originalPath: string;
  sourceFile: string;
  sourceHash: string;
  width: number;
  height: number;
  sourceBytes: number;
  protectedMedia: boolean;
  revision: number;
  editRevision: number;
  renderedEditRevision: number | null;
  status: CensorReviewStatus;
  settings: CensorReviewSettings;
  regions: CensorReviewRegion[];
  rectangles: CensorReviewRect[];
  strokes: CensorReviewStroke[];
  detectedCutoff: number | null;
  detectedCensorCutoff?: number;
  detectedPadding: number | null;
  detectedTargets: CensorReviewTarget[];
  warnings: string[];
  error: string;
  previewFile: string;
  maskFile: string;
  censored: boolean;
  updatedAt: number;
  lastExport?: { path: string; directory: string; editRevision: number; exportedAt: number; registered?: boolean };
}
export type CensorReviewItemSummary = Pick<
  CensorReviewItem,
  | 'id'
  | 'name'
  | 'width'
  | 'height'
  | 'revision'
  | 'editRevision'
  | 'renderedEditRevision'
  | 'status'
  | 'error'
  | 'updatedAt'
  | 'lastExport'
  | 'sourceBytes'
  | 'protectedMedia'
> & { attention: string[]; needsDetection: boolean };
export interface CensorReviewProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: CensorReviewItemSummary[];
}
export interface CensorReviewProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
  approvedCount: number;
}
export interface CensorReviewEdits {
  revision: number;
  settings: CensorReviewSettings;
  regionEnabled: Record<string, boolean>;
  rectangles: CensorReviewRect[];
  strokes: CensorReviewStroke[];
}
export function censorReviewNeedsDetection(item: CensorReviewItem): boolean {
  return (
    item.settings.autoDetect &&
    (item.detectedCutoff === null ||
      (item.status === 'approved' && item.detectedCensorCutoff === undefined
        ? item.settings.cutoff : censorReviewDetectionFloor(item.settings)) < item.detectedCutoff ||
      item.settings.cutoff < (item.detectedCensorCutoff ?? item.detectedCutoff) ||
      item.detectedPadding !== item.settings.padding ||
      item.settings.targets.some((target) => !item.detectedTargets.includes(target)))
  );
}
export function censorReviewDetectionFloor(settings: CensorReviewSettings): number {
  return Math.min(settings.cutoff, settings.reviewThreshold ?? 0.15);
}
export function censorReviewAttention(item: CensorReviewItem): string[] {
  if (item.status === 'approved') return [];
  if (item.error) return ['Detection or preview failed'];
  if (!item.settings.autoDetect) return [];
  if (censorReviewNeedsDetection(item)) return ['Review scan needed'];
  const active = item.regions.filter((r) => r.enabled && item.settings.targets.includes(r.target));
  const weak = active.filter((r) => r.score >= censorReviewDetectionFloor(item.settings) && (r.reviewOnly || r.score < item.settings.cutoff));
  return [
    ...(weak.length ? [`${weak.length} uncertain region${weak.length === 1 ? '' : 's'}`] : []),
    ...(!active.length ? ['No regions detected'] : []),
    ...(item.warnings.length ? ['Detector warning'] : []),
  ];
}
export function censorReviewCanApprove(item: CensorReviewItem): boolean {
  return (
    !!item.previewFile &&
    item.renderedEditRevision === item.editRevision &&
    !item.error &&
    !censorReviewNeedsDetection(item)
  );
}
function number(value: unknown, min: number, max: number, fallback: number): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
export function normalizeCensorReviewSettings(value: unknown): CensorReviewSettings {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    autoDetect: v.autoDetect !== false,
    targets: [
      ...new Set(
        (Array.isArray(v.targets) ? v.targets : DEFAULT_CENSOR_REVIEW_SETTINGS.targets).filter(
          (target): target is 'maleGenitals' | 'femaleGenitals' =>
            target === 'maleGenitals' || target === 'femaleGenitals',
        ),
      ),
    ],
    cutoff: number(v.cutoff, 0.05, 0.95, 0.5),
    reviewThreshold: Math.min(number(v.reviewThreshold, 0.05, 0.95, 0.15), number(v.cutoff, 0.05, 0.95, 0.5)),
    padding: number(v.padding, 0, 0.5, 0),
    mosaicSize: Math.round(number(v.mosaicSize, 2, 160, 24)),
    mode: v.mode === 'overlay' ? 'overlay' : 'mosaic',
    overlayPath: typeof v.overlayPath === 'string' ? v.overlayPath.slice(0, 4096) : '',
    resizeEnabled: v.resizeEnabled === true,
    longEdge: Math.round(number(v.longEdge, 128, 16384, 1024)),
    format: v.format === 'jpeg' || v.format === 'webp' ? v.format : 'png',
    quality: Math.round(number(v.quality, 1, 100, 90)),
  };
}
export function summarizeCensorReviewItem(item: CensorReviewItem): CensorReviewItemSummary {
  const {
    id,
    name,
    width,
    height,
    revision,
    editRevision,
    renderedEditRevision,
    status,
    error,
    updatedAt,
    lastExport,
    sourceBytes,
    protectedMedia,
  } = item;
  return {
    id,
    name,
    width,
    height,
    revision,
    editRevision,
    renderedEditRevision,
    status,
    error,
    updatedAt,
    lastExport,
    sourceBytes,
    protectedMedia,
    attention: censorReviewAttention(item),
    needsDetection: censorReviewNeedsDetection(item),
  };
}
