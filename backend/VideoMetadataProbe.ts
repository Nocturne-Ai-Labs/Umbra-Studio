import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GalleryWorkQueue } from '../gallery/GalleryWorkQueue';
import { mediaFileRevision } from './mediaFileRevision';
import { runFfprobe } from './FfmpegPreviewProcess';

export class VideoMetadataProbe {
  private readonly queue = new GalleryWorkQueue(2, 64);

  constructor(private readonly runProbe = runFfprobe) {}

  async read(filePath: string): Promise<Buffer | null> {
    const path = resolve(filePath);
    const revision = mediaFileRevision(await stat(path));
    return this.queue.run(JSON.stringify([path, revision]), async () => {
      if (mediaFileRevision(await stat(path)) !== revision) throw new Error('Video changed before metadata probing');
      const output = await this.runProbe([
        '-v', 'error', '-threads', '1', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:format_tags=comment', '-of', 'json', path,
      ], { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 });
      if (mediaFileRevision(await stat(path)) !== revision) throw new Error('Video changed during metadata probing');
      return output;
    });
  }
}

const sharedProbe = new VideoMetadataProbe();

export function probeVideoMetadata(filePath: string): Promise<Buffer | null> {
  return sharedProbe.read(filePath);
}
