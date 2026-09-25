import * as fs from 'node:fs/promises';

export const MAX_DATASET_CONCEPT_SETTINGS_BYTES = 256 * 1024;
export const MAX_DATASET_CONCEPT_SETTINGS_REQUEST_BYTES = 1024 * 1024;

export class DatasetConceptSettingsFileError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'DatasetConceptSettingsFileError';
  }
}

export class DatasetConceptSettingsTooLargeError extends Error {
  readonly status = 413;
  constructor() {
    super('Concept settings exceed the 256 KiB limit.');
    this.name = 'DatasetConceptSettingsTooLargeError';
  }
}

export async function readDatasetConceptSettingsText(path: string): Promise<string | null> {
  const stat = await fs.lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return null;
  if (!stat.isFile()) throw new DatasetConceptSettingsFileError('Concept settings are not a regular file.');
  if (stat.size > MAX_DATASET_CONCEPT_SETTINGS_BYTES) {
    throw new DatasetConceptSettingsFileError('Saved concept settings exceed the 256 KiB limit. Repair the settings file before retrying.');
  }
  const text = await fs.readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (text === null) return null;
  if (Buffer.byteLength(text, 'utf8') > MAX_DATASET_CONCEPT_SETTINGS_BYTES) {
    throw new DatasetConceptSettingsFileError('Saved concept settings exceed the 256 KiB limit. Repair the settings file before retrying.');
  }
  return text;
}

export function serializeDatasetConceptSettings(settings: Record<string, unknown>): string {
  const text = `${JSON.stringify(settings, null, 2)}\n`;
  if (Buffer.byteLength(text, 'utf8') > MAX_DATASET_CONCEPT_SETTINGS_BYTES) {
    throw new DatasetConceptSettingsTooLargeError();
  }
  return text;
}
