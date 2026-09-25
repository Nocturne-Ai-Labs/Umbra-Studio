import type { UmbraUiPipelineControlCapability } from '../../../../shared/umbra-ui/pipelineTypes';

export function resolveUmbraCanvasGenerationChoice(
  capability: UmbraUiPipelineControlCapability,
  selected: string,
  fallback: string,
): string {
  if (capability.support === 'adjustable') return selected || fallback;
  if (capability.support === 'fixed' && typeof capability.value === 'string') {
    return capability.value || fallback;
  }
  return fallback;
}
