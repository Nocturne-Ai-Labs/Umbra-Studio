import React from 'react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { IMAGE_MEGAPIXEL_PRESETS, IMAGE_ASPECT_RATIOS, imageMegapixels, imageAspectRatio, inferImageMegapixels, resolveImageMegapixels, type ImageSizingBounds } from '../../../../shared/umbra-ui/imageSizing';

interface Props {
  width: number; height: number; bounds?: ImageSizingBounds; disabled?: boolean;
  onChange: (width: number, height: number, sizing: {megapixels:number; aspect:string}) => void;
  selectedMegapixels?:number; selectedAspect?:string;
  sourceRatio?: number; sourceLabel?: string;
}
const inputClass = 'w-full min-w-0 rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400';
export function UmbraMegapixelControls({width, height, bounds = {}, disabled = false, onChange, sourceRatio, sourceLabel = 'Match source', selectedMegapixels, selectedAspect}: Props) {
  const [budget, setBudget] = React.useState(() => inferImageMegapixels(width, height));
  const [aspect, setAspect] = React.useState(() => sourceRatio ? 'source' : imageAspectRatio(width, height));
  const [customBudget, setCustomBudget] = React.useState(() => !IMAGE_MEGAPIXEL_PRESETS.some(value => value === budget));
  const [issue,setIssue] = React.useState('');
  const lastApplied = React.useRef(`${width}:${height}`);
  React.useEffect(() => {
    const key = `${width}:${height}`;
    if (key === lastApplied.current && selectedMegapixels === undefined) return;
    lastApplied.current = key;
    const next = selectedMegapixels ?? inferImageMegapixels(width, height);
    setBudget(next); setCustomBudget(!IMAGE_MEGAPIXEL_PRESETS.some(value => value === next));
    setAspect(selectedAspect ?? (sourceRatio ? 'source' : imageAspectRatio(width, height)));
  }, [width, height, sourceRatio, selectedMegapixels, selectedAspect]);
  const apply = (mp: number, nextAspect: string) => {
    if (!(Number.isFinite(mp) && mp > 0) || disabled) return;
    const [w, h] = nextAspect.split(':').map(Number);
    const ratio = nextAspect === 'source' ? sourceRatio! : nextAspect === 'custom' ? width / height : w / h;
    if (!(Number.isFinite(ratio) && ratio > 0)) return;
    let next;
    try {next = resolveImageMegapixels(mp, ratio, bounds);setIssue('');} catch(error) {setIssue(error instanceof Error ? error.message : 'Invalid image size.');return;}
    lastApplied.current = `${next.width}:${next.height}`;
    setBudget(mp); setAspect(nextAspect); onChange(next.width, next.height, {megapixels:mp,aspect:nextAspect});
  };
  const actual = imageMegapixels(width, height);
  return <div className="min-w-0 space-y-2" onClick={event => event.stopPropagation()}>
    <div className="grid grid-cols-2 gap-2">
      <label className="min-w-0 space-y-1"><span className={labelClass}>Pixel budget</span><UmbraSelect ariaLabel="Image megapixels" menuTitle="Pixel budget" disabled={disabled} value={customBudget ? 'custom' : String(budget)} options={[...IMAGE_MEGAPIXEL_PRESETS.map(value => ({value: String(value), label: `${value} MP`})), {value:'custom',label:'Custom MP'}]} onValueChange={value => {setCustomBudget(value === 'custom'); if(value !== 'custom') apply(Number(value), aspect);}} /></label>
      <label className="min-w-0 space-y-1"><span className={labelClass}>Aspect ratio</span><UmbraSelect ariaLabel="Image aspect ratio" menuTitle="Aspect ratio" disabled={disabled} value={aspect} options={[...(sourceRatio ? [{value:'source',label:sourceLabel}] : []), ...IMAGE_ASPECT_RATIOS.map(value => ({value,label:value})), {value:'custom',label:'Custom / current'}]} onValueChange={value => apply(budget, value)} /></label>
    </div>
    {customBudget && <label className="block space-y-1"><span className={labelClass}>Custom megapixels</span><input type="number" aria-label="Custom megapixels" min={0.001} step="any" value={budget} disabled={disabled} onChange={event => apply(Number(event.target.value), aspect)} className={inputClass} /></label>}
    <p className="font-mono text-[10px] text-cyan-100" aria-live="polite">{width} × {height} · {Number.isFinite(actual) ? actual.toFixed(2) : '—'} MP</p>
    {Number.isFinite(actual) && Math.abs(actual - budget) / budget > 0.08 && <p className="text-[10px] text-amber-200">Pipeline dimension limits adjusted this target. Actual size is shown above.</p>}
    {issue && <p role="alert" className="text-[10px] text-amber-200">{issue}</p>}
    <details><summary className="cursor-pointer text-[10px] text-zinc-400">Custom dimensions</summary><div className="mt-2 grid grid-cols-2 gap-2">{(['width','height'] as const).map(key => <label key={key} className="space-y-1"><span className={labelClass}>{key}</span><input type="number" aria-label={`Image ${key}`} min={key === 'width' ? bounds.minimumWidth || 64 : bounds.minimumHeight || 64} step={bounds.step || 8} value={key === 'width' ? width : height} disabled={disabled} onChange={event => {const value = Number(event.target.value); if(!Number.isSafeInteger(value) || value <= 0) return; setAspect('custom'); const w=key === 'width' ? value : width, h=key === 'height' ? value : height; onChange(w,h,{megapixels:imageMegapixels(w,h),aspect:'custom'});}} className={inputClass} /></label>)}</div></details>
  </div>;
}
