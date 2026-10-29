import { AutoSizePromptTextarea } from '@/components/umbra-ui/AutoSizePromptTextarea';
import React,{useEffect,useRef,useState} from 'react';
import {UmbraSelect} from '@/components/ui/UmbraSelect';
import {useUmbraPowerPrompterBridge,type UmbraModelCatalog,type UmbraWorkflowResourceKind} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
import {listUmbraUiPipelineFamilies,resolveUmbraUiPipeline} from '@/lib/umbraUiPipelines';
import {normalizeUmbraUiPipelineCapabilities} from '../../../../shared/umbra-ui/pipelineTypes';
import {buildMangaGenerationOptions,defaultMangaGeneration,mangaEnhancements,mangaFamilySamplingDefaults,mangaGenerationDimensions,mangaGenerationResolutionIssue,type MangaGenerationSettings} from './mangaGeneration';
import {applyMangaLoraMetadata} from './mangaLoraMetadata';
import type {MangaProject} from './mangaModel';
import {MangaEnhancementControls} from './MangaEnhancementControls';
const choices=(values:string[])=>values.map(value=>({value,label:value}));
function catalogValues(catalog:UmbraModelCatalog,kind:UmbraWorkflowResourceKind):string[]{
  const keys={checkpoint:'checkpoints',diffusers:'diffusersModels',diffusion_model:'diffusionModels',unet:'unetModels',gguf:'ggufModels',text_encoder:'textEncoders',vae:'vaes',clip_vision:'clipVision',controlnet:'controlnets',upscale_model:'upscaleModels',model:'modelPatches'} as const;
  return kind === 'unet' ? [...new Set([...catalog.unetModels,...catalog.diffusionModels])] : catalog[keys[kind]];
}
export function MangaGenerationPanel({project,frame,hidden,disabled,onSubmitting,onSettings,onQueued,onOutputs,onForget}:{project:MangaProject;frame:{width:number;height:number}|null;hidden:boolean;disabled:boolean;onSubmitting:(busy:boolean)=>void;onForget:(requestId:string)=>void;onSettings:(settings:MangaGenerationSettings)=>void;onQueued:(projectId:string,requestId:string)=>void;onOutputs:(projectId:string,requestId:string,paths:string[])=>Promise<void>}){
  const [comfyConnected,setComfyConnected]=useState(false),[submitting,setSubmitting]=useState(false),[issue,setIssue]=useState(''),[recoveryIssue,setRecoveryIssue]=useState('');
  const recoveredVersions=useRef(new Map<string,number>());
  const bridge=useUmbraPowerPrompterBridge(comfyConnected);
  const state=useRef({project,onOutputs,onSettings});state.current={project,onOutputs,onSettings};
  const mounted=useRef(false),attemptedLoraInfo=useRef(new Set<string>());
  const [loraInfoRevision,setLoraInfoRevision]=useState(0);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  // Retry unavailable metadata after readiness changes or an explicit catalog refresh, not on every prompt edit.
  useEffect(()=>{attemptedLoraInfo.current.clear();},[bridge.connected,comfyConnected,loraInfoRevision]);
  useEffect(()=>{
    if(!project.generation)return;
    for(const lora of mangaEnhancements(project.generation).loras){
      if(lora.trainedTags.length && lora.triggerWords?.length)continue;
      const key=JSON.stringify([project.id,lora.id,lora.name]);
      if(attemptedLoraInfo.current.has(key))continue;
      attemptedLoraInfo.current.add(key);
      void bridge.requestLoraInfo(lora.name).then(info=>{
        if(!mounted.current)return;
        const current=state.current;
        const generation=applyMangaLoraMetadata(current.project,project.id,lora.id,lora.name,info);
        if(generation){
          state.current={...current,project:{...current.project,generation}};
          current.onSettings(generation);
        }
      }).catch(()=>{});
    }
  },[project.id,project.generation,bridge.requestLoraInfo,bridge.connected,comfyConnected,loraInfoRevision]);
  useEffect(()=>{let live=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const response=await fetch('/api/umbrabridge/status',{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error();const status=await response.json();if(live)setComfyConnected(status.backends?.comfyui?.healthy===true);}catch{if(live)setComfyConnected(false);}finally{if(live)timer=setTimeout(poll,5000);}};void poll();return()=>{live=false;controller.abort();clearTimeout(timer);};
  },[]);
  useEffect(()=>{let live=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{const snapshot=state.current;let failure='';
      for(const request of snapshot.project.generationRequests || []){if(!live)break;try{
        const response=await fetch(`/api/umbra-ui/image/outputs?${new URLSearchParams({requestId:request.requestId,after:String(recoveredVersions.current.get(snapshot.project.id+':'+request.requestId+':'+request.received.length) || 0)})}`,{cache:'no-store',signal:controller.signal});
        if(response.status===404)continue;if(!response.ok)throw new Error('Generated images could not be recovered.');const data=await response.json();
        const paths=Array.isArray(data.receipt?.outputs)?data.receipt.outputs.filter((path:unknown):path is string=>typeof path==='string' && !request.received.includes(path)):[];
        if(live && paths.length)await snapshot.onOutputs(snapshot.project.id,request.requestId,paths);
        if(live && paths.length===0)recoveredVersions.current.set(snapshot.project.id+':'+request.requestId+':'+request.received.length,Number(data.receipt?.updatedAt) || 0);
      }catch(error){if(live)failure=error instanceof Error?error.message:'Generated images could not be imported.';}}
      if(live){setRecoveryIssue(failure);timer=setTimeout(poll,3000);}
    };void poll();return()=>{live=false;controller.abort();clearTimeout(timer);};
  },[]);
  const saved=project.generation || defaultMangaGeneration(),families=listUmbraUiPipelineFamilies(bridge.workflows,'txt2img');
  const family=saved.modelFamily || families[0] || '';
  const sources=[...new Set(bridge.workflows.flatMap(item=>item.umbraUiPipelines || []).filter(item=>item.feature==='txt2img' && item.modelFamily===family).flatMap(item=>item.modelSources))];
  const settings={...saved,modelFamily:family,modelType:!saved.checkpointName && sources.length && !sources.includes(saved.modelType) ? sources[0] : saved.modelType};
  const selection=resolveUmbraUiPipeline(bridge.workflows,'txt2img',settings.modelFamily,settings.modelType);
  const capability=normalizeUmbraUiPipelineCapabilities(selection.pipeline?.capabilities,selection.pipeline?.modelSources);
  const dimensions=mangaGenerationDimensions(frame || {width:1,height:1},settings.baseResolution,selection.pipeline ? capability.resolution : undefined);
  const preview=bridge.generationPreview && project.generationRequests?.some(request=>request.requestId===bridge.generationPreview?.requestId) ? bridge.generationPreview : null;
  const patch=(value:Partial<MangaGenerationSettings>)=>onSettings({...settings,...value});
  const blocked=(project.generationRequests?.length || 0) >= 100 ? 'Remove finished jobs from generation history before queueing more.' : disabled?'Loading project':!frame?'Select a panel to generate its scene.':!comfyConnected?'Launch ComfyUI in this Umbra installation.':!bridge.connected?'Connecting to the shared queue.':selection.error || mangaGenerationResolutionIssue(dimensions,settings.baseResolution,selection.pipeline ? capability.resolution : undefined) || (!settings.checkpointName?'Choose a generation model.':!settings.prompt.trim()?'Describe the scene to generate.':'');
  const generate=async()=>{if(submitting || blocked)return;setSubmitting(true);onSubmitting(true);setIssue('');const projectId=project.id;
    try{const options=buildMangaGenerationOptions(settings,dimensions);
      const fixed=(control:{support:string;value?:unknown},fallback:number)=>control.support!=='adjustable' && typeof control.value==='number'?control.value:fallback;
      options.steps=fixed(capability.steps,options.steps);options.cfg=fixed(capability.guidance,options.cfg);options.seed=fixed(capability.seed,options.seed);
      if(capability.negativePrompt.support!=='adjustable')options.negativePrompt='';
      if(capability.sampler.support!=='adjustable' && typeof capability.sampler.value==='string')options.samplerName=capability.sampler.value;
      if(capability.scheduler.support!=='adjustable' && typeof capability.scheduler.value==='string')options.scheduler=capability.scheduler.value;
      const id=await bridge.queueImage(options);onQueued(projectId,id);
    }catch(error){setIssue(error instanceof Error?error.message:'The scene could not be queued.');}finally{setSubmitting(false);onSubmitting(false);}
  };
  return <div className="manga-generation-panel" hidden={hidden} aria-label="Manga scene generation">
    <p className="manga-hint">{frame?`Panel generation · ${dimensions.width} × ${dimensions.height}`:'Select a panel or one of its image layers.'}</p>
    <label className="manga-field"><span>Scene prompt</span><AutoSizePromptTextarea aria-label="Manga scene prompt" rows={5} value={settings.prompt} onChange={event=>patch({prompt:event.target.value})} /></label>
    <UmbraSelect ariaLabel="Manga model family" value={settings.modelFamily} options={choices(families)} onValueChange={modelFamily=>{const sources=bridge.workflows.flatMap(item=>item.umbraUiPipelines || []).filter(item=>item.feature==='txt2img' && item.modelFamily===modelFamily).flatMap(item=>item.modelSources);const modelType=sources[0] || 'checkpoint';const next=resolveUmbraUiPipeline(bridge.workflows,'txt2img',modelFamily,modelType);patch({...mangaFamilySamplingDefaults(next.pipeline?.defaults),modelFamily,modelType,checkpointName:'',workflowResources:{}});}} />
    <UmbraSelect ariaLabel="Manga model source" value={settings.modelType} options={choices(sources)} onValueChange={value=>patch({modelType:value as MangaGenerationSettings['modelType'],checkpointName:'',workflowResources:{}})} />
    <UmbraSelect ariaLabel="Manga generation model" value={settings.checkpointName} placeholder="Choose a model" options={choices(catalogValues(bridge.modelCatalog,settings.modelType))} onValueChange={checkpointName=>patch({checkpointName})} />
    {(selection.workflow?.resources || []).map(resource=><label className="manga-field" key={resource.id}><span>{resource.label}{resource.required?' *':''}</span><UmbraSelect ariaLabel={`Manga ${resource.label}`} value={settings.workflowResources[resource.id] || resource.defaultValue || ''} options={choices(catalogValues(bridge.modelCatalog,resource.kind))} onValueChange={value=>patch({workflowResources:{...settings.workflowResources,[resource.id]:value}})} /></label>)}
    <label className="manga-field"><span>Long-side resolution</span><UmbraSelect ariaLabel="Manga generation size" value={String(settings.baseResolution)} disabled={!!selection.pipeline && capability.resolution.support!=='adjustable'} options={[...new Set([512,768,1024,1536,2048,settings.baseResolution])].sort((a,b)=>a-b).map(value=>({value:String(value),label:`${value}px long side`}))} onValueChange={value=>patch({baseResolution:Number(value)})} /></label>
    <label className="manga-field"><span>Custom long-side target (px)</span><input aria-label="Manga resolution target" type="number" min={64} step={8} value={settings.baseResolution} disabled={!!selection.pipeline && capability.resolution.support!=='adjustable'} onChange={event=>{if(!event.target.value)return;const value=Number(event.target.value);if(Number.isSafeInteger(Math.round(value)))patch({baseResolution:Math.round(Math.max(64,value))});}} /></label>
    <details><summary>Generation controls</summary>
      <label className="manga-field"><span>Negative prompt</span><AutoSizePromptTextarea aria-label="Manga negative prompt" disabled={capability.negativePrompt.support!=='adjustable'} rows={3} value={settings.negativePrompt} onChange={event=>patch({negativePrompt:event.target.value})} /></label>
      <div className="manga-field-grid">{([{key:'steps',label:'Manga steps',min:1,max:10000,enabled:capability.steps.support==='adjustable'},{key:'cfg',label:'Manga guidance',min:0,max:100,enabled:capability.guidance.support==='adjustable'},{key:'seed',label:'Manga seed',min:0,max:Number.MAX_SAFE_INTEGER,enabled:capability.seed.support==='adjustable'},{key:'samples',label:'Manga options',min:1,max:64,enabled:true}] as const).map(({key,label,min,max,enabled})=><label className="manga-field" key={key}><span>{label.replace('Manga ','')}</span><input type="number" aria-label={label} value={settings[key]} min={min} max={max} step={key==='cfg'?.1:1} disabled={!enabled} onChange={event=>{if(event.target.value==='')return;const value=Number(event.target.value);if(Number.isFinite(value))patch({[key]:Math.max(min,Math.min(max,key==='cfg'?value:Math.round(value)))});}} /></label>)}</div>
      <UmbraSelect ariaLabel="Manga sampler" value={settings.samplerName} disabled={capability.sampler.support!=='adjustable'} options={choices(bridge.modelCatalog.samplers)} onValueChange={samplerName=>patch({samplerName})} />
      <UmbraSelect ariaLabel="Manga scheduler" value={settings.scheduler} disabled={capability.scheduler.support!=='adjustable'} options={choices(Array.from(new Set([settings.scheduler,...(selection.pipeline?.modelFamilyKey==='iris3b'?['iris']:[]),...bridge.modelCatalog.schedulers])))} onValueChange={scheduler=>patch({scheduler})} />
    </details>
    {selection.pipeline && <MangaEnhancementControls settings={settings} capabilities={capability} catalog={bridge.modelCatalog} loras={bridge.loraCatalog} width={dimensions.width} height={dimensions.height} onChange={enhancements=>patch({enhancements})} />}
    <button className="manga-wide" disabled={!!blocked || submitting} title={blocked || 'Generate options into the image tray'} onClick={()=>void generate()}>{submitting?'Queueing scene…':'Generate panel options'}</button>
    {blocked && <p className="manga-hint" role="status">{blocked}</p>}
    <button className="manga-wide" onClick={()=>{bridge.refreshModelCatalog();void bridge.refreshLoraCatalog().catch(()=>{}).finally(()=>{if(mounted.current)setLoraInfoRevision(revision=>revision+1);});}}>Refresh generation models</button>
    {preview && <div><img src={preview.imageDataUrl} alt="Generating Manga scene" style={{width:'100%',height:'auto'}} />{preview.maxStep > 0 && <><progress aria-label="Manga generation progress" max={preview.maxStep} value={preview.step} style={{width:'100%',accentColor:'var(--umbra-accent)'}} /><p className="manga-hint">Step {preview.step} / {preview.maxStep}</p></>}</div>}
    {(issue || recoveryIssue) && <p role="alert" className="manga-hint">{issue || recoveryIssue}</p>}
    {(project.generationRequests || []).slice(-8).reverse().map(request=>{const job=bridge.imageRequestStates.find(item=>item.requestId===request.requestId);return <div className="manga-hint" key={request.requestId}><span>{job?.status || (request.received.length ? 'Recovered results' : 'Waiting for saved results')} · {request.received.length} images in tray</span>{job?.prompts.some(item=>item.error) && <p role="alert">{job.prompts.map(item=>item.error).filter(Boolean).join('\n')}</p>}{(!job || job && ['completed','failed','canceled','interrupted'].includes(job.status)) && <button onClick={() => onForget(request.requestId)}>{job ? 'Remove finished job' : 'Stop recovering this job'}</button>}{job && ['queued','running','pending','staging'].includes(job.status) && <button onClick={()=>void bridge.cancelOwnedImage(request.requestId).catch(error=>setIssue(error.message))}>Cancel this scene</button>}</div>;})}
  </div>;
}
