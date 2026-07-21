import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  formatUmbraUiInpaintPreflightIssue,
  preflightUmbraUiInpaintQualification,
  type UmbraUiQualificationPreflightManifest,
} from './umbra-ui-inpaint-preflight';

const temporaryRoots: string[] = [];

setDefaultTimeout(15_000);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'umbra-inpaint-preflight-'));
  temporaryRoots.push(root);
  await Promise.all([
    mkdir(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints'), { recursive: true }),
    mkdir(join(root, 'Tools', 'ComfyUI', 'models', 'diffusion_models'), { recursive: true }),
    mkdir(join(root, 'Tools', 'ComfyUI', 'models', 'inpaint'), { recursive: true }),
    mkdir(join(root, 'Tools', 'ComfyUI', 'models', 'model_patches'), { recursive: true }),
    writeFile(join(root, 'source.png'), 'fixture'),
  ]);
  return root;
}

function manifest(overrides: Partial<UmbraUiQualificationPreflightManifest['cases'][number]> = {}): UmbraUiQualificationPreflightManifest {
  return {
    sourceImage: 'source.png',
    cases: [{
      id: 'classic',
      modelSource: 'checkpoint',
      checkpointName: 'model.safetensors',
      ...overrides,
    }],
  };
}

describe('Umbra UI inpaint qualification offline preflight', () => {
  test('accepts exact installed resources and non-empty fixtures', async () => {
    const root = await createProject();
    await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints', 'model.safetensors'), 'model');
    const report = await preflightUmbraUiInpaintQualification(manifest(), { projectRoot: root });
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.checks.map((check) => check.status)).toEqual(['available', 'available']);
  });

  test('matches a uniquely nested model by basename but ignores cache metadata', async () => {
    const root = await createProject();
    await mkdir(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints', 'nested'), { recursive: true });
    await mkdir(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints', '.cache'), { recursive: true });
    await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints', 'nested', 'model.safetensors'), 'model');
    await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints', '.cache', 'model.safetensors'), 'cache');
    const report = await preflightUmbraUiInpaintQualification(manifest(), { projectRoot: root });
    expect(report.ok).toBe(true);
    expect(report.checks[1]?.match).toBe('checkpoints/nested/model.safetensors');
  });

  test('reports ambiguous basenames instead of choosing unpredictably', async () => {
    const root = await createProject();
    for (const folder of ['a', 'b']) {
      await mkdir(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints', folder), { recursive: true });
      await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints', folder, 'model.safetensors'), folder);
    }
    const report = await preflightUmbraUiInpaintQualification(manifest(), { projectRoot: root });
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.status).toBe('ambiguous');
    expect(report.issues[0]?.matches).toHaveLength(2);
    expect(formatUmbraUiInpaintPreflightIssue(report.issues[0]!)).toContain('Matches:');
  });

  test('reports the same UNET name installed in both supported roots as ambiguous', async () => {
    const root = await createProject();
    await mkdir(join(root, 'Tools', 'ComfyUI', 'models', 'unet'), { recursive: true });
    await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'unet', 'model.gguf'), 'unet');
    await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'diffusion_models', 'model.gguf'), 'diffusion');
    const report = await preflightUmbraUiInpaintQualification(manifest({
      modelSource: 'gguf',
      checkpointName: 'model.gguf',
    }), { projectRoot: root });
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.status).toBe('ambiguous');
    expect(report.issues[0]?.matches).toEqual([
      'diffusion_models/model.gguf',
      'unet/model.gguf',
    ]);
  });

  test('reports missing and empty fixtures and resources', async () => {
    const root = await createProject();
    await writeFile(join(root, 'source.png'), '');
    const report = await preflightUmbraUiInpaintQualification(manifest({ inpaintModelName: 'MAT.safetensors' }), { projectRoot: root });
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => [issue.kind, issue.status])).toEqual([
      ['fixture', 'empty'],
      ['primary_model', 'missing'],
      ['inpaint_model', 'missing'],
    ]);
  });

  test('checks only the selected provider cases', async () => {
    const root = await createProject();
    await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'checkpoints', 'model.safetensors'), 'model');
    const value = manifest();
    value.cases.push({
      id: 'missing-provider',
      modelSource: 'diffusion_model',
      checkpointName: 'missing.safetensors',
    });
    const report = await preflightUmbraUiInpaintQualification(value, { projectRoot: root, caseIds: ['classic'] });
    expect(report.ok).toBe(true);
    expect(report.checkedCaseIds).toEqual(['classic']);
  });

  test('resolves Z-Image controls through the ModelPatchLoader folder', async () => {
    const root = await createProject();
    await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'diffusion_models', 'z-image.safetensors'), 'model');
    await writeFile(join(root, 'Tools', 'ComfyUI', 'models', 'model_patches', 'z-image-control.safetensors'), 'patch');
    const report = await preflightUmbraUiInpaintQualification(manifest({
      modelSource: 'diffusion_model',
      checkpointName: 'z-image.safetensors',
      controlLayers: [{
        id: 'z-image-control',
        adapterType: 'z_image_control',
        modelName: 'z-image-control.safetensors',
      }],
    }), { projectRoot: root });
    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.kind === 'control_model')?.match)
      .toBe('model_patches/z-image-control.safetensors');
  });
});
