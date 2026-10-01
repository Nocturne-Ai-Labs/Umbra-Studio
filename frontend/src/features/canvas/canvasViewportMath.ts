import type { UmbraCanvasRect, UmbraCanvasViewport } from './canvasModel';

export function fitUmbraCanvasViewport(bounds: UmbraCanvasRect, width: number, height: number): UmbraCanvasViewport {
  const paddingX = Math.min(72, width * 0.08);
  const paddingY = Math.min(72, height * 0.08);
  const scale = Math.max(0.05, Math.min(2,
    (width - paddingX * 2) / Math.max(1, bounds.width),
    (height - paddingY * 2) / Math.max(1, bounds.height),
  ));
  return {
    scale,
    x: width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}

export function getUmbraCanvasGridSpacing(scale: number): { minor: number; major: number } {
  const zoom = Math.max(0.05, Number.isFinite(scale) ? scale : 1);
  const multiplier = 2 ** Math.max(0, Math.ceil(Math.log2(16 / (64 * zoom))));
  const minor = 64 * multiplier;
  return { minor, major: minor * 4 };
}
