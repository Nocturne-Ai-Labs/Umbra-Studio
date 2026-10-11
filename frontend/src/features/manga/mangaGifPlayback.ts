import {parseGIF,decompressFrame,type ParsedFrame,type ParsedGif} from 'gifuct-js';
import {defaultMangaAnimation,type MangaAnimation} from './mangaAnimation';

// Decode one patch at a time. Original bytes, palette and frame delays are retained.
export class MangaGifPlayback {
  readonly width:number; readonly height:number; readonly duration:number;
  private readonly gif:ParsedGif;
  private readonly frames:Array<Extract<ParsedGif['frames'][number],{image:unknown}>>;
  private readonly context:CanvasRenderingContext2D;
  private readonly patch=document.createElement('canvas');
  private index=-1; private previous:ParsedFrame|null=null; private restore:ImageData|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private disposed=false; private completed=false; private settings:MangaAnimation;
  constructor(bytes:ArrayBuffer,readonly canvas:HTMLCanvasElement,settings=defaultMangaAnimation()) {
    this.gif=parseGIF(bytes);
    this.frames=this.gif.frames.filter((frame):frame is Extract<ParsedGif['frames'][number],{image:unknown}>=>'image' in frame);
    this.width=this.gif.lsd.width;this.height=this.gif.lsd.height;
    if(!this.frames.length || !this.width || !this.height || this.width*this.height>40_000_000 || this.frames.some(frame=>!frame.image.descriptor.width || !frame.image.descriptor.height || frame.image.descriptor.width*frame.image.descriptor.height>40_000_000))throw new Error('Invalid or oversized animated GIF.');
    this.duration=this.frames.reduce((sum,frame)=>sum+(frame.gce?.delay || 10)*10,0);
    canvas.width=this.width;canvas.height=this.height;
    const context=canvas.getContext('2d');if(!context)throw new Error('GIF playback unavailable.');
    this.context=context;this.settings=settings;this.draw(0);
  }
  configure(settings:MangaAnimation) {this.settings=settings;}
  get ended(){return this.completed;}
  private clear(left:number,top:number,width:number,height:number,transparent:boolean) {
    this.context.clearRect(left,top,width,height);
    const color=this.gif.gct?.[this.gif.lsd.backgroundColorIndex];
    if(!transparent && color){this.context.fillStyle=`rgb(${color.join(',')})`;this.context.fillRect(left,top,width,height);}
  }
  private draw(index:number) {
    const ctx=this.context,previous=this.previous;
    if(index===0){this.completed=false;this.clear(0,0,this.width,this.height,this.frames[0].gce?.extras.transparentColorGiven===true);}
    else if(previous?.disposalType===2)this.clear(previous.dims.left,previous.dims.top,previous.dims.width,previous.dims.height,previous.transparentIndex!==undefined);
    else if(previous?.disposalType===3 && this.restore)ctx.putImageData(this.restore,0,0);
    const frame=decompressFrame(this.frames[index],this.gif.gct,true);
    this.restore=frame.disposalType===3 ? ctx.getImageData(0,0,this.width,this.height) : null;
    this.patch.width=frame.dims.width;this.patch.height=frame.dims.height;
    this.patch.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.patch),frame.dims.width,frame.dims.height),0,0);
    ctx.drawImage(this.patch,frame.dims.left,frame.dims.top);
    this.index=index;this.previous=frame;
    this.canvas.dataset.frame=String(index);
  }
  play() {
    if(this.disposed || this.completed || this.timer!==undefined)return;
    const next=()=>{
      const delay=(this.previous?.delay || 100)/this.settings.speed;
      this.timer=setTimeout(()=>{this.timer=undefined;if(this.disposed)return;
        if(this.index+1===this.frames.length && !this.settings.loop){this.completed=true;this.canvas.dataset.playing='false';return;}
        this.draw((this.index+1)%this.frames.length);next();
      },delay);
    };
    this.canvas.dataset.playing='true';next();
  }
  pause(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;this.canvas.dataset.playing='false';}
  replay(){this.pause();this.draw(0);this.play();}
  dispose(){this.pause();this.disposed=true;this.restore=null;}
}

export function mangaGifBytes(url:string):ArrayBuffer {
  if(!/^data:image\/gif;base64,[A-Za-z0-9+/=]+$/.test(url))throw new Error('Invalid embedded GIF.');
  const bytes=Uint8Array.from(atob(url.slice(url.indexOf(',')+1)),char=>char.charCodeAt(0));
  return bytes.buffer;
}
