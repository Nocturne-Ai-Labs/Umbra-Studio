import { useCallback, useEffect, useState } from 'react';
import {
  normalizeUmbraUiModelFamilyKey,
  normalizeUmbraUiPipelineFeature,
  normalizeUmbraUiPipelineModelSources,
  type UmbraUiPipelineDescriptor,
} from '../../../../../shared/umbra-ui/pipelineTypes';

export interface PowerPrompterPipelineItem extends UmbraUiPipelineDescriptor {
  workflowId: string;
  workflowName: string;
  compatible: boolean;
  missing: string[];
  updatedAt: number;
}

function normalizePipelineItem(value: unknown): PowerPrompterPipelineItem | null {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
  const feature = normalizeUmbraUiPipelineFeature(source.feature);
  const modelFamily = String(source.modelFamily || '').trim();
  const modelFamilyKey = normalizeUmbraUiModelFamilyKey(source.modelFamilyKey || modelFamily);
  const modelSources = normalizeUmbraUiPipelineModelSources(source.modelSources);
  if (!feature || !modelFamily || !modelFamilyKey || modelSources.length <= 0) return null;
  return {
    ...source,
    feature,
    modelFamily,
    modelFamilyKey,
    modelSources,
    priority: Number.isFinite(Number(source.priority)) ? Math.floor(Number(source.priority)) : 0,
    locked: true,
    workflowId: String(source.workflowId || '').trim(),
    workflowName: String(source.workflowName || source.workflowId || modelFamily).trim(),
    compatible: source.compatible !== false,
    missing: Array.isArray(source.missing)
      ? source.missing.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
      : [],
    updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : 0,
  } as PowerPrompterPipelineItem;
}

export function usePowerPrompterPipelines(
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void,
) {
  const [pipelines, setPipelines] = useState<PowerPrompterPipelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (showErrorToast = false) => {
    setLoading(true);
    try {
      const response = await fetch('/api/umbra-ui/pipelines', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || `Failed to load pipelines (${response.status})`));
      }
      const items = (Array.isArray(payload?.pipelines) ? payload.pipelines : [])
        .map(normalizePipelineItem)
        .filter((entry: PowerPrompterPipelineItem | null): entry is PowerPrompterPipelineItem => !!entry)
        .filter((entry: PowerPrompterPipelineItem) => entry.feature === 'txt2img');
      setPipelines(items);
    } catch (error: any) {
      if (showErrorToast) showToast(String(error?.message || 'Failed to load generation pipelines.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return { pipelines, loading, refresh };
}
