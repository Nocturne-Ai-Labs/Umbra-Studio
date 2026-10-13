import {exportMangaReader,exportMangaPdf} from './mangaReaderExport';
import {defaultMangaAnimation} from './mangaAnimation';
import {MediaViewerOverlay} from '@/components/ui/MediaViewerOverlay';
import {ContextMenu} from '@/components/ui/ContextMenu';
import {sendMangaImageToEditor} from './mangaEditingHandoff';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Copy, Download, Eye, EyeOff, FilePlus2, FolderOpen, ImagePlus, Layers, Lock, Unlock, LayoutTemplate, MessageCircle, MousePointer2, Plus, Redo2, Save, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { fitUmbraCanvasViewport } from '../canvas/canvasViewportMath';
import { snapUmbraCanvasLayers } from '../canvas/canvasSnapping';
import type { UmbraCanvasRect } from '../canvas/canvasModel';
import { mangaProjectAssets, MANGA_TEXT_TYPES, mangaTextType, mangaApplyTextType, type MangaTextType, duplicateMangaPanel, createMangaPanelImage, mangaInsertPanelImage, mangaMoveLayer, mangaSetLayerFrame, mangaIsPanelBackground, mangaLettering, mangaFont, isMangaSystemFont, mangaPanelPoints, mangaPanelPath, MANGA_TEMPLATE_CATEGORIES, createMangaLayer, createMangaPage, createMangaProject, duplicateMangaPage, mangaId, mangaLayerFrame, moveMangaItem, parseMangaProject, MANGA_FONTS, MANGA_TEMPLATES, type MangaLettering, type MangaAsset, type MangaBackground, type MangaBubbleShape, type MangaLayer, type MangaPage, type MangaProject } from './mangaModel';
import { MangaGenerationPanel } from './MangaGenerationPanel';
import { MangaPageArt } from './MangaPageArt';
import { MANGA_BUBBLE_SHAPES } from './mangaModel';
import { fitMangaBalloon, mangaTextLayout } from './mangaLettering';
import { mangaBalloonStyle, mangaSpikeCount } from './mangaBubbles';
import { downloadMangaBlob, exportMangaBook, exportMangaPage, importMangaAsset, mangaFilename } from './mangaExport';
import {appendMangaGeneratedOutput} from './mangaGeneratedOutput';
import { loadMangaDraft, saveMangaDraft, loadMangaSavedTarget, rememberMangaSavedTarget, clearMangaSavedTarget } from './mangaPersistence';
import { loadMangaUserFonts, listMangaSavedProjects, mangaProjectFontReferences, openMangaSavedProject, saveMangaUserProject, type MangaUserFont, type MangaSavedProject, type MangaSavedTarget } from './mangaUserFiles';

import { MANGA_ASSET_MIME, MANGA_GALLERY_MIME, MANGA_HANDOFF_EVENT, readMangaImageHandoff, acknowledgeMangaImages, loadMangaImagePath } from './mangaMediaHandoff';

type History = { present: MangaProject; past: MangaProject[]; future: MangaProject[] };
type Gesture = { id: string; mode: 'move' | 'resize' | 'tail' | 'bubble' | 'panel'; start: { x: number; y: number }; original: UmbraCanvasRect; preview: UmbraCanvasRect; rotation?: number; tail?: { x: number; y: number } };
const message = (error: unknown) => error instanceof Error ? error.message : 'The action could not be completed.';

function NumberField({ label, value, min = 0, max = 4096, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="manga-field"><span>{label}</span><input type="number" aria-label={label} value={Math.round(value * 100) / 100} min={min} max={max} step={step} onChange={event => { if (event.target.value === '') return; const number = Number(event.target.value); if (Number.isFinite(number)) onChange(Math.min(max, Math.max(min, number))); }} /></label>;
}

export function MangaStudio({ embedded = false, active = true }: { embedded?: boolean; active?: boolean }) {
  const [history, setHistory] = useState<History>(() => ({ present: createMangaProject(), past: [], future: [] }));
  const project = history.present;
  const [ready, setReady] = useState(false);
  const [storageEnabled, setStorageEnabled] = useState(true);
  const [saveStatus, setSaveStatus] = useState('Loading draft…');
  const [error, setError] = useState('');
  const [readerPreview,setReaderPreview]=useState<string|null>(null);
  const [readerWidth,setReaderWidth]=useState('100%');
  const readerDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(readerPreview!==null && readerDialog.current && !readerDialog.current.open)readerDialog.current.showModal();},[readerPreview]);
  const [viewerId,setViewerId]=useState<string|null>(null);
  const [imageMenu,setImageMenu]=useState<{asset:MangaAsset;x:number;y:number}|null>(null);
  const editTrayImage=async(asset:MangaAsset,mode:'txt2img'|'img2img'|'inpaint'|'canvas')=>{setImageMenu(null);setViewerId(null);setBusy(true);setError('');try{await sendMangaImageToEditor(asset,mode,()=>projectRef.current);}catch(error){setError(message(error));}finally{setBusy(false);}};
  useEffect(()=>{setViewerId(null);setImageMenu(null);},[project.id]);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState(project.pages[0].id);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'bubble' | 'panel'>('select');
  const [templateId, setTemplateId] = useState('three');
  const [templateCategory, setTemplateCategory] = useState('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const [imagePlacementMode, setImagePlacementMode] = useState<'layer' | 'background'>('layer');
  const [allLayers, setAllLayers] = useState(false);
  const [stripTab, setStripTab] = useState<'pages' | 'images'>('pages');
  const [dropPanelId, setDropPanelId] = useState<string | null>(null);
  const [handoffTick, setHandoffTick] = useState(0);
  const attemptedImages = useRef(new Set<string>());
  const [newBackground, setNewBackground] = useState<MangaBackground>('white');
  const [newPanelGap, setNewPanelGap] = useState(0);
  const [libraryTab, setLibraryTab] = useState<'templates' | 'effects' | 'projects' | 'generation'>('templates');
  const [userFonts, setUserFonts] = useState<MangaUserFont[]>([]);
  const [fontIssues, setFontIssues] = useState<string[]>([]);
  const [savedProjects, setSavedProjects] = useState<MangaSavedProject[]>([]);
  const [savedFilename, setSavedFilename] = useState('');
  const [savedToUser, setSavedToUser] = useState<MangaProject | null>(null);
  const savedTargets = useRef(new Map<string, MangaSavedTarget | null>());
  const fontOptions = [...MANGA_FONTS, ...userFonts.map(font => ({ value: font.id, label: font.label, i18nSkip: true })), ...(project.fonts || []).filter(font => !userFonts.some(item => item.id === font.id)).map(font => ({ value: font.id, label: `${font.filename} (missing)`, i18nSkip: true, disabled: true }))];
  const systemFonts = [...new Set(project.pages.flatMap(page => page.layers.map(layer => layer.font)).filter(isMangaSystemFont))];
  fontOptions.push(...systemFonts.map(value => ({ value, label: value.slice(12), i18nSkip: true })));
  const assets: MangaAsset[] = mangaProjectAssets(project);
  const [effectText, setEffectText] = useState('');
  const [effectFont, setEffectFont] = useState('bangers');
  const [bubbleShape, setBubbleShape] = useState<MangaBubbleShape>('manga');
  const [inverted, setInverted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 1000);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const importDestination = useRef<{ projectId: string; pageId: string; panelId: string | null; replaceId: string | null; overlay: boolean; mode: 'background' | 'overlay' } | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 800 });
  const page = project.pages.find(item => item.id === activeId) || project.pages[0];
  const activeLayer = page.layers.find(item => item.id === selectedId);
  const activePanel = page.panels.find(item => item.id === selectedId);
  const selected = activeLayer || activePanel;
  const selectedPanelId = activePanel?.id || activeLayer?.panelId || null;
  const generationPanel = page.panels.find(panel => panel.id === selectedPanelId);
  const projectRef = useRef(project); projectRef.current = project;
  const scopedLayers = !allLayers && selectedPanelId ? page.layers.filter(layer => layer.panelId === selectedPanelId) : page.layers;
  const fixedImage = !!activeLayer && mangaIsPanelBackground(activeLayer);
  const editableFrame = activeLayer ? mangaLayerFrame(activeLayer, page) : selected;
  const viewport = fitUmbraCanvasViewport({ x: 0, y: 0, width: page.width, height: page.height }, stageSize.width, stageSize.height);
  const scale = viewport.scale * zoom;
  const updateGesture = (value: Gesture | null) => { gestureRef.current = value; setGesture(value); };

  useEffect(() => {
    if (!embedded) return;
    document.documentElement.dataset.umbraMangaActive = active ? '1' : '0';
    window.dispatchEvent(new CustomEvent('umbra:manga:active', {detail:active}));
    return () => { document.documentElement.dataset.umbraMangaActive = '0'; window.dispatchEvent(new CustomEvent('umbra:manga:active', {detail:false})); };
  }, [embedded, active]);
  useEffect(() => {
    let live = true;
    Promise.all([loadMangaDraft(), loadMangaUserFonts().catch(error => ({ fonts: [] as MangaUserFont[], issues: [message(error)] })), listMangaSavedProjects().catch(() => ({ projects: [] as MangaSavedProject[], issues: [] }))]).then(async ([draft, fonts, files]) => { if (!live) return; if (draft) { const target = await loadMangaSavedTarget(draft.id).catch(() => null); if (!live) return; savedTargets.current.set(draft.id, target); setHistory({ present: draft, past: [], future: [] }); setActiveId(draft.pages[0].id); } setUserFonts(fonts.fonts); setFontIssues(fonts.issues); setSavedProjects(files.projects); setSaveStatus('Draft ready'); })
      .catch(error => { if (!live) return; setStorageEnabled(false); setError(`${message(error)} Save a project file to preserve your work.`); setSaveStatus('Save project manually'); })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!ready || !storageEnabled) return;
    let live = true;
    setSaveStatus('Saving draft…');
    const timer = setTimeout(() => { saveMangaDraft(mangaProjectFontReferences(project, userFonts)).then(() => { if (live) setSaveStatus('Draft saved locally'); }).catch(error => { if (live) { setSaveStatus('Draft save failed'); setError(`${message(error)} Save a project file before closing.`); } }); }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [project, ready, storageEnabled, userFonts]);
  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; setStageSize({ width: rect.width, height: rect.height }); });
    observer.observe(stageRef.current); return () => observer.disconnect();
  }, []);

  const change = (transform: (project: MangaProject) => MangaProject) => {
    if (!ready || busy) return;
    setHistory(current => { const next = transform(current.present); if (next === current.present) return current; return { present: next, past: [...current.past.slice(-29), current.present], future: [] }; });
  };
  const changePage = (transform: (page: MangaPage) => MangaPage, id = page.id) => change(current => ({ ...current, pages: current.pages.map(item => item.id === id ? transform(item) : item) }));
  const patchLayer = (patch: Partial<MangaLayer>) => { if (activeLayer?.locked && Object.keys(patch).some(key => key !== 'locked' && key !== 'visible')) return; changePage(current => ({ ...current, layers: current.layers.map(item => item.id === selectedId ? fitMangaBalloon({ ...item, ...patch }) : item) })); };
  const patchLettering = (patch: Partial<MangaLettering>) => { if (activeLayer) patchLayer({ lettering: { ...mangaLettering(activeLayer), ...patch }, ...('wrap' in patch || 'autoFit' in patch ? {textFit:'manual' as const} : {}) }); };
  const lettering = activeLayer ? {...mangaLettering(activeLayer), ...(activeLayer.textFit && activeLayer.textFit !== 'manual' ? {wrap:true,autoFit:activeLayer.textFit === 'text'} : {})} : null;
  const balloon = activeLayer ? mangaBalloonStyle(activeLayer) : null;
  const patchBalloon = (patch: Partial<NonNullable<MangaLayer['balloon']>>) => { if (activeLayer) patchLayer({ balloon: { ...mangaBalloonStyle(activeLayer), ...patch } }); };
  const patchTextTransform = (patch: Partial<NonNullable<MangaLayer['textTransform']>>) => { if (activeLayer) patchLayer({ textTransform: { scaleX: 1, scaleY: 1, skewX: 0, ...activeLayer.textTransform, ...patch } }); };
  const patchRect = (patch: Partial<UmbraCanvasRect>) => {
    if (activeLayer) patchLayer({...mangaSetLayerFrame(activeLayer, page, { ...mangaLayerFrame(activeLayer, page), ...patch }), ...(patch.width !== undefined ? {textFitWidth:patch.width} : {}), ...(patch.height !== undefined ? {textFit:'manual' as const} : {})});
    else changePage(current => ({ ...current, panels: current.panels.map(item => item.id === selectedId ? { ...item, ...patch } : item) }));
  };
  const undo = () => { if (busy) return; updateGesture(null); setHistory(current => current.past.length ? { present: current.past[current.past.length - 1], past: current.past.slice(0, -1), future: [current.present, ...current.future] } : current); };
  const redo = () => { if (busy) return; updateGesture(null); setHistory(current => current.future.length ? { present: current.future[0], past: [...current.past, current.present], future: current.future.slice(1) } : current); };
  const removeSelected = () => { if (activeLayer?.locked) return; changePage(current => ({ ...current, panels: current.panels.filter(item => item.id !== selectedId), layers: current.layers.filter(item => item.id !== selectedId).map(layer => ({ ...(layer.panelId === selectedId ? { ...layer, ...mangaLayerFrame(layer, current), panelId: null, placement: undefined } : layer), ...(layer.clipPanelId === selectedId ? { clipPanelId: undefined } : {}) })) })); };
  const addPage = () => { if (project.pages.length >= 100) { setError('This prototype supports up to 100 pages per project.'); return; } const next = createMangaPage(templateId, `Page ${project.pages.length + 1}`, newBackground, newPanelGap); change(current => ({ ...current, pages: [...current.pages, next] })); setActiveId(next.id); setSelectedId(null); setZoom(1); };
  const choosePage = (id: string) => { setEditingTextId(null); setActiveId(id); setSelectedId(null); updateGesture(null); setZoom(1); };
  const refreshFonts = async () => {
    setBusy(true); setError('');
    try { const result = await loadMangaUserFonts(); setUserFonts(result.fonts); setFontIssues(result.issues); setHistory(current => ({ ...current, present: { ...current.present } })); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  };
  const refreshProjects = async () => {
    try { const result = await listMangaSavedProjects(); setSavedProjects(result.projects); if (result.issues.length) setError(result.issues.join('\n')); }
    catch (error) { setError(message(error)); }
  };
  const saveUserProject = async () => {
    setBusy(true); setError('');
    try {
      const previous = savedTargets.current.has(project.id) ? savedTargets.current.get(project.id) || null : null;
      const target = await saveMangaUserProject(mangaProjectFontReferences(project, userFonts), previous);
      savedTargets.current.set(project.id, target); setSavedToUser(project); setSavedFilename(target.filename);
      await saveMangaDraft(mangaProjectFontReferences(project, userFonts)).catch(() => setError('Project saved in User/MangaStudio/Projects, but the browser draft could not be updated. Reopen it from Projects after refreshing.'));
      await rememberMangaSavedTarget(target).catch(() => setError('Project saved to User/MangaStudio/Projects. Browser revision caching is unavailable; reopen it from Projects before your next session.'));
      await refreshProjects();
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  };
  const openUserProject = async () => {
    if (!savedFilename) return;
    setBusy(true); setError('');
    try { const result = await openMangaSavedProject(savedFilename); savedTargets.current.set(result.project.id, result.target); await rememberMangaSavedTarget(result.target).catch(() => undefined); await saveMangaDraft(result.project).catch(() => setError('Saved project opened, but the browser draft could not be updated.')); setHistory(current => ({ present: result.project, past: [...current.past.slice(-29), current.present], future: [] })); setSavedToUser(result.project); choosePage(result.project.pages[0].id); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  };
  const addEffect = (text: string) => {
    if (!text.trim()) return;
    if (page.layers.length >= 500) { setError('This prototype supports up to 500 layers per page.'); return; }
    const effect = { ...createMangaLayer('sfx', { x: page.width * .18, y: page.height * .2, width: page.width * .55, height: page.height * .18 }, text), font: effectFont };
    changePage(current => ({ ...current, layers: [...current.layers, effect] })); setSelectedId(effect.id); setTool('select'); setRightOpen(true);
  };
  const requestImage = (overlay = false, replace = false, mode: 'background' | 'overlay' = imagePlacementMode === 'background' ? 'background' : 'overlay') => {
    if (replace && activeLayer?.locked) { setError('Unlock this layer before replacing its art.'); return; }
    const panelId = activePanel?.id || activeLayer?.panelId || null;
    if (!replace && mode === 'background' && page.layers.some(layer => layer.panelId === panelId && mangaIsPanelBackground(layer) && layer.locked)) { setError('Unlock the background layer before replacing it.'); return; }
    importDestination.current = { projectId: project.id, pageId: page.id, panelId: activePanel?.id || activeLayer?.panelId || null, replaceId: replace && activeLayer?.kind === 'image' ? activeLayer.id : null, overlay, mode };
    imageInput.current?.click();
  };
  const receiveImage = async (file: File) => {
    const destination = importDestination.current;
    if (!destination) return;
    setBusy(true); setError('');
    try {
      const imported = await importMangaAsset(file), imageUrl = imported.imageUrl;
      if (assets.length >= 500 && !assets.some(item => item.imageUrl === imageUrl)) throw new Error('This project already has 500 tray images.');
      if (new Blob([JSON.stringify(project)]).size + imageUrl.length * 2 > 100_000_000) throw new Error('This project exceeds 100 MB. Import smaller art or start another book.');
      const target = project.pages.find(item => item.id === destination.pageId);
      if (project.id !== destination.projectId || !target) return;
      const panel = destination.overlay ? null : target.panels.find(item => item.id === destination.panelId);
      const existing = target.layers.find(item => item.id === destination.replaceId);
      if (existing?.locked) throw new Error('Unlock this layer before replacing its art.');
      const asset = assets.find(item => item.imageUrl === imageUrl) || imported;
      const nextAssets = assets.some(item => item.id === asset.id) ? assets : [...assets, asset];
      const layer = existing ? { ...existing, imageUrl, name: asset.name, provenance:asset.provenance,animation:asset.animation } : panel ? createMangaPanelImage(asset, panel, destination.mode) : { ...createMangaLayer('image', { x: 120, y: 120, width: 600, height: 600 }), name: asset.name, imageUrl, provenance:asset.provenance,animation:asset.animation, imageFit: 'contain' as const };
      const nextPage = existing ? { ...target, layers: target.layers.map(item => item.id === existing.id ? layer : item) } : panel ? mangaInsertPanelImage(target, layer) : { ...target, layers: [...target.layers, layer] };
      if (nextPage.layers.length > 500) throw new Error('This page already has 500 layers.');
      const next = { ...project, assets: nextAssets, pages: project.pages.map(item => item.id === target.id ? nextPage : item) };
      if (new Blob([JSON.stringify(next)]).size > 100_000_000) throw new Error('This project exceeds 100 MB. Use smaller art or start another book.');
      setHistory(current => ({ present: next, past: [...current.past.slice(-29), current.present], future: [] }));
      setSelectedId(layer.id);
      setTool('select'); setRightOpen(true);
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  };
  const placeAsset = (asset: MangaAsset, panelId: string) => {
    const panel = page.panels.find(item => item.id === panelId); if (!panel) return;
    try {
      const layer = createMangaPanelImage(asset, panel, imagePlacementMode === 'background' ? 'background' : 'overlay');
      const nextPage = mangaInsertPanelImage(page, layer);
      const nextProject = { ...project, pages: project.pages.map(item => item.id === page.id ? nextPage : item) };
      if (new Blob([JSON.stringify(nextProject)]).size > 100_000_000) throw new Error('This project exceeds 100 MB. Use smaller art or start another book.');
      change(() => nextProject); setSelectedId(layer.id); setRightOpen(true); setTool('select');
    } catch (error) { setError(message(error)); }
  };
  const changeImageRole = (mode: 'background' | 'overlay') => {
    if (!activeLayer || activeLayer.locked) return;
    try {
      const panel = page.panels.find(item => item.id === activeLayer.panelId);
      const layer = mode === 'background' && panel ? { ...activeLayer, imageMode: mode, placement: undefined, rotation: 0, ...mangaLayerFrame({ ...activeLayer, imageMode: mode }, page) } : mangaSetLayerFrame({ ...activeLayer, imageMode: mode }, page, mangaLayerFrame(activeLayer, page));
      changePage(current => mangaInsertPanelImage(current, layer));
    } catch (error) { setError(message(error)); }
  };
  const importToTray = async (files: Array<File | string>, panelId?: string) => {
    setBusy(true); setError('');
    try {
      if (panelId && imagePlacementMode === 'background' && page.layers.some(layer => layer.panelId === panelId && mangaIsPanelBackground(layer) && layer.locked)) throw new Error('Unlock the background layer before replacing it.');
      if (assets.length + files.length > 500) throw new Error('This project supports up to 500 tray images.');
      const imported: MangaAsset[] = [];
      let imageBytes = assets.reduce((size, item) => size + item.imageUrl.length, 0);
      for (const source of files) { const file = typeof source === 'string' ? await loadMangaImagePath(source) : source; const asset=await importMangaAsset(file,typeof source === 'string' ? source : undefined); const imageUrl=asset.imageUrl; imageBytes += imageUrl.length; if (imageBytes > 100_000_000) throw new Error('These images exceed 100 MB. Import a smaller batch.'); imported.push(asset); }
      if (!imported.length) return;
      if (assets.length + imported.length > 500) throw new Error('This project supports up to 500 tray images.');
      const panel = page.panels.find(item => item.id === panelId);
      const layer = panel ? createMangaPanelImage(imported[0], panel, imagePlacementMode === 'background' ? 'background' : 'overlay') : null;
      const next = { ...project, assets: [...assets, ...imported], pages: project.pages.map(item => layer && item.id === page.id ? mangaInsertPanelImage(item, layer) : item) };
      if (new Blob([JSON.stringify(next)]).size > 100_000_000) throw new Error('This project exceeds 100 MB. Use smaller images or start another book.');
      await saveMangaDraft(next);
      setHistory(current => ({ present: next, past: [...current.past.slice(-29), current.present], future: [] }));
      if (layer) setSelectedId(layer.id); setStripTab('images');
    } catch (error) { setError(message(error)); throw error; } finally { setBusy(false); }
  };
  useEffect(() => {
    const onRequest = () => setHandoffTick(value => value + 1);
    window.addEventListener(MANGA_HANDOFF_EVENT, onRequest);
    return () => window.removeEventListener(MANGA_HANDOFF_EVENT, onRequest);
  }, []);
  useEffect(() => {
    if (!active || !ready || busy) return;
    const pending = readMangaImageHandoff().filter(item => !attemptedImages.current.has(item.id));
    if (!pending.length) return;
    pending.forEach(item => attemptedImages.current.add(item.id));
    // Import serially and acknowledge only after the draft has been persisted.
    void (async () => {
      setBusy(true);
      try {
        await importToTray(pending.map(item => item.path)); acknowledgeMangaImages(pending.map(item => item.id));
      } catch (error) { setError(`${message(error)} The images remain queued; use Retry image import.`); }
      finally { setBusy(false); }
    })();
  }, [active, ready, busy, handoffTick]);
  const panelAt = (event: React.DragEvent) => {
    const matrix = svgRef.current?.getScreenCTM(); if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [...page.panels].reverse().find(panel => {
      const x = point.x, y = point.y;
      const points = mangaPanelPoints(panel, (page.panelGap || 0) / 2); let inside = false;
      for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
        const xi = points[i], yi = points[i+1], xj = points[j], yj = points[j+1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }) || null;
  };
  const acceptsDrop = (transfer: DataTransfer) => [MANGA_ASSET_MIME, MANGA_GALLERY_MIME, 'Files'].some(type => transfer.types.includes(type));
  const dropImage = async (event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault(); event.stopPropagation(); setDropPanelId(null);
    if (busy || !ready) return;
    const panel = panelAt(event); if (!panel) { setError('Drop the image inside a panel.'); return; }
    try {
      const internal = event.dataTransfer.getData(MANGA_ASSET_MIME);
      if (internal) { const value = JSON.parse(internal); const asset = assets.find(item => item.id === value.assetId); if (!asset || value.projectId !== project.id) throw new Error('Choose an image from this project’s tray.'); placeAsset(asset, panel.id); return; }
      const paths = event.dataTransfer.getData(MANGA_GALLERY_MIME);
      if (paths) { const values = JSON.parse(paths); const list = Array.isArray(values) ? values : values.paths; if (!Array.isArray(list) || list.length !== 1 || typeof list[0] !== 'string') throw new Error('Drop one image onto a panel.'); await importToTray([list[0]], panel.id); return; }
      const files = [...event.dataTransfer.files]; if (files.length !== 1) throw new Error('Drop one image onto a panel.'); await importToTray(files, panel.id);
    } catch (error) { setError(message(error)); }
  };
  const receiveProject = async (file: File) => {
    setBusy(true); setError('');
    try {
      if (file.size > 100_000_000) throw new Error('This prototype supports project files up to 100 MB.');
      const next = parseMangaProject(JSON.parse(await file.text()));
      savedTargets.current.set(next.id, null);
      await clearMangaSavedTarget(next.id).catch(() => undefined);
      await saveMangaDraft(next).catch(() => setError('Project imported, but the browser draft could not be updated. Save it to the User folder.'));
      setHistory(current => ({ present: next, past: [...current.past.slice(-29), current.present], future: [] })); choosePage(next.pages[0].id);
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  };
  const exportArt = async (book: boolean) => {
    setBusy(true); setError('');
    try { downloadMangaBlob(book ? await exportMangaBook(project) : await exportMangaPage(page), `${mangaFilename(book ? project.name : page.name)}.${book ? 'zip' : 'png'}`); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  };
  const exportBook=async(format:'html'|'pdf'|'preview')=>{
    setBusy(true);setError('');
    try{const blob=format==='pdf' ? await exportMangaPdf(project) : await exportMangaReader(project);if(format==='preview')setReaderPreview(await blob.text());else downloadMangaBlob(blob,`${mangaFilename(project.name)}.${format}`);}catch(error){setError(message(error));}finally{setBusy(false);}
  };
  const point = (event: React.PointerEvent) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.max(0, Math.min(page.width, position.x)), y: Math.max(0, Math.min(page.height, position.y)) };
  };
  const startGesture = (id: string, event: React.PointerEvent, mode: Gesture['mode'] = 'move') => {
    if (busy || !ready || event.button !== 0 || tool !== 'select') return;
    event.stopPropagation(); event.preventDefault();
    stageRef.current?.focus({ preventScroll: true });
    const layer = page.layers.find(item => item.id === id);
    const item = layer ? mangaLayerFrame(layer, page) : page.panels.find(item => item.id === id); if (!item) return;
    setSelectedId(id);
    // Panel art is cropped in place; select it without moving its panel by accident.
    if (layer?.locked || layer && mangaIsPanelBackground(layer)) { setRightOpen(true); return; }
    svgRef.current?.setPointerCapture(event.pointerId);
    updateGesture({ id, mode, start: point(event), original: item, preview: item, rotation: layer?.rotation || 0 });
  };
  const beginDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (busy || !ready || event.button !== 0) return;
    if (tool === 'select') { setSelectedId(null); return; }
    event.preventDefault(); stageRef.current?.focus({ preventScroll: true }); const start = point(event); event.currentTarget.setPointerCapture(event.pointerId);
    const rect = { ...start, width: 8, height: 8 }; updateGesture({ id: mangaId(), mode: tool, start, original: rect, preview: rect });
  };
  const movePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = gestureRef.current; if (!current) return;
    const cursor = point(event); const dx = cursor.x - current.start.x, dy = cursor.y - current.start.y;
    let preview = current.preview, tail = current.tail;
    if (current.mode === 'bubble' || current.mode === 'panel') preview = { x: Math.min(cursor.x, current.start.x), y: Math.min(cursor.y, current.start.y), width: Math.max(8, Math.abs(dx)), height: Math.max(8, Math.abs(dy)) };
    else if (current.mode === 'resize') {
      const angle = (current.rotation || 0) * Math.PI / 180;
      const localX = Math.cos(angle) * dx + Math.sin(angle) * dy, localY = -Math.sin(angle) * dx + Math.cos(angle) * dy;
      const width = Math.max(32, Math.min(4096, current.original.width + localX)), height = Math.max(32, Math.min(4096, current.original.height + localY));
      const dw = width - current.original.width, dh = height - current.original.height;
      preview = { x: Math.max(0, current.original.x + (Math.cos(angle) * dw - Math.sin(angle) * dh - dw) / 2), y: Math.max(0, current.original.y + (Math.sin(angle) * dw + Math.cos(angle) * dh - dh) / 2), width, height };
    }
    else if (current.mode === 'tail') {
      const angle = -(current.rotation || 0) * Math.PI / 180;
      const x = cursor.x - current.original.x - current.original.width / 2, y = cursor.y - current.original.y - current.original.height / 2;
      tail = { x: Math.cos(angle) * x - Math.sin(angle) * y + current.original.width / 2, y: Math.sin(angle) * x + Math.cos(angle) * y + current.original.height / 2 };
    }
    else {
      const candidate = { ...current.original, x: current.original.x + dx, y: current.original.y + dy };
      const snaps = event.altKey ? { xDelta: 0, yDelta: 0 } : snapUmbraCanvasLayers(candidate, page.panels.filter(item => item.id !== current.id), candidate, scale);
      preview = { ...candidate, x: Math.max(0, Math.min(page.width - Math.min(candidate.width, page.width), candidate.x + snaps.xDelta)), y: Math.max(0, Math.min(page.height - Math.min(candidate.height, page.height), candidate.y + snaps.yDelta)) };
    }
    updateGesture({ ...current, preview, tail });
  };
  const finishGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = gestureRef.current; if (!current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    updateGesture(null);
    if (current.mode === 'bubble' || current.mode === 'panel') {
      if (current.preview.width < 32 || current.preview.height < 32) return;
      if (current.mode === 'panel' && page.panels.length >= 100 || current.mode === 'bubble' && page.layers.length >= 500) { setError('This prototype supports 100 panels and 500 layers per page.'); return; }
      if (current.mode === 'panel') changePage(page => ({ ...page, panels: [...page.panels, { ...current.preview, id: current.id }] }));
      else {
        const base = createMangaLayer('bubble', current.preview, 'Your dialogue');
        const layer = { ...base, id: current.id, shape: bubbleShape, inverted, balloon: mangaBalloonStyle(base) };
        changePage(page => ({ ...page, layers: [...page.layers, layer] }));
      }
      setSelectedId(current.id); setTool('select'); setRightOpen(true); return;
    }
    changePage(page => ({ ...page, panels: page.panels.map(item => item.id === current.id ? { ...item, ...current.preview } : item), layers: page.layers.map(item => item.id === current.id ? { ...mangaSetLayerFrame(item, page, current.preview), ...(current.tail ? { tailX: current.tail.x, tailY: current.tail.y } : {}), ...(current.mode === 'resize' && item.textFit === 'balloon' ? {textFit:'manual' as const,textFitWidth:current.preview.width} : {}) } : item) }));
  };
  let previewPage = page;
  if (gesture && !['bubble', 'panel'].includes(gesture.mode)) previewPage = { ...page, panels: page.panels.map(item => item.id === gesture.id ? { ...item, ...gesture.preview } : item), layers: page.layers.map(item => item.id === gesture.id ? { ...mangaSetLayerFrame(item, page, gesture.preview), ...(gesture.tail ? { tailX: gesture.tail.x, tailY: gesture.tail.y } : {}) } : item) };
  const previewLayer = previewPage.layers.find(item => item.id === selectedId);
  const selectedFrame = selected ? previewLayer ? mangaLayerFrame(previewLayer, previewPage) : gesture?.id === selectedId ? gesture.preview : selected : null;
  const isPhoneRemote = document.documentElement.dataset.umbraRemoteMode === 'phone' || new URLSearchParams(window.location.search).get('remoteMode') === 'phone';

  if (isPhoneRemote) return <div className="manga-unavailable"><BookOpen size={32} /><h1>Manga Studio</h1><p>Page editing is available on desktop and tablet.</p><a href="/">Return to Umbra</a></div>;
  return <main className={`manga-studio${embedded ? ' manga-embedded' : ''}`} data-manga-studio="" onKeyDown={event => {
    if(viewerId || readerPreview!==null)return;
    if (event.defaultPrevented) return;
    if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
    if (event.key === 'Escape') { updateGesture(null); setSelectedId(null); setTool('select'); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); removeSelected(); }
    if (selected && !busy && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && !fixedImage && !activeLayer?.locked) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; patchRect({ x: Math.max(0, editableFrame!.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)), y: Math.max(0, editableFrame!.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)) }); }
  }}>
    <fieldset disabled={busy || !ready} className="manga-controls">
      <header className="manga-header glass-panel">
        {!embedded && <a href="/" className="manga-back" aria-label="Return to Umbra"><ArrowLeft size={16} /></a>}<BookOpen size={20} /><h1>Manga Studio <small>Experimental</small></h1>
        <input className="manga-project-name" aria-label="Manga project name" value={project.name} maxLength={200} onChange={event => change(current => ({ ...current, name: event.target.value }))} />
        <div className="manga-header-actions">
          <button aria-label="New manga project" title="New project (undo restores current work)" onClick={() => { const next = createMangaProject(); change(() => next); choosePage(next.pages[0].id); }}><FilePlus2 size={16} /></button>
          <button aria-label="Open manga projects" title="Saved projects" onClick={() => { setLeftOpen(true); setLibraryTab('projects'); void refreshProjects(); }}><FolderOpen size={16} /></button>
          <button aria-label="Save project" onClick={() => void saveUserProject()}><Save size={15} /><span>Save project</span></button>
          <button aria-label="Download project" title="Download portable project copy" onClick={() => { const file = new Blob([JSON.stringify(mangaProjectFontReferences(project, userFonts))], { type: 'application/json' }); if (file.size > 100_000_000) { setError('This prototype supports project files up to 100 MB. Split this book into smaller projects.'); return; } downloadMangaBlob(file, `${mangaFilename(project.name)}.umbra-manga.json`); }}><Download size={15} /></button>
          <button aria-label="Page PNG" onClick={() => void exportArt(false)}><Download size={15} /><span>Page PNG</span></button>
          <button aria-label="Preview reader" onClick={()=>void exportBook('preview')}><Eye size={15} /><span>Preview reader</span></button>
          <button aria-label="Manga HTML" onClick={()=>void exportBook('html')}><Download size={15} /><span>Manga HTML</span></button>
          <button aria-label="Manga PDF" onClick={()=>void exportBook('pdf')}><Download size={15} /><span>Manga PDF</span></button>
          <button aria-label="Book ZIP" onClick={() => void exportArt(true)}><Download size={15} /><span>Book ZIP</span></button>
        </div>
      </header>
      <div className="manga-toolbar glass-panel">
        <button aria-label="Show template and effects library" aria-expanded={leftOpen} onClick={() => setLeftOpen(value => !value)}><LayoutTemplate size={16} /></button>
        <button className={tool === 'select' ? 'active' : ''} aria-pressed={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={15} />Select</button>
        <button className={tool === 'panel' ? 'active' : ''} aria-pressed={tool === 'panel'} onClick={() => setTool('panel')}><Plus size={15} />Draw panel</button>
        <button className={tool === 'bubble' ? 'active' : ''} aria-pressed={tool === 'bubble'} onClick={() => setTool('bubble')}><MessageCircle size={15} />Draw bubble</button>
        <button onClick={() => requestImage()}><ImagePlus size={15} />Import art</button>
        <UmbraSelect ariaLabel="Image placement" value={imagePlacementMode} onValueChange={value => setImagePlacementMode(value as 'layer' | 'background')} options={[{value:'layer',label:'Add image layer'},{value:'background',label:'Replace background'}]} />
        <span className="manga-toolbar-divider" />
        <button aria-label="Undo manga edit" disabled={!history.past.length} onClick={undo}><Undo2 size={16} /></button>
        <button aria-label="Redo manga edit" disabled={!history.future.length} onClick={redo}><Redo2 size={16} /></button>
        <button aria-label="Zoom out" onClick={() => setZoom(value => Math.max(.5, value - .25))}><ZoomOut size={16} /></button>
        <button onClick={() => setZoom(1)} title="Fit page">{Math.round(scale * 100)}%</button>
        <button aria-label="Zoom in" onClick={() => setZoom(value => Math.min(3, value + .25))}><ZoomIn size={16} /></button>
        <button className="manga-inspector-toggle" aria-label="Show manga inspector" aria-expanded={rightOpen} onClick={() => setRightOpen(value => !value)}><Layers size={16} />Inspector</button>
      </div>
      <div className="manga-body" data-library-open={leftOpen} data-inspector-open={rightOpen} data-generation-open={libraryTab === 'generation'}>
        <aside style={{display:leftOpen ? undefined : 'none'}} className="manga-library glass-panel" aria-label="Manga page library">
          <div className="manga-tabs"><button className={libraryTab === 'generation' ? 'active' : ''} onClick={() => setLibraryTab('generation')}>Generate scene</button><button className={libraryTab === 'templates' ? 'active' : ''} onClick={() => setLibraryTab('templates')}>Templates</button><button className={libraryTab === 'effects' ? 'active' : ''} onClick={() => setLibraryTab('effects')}>Sound effects</button><button className={libraryTab === 'projects' ? 'active' : ''} onClick={() => { setLibraryTab('projects'); void refreshProjects(); }}>Projects</button></div>
          <div className="manga-panel-content">
            <MangaGenerationPanel project={project} frame={generationPanel || null} hidden={libraryTab !== 'generation'} disabled={!ready || busy} onSubmitting={setBusy} onForget={requestId => change(current => ({...current,generationRequests:current.generationRequests?.filter(item => item.requestId !== requestId)}))} onSettings={generation => change(current => ({...current,generation}))} onQueued={(projectId,requestId) => setHistory(current => current.present.id !== projectId ? current : {...current,present:{...current.present,generationRequests:[...(current.present.generationRequests || []).slice(-99),{requestId,received:[]}]}})} onOutputs={async (projectId,requestId,paths) => {
              for (const path of paths.slice(0,8)) {
                if (projectRef.current.id !== projectId) return;
                const current = projectRef.current, request = current.generationRequests?.find(item => item.requestId === requestId);
                if (!request || request.received.includes(path)) continue;
                if (mangaProjectAssets(current).length >= 500) throw new Error('The image tray is full. Remove an image to recover more generated options.');
                const file = await loadMangaImagePath(path), asset = await importMangaAsset(file,path);
                const admission=appendMangaGeneratedOutput(projectRef.current,projectId,requestId,path,asset);
                if(admission.error)throw new Error(admission.error);
                setHistory(current => {
                  const result=appendMangaGeneratedOutput(current.present,projectId,requestId,path,asset);
                  if(result.error){queueMicrotask(()=>setError(result.error!));return current;}
                  return result.project===current.present ? current : {...current,present:result.project};
                });
              }
            }} />
            {libraryTab === 'templates' ? <>
              <label className="manga-field"><span>New page background</span><UmbraSelect value={newBackground} onValueChange={value => setNewBackground(value as MangaBackground)} ariaLabel="New page background" options={[{ value: 'white', label: 'White paper' }, { value: 'transparent', label: 'Transparent + borders' }]} /></label>
              <div className="manga-field"><span>New page panel spacing</span><UmbraSelect ariaLabel="New page panel spacing" value={newPanelGap > 0 ? 'gapped' : 'none'} onValueChange={value => setNewPanelGap(value === 'gapped' ? 24 : 0)} options={[{ value: 'none', label: 'No added gap' }, { value: 'gapped', label: 'Separated panels' }]} /></div>
              {newPanelGap > 0 && <NumberField label="New page panel gap (px)" min={0} max={4096} value={newPanelGap} onChange={setNewPanelGap} />}
              <UmbraSelect ariaLabel="Template category" value={templateCategory} onValueChange={setTemplateCategory} options={[{value:'all',label:'All layouts'}, ...MANGA_TEMPLATE_CATEGORIES.map(value => ({value,label:value}))]} />
              <input aria-label="Search manga layouts" placeholder="Search layouts…" value={templateSearch} onChange={event => setTemplateSearch(event.target.value)} />
              <div className="manga-template-grid">{MANGA_TEMPLATES.filter(item => (templateCategory === 'all' || item.category === templateCategory) && item.name.toLowerCase().includes(templateSearch.toLowerCase())).map(template => <button key={template.id} aria-label={`Template: ${template.name}`} aria-pressed={templateId === template.id} className={templateId === template.id ? 'active' : ''} onClick={() => setTemplateId(template.id)}>
                <svg viewBox="0 0 100 145" aria-hidden="true"><rect width="100" height="145" fill="white" />{template.boxes.map(([x, y, w, h], index) => <path key={index} d={mangaPanelPath({ id: String(index), x: 8 + x * 84, y: 8 + y * 129, width: w * 84, height: h * 129, points: template.shapes?.[index] }, false, newPanelGap / 24)} fill="#eeeeee" stroke="#111" strokeWidth={1.5} />)}</svg><span>{template.name}</span>
              </button>)}</div>
              <button className="manga-wide" onClick={addPage}><Plus size={16} />Add page with template</button>
              <button className="manga-wide" disabled={page.layers.length > 0} onClick={() => { const replacement = createMangaPage(templateId, page.name, newBackground); changePage(current => ({ ...replacement, id: current.id })); setSelectedId(null); }}>Apply to empty page</button>
              <p className="manga-hint">Select a panel, then import art. Draw or resize panels to fit each scene.</p>
            </> : libraryTab === 'effects' ? <>
              <label className="manga-field"><span>Sound effect text</span><textarea aria-label="Sound effect text" placeholder="Type your sound effect…" rows={3} value={effectText} onChange={event => setEffectText(event.target.value)} /></label>
              <label className="manga-field"><span>Font</span><UmbraSelect ariaLabel="Sound effect font" value={effectFont} options={fontOptions} onValueChange={setEffectFont} /></label>
              <button className="manga-wide" onClick={() => void refreshFonts()}>Refresh fonts</button><p className="manga-hint">Add TTF, OTF, WOFF or WOFF2 files to User/Fonts.</p>
              {fontIssues.length > 0 && <p role="status" className="manga-hint">{fontIssues.join('\n')}</p>}
              <button className="manga-wide" disabled={!effectText.trim()} onClick={() => addEffect(effectText)}><Plus size={16} />Add sound effect</button>
            </> : libraryTab === 'projects' ? <>
              <p className="manga-hint">User/MangaStudio/Projects</p>
              <UmbraSelect ariaLabel="Saved manga project" value={savedFilename} placeholder="Choose a saved project" disabled={!savedProjects.length} options={savedProjects.map(item => ({ value: item.filename, label: item.name, i18nSkip: true, description: `${item.pages} pages · ${item.filename}` }))} onValueChange={setSavedFilename} />
              <button className="manga-wide" disabled={!savedFilename} onClick={() => void openUserProject()}>Open saved project</button>
              <button className="manga-wide" onClick={() => void refreshProjects()}>Refresh projects</button>
              <button className="manga-wide" onClick={() => projectInput.current?.click()}>Import project file</button>
              <button className="manga-wide" onClick={() => { const copy = { ...project, generationRequests:undefined, id: mangaId(), name: `${project.name.slice(0, 190)} copy` }; change(() => copy); setSavedToUser(null); }}>New project copy</button>
            </> : null}
            {libraryTab === 'templates' && <><div className="manga-section-heading">Bubble defaults</div>
            <UmbraSelect value={bubbleShape} onValueChange={value => setBubbleShape(value as MangaBubbleShape)} ariaLabel="New bubble shape" options={MANGA_BUBBLE_SHAPES} />
            <label className="manga-check"><input type="checkbox" checked={inverted} onChange={event => setInverted(event.target.checked)} />Black bubble / white text</label></>}
          </div>
        </aside>
        <section className="manga-stage" ref={stageRef} aria-label="Manga page editor" tabIndex={0} style={{ pointerEvents: busy || !ready ? 'none' : undefined }}>
          <div className="manga-page-surround" style={{ width: page.width * scale, height: page.height * scale }}>
            <svg ref={svgRef} data-manga-page="" className="manga-page" width={page.width * scale} height={page.height * scale} viewBox={`0 0 ${page.width} ${page.height}`} role="img" aria-label={`Editing ${page.name}`} onPointerDown={beginDrawing} onPointerMove={movePointer} onPointerUp={finishGesture} onPointerCancel={() => updateGesture(null)} onDragOver={event => { if (!acceptsDrop(event.dataTransfer) || busy) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setDropPanelId(panelAt(event)?.id || null); }} onDragLeave={() => setDropPanelId(null)} onDrop={event => void dropImage(event)} style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}>
              <MangaPageArt page={previewPage} prefix="editor" onSelect={(id, event) => { if (editingTextId !== id) setEditingTextId(null); startGesture(id, event); }} onEditText={id => { setSelectedId(id); setEditingTextId(id); updateGesture(null); }} selectedId={selectedId} drawMode={tool !== 'select'} />
              {editingTextId === activeLayer?.id && activeLayer && !activeLayer.locked && <foreignObject x={activeLayer.x} y={activeLayer.y} width={activeLayer.width} height={activeLayer.height} transform={`rotate(${activeLayer.rotation} ${activeLayer.x + activeLayer.width / 2} ${activeLayer.y + activeLayer.height / 2})`}>
                <textarea autoFocus aria-label="Edit lettering on page" value={activeLayer.text} onChange={event => patchLayer({text:event.target.value})} onBlur={() => setEditingTextId(null)} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape' || event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); setEditingTextId(null); } }} style={{width:'100%',height:'100%',resize:'none',boxSizing:'border-box',padding:`${(activeLayer.balloon?.padding ?? .16) * Math.min(activeLayer.width,activeLayer.height)}px`,fontSize:mangaTextLayout(activeLayer).size,fontFamily:mangaFont(activeLayer.font),textAlign:lettering!.align,lineHeight:lettering!.lineHeight,color:lettering!.color || (activeLayer.inverted ? '#fff' : '#111'),background:activeLayer.inverted ? '#111' : '#fff',border:'2px solid var(--umbra-accent)'}} />
              </foreignObject>}
              {dropPanelId && <path d={mangaPanelPath(page.panels.find(item => item.id === dropPanelId)!, false, (page.panelGap || 0) / 2)} fill="var(--umbra-accent)" fillOpacity={.2} stroke="var(--umbra-accent)" strokeWidth={10} pointerEvents="none" />}
              {gesture && ['bubble', 'panel'].includes(gesture.mode) && <rect {...gesture.preview} fill="none" stroke="var(--umbra-accent)" strokeWidth={3} strokeDasharray="12 8" pointerEvents="none" />}
              {selectedFrame && !fixedImage && !activeLayer?.locked && tool === 'select' && <g transform={`rotate(${previewLayer?.rotation || 0} ${selectedFrame.x + selectedFrame.width / 2} ${selectedFrame.y + selectedFrame.height / 2})`}>
                <rect data-manga-resize="" x={selectedFrame.x + selectedFrame.width - 12 / scale} y={selectedFrame.y + selectedFrame.height - 12 / scale} width={18 / scale} height={18 / scale} fill="var(--umbra-accent)" stroke="#fff" strokeWidth={1 / scale} style={{ cursor: 'nwse-resize' }} onPointerDown={event => startGesture(selectedId!, event, 'resize')} />
                {previewLayer?.kind === 'bubble' && previewLayer.bubbleVisible !== false && previewLayer.tail && <circle data-manga-tail="" cx={previewLayer.x + previewLayer.tailX} cy={previewLayer.y + previewLayer.tailY} r={8 / scale} fill="var(--umbra-accent)" stroke="#fff" strokeWidth={1 / scale} style={{ cursor: 'move' }} onPointerDown={event => startGesture(previewLayer.id, event, 'tail')} />}
              </g>}
            </svg>
          </div>
        </section>
        {rightOpen && <aside className="manga-inspector glass-panel" aria-label="Manga inspector"><div className="manga-panel-content">
          <div className="manga-section-heading">{activeLayer ? activeLayer.kind !== 'image' ? MANGA_TEXT_TYPES.find(type => type.value === mangaTextType(activeLayer))?.label : 'Imported art' : activePanel ? 'Panel' : 'Page'}</div>
          <div className="manga-field"><span>Page panel spacing</span><UmbraSelect ariaLabel="Page panel spacing" value={(page.panelGap || 0) > 0 ? 'gapped' : 'none'} onValueChange={value => changePage(current => ({ ...current, panelGap: value === 'gapped' ? 24 : 0 }))} options={[{ value: 'none', label: 'No added gap' }, { value: 'gapped', label: 'Separated panels' }]} /></div>
          {(page.panelGap || 0) > 0 && <NumberField label="Panel gap (px)" min={0} max={4096} value={page.panelGap!} onChange={panelGap => changePage(current => ({ ...current, panelGap }))} />}
          {selected ? <>
            {activeLayer && <label className="manga-check"><input type="checkbox" checked={!!activeLayer.locked} onChange={event => patchLayer({locked:event.target.checked})} />Lock layer</label>}
            <fieldset className="manga-layer-properties" disabled={!!activeLayer?.locked}>
            {activeLayer && <label className="manga-field"><span>Layer name</span><input aria-label="Layer name" value={activeLayer.name} maxLength={200} onChange={event => patchLayer({ name: event.target.value })} /></label>}
            {!fixedImage && <div className="manga-field-grid"><NumberField label="X" min={0} value={editableFrame!.x} onChange={x => patchRect({ x })} /><NumberField label="Y" min={0} value={editableFrame!.y} onChange={y => patchRect({ y })} /><NumberField label="Width" min={32} value={editableFrame!.width} onChange={width => patchRect({ width })} /><NumberField label="Height" min={32} value={editableFrame!.height} onChange={height => patchRect({ height })} /></div>}
            {activePanel && <button className="manga-wide" onClick={() => requestImage(false, false, 'background')}><ImagePlus size={16} />Set panel background</button>}
            {activePanel && <button className="manga-wide" onClick={() => requestImage(false, false, 'overlay')}><ImagePlus size={16} />Add image layer to panel</button>}
            {activeLayer?.kind === 'image' && <>
              {activeLayer.imageUrl.startsWith('data:image/gif;') && <>
                <UmbraSelect ariaLabel="Animation playback" value={(activeLayer.animation || defaultMangaAnimation()).trigger} options={[{value:'visible',label:'Autoplay in view'},{value:'hover',label:'Play on hover'}]} onValueChange={trigger=>patchLayer({animation:{...(activeLayer.animation || defaultMangaAnimation()),trigger:trigger as 'visible'|'hover'}})} />
                <NumberField label="Animation speed" min={.01} max={100} step={.1} value={(activeLayer.animation || defaultMangaAnimation()).speed} onChange={speed=>patchLayer({animation:{...(activeLayer.animation || defaultMangaAnimation()),speed}})} />
                <label className="manga-field"><span>Loop animation</span><input aria-label="Loop animation" type="checkbox" checked={(activeLayer.animation || defaultMangaAnimation()).loop} onChange={event=>patchLayer({animation:{...(activeLayer.animation || defaultMangaAnimation()),loop:event.target.checked}})} /></label>
              </>}

              {activeLayer.panelId && <UmbraSelect ariaLabel="Image role" value={fixedImage ? 'background' : 'overlay'} options={[{value:'background',label:'Panel background'},{value:'overlay',label:'Movable image layer'}]} onValueChange={value => changeImageRole(value as 'background' | 'overlay')} />}
              <UmbraSelect ariaLabel="Image fit" value={activeLayer.imageFit || 'cover'} options={[{value:'contain',label:'Fit whole image'},{value:'cover',label:'Fill image frame'}]} onValueChange={value => patchLayer({imageFit:value as 'contain' | 'cover'})} />
              <NumberField label="Image opacity (%)" min={0} max={100} value={(activeLayer.opacity ?? 1) * 100} onChange={value => patchLayer({opacity:value / 100})} /><button className="manga-wide" onClick={() => requestImage(!activeLayer.panelId, true)}>Replace art</button><NumberField label="Crop zoom" min={1} max={5} step={.1} value={activeLayer.zoom} onChange={zoom => patchLayer({ zoom })} /><div className="manga-field-grid"><NumberField label="Crop X (%)" min={-100} max={100} value={activeLayer.cropX} onChange={cropX => patchLayer({ cropX })} /><NumberField label="Crop Y (%)" min={-100} max={100} value={activeLayer.cropY} onChange={cropY => patchLayer({ cropY })} /></div>
              {activeLayer.panelId && <button className="manga-wide" onClick={() => { setSelectedId(activeLayer.panelId); }}>Select containing panel</button>}
            </>}
            {activeLayer && activeLayer.kind !== 'image' && <>
              <div className="manga-field"><span>Text type</span><UmbraSelect ariaLabel="Text type" value={mangaTextType(activeLayer)} options={MANGA_TEXT_TYPES} onValueChange={type => patchLayer(mangaApplyTextType(activeLayer, type as MangaTextType))} /></div>
              <label className="manga-field"><span>Text</span><textarea aria-label="Manga lettering text" value={activeLayer.text} rows={5} onChange={event => patchLayer({ text: event.target.value })} /></label>
              <UmbraSelect ariaLabel="Lettering font" value={activeLayer.font} options={fontOptions} onValueChange={font => patchLayer({ font })} />
              <button className="manga-wide" onClick={() => void refreshFonts()}>Refresh lettering fonts</button><p className="manga-hint">Custom fonts: User/Fonts</p>
              <UmbraSelect ariaLabel="Text sizing" value={activeLayer.textFit || 'manual'} options={[{value:'manual',label:'Manual lettering'},{value:'text',label:'Fit text inside balloon'},{value:'balloon',label:'Fit balloon around text'}]} onValueChange={value => patchLayer({textFit:value as MangaLayer['textFit'],textFitWidth:activeLayer.width,lettering:{...mangaLettering(activeLayer),...(value === 'manual' ? {} : {wrap:true,autoFit:value === 'text'})}})} />
              <button onClick={() => {setEditingTextId(activeLayer.id);setTool('select');}}>Edit text on page</button>
              <NumberField label="Font size" value={activeLayer.fontSize} min={.1} max={Number.MAX_SAFE_INTEGER} step={.1} onChange={fontSize => patchLayer({ fontSize })} />
              <label className="manga-field"><span>Installed font family</span><input aria-label="Installed font family" placeholder="Type any installed font name" defaultValue={isMangaSystemFont(activeLayer.font) ? activeLayer.font.slice(12) : ''} key={activeLayer.id + activeLayer.font} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={event => { const name = event.target.value.trim(); if (name && isMangaSystemFont(`system-font:${name}`)) patchLayer({font:`system-font:${name}`}); }} /></label>
              <div className="manga-field-grid"><NumberField label="Font weight" min={1} max={1000} value={lettering!.weight} onChange={weight => patchLettering({weight})} /><NumberField label="Line spacing" min={.1} max={Number.MAX_SAFE_INTEGER} step={.1} value={lettering!.lineHeight} onChange={lineHeight => patchLettering({lineHeight})} /><NumberField label="Letter spacing" min={-Number.MAX_SAFE_INTEGER} max={Number.MAX_SAFE_INTEGER} step={.1} value={lettering!.letterSpacing} onChange={letterSpacing => patchLettering({letterSpacing})} /><NumberField label="Outline width" min={0} max={Number.MAX_SAFE_INTEGER} step={.1} value={lettering!.outlineWidth} onChange={outlineWidth => patchLettering({outlineWidth})} /></div>
              <UmbraSelect ariaLabel="Text alignment" value={lettering!.align} options={['left','center','right'].map(value => ({value,label:value}))} onValueChange={align => patchLettering({align:align as MangaLettering['align']})} />
              <UmbraSelect ariaLabel="Vertical text alignment" value={lettering!.verticalAlign} options={['top','middle','bottom'].map(value => ({value,label:value}))} onValueChange={verticalAlign => patchLettering({verticalAlign:verticalAlign as MangaLettering['verticalAlign']})} />
              <div className="manga-field-grid"><label className="manga-field"><span>Text color</span><input aria-label="Text color" type="color" value={lettering!.color || (activeLayer.inverted ? '#ffffff' : '#111111')} onChange={event => patchLettering({color:event.target.value})} /></label><label className="manga-field"><span>Outline color</span><input aria-label="Outline color" type="color" value={lettering!.outlineColor || (activeLayer.inverted ? '#111111' : '#ffffff')} onChange={event => patchLettering({outlineColor:event.target.value})} /></label></div>
              {(['italic','underline','wrap','autoFit'] as const).map(key => <label key={key} className="manga-check"><input type="checkbox" checked={lettering![key]} onChange={event => patchLettering({[key]:event.target.checked})} />{{italic:'Italic',underline:'Underline',wrap:'Wrap text',autoFit:'Auto-fit text'}[key]}</label>)}
              <button onClick={() => patchLettering({color:undefined,outlineColor:undefined})}>Reset lettering colors</button>
              <div className="manga-field-grid"><NumberField label="Text width (%)" min={1} max={10000} value={(activeLayer.textTransform?.scaleX ?? 1) * 100} onChange={value => patchTextTransform({scaleX:value / 100})} /><NumberField label="Text height (%)" min={1} max={10000} value={(activeLayer.textTransform?.scaleY ?? 1) * 100} onChange={value => patchTextTransform({scaleY:value / 100})} /><NumberField label="Text skew" min={-85} max={85} value={activeLayer.textTransform?.skewX ?? 0} onChange={skewX => patchTextTransform({skewX})} /></div>
              <details><summary>Text angle and perspective</summary><div className="manga-field-grid">
                {([{key:'rotation',label:'Text rotation',limit:360},{key:'skewY',label:'Vertical text skew',limit:85},{key:'offsetX',label:'Text shift X',limit:8192},{key:'offsetY',label:'Text shift Y',limit:8192},{key:'tiltX',label:'Perspective tilt X',limit:75},{key:'tiltY',label:'Perspective tilt Y',limit:75}] as const).map(({key,label,limit}) => <NumberField key={key} label={label} min={-limit} max={limit} value={activeLayer.textTransform?.[key] ?? 0} onChange={value => patchTextTransform({[key]:value})} />)}
              </div><button onClick={() => patchLayer({textTransform:undefined})}>Reset text transforms</button></details>
              <UmbraSelect ariaLabel="Text clipping" value={activeLayer.clipPanelId || 'none'} options={[{value:'none',label:'Cross panel borders'}, ...page.panels.map((panel,index) => ({value:panel.id,label:`Clip to panel ${index + 1}`}))]} onValueChange={value => patchLayer({clipPanelId:value === 'none' ? undefined : value})} />
              {activeLayer.kind === 'bubble' && <>
                <label className="manga-check"><input type="checkbox" checked={activeLayer.bubbleVisible !== false} onChange={event => patchLayer({ bubbleVisible: event.target.checked })} />Show text box</label>
                <UmbraSelect ariaLabel="Bubble shape" value={activeLayer.shape} options={MANGA_BUBBLE_SHAPES} onValueChange={shape => patchLayer({ shape: shape as MangaBubbleShape, balloon: mangaBalloonStyle(activeLayer) })} />
                {activeLayer.shape === 'joined' && <p className="manga-hint">Separate dialogue beats with a blank line.</p>}
                <div className="manga-field-grid"><NumberField label="Balloon stroke" min={0} value={balloon!.strokeWidth} step={.5} onChange={strokeWidth => patchBalloon({strokeWidth})} /><NumberField label="Text padding (%)" min={0} max={49} value={balloon!.padding * 100} onChange={value => patchBalloon({padding:value / 100})} /><NumberField label="Contour variation (%)" min={0} max={100} value={balloon!.irregularity * 100} onChange={value => patchBalloon({irregularity:value / 100})} /></div>
                <label className="manga-field"><span>Hand-drawn edges · {Math.round((balloon!.edgeWobble ?? .55) * 100)}%</span><input aria-label="Hand-drawn edges" type="range" min={0} max={100} value={(balloon!.edgeWobble ?? .55) * 100} onChange={event => patchBalloon({edgeWobble:Number(event.target.value) / 100})} /></label>
                {['spiky','telepathy'].includes(activeLayer.shape) && <><label className="manga-field"><span>Spike count · {mangaSpikeCount(activeLayer)}</span><input aria-label="Spike count slider" type="range" min={0} max={Math.max(64,mangaSpikeCount(activeLayer))} value={mangaSpikeCount(activeLayer)} onChange={event => patchBalloon({spikeCount:Number(event.target.value)})} /></label><NumberField label="Spike count" min={0} max={256} value={mangaSpikeCount(activeLayer)} onChange={spikeCount => patchBalloon({spikeCount:Math.round(spikeCount)})} /></>}
                {['spiky','telepathy'].includes(activeLayer.shape) && <NumberField label="Spike strength (%)" min={0} max={100} value={balloon!.spikeStrength * 100} onChange={value => patchBalloon({spikeStrength:value / 100})} />}
                {activeLayer.shape === 'telepathy' && <NumberField label="Double outline gap" min={0} value={balloon!.outlineGap} onChange={outlineGap => patchBalloon({outlineGap})} />}
                <label className="manga-check"><input type="checkbox" checked={activeLayer.tail} onChange={event => patchLayer({ tail: event.target.checked })} />Speech tail</label>
                {activeLayer.tail && <div className="manga-field-grid"><NumberField label="Tail width" min={0} value={balloon!.tailWidth} onChange={tailWidth => patchBalloon({tailWidth})} /><NumberField label="Tail X" min={-8192} max={8192} value={activeLayer.tailX} onChange={tailX => patchLayer({tailX})} /><NumberField label="Tail Y" min={-8192} max={8192} value={activeLayer.tailY} onChange={tailY => patchLayer({tailY})} /></div>}
              </>}
              <label className="manga-check"><input type="checkbox" checked={activeLayer.inverted} onChange={event => patchLayer({ inverted: event.target.checked })} />Invert black and white</label>
            </>}
            {activeLayer && !fixedImage && <NumberField label="Rotation" min={-180} max={180} value={activeLayer.rotation} onChange={rotation => patchLayer({ rotation })} />}
            <div className="manga-row-actions"><button aria-label="Duplicate selected layer or panel" onClick={() => { const id = mangaId(); if (activeLayer) { const frame = mangaLayerFrame(activeLayer, page); changePage(current => ({ ...current, layers: [...current.layers, mangaSetLayerFrame({ ...activeLayer, id, locked: false, ...(activeLayer.kind === 'image' ? { imageMode: 'overlay' as const } : {}) }, current, { ...frame, x: frame.x + 20, y: frame.y + 20 })] })); } else if (activePanel) { try { const copy = duplicateMangaPanel(page, activePanel.id); const next = { ...project, pages: project.pages.map(item => item.id === page.id ? copy.page : item) }; if (new Blob([JSON.stringify(next)]).size > 100_000_000) throw new Error('This project exceeds 100 MB.'); change(() => next); setSelectedId(copy.panelId); } catch (error) { setError(message(error)); } return; } setSelectedId(id); }}><Copy size={16} />Duplicate</button><button className="manga-danger" onClick={removeSelected}><Trash2 size={16} />Delete</button></div>
            </fieldset>
          </> : <>
            <label className="manga-field"><span>Page name</span><input aria-label="Page name" maxLength={200} value={page.name} onChange={event => changePage(current => ({ ...current, name: event.target.value }))} /></label>
            <div className="manga-field-grid"><NumberField label="Page width" min={320} max={4096} value={page.width} onChange={width => changePage(current => ({ ...current, width }))} /><NumberField label="Page height" min={320} max={4096} value={page.height} onChange={height => changePage(current => ({ ...current, height }))} /></div>
            <UmbraSelect value={page.background} onValueChange={background => changePage(current => ({ ...current, background: background as MangaBackground }))} ariaLabel="Page background" options={[{ value: 'white', label: 'White paper' }, { value: 'transparent', label: 'Transparent + borders' }]} />
          </>}
          <div className="manga-section-heading">{!allLayers && selectedPanelId ? 'Panel layers' : 'Page layers'} · top first</div>
          {selectedPanelId && <button onClick={() => setAllLayers(value => !value)}>{allLayers ? 'Show selected panel layers' : 'Show all page layers'}</button>}
          <div className="manga-layer-list">{[...scopedLayers].reverse().map(layer => <div key={layer.id} className={selectedId === layer.id ? 'active' : ''}><button aria-label={`Select layer ${layer.name}`} onClick={() => { setSelectedId(layer.id); setTool('select'); }}><span className="manga-layer-name">{layer.name}</span>{layer.kind === 'image' && <small>{mangaIsPanelBackground(layer) ? 'Background' : 'Image layer'}</small>}</button><button aria-label={`${layer.locked ? 'Unlock' : 'Lock'} layer ${layer.name}`} onClick={() => changePage(current => ({ ...current, layers: current.layers.map(item => item.id === layer.id ? { ...item, locked: !item.locked } : item) }))}>{layer.locked ? <Lock size={14} /> : <Unlock size={14} />}</button><button aria-label={`${layer.visible ? 'Hide' : 'Show'} layer ${layer.name}`} onClick={() => changePage(current => ({ ...current, layers: current.layers.map(item => item.id === layer.id ? { ...item, visible: !item.visible } : item) }))}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button></div>)}</div>
          {activeLayer && <div className="manga-row-actions"><button disabled={!!activeLayer.locked || fixedImage} onClick={() => changePage(current => ({ ...current, layers: mangaMoveLayer(current.layers, activeLayer.id, 1) }))}><ArrowUp size={14} />Raise</button><button disabled={!!activeLayer.locked || fixedImage} onClick={() => changePage(current => ({ ...current, layers: mangaMoveLayer(current.layers, activeLayer.id, -1) }))}><ArrowDown size={14} />Lower</button></div>}
          <div className="manga-section-heading">Panels</div><div className="manga-layer-list">{page.panels.map((panel, index) => <button key={panel.id} className={selectedId === panel.id ? 'active' : ''} onClick={() => { setSelectedId(panel.id); setTool('select'); }}>Panel {index + 1}</button>)}</div>
        </div></aside>}
      </div>
      <footer className="manga-filmstrip glass-panel" aria-label="Manga pages">
        <div className="manga-filmstrip-actions"><div className="manga-strip-tabs"><button aria-label="Manga page thumbnails" className={stripTab === 'pages' ? 'active' : ''} onClick={() => setStripTab('pages')}>Pages {project.pages.length}</button><button aria-label="Manga image tray" className={stripTab === 'images' ? 'active' : ''} onClick={() => setStripTab('images')}>Images {assets.length}</button></div><button aria-label="Add manga page" onClick={addPage}><Plus size={16} /></button><button aria-label="Duplicate manga page" onClick={() => { const copy = duplicateMangaPage(page); change(current => ({ ...current, pages: [...current.pages, copy] })); choosePage(copy.id); }}><Copy size={15} /></button><button aria-label="Move manga page earlier" disabled={project.pages[0].id === page.id} onClick={() => change(current => ({ ...current, pages: moveMangaItem(current.pages, current.pages.findIndex(item => item.id === page.id), -1) }))}><ArrowLeft size={15} /></button><button aria-label="Move manga page later" disabled={project.pages[project.pages.length - 1].id === page.id} onClick={() => change(current => ({ ...current, pages: moveMangaItem(current.pages, current.pages.findIndex(item => item.id === page.id), 1) }))}><ArrowRight size={15} /></button><button className="manga-danger" aria-label="Delete manga page" disabled={project.pages.length === 1} onClick={() => { const pages = project.pages.filter(item => item.id !== page.id); change(current => ({ ...current, pages })); choosePage(pages[0].id); }}><Trash2 size={15} /></button></div>
        <div className="manga-page-strip">{stripTab === 'pages' ? project.pages.map((item, index) => <button key={item.id} aria-label={`Open page ${index + 1}: ${item.name}`} aria-pressed={item.id === page.id} className={item.id === page.id ? 'active' : ''} onClick={() => choosePage(item.id)}><svg viewBox={`0 0 ${item.width} ${item.height}`} aria-hidden="true"><MangaPageArt page={item} prefix={`thumb-${item.id}`} /></svg><span>{index + 1} · {item.name}</span></button>) : assets.length ? assets.map(asset => <div className="manga-image-tile" key={asset.id} onContextMenu={event=>{event.preventDefault();setImageMenu({asset,x:event.clientX,y:event.clientY});}}><button disabled={busy} onKeyDown={event=>{if(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10'){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();setImageMenu({asset,x:rect.left,y:rect.top});}}} draggable data-manga-asset={asset.id} aria-label={`Drag image ${asset.name} to panel`} title="Drag onto a panel, or click to add to the selected panel" onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(MANGA_ASSET_MIME, JSON.stringify({projectId:project.id,assetId:asset.id})); }} onDragEnd={() => setDropPanelId(null)} onClick={() => { const panelId = activePanel?.id || activeLayer?.panelId; if (panelId) placeAsset(asset,panelId); else setError('Select a panel or drag this image onto one.'); }}><img src={asset.imageUrl} draggable={false} alt={asset.name} /><span>{asset.name}</span></button><div className="manga-tray-actions"><button disabled={busy} aria-label={`Image options ${asset.name}`} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setImageMenu({asset,x:rect.left,y:rect.top});}}>•••</button><button aria-label={`Remove tray image ${asset.name}`} onClick={() => change(current => ({ ...current, assets: assets.filter(item => item.id !== asset.id) }))}><Trash2 size={12} /></button></div></div>) : <p className="manga-hint">Import art or use “Add to Manga Studio” in an image menu. Drag images here onto a page panel.</p>}</div>
      </footer>
    </fieldset>
    <div className="manga-status" role="status">{busy ? 'Working…' : `${saveStatus} · ${savedToUser === project ? 'Saved to User folder' : 'User-folder save pending'}`}<span>{tool === 'bubble' ? 'Drag on the page to draw a bubble' : tool === 'panel' ? 'Drag on the page to draw a panel' : activeLayer?.locked ? 'Layer locked · unlock in the inspector' : fixedImage ? 'Background follows its panel · crop in the inspector' : 'Drag to move · corner to resize · Alt bypasses snapping'}</span></div>
    {error && <div className="manga-error" role="alert">{error}{readMangaImageHandoff().length > 0 && <button disabled={busy} onClick={() => {attemptedImages.current.clear();setHandoffTick(value => value+1);}}>Retry image import</button>}<button aria-label="Dismiss manga error" onClick={() => setError('')}>Dismiss</button></div>}
    {readerPreview!==null && <dialog ref={readerDialog} className="manga-reader-preview" aria-label="Manga reader preview" onCancel={()=>setReaderPreview(null)}><div className="manga-reader-toolbar"><UmbraSelect ariaLabel="Reader preview width" value={readerWidth} onValueChange={setReaderWidth} options={[{value:'100%',label:'Full width'},{value:'768px',label:'Tablet'},{value:'390px',label:'Phone'}]} /><button aria-label="Close reader preview" onClick={()=>setReaderPreview(null)}>Close reader</button></div><iframe title="Manga reader preview" style={{width:readerWidth,maxWidth:'100%',alignSelf:'center'}} sandbox="allow-scripts" srcDoc={readerPreview} /></dialog>}
    {viewerId && <div onContextMenu={event=>{const asset=assets.find(item=>item.id===viewerId);if(asset){event.preventDefault();setImageMenu({asset,x:event.clientX,y:event.clientY});}}}><MediaViewerOverlay items={assets.map(asset=>({path:asset.id,name:asset.name,type:'image' as const,url:asset.imageUrl}))} currentPath={viewerId} onClose={()=>setViewerId(null)} onOpenPath={setViewerId} /></div>}
    <ContextMenu isOpen={!!imageMenu} position={imageMenu || {x:0,y:0}} title={imageMenu?.asset.name} onClose={()=>setImageMenu(null)} items={imageMenu ? [
      {label:'View image',disabled:busy,action:()=>{setViewerId(imageMenu.asset.id);setImageMenu(null);}},
      {label:'Send parameters to TXT2IMG',disabled:busy,action:()=>void editTrayImage(imageMenu.asset,'txt2img')},
      {label:'Send to IMG2IMG',disabled:busy,action:()=>void editTrayImage(imageMenu.asset,'img2img')},
      {label:'Send to Inpainting',disabled:busy,action:()=>void editTrayImage(imageMenu.asset,'inpaint')},
      {label:'Send to Canvas',disabled:busy,action:()=>void editTrayImage(imageMenu.asset,'canvas')},
      {separator:true},
      {label:'Download image',action:()=>{void fetch(imageMenu.asset.imageUrl).then(response=>response.blob()).then(blob=>downloadMangaBlob(blob,imageMenu.asset.name)).catch(error=>setError(message(error)));}},
    ] : []} />
    <input ref={imageInput} type="file" accept="image/*" aria-label="Import manga image file" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void receiveImage(file); }} />
    <input ref={projectInput} type="file" accept=".json" aria-label="Open manga project file" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void receiveProject(file); }} />
  </main>;
}
