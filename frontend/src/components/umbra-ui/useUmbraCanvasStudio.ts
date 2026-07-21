import React from 'react';
import {
  forkUmbraCanvasDocument,
  type UmbraCanvasDocument,
} from '@/lib/umbraUiCanvasDocument';
import { saveUmbraCanvasProject } from '@/lib/umbraUiCanvasProjects';
import {
  createUmbraStudioProject,
  createUmbraStudioProjectFromCanvas,
  deleteUmbraStudioProject,
  listUmbraStudioProjects,
  loadUmbraStudioProject,
  saveUmbraStudioProject,
  type UmbraCanvasStudioArtboard,
  type UmbraCanvasStudioProject,
  type UmbraCanvasStudioProjectSummary,
  type UmbraCanvasStudioRegion,
  type UmbraCanvasStudioRegionMode,
  type UmbraCanvasStudioShelfAsset,
} from '@/lib/umbraUiStudioProjects';

const ACTIVE_STUDIO_PROJECT_KEY = 'umbra-ui:active-studio-project';
const CANVAS_STUDIO_AUTOSAVE_INTERVAL_MS = 30_000;
const CANVAS_STUDIO_ARTBOARD_HISTORY_LIMIT = 40;

interface UmbraCanvasStudioArtboardHistorySnapshot {
  projectId: string;
  artboards: UmbraCanvasStudioArtboard[];
  activeArtboardId: string;
  shelf: UmbraCanvasStudioShelfAsset[];
}

interface UmbraCanvasStudioArtboardHistoryEntry {
  label: string;
  snapshot: UmbraCanvasStudioArtboardHistorySnapshot;
}

interface UmbraCanvasStudioArtboardHistory {
  projectId: string;
  past: UmbraCanvasStudioArtboardHistoryEntry[];
  future: UmbraCanvasStudioArtboardHistoryEntry[];
}

const EMPTY_ARTBOARD_HISTORY: UmbraCanvasStudioArtboardHistory = {
  projectId: '',
  past: [],
  future: [],
};

function createArtboardHistorySnapshot(project: UmbraCanvasStudioProject): UmbraCanvasStudioArtboardHistorySnapshot {
  return {
    projectId: project.id,
    artboards: structuredClone(project.artboards),
    activeArtboardId: project.activeArtboardId,
    shelf: structuredClone(project.shelf),
  };
}

function applyArtboardHistorySnapshot(
  project: UmbraCanvasStudioProject,
  snapshot: UmbraCanvasStudioArtboardHistorySnapshot,
): UmbraCanvasStudioProject {
  if (project.id !== snapshot.projectId) return project;
  const artboards = structuredClone(snapshot.artboards);
  const documentIds = new Set(artboards.map((artboard) => artboard.documentId));
  const activeArtboardId = artboards.some((artboard) => artboard.id === snapshot.activeArtboardId)
    ? snapshot.activeArtboardId
    : artboards[0]?.id || '';
  return {
    ...project,
    artboards,
    activeArtboardId,
    shelf: structuredClone(snapshot.shelf).filter((asset) => documentIds.has(asset.documentId)),
    updatedAt: Date.now(),
  };
}

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

function artboardForDocument(project: UmbraCanvasStudioProject, documentId: string): UmbraCanvasStudioArtboard | null {
  return project.artboards.find((artboard) => artboard.documentId === documentId) || null;
}

function shelfAssetsForDocument(document: UmbraCanvasDocument, artboardId: string): UmbraCanvasStudioShelfAsset[] {
  const now = Date.now();
  const generation = structuredClone(document.generation) as unknown as Record<string, unknown>;
  const promptSegments = document.generation.promptSegments.map((segment) => ({ ...segment }));
  const assets: UmbraCanvasStudioShelfAsset[] = [];
  for (const layer of document.layers) {
    if (layer.kind === 'raster') {
      assets.push({
        id: `layer-${document.id}-${layer.id}`,
        kind: layer.role === 'source'
          ? 'source'
          : layer.role === 'generated'
          ? 'generated'
          : layer.role === 'cutout'
          ? 'cutout'
          : 'reference',
        name: layer.name,
        artboardId,
        documentId: document.id,
        layerId: layer.id,
        stageId: '',
        sourcePath: layer.asset.path,
        originalSourcePath: layer.role === 'source' ? layer.asset.path : '',
        imageUrl: layer.asset.imageUrl,
        thumbnailUrl: layer.asset.imageUrl,
        promptSegments,
        negativePrompt: document.generation.negativePrompt,
        generation,
        createdAt: layer.createdAt || now,
        updatedAt: layer.updatedAt || now,
      });
    } else if (layer.kind === 'reference' || layer.kind === 'control') {
      assets.push({
        id: `layer-${document.id}-${layer.id}`,
        kind: 'reference',
        name: layer.name,
        artboardId,
        documentId: document.id,
        layerId: layer.id,
        stageId: '',
        sourcePath: layer.asset.path,
        originalSourcePath: '',
        imageUrl: layer.asset.imageUrl,
        thumbnailUrl: layer.asset.imageUrl,
        promptSegments: [],
        negativePrompt: '',
        generation: {},
        createdAt: layer.createdAt || now,
        updatedAt: layer.updatedAt || now,
      });
    } else if (layer.kind === 'mask' && layer.dataUrl) {
      assets.push({
        id: `layer-${document.id}-${layer.id}`,
        kind: 'mask',
        name: layer.name,
        artboardId,
        documentId: document.id,
        layerId: layer.id,
        stageId: '',
        sourcePath: '',
        originalSourcePath: '',
        imageUrl: layer.dataUrl,
        thumbnailUrl: layer.dataUrl,
        promptSegments: [],
        negativePrompt: '',
        generation: {},
        createdAt: layer.createdAt || now,
        updatedAt: layer.updatedAt || now,
      });
    }
  }
  for (const stage of document.staging) {
    assets.push({
      id: `stage-${document.id}-${stage.id}`,
      kind: 'generated',
      name: stage.name,
      artboardId,
      documentId: document.id,
      layerId: '',
      stageId: stage.id,
      sourcePath: stage.galleryPath || stage.asset.path,
      originalSourcePath: '',
      imageUrl: stage.asset.imageUrl,
      thumbnailUrl: stage.asset.imageUrl,
      promptSegments,
      negativePrompt: document.generation.negativePrompt,
      generation: { ...generation, seed: stage.seed },
      createdAt: stage.createdAt || now,
      updatedAt: stage.gallerySavedAt || stage.createdAt || now,
    });
  }
  return assets;
}

export interface UseUmbraCanvasStudioOptions {
  enabled: boolean;
  document: UmbraCanvasDocument | null;
  openCanvasDocument: (documentId: string, quiet?: boolean) => Promise<boolean>;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export interface UmbraCanvasStudioArtboardPlacement {
  x?: number;
  y?: number;
  zIndex?: number;
  name?: string;
}

export interface UmbraCanvasStudioController {
  project: UmbraCanvasStudioProject | null;
  projects: UmbraCanvasStudioProjectSummary[];
  activeArtboard: UmbraCanvasStudioArtboard | null;
  activeRegion: UmbraCanvasStudioRegion | null;
  loading: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  canUndoArtboardChange: boolean;
  canRedoArtboardChange: boolean;
  refreshProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  deleteProject: () => Promise<void>;
  saveNow: () => Promise<void>;
  addCurrentArtboard: () => Promise<void>;
  attachDocumentToProject: (
    projectId: string,
    document: UmbraCanvasDocument,
    placement?: UmbraCanvasStudioArtboardPlacement,
  ) => Promise<UmbraCanvasStudioArtboard | null>;
  replaceArtboardsWithDocument: (
    document: UmbraCanvasDocument,
    artboardIds: string[],
    placement?: UmbraCanvasStudioArtboardPlacement,
    historyLabel?: string,
  ) => Promise<UmbraCanvasStudioArtboard | null>;
  duplicateCurrentArtboard: () => Promise<void>;
  deleteCurrentArtboard: () => Promise<void>;
  undoArtboardChange: () => Promise<void>;
  redoArtboardChange: () => Promise<void>;
  selectArtboard: (artboardId: string) => Promise<void>;
  renameProject: (name: string) => void;
  updateViewport: (changes: Partial<UmbraCanvasStudioProject['viewport']>) => void;
  updateArtboard: (artboardId: string, changes: Partial<Pick<UmbraCanvasStudioArtboard, 'name' | 'x' | 'y' | 'zIndex' | 'visible' | 'locked'>>) => void;
  addRegion: () => UmbraCanvasStudioRegion | null;
  selectRegion: (regionId: string) => UmbraCanvasStudioRegion | null;
  updateRegion: (regionId: string, changes: Partial<UmbraCanvasStudioRegion>) => void;
  deleteRegion: (regionId: string) => void;
}

export function useUmbraCanvasStudio({
  enabled,
  document,
  openCanvasDocument,
  showToast,
}: UseUmbraCanvasStudioOptions): UmbraCanvasStudioController {
  const [project, setProject] = React.useState<UmbraCanvasStudioProject | null>(null);
  const [projects, setProjects] = React.useState<UmbraCanvasStudioProjectSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [artboardHistory, setArtboardHistory] = React.useState<UmbraCanvasStudioArtboardHistory>(EMPTY_ARTBOARD_HISTORY);
  const dirtyVersionRef = React.useRef(0);
  const initializedRef = React.useRef(false);
  const latestProjectRef = React.useRef<UmbraCanvasStudioProject | null>(null);
  const autoSaveTimerRef = React.useRef<number | null>(null);
  const projectSaveQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const artboardHistoryRef = React.useRef(artboardHistory);
  latestProjectRef.current = project;
  artboardHistoryRef.current = artboardHistory;

  const replaceArtboardHistory = React.useCallback((next: UmbraCanvasStudioArtboardHistory) => {
    artboardHistoryRef.current = next;
    setArtboardHistory(next);
  }, []);

  const resetArtboardHistory = React.useCallback((projectId = '') => {
    replaceArtboardHistory({ ...EMPTY_ARTBOARD_HISTORY, projectId });
  }, [replaceArtboardHistory]);

  const recordArtboardChange = React.useCallback((projectSnapshot: UmbraCanvasStudioProject, label: string) => {
    const current = artboardHistoryRef.current;
    const past = current.projectId === projectSnapshot.id ? current.past : [];
    replaceArtboardHistory({
      projectId: projectSnapshot.id,
      past: [...past, { label, snapshot: createArtboardHistorySnapshot(projectSnapshot) }]
        .slice(-CANVAS_STUDIO_ARTBOARD_HISTORY_LIMIT),
      future: [],
    });
  }, [replaceArtboardHistory]);

  const clearScheduledAutoSave = React.useCallback(() => {
    if (autoSaveTimerRef.current === null) return;
    window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  }, []);

  const queueProjectSave = React.useCallback((snapshot: UmbraCanvasStudioProject) => {
    const request = projectSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveUmbraStudioProject(snapshot));
    projectSaveQueueRef.current = request.then(() => undefined, () => undefined);
    return request;
  }, []);

  const refreshProjects = React.useCallback(async () => {
    try {
      setProjects(await listUmbraStudioProjects());
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to list Canvas Studio projects.', 'error');
    }
  }, [showToast]);

  const markProject = React.useCallback((updater: (current: UmbraCanvasStudioProject) => UmbraCanvasStudioProject) => {
    dirtyVersionRef.current += 1;
    setSaveState('idle');
    setProject((current) => current ? updater(current) : current);
  }, []);

  const persist = React.useCallback(async (snapshot?: UmbraCanvasStudioProject | null) => {
    clearScheduledAutoSave();
    const candidate = snapshot || latestProjectRef.current;
    if (!candidate) return;
    const version = dirtyVersionRef.current;
    setSaveState('saving');
    try {
      const saved = await queueProjectSave(candidate);
      if (dirtyVersionRef.current === version) {
        dirtyVersionRef.current = 0;
        setProject(saved);
        setSaveState('saved');
      } else {
        setSaveState('idle');
      }
      setProjects((current) => [{
        id: saved.id,
        name: saved.name,
        artboardCount: saved.artboards.length,
        shelfCount: saved.shelf.length,
        activeArtboardId: saved.activeArtboardId,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
      }, ...current.filter((entry) => entry.id !== saved.id)]
        .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name)));
      try { window.localStorage.setItem(ACTIVE_STUDIO_PROJECT_KEY, saved.id); } catch { /* best effort */ }
    } catch (error) {
      if (dirtyVersionRef.current === version) setSaveState('error');
      showToast(error instanceof Error ? error.message : 'Failed to save the Canvas Studio project.', 'error');
    }
  }, [clearScheduledAutoSave, queueProjectSave, showToast]);

  React.useEffect(() => {
    if (!enabled || !project || dirtyVersionRef.current <= 0 || saveState === 'saving' || autoSaveTimerRef.current !== null) return;
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void persist(latestProjectRef.current);
    }, CANVAS_STUDIO_AUTOSAVE_INTERVAL_MS);
  }, [enabled, persist, project, saveState]);

  React.useEffect(() => {
    if (enabled) return;
    if (dirtyVersionRef.current > 0 && latestProjectRef.current) void persist(latestProjectRef.current);
    else clearScheduledAutoSave();
  }, [clearScheduledAutoSave, enabled, persist]);

  React.useEffect(() => () => {
    clearScheduledAutoSave();
    const candidate = latestProjectRef.current;
    if (candidate && dirtyVersionRef.current > 0) void queueProjectSave(candidate).catch(() => undefined);
  }, [clearScheduledAutoSave, queueProjectSave]);

  const openProject = React.useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    try {
      if (latestProjectRef.current && dirtyVersionRef.current > 0) await persist(latestProjectRef.current);
      const loaded = await loadUmbraStudioProject(projectId);
      const active = loaded.artboards.find((artboard) => artboard.id === loaded.activeArtboardId) || loaded.artboards[0];
      if (active && active.documentId !== document?.id && !await openCanvasDocument(active.documentId, true)) {
        throw new Error(`The artboard document for ${active.name} is unavailable.`);
      }
      setProject(loaded);
      setSaveState('saved');
      dirtyVersionRef.current = 0;
      resetArtboardHistory(loaded.id);
      try { window.localStorage.setItem(ACTIVE_STUDIO_PROJECT_KEY, loaded.id); } catch { /* best effort */ }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to open the Canvas Studio project.', 'error');
    } finally {
      setLoading(false);
    }
  }, [document?.id, openCanvasDocument, persist, resetArtboardHistory, showToast]);

  const createProject = React.useCallback(async (name = '') => {
    setLoading(true);
    try {
      if (latestProjectRef.current && dirtyVersionRef.current > 0) await persist(latestProjectRef.current);
      const persistedDocument = document ? await saveUmbraCanvasProject(document) : null;
      const next = persistedDocument
        ? createUmbraStudioProjectFromCanvas(persistedDocument, { name: name.trim() || `${persistedDocument.name} Studio` })
        : createUmbraStudioProject({ name: name.trim() || 'Untitled Studio Project' });
      const saved = await queueProjectSave(next);
      setProject(saved);
      dirtyVersionRef.current = 0;
      setSaveState('saved');
      resetArtboardHistory(saved.id);
      await refreshProjects();
      try { window.localStorage.setItem(ACTIVE_STUDIO_PROJECT_KEY, saved.id); } catch { /* best effort */ }
      showToast(`Created ${saved.name}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create the Canvas Studio project.', 'error');
    } finally {
      setLoading(false);
    }
  }, [document, persist, queueProjectSave, refreshProjects, resetArtboardHistory, showToast]);

  React.useEffect(() => {
    if (!enabled || initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      let availableProjects: UmbraCanvasStudioProjectSummary[] = [];
      try {
        availableProjects = await listUmbraStudioProjects();
        setProjects(availableProjects);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Failed to list Canvas Studio projects.', 'error');
      }
      let activeId = '';
      try { activeId = window.localStorage.getItem(ACTIVE_STUDIO_PROJECT_KEY) || ''; } catch { /* best effort */ }
      if (!availableProjects.some((entry) => entry.id === activeId)) {
        activeId = availableProjects[0]?.id || '';
      }
      if (activeId) await openProject(activeId);
      else if (document) await createProject();
    })();
  }, [createProject, document, enabled, openProject, showToast]);

  React.useEffect(() => {
    if (!enabled) return;
    void refreshProjects();
  }, [enabled, refreshProjects]);

  React.useEffect(() => {
    if (!enabled || !project || !document) return;
    const active = artboardForDocument(project, document.id);
    if (!active) return;
    const nextShelf = shelfAssetsForDocument(document, active.id);
    const retainedShelf = project.shelf.filter((asset) => asset.documentId !== document.id);
    const dimensionsChanged = active.width !== document.width || active.height !== document.height || active.name !== document.name;
    const existingSignature = project.shelf
      .filter((asset) => asset.documentId === document.id)
      .map((asset) => `${asset.id}:${asset.updatedAt}:${asset.imageUrl}`)
      .join('|');
    const nextSignature = nextShelf.map((asset) => `${asset.id}:${asset.updatedAt}:${asset.imageUrl}`).join('|');
    if (!dimensionsChanged && existingSignature === nextSignature && project.activeArtboardId === active.id) return;
    markProject((current) => ({
      ...current,
      activeArtboardId: active.id,
      artboards: current.artboards.map((artboard) => artboard.id === active.id ? {
        ...artboard,
        name: document.name,
        width: document.width,
        height: document.height,
        updatedAt: Date.now(),
      } : artboard),
      shelf: [...retainedShelf, ...nextShelf],
      updatedAt: Date.now(),
    }));
  }, [document?.height, document?.id, document?.layers, document?.name, document?.revision, document?.staging, document?.width, enabled, markProject, project]);

  const activeArtboard = React.useMemo(() => (
    project?.artboards.find((artboard) => artboard.id === project.activeArtboardId) || project?.artboards[0] || null
  ), [project]);
  const activeRegion = React.useMemo(() => (
    activeArtboard?.regions.find((region) => region.id === activeArtboard.activeRegionId) || activeArtboard?.regions[0] || null
  ), [activeArtboard]);
  const activeArtboardId = activeArtboard?.id || '';

  const addCurrentArtboard = React.useCallback(async () => {
    if (!document) {
      showToast('Open an image before adding an artboard.', 'error');
      return;
    }
    if (!project) {
      await createProject();
      return;
    }
    const persistedDocument = await saveUmbraCanvasProject(document);
    const existing = artboardForDocument(project, persistedDocument.id);
    if (existing) {
      markProject((current) => ({ ...current, activeArtboardId: existing.id, updatedAt: Date.now() }));
      return;
    }
    const id = createId('artboard');
    const next: UmbraCanvasStudioArtboard = {
      id,
      documentId: persistedDocument.id,
      name: persistedDocument.name,
      x: project.artboards.length * 96,
      y: project.artboards.length * 96,
      width: persistedDocument.width,
      height: persistedDocument.height,
      zIndex: project.artboards.length,
      visible: true,
      locked: false,
      regions: [],
      activeRegionId: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    recordArtboardChange(project, 'add artboard');
    markProject((current) => ({
      ...current,
      artboards: [...current.artboards, next],
      activeArtboardId: id,
      updatedAt: Date.now(),
    }));
  }, [createProject, document, markProject, project, recordArtboardChange, showToast]);

  const attachDocumentToProject = React.useCallback(async (
    projectId: string,
    documentSnapshot: UmbraCanvasDocument,
    placement: UmbraCanvasStudioArtboardPlacement = {},
  ): Promise<UmbraCanvasStudioArtboard | null> => {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) {
      showToast('Choose a Canvas Studio project before adding the artboard.', 'error');
      return null;
    }
    let historyBeforeChange: UmbraCanvasStudioArtboardHistory | null = null;
    clearScheduledAutoSave();
    setLoading(true);
    try {
      const persistedDocument = await saveUmbraCanvasProject(documentSnapshot);
      const currentProject = latestProjectRef.current;
      const target = currentProject?.id === normalizedProjectId
        ? currentProject
        : await loadUmbraStudioProject(normalizedProjectId);
      const existing = artboardForDocument(target, persistedDocument.id);
      const now = Date.now();
      const defaultZIndex = target.artboards.reduce((highest, candidate) => Math.max(highest, candidate.zIndex), -1) + 1;
      const artboard: UmbraCanvasStudioArtboard = {
        ...(existing || {
          id: createId('artboard'),
          documentId: persistedDocument.id,
          name: persistedDocument.name,
          x: target.artboards.length * 96,
          y: target.artboards.length * 96,
          width: persistedDocument.width,
          height: persistedDocument.height,
          zIndex: defaultZIndex,
          visible: true,
          locked: false,
          regions: [],
          activeRegionId: '',
          createdAt: now,
          updatedAt: now,
        }),
        name: String(placement.name || persistedDocument.name).trim().slice(0, 240) || persistedDocument.name,
        x: Number.isFinite(placement.x) ? Math.round(placement.x as number) : existing?.x ?? target.artboards.length * 96,
        y: Number.isFinite(placement.y) ? Math.round(placement.y as number) : existing?.y ?? target.artboards.length * 96,
        zIndex: Number.isFinite(placement.zIndex) ? Math.round(placement.zIndex as number) : existing?.zIndex ?? defaultZIndex,
        width: persistedDocument.width,
        height: persistedDocument.height,
        updatedAt: now,
      };
      const retainedShelf = target.shelf.filter((asset) => asset.documentId !== persistedDocument.id);
      const next = {
        ...target,
        artboards: existing
          ? target.artboards.map((candidate) => candidate.id === existing.id ? artboard : candidate)
          : [...target.artboards, artboard],
        activeArtboardId: artboard.id,
        shelf: [...retainedShelf, ...shelfAssetsForDocument(persistedDocument, artboard.id)],
        updatedAt: now,
      };
      if (!existing) {
        historyBeforeChange = artboardHistoryRef.current;
        recordArtboardChange(target, 'create generation canvas');
      }
      const saved = await queueProjectSave(next);
      dirtyVersionRef.current = 0;
      setProject(saved);
      setSaveState('saved');
      try { window.localStorage.setItem(ACTIVE_STUDIO_PROJECT_KEY, saved.id); } catch { /* best effort */ }
      await refreshProjects();
      return saved.artboards.find((candidate) => candidate.id === artboard.id) || artboard;
    } catch (error) {
      if (historyBeforeChange) replaceArtboardHistory(historyBeforeChange);
      setSaveState('error');
      showToast(error instanceof Error ? error.message : 'Failed to add the artboard to the Canvas Studio project.', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearScheduledAutoSave, queueProjectSave, recordArtboardChange, refreshProjects, replaceArtboardHistory, showToast]);

  const duplicateCurrentArtboard = React.useCallback(async () => {
    if (!document || !project || !activeArtboard || activeArtboard.documentId !== document.id) return;
    const fork = forkUmbraCanvasDocument(document, `${document.name} Copy`);
    const savedDocument = await saveUmbraCanvasProject(fork);
    const id = createId('artboard');
    const next: UmbraCanvasStudioArtboard = {
      ...structuredClone(activeArtboard),
      id,
      documentId: savedDocument.id,
      name: savedDocument.name,
      x: activeArtboard.x + 64,
      y: activeArtboard.y + 64,
      zIndex: Math.max(0, ...project.artboards.map((artboard) => artboard.zIndex)) + 1,
      regions: activeArtboard.regions.map((region) => ({ ...region, id: createId('region') })),
      activeRegionId: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    recordArtboardChange(project, 'duplicate artboard');
    markProject((current) => ({ ...current, artboards: [...current.artboards, next], activeArtboardId: id, updatedAt: Date.now() }));
    await openCanvasDocument(savedDocument.id, true);
    showToast('Artboard duplicated.', 'success');
  }, [activeArtboard, document, markProject, openCanvasDocument, project, recordArtboardChange, showToast]);

  const replaceArtboardsWithDocument = React.useCallback(async (
    documentSnapshot: UmbraCanvasDocument,
    artboardIds: string[],
    placement: UmbraCanvasStudioArtboardPlacement = {},
    historyLabel = 'stitch artboards',
  ): Promise<UmbraCanvasStudioArtboard | null> => {
    const ids = new Set(artboardIds.map((id) => String(id || '').trim()).filter(Boolean));
    const current = latestProjectRef.current;
    if (!current || ids.size < 2) {
      showToast('Overlap at least two visible canvases before stitching.', 'error');
      return null;
    }
    const participating = current.artboards.filter((artboard) => ids.has(artboard.id));
    if (participating.length < 2) {
      showToast('The overlapping canvases changed before they could be stitched.', 'error');
      return null;
    }
    if (participating.some((artboard) => artboard.locked)) {
      showToast('Unlock every overlapping canvas before stitching.', 'error');
      return null;
    }

    clearScheduledAutoSave();
    setLoading(true);
    setSaveState('saving');
    const historyBeforeChange = artboardHistoryRef.current;
    try {
      const persistedDocument = await saveUmbraCanvasProject(documentSnapshot);
      const now = Date.now();
      const retained = current.artboards.filter((artboard) => !ids.has(artboard.id));
      const selectedIndexes = current.artboards
        .map((artboard, index) => ids.has(artboard.id) ? index : -1)
        .filter((index) => index >= 0);
      const insertionIndex = Math.min(...selectedIndexes);
      const artboard: UmbraCanvasStudioArtboard = {
        id: createId('artboard'),
        documentId: persistedDocument.id,
        name: String(placement.name || persistedDocument.name).trim().slice(0, 240) || persistedDocument.name,
        x: Number.isFinite(placement.x) ? Math.round(placement.x as number) : 0,
        y: Number.isFinite(placement.y) ? Math.round(placement.y as number) : 0,
        width: persistedDocument.width,
        height: persistedDocument.height,
        zIndex: Number.isFinite(placement.zIndex)
          ? Math.round(placement.zIndex as number)
          : Math.max(...participating.map((candidate) => candidate.zIndex)),
        visible: true,
        locked: false,
        regions: [],
        activeRegionId: '',
        createdAt: now,
        updatedAt: now,
      };
      const artboards = [...retained];
      artboards.splice(Math.min(insertionIndex, artboards.length), 0, artboard);
      const retainedDocumentIds = new Set(retained.map((candidate) => candidate.documentId));
      const next: UmbraCanvasStudioProject = {
        ...current,
        artboards,
        activeArtboardId: artboard.id,
        shelf: [
          ...current.shelf.filter((asset) => retainedDocumentIds.has(asset.documentId)),
          ...shelfAssetsForDocument(persistedDocument, artboard.id),
        ],
        updatedAt: now,
      };

      recordArtboardChange(current, historyLabel);
      const saved = await queueProjectSave(next);
      dirtyVersionRef.current = 0;
      latestProjectRef.current = saved;
      setProject(saved);
      setSaveState('saved');
      try { window.localStorage.setItem(ACTIVE_STUDIO_PROJECT_KEY, saved.id); } catch { /* best effort */ }
      if (!await openCanvasDocument(persistedDocument.id, true)) {
        showToast('The canvases were stitched, but the new canvas could not be opened automatically.', 'error');
      }
      await refreshProjects();
      return saved.artboards.find((candidate) => candidate.id === artboard.id) || artboard;
    } catch (error) {
      replaceArtboardHistory(historyBeforeChange);
      setSaveState('error');
      showToast(error instanceof Error ? error.message : 'Failed to stitch the overlapping canvases.', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearScheduledAutoSave, openCanvasDocument, queueProjectSave, recordArtboardChange, refreshProjects, replaceArtboardHistory, showToast]);

  const restoreArtboardHistoryEntry = React.useCallback(async (
    entry: UmbraCanvasStudioArtboardHistoryEntry,
  ): Promise<boolean> => {
    const current = latestProjectRef.current;
    if (!current || current.id !== entry.snapshot.projectId) return false;
    clearScheduledAutoSave();
    setLoading(true);
    setSaveState('saving');
    try {
      const saved = await queueProjectSave(applyArtboardHistorySnapshot(current, entry.snapshot));
      dirtyVersionRef.current = 0;
      latestProjectRef.current = saved;
      setProject(saved);
      setSaveState('saved');
      const active = saved.artboards.find((artboard) => artboard.id === saved.activeArtboardId) || saved.artboards[0];
      if (active && active.documentId !== document?.id && !await openCanvasDocument(active.documentId, true)) {
        showToast(`The artboard layout was restored, but ${active.name} could not be opened.`, 'error');
      }
      await refreshProjects();
      return true;
    } catch (error) {
      setSaveState('error');
      showToast(error instanceof Error ? error.message : 'Failed to restore the Canvas Studio artboard layout.', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  }, [clearScheduledAutoSave, document?.id, openCanvasDocument, queueProjectSave, refreshProjects, showToast]);

  const undoArtboardChange = React.useCallback(async () => {
    const current = latestProjectRef.current;
    const history = artboardHistoryRef.current;
    if (!current || history.projectId !== current.id || history.past.length <= 0) return;
    const entry = history.past[history.past.length - 1];
    const currentEntry: UmbraCanvasStudioArtboardHistoryEntry = {
      label: entry.label,
      snapshot: createArtboardHistorySnapshot(current),
    };
    if (!await restoreArtboardHistoryEntry(entry)) return;
    replaceArtboardHistory({
      projectId: current.id,
      past: history.past.slice(0, -1),
      future: [...history.future, currentEntry].slice(-CANVAS_STUDIO_ARTBOARD_HISTORY_LIMIT),
    });
    showToast(`Undid ${entry.label}.`, 'success');
  }, [replaceArtboardHistory, restoreArtboardHistoryEntry, showToast]);

  const redoArtboardChange = React.useCallback(async () => {
    const current = latestProjectRef.current;
    const history = artboardHistoryRef.current;
    if (!current || history.projectId !== current.id || history.future.length <= 0) return;
    const entry = history.future[history.future.length - 1];
    const currentEntry: UmbraCanvasStudioArtboardHistoryEntry = {
      label: entry.label,
      snapshot: createArtboardHistorySnapshot(current),
    };
    if (!await restoreArtboardHistoryEntry(entry)) return;
    replaceArtboardHistory({
      projectId: current.id,
      past: [...history.past, currentEntry].slice(-CANVAS_STUDIO_ARTBOARD_HISTORY_LIMIT),
      future: history.future.slice(0, -1),
    });
    showToast(`Redid ${entry.label}.`, 'success');
  }, [replaceArtboardHistory, restoreArtboardHistoryEntry, showToast]);

  const deleteCurrentArtboard = React.useCallback(async () => {
    const current = latestProjectRef.current;
    const active = current?.artboards.find((artboard) => artboard.id === current.activeArtboardId)
      || current?.artboards[0];
    if (!current || !active) return;
    if (active.locked) {
      showToast('Unlock the artboard before deleting it.', 'error');
      return;
    }
    if (!window.confirm(`Delete ${active.name} from this Canvas Studio project? The editable document will be preserved and this can be undone.`)) return;

    const activeIndex = current.artboards.findIndex((artboard) => artboard.id === active.id);
    const artboards = current.artboards.filter((artboard) => artboard.id !== active.id);
    const nextActive = artboards[Math.min(Math.max(0, activeIndex), Math.max(0, artboards.length - 1))] || artboards[0] || null;
    const documentIds = new Set(artboards.map((artboard) => artboard.documentId));
    const next: UmbraCanvasStudioProject = {
      ...current,
      artboards,
      activeArtboardId: nextActive?.id || '',
      shelf: current.shelf.filter((asset) => documentIds.has(asset.documentId)),
      updatedAt: Date.now(),
    };

    clearScheduledAutoSave();
    setLoading(true);
    setSaveState('saving');
    const historyBeforeChange = artboardHistoryRef.current;
    recordArtboardChange(current, 'delete artboard');
    try {
      const saved = await queueProjectSave(next);
      dirtyVersionRef.current = 0;
      latestProjectRef.current = saved;
      setProject(saved);
      setSaveState('saved');
      if (nextActive && nextActive.documentId !== document?.id && !await openCanvasDocument(nextActive.documentId, true)) {
        showToast(`${active.name} was deleted, but the next artboard could not be opened.`, 'error');
      }
      await refreshProjects();
      showToast(`${active.name} deleted from the Studio project. Undo is available.`, 'success');
    } catch (error) {
      replaceArtboardHistory(historyBeforeChange);
      setSaveState('error');
      showToast(error instanceof Error ? error.message : 'Failed to delete the artboard.', 'error');
    } finally {
      setLoading(false);
    }
  }, [clearScheduledAutoSave, document?.id, openCanvasDocument, queueProjectSave, recordArtboardChange, refreshProjects, replaceArtboardHistory, showToast]);

  const selectArtboard = React.useCallback(async (artboardId: string) => {
    const artboard = project?.artboards.find((candidate) => candidate.id === artboardId);
    if (!artboard) return;
    markProject((current) => ({ ...current, activeArtboardId: artboard.id, updatedAt: Date.now() }));
    if (artboard.documentId !== document?.id) await openCanvasDocument(artboard.documentId, true);
  }, [document?.id, markProject, openCanvasDocument, project]);

  const updateArtboard: UmbraCanvasStudioController['updateArtboard'] = React.useCallback((artboardId, changes) => {
    markProject((current) => ({
      ...current,
      artboards: current.artboards.map((artboard) => artboard.id === artboardId
        ? { ...artboard, ...changes, updatedAt: Date.now() }
        : artboard),
      updatedAt: Date.now(),
    }));
  }, [markProject]);

  const renameProject = React.useCallback((name: string) => {
    const normalized = name.trim().slice(0, 240) || 'Untitled Studio Project';
    markProject((current) => ({ ...current, name: normalized, updatedAt: Date.now() }));
  }, [markProject]);

  const updateViewport = React.useCallback((changes: Partial<UmbraCanvasStudioProject['viewport']>) => {
    markProject((current) => ({
      ...current,
      viewport: { ...current.viewport, ...changes },
      updatedAt: Date.now(),
    }));
  }, [markProject]);

  const addRegion = React.useCallback((): UmbraCanvasStudioRegion | null => {
    if (!project || !activeArtboard || !document) return null;
    const id = createId('region');
    const region: UmbraCanvasStudioRegion = {
      id,
      name: `Region ${activeArtboard.regions.length + 1}`,
      mode: document.operationMode === 'outpaint' ? 'extend' : 'inpaint',
      outputMode: 'raster',
      rect: document.generationRegion || { x: 0, y: 0, width: document.width, height: document.height },
      visible: true,
      locked: false,
      targetLayerId: document.activeLayerId,
      promptSegments: document.generation.promptSegments.map((segment) => ({ ...segment })),
      activePromptSegmentId: document.generation.activePromptSegmentId,
      negativePrompt: document.generation.negativePrompt,
      generation: structuredClone(document.generation) as unknown as Record<string, unknown>,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    markProject((current) => ({
      ...current,
      artboards: current.artboards.map((artboard) => artboard.id === activeArtboard.id
        ? { ...artboard, regions: [...artboard.regions, region], activeRegionId: id, updatedAt: Date.now() }
        : artboard),
      updatedAt: Date.now(),
    }));
    return region;
  }, [activeArtboard, document, markProject, project]);

  const selectRegion = React.useCallback((regionId: string): UmbraCanvasStudioRegion | null => {
    if (!activeArtboard) return null;
    const region = activeArtboard.regions.find((candidate) => candidate.id === regionId) || null;
    if (!region) return null;
    markProject((current) => ({
      ...current,
      artboards: current.artboards.map((artboard) => artboard.id === activeArtboard.id
        ? { ...artboard, activeRegionId: region.id, updatedAt: Date.now() }
        : artboard),
      updatedAt: Date.now(),
    }));
    return region;
  }, [activeArtboard, markProject]);

  const updateRegion = React.useCallback((regionId: string, changes: Partial<UmbraCanvasStudioRegion>) => {
    if (!activeArtboardId) return;
    markProject((current) => ({
      ...current,
      artboards: current.artboards.map((artboard) => artboard.id === activeArtboardId ? {
        ...artboard,
        regions: artboard.regions.map((region) => region.id === regionId
          ? { ...region, ...changes, id: region.id, updatedAt: Date.now() }
          : region),
        updatedAt: Date.now(),
      } : artboard),
      updatedAt: Date.now(),
    }));
  }, [activeArtboardId, markProject]);

  const deleteRegion = React.useCallback((regionId: string) => {
    if (!activeArtboardId) return;
    markProject((current) => ({
      ...current,
      artboards: current.artboards.map((artboard) => {
        if (artboard.id !== activeArtboardId) return artboard;
        const regions = artboard.regions.filter((region) => region.id !== regionId);
        return {
          ...artboard,
          regions,
          activeRegionId: artboard.activeRegionId === regionId ? regions[0]?.id || '' : artboard.activeRegionId,
          updatedAt: Date.now(),
        };
      }),
      updatedAt: Date.now(),
    }));
  }, [activeArtboardId, markProject]);

  const deleteProject = React.useCallback(async () => {
    if (!project) return;
    clearScheduledAutoSave();
    await deleteUmbraStudioProject(project.id);
    setProject(null);
    dirtyVersionRef.current = 0;
    setSaveState('idle');
    resetArtboardHistory();
    try { window.localStorage.removeItem(ACTIVE_STUDIO_PROJECT_KEY); } catch { /* best effort */ }
    await refreshProjects();
    showToast('Canvas Studio project deleted. Artboard documents were preserved.', 'success');
  }, [clearScheduledAutoSave, project, refreshProjects, resetArtboardHistory, showToast]);

  return {
    project,
    projects,
    activeArtboard,
    activeRegion,
    loading,
    saveState,
    canUndoArtboardChange: artboardHistory.projectId === project?.id && artboardHistory.past.length > 0,
    canRedoArtboardChange: artboardHistory.projectId === project?.id && artboardHistory.future.length > 0,
    refreshProjects,
    createProject,
    openProject,
    deleteProject,
    saveNow: () => persist(project),
    addCurrentArtboard,
    attachDocumentToProject,
    replaceArtboardsWithDocument,
    duplicateCurrentArtboard,
    deleteCurrentArtboard,
    undoArtboardChange,
    redoArtboardChange,
    selectArtboard,
    renameProject,
    updateViewport,
    updateArtboard,
    addRegion,
    selectRegion,
    updateRegion,
    deleteRegion,
  };
}
