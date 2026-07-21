import { useCallback, useEffect, useState } from 'react';

export interface PowerPrompterStageCatalog {
  detectorModels: string[];
  samModels: string[];
  upscaleModels: string[];
  loading: boolean;
  error: string;
}

const EMPTY_STAGE_CATALOG: PowerPrompterStageCatalog = {
  detectorModels: [],
  samModels: [],
  upscaleModels: [],
  loading: true,
  error: '',
};

function readObjectInfoChoices(requiredInputs: Record<string, unknown>, inputName: string): string[] {
  const descriptor = requiredInputs[inputName];
  if (!Array.isArray(descriptor)) return [];
  const directChoices = Array.isArray(descriptor[0]) ? descriptor[0] : [];
  const comboOptions = descriptor[0] === 'COMBO'
    && descriptor[1]
    && typeof descriptor[1] === 'object'
    && Array.isArray((descriptor[1] as Record<string, unknown>).options)
    ? (descriptor[1] as Record<string, unknown>).options as unknown[]
    : [];
  return Array.from(new Set(
    [...directChoices, ...comboOptions]
      .map((entry) => String(entry || '').trim().replace(/\\/g, '/'))
      .filter((entry) => entry.length > 0 && !['[none]', 'none'].includes(entry.toLowerCase())),
  ));
}

function readRequiredInputs(payload: unknown, nodeType: string): Record<string, unknown> {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const node = root[nodeType] && typeof root[nodeType] === 'object' && !Array.isArray(root[nodeType])
    ? root[nodeType] as Record<string, unknown>
    : root;
  const input = node.input && typeof node.input === 'object' && !Array.isArray(node.input)
    ? node.input as Record<string, unknown>
    : {};
  return input.required && typeof input.required === 'object' && !Array.isArray(input.required)
    ? input.required as Record<string, unknown>
    : {};
}

async function fetchNodeRequiredInputs(nodeType: string): Promise<Record<string, unknown>> {
  const response = await fetch(`/object_info/${encodeURIComponent(nodeType)}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${nodeType} catalog returned ${response.status}.`);
  return readRequiredInputs(payload, nodeType);
}

export function usePowerPrompterStageCatalog(active = true) {
  const [catalog, setCatalog] = useState<PowerPrompterStageCatalog>(EMPTY_STAGE_CATALOG);

  const refresh = useCallback(async () => {
    if (!active) return;
    setCatalog((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [detectorInputs, samInputs, upscaleInputs] = await Promise.all([
        fetchNodeRequiredInputs('UltralyticsDetectorProvider').catch(() => ({})),
        fetchNodeRequiredInputs('SAMLoader').catch(() => ({})),
        fetchNodeRequiredInputs('UpscaleModelLoader').catch(() => ({})),
      ]);
      setCatalog({
        detectorModels: readObjectInfoChoices(detectorInputs, 'model_name'),
        samModels: readObjectInfoChoices(samInputs, 'model_name'),
        upscaleModels: readObjectInfoChoices(upscaleInputs, 'model_name'),
        loading: false,
        error: '',
      });
    } catch (error) {
      setCatalog((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load optional pipeline models.',
      }));
    }
  }, [active]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { catalog, refresh };
}
