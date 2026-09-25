import type { UmbraUiPipelineResolutionCapability } from '../../../../shared/umbra-ui/pipelineTypes';

export function getUmbraCanvasGenerationResolutionIssue(
  size: { width: number; height: number },
  capability: UmbraUiPipelineResolutionCapability,
): string {
  const width = Math.round(size.width);
  const height = Math.round(size.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return 'Enter a valid Canvas generation box width and height before generating.';
  }

  const minimumWidth = Math.max(64, Math.round(capability.minimumWidth ?? 64));
  const minimumHeight = Math.max(64, Math.round(capability.minimumHeight ?? 64));
  const maximumWidth = Math.max(minimumWidth, Math.min(16384, Math.round(capability.maximumWidth ?? 16384)));
  const maximumHeight = Math.max(minimumHeight, Math.min(16384, Math.round(capability.maximumHeight ?? 16384)));
  if (width < minimumWidth || width > maximumWidth || height < minimumHeight || height > maximumHeight) {
    return `This pipeline requires a Canvas generation box ${minimumWidth}-${maximumWidth}px wide and ${minimumHeight}-${maximumHeight}px high. Change W/H before generating.`;
  }

  const step = Math.max(1, Math.round(capability.step ?? 8));
  if (width % step !== 0 || height % step !== 0) {
    return `This pipeline requires Canvas W/H in multiples of ${step}px. Change the ${width} x ${height} generation box before generating.`;
  }
  return '';
}
