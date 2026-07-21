import { readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { normalizeUmbraUiResourceRelativePath } from '../shared/umbra-ui/pipelineTypes';

export type UmbraUiQualificationModelSource = 'checkpoint' | 'diffusers' | 'diffusion_model' | 'unet' | 'gguf';

export interface UmbraUiQualificationFileReference {
  id?: string;
  maskPath?: string;
  imagePath?: string;
}

export interface UmbraUiQualificationControlReference extends UmbraUiQualificationFileReference {
  adapterType?: string;
  modelName?: string;
}

export interface UmbraUiQualificationModelReference extends UmbraUiQualificationFileReference {
  modelName?: string;
  visionModelName?: string;
}

export interface UmbraUiQualificationPreflightCase {
  id: string;
  enabled?: boolean;
  sourceImage?: string;
  maskImage?: string;
  modelSource: UmbraUiQualificationModelSource;
  checkpointName: string;
  inpaintModelName?: string;
  regionalGuidance?: UmbraUiQualificationFileReference[];
  controlLayers?: UmbraUiQualificationControlReference[];
  referenceLayers?: UmbraUiQualificationModelReference[];
}

export interface UmbraUiQualificationPreflightManifest {
  sourceImage: string;
  maskImage?: string;
  modelsRoot?: string;
  cases: UmbraUiQualificationPreflightCase[];
}

export type UmbraUiQualificationPreflightStatus = 'available' | 'missing' | 'ambiguous' | 'empty';

export interface UmbraUiQualificationPreflightCheck {
  caseId: string;
  kind: 'fixture' | 'primary_model' | 'inpaint_model' | 'control_model' | 'reference_model' | 'vision_model';
  label: string;
  requested: string;
  status: UmbraUiQualificationPreflightStatus;
  match: string;
  matches: string[];
  searchedRoots: string[];
}

export interface UmbraUiQualificationPreflightReport {
  ok: boolean;
  projectRoot: string;
  modelsRoot: string;
  checkedCaseIds: string[];
  checks: UmbraUiQualificationPreflightCheck[];
  issues: UmbraUiQualificationPreflightCheck[];
}

const MODEL_ROOTS: Record<UmbraUiQualificationModelSource, string[]> = {
  checkpoint: ['checkpoints'],
  diffusers: ['diffusers'],
  diffusion_model: ['diffusion_models'],
  unet: ['unet', 'diffusion_models'],
  gguf: ['diffusion_models', 'unet'],
};

function controlModelRoots(control: UmbraUiQualificationControlReference): string[] {
  return String(control.adapterType || '').trim().toLowerCase() === 'z_image_control'
    ? ['model_patches']
    : ['controlnet'];
}

async function readCatalog(root: string): Promise<string[]> {
  const catalog: string[] = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.cache') continue;
      const relativePath = normalizeUmbraUiResourceRelativePath(prefix ? `${prefix}/${entry.name}` : entry.name);
      if (!relativePath) continue;
      if (entry.isDirectory()) {
        catalog.push(relativePath);
        await walk(resolve(directory, entry.name), relativePath);
      } else if (entry.isFile()) {
        catalog.push(relativePath);
      }
    }
  }
  await walk(root, '');
  return catalog;
}

async function checkFixture(
  projectRoot: string,
  caseId: string,
  label: string,
  requested: string,
): Promise<UmbraUiQualificationPreflightCheck> {
  const absolutePath = resolve(projectRoot, requested);
  let status: UmbraUiQualificationPreflightStatus = 'missing';
  try {
    const info = await stat(absolutePath);
    status = info.isFile() && info.size > 0 ? 'available' : info.isFile() ? 'empty' : 'missing';
  } catch {
    status = 'missing';
  }
  return {
    caseId,
    kind: 'fixture',
    label,
    requested,
    status,
    match: status === 'available' ? absolutePath : '',
    matches: status === 'available' ? [absolutePath] : [],
    searchedRoots: [projectRoot],
  };
}

async function checkModel(
  modelsRoot: string,
  catalogs: Map<string, string[]>,
  caseId: string,
  kind: Exclude<UmbraUiQualificationPreflightCheck['kind'], 'fixture'>,
  label: string,
  requested: string,
  roots: string[],
): Promise<UmbraUiQualificationPreflightCheck> {
  const normalizedRequested = normalizeUmbraUiResourceRelativePath(requested);
  const candidates: string[] = [];
  for (const rootName of roots) {
    let catalog = catalogs.get(rootName);
    if (!catalog) {
      catalog = await readCatalog(resolve(modelsRoot, rootName));
      catalogs.set(rootName, catalog);
    }
    for (const entry of catalog) candidates.push(`${rootName}/${entry}`);
  }
  const expectedKey = normalizedRequested.toLowerCase();
  const expectedBaseName = expectedKey.split('/').pop() || expectedKey;
  const exactMatches = candidates.filter((entry) => (
    entry.slice(entry.indexOf('/') + 1).toLowerCase() === expectedKey
  ));
  const basenameMatches = exactMatches.length > 0 ? [] : candidates.filter((entry) => (
    (entry.toLowerCase().split('/').pop() || '') === expectedBaseName
  ));
  const matches = exactMatches.length > 0 ? exactMatches : basenameMatches;
  const status: UmbraUiQualificationPreflightStatus = matches.length === 1
    ? 'available'
    : matches.length > 1 ? 'ambiguous' : 'missing';
  return {
    caseId,
    kind,
    label,
    requested,
    status,
    match: status === 'available' ? matches[0] || '' : '',
    matches,
    searchedRoots: roots.map((rootName) => resolve(modelsRoot, rootName)),
  };
}

function addOptionalFixture(
  fixtures: Array<{ label: string; path: string }>,
  label: string,
  value: unknown,
): void {
  const path = String(value || '').trim();
  if (path) fixtures.push({ label, path });
}

export async function preflightUmbraUiInpaintQualification(
  manifest: UmbraUiQualificationPreflightManifest,
  options: {
    projectRoot?: string;
    caseIds?: Iterable<string>;
  } = {},
): Promise<UmbraUiQualificationPreflightReport> {
  const projectRoot = resolve(options.projectRoot || process.cwd());
  const modelsRoot = resolve(projectRoot, manifest.modelsRoot || 'Tools/ComfyUI/models');
  const selectedIds = options.caseIds ? new Set(Array.from(options.caseIds, String)) : null;
  const cases = (Array.isArray(manifest.cases) ? manifest.cases : []).filter((item) => (
    item?.enabled !== false && (!selectedIds || selectedIds.has(String(item?.id || '')))
  ));
  const checks: UmbraUiQualificationPreflightCheck[] = [];
  const catalogs = new Map<string, string[]>();

  for (const item of cases) {
    const caseId = String(item.id || '').trim() || '(unnamed)';
    const fixtures: Array<{ label: string; path: string }> = [];
    addOptionalFixture(fixtures, 'Source image', item.sourceImage || manifest.sourceImage);
    addOptionalFixture(fixtures, 'Mask image', item.maskImage || manifest.maskImage);
    for (const region of item.regionalGuidance || []) {
      addOptionalFixture(fixtures, `Regional guidance ${region.id || 'unnamed'} mask`, region.maskPath);
    }
    for (const control of item.controlLayers || []) {
      addOptionalFixture(fixtures, `Control ${control.id || 'unnamed'} image`, control.imagePath);
    }
    for (const reference of item.referenceLayers || []) {
      addOptionalFixture(fixtures, `Reference ${reference.id || 'unnamed'} image`, reference.imagePath);
      addOptionalFixture(fixtures, `Reference ${reference.id || 'unnamed'} mask`, reference.maskPath);
    }
    for (const fixture of fixtures) {
      checks.push(await checkFixture(projectRoot, caseId, fixture.label, fixture.path));
    }

    const primaryName = String(item.checkpointName || '').trim();
    if (primaryName) {
      checks.push(await checkModel(
        modelsRoot,
        catalogs,
        caseId,
        'primary_model',
        'Primary model',
        primaryName,
        MODEL_ROOTS[item.modelSource] || [],
      ));
    }
    const inpaintModelName = String(item.inpaintModelName || '').trim();
    if (inpaintModelName) {
      checks.push(await checkModel(modelsRoot, catalogs, caseId, 'inpaint_model', 'Inpaint prefill model', inpaintModelName, ['inpaint']));
    }
    for (const control of item.controlLayers || []) {
      const modelName = String(control.modelName || '').trim();
      if (modelName) {
        checks.push(await checkModel(
          modelsRoot,
          catalogs,
          caseId,
          'control_model',
          `Control ${control.id || 'unnamed'} model`,
          modelName,
          controlModelRoots(control),
        ));
      }
    }
    for (const reference of item.referenceLayers || []) {
      const modelName = String(reference.modelName || '').trim();
      if (modelName) {
        checks.push(await checkModel(
          modelsRoot,
          catalogs,
          caseId,
          'reference_model',
          `Reference ${reference.id || 'unnamed'} model`,
          modelName,
          ['ipadapter', 'style_models', 'photomaker'],
        ));
      }
      const visionModelName = String(reference.visionModelName || '').trim();
      if (visionModelName) {
        checks.push(await checkModel(
          modelsRoot,
          catalogs,
          caseId,
          'vision_model',
          `Reference ${reference.id || 'unnamed'} vision model`,
          visionModelName,
          ['clip_vision'],
        ));
      }
    }
  }

  const issues = checks.filter((check) => check.status !== 'available');
  return {
    ok: cases.length > 0 && issues.length === 0,
    projectRoot,
    modelsRoot,
    checkedCaseIds: cases.map((item) => String(item.id || '').trim()).filter(Boolean),
    checks,
    issues,
  };
}

export function formatUmbraUiInpaintPreflightIssue(issue: UmbraUiQualificationPreflightCheck): string {
  const searched = issue.searchedRoots.length > 0 ? ` Searched: ${issue.searchedRoots.join(', ')}` : '';
  const matches = issue.matches.length > 0 ? ` Matches: ${issue.matches.join(', ')}` : '';
  return `${issue.caseId}: ${issue.label} is ${issue.status}: ${issue.requested || basename(issue.requested)}.${searched}${matches}`;
}
