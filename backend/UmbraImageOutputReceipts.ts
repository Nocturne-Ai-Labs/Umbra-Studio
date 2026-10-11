import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export interface UmbraImageOutputReceipt {requestId:string; outputs:string[]; updatedAt:number}
export class UmbraImageOutputReceipts {
  private readonly file:string;
  private entries=new Map<string,UmbraImageOutputReceipt>();
  constructor(private readonly directory:string,private readonly now=Date.now){
    this.file=join(directory,'receipts.json');
    try {for(const entry of (JSON.parse(readFileSync(this.file,'utf8')).receipts || []).slice(-500)) if(this.validId(entry.requestId) && Array.isArray(entry.outputs) && entry.outputs.length<=500 && entry.outputs.every((path:unknown)=>this.validPath(path)) && Number.isFinite(entry.updatedAt)) this.entries.set(entry.requestId,entry);} catch { /* No receipt can be recovered from an absent or invalid index. */ }
  }
  private validId(id:unknown):id is string{return typeof id==='string' && /^[a-zA-Z0-9_-]{8,128}$/.test(id);}
  private validPath(path:unknown):path is string{return typeof path==='string' && path.length<=32768 && !path.includes('\0') && !/^(https?:|data:|blob:)/i.test(path) && /\.(png|jpe?g|webp|avif|bmp|gif|tiff?)$/i.test(path);}
  record(requestId:string,outputs:string[]):void {
    if(!this.validId(requestId)) return;
    const paths=outputs.filter(path=>this.validPath(path));if(!paths.length)return;
    const next=new Map(this.entries), previous=next.get(requestId);
    next.set(requestId,{requestId,outputs:[...new Set([...(previous?.outputs || []),...paths])].slice(0,500),updatedAt:Math.max(this.now(),(previous?.updatedAt || 0)+1)});
    for(const [id,entry] of next)if(this.now()-entry.updatedAt>7*86400000)next.delete(id);
    for(const entry of [...next.values()].sort((a,b)=>b.updatedAt-a.updatedAt).slice(500))next.delete(entry.requestId);
    mkdirSync(this.directory,{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';
    try {writeFileSync(temporary,JSON.stringify({version:1,receipts:[...next.values()]}),{mode:0o600});renameSync(temporary,this.file);this.entries=next;}catch(error){try{unlinkSync(temporary);}catch{/* Preserve the prior index. */}throw error;}
  }
  async get(requestId:unknown,resolve:(path:string)=>Promise<string|null>,after=0):Promise<UmbraImageOutputReceipt|null>{
    if(!this.validId(requestId))return null;const entry=this.entries.get(requestId);if(!entry || this.now()-entry.updatedAt>7*86400000)return null;
    if(after>=entry.updatedAt)return {...entry,outputs:[]};
    const outputs=(await Promise.all(entry.outputs.map(resolve))).filter((path):path is string=>!!path);
    return {...entry,outputs};
  }
}
