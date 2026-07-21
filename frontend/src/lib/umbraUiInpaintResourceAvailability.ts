import type {
  UmbraUiInpaintControlAdapterType,
  UmbraUiInpaintReferenceMethod,
} from '../../../shared/umbra-ui/pipelineTypes';

export interface UmbraUiInpaintResourceCatalog {
  controlModels: string[];
  animaLlliteAvailable: boolean;
  animaLlliteModels: string[];
  modelPatchModels: string[];
  styleModels: string[];
  ipAdapterModels: string[];
  visionModels: string[];
}

export interface UmbraUiInpaintMethodAvailability<T extends string> {
  methods: T[];
  reason: string;
}

function hasItems(values: string[]): boolean {
  return Array.isArray(values) && values.some((value) => String(value || '').trim().length > 0);
}

export function resolveUmbraUiInpaintControlAvailability(
  declared: UmbraUiInpaintControlAdapterType[],
  catalog: UmbraUiInpaintResourceCatalog,
): UmbraUiInpaintMethodAvailability<UmbraUiInpaintControlAdapterType> {
  const methods = declared.filter((adapterType) => {
    if (adapterType === 'anima_lllite') {
      return catalog.animaLlliteAvailable && hasItems(catalog.animaLlliteModels);
    }
    if (adapterType === 'z_image_control') return hasItems(catalog.modelPatchModels);
    return hasItems(catalog.controlModels);
  });
  if (methods.length > 0 || declared.length <= 0) return { methods, reason: '' };
  if (declared.every((adapterType) => adapterType === 'anima_lllite')) {
    return { methods, reason: 'Install the Anima LLLite provider and compatible weights to use Control layers.' };
  }
  if (declared.every((adapterType) => adapterType === 'z_image_control')) {
    return { methods, reason: 'Install a compatible Z-Image model patch to use Control layers.' };
  }
  return { methods, reason: 'Install a control model compatible with this locked pipeline to use Control layers.' };
}

export function resolveUmbraUiInpaintReferenceAvailability(
  declared: UmbraUiInpaintReferenceMethod[],
  catalog: UmbraUiInpaintResourceCatalog,
): UmbraUiInpaintMethodAvailability<UmbraUiInpaintReferenceMethod> {
  const methods = declared.filter((method) => {
    if (method === 'style_model' || method === 'flux_redux') {
      return hasItems(catalog.styleModels) && hasItems(catalog.visionModels);
    }
    if (method === 'ip_adapter') {
      return hasItems(catalog.ipAdapterModels) && hasItems(catalog.visionModels);
    }
    return true;
  });
  if (methods.length > 0 || declared.length <= 0) return { methods, reason: '' };
  if (declared.every((method) => method === 'ip_adapter')) {
    return { methods, reason: 'Install both a compatible IP Adapter model and CLIP Vision encoder to use Reference layers.' };
  }
  if (declared.every((method) => method === 'style_model' || method === 'flux_redux')) {
    return { methods, reason: 'Install both a compatible style model and CLIP Vision encoder to use Reference layers.' };
  }
  return { methods, reason: 'The installed resources do not satisfy this pipeline\'s declared Reference method.' };
}
