import { LiveGenerationPreview } from '@/components/privacy/LiveGenerationPreview';
import { isUmbraUiInpaintJobTerminal, type UmbraUiInpaintJob, type UmbraUiInpaintPreview } from '@/lib/umbraUiInpaint';
import type { UmbraCanvasPendingJob } from '@/lib/umbraUiCanvasDocument';
import { useInpaintSamplingPreview } from '@/hooks/useInpaintSamplingPreview';

interface WorkspacePreviewProps {
  job: UmbraUiInpaintJob | null;
  context: UmbraCanvasPendingJob | null;
  canvasWidth: number;
  canvasHeight: number;
}

// Sampling frames repaint only this display overlay, never the editable document.
export function UmbraInpaintLivePreviewStream(props: WorkspacePreviewProps) {
  const preview = useInpaintSamplingPreview(props.context?.id === props.job?.id ? props.job : null);
  return <UmbraInpaintLivePreview {...props} preview={preview} />;
}

export function UmbraInpaintLivePreview({ job, preview, context, canvasWidth, canvasHeight }: WorkspacePreviewProps & { preview: UmbraUiInpaintPreview | null }) {
  if (!job || isUmbraUiInpaintJobTerminal(job) || !preview?.imageDataUrl
    || preview.jobId !== job.id || context?.id !== job.id || !context.maskDataUrl
    || canvasWidth <= 0 || canvasHeight <= 0) return null;
  const { region } = context;
  if (![region.x, region.y, region.width, region.height, canvasWidth, canvasHeight].every(Number.isFinite)
    || region.width <= 0 || region.height <= 0) return null;
  const maskImage = `url(${JSON.stringify(context.maskDataUrl)})`;
  return (
    <div data-umbra-inpaint-live-preview="" aria-label="Live sampling preview"
      className="pointer-events-none absolute inset-0 z-[25] overflow-hidden">
      <div data-umbra-inpaint-live-region="" className="absolute" style={{
        left: `${region.x / canvasWidth * 100}%`,
        top: `${region.y / canvasHeight * 100}%`,
        width: `${region.width / canvasWidth * 100}%`,
        height: `${region.height / canvasHeight * 100}%`,
        maskImage, WebkitMaskImage: maskImage,
        maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
        maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskMode: 'alpha',
      }}>
        <LiveGenerationPreview src={preview.imageDataUrl} prompt={job.prompt}
          streamKey={`${job.id}:${preview.itemId}:${preview.promptId}`}
          alt="Live inpaint sampling preview" className="h-full [&_canvas]:object-fill" />
      </div>
    </div>
  );
}
