import {
  matchUmbraUiPipelineDescriptors,
  normalizeUmbraUiModelFamilyKey,
  normalizeUmbraUiPipelineFeature,
  normalizeUmbraUiPipelineModelSources,
  type UmbraUiPipelineDescriptor,
  type UmbraUiPipelineFeature,
  type UmbraUiPipelineModelSource,
} from '../../../shared/umbra-ui/pipelineTypes';

export interface UmbraUiPipelineWorkflowItem {
  id: string;
  name: string;
  compatible: boolean;
  missing?: string[];
  umbraUiPipelines?: UmbraUiPipelineDescriptor[];
}

export interface UmbraUiPipelineMatch<T extends UmbraUiPipelineWorkflowItem> {
  workflow: T | null;
  pipeline: UmbraUiPipelineDescriptor | null;
  error: string;
}

export function listUmbraUiPipelineFamilies<T extends UmbraUiPipelineWorkflowItem>(
  workflows: T[],
  featureInput: UmbraUiPipelineFeature | string,
): string[] {
  const feature = normalizeUmbraUiPipelineFeature(featureInput);
  if (!feature) return [];
  return Array.from(new Map(workflows.flatMap((workflow) => workflow.umbraUiPipelines || [])
    .filter((pipeline) => pipeline.feature === feature)
    .map((pipeline) => [pipeline.modelFamilyKey, pipeline.modelFamily] as const)).values())
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export function resolveUmbraUiPipeline<T extends UmbraUiPipelineWorkflowItem>(
  workflows: T[],
  featureInput: UmbraUiPipelineFeature | string,
  modelFamilyInput: string,
  modelSourceInput: UmbraUiPipelineModelSource | string,
): UmbraUiPipelineMatch<T> {
  const feature = normalizeUmbraUiPipelineFeature(featureInput);
  if (!feature) return { workflow: null, pipeline: null, error: 'Generation feature is missing or invalid.' };
  const modelFamily = String(modelFamilyInput || '').trim();
  const modelFamilyKey = normalizeUmbraUiModelFamilyKey(modelFamily);
  if (!modelFamilyKey) return { workflow: null, pipeline: null, error: 'Choose a model family.' };
  const modelSource = normalizeUmbraUiPipelineModelSources(modelSourceInput)[0];
  if (!modelSource) return { workflow: null, pipeline: null, error: 'Choose a supported model source.' };

  const familyMatches = workflows.flatMap((workflow) => (workflow.umbraUiPipelines || [])
    .filter((pipeline) => pipeline.feature === feature && pipeline.modelFamilyKey === modelFamilyKey)
    .map((pipeline) => ({ workflow, pipeline })));
  if (familyMatches.length <= 0) {
    return { workflow: null, pipeline: null, error: `No locked Umbra UI ${feature} pipeline is installed for ${modelFamily}.` };
  }
  const exactPipelines = new Set(matchUmbraUiPipelineDescriptors(
    familyMatches.map(({ pipeline }) => pipeline),
    feature,
    modelFamily,
    modelSource,
  ));
  const sourceMatches = familyMatches.filter(({ pipeline }) => exactPipelines.has(pipeline));
  if (sourceMatches.length <= 0) {
    const accepted = Array.from(new Set(familyMatches.flatMap(({ pipeline }) => pipeline.modelSources))).join(', ');
    return { workflow: null, pipeline: null, error: `${modelFamily} ${feature} accepts ${accepted || 'no installed model sources'}, not ${modelSource}.` };
  }
  const compatibleMatches = sourceMatches.filter(({ workflow, pipeline }) => (
    pipeline.readiness?.graph.status === 'valid'
    || (pipeline.readiness?.graph.status == null && workflow.compatible)
    || (pipeline.readiness?.graph.status === 'unknown' && workflow.compatible)
  ));
  if (compatibleMatches.length <= 0) {
    const missing = Array.from(new Set(sourceMatches.flatMap(({ workflow, pipeline }) => (
      pipeline.readiness?.graph.issues?.length
        ? pipeline.readiness.graph.issues
        : workflow.missing || []
    )))).join(', ');
    return { workflow: null, pipeline: null, error: `${modelFamily} ${feature} is unavailable${missing ? `: ${missing}` : '.'}` };
  }
  const sorted = [...compatibleMatches].sort((left, right) => (
    right.pipeline.priority - left.pipeline.priority
    || left.workflow.id.localeCompare(right.workflow.id, undefined, { sensitivity: 'base' })
  ));
  if (sorted.length > 1 && sorted[0].pipeline.priority === sorted[1].pipeline.priority) {
    return { workflow: null, pipeline: null, error: `Multiple ${modelFamily} ${feature} pipelines share priority ${sorted[0].pipeline.priority}.` };
  }
  return { ...sorted[0], error: '' };
}
