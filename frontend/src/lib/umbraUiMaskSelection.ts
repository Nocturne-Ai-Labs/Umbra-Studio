export interface UmbraColorSelectionOptions {
  width: number;
  height: number;
  x: number;
  y: number;
  tolerance: number;
  contiguous: boolean;
}

export function selectUmbraColorRegion(
  pixels: Uint8ClampedArray,
  options: UmbraColorSelectionOptions,
): Uint8ClampedArray {
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round(options.height));
  if (pixels.length < width * height * 4) throw new Error('The color-selection image buffer is incomplete.');
  const seedX = Math.max(0, Math.min(width - 1, Math.round(options.x)));
  const seedY = Math.max(0, Math.min(height - 1, Math.round(options.y)));
  const tolerance = Math.max(0, Math.min(255, Math.round(options.tolerance)));
  const selected = new Uint8ClampedArray(width * height);
  const seedOffset = (seedY * width + seedX) * 4;
  const target = [pixels[seedOffset], pixels[seedOffset + 1], pixels[seedOffset + 2], pixels[seedOffset + 3]];
  const matches = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    return Math.abs(pixels[offset] - target[0]) <= tolerance
      && Math.abs(pixels[offset + 1] - target[1]) <= tolerance
      && Math.abs(pixels[offset + 2] - target[2]) <= tolerance
      && Math.abs(pixels[offset + 3] - target[3]) <= tolerance;
  };

  if (!options.contiguous) {
    for (let index = 0; index < selected.length; index += 1) {
      if (matches(index)) selected[index] = 255;
    }
    return selected;
  }

  const stack: number[] = [seedX, seedY];
  while (stack.length > 0) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    let index = y * width + x;
    while (x >= 0 && !selected[index] && matches(index)) {
      x -= 1;
      index -= 1;
    }
    x += 1;
    index += 1;
    let spanAbove = false;
    let spanBelow = false;
    while (x < width && !selected[index] && matches(index)) {
      selected[index] = 255;
      if (y > 0) {
        const above = index - width;
        if (!selected[above] && matches(above)) {
          if (!spanAbove) stack.push(x, y - 1);
          spanAbove = true;
        } else {
          spanAbove = false;
        }
      }
      if (y + 1 < height) {
        const below = index + width;
        if (!selected[below] && matches(below)) {
          if (!spanBelow) stack.push(x, y + 1);
          spanBelow = true;
        } else {
          spanBelow = false;
        }
      }
      x += 1;
      index += 1;
    }
  }
  return selected;
}
