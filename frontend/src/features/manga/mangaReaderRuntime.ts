import {MangaGifPlayback,mangaGifBytes} from './mangaGifPlayback';
import {defaultMangaAnimation} from './mangaAnimation';

const root=document.querySelector<HTMLElement>('[data-manga-reader]');
if(root) {
  let zoom=1;
  const zoomOut=document.querySelector<HTMLButtonElement>('#reader-zoom-out')!;
  const updateZoom=()=>{
    const fitWidth=Math.max(1,Math.min(1100,document.documentElement.clientWidth-24));
    root.style.setProperty('--reader-width',`${fitWidth*zoom}px`);
    document.querySelector<HTMLOutputElement>('#reader-zoom-value')!.textContent=`${Math.round(zoom*100)}%`;
    zoomOut.disabled=zoom<=.25;
  };
  zoomOut.addEventListener('click',()=>{zoom=Math.max(.25,zoom-.25);updateZoom();});
  document.querySelector('#reader-zoom-in')!.addEventListener('click',()=>{zoom+=.25;updateZoom();});
  document.querySelector('#reader-zoom-fit')!.addEventListener('click',()=>{zoom=1;updateZoom();window.scrollTo({left:0});});
  window.addEventListener('resize',updateZoom);updateZoom();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let auto=!reduced.matches;
  const autoControl=document.querySelector<HTMLInputElement>('#reader-autoplay')!;
  autoControl.checked=auto;
  const states:Array<{update:()=>void;pause:()=>void}>=[];
  for(const image of root.querySelectorAll<SVGImageElement>('image[data-manga-gif]')) {
    try {
      const foreign=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
      for(const name of ['x','y','width','height'])foreign.setAttribute(name,image.getAttribute(name) || '0');
      const canvas=document.createElement('canvas');canvas.style.cssText=`width:100%;height:100%;object-fit:${image.getAttribute('preserveAspectRatio')?.includes('slice') ? 'cover':'contain'};display:block`;
      foreign.append(canvas);
      const settings={...defaultMangaAnimation(),speed:Number(image.dataset.speed || 1),loop:image.dataset.loop!=='false',trigger:image.dataset.trigger==='hover' ? 'hover' as const : 'visible' as const};
      const player=new MangaGifPlayback(mangaGifBytes(image.getAttribute('href')!),canvas,settings);
      image.replaceWith(foreign);
      let visible=false,hovered=false,manual:boolean|null=null;
      const update=()=>{if(!document.hidden && visible && (manual===true || manual!==false && auto && (settings.trigger==='visible' || hovered)))player.play();else player.pause();group.setAttribute('aria-pressed',String(canvas.dataset.playing==='true'));};
      const group=foreign.closest<SVGGElement>('[data-manga-reader-animation]')!;
      group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',image.dataset.name || 'Animated panel');
      const toggle=()=>{manual=canvas.dataset.playing!=='true';if(manual && player.ended)player.replay();update();};
      group.addEventListener('click',toggle);
      group.addEventListener('keydown',event=>{if(event.key===' ' || event.key==='Enter'){event.preventDefault();toggle();}if(event.key.toLowerCase()==='r'){manual=true;player.replay();}});
      group.addEventListener('pointerenter',()=>{hovered=true;update();});group.addEventListener('pointerleave',()=>{hovered=false;update();});
      const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();});observer.observe(foreign);
      states.push({update,pause:()=>player.pause()});
    } catch { const notice=document.querySelector<HTMLElement>('#reader-status');if(notice){notice.hidden=false;notice.textContent='An animation could not play. Its still artwork remains available.';} }
  }
  autoControl.addEventListener('change',()=>{auto=autoControl.checked;states.forEach(state=>state.update());});
  document.addEventListener('visibilitychange',()=>states.forEach(state=>state.update()));
  document.querySelector<HTMLInputElement>('#reader-lettering')!.addEventListener('change',event=>root.classList.toggle('hide-lettering',!(event.target as HTMLInputElement).checked));
  window.addEventListener('pagehide',()=>states.forEach(state=>state.pause()));
}
