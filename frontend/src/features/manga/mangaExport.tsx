import {extractMetadataFromFile} from '@/utils/metadata';
import {mangaId,type MangaAsset} from './mangaModel';
import {parseMangaImageProvenance} from './mangaImageProvenance';
import { render, unmountComponentAtNode } from 'react-dom';
import JSZip from 'jszip';
import { canUseUmbraCanvasEncodeWorker, encodeUmbraCanvasInWorker } from '@/lib/umbraUiCanvasEncodeWorker';
import { MangaLayerArt } from './MangaPageArt';
import { drawMangaText } from './mangaLettering';
import type { ReactNode } from 'react';
import {MangaGifPlayback,mangaGifBytes} from './mangaGifPlayback';
import {defaultMangaAnimation} from './mangaAnimation';
import { mangaPanelPath, type MangaPage, type MangaProject } from './mangaModel';
import { ensureMangaPageFonts } from './mangaUserFiles';

export function downloadMangaBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const mangaFilename = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().slice(0, 100) || 'manga';

export async function exportMangaPage(input: MangaPage): Promise<Blob> {
  const page=await mangaStillPage(input);
  await ensureMangaPageFonts(page.layers.filter(layer => layer.visible && layer.kind !== 'image'));
  // Use the same browser renderer as the editor (Umbra aliases React to Preact).
  // React's server renderer cannot serialize Preact elements reliably.
  const canvas = document.createElement('canvas'); canvas.width = page.width; canvas.height = page.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Page rendering is unavailable.');
  const drawSvg = async (art: ReactNode) => {
    const container = document.createElement('div'); let svg: string;
    try { render(<svg xmlns="http://www.w3.org/2000/svg" width={page.width} height={page.height} viewBox={`0 0 ${page.width} ${page.height}`}>{art}</svg>, container); if (!container.firstElementChild) throw new Error('Page SVG rendering failed.'); svg = new XMLSerializer().serializeToString(container.firstElementChild); }
    finally { unmountComponentAtNode(container); }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try { const image = new Image(); image.src = url; await image.decode(); context.drawImage(image, 0, 0); } finally { URL.revokeObjectURL(url); }
  };
  if (page.background === 'white') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, page.width, page.height); }
  for (const panel of page.panels) {
    if (page.background === 'white') await drawSvg(<path d={mangaPanelPath(panel, false, (page.panelGap || 0) / 2)} fill="#ffffff" />);
    for (const layer of page.layers.filter(layer => layer.visible && layer.panelId === panel.id)) await drawSvg(<MangaLayerArt layer={layer} page={page} prefix="export" exporting />);
    await drawSvg(<path d={mangaPanelPath(panel, false, (page.panelGap || 0) / 2)} stroke="#111111" strokeWidth={5} fill="none" />);
  }
  for (const layer of page.layers.filter(layer => layer.visible && !layer.panelId)) {
    if (layer.kind !== 'sfx') await drawSvg(<MangaLayerArt layer={layer} page={page} prefix="export" exporting />);
    if (layer.kind !== 'image') drawMangaText(context, layer, page);
  }
  if (canUseUmbraCanvasEncodeWorker()) return (await encodeUmbraCanvasInWorker({ canvas, type: 'image/png' })).blob;
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Page encoding failed.')), 'image/png'));
}
export async function exportMangaBook(project: MangaProject): Promise<Blob> {
  const zip = new JSZip();
  // Serial export bounds canvas memory regardless of the number of pages.
  for (let index = 0; index < project.pages.length; index++) zip.file(`${String(index + 1).padStart(3, '0')}-${mangaFilename(project.pages[index].name)}.png`, await exportMangaPage(project.pages[index]));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
export async function importMangaImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|avif|bmp|gif|tiff)$/.test(file.type) || file.size > 20_000_000) throw new Error('Import a supported image up to 20 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Use images up to 40 megapixels for this prototype.');
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    // Preserve PNG chunks and JPEG/WebP metadata whenever the image needs no conversion.
    if (file.type === 'image/gif' || scale === 1 && /^image\/(png|jpeg|webp)$/.test(file.type)) {
      return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Image could not be read.'));reader.readAsDataURL(file);});
    }
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d'); if (!context) throw new Error('Image import unavailable.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/png');
    if (url.length > 30_000_000) throw new Error('The decoded image is too large for an embedded project. Import a smaller image.');
    return url;
  } finally { bitmap.close(); }
}

export async function importMangaAsset(file:File,sourcePath?:string):Promise<MangaAsset> {
  const imageUrl=await importMangaImage(file);
  const metadata=file.type === 'image/gif' ? {name:file.name,type:'image',size:file.size} : await extractMetadataFromFile(file);
  if('error' in metadata && metadata.error)throw new Error('Image metadata could not be read. The original image is unchanged; retry the import.');
  const provenance=parseMangaImageProvenance({metadataJson:JSON.stringify(metadata),sourcePath});
  return {id:mangaId(),name:file.name.slice(0,200),imageUrl,provenance,...(file.type === 'image/gif' ? {animation:defaultMangaAnimation()} : {})};
}

export async function mangaStillPage(page:MangaPage):Promise<MangaPage> {
  const posters=new Map<string,string>();
  for(const layer of page.layers)if(layer.kind==='image' && layer.imageUrl.startsWith('data:image/gif;') && !posters.has(layer.imageUrl)) {
    const canvas=document.createElement('canvas'),player=new MangaGifPlayback(mangaGifBytes(layer.imageUrl),canvas);
    posters.set(layer.imageUrl,canvas.toDataURL('image/png'));player.dispose();
  }
  return {...page,layers:page.layers.map(layer=>posters.has(layer.imageUrl) ? {...layer,imageUrl:posters.get(layer.imageUrl)!} : layer)};
}
