import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type ModelFile = {
  sourcePath?: string;
  url?: string;
  destination: string;
  bytes?: number;
  sha256?: string;
};

type SupportModel = {
  id: string;
  installPolicy: 'automatic' | 'manual';
  profiles: string[];
  repository?: string;
  revision?: string;
  files: ModelFile[];
};

const manifest = JSON.parse(readFileSync(
  join(import.meta.dir, '..', 'defaults', 'UmbraUI', 'model-manifest.json'),
  'utf8',
)) as { schemaVersion: number; profiles: Record<string, unknown>; models: SupportModel[] };

describe('Umbra UI support-model manifest', () => {
  test('defines a deterministic automatic core pack', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.profiles.core).toBeTruthy();
    const coreDestinations = manifest.models
      .filter(model => model.installPolicy === 'automatic' && model.profiles.includes('core'))
      .flatMap(model => model.files.map(file => file.destination));
    expect(coreDestinations).toContain('ultralytics/bbox/face_yolov8m.pt');
    expect(coreDestinations).toContain('ultralytics/bbox/hand_yolov8s.pt');
    expect(coreDestinations).toContain('ultralytics/segm/person_yolov8m-seg.pt');
    expect(coreDestinations).toContain('sams/sam_vit_b_01ec64.pth');
    expect(coreDestinations).toContain('upscale_models/RealESRGAN_x4plus.safetensors');
    expect(coreDestinations).toContain('frame_interpolation/rife_v4.26.safetensors');
  });

  test('pins every automatic file by size, checksum, and immutable source', () => {
    for (const model of manifest.models.filter(candidate => candidate.installPolicy === 'automatic')) {
      for (const file of model.files) {
        expect(file.bytes).toBeGreaterThan(0);
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(Boolean(file.url || (model.repository && model.revision && file.sourcePath))).toBe(true);
      }
    }
  });

  test('does not collide destinations and keeps restricted assets manual', () => {
    const destinations = manifest.models.flatMap(model => model.files.map(file => file.destination.toLowerCase()));
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(manifest.models.find(model => model.id === 'eyes-adetailer')?.installPolicy).toBe('manual');
    expect(manifest.models.find(model => model.id === 'anime-upscalers')?.installPolicy).toBe('manual');
  });
});
