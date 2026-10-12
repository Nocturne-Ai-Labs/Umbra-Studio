import React,{useState} from 'react';
import {UmbraHiresFixControls} from '@/components/umbra-ui/UmbraHiresFixControls';
import {UmbraDetailerPipelineControls} from '@/components/umbra-ui/UmbraDetailerPipelineControls';
import {UmbraTiledVaeControls} from '@/components/umbra-ui/UmbraTiledVaeControls';
import {createUmbraUiLoraEntry,isUmbraUiModelOnlyLoraFamily} from '@/lib/umbraUiModels';
import {UmbraLoraStackControls} from '@/components/umbra-ui/UmbraLoraStackControls';
import {UmbraSelect} from '@/components/ui/UmbraSelect';
import {DEFAULT_POWER_PROMPTER_DETAILER_PIPELINE} from '@/lib/powerPrompter';
import {filterUmbraUiDetailerStages,normalizeUmbraUiModelFamilyKey,type UmbraUiPipelineCapabilities} from '../../../../shared/umbra-ui/pipelineTypes';
import {mangaEnhancements,type MangaGenerationSettings,type MangaEnhancements} from './mangaGeneration';
import type {UmbraModelCatalog} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';

export function MangaEnhancementControls({settings,capabilities,catalog,loras,width,height,onChange}:{settings:MangaGenerationSettings;capabilities:UmbraUiPipelineCapabilities;catalog:UmbraModelCatalog;loras:string[];width:number;height:number;onChange:(value:MangaEnhancements)=>void}) {
  const [picker,setPicker]=useState(false),value=mangaEnhancements(settings),hires=value.hiresFix;
  const patch=(changes:Partial<MangaEnhancements>)=>onChange({...value,...changes});
  const updateHires=(changes:Partial<typeof hires>)=>patch({hiresFix:{...hires,...changes}});
  const number=(raw:string,previous:number)=>raw.trim() && Number.isFinite(Number(raw))?Number(raw):previous;
  const stages=value.detailerPipeline.length ? value.detailerPipeline : DEFAULT_POWER_PROMPTER_DETAILER_PIPELINE.map(stage=>({...stage,enabled:false}));
  const visibleStages=filterUmbraUiDetailerStages(capabilities.detailerStages,stages);
  const updateStages=(changed:typeof stages)=>{
    // Keep settings for stages hidden by this model family when editing visible stages.
    const hidden=stages.filter(stage=>!visibleStages.some(item=>item.id===stage.id));
    if(changed.length+hidden.length<=32)patch({detailerPipeline:[...changed,...hidden]});
  };
  return <div className="manga-enhancement-controls space-y-3">
    {capabilities.loras.support==='adjustable' && <>
      <UmbraLoraStackControls loras={value.loras} availableCount={loras.length} onChange={loras=>patch({loras})} onOpenPicker={()=>setPicker(!picker)} modelOnly={isUmbraUiModelOnlyLoraFamily(settings.modelFamily)} />
      {picker && <UmbraSelect ariaLabel="Add Manga LoRA" value="" placeholder="Choose a LoRA" options={loras.map(name=>({value:name,label:name}))} onValueChange={name=>{if(value.loras.length>=64)return;patch({loras:[...value.loras,createUmbraUiLoraEntry(name,[],normalizeUmbraUiModelFamilyKey(settings.modelFamily))]});setPicker(false);}} />}
    </>}
    {capabilities.clipSkip.support==='adjustable' && <label className="manga-field"><span>CLIP skip</span><input aria-label="Manga CLIP skip" type="number" min={1} max={12} value={value.clipSkip} onChange={event=>patch({clipSkip:Math.max(1,Math.min(12,Math.round(number(event.target.value,value.clipSkip))))})} /></label>}
    {capabilities.hiresFix.support==='adjustable' && <UmbraHiresFixControls enabled={hires.enabled} onEnabledChange={enabled=>updateHires({enabled})} upscaler={hires.upscaler} onUpscalerChange={upscaler=>updateHires({upscaler})} upscaleModels={catalog.upscaleModels} resizeMode={hires.resizeMode} onResizeModeChange={resizeMode=>updateHires({resizeMode})} scaleBy={hires.scaleBy} onScaleByChange={scaleBy=>updateHires({scaleBy})} targetWidth={String(hires.targetWidth)} onTargetWidthChange={raw=>updateHires({targetWidth:number(raw,hires.targetWidth)})} targetHeight={String(hires.targetHeight)} onTargetHeightChange={raw=>updateHires({targetHeight:number(raw,hires.targetHeight)})} baseWidth={width} baseHeight={height} steps={String(hires.steps)} onStepsChange={raw=>updateHires({steps:number(raw,hires.steps)})} denoise={hires.denoise} onDenoiseChange={denoise=>updateHires({denoise})} cfg={String(hires.cfg)} onCfgChange={raw=>updateHires({cfg:number(raw,hires.cfg)})} samplerName={hires.samplerName} onSamplerNameChange={samplerName=>updateHires({samplerName})} scheduler={hires.scheduler} onSchedulerChange={scheduler=>updateHires({scheduler})} samplerOptions={catalog.samplers} schedulerOptions={catalog.schedulers} resizeModes={capabilities.hiresFix.resizeModes} showUpscaler={capabilities.hiresFix.controls.upscaler} showSteps={capabilities.hiresFix.controls.steps} showDenoise={capabilities.hiresFix.controls.denoise} showCfg={capabilities.hiresFix.controls.cfg} showSampler={capabilities.hiresFix.controls.sampler} showScheduler={capabilities.hiresFix.controls.scheduler} />}
    <UmbraDetailerPipelineControls stages={visibleStages} onStagesChange={updateStages} detectorModels={catalog.detectorModels} samModels={catalog.samModels} samplerOptions={catalog.samplers} schedulerOptions={catalog.schedulers} upscaleModels={catalog.upscaleModels} outputUpscale={value.outputUpscale} onOutputUpscaleChange={outputUpscale=>patch({outputUpscale})} showDetailer={capabilities.detailerStages.support==='adjustable'} allowCustomStages={capabilities.detailerStages.customStages} showOutputUpscale={capabilities.finalModelUpscale.support==='adjustable'} showOutputModelSelection={capabilities.finalModelUpscale.modelSelection} showOutputMaxDimension={capabilities.finalModelUpscale.maxDimension} />
    <UmbraTiledVaeControls value={value.tiledVae} onChange={tiledVae=>patch({tiledVae})} mode="txt2img" />
  </div>;
}
