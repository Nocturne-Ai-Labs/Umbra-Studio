import { matchUmbraUiResourceCatalog } from '../../../shared/umbra-ui/pipelineTypes';

interface UmbraUiImageCheckpointSelection {
  current: string;
  remembered: string;
  preferred: string;
  installed: string[];
  preserveCurrent: boolean;
  catalogLoading?: boolean;
}

export function selectUmbraUiImageCheckpoint({
  current,
  remembered,
  preferred,
  installed,
  preserveCurrent,
  catalogLoading = false,
}: UmbraUiImageCheckpointSelection): string {
  // A handoff or restored draft has an explicit model. Keep it while the
  // catalog loads, then resolve it to the installed relative path.
  if (preserveCurrent && (catalogLoading || installed.length === 0)) return current;
  const available = (value: string) => {
    const match = matchUmbraUiResourceCatalog(value, installed);
    return match.status === 'available' ? match.match : '';
  };
  if (preserveCurrent) {
    const selected = available(current);
    if (selected) return selected;
    // An explicit handoff or saved draft must surface a missing/ambiguous
    // model instead of silently running with another installed checkpoint.
    if (current) return current;
  }
  return available(remembered) || available(preferred) || available(current);
}

export function resolveUmbraUiImageHandoffCheckpoint(
  value: string,
  installed: string[],
  catalogLoading: boolean,
): string {
  const normalized = String(value || '').trim().replace(/\\/g, '/');
  if (!normalized) return '';
  // A refresh retains the previous catalog, whose basename match could point
  // to a different file. An empty settled catalog can recover later as well.
  if (catalogLoading || installed.length === 0) return normalized;
  const match = matchUmbraUiResourceCatalog(normalized, installed);
  if (match.status === 'available') return match.match;
  return normalized;
}
