import { matchUmbraUiResourceCatalog } from '../../../shared/umbra-ui/pipelineTypes';

interface UmbraUiImageCheckpointSelection {
  current: string;
  remembered: string;
  preferred: string;
  installed: string[];
  preserveCurrent: boolean;
}

export function selectUmbraUiImageCheckpoint({
  current,
  remembered,
  preferred,
  installed,
  preserveCurrent,
}: UmbraUiImageCheckpointSelection): string {
  // A handoff or restored draft has an explicit model. Keep it while the
  // catalog loads, then resolve it to the installed relative path.
  if (preserveCurrent && installed.length === 0) return current;
  const available = (value: string) => {
    const match = matchUmbraUiResourceCatalog(value, installed);
    return match.status === 'available' ? match.match : '';
  };
  if (preserveCurrent) {
    const selected = available(current);
    if (selected) return selected;
  }
  return available(remembered) || available(preferred) || available(current);
}
