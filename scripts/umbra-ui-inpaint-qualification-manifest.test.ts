import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface ManifestCase {
  id?: string;
  modelFamily?: string;
  expectedAdapter?: string;
  operationMode?: string;
  enabled?: boolean;
  regionalGuidance?: Array<{
    positivePrompt?: string;
    negativePrompt?: string;
    autoNegative?: boolean;
  }>;
  referenceLayers?: Array<{ method?: string }>;
  controlLayers?: Array<{ adapterType?: string; controlMode?: string }>;
}

interface PipelineDescriptor {
  feature?: string;
  model_family?: string;
  inpaint_adapter?: string;
}

describe('Umbra UI inpaint qualification manifest coverage', () => {
  test('records every shipped locked inpaint provider, including deliberately disabled providers', async () => {
    const projectRoot = resolve(import.meta.dir, '..');
    const manifest = JSON.parse(await readFile(
      join(projectRoot, 'scripts', 'fixtures', 'umbra-ui-inpaint-qualification.example.json'),
      'utf8',
    )) as { cases?: ManifestCase[] };
    const covered = new Set((manifest.cases || []).map((item) => (
      `${String(item.modelFamily || '').trim()}::${String(item.expectedAdapter || '').trim()}`
    )));
    const workflowsRoot = join(projectRoot, 'defaults', 'PowerPrompter', 'API Workflows');
    const workflowFiles = (await readdir(workflowsRoot)).filter((name) => name.endsWith('.json'));
    const shipped = new Set<string>();

    for (const name of workflowFiles) {
      const graph = JSON.parse(await readFile(join(workflowsRoot, name), 'utf8')) as Record<string, {
        _meta?: { umbra_ui_pipelines?: PipelineDescriptor[] };
      }>;
      for (const node of Object.values(graph)) {
        for (const descriptor of node?._meta?.umbra_ui_pipelines || []) {
          if (descriptor.feature !== 'inpainting') continue;
          shipped.add(`${String(descriptor.model_family || '').trim()}::${String(descriptor.inpaint_adapter || '').trim()}`);
        }
      }
    }

    expect(Array.from(shipped).sort()).not.toEqual([]);
    expect(Array.from(shipped).filter((provider) => !covered.has(provider)).sort()).toEqual([]);

    const operationCoverage = new Set((manifest.cases || []).map((item) => (
      `${String(item.modelFamily || '').trim()}::${String(item.expectedAdapter || '').trim()}::${String(item.operationMode || '').trim()}`
    )));
    const missingOperations = Array.from(shipped).flatMap((provider) => (
      ['inpaint', 'outpaint']
        .map((operation) => `${provider}::${operation}`)
        .filter((key) => !operationCoverage.has(key))
    ));
    expect(missingOperations.sort()).toEqual([]);
  });

  test('records branch-correct regional qualification cases for exact providers', async () => {
    const projectRoot = resolve(import.meta.dir, '..');
    const manifest = JSON.parse(await readFile(
      join(projectRoot, 'scripts', 'fixtures', 'umbra-ui-inpaint-qualification.example.json'),
      'utf8',
    )) as { cases?: ManifestCase[] };
    const cases = new Map((manifest.cases || []).map((item) => [item.id, item]));
    const requireRegion = (id: string) => {
      const region = cases.get(id)?.regionalGuidance?.[0];
      expect(region?.positivePrompt?.trim()).not.toBe('');
      return region;
    };

    const classic = requireRegion('classic-illustrious-inpaint');
    expect(classic?.negativePrompt?.trim()).not.toBe('');
    expect(classic?.autoNegative).toBe(true);

    for (const id of ['qwen-controlnet-inpaint', 'hidream-o1-native-inpaint', 'zimage-turbo-native-inpaint']) {
      const paired = requireRegion(id);
      expect(paired?.negativePrompt?.trim()).not.toBe('');
      expect(paired?.autoNegative).toBe(true);
    }

    for (const id of ['flux-fill-inpaint', 'flux2-edit-native-inpaint']) {
      const positiveOnly = requireRegion(id);
      expect(positiveOnly?.negativePrompt || '').toBe('');
      expect(positiveOnly?.autoNegative).toBe(false);
    }
    expect(cases.get('flux2-edit-native-inpaint')?.enabled).toBe(false);
    expect(cases.get('hidream-o1-native-inpaint')?.referenceLayers?.[0]?.method).toBe('hidream_o1_reference');
    expect(cases.get('flux2-edit-native-inpaint')?.referenceLayers?.[0]?.method).toBe('flux2_reference');
    expect(cases.get('classic-illustrious-control-lora-inpaint')?.controlLayers?.[0]).toMatchObject({
      adapterType: 'control_lora',
      controlMode: 'balanced',
    });
  });
});
