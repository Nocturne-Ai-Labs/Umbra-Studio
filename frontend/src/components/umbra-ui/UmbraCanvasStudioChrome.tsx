import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  BoxSelect,
  Combine,
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Focus,
  Grid3X3,
  Hand,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Lock,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Trash2,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UmbraCanvasStudioController } from '@/components/umbra-ui/useUmbraCanvasStudio';
import { UMBRA_CANVAS_STUDIO_SNAP_SIZE, type UmbraCanvasStudioRegion } from '@/lib/umbraUiStudioProjects';

const smallInput = 'h-8 min-w-0 border border-white/10 bg-black/35 px-2 font-mono text-[9px] text-zinc-300 outline-none focus:border-cyan-300/40';

export interface UmbraCanvasStudioToolbarProps {
  studio: UmbraCanvasStudioController;
  onFitView: () => void;
  onResetView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function UmbraCanvasStudioToolbar({ studio, onFitView, onResetView, onZoomIn, onZoomOut }: UmbraCanvasStudioToolbarProps) {
  return (
    <div data-umbra-canvas-studio-toolbar="" className="col-span-full flex min-h-11 min-w-0 flex-wrap items-center gap-2 border-b border-cyan-300/15 bg-[#050809] px-3 py-1.5">
      <Grid3X3 size={13} className="shrink-0 text-cyan-300" />
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Canvas Studio</span>
      <select
        value={studio.project?.id || ''}
        onChange={(event) => event.target.value && void studio.openProject(event.target.value)}
        disabled={studio.loading || studio.projects.length <= 0}
        className={`${smallInput} w-48`}
        title="Open a Canvas Studio project"
      >
        {!studio.project ? <option value="">No studio project</option> : null}
        {studio.project && !studio.projects.some((project) => project.id === studio.project?.id) ? (
          <option value={studio.project.id}>{studio.project.name}</option>
        ) : null}
        {studio.projects.map((project) => (
          <option key={project.id} value={project.id}>{project.name} / {project.artboardCount} artboards</option>
        ))}
      </select>
      <button type="button" onClick={() => void studio.createProject()} title="Create a project from the current canvas" className="inline-flex h-8 w-8 items-center justify-center border border-cyan-300/20 text-cyan-200 hover:bg-cyan-500/10"><Plus size={11} /></button>
      <button type="button" onClick={() => void studio.saveNow()} disabled={!studio.project || studio.saveState === 'saving'} title="Save the Studio manifest now" className="inline-flex h-8 w-8 items-center justify-center border border-white/10 text-zinc-400 hover:text-cyan-200 disabled:text-zinc-800">{studio.saveState === 'saving' ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}</button>
      <div className="flex items-center border border-white/[0.07] bg-black/25 p-0.5" aria-label="Studio canvas history">
        <button type="button" onClick={() => void studio.undoArtboardChange()} disabled={!studio.canUndoArtboardChange || studio.loading} title="Undo the last generation-canvas add, duplicate, or delete" className="inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:bg-white/[0.04] hover:text-cyan-200 disabled:text-zinc-800"><Undo2 size={11} /></button>
        <button type="button" onClick={() => void studio.redoArtboardChange()} disabled={!studio.canRedoArtboardChange || studio.loading} title="Redo the last generation-canvas change" className="inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:bg-white/[0.04] hover:text-cyan-200 disabled:text-zinc-800"><Redo2 size={11} /></button>
      </div>
      <div className="h-5 w-px bg-white/10" />
      <select
        value={studio.activeArtboard?.id || ''}
        onChange={(event) => event.target.value && void studio.selectArtboard(event.target.value)}
        disabled={!studio.project?.artboards.length}
        className={`${smallInput} w-44`}
        title="Select the active artboard"
      >
        {!studio.activeArtboard ? <option value="">No artboard</option> : null}
        {studio.project?.artboards.map((artboard) => <option key={artboard.id} value={artboard.id}>{artboard.name}</option>)}
      </select>
      <button type="button" onClick={() => void studio.addCurrentArtboard()} title="Add the current canvas document as an artboard" className="inline-flex h-8 items-center gap-1.5 border border-white/10 px-2 font-mono text-[8px] font-black uppercase text-zinc-400 hover:text-cyan-200"><Layers3 size={10} /> Add</button>
      <button type="button" onClick={() => void studio.duplicateCurrentArtboard()} disabled={!studio.activeArtboard} title="Duplicate the current artboard and its editable document" className="inline-flex h-8 w-8 items-center justify-center border border-white/10 text-zinc-400 hover:text-cyan-200 disabled:text-zinc-800"><Copy size={10} /></button>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-1 border border-white/[0.07] bg-black/25 p-0.5" aria-label="Studio viewport controls">
          <button type="button" onClick={onZoomOut} disabled={!studio.project} title="Zoom out" className="inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:bg-white/[0.04] hover:text-cyan-200 disabled:text-zinc-800"><ZoomOut size={11} /></button>
          <button type="button" onClick={onFitView} disabled={!studio.project?.artboards.length} title="Fit all artboards" className="inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:bg-white/[0.04] hover:text-cyan-200 disabled:text-zinc-800"><Focus size={11} /></button>
          <button type="button" onClick={onResetView} disabled={!studio.project} title="Reset viewport" className="inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:bg-white/[0.04] hover:text-cyan-200 disabled:text-zinc-800"><Hand size={11} /></button>
          <button type="button" onClick={onZoomIn} disabled={!studio.project} title="Zoom in" className="inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:bg-white/[0.04] hover:text-cyan-200 disabled:text-zinc-800"><ZoomIn size={11} /></button>
          <span className="w-11 pr-1 text-right font-mono text-[8px] text-zinc-500">{Math.round((studio.project?.viewport.zoom || 1) * 100)}%</span>
        </div>
        <button
          type="button"
          aria-pressed={studio.project?.viewport.snapEnabled || false}
          onClick={() => studio.project && studio.updateViewport({ snapEnabled: !studio.project.viewport.snapEnabled })}
          title="Toggle Studio artboard snapping (8px grid, edges, centers, and adjacent canvases)"
          className={cn('inline-flex h-8 w-8 items-center justify-center border', studio.project?.viewport.snapEnabled ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600')}
        >
          <Grid3X3 size={11} />
        </button>
        <span
          title="Studio snapping uses the 8px light grid plus canvas edge and center alignment"
          className={cn('inline-flex h-8 min-w-12 items-center justify-center border border-white/10 bg-black/25 px-2 font-mono text-[8px] uppercase', studio.project?.viewport.snapEnabled ? 'text-cyan-200/75' : 'text-zinc-800')}
        >
          {UMBRA_CANVAS_STUDIO_SNAP_SIZE}px + align
        </span>
        <span className={cn('font-mono text-[8px] uppercase', studio.saveState === 'error' ? 'text-red-300' : studio.saveState === 'saved' ? 'text-emerald-300/70' : 'text-zinc-700')}>
          {studio.saveState === 'saving' ? 'saving' : studio.saveState === 'error' ? 'save failed' : studio.project ? `r${studio.project.revision}` : 'idle'}
        </span>
      </div>
    </div>
  );
}

export interface UmbraCanvasStudioShelfProps {
  studio: UmbraCanvasStudioController;
  onSelectRegion: (region: UmbraCanvasStudioRegion) => void;
  onCreateRegion: (region: UmbraCanvasStudioRegion) => void;
  artboardActions?: UmbraCanvasStudioArtboardActions;
}

export interface UmbraCanvasStudioArtboardActions {
  busy: boolean;
  canTransform: boolean;
  backgroundRemovalAvailable: boolean;
  detailersEnabled: boolean;
  detailerActiveCount: number;
  detailerStageCount: number;
  overlapCount: number;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onRemoveBackground: () => void;
  onContinueImg2Img: () => void;
  onStitchOverlaps: () => void;
  onDetailersEnabledChange: (enabled: boolean) => void;
}

type ShelfView = 'artboards' | 'regions' | 'assets';

export function UmbraCanvasStudioShelf({ studio, onSelectRegion, onCreateRegion, artboardActions }: UmbraCanvasStudioShelfProps) {
  const [view, setView] = React.useState<ShelfView>('artboards');
  const assetScrollRef = React.useRef<HTMLDivElement | null>(null);
  const assets = studio.project?.shelf || [];
  const assetVirtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => assetScrollRef.current,
    estimateSize: () => 82,
    overscan: 6,
  });

  return (
    <aside data-umbra-canvas-studio-shelf="" className="flex min-h-0 min-w-0 flex-col border-l border-cyan-300/15 bg-[#06090a]">
      <div className="shrink-0 border-b border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FolderOpen size={12} className="text-cyan-300" />
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-200">Project Shelf</span>
          <span className="ml-auto font-mono text-[8px] text-zinc-600">{studio.project?.shelf.length || 0} assets</span>
        </div>
        {studio.project ? (
          <input
            key={`${studio.project.id}:${studio.project.name}`}
            defaultValue={studio.project.name}
            onBlur={(event) => studio.renameProject(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            aria-label="Canvas Studio project name"
            className={`${smallInput} mt-2 w-full`}
          />
        ) : null}
      </div>
      <div className="grid h-9 shrink-0 grid-cols-3 border-b border-white/10 bg-black/20 p-0.5">
        {([
          ['artboards', <Layers3 key="artboards" size={10} />, 'Artboards'],
          ['regions', <BoxSelect key="regions" size={10} />, 'Regions'],
          ['assets', <ImageIcon key="assets" size={10} />, 'Assets'],
        ] as Array<[ShelfView, React.ReactNode, string]>).map(([id, icon, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={cn('inline-flex min-w-0 items-center justify-center gap-1.5 text-[8px] font-black uppercase', view === id ? 'bg-cyan-500/10 text-cyan-100' : 'text-zinc-600 hover:text-zinc-300')}>
            {icon} {label}
          </button>
        ))}
      </div>

      {view === 'artboards' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
          <div className="space-y-1.5">
            {studio.project?.artboards.map((artboard) => {
              const active = artboard.id === studio.activeArtboard?.id;
              return (
                <div key={artboard.id} className={cn('border px-2 py-2', active ? 'border-cyan-300/35 bg-cyan-500/[0.06]' : 'border-white/[0.08] bg-black/20')}>
                  <button type="button" onClick={() => void studio.selectArtboard(artboard.id)} className="flex w-full min-w-0 items-center gap-2 text-left">
                    <span className={cn('h-1.5 w-1.5 shrink-0', active ? 'bg-cyan-300' : 'bg-zinc-700')} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-zinc-200">{artboard.name}</span>
                    <span className="font-mono text-[7px] text-zinc-600">{artboard.width}x{artboard.height}</span>
                  </button>
                  {active ? (
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-[1fr_1fr_28px_28px] gap-1">
                        <input type="number" value={artboard.x} onChange={(event) => studio.updateArtboard(artboard.id, { x: Number(event.target.value) || 0 })} title="Artboard X" className={`${smallInput} w-full text-center`} />
                        <input type="number" value={artboard.y} onChange={(event) => studio.updateArtboard(artboard.id, { y: Number(event.target.value) || 0 })} title="Artboard Y" className={`${smallInput} w-full text-center`} />
                        <button type="button" onClick={() => studio.updateArtboard(artboard.id, { visible: !artboard.visible })} title={artboard.visible ? 'Hide artboard' : 'Show artboard'} className="inline-flex h-8 items-center justify-center border border-white/10 text-zinc-500">{artboard.visible ? <Eye size={10} /> : <EyeOff size={10} />}</button>
                        <button type="button" onClick={() => studio.updateArtboard(artboard.id, { locked: !artboard.locked })} title={artboard.locked ? 'Unlock artboard' : 'Lock artboard'} className="inline-flex h-8 items-center justify-center border border-white/10 text-zinc-500">{artboard.locked ? <Lock size={10} /> : <Unlock size={10} />}</button>
                      </div>
                      {artboardActions ? (
                          <div className="border-t border-white/[0.08] pt-2">
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="font-mono text-[7px] font-black uppercase tracking-[0.12em] text-zinc-600">Artboard Actions</span>
                            {artboardActions.busy ? <Loader2 size={9} className="ml-auto animate-spin text-cyan-300" /> : null}
                          </div>
                          <button
                            type="button"
                            onClick={artboardActions.onStitchOverlaps}
                            disabled={artboardActions.overlapCount < 2 || artboardActions.busy || artboard.locked}
                            title={artboardActions.overlapCount < 2
                              ? 'Overlap this canvas with another visible canvas to stitch them'
                              : `Flatten ${artboardActions.overlapCount} overlapping canvases into one editable canvas`}
                            className="mb-1.5 inline-flex h-8 w-full items-center justify-center gap-2 border border-amber-300/25 bg-amber-500/[0.05] font-mono text-[8px] font-black uppercase text-amber-100 hover:bg-amber-500/[0.1] disabled:border-white/[0.06] disabled:bg-transparent disabled:text-zinc-800"
                          >
                            <Combine size={10} /> Stitch {artboardActions.overlapCount > 1 ? `${artboardActions.overlapCount} Canvases` : 'Overlaps'}
                          </button>
                          <div className="grid grid-cols-4 gap-1">
                            <button type="button" onClick={artboardActions.onFlipHorizontal} disabled={!artboardActions.canTransform || artboardActions.busy || artboard.locked} title="Flip the complete artboard horizontally" className="inline-flex h-8 items-center justify-center border border-white/10 text-zinc-400 hover:border-cyan-300/30 hover:text-cyan-100 disabled:text-zinc-800"><FlipHorizontal2 size={11} /></button>
                            <button type="button" onClick={artboardActions.onFlipVertical} disabled={!artboardActions.canTransform || artboardActions.busy || artboard.locked} title="Flip the complete artboard vertically" className="inline-flex h-8 items-center justify-center border border-white/10 text-zinc-400 hover:border-cyan-300/30 hover:text-cyan-100 disabled:text-zinc-800"><FlipVertical2 size={11} /></button>
                            <button type="button" onClick={artboardActions.onRotateLeft} disabled={!artboardActions.canTransform || artboardActions.busy || artboard.locked} title="Rotate the complete artboard 90 degrees left" className="inline-flex h-8 items-center justify-center border border-white/10 text-zinc-400 hover:border-cyan-300/30 hover:text-cyan-100 disabled:text-zinc-800"><RotateCcw size={11} /></button>
                            <button type="button" onClick={artboardActions.onRotateRight} disabled={!artboardActions.canTransform || artboardActions.busy || artboard.locked} title="Rotate the complete artboard 90 degrees right" className="inline-flex h-8 items-center justify-center border border-white/10 text-zinc-400 hover:border-cyan-300/30 hover:text-cyan-100 disabled:text-zinc-800"><RotateCw size={11} /></button>
                          </div>
                          <button
                            type="button"
                            onClick={artboardActions.onRemoveBackground}
                            disabled={!artboardActions.backgroundRemovalAvailable || artboardActions.busy || artboard.locked}
                            title={artboardActions.backgroundRemovalAvailable ? 'Remove the background and add a transparent character cutout layer' : 'Launch ComfyUI with the background-removal node installed to use character cutout'}
                            className="mt-1.5 inline-flex h-8 w-full items-center justify-center gap-2 border border-fuchsia-300/20 bg-fuchsia-500/[0.04] font-mono text-[8px] font-black uppercase text-fuchsia-100 hover:bg-fuchsia-500/[0.08] disabled:border-white/[0.06] disabled:bg-transparent disabled:text-zinc-800"
                          >
                            <Scissors size={10} /> Character Cutout
                          </button>
                          <button
                            type="button"
                            onClick={artboardActions.onContinueImg2Img}
                            disabled={artboardActions.busy}
                            title="Render this artboard and continue in IMG2IMG"
                            className="mt-1 inline-flex h-8 w-full items-center justify-center gap-2 border border-cyan-300/20 bg-cyan-500/[0.04] font-mono text-[8px] font-black uppercase text-cyan-100 hover:bg-cyan-500/[0.08] disabled:text-zinc-800"
                          >
                            <ImageIcon size={10} /> Send to IMG2IMG
                          </button>
                          <label className="mt-1.5 flex min-h-8 cursor-pointer items-center gap-2 border border-white/[0.08] bg-black/25 px-2 font-mono text-[8px] text-zinc-400">
                            <input
                              type="checkbox"
                              checked={artboardActions.detailersEnabled}
                              onChange={(event) => artboardActions.onDetailersEnabledChange(event.target.checked)}
                              className="h-3.5 w-3.5 accent-cyan-400"
                            />
                            <span className="min-w-0 flex-1">Use IMG2IMG detailers</span>
                            <span className="text-cyan-200/70">{artboardActions.detailerActiveCount}/{artboardActions.detailerStageCount}</span>
                          </label>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void studio.deleteCurrentArtboard()}
                        disabled={studio.loading || artboard.locked}
                        title={artboard.locked ? 'Unlock this artboard before deleting it' : 'Delete this canvas from the Studio project; its editable document is preserved for Undo'}
                        className="inline-flex h-8 w-full items-center justify-center gap-2 border border-red-300/20 bg-red-500/[0.025] font-mono text-[8px] font-black uppercase text-red-200/75 hover:bg-red-500/[0.07] disabled:border-white/[0.06] disabled:bg-transparent disabled:text-zinc-800"
                      >
                        <Trash2 size={9} /> Delete Canvas
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!studio.project?.artboards.length ? <div className="border border-dashed border-white/10 px-3 py-8 text-center font-mono text-[9px] text-zinc-600">Open an image, then add the current canvas as an artboard.</div> : null}
          </div>
        </div>
      ) : null}

      {view === 'regions' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 p-2">
            <button
              type="button"
              onClick={() => { const region = studio.addRegion(); if (region) onCreateRegion(region); }}
              disabled={!studio.activeArtboard}
              className="inline-flex h-8 w-full items-center justify-center gap-2 border border-cyan-300/25 bg-cyan-500/[0.06] text-[8px] font-black uppercase tracking-[0.12em] text-cyan-100 disabled:text-zinc-800"
            >
              <Plus size={10} /> Capture Generation Region
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2 custom-scrollbar">
            {studio.activeArtboard?.regions.map((region) => {
              const active = region.id === studio.activeRegion?.id;
              return (
                <div key={region.id} className={cn('border p-2', active ? 'border-cyan-300/35 bg-cyan-500/[0.06]' : 'border-white/[0.08] bg-black/20')}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button type="button" onClick={() => { const selected = studio.selectRegion(region.id); if (selected) onSelectRegion(selected); }} className="min-w-0 flex-1 truncate text-left font-mono text-[9px] text-zinc-200">{region.name}</button>
                    <span className="font-mono text-[7px] text-zinc-600">{region.rect.width}x{region.rect.height}</span>
                    <button type="button" onClick={() => studio.deleteRegion(region.id)} title="Delete region" className="inline-flex h-6 w-6 items-center justify-center border border-red-300/15 text-red-300/60"><Trash2 size={8} /></button>
                  </div>
                  {active ? (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <select value={region.mode} onChange={(event) => {
                        const mode = event.target.value as UmbraCanvasStudioRegion['mode'];
                        studio.updateRegion(region.id, { mode });
                        onSelectRegion({ ...region, mode });
                      }} className={smallInput} title="Region generation mode">
                        <option value="standalone">Generate Inside</option>
                        <option value="composite">Composite</option>
                        <option value="blend">Blend / Morph</option>
                        <option value="extend">Extend / Outpaint</option>
                        <option value="inpaint">Inpaint</option>
                      </select>
                      <select value={region.outputMode} onChange={(event) => {
                        const outputMode = event.target.value as UmbraCanvasStudioRegion['outputMode'];
                        studio.updateRegion(region.id, { outputMode });
                        onSelectRegion({ ...region, outputMode });
                      }} className={smallInput} title="Region output mode">
                        <option value="raster">Raster Layer</option>
                        <option value="cutout">Transparent Cutout</option>
                      </select>
                      <textarea
                        value={region.promptSegments.map((segment) => segment.text).filter(Boolean).join(', ')}
                        readOnly
                        className="col-span-2 min-h-14 resize-none border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-[8px] leading-4 text-zinc-400 outline-none"
                        title="This region keeps its own prompt snapshot. Select it to restore the prompt editor."
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!studio.activeArtboard?.regions.length ? <div className="border border-dashed border-white/10 px-3 py-8 text-center font-mono text-[9px] leading-4 text-zinc-600">Draw a generation region on the canvas, then capture it here. Every region keeps its own prompt and settings.</div> : null}
          </div>
        </div>
      ) : null}

      {view === 'assets' ? (
        <div ref={assetScrollRef} className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
          <div className="relative w-full" style={{ height: `${assetVirtualizer.getTotalSize()}px` }}>
            {assetVirtualizer.getVirtualItems().map((virtualRow) => {
              const asset = assets[virtualRow.index];
              return (
                <div key={asset.id} className="absolute left-0 top-0 w-full pb-1.5" style={{ transform: `translateY(${virtualRow.start}px)` }}>
                  <div className="flex h-[76px] min-w-0 items-center gap-2 border border-white/[0.08] bg-black/20 p-1.5">
                    <div className="h-16 w-16 shrink-0 overflow-hidden border border-white/10 bg-black/45">
                      {asset.thumbnailUrl || asset.imageUrl ? <img src={asset.thumbnailUrl || asset.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-zinc-800"><ImageIcon size={14} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[9px] text-zinc-200" title={asset.name}>{asset.name}</div>
                      <div className="mt-1 inline-flex border border-cyan-300/15 px-1.5 py-0.5 font-mono text-[7px] uppercase text-cyan-300/70">{asset.kind}</div>
                      <div className="mt-1 truncate font-mono text-[7px] text-zinc-700">{asset.documentId}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {assets.length <= 0 ? <div className="border border-dashed border-white/10 px-3 py-8 text-center font-mono text-[9px] text-zinc-600">Sources, masks, generated candidates, and accepted layers will appear here.</div> : null}
        </div>
      ) : null}

      <div className="shrink-0 border-t border-white/10 p-2">
        <button type="button" onClick={() => void studio.deleteProject()} disabled={!studio.project} title="Delete only the Studio manifest; editable artboard documents are preserved" className="inline-flex h-8 w-full items-center justify-center gap-2 border border-red-300/20 text-[8px] font-black uppercase text-red-200/70 hover:bg-red-500/[0.06] disabled:text-zinc-800"><Trash2 size={9} /> Delete Project</button>
      </div>
    </aside>
  );
}
