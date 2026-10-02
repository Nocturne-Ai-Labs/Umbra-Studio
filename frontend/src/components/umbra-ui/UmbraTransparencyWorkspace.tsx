import React from 'react';
import { Download, ImageMinus, ImagePlus, Loader2, Redo2, RotateCcw, Scissors, Undo2, X } from 'lucide-react';
import { CensorIconButton, censorButton } from './UmbraCensorReviewViewer';
import { UmbraTransparencyViewer, transparencyCanvas, transparencyPng, type TransparencySource } from './UmbraTransparencyViewer';
import { createTransparencyHistory, editTransparencyHistory, emptyTransparencyMask, moveTransparencyHistory, transparencyExportName, type TransparencyHistory, type TransparencyMask, type TransparencyStroke } from '@/lib/umbraTransparencyMask';
import { getUmbraCanvasBackgroundRemovalStatus, removeUmbraCanvasImageBackground, type UmbraCanvasBackgroundRemovalStatus } from '@/lib/umbraUiCanvasBackgroundRemoval';

interface TransparencyImage extends TransparencySource { file: File; history: TransparencyHistory }
interface Operation { controller: AbortController; imageId: string; revision: number }
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be read. Choose a browser-supported PNG, JPEG, WebP, AVIF or BMP.'));
    image.src = url;
  });
}

export function UmbraTransparencyWorkspace({ active = true }: { active?: boolean }) {
  const [images, setImages] = React.useState<TransparencyImage[]>([]), imagesRef = React.useRef(images);
  const [selectedId, setSelectedId] = React.useState(''), selectedRef = React.useRef(selectedId);
  const [importing, setImporting] = React.useState(false), [exporting, setExporting] = React.useState(false), [drawing, setDrawing] = React.useState(false);
  const [working, setWorking] = React.useState(false), [stopping, setStopping] = React.useState(false), [error, setError] = React.useState('');
  const [status, setStatus] = React.useState<UmbraCanvasBackgroundRemovalStatus | null>(null);
  const input = React.useRef<HTMLInputElement>(null), operation = React.useRef<Operation | null>(null), mounted = React.useRef(true);
  const image = images.find(item => item.id === selectedId);
  const replaceImages = (next: TransparencyImage[]) => { imagesRef.current = next; setImages(next); };
  const select = (id: string) => {
    if (id === selectedRef.current) return;
    operation.current?.controller.abort(); operation.current = null;
    setWorking(false); setStopping(false); setDrawing(false); setError('');
    selectedRef.current = id; setSelectedId(id);
  };
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; operation.current?.controller.abort();
      for (const item of imagesRef.current) URL.revokeObjectURL(item.url);
    };
  }, []);
  React.useEffect(() => {
    if (!active) { operation.current?.controller.abort(); operation.current = null; setWorking(false); setStopping(false); setDrawing(false); }
    if (!active) return;
    const controller = new AbortController();
    const refresh = () => { void getUmbraCanvasBackgroundRemovalStatus(controller.signal).then(setStatus).catch(error => {
      if (!controller.signal.aborted) setStatus({ available: false, provider: 'CPUExecutionProvider', model: 'isnet-anime', reason: String(error.message || error) });
    }); };
    refresh(); const timer = window.setInterval(refresh, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); operation.current?.controller.abort(); operation.current = null; };
  }, [active]);
  const importImages = async (files: File[]) => {
    if (importing) return;
    setImporting(true); setError('');
    const startSelection = selectedRef.current, added: TransparencyImage[] = [], failures: string[] = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        const image = await loadImage(url);
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 64 * 1024 * 1024) throw new Error('The image must be nonempty and at most 64 megapixels.');
        added.push({ id: crypto.randomUUID(), name: file.name, file, url, image, width: image.naturalWidth, height: image.naturalHeight, history: createTransparencyHistory() });
      } catch (error) { URL.revokeObjectURL(url); failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Import failed.'}`); }
    }
    if (!mounted.current) { for (const item of added) URL.revokeObjectURL(item.url); return; }
    replaceImages([...imagesRef.current, ...added]);
    if (added.length && selectedRef.current === startSelection) select(added[0].id);
    setError(failures.join(' ')); setImporting(false);
  };
  const edit = (mask: TransparencyMask) => {
    const selected = imagesRef.current.find(item => item.id === selectedRef.current);
    if (!selected || operation.current || exporting) return;
    replaceImages(imagesRef.current.map(item => item.id === selected.id ? { ...item, history: editTransparencyHistory(item.history, mask) } : item));
  };
  const commitStroke = (stroke: TransparencyStroke) => {
    const selected = imagesRef.current.find(item => item.id === selectedRef.current);
    if (selected) edit({ ...selected.history.present, strokes: [...selected.history.present.strokes, stroke] });
  };
  const history = (redo: boolean) => {
    if (operation.current || drawing || exporting) return;
    replaceImages(imagesRef.current.map(item => item.id === selectedRef.current ? { ...item, history: moveTransparencyHistory(item.history, redo) } : item));
  };
  const autoCutout = async () => {
    const selected = imagesRef.current.find(item => item.id === selectedRef.current);
    if (!selected || operation.current || !status?.available || drawing || exporting) return;
    const request = { controller: new AbortController(), imageId: selected.id, revision: selected.history.revision };
    operation.current = request; setWorking(true); setStopping(false); setError('');
    let url = '';
    try {
      // Bake browser orientation once; send original pixels, not the edited mask.
      const original = await transparencyPng(transparencyCanvas(selected, emptyTransparencyMask()));
      request.controller.signal.throwIfAborted();
      const result = await removeUmbraCanvasImageBackground({ image: original, imageName: 'transparency-source.png', signal: request.controller.signal });
      url = URL.createObjectURL(result.blob); const cutout = await loadImage(url);
      request.controller.signal.throwIfAborted();
      if (cutout.naturalWidth !== selected.width || cutout.naturalHeight !== selected.height) throw new Error('The CPU cutout dimensions do not match the original image.');
      const canvas = document.createElement('canvas'); canvas.width = selected.width; canvas.height = selected.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The CPU cutout mask could not be read.');
      context.drawImage(cutout, 0, 0); const pixels = context.getImageData(0, 0, selected.width, selected.height).data;
      const alpha = new Uint8ClampedArray(selected.width * selected.height);
      for (let index = 0; index < alpha.length; index++) alpha[index] = pixels[index * 4 + 3];
      const current = imagesRef.current.find(item => item.id === selected.id);
      if (operation.current !== request || selectedRef.current !== selected.id || current?.history.revision !== request.revision) return;
      replaceImages(imagesRef.current.map(item => item.id === selected.id ? { ...item, history: editTransparencyHistory(item.history, { base: { width: selected.width, height: selected.height, alpha }, strokes: [] }) } : item));
    } catch (error) {
      if (operation.current === request && selectedRef.current === selected.id && (!request.controller.signal.aborted || (error instanceof Error && error.name !== 'AbortError'))) setError(error instanceof Error ? error.message : 'CPU cutout failed. The original mask was kept.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (operation.current === request) { operation.current = null; setWorking(false); setStopping(false); }
    }
  };
  const exportPng = async () => {
    const selected = imagesRef.current.find(item => item.id === selectedRef.current);
    if (!selected || working || exporting || drawing) return;
    setExporting(true); setError('');
    try {
      const blob = await transparencyPng(transparencyCanvas(selected, selected.history.present));
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = transparencyExportName(selected.name); anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'PNG export failed.'); }
    finally { if (mounted.current) setExporting(false); }
  };
  const disabled = working || exporting || !active;
  return <div data-umbra-transparency-workspace="" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--umbra-bg)] text-zinc-200">
    <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[var(--umbra-bg)] p-3">
      <h2 className="mr-auto min-w-0 truncate text-sm font-bold max-sm:w-full">Transparency</h2>
      <button type="button" className={censorButton} disabled={importing} onClick={() => input.current?.click()}><ImagePlus size={16} />Add images</button>
      <CensorIconButton title="Remove image from batch" disabled={!image || drawing || exporting} onClick={() => {
        if (!image) return; const remaining = imagesRef.current.filter(item => item.id !== image.id);
        select(remaining[0]?.id || ''); replaceImages(remaining); URL.revokeObjectURL(image.url);
      }}><ImageMinus size={16} /></CensorIconButton>
      <CensorIconButton title="Undo transparency edit" disabled={!image?.history.undo.length || disabled || drawing} onClick={() => history(false)}><Undo2 size={16} /></CensorIconButton>
      <CensorIconButton title="Redo transparency edit" disabled={!image?.history.redo.length || disabled || drawing} onClick={() => history(true)}><Redo2 size={16} /></CensorIconButton>
      <CensorIconButton title="Reset transparency mask" disabled={!image || disabled || drawing || (!image.history.present.base && !image.history.present.strokes.length)} onClick={() => edit(emptyTransparencyMask())}><RotateCcw size={16} /></CensorIconButton>
      <button type="button" className={censorButton} title={status?.reason || 'Create an editable cutout mask on CPU'} disabled={!image || disabled || drawing || !status?.available} onClick={() => void autoCutout()}><Scissors size={16} />Auto cutout · CPU</button>
      {working && <button type="button" className={censorButton} disabled={stopping} onClick={() => { setStopping(true); operation.current?.controller.abort(); }}><X size={16} />Cancel cutout</button>}
      <button type="button" className={censorButton} disabled={!image || disabled || drawing} onClick={() => void exportPng()}>{exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Export PNG</button>
    </header>
    <input ref={input} aria-label="Import transparency images" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" multiple hidden onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void importImages(files); }} />
    <div role="status" className="flex min-h-8 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-1 text-xs text-zinc-500">
      {(working || importing || exporting) && <Loader2 size={13} className="animate-spin" />}
      <span>{importing ? 'Importing images' : working ? stopping ? 'Stopping cutout · CPU' : 'Creating cutout · CPU' : exporting ? 'Exporting PNG' : image ? `${image.name} · ${image.width} × ${image.height}` : 'Add images to edit transparency'}</span>
      {!working && <span className="ml-auto" title={status?.reason}>{status?.available ? 'CPU cutout ready' : !status ? 'Checking CPU cutout' : 'CPU cutout unavailable'}</span>}
    </div>
    {error && <p role="alert" className="shrink-0 break-words border-b border-red-300/20 px-3 py-2 text-xs text-red-300">{error}</p>}
    {image ? <UmbraTransparencyViewer source={image} mask={image.history.present} disabled={disabled} onCommit={commitStroke} onDrawing={setDrawing} /> : <div className="flex min-h-40 flex-1 items-center justify-center"><button type="button" className={censorButton} disabled={importing} onClick={() => input.current?.click()}><ImagePlus size={16} />Add images</button></div>}
    <footer className="shrink-0 border-t border-white/10">
      <div className="flex h-9 items-center gap-3 px-3 text-xs text-zinc-500"><span>{images.length} images</span><span>PNG · original size · alpha</span></div>
      <div className="flex h-[96px] gap-2 overflow-x-auto px-2 pb-2">
        {images.map(item => <button type="button" key={item.id} aria-label={`Edit transparency: ${item.name}`} aria-pressed={item.id === selectedId} disabled={drawing || exporting} onClick={() => select(item.id)} className={`w-[100px] shrink-0 overflow-hidden rounded border ${item.id === selectedId ? 'border-emerald-300' : 'border-white/15'}`}>
          <img src={item.url} alt={item.name} className="h-12 w-full object-contain" style={{ backgroundColor: '#18181b' }} draggable={false} />
          <span className="block truncate px-1 text-[10px]">{item.name}</span><span className="block truncate px-1 text-[10px] text-zinc-500">{item.history.present.base ? 'CPU + mask' : item.history.present.strokes.length ? 'Manual mask' : 'Original'}</span>
        </button>)}
      </div>
    </footer>
  </div>;
}
