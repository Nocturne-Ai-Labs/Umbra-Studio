import React,{useEffect,useRef} from 'react';
import {MangaGifPlayback,mangaGifBytes} from './mangaGifPlayback';
import {defaultMangaAnimation,type MangaAnimation} from './mangaAnimation';

export function MangaGifArt({imageUrl,animation,x,y,width,height,fit}:{imageUrl:string;animation?:MangaAnimation;x:number;y:number;width:number;height:number;fit:'contain'|'cover'}) {
  const canvas=useRef<HTMLCanvasElement>(null),settings=animation || defaultMangaAnimation();
  useEffect(()=>{
    if(!canvas.current)return;
    const element=canvas.current;let player:MangaGifPlayback;
    try{player=new MangaGifPlayback(mangaGifBytes(imageUrl),element,settings);}catch{element.dataset.error='GIF could not play';return;}
    let visible=false,hovered=false;
    const update=()=>visible && (settings.trigger==='visible' || hovered) ? player.play() : player.pause();
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();});observer.observe(element);
    const enter=()=>{hovered=true;update();},leave=()=>{hovered=false;update();};
    element.addEventListener('pointerenter',enter);element.addEventListener('pointerleave',leave);
    const visibility=()=>{if(document.hidden)player.pause();else update();};document.addEventListener('visibilitychange',visibility);
    return()=>{observer.disconnect();player.dispose();element.removeEventListener('pointerenter',enter);element.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);};
  },[imageUrl,settings.speed,settings.loop,settings.trigger]);
  return <foreignObject x={x} y={y} width={width} height={height}><canvas ref={canvas} style={{width:'100%',height:'100%',objectFit:fit,display:'block'}} /></foreignObject>;
}
