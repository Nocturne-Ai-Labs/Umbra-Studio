import { ImageIcon } from 'lucide-react';
import { LiveGenerationPreview } from '@/components/privacy/LiveGenerationPreview';
import type { GenerationPreviewState } from './queueCore';

type PowerPrompterQueueManagerSidePaneProps = {
  hasActiveGenerationPreview: boolean;
  generationPreview: GenerationPreviewState | null;
  generationPreviewStatusLabel: string;
  generationPreviewStepLabel: string;
};

export function PowerPrompterQueueManagerSidePane({
  hasActiveGenerationPreview,
  generationPreview,
  generationPreviewStatusLabel,
  generationPreviewStepLabel,
}: PowerPrompterQueueManagerSidePaneProps) {
  return (
    <div data-umbra-queue-manager-side-pane="" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] shadow-lg shadow-emerald-900/20">
      <div className="flex items-center justify-between gap-2 border-b border-emerald-400/20 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Generation Preview</div>
          <div className="truncate text-[10px] uppercase tracking-widest text-emerald-300/80">
            {hasActiveGenerationPreview
              ? `${generationPreviewStatusLabel}${generationPreviewStepLabel ? ` | ${generationPreviewStepLabel}` : ''}`
              : 'Waiting for queue preview'}
          </div>
        </div>
        {hasActiveGenerationPreview && generationPreview?.status === 'running' && (
          <span className="rounded-md border border-emerald-300/55 bg-emerald-500/18 px-1.5 py-1 text-[10px] uppercase tracking-widest text-emerald-100">Live</span>
        )}
      </div>
      <div className="min-h-0 flex-1 p-3">
        <div data-umbra-queue-preview="" className="relative flex h-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/35">
          {hasActiveGenerationPreview && String(generationPreview?.imageDataUrl || '').trim() ? (
            <LiveGenerationPreview
              src={String(generationPreview?.imageDataUrl || '')}
              prompt={generationPreview?.prompt}
              streamKey={`${generationPreview?.requestId}:${generationPreview?.promptIndex}:${generationPreview?.promptId}`}
              alt="Queue manager generation preview"
              className="h-full"
              showRenderingControl
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
              <ImageIcon size={26} className="text-emerald-300/70" />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">Preview Standing By</div>
                <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  Queue Manager will show the active generation here as soon as ComfyUI streams a preview frame.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
