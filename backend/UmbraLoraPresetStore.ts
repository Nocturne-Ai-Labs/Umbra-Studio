import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

let pending: Promise<unknown> = Promise.resolve();

export class LoraPresetWriteError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function writeLoraPresetLibrary(path: string, value: unknown): Promise<void> {
  const operation = pending.catch(() => {}).then(async () => {
    const data = value as { version: number; revision: number; presets: Array<Record<string, unknown>> };
    if (!data || data.version !== 1 || !Number.isSafeInteger(data.revision) || !Array.isArray(data.presets)
      || data.presets.length > 1000 || JSON.stringify(data).length > 12_000_000) {
      throw new LoraPresetWriteError('Invalid or oversized LoRA preset library.', 400);
    }
    const ids = new Set<string>();
    for (const preset of data.presets) {
      if (!preset || typeof preset.id !== 'string' || !preset.id || ids.has(preset.id)
        || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 120
        || typeof preset.thumbnail !== 'string' || preset.thumbnail.length > 200_000
        || (preset.thumbnail && !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(preset.thumbnail))
        || !Array.isArray(preset.loras) || preset.loras.length === 0 || preset.loras.length > 256) {
        throw new LoraPresetWriteError('Invalid LoRA preset.', 400);
      }
      ids.add(preset.id);
      for (const lora of preset.loras) {
        if (!lora || typeof lora.name !== 'string' || !lora.name.trim() || lora.name.length > 2048
          || typeof lora.enabled !== 'boolean' || !Array.isArray(lora.trainedTags)
          || !lora.trainedTags.every((tag: unknown) => typeof tag === 'string')
          || (lora.triggerWords != null && (!Array.isArray(lora.triggerWords) || !lora.triggerWords.every((tag: unknown) => typeof tag === 'string')))
          || ![lora.strengthModel, lora.strengthClip].every((strength) => typeof strength === 'number' && Number.isFinite(strength) && Math.abs(strength) <= 10)) {
          throw new LoraPresetWriteError('Invalid LoRA stack entry.', 400);
        }
      }
    }
    let revision = 0;
    try { revision = Number(JSON.parse(await readFile(path, 'utf8')).revision) || 0; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (data.revision !== revision + 1) throw new LoraPresetWriteError('Preset library changed. Please retry.', 409);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(data), 'utf8');
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
  });
  pending = operation;
  return operation;
}
