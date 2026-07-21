export type UmbraRasterFilterType = 'blur' | 'noise' | 'pixelate' | 'color_map' | 'grayscale' | 'invert' | 'canny';

export interface UmbraRasterFilterConfig {
  type: UmbraRasterFilterType;
  blurRadius: number;
  noiseAmount: number;
  noiseColor: boolean;
  noiseMode: 'gaussian' | 'salt_pepper';
  pixelSize: number;
  colorMapLow: string;
  colorMapHigh: string;
  lowThreshold: number;
  highThreshold: number;
  seed: number;
}

export interface UmbraRasterFilterResult {
  canvas: HTMLCanvasElement;
  padding: number;
}

export const DEFAULT_UMBRA_RASTER_FILTER_CONFIG: UmbraRasterFilterConfig = {
  type: 'blur',
  blurRadius: 8,
  noiseAmount: 0.15,
  noiseColor: true,
  noiseMode: 'gaussian',
  pixelSize: 16,
  colorMapLow: '#111827',
  colorMapHigh: '#f9a8d4',
  lowThreshold: 80,
  highThreshold: 160,
  seed: 0,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function createRandom(seed: number): () => number {
  let state = (Math.round(seed) || 0x9e3779b9) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function applyNoise(pixels: ImageData, config: UmbraRasterFilterConfig): void {
  const amount = clamp(config.noiseAmount, 0, 1);
  const random = createRandom(config.seed);
  let spareGaussian: number | null = null;
  const gaussian = () => {
    if (spareGaussian !== null) {
      const value = spareGaussian;
      spareGaussian = null;
      return value;
    }
    const u = Math.max(Number.EPSILON, random());
    const v = random();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    spareGaussian = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  };
  for (let index = 0; index < pixels.data.length; index += 4) {
    if (pixels.data[index + 3] === 0) continue;
    if (config.noiseMode === 'salt_pepper') {
      if (random() > amount) continue;
      const value = random() < 0.5 ? 0 : 255;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
      continue;
    }
    const shared = gaussian() * amount * 64;
    pixels.data[index] = clamp(pixels.data[index] + (config.noiseColor ? gaussian() * amount * 64 : shared), 0, 255);
    pixels.data[index + 1] = clamp(pixels.data[index + 1] + (config.noiseColor ? gaussian() * amount * 64 : shared), 0, 255);
    pixels.data[index + 2] = clamp(pixels.data[index + 2] + (config.noiseColor ? gaussian() * amount * 64 : shared), 0, 255);
  }
}

function applySimplePixelFilter(pixels: ImageData, type: 'grayscale' | 'invert'): void {
  for (let index = 0; index < pixels.data.length; index += 4) {
    if (type === 'grayscale') {
      const value = Math.round(pixels.data[index] * 0.2126 + pixels.data[index + 1] * 0.7152 + pixels.data[index + 2] * 0.0722);
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
    } else {
      pixels.data[index] = 255 - pixels.data[index];
      pixels.data[index + 1] = 255 - pixels.data[index + 1];
      pixels.data[index + 2] = 255 - pixels.data[index + 2];
    }
  }
}

function parseHexColor(value: string, fallback: [number, number, number]): [number, number, number] {
  const normalized = String(value || '').trim().replace(/^#/, '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return fallback;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

export function applyUmbraColorMapToRgba(
  data: Uint8ClampedArray,
  lowColor: string,
  highColor: string,
): void {
  const low = parseHexColor(lowColor, [17, 24, 39]);
  const high = parseHexColor(highColor, [249, 168, 212]);
  for (let index = 0; index < data.length; index += 4) {
    const luminance = (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
    data[index] = Math.round(low[0] + (high[0] - low[0]) * luminance);
    data[index + 1] = Math.round(low[1] + (high[1] - low[1]) * luminance);
    data[index + 2] = Math.round(low[2] + (high[2] - low[2]) * luminance);
  }
}

function applyCannyApproximation(pixels: ImageData, width: number, height: number, config: UmbraRasterFilterConfig): void {
  const data = pixels.data;
  if (width < 3 || height < 3) {
    data.fill(0);
    return;
  }
  const loadGrayscaleRow = (target: Float32Array, y: number) => {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      target[x] = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    }
  };
  let top = new Float32Array(width);
  let middle = new Float32Array(width);
  let bottom = new Float32Array(width);
  loadGrayscaleRow(top, 0);
  loadGrayscaleRow(middle, 1);
  loadGrayscaleRow(bottom, 2);
  const low = clamp(config.lowThreshold, 0, 255);
  const high = Math.max(low, clamp(config.highThreshold, 0, 255));
  data.fill(0, 0, width * 4);
  for (let y = 1; y < height - 1; y += 1) {
    const rowOffset = y * width * 4;
    data.fill(0, rowOffset, rowOffset + 4);
    for (let x = 1; x < width - 1; x += 1) {
      const gx = -top[x - 1] + top[x + 1] - 2 * middle[x - 1] + 2 * middle[x + 1] - bottom[x - 1] + bottom[x + 1];
      const gy = -top[x - 1] - 2 * top[x] - top[x + 1] + bottom[x - 1] + 2 * bottom[x] + bottom[x + 1];
      const magnitude = Math.min(255, Math.hypot(gx, gy));
      const value = magnitude >= high ? 255 : magnitude >= low ? 128 : 0;
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = alpha;
    }
    data.fill(0, rowOffset + (width - 1) * 4, rowOffset + width * 4);
    if (y < height - 2) {
      const recycled = top;
      top = middle;
      middle = bottom;
      bottom = recycled;
      loadGrayscaleRow(bottom, y + 2);
    }
  }
  data.fill(0, (height - 1) * width * 4);
}

export function applyUmbraRasterFilterToImageData(
  pixels: ImageData,
  width: number,
  height: number,
  config: UmbraRasterFilterConfig,
): void {
  if (config.type === 'canny') applyCannyApproximation(pixels, width, height, config);
  else if (config.type === 'noise') applyNoise(pixels, config);
  else if (config.type === 'color_map') applyUmbraColorMapToRgba(pixels.data, config.colorMapLow, config.colorMapHigh);
  else if (config.type === 'grayscale' || config.type === 'invert') applySimplePixelFilter(pixels, config.type);
}

export function renderUmbraRasterFilter(
  source: CanvasImageSource,
  width: number,
  height: number,
  config: UmbraRasterFilterConfig,
): UmbraRasterFilterResult {
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.round(height));
  const padding = config.type === 'blur' ? Math.ceil(clamp(config.blurRadius, 0, 128) * 3) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth + padding * 2;
  canvas.height = sourceHeight + padding * 2;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { canvas, padding };

  if (config.type === 'blur') {
    context.filter = `blur(${clamp(config.blurRadius, 0, 128)}px)`;
    context.drawImage(source, padding, padding, sourceWidth, sourceHeight);
    context.filter = 'none';
    return { canvas, padding };
  }
  if (config.type === 'pixelate') {
    const size = Math.max(1, Math.round(clamp(config.pixelSize, 1, 256)));
    const reduced = document.createElement('canvas');
    reduced.width = Math.max(1, Math.ceil(sourceWidth / size));
    reduced.height = Math.max(1, Math.ceil(sourceHeight / size));
    const reducedContext = reduced.getContext('2d');
    if (reducedContext) {
      reducedContext.imageSmoothingEnabled = false;
      reducedContext.drawImage(source, 0, 0, reduced.width, reduced.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(reduced, 0, 0, reduced.width, reduced.height, 0, 0, sourceWidth, sourceHeight);
    }
    return { canvas, padding };
  }

  context.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  const pixels = context.getImageData(0, 0, sourceWidth, sourceHeight);
  applyUmbraRasterFilterToImageData(pixels, sourceWidth, sourceHeight, config);
  context.putImageData(pixels, 0, 0);
  return { canvas, padding };
}
