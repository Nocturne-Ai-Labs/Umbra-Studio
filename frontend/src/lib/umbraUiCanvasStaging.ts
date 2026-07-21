export type UmbraCanvasStagingAutoSwitch = 'off' | 'start' | 'finish';

export function shouldAutoPreviewUmbraCanvasStage(
  mode: UmbraCanvasStagingAutoSwitch,
  ownsSubmittedJob: boolean,
  terminal: boolean,
): boolean {
  if (!ownsSubmittedJob || mode === 'off') return false;
  if (mode === 'start') return true;
  return terminal;
}
