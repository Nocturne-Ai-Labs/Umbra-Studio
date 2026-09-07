import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { LiveGenerationPreview } from '@/components/privacy/LiveGenerationPreview';
import { isUmbraUiInpaintJobTerminal, type UmbraUiInpaintJob, type UmbraUiInpaintPreview } from '@/lib/umbraUiInpaint';
import { useInpaintSamplingPreview } from '@/hooks/useInpaintSamplingPreview';

// Sampling frames should repaint the preview, not the entire layered editor.
export function UmbraInpaintLivePreviewStream({ job }: { job: UmbraUiInpaintJob | null }) {
  const preview = useInpaintSamplingPreview(job);
  return <UmbraInpaintLivePreview job={job} preview={preview} />;
}

export function UmbraInpaintLivePreview({ job, preview }: { job: UmbraUiInpaintJob | null; preview: UmbraUiInpaintPreview | null }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!job || isUmbraUiInpaintJobTerminal(job)) return null;
  const sample = preview ? job.items.findIndex((item) => item.id === preview.itemId) + 1 : 0;
  return <section data-umbra-inpaint-live-preview="" aria-label="Live sampling preview" className="w-56 max-w-full overflow-hidden rounded-md border border-white/20 bg-zinc-950 text-zinc-200 shadow-lg"
    onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()}
    onPointerUp={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    <button type="button" aria-label={collapsed ? 'Expand live preview' : 'Collapse live preview'} aria-expanded={!collapsed}
      onClick={() => setCollapsed((current) => !current)} className="flex min-h-9 w-full items-center gap-2 px-2 text-left text-[11px]">
      <Loader2 size={12} className="shrink-0 animate-spin" /><span className="min-w-0 flex-1">Live preview</span>
      {preview?.maxStep ? <span className="font-mono text-[10px]">{preview.step}/{preview.maxStep}</span> : null}
      {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
    {!collapsed ? <>
      {preview?.imageDataUrl ? <LiveGenerationPreview src={preview.imageDataUrl} prompt={job.prompt}
        streamKey={`${job.id}:${preview.itemId}:${preview.promptId}`} alt="Live inpaint sampling preview" className="h-44 max-h-[30vh]" showRenderingControl />
        : <div className="flex h-44 max-h-[30vh] items-center justify-center bg-black text-[11px] text-zinc-500">Waiting for sampling preview</div>}
      <div className="px-2 py-1 text-[10px] text-zinc-400">{sample > 0 ? `Sample ${sample}/${job.total}` : `${job.completed}/${job.total} completed`}</div>
    </> : null}
  </section>;
}
