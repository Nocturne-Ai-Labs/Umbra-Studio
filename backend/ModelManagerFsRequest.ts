import { readRequestTextWithLimit } from './BoundedRequestBody';

export const MODEL_MANAGER_FS_MAX_BODY_BYTES = 512 * 1024;
export const MODEL_MANAGER_FS_MAX_PATHS = 512;

export class ModelManagerFsPathLimitError extends Error {}

export type ModelManagerFsRequest = {
  paths: string[];
  destination: string;
  trackProgress: boolean;
};

export async function readModelManagerFsRequest(req: Request): Promise<ModelManagerFsRequest | null> {
  const text = await readRequestTextWithLimit(req, MODEL_MANAGER_FS_MAX_BODY_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const body = parsed as Record<string, unknown>;
  const paths = Array.isArray(body.paths) ? body.paths : [];
  if (paths.length > MODEL_MANAGER_FS_MAX_PATHS) {
    throw new ModelManagerFsPathLimitError(`Select at most ${MODEL_MANAGER_FS_MAX_PATHS} paths at a time.`);
  }
  return {
    paths: paths as string[],
    destination: String(body.destination || '').trim(),
    trackProgress: Boolean(body.trackProgress),
  };
}
