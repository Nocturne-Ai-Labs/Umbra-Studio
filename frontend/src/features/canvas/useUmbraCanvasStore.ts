import { create } from 'zustand';
import {
  createUmbraCanvasProjectDocument,
  createUmbraCanvasRasterEntity,
  normalizeUmbraCanvasRasterAdjustments,
  normalizeUmbraCanvasBbox,
  UMBRA_CANVAS_PROJECT_VERSION,
  isUmbraCanvasDrawableEntity,
  isUmbraCanvasSpatialEntity,
  type UmbraCanvasEntity,
  type UmbraCanvasDrawableEntity,
  type UmbraCanvasGenerationSettingsSnapshot,
  type UmbraCanvasPendingGeneration,
  type UmbraCanvasStagedGeneration,
  type UmbraCanvasMaskEntity,
  type UmbraCanvasMaskStroke,
  type UmbraCanvasProjectDocument,
  type UmbraCanvasRasterEntity,
  type UmbraCanvasRasterStroke,
  type UmbraCanvasShapeEntity,
  type UmbraCanvasTextEntity,
  type UmbraCanvasGradientEntity,
  type UmbraCanvasPathEntity,
  type UmbraCanvasRegionalGuidanceEntity,
  type UmbraCanvasControlEntity,
  type UmbraCanvasReferenceEntity,
  type UmbraCanvasRect,
  type UmbraCanvasViewport,
} from './canvasModel';

interface UmbraCanvasHistory {
  past: UmbraCanvasProjectDocument[];
  present: UmbraCanvasProjectDocument;
  future: UmbraCanvasProjectDocument[];
}

const MAX_HISTORY_ENTRIES = 80;
const MAX_HISTORY_PIXEL_COST = 512 * 1024 * 1024;
const HISTORY_COST_CACHE = new WeakMap<UmbraCanvasProjectDocument, number>();

function estimateProjectHistoryCost(project: UmbraCanvasProjectDocument): number {
  const cached = HISTORY_COST_CACHE.get(project);
  if (cached !== undefined) return cached;
  let cost = 16_384;
  for (const entity of project.entities) {
    cost += 512;
    if (entity.kind === 'raster') {
      cost += entity.strokes.reduce((total, stroke) => total + stroke.points.length * 8 + 128, 0);
    } else if (entity.kind === 'mask') {
      cost += entity.strokes.reduce((total, stroke) => total + stroke.points.length * 8 + 96, 0);
    } else if (entity.kind === 'path') cost += entity.points.length * 8;
  }
  cost += project.generation.staging.length * 512 + project.generation.pending.length * 1024;
  HISTORY_COST_CACHE.set(project, cost);
  return cost;
}

function collectProjectAssetCosts(project: UmbraCanvasProjectDocument): Map<string, number> {
  const assets = new Map<string, number>();
  for (const entity of project.entities) {
    if ((entity.kind !== 'raster' && entity.kind !== 'mask') || !entity.imageUrl) continue;
    const bytesPerPixel = entity.kind === 'raster' ? 4 : 1;
    const maximum = entity.kind === 'raster' ? 128 * 1024 * 1024 : 32 * 1024 * 1024;
    assets.set(`${entity.kind}:${entity.imageUrl}`, Math.min(entity.width * entity.height * bytesPerPixel, maximum));
  }
  for (const pending of project.generation.pending) {
    if (pending.acceptanceMaskUrl) assets.set(`mask:${pending.acceptanceMaskUrl}`, Math.min(pending.bbox.width * pending.bbox.height, 32 * 1024 * 1024));
  }
  for (const stage of project.generation.staging) {
    if (stage.imageUrl) assets.set(`raster:${stage.imageUrl}`, Math.min(stage.bbox.width * stage.bbox.height * 4, 128 * 1024 * 1024));
    if (stage.acceptanceMaskUrl) assets.set(`mask:${stage.acceptanceMaskUrl}`, Math.min(stage.bbox.width * stage.bbox.height, 32 * 1024 * 1024));
  }
  return assets;
}

function trimProjectHistory(
  projects: UmbraCanvasProjectDocument[],
  current: UmbraCanvasProjectDocument,
): UmbraCanvasProjectDocument[] {
  const kept: UmbraCanvasProjectDocument[] = [];
  let cost = 0;
  const knownAssets = new Set(collectProjectAssetCosts(current).keys());
  for (let index = projects.length - 1; index >= 0 && kept.length < MAX_HISTORY_ENTRIES; index -= 1) {
    const candidate = projects[index];
    let candidateCost = estimateProjectHistoryCost(candidate);
    const candidateAssets = collectProjectAssetCosts(candidate);
    for (const [key, assetCost] of candidateAssets) {
      if (!knownAssets.has(key)) candidateCost += assetCost;
    }
    if (kept.length > 0 && cost + candidateCost > MAX_HISTORY_PIXEL_COST) break;
    kept.unshift(candidate);
    cost += candidateCost;
    for (const key of candidateAssets.keys()) knownAssets.add(key);
  }
  return kept;
}

function duplicateCanvasEntity(source: UmbraCanvasEntity, offset = 24): UmbraCanvasEntity {
  const now = Date.now();
  if (source.kind === 'regional-guidance' || source.kind === 'control' || source.kind === 'reference') {
    return {
      ...structuredClone(source),
      id: `${source.kind}-${crypto.randomUUID()}`,
      name: `${source.name} copy`,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
  if (source.kind === 'mask') {
    return {
      ...structuredClone(source),
      id: `mask-${crypto.randomUUID()}`,
      name: `${source.name} copy`,
      x: source.x + offset,
      y: source.y + offset,
      strokes: source.strokes.map((stroke) => ({ ...stroke, id: `stroke-${crypto.randomUUID()}`, points: [...stroke.points] })),
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
  if (source.kind === 'raster') {
    return {
      ...createUmbraCanvasRasterEntity({
        name: `${source.name} copy`,
        imageUrl: source.imageUrl,
        sourcePath: source.sourcePath,
        width: source.width,
        height: source.height,
        x: source.x + offset,
        y: source.y + offset,
      }),
      scaleX: source.scaleX,
      scaleY: source.scaleY,
      rotation: source.rotation,
      opacity: source.opacity,
      blendMode: source.blendMode,
      generationEnabled: source.generationEnabled,
      alphaLocked: source.alphaLocked,
      adjustments: { ...source.adjustments },
      strokes: source.strokes.map((stroke) => ({ ...stroke, points: [...stroke.points] })),
    };
  }
  return {
    ...structuredClone(source),
    id: `${source.kind}-${crypto.randomUUID()}`,
    name: `${source.name} copy`,
    x: source.x + offset,
    y: source.y + offset,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

interface UmbraCanvasStore extends UmbraCanvasHistory {
  replaceProject: (project: UmbraCanvasProjectDocument) => void;
  syncPersistedProject: (project: UmbraCanvasProjectDocument) => void;
  newProject: () => void;
  renameProject: (name: string) => void;
  addRaster: (entity: UmbraCanvasRasterEntity) => void;
  addDrawable: (entity: UmbraCanvasDrawableEntity) => void;
  mergeVisibleDrawables: (entity: UmbraCanvasRasterEntity, sourceIds: string[]) => void;
  addRasterStroke: (entityId: string, stroke: UmbraCanvasRasterStroke) => void;
  clearRasterStrokes: (entityId: string) => void;
  addMask: (entity: UmbraCanvasMaskEntity) => void;
  addRegionalGuidance: (entity: UmbraCanvasRegionalGuidanceEntity) => void;
  addControl: (entity: UmbraCanvasControlEntity) => void;
  addReference: (entity: UmbraCanvasReferenceEntity) => void;
  addMaskStroke: (entityId: string, stroke: UmbraCanvasMaskStroke) => void;
  clearMask: (entityId: string) => void;
  updateMask: (entityId: string, patch: Partial<Pick<UmbraCanvasMaskEntity, 'name' | 'imageUrl' | 'sourcePath' | 'inverted' | 'feather' | 'grow' | 'operation'>>) => void;
  updateRegionalGuidance: (entityId: string, patch: Partial<Pick<UmbraCanvasRegionalGuidanceEntity, 'name' | 'maskEntityId' | 'positivePrompt' | 'negativePrompt' | 'autoNegative' | 'weight' | 'beginStepPercent' | 'endStepPercent'>>) => void;
  updateControl: (entityId: string, patch: Partial<Omit<UmbraCanvasControlEntity, 'id' | 'kind' | 'createdAt'>>) => void;
  updateReference: (entityId: string, patch: Partial<Omit<UmbraCanvasReferenceEntity, 'id' | 'kind' | 'createdAt'>>) => void;
  duplicateEntity: (entityId: string) => void;
  duplicateEntities: (entityIds: string[]) => string[];
  selectEntity: (entityId: string) => void;
  updateRaster: (entityId: string, patch: Partial<Omit<UmbraCanvasRasterEntity, 'id' | 'kind' | 'imageUrl' | 'sourcePath' | 'createdAt'>>) => void;
  replaceRasterSource: (entityId: string, patch: Pick<UmbraCanvasRasterEntity, 'imageUrl' | 'sourcePath' | 'width' | 'height' | 'x' | 'y'>) => void;
  updateDrawable: (entityId: string, patch: Partial<UmbraCanvasRasterEntity> | Partial<UmbraCanvasShapeEntity> | Partial<UmbraCanvasTextEntity> | Partial<UmbraCanvasGradientEntity> | Partial<UmbraCanvasPathEntity>) => void;
  updateDrawableTransform: (
    entityId: string,
    transform: Partial<Pick<UmbraCanvasDrawableEntity | UmbraCanvasMaskEntity, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'>>,
  ) => void;
  updateDrawableTransforms: (transforms: Array<{
    entityId: string;
    transform: Partial<Pick<UmbraCanvasDrawableEntity | UmbraCanvasMaskEntity, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'>>;
  }>) => void;
  updateRasterTransform: (
    entityId: string,
    transform: Partial<Pick<UmbraCanvasRasterEntity, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'>>,
  ) => void;
  toggleEntityVisibility: (entityId: string) => void;
  toggleEntityGeneration: (entityId: string) => void;
  toggleEntityLock: (entityId: string) => void;
  toggleEntityAlphaLock: (entityId: string) => void;
  deleteEntity: (entityId: string) => void;
  deleteEntities: (entityIds: string[]) => void;
  moveEntity: (entityId: string, direction: 'up' | 'down') => void;
  setGenerationBbox: (bbox: Partial<UmbraCanvasRect>) => void;
  setViewport: (viewport: Partial<UmbraCanvasViewport>) => void;
  setGenerationSettings: (settings: UmbraCanvasGenerationSettingsSnapshot) => void;
  upsertPendingGeneration: (pending: UmbraCanvasPendingGeneration) => void;
  removePendingGeneration: (jobId: string) => void;
  addStagedGenerations: (stages: UmbraCanvasStagedGeneration[]) => void;
  discardStagedGeneration: (stageId: string) => void;
  clearStagedGenerations: () => void;
  toggleStagedGenerationPin: (stageId: string) => void;
  acceptStagedGeneration: (stageId: string, entity: UmbraCanvasRasterEntity) => void;
  markStagedGenerationAccepted: (stageId: string, entityId: string) => void;
  undo: () => void;
  redo: () => void;
}

function cloneProject(project: UmbraCanvasProjectDocument): UmbraCanvasProjectDocument {
  const clone = structuredClone(project);
  clone.version = UMBRA_CANVAS_PROJECT_VERSION;
  clone.entities = clone.entities.map((entity) => entity.kind === 'raster'
    ? { ...entity, adjustments: normalizeUmbraCanvasRasterAdjustments(entity.adjustments) }
    : entity);
  return clone;
}

function revise(
  state: UmbraCanvasHistory,
  update: (project: UmbraCanvasProjectDocument) => UmbraCanvasProjectDocument,
): Pick<UmbraCanvasHistory, 'past' | 'present' | 'future'> {
  const previous = state.present;
  const draft = cloneProject(previous);
  const updated = update(draft);
  if (updated === draft) return state;
  const now = Date.now();
  const present = { ...updated, revision: previous.revision + 1, updatedAt: now };
  return {
    past: trimProjectHistory([...state.past, cloneProject(previous)], present),
    present,
    future: [],
  };
}

function updateEntity(
  project: UmbraCanvasProjectDocument,
  entityId: string,
  update: (entity: UmbraCanvasEntity) => UmbraCanvasEntity,
): UmbraCanvasProjectDocument {
  let changed = false;
  const entities = project.entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    const updated = update(entity);
    if (updated === entity) return entity;
    changed = true;
    return updated;
  });
  return changed ? { ...project, entities } : project;
}

function isTransientAssetUrl(value: string | undefined): boolean {
  return /^(blob:|data:)/i.test(String(value || ''));
}

function hydratePersistedAssets(
  current: UmbraCanvasProjectDocument,
  persisted: UmbraCanvasProjectDocument,
): UmbraCanvasProjectDocument {
  const persistedEntities = new Map(persisted.entities.map((entity) => [entity.id, entity]));
  const entities = current.entities.map((entity) => {
    if (entity.kind !== 'raster' && entity.kind !== 'mask') return entity;
    const saved = persistedEntities.get(entity.id);
    if (!saved || (saved.kind !== 'raster' && saved.kind !== 'mask')) return entity;
    if (entity.revision !== saved.revision || !isTransientAssetUrl(entity.imageUrl) || !saved.imageUrl) return entity;
    return { ...entity, imageUrl: saved.imageUrl, sourcePath: saved.sourcePath };
  });
  const persistedPending = new Map(persisted.generation.pending.map((entry) => [entry.jobId, entry]));
  const pending = current.generation.pending.map((entry) => {
    const saved = persistedPending.get(entry.jobId);
    return saved && isTransientAssetUrl(entry.acceptanceMaskUrl) && saved.acceptanceMaskUrl
      ? { ...entry, acceptanceMaskUrl: saved.acceptanceMaskUrl }
      : entry;
  });
  const persistedStages = new Map(persisted.generation.staging.map((entry) => [`${entry.jobId}:${entry.itemId}`, entry]));
  const staging = current.generation.staging.map((entry) => {
    const saved = persistedStages.get(`${entry.jobId}:${entry.itemId}`);
    return saved && isTransientAssetUrl(entry.acceptanceMaskUrl) && saved.acceptanceMaskUrl
      ? { ...entry, acceptanceMaskUrl: saved.acceptanceMaskUrl }
      : entry;
  });
  return {
    ...current,
    entities,
    generation: { ...current.generation, pending, staging },
  };
}

export const useUmbraCanvasStore = create<UmbraCanvasStore>((set) => ({
  past: [],
  present: createUmbraCanvasProjectDocument(),
  future: [],
  replaceProject: (project) => set({ past: [], present: cloneProject(project), future: [] }),
  syncPersistedProject: (project) => set((state) => {
    if (state.present.id !== project.id) return state;
    if (state.present.revision === project.revision) return { present: cloneProject(project) };
    return { present: hydratePersistedAssets(state.present, project) };
  }),
  newProject: () => set({ past: [], present: createUmbraCanvasProjectDocument(), future: [] }),
  renameProject: (name) => set((state) => revise(state, (project) => ({
    ...project,
    name: String(name || '').trim().slice(0, 160) || 'Untitled Canvas',
  }))),
  addRaster: (entity) => set((state) => revise(state, (project) => ({
    ...project,
    entities: [...project.entities, entity],
    activeEntityId: entity.id,
  }))),
  addDrawable: (entity) => set((state) => revise(state, (project) => ({
    ...project,
    entities: [...project.entities, entity],
    activeEntityId: entity.id,
  }))),
  mergeVisibleDrawables: (entity, sourceIds) => set((state) => revise(state, (project) => {
    const sourceIdSet = new Set(sourceIds);
    return {
      ...project,
      entities: [
        ...project.entities.map((candidate) => sourceIdSet.has(candidate.id) && isUmbraCanvasDrawableEntity(candidate)
          ? { ...candidate, visible: false, generationEnabled: false, revision: candidate.revision + 1, updatedAt: Date.now() }
          : candidate),
        entity,
      ],
      activeEntityId: entity.id,
    };
  })),
  addRasterStroke: (entityId, stroke) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'raster' || entity.locked ? entity : {
      ...entity,
      strokes: [...entity.strokes, stroke],
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  clearRasterStrokes: (entityId) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'raster' || entity.locked || entity.strokes.length === 0 ? entity : {
      ...entity,
      strokes: [],
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  addMask: (entity) => set((state) => revise(state, (project) => ({
    ...project,
    entities: [...project.entities, entity],
    activeEntityId: entity.id,
  }))),
  addRegionalGuidance: (entity) => set((state) => revise(state, (project) => ({
    ...project,
    entities: [...project.entities, entity],
    activeEntityId: entity.id,
  }))),
  addControl: (entity) => set((state) => revise(state, (project) => ({ ...project, entities: [...project.entities, entity], activeEntityId: entity.id }))),
  addReference: (entity) => set((state) => revise(state, (project) => ({ ...project, entities: [...project.entities, entity], activeEntityId: entity.id }))),
  addMaskStroke: (entityId, stroke) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'mask' || entity.locked ? entity : {
      ...entity,
      strokes: [...entity.strokes, stroke],
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  clearMask: (entityId) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'mask' || entity.locked || entity.strokes.length === 0 ? entity : {
      ...entity,
      strokes: [],
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  updateMask: (entityId, patch) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'mask' || entity.locked ? entity : {
      ...entity,
      ...patch,
      name: patch.name === undefined ? entity.name : String(patch.name || '').trim().slice(0, 240) || 'Inpaint Mask',
      feather: patch.feather === undefined ? entity.feather : Math.max(0, Math.min(512, Number(patch.feather) || 0)),
      grow: patch.grow === undefined ? entity.grow : Math.max(-512, Math.min(512, Number(patch.grow) || 0)),
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  updateRegionalGuidance: (entityId, patch) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'regional-guidance' || entity.locked ? entity : {
      ...entity,
      ...patch,
      name: patch.name === undefined ? entity.name : String(patch.name || '').trim().slice(0, 240) || 'Regional Guide',
      weight: patch.weight === undefined ? entity.weight : Math.max(-10, Math.min(10, Number(patch.weight) || 0)),
      beginStepPercent: patch.beginStepPercent === undefined ? entity.beginStepPercent : Math.max(0, Math.min(1, Number(patch.beginStepPercent) || 0)),
      endStepPercent: patch.endStepPercent === undefined ? entity.endStepPercent : Math.max(0, Math.min(1, Number(patch.endStepPercent) || 0)),
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  updateControl: (entityId, patch) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'control' || entity.locked ? entity : {
      ...entity,
      ...patch,
      id: entity.id,
      kind: entity.kind,
      name: patch.name === undefined ? entity.name : String(patch.name || '').trim().slice(0, 240) || 'Control Layer',
      weight: patch.weight === undefined ? entity.weight : Math.max(-10, Math.min(10, Number(patch.weight) || 0)),
      beginStepPercent: patch.beginStepPercent === undefined ? entity.beginStepPercent : Math.max(0, Math.min(1, Number(patch.beginStepPercent) || 0)),
      endStepPercent: patch.endStepPercent === undefined ? entity.endStepPercent : Math.max(0, Math.min(1, Number(patch.endStepPercent) || 0)),
      processorResolution: patch.processorResolution === undefined ? entity.processorResolution : Math.max(64, Math.min(8192, Math.round(Number(patch.processorResolution) || 512))),
      lowThreshold: patch.lowThreshold === undefined ? entity.lowThreshold : Math.max(0, Math.min(255, Math.round(Number(patch.lowThreshold) || 0))),
      highThreshold: patch.highThreshold === undefined ? entity.highThreshold : Math.max(0, Math.min(255, Math.round(Number(patch.highThreshold) || 0))),
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  updateReference: (entityId, patch) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'reference' || entity.locked ? entity : {
      ...entity,
      ...patch,
      id: entity.id,
      kind: entity.kind,
      name: patch.name === undefined ? entity.name : String(patch.name || '').trim().slice(0, 240) || 'Reference Layer',
      weight: patch.weight === undefined ? entity.weight : Math.max(-10, Math.min(10, Number(patch.weight) || 0)),
      beginStepPercent: patch.beginStepPercent === undefined ? entity.beginStepPercent : Math.max(0, Math.min(1, Number(patch.beginStepPercent) || 0)),
      endStepPercent: patch.endStepPercent === undefined ? entity.endStepPercent : Math.max(0, Math.min(1, Number(patch.endStepPercent) || 0)),
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  duplicateEntity: (entityId) => set((state) => revise(state, (project) => {
    const source = project.entities.find((entity) => entity.id === entityId);
    if (!source) return project;
    const duplicate = duplicateCanvasEntity(source);
    const index = project.entities.findIndex((entity) => entity.id === entityId);
    const entities = [...project.entities];
    entities.splice(index + 1, 0, duplicate);
    return { ...project, entities, activeEntityId: duplicate.id };
  })),
  duplicateEntities: (entityIds) => {
    const requested = new Set(entityIds);
    const duplicateIds: string[] = [];
    set((state) => revise(state, (project) => {
      const entities: UmbraCanvasEntity[] = [];
      for (const entity of project.entities) {
        entities.push(entity);
        if (!requested.has(entity.id)) continue;
        const duplicate = duplicateCanvasEntity(entity);
        entities.push(duplicate);
        duplicateIds.push(duplicate.id);
      }
      if (duplicateIds.length === 0) return project;
      return { ...project, entities, activeEntityId: duplicateIds.at(-1) || project.activeEntityId };
    }));
    return duplicateIds;
  },
  selectEntity: (entityId) => set((state) => ({
    present: {
      ...state.present,
      activeEntityId: state.present.entities.some((entity) => entity.id === entityId) ? entityId : '',
    },
  })),
  updateRaster: (entityId, patch) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'raster' || entity.locked ? entity : {
      ...entity,
      ...patch,
      name: patch.name === undefined ? entity.name : String(patch.name || '').trim().slice(0, 240) || 'Image',
      x: patch.x === undefined ? entity.x : Math.round(Number(patch.x) || 0),
      y: patch.y === undefined ? entity.y : Math.round(Number(patch.y) || 0),
      scaleX: patch.scaleX === undefined ? entity.scaleX : Number(patch.scaleX) || 1,
      scaleY: patch.scaleY === undefined ? entity.scaleY : Number(patch.scaleY) || 1,
      rotation: patch.rotation === undefined ? entity.rotation : Number(patch.rotation) || 0,
      opacity: patch.opacity === undefined ? entity.opacity : Math.max(0, Math.min(1, Number(patch.opacity) || 0)),
      adjustments: patch.adjustments === undefined ? entity.adjustments : normalizeUmbraCanvasRasterAdjustments(patch.adjustments),
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  replaceRasterSource: (entityId, patch) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'raster' || entity.locked ? entity : {
      ...entity,
      ...patch,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      adjustments: normalizeUmbraCanvasRasterAdjustments(undefined),
      strokes: [],
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  updateDrawable: (entityId, patch) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => !isUmbraCanvasDrawableEntity(entity) || entity.locked ? entity : {
      ...entity,
      ...patch,
      id: entity.id,
      kind: entity.kind,
      name: patch.name === undefined ? entity.name : String(patch.name || '').trim().slice(0, 240) || 'Layer',
      x: patch.x === undefined ? entity.x : Math.round(Number(patch.x) || 0),
      y: patch.y === undefined ? entity.y : Math.round(Number(patch.y) || 0),
      width: patch.width === undefined ? entity.width : Math.max(1, Math.round(Number(patch.width) || 1)),
      height: patch.height === undefined ? entity.height : Math.max(1, Math.round(Number(patch.height) || 1)),
      scaleX: patch.scaleX === undefined ? entity.scaleX : Number(patch.scaleX) || 1,
      scaleY: patch.scaleY === undefined ? entity.scaleY : Number(patch.scaleY) || 1,
      rotation: patch.rotation === undefined ? entity.rotation : Number(patch.rotation) || 0,
      opacity: patch.opacity === undefined ? entity.opacity : Math.max(0, Math.min(1, Number(patch.opacity) || 0)),
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    } as UmbraCanvasDrawableEntity,
  ))),
  updateDrawableTransform: (entityId, transform) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => !isUmbraCanvasSpatialEntity(entity) || entity.locked ? entity : {
      ...entity,
      ...transform,
      x: transform.x === undefined ? entity.x : Math.round(transform.x),
      y: transform.y === undefined ? entity.y : Math.round(transform.y),
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  updateDrawableTransforms: (transforms) => set((state) => revise(state, (project) => {
    const byId = new Map(transforms.map((entry) => [entry.entityId, entry.transform]));
    if (byId.size === 0) return project;
    const now = Date.now();
    let changed = false;
    const entities = project.entities.map((entity) => {
      const transform = byId.get(entity.id);
      if (!transform || !isUmbraCanvasSpatialEntity(entity) || entity.locked) return entity;
      changed = true;
      return {
        ...entity,
        ...transform,
        x: transform.x === undefined ? entity.x : Math.round(transform.x),
        y: transform.y === undefined ? entity.y : Math.round(transform.y),
        revision: entity.revision + 1,
        updatedAt: now,
      };
    });
    return changed ? { ...project, entities } : project;
  })),
  updateRasterTransform: (entityId, transform) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'raster' || entity.locked ? entity : {
      ...entity,
      ...transform,
      x: transform.x === undefined ? entity.x : Math.round(transform.x),
      y: transform.y === undefined ? entity.y : Math.round(transform.y),
      revision: entity.revision + 1,
      updatedAt: Date.now(),
    },
  ))),
  toggleEntityVisibility: (entityId) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => ({ ...entity, visible: !entity.visible, revision: entity.revision + 1, updatedAt: Date.now() }),
  ))),
  toggleEntityGeneration: (entityId) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => ({ ...entity, generationEnabled: !entity.generationEnabled, revision: entity.revision + 1, updatedAt: Date.now() }),
  ))),
  toggleEntityLock: (entityId) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => ({ ...entity, locked: !entity.locked, revision: entity.revision + 1, updatedAt: Date.now() }),
  ))),
  toggleEntityAlphaLock: (entityId) => set((state) => revise(state, (project) => updateEntity(
    project,
    entityId,
    (entity) => entity.kind !== 'raster' ? entity : ({ ...entity, alphaLocked: !entity.alphaLocked, revision: entity.revision + 1, updatedAt: Date.now() }),
  ))),
  deleteEntity: (entityId) => set((state) => revise(state, (project) => {
    const source = project.entities.find((entity) => entity.id === entityId);
    const deletedIds = new Set([entityId]);
    if (source?.kind === 'mask') {
      project.entities.forEach((entity) => {
        if (entity.kind === 'regional-guidance' && entity.maskEntityId === entityId) deletedIds.add(entity.id);
      });
    }
    if (source?.kind === 'raster') {
      project.entities.forEach((entity) => {
        if ((entity.kind === 'control' || entity.kind === 'reference') && entity.rasterEntityId === entityId) deletedIds.add(entity.id);
      });
    }
    return {
      ...project,
      entities: project.entities.filter((entity) => !deletedIds.has(entity.id)),
      activeEntityId: deletedIds.has(project.activeEntityId) ? '' : project.activeEntityId,
    };
  })),
  deleteEntities: (entityIds) => set((state) => revise(state, (project) => {
    const deletedIds = new Set(entityIds.filter((entityId) => project.entities.some((entity) => entity.id === entityId)));
    if (deletedIds.size === 0) return project;
    for (const entity of project.entities) {
      if (entity.kind === 'regional-guidance' && deletedIds.has(entity.maskEntityId)) deletedIds.add(entity.id);
      if ((entity.kind === 'control' || entity.kind === 'reference') && deletedIds.has(entity.rasterEntityId)) deletedIds.add(entity.id);
    }
    return {
      ...project,
      entities: project.entities.filter((entity) => !deletedIds.has(entity.id)),
      activeEntityId: deletedIds.has(project.activeEntityId) ? '' : project.activeEntityId,
    };
  })),
  moveEntity: (entityId, direction) => set((state) => revise(state, (project) => {
    const index = project.entities.findIndex((entity) => entity.id === entityId);
    const target = direction === 'up' ? index + 1 : index - 1;
    if (index < 0 || target < 0 || target >= project.entities.length) return project;
    const entities = [...project.entities];
    [entities[index], entities[target]] = [entities[target], entities[index]];
    return { ...project, entities };
  })),
  setGenerationBbox: (bbox) => set((state) => revise(state, (project) => ({
    ...project,
    generationBbox: normalizeUmbraCanvasBbox(
      { ...project.generationBbox, ...bbox },
      project.generationAlignment,
    ),
  }))),
  setViewport: (viewport) => set((state) => ({
    present: {
      ...state.present,
      viewport: {
        x: Number.isFinite(Number(viewport.x)) ? Number(viewport.x) : state.present.viewport.x,
        y: Number.isFinite(Number(viewport.y)) ? Number(viewport.y) : state.present.viewport.y,
        scale: Number.isFinite(Number(viewport.scale))
          ? Math.max(0.05, Math.min(8, Number(viewport.scale)))
          : state.present.viewport.scale,
      },
    },
  })),
  setGenerationSettings: (settings) => set((state) => revise(state, (project) => ({
    ...project,
    generation: { ...project.generation, settings: structuredClone(settings) },
  }))),
  upsertPendingGeneration: (pending) => set((state) => revise(state, (project) => {
    const byId = new Map(project.generation.pending.map((entry) => [entry.jobId, entry]));
    byId.set(pending.jobId, structuredClone(pending));
    return { ...project, generation: { ...project.generation, pending: Array.from(byId.values()) } };
  })),
  removePendingGeneration: (jobId) => set((state) => revise(state, (project) => {
    const pending = project.generation.pending.filter((entry) => entry.jobId !== jobId);
    return pending.length === project.generation.pending.length
      ? project
      : { ...project, generation: { ...project.generation, pending } };
  })),
  addStagedGenerations: (stages) => set((state) => revise(state, (project) => {
    if (stages.length === 0) return project;
    const byId = new Map(project.generation.staging.map((entry) => [entry.id, entry]));
    stages.forEach((stage) => byId.set(stage.id, structuredClone(stage)));
    return { ...project, generation: { ...project.generation, staging: Array.from(byId.values()) } };
  })),
  discardStagedGeneration: (stageId) => set((state) => revise(state, (project) => {
    const staging = project.generation.staging.filter((stage) => stage.id !== stageId);
    return staging.length === project.generation.staging.length
      ? project
      : { ...project, generation: { ...project.generation, staging } };
  })),
  clearStagedGenerations: () => set((state) => revise(state, (project) => (
    project.generation.staging.every((stage) => stage.pinned)
      ? project
      : { ...project, generation: { ...project.generation, staging: project.generation.staging.filter((stage) => stage.pinned) } }
  ))),
  toggleStagedGenerationPin: (stageId) => set((state) => revise(state, (project) => {
    let changed = false;
    const staging = project.generation.staging.map((stage) => {
      if (stage.id !== stageId) return stage;
      changed = true;
      return { ...stage, pinned: !stage.pinned };
    });
    return changed ? { ...project, generation: { ...project.generation, staging } } : project;
  })),
  acceptStagedGeneration: (stageId, entity) => set((state) => revise(state, (project) => {
    let changed = false;
    const staging = project.generation.staging.map((stage) => {
      if (stage.id !== stageId || stage.acceptedEntityId) return stage;
      changed = true;
      return { ...stage, acceptedEntityId: entity.id };
    });
    if (!changed) return project;
    return {
      ...project,
      entities: [...project.entities, entity],
      activeEntityId: entity.id,
      generation: { ...project.generation, staging },
    };
  })),
  markStagedGenerationAccepted: (stageId, entityId) => set((state) => revise(state, (project) => {
    let changed = false;
    const staging = project.generation.staging.map((stage) => {
      if (stage.id !== stageId || stage.acceptedEntityId === entityId) return stage;
      changed = true;
      return { ...stage, acceptedEntityId: entityId };
    });
    return changed ? { ...project, generation: { ...project.generation, staging } } : project;
  })),
  undo: () => set((state) => {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return {
      past: state.past.slice(0, -1),
      present: cloneProject(previous),
      future: [cloneProject(state.present), ...state.future.slice(0, 79)],
    };
  }),
  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return state;
    return {
      past: [...state.past.slice(-79), cloneProject(state.present)],
      present: cloneProject(next),
      future: state.future.slice(1),
    };
  }),
}));
