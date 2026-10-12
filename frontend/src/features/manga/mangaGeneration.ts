import {normalizePowerPrompterGenerationControls} from '../../../../shared/power-prompter/powerPrompter';
import type {UmbraUiPipelineDefaults,UmbraUiPipelineResolutionCapability} from '../../../../shared/umbra-ui/pipelineTypes';
import type {UmbraImageQueueOptions} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
export type MangaEnhancements=Pick<UmbraImageQueueOptions,'hiresFix'|'detailerPipeline'|'outputUpscale'|'tiledVae'|'loras'|'clipSkip'>;
export interface MangaGenerationSettings {
  prompt:string;negativePrompt:string;modelFamily:string;modelType:'checkpoint'|'diffusers'|'diffusion_model'|'unet'|'gguf';checkpointName:string;
  enhancements?:MangaEnhancements;workflowResources:Record<string,string>;steps:number;cfg:number;seed:number;samplerName:string;scheduler:string;baseResolution:number;samples:number;
}
export interface MangaGenerationRequest {requestId:string;received:string[]}
export const defaultMangaGeneration = ():MangaGenerationSettings=>({prompt:'',negativePrompt:'',modelFamily:'',modelType:'checkpoint',checkpointName:'',workflowResources:{},steps:28,cfg:4,seed:0,samplerName:'euler',scheduler:'normal',baseResolution:1024,samples:1});
// Apply sampling defaults only when the user chooses a family, never on catalog refresh or project hydration.
export function mangaFamilySamplingDefaults(defaults:UmbraUiPipelineDefaults | undefined):Partial<MangaGenerationSettings>{
  return {
    ...(typeof defaults?.steps==='number' && Number.isFinite(defaults.steps) ? {steps:defaults.steps} : {}),
    ...(typeof defaults?.cfg==='number' && Number.isFinite(defaults.cfg) ? {cfg:defaults.cfg} : {}),
    ...(defaults?.samplerName ? {samplerName:defaults.samplerName} : {}),
    ...(defaults?.scheduler ? {scheduler:defaults.scheduler} : {}),
  };
}
export function parseMangaGeneration(value:unknown):MangaGenerationSettings{
  const fail=():never=>{throw new Error('Invalid Manga generation settings.');};
  if(!value || typeof value!=='object' || Array.isArray(value))return fail();const raw=value as Record<string,unknown>;
  const str=(key:string,max=4096)=>typeof raw[key]==='string' && raw[key].length<=max?raw[key] as string:fail();
  const num=(key:string,min:number,max:number,integer=false)=>typeof raw[key]==='number' && Number.isFinite(raw[key]) && raw[key]>=min && raw[key]<=max && (!integer || Number.isInteger(raw[key]))?raw[key] as number:fail();
  const modelType=str('modelType');if(!['checkpoint','diffusers','diffusion_model','unet','gguf'].includes(modelType))fail();
  if(!raw.workflowResources || typeof raw.workflowResources!=='object' || Array.isArray(raw.workflowResources))fail();
  const resources=Object.entries(raw.workflowResources as Record<string,unknown>);if(resources.length>128 || resources.some(([key,value])=>key.length>240 || typeof value!=='string' || value.length>4096))fail();
  return {...(raw.enhancements === undefined ? {} : {enhancements:parseMangaEnhancements(raw.enhancements)}),prompt:str('prompt',100000),negativePrompt:str('negativePrompt',100000),modelFamily:str('modelFamily',256),modelType:modelType as MangaGenerationSettings['modelType'],checkpointName:str('checkpointName'),workflowResources:Object.fromEntries(resources) as Record<string,string>,steps:num('steps',1,10000,true),cfg:num('cfg',0,100),seed:num('seed',0,Number.MAX_SAFE_INTEGER,true),samplerName:str('samplerName',256),scheduler:str('scheduler',256),baseResolution:num('baseResolution',64,8192,true),samples:num('samples',1,64,true)};
}
export function mangaGenerationDimensions(frame:{width:number;height:number},base:number,capability?:UmbraUiPipelineResolutionCapability){
  if(capability && capability.support!=='adjustable')return {width:capability.defaultWidth || 1024,height:capability.defaultHeight || 1024};
  const ratio=Math.max(.001,frame.width/frame.height),step=Math.max(1,capability?.step || 8);
  const minW=capability?.minimumWidth || 64,minH=capability?.minimumHeight || 64,maxW=capability?.maximumWidth || 8192,maxH=capability?.maximumHeight || 8192;
  const target=base;
  let width=ratio>=1 ? target : target*ratio,height=ratio>=1 ? target/ratio : target;
  const shrink=Math.min(1,maxW/width,maxH/height);width*=shrink;height*=shrink;
  // A minimum short edge must never inflate the long edge beyond the selected target.
  const align=(value:number,min:number,max:number)=>Math.max(Math.ceil(min/step)*step,Math.min(Math.floor(Math.min(max,target)/step)*step,Math.round(value/step)*step));
  return {width:align(width,minW,maxW),height:align(height,minH,maxH)};
}
export function buildMangaGenerationOptions(settings:MangaGenerationSettings,dimensions:{width:number;height:number}):UmbraImageQueueOptions{
  return {prompt:settings.prompt,negativePrompt:settings.negativePrompt,modelFamily:settings.modelFamily,modelType:settings.modelType,checkpointName:settings.checkpointName,workflowResources:{...settings.workflowResources},seed:settings.seed,seedMode:'fixed',seedIncrement:1,steps:settings.steps,cfg:settings.cfg,samplerName:settings.samplerName,scheduler:settings.scheduler,...dimensions,batchSize:settings.samples,outputMode:'txt2img',outputFolder:'',styleName:'Manga Studio',queuePlacement:'end',...mangaEnhancements(settings)};
}

export function mangaEnhancements(settings:MangaGenerationSettings):MangaEnhancements {
  return settings.enhancements || parseMangaEnhancements({detailerPipeline:[]});
}
export function parseMangaEnhancements(value:unknown):MangaEnhancements {
  if(!value || typeof value!=='object' || Array.isArray(value) || JSON.stringify(value).length>200000)throw new Error('Invalid Manga generation enhancements.');
  const raw=value as Record<string,unknown>;
  if(raw.detailerPipeline!==undefined && (!Array.isArray(raw.detailerPipeline) || raw.detailerPipeline.length>32))throw new Error('Use up to 32 Manga detailer stages.');
  if(raw.loras!==undefined && (!Array.isArray(raw.loras) || raw.loras.length>64))throw new Error('Use up to 64 Manga LoRAs.');
  const normalized=normalizePowerPrompterGenerationControls({...raw,detailerPipeline:raw.detailerPipeline || []});
  const tile=raw.tiledVae && typeof raw.tiledVae==='object' ? raw.tiledVae as Record<string,unknown> : {};
  const finite=(value:unknown,fallback:number,min:number,max:number)=>typeof value==='number' && Number.isFinite(value)?Math.max(min,Math.min(max,Math.round(value))):fallback;
  return {hiresFix:normalized.hiresFix!,detailerPipeline:normalized.detailerPipeline!,outputUpscale:normalized.outputUpscale!,clipSkip:normalized.clipSkip,
    tiledVae:{enabled:tile.enabled===true,tileSize:finite(tile.tileSize,512,64,8192),overlap:finite(tile.overlap,64,0,4096)},
    loras:normalized.loras.map(lora=>{const source=(raw.loras as Array<Record<string,unknown>> || []).find(item=>item.id===lora.id) || {};const words=(value:unknown)=>Array.isArray(value)?value.filter((word):word is string=>typeof word==='string' && word.length<=1000).slice(0,256):[];return {id:lora.id,name:lora.name,enabled:lora.enabled,strengthModel:lora.strengthModel,strengthClip:lora.strengthClip,trainedTags:words(source.trainedTags),triggerWords:words(source.triggerWords),...(typeof source.modelFamilyKey==='string' ? {modelFamilyKey:source.modelFamilyKey.slice(0,256)} : {})};})};
}
