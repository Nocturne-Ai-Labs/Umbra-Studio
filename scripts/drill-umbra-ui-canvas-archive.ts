import JSZip from 'jszip';
import {
  createUmbraCanvasProjectDocument,
  createUmbraCanvasRasterEntity,
} from '../frontend/src/features/canvas/canvasModel';
import {
  exportUmbraCanvasWorkspaceArchive,
  importUmbraCanvasWorkspaceArchive,
} from '../frontend/src/lib/umbraUiCanvasWorkspaceArchive';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+H9p2AAAAAElFTkSuQmCC';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const project = createUmbraCanvasProjectDocument('Archive qualification');
  const first = createUmbraCanvasRasterEntity({
    name: 'shared.png',
    imageUrl: PNG_DATA_URL,
    width: 1,
    height: 1,
  });
  const second = { ...first, id: 'duplicate-raster', name: 'duplicate.png' };
  project.entities = [first, second];
  project.generation.pending = [{ id: 'pending-not-portable' } as any];
  project.generation.staging = [{ id: 'stage-not-portable' } as any];

  const archive = await exportUmbraCanvasWorkspaceArchive(project);
  const zip = await JSZip.loadAsync(await archive.arrayBuffer(), { checkCRC32: true });
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  const storedProject = JSON.parse(await zip.file('project.json')!.async('string'));
  const assetEntries = Object.keys(zip.files).filter((path) => path.startsWith('assets/') && !zip.files[path].dir);

  assert(manifest.format === 'umbra-canvas' && manifest.version === 1, 'The archive manifest contract changed.');
  assert(manifest.assets.length === 2, 'Each raster entity must retain its own archive asset record.');
  assert(manifest.assets[0].path === manifest.assets[1].path, 'Identical raster bytes were not content-deduplicated.');
  assert(assetEntries.length === 1, 'The archive wrote duplicate binary payloads.');
  assert(storedProject.generation.pending.length === 0 && storedProject.generation.staging.length === 0, 'Transient generation state leaked into the portable archive.');

  const imported = await importUmbraCanvasWorkspaceArchive(archive);
  try {
    assert(imported.project.id !== project.id, 'Import reused the source project identity.');
    assert(imported.project.entities.length === 2 && imported.objectUrls.length === 2, 'Import did not restore every raster entity.');
    assert(imported.project.generation.pending.length === 0 && imported.project.generation.staging.length === 0, 'Import restored transient generation state.');
  } finally {
    imported.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  zip.file(manifest.assets[0].path, Uint8Array.of(0, 1, 2, 3));
  const corrupted = new Blob([await zip.generateAsync({ type: 'uint8array' })], { type: 'application/zip' });
  let corruptionRejected = false;
  try {
    await importUmbraCanvasWorkspaceArchive(corrupted);
  } catch {
    corruptionRejected = true;
  }
  assert(corruptionRejected, 'Archive asset corruption bypassed the SHA-256 integrity check.');

  console.log('PASSED Umbra Canvas portable archive drill.');
  console.log(JSON.stringify({ archiveBytes: archive.size, assetRecords: manifest.assets.length, storedAssetPayloads: assetEntries.length }));
}

await main();
