import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { PowerPrompterApiWorkflowItem } from '@/components/power-prompter/powerPrompterSupport';
import { createApiWorkflowTargetId } from '@/components/power-prompter/powerPrompterSupport';
import {
  UMBRA_UI_AUTO_PIPELINE_ID,
  normalizeUmbraUiModelFamilyKey,
  normalizeUmbraUiPipelineFeature,
  normalizeUmbraUiPipelineModelSources,
  type UmbraUiPipelineDescriptor,
} from '../../../../../shared/umbra-ui/pipelineTypes';

export interface UsePowerPrompterApiWorkflowsOptions {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onImportedWorkflowTarget?: (targetId: string) => void;
}

export interface UsePowerPrompterApiWorkflowsResult {
  apiWorkflowItems: PowerPrompterApiWorkflowItem[];
  apiWorkflowImporting: boolean;
  apiWorkflowFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  refreshApiWorkflowItems: (showErrorToast?: boolean) => Promise<void>;
  handleImportApiWorkflowClick: () => void;
  handleImportApiWorkflowFile: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

function normalizeApiWorkflowItem(entry: any): PowerPrompterApiWorkflowItem | null {
  const id = String(entry?.id || '').trim();
  if (!id) return null;
  const umbraUiPipelines = (Array.isArray(entry?.umbraUiPipelines) ? entry.umbraUiPipelines : [])
    .map((pipeline: any): UmbraUiPipelineDescriptor | null => {
      const feature = normalizeUmbraUiPipelineFeature(pipeline?.feature);
      const modelFamily = String(pipeline?.modelFamily || '').trim();
      const modelFamilyKey = normalizeUmbraUiModelFamilyKey(modelFamily);
      const modelSources = normalizeUmbraUiPipelineModelSources(pipeline?.modelSources);
      if (!feature || !modelFamily || !modelFamilyKey || modelSources.length <= 0) return null;
      return {
        feature,
        modelFamily,
        modelFamilyKey,
        modelSources,
        priority: Number.isFinite(Number(pipeline?.priority)) ? Math.floor(Number(pipeline.priority)) : 0,
        locked: true,
        ...(pipeline?.inpaintAdapter ? { inpaintAdapter: pipeline.inpaintAdapter } : {}),
        ...(pipeline?.inpaintCanvas ? { inpaintCanvas: pipeline.inpaintCanvas } : {}),
      };
    })
    .filter((pipeline: UmbraUiPipelineDescriptor | null): pipeline is UmbraUiPipelineDescriptor => !!pipeline);
  return {
    id,
    fileName: String(entry?.fileName || '').trim() || `${id}.json`,
    name: String(entry?.name || id).trim() || id,
    compatible: entry?.compatible !== false,
    missing: Array.isArray(entry?.missing)
      ? entry.missing
        .map((value: unknown) => String(value || '').trim())
        .filter((value: string) => value.length > 0)
      : [],
    modelFamily: String(entry?.modelFamily || '').trim() || undefined,
    umbraUiPipelines,
    updatedAt: Number.isFinite(Number(entry?.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
  };
}

function createUmbraUiAutoWorkflowItem(items: PowerPrompterApiWorkflowItem[]): PowerPrompterApiWorkflowItem {
  const pipelineItems = items.filter((item) => (item.umbraUiPipelines || []).length > 0);
  const compatible = pipelineItems.some((item) => item.compatible);
  const missing = compatible
    ? []
    : Array.from(new Set(pipelineItems.flatMap((item) => item.missing))).slice(0, 30);
  return {
    id: UMBRA_UI_AUTO_PIPELINE_ID,
    fileName: '',
    name: 'Umbra UI (Auto)',
    compatible,
    missing: pipelineItems.length > 0 ? missing : ['No locked Umbra UI pipelines are installed'],
    virtual: true,
    umbraUiAuto: true,
    updatedAt: Math.max(0, ...pipelineItems.map((item) => item.updatedAt)),
  };
}

export function usePowerPrompterApiWorkflows({
  showToast,
  onImportedWorkflowTarget,
}: UsePowerPrompterApiWorkflowsOptions): UsePowerPrompterApiWorkflowsResult {
  const [apiWorkflowItems, setApiWorkflowItems] = useState<PowerPrompterApiWorkflowItem[]>([]);
  const [apiWorkflowImporting, setApiWorkflowImporting] = useState(false);
  const apiWorkflowFileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshApiWorkflowItems = useCallback(async (showErrorToast = false) => {
    try {
      const response = await fetch('/api/powerprompter/api-workflows');
      if (!response.ok) {
        throw new Error(`Failed to load API workflows (${response.status})`);
      }
      const payload = await response.json().catch(() => ({}));
      const items = Array.isArray(payload?.items)
        ? payload.items
          .map(normalizeApiWorkflowItem)
          .filter((entry: PowerPrompterApiWorkflowItem | null): entry is PowerPrompterApiWorkflowItem => !!entry)
        : [];
      const manualItems = items.filter((item) => (item.umbraUiPipelines || []).length <= 0);
      setApiWorkflowItems([createUmbraUiAutoWorkflowItem(items), ...manualItems]);
    } catch (error: any) {
      if (showErrorToast) {
        showToast(String(error?.message || 'Failed to load API workflows'), 'error');
      }
    }
  }, [showToast]);

  useEffect(() => {
    void refreshApiWorkflowItems(false);
  }, [refreshApiWorkflowItems]);

  const handleImportApiWorkflowClick = useCallback(() => {
    if (apiWorkflowImporting) return;
    apiWorkflowFileInputRef.current?.click();
  }, [apiWorkflowImporting]);

  const handleImportApiWorkflowFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    if (apiWorkflowImporting) return;
    setApiWorkflowImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/powerprompter/api-workflows/import', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || 'Failed to import API workflow'));
      }
      const importedId = String(payload?.item?.id || '').trim();
      await refreshApiWorkflowItems(false);
      if (importedId) {
        onImportedWorkflowTarget?.(createApiWorkflowTargetId(importedId));
      }
      showToast(`Imported API workflow: ${String(payload?.item?.name || file.name)}`, 'success');
    } catch (error: any) {
      showToast(String(error?.message || 'Failed to import API workflow'), 'error');
    } finally {
      setApiWorkflowImporting(false);
    }
  }, [apiWorkflowImporting, onImportedWorkflowTarget, refreshApiWorkflowItems, showToast]);

  return {
    apiWorkflowItems,
    apiWorkflowImporting,
    apiWorkflowFileInputRef,
    refreshApiWorkflowItems,
    handleImportApiWorkflowClick,
    handleImportApiWorkflowFile,
  };
}
