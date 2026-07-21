/**
 * HistogramWorker — Compute RGB + luminance histogram from pixel data.
 * Runs in a Web Worker to avoid blocking the main thread.
 */

export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  lum: number[];
  max: number; // max bin value across all channels (for normalization)
}

self.onmessage = (e: MessageEvent<{ pixels: Uint8Array; width: number; height: number }>) => {
  const { pixels, width, height } = e.data;
  const totalPixels = width * height;

  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const lum = new Array(256).fill(0);

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const rv = pixels[offset];
    const gv = pixels[offset + 1];
    const bv = pixels[offset + 2];

    r[rv]++;
    g[gv]++;
    b[bv]++;

    // Luminance: 0.2126R + 0.7152G + 0.0722B
    const l = Math.round(0.2126 * rv + 0.7152 * gv + 0.0722 * bv);
    lum[Math.min(255, l)]++;
  }

  // Find max for normalization (skip extremes at 0 and 255 which can spike)
  let max = 0;
  for (let i = 1; i < 255; i++) {
    max = Math.max(max, r[i], g[i], b[i], lum[i]);
  }

  const result: HistogramData = { r, g, b, lum, max };
  (self as any).postMessage(result);
};
