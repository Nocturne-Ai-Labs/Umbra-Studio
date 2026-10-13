import {render,unmountComponentAtNode} from 'react-dom';
import {PDFDocument} from 'pdf-lib';
import {MangaPageArt} from './MangaPageArt';
import {exportMangaPage} from './mangaExport';
import {ensureMangaPageFonts} from './mangaUserFiles';
import {isMangaUserFont,type MangaProject} from './mangaModel';

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
async function embeddedFile(url:string):Promise<string> {
  const response=await fetch(url);if(!response.ok)throw new Error('A reader resource could not be loaded. Retry after refreshing fonts.');
  const blob=await response.blob();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Reader resource embedding failed.'));reader.readAsDataURL(blob);});
}
export async function exportMangaReader(project:MangaProject):Promise<Blob> {
  const runtime=await fetch('/assets/manga-reader.js',{cache:'no-store'});if(!runtime.ok || !runtime.headers.get('content-type')?.includes('javascript'))throw new Error('Reader runtime is missing. Rebuild the frontend before exporting.');
  const script=(await runtime.text()).replace(/<\/script/gi,'<\\/script');
  const licenses=await fetch('/assets/manga-reader-LICENSE.txt');if(!licenses.ok)throw new Error('Reader license notices are missing. Rebuild the frontend.');
  let notices=await licenses.text();
  const fonts=new Set(project.pages.flatMap(page=>page.layers.filter(layer=>layer.visible && layer.kind!=='image').map(layer=>layer.font)));
  const fontSources:Array<{family:string;url:string;weight:string}>=[];
  if(fonts.has('comic-neue'))fontSources.push({family:'Umbra Comic Neue',url:'/assets/manga-fonts/ComicNeue-Regular.ttf',weight:'400'},{family:'Umbra Comic Neue',url:'/assets/manga-fonts/ComicNeue-Bold.ttf',weight:'700'});
  if(fonts.has('bangers'))fontSources.push({family:'Umbra Bangers',url:'/assets/manga-fonts/Bangers-Regular.ttf',weight:'400 900'});
  for(const [font,file] of [['comic-neue','comicneue-OFL.txt'],['bangers','bangers-OFL.txt']])if(fonts.has(font)) {
    const notice=await fetch(`/assets/manga-fonts/${file}`);if(!notice.ok)throw new Error('Bundled font license notice is missing.');notices+='\n'+await notice.text();
  }
  for(const font of fonts)if(isMangaUserFont(font))fontSources.push({family:`UmbraManga_${font.slice(10)}`,url:`/api/manga/fonts/${font.slice(10)}`,weight:'400'});
  let fontCss='';
  for(const font of fontSources)fontCss+=`@font-face{font-family:'${font.family}';src:url('${await embeddedFile(font.url)}');font-weight:${font.weight};font-display:block}`;
  const pages:string[]=[];
  for(const [index,page] of project.pages.entries()) {
    await ensureMangaPageFonts(page.layers.filter(layer=>layer.visible && layer.kind!=='image'));
    const container=document.createElement('div');
    try {
      render(<svg xmlns="http://www.w3.org/2000/svg" width={page.width} height={page.height} viewBox={`0 0 ${page.width} ${page.height}`} role="group" aria-label={`${page.name}, page ${index+1}`}><MangaPageArt page={page} prefix={`reader-${index}`} reader /></svg>,container);
      if(!container.firstElementChild)throw new Error('Reader page rendering failed.');
      pages.push(`<section class="reader-page" aria-label="${escape(page.name)}">${new XMLSerializer().serializeToString(container.firstElementChild)}</section>`);
    }finally{unmountComponentAtNode(container);}
  }
  const html=`<!doctype html><!-- ${notices.replace(/--/g,'- -')} --><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(project.name)}</title><style>${fontCss}
    *{box-sizing:border-box}body{margin:0;background:#000;color:#eee;font:16px system-ui}header{position:sticky;top:0;left:0;width:100%;max-width:100vw;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:8px 12px;background:#000;border-bottom:1px solid #333}h1{font-size:18px;margin:0}label{cursor:pointer;display:flex;align-items:center;gap:6px;min-height:44px}input{width:20px;height:20px}button{min-width:44px;min-height:44px;padding:0 12px;border:1px solid #444;border-radius:4px;background:#111;color:inherit;font:inherit;cursor:pointer}button:disabled{opacity:.4;cursor:default}button:focus-visible{outline:2px solid #eee;outline-offset:2px}.reader-zoom{display:flex;align-items:center;gap:6px}#reader-zoom-value{min-width:4ch;text-align:center}main{width:max-content;min-width:100%;padding:0 12px}.reader-page{width:var(--reader-width,min(1100px,calc(100vw - 24px)));margin:24px auto}.reader-page svg{display:block;width:100%;height:auto}.hide-lettering [data-manga-lettering]{display:none}[data-manga-reader-animation]{cursor:pointer}[data-manga-reader-animation]:focus-visible{outline:3px solid #4ed5bf}#reader-status{font-size:12px;flex-basis:100%;margin:0}
  </style></head><body><header><h1>${escape(project.name)}</h1><label><input id="reader-autoplay" type="checkbox" checked> Autoplay</label><label><input id="reader-lettering" type="checkbox" checked> Show lettering</label><div class="reader-zoom" role="group" aria-label="Reader zoom"><button id="reader-zoom-out" aria-label="Zoom out">−</button><output id="reader-zoom-value" aria-label="Zoom level" aria-live="polite">100%</output><button id="reader-zoom-in" aria-label="Zoom in">+</button><button id="reader-zoom-fit">Fit</button></div><p id="reader-status" role="status" hidden></p></header><main data-manga-reader>${pages.join('')}</main><script>${script}</script></body></html>`;
  return new Blob([html],{type:'text/html;charset=utf-8'});
}

export async function exportMangaPdf(project:MangaProject):Promise<Blob> {
  const pdf=await PDFDocument.create();pdf.setTitle(project.name);pdf.setCreator('Umbra Manga Studio');
  for(const page of project.pages) {
    const png=await exportMangaPage(page),image=await pdf.embedPng(await png.arrayBuffer());
    const width=page.width*.75,height=page.height*.75,pdfPage=pdf.addPage([width,height]);
    pdfPage.drawImage(image,{x:0,y:0,width,height});
  }
  return new Blob([new Uint8Array(await pdf.save())],{type:'application/pdf'});
}
