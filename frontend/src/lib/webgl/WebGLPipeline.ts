/**
 * WebGLPipeline — Multi-pass WebGL2 image processing pipeline.
 * Runs a chain of fragment shaders (exposure, color, curves, etc.)
 * using ping-pong framebuffers for real-time non-destructive editing.
 */

import { ShaderLoader } from './ShaderLoader';

// Import shaders as raw strings through the Bun build plugin.
import quadVert from './shaders/quad.vert?raw';
import exposureFrag from './shaders/exposure.frag?raw';
import highlightsShadowsFrag from './shaders/highlights_shadows.frag?raw';
import whiteBalanceFrag from './shaders/white_balance.frag?raw';
import vibranceSaturationFrag from './shaders/vibrance_saturation.frag?raw';
import hslMixerFrag from './shaders/hsl_mixer.frag?raw';
import toneCurveFrag from './shaders/tone_curve.frag?raw';
import sharpenClarityFrag from './shaders/sharpen_clarity.frag?raw';
import effectLayerFrag from './shaders/effect_layer.frag?raw';

export type EffectKind =
  | 'vignette'
  | 'tilt_shift'
  | 'pixelate'
  | 'ripple'
  | 'swirl'
  | 'pinch_bulge'
  | 'chromatic_aberration'
  | 'film_grain';

export type EffectBlendMode = 'normal' | 'screen' | 'multiply';
export type EffectRegionMode = 'global' | 'linear_gradient' | 'radial';

export interface EffectRegion {
  mode: EffectRegionMode;
  centerX: number; // 0..1
  centerY: number; // 0..1
  radius: number; // 0..1
  feather: number; // 0..1
  angle: number; // degrees
  offset: number; // -1..1
  invert: boolean;
}

export interface EffectLayer {
  id: string;
  kind: EffectKind;
  enabled: boolean;
  opacity: number; // 0..1
  blendMode: EffectBlendMode;
  region: EffectRegion;
  // Named scalar params interpreted by shader mapper.
  params: Record<string, number>;
}

const DEFAULT_EFFECT_REGION: EffectRegion = {
  mode: 'global',
  centerX: 0.5,
  centerY: 0.5,
  radius: 0.45,
  feather: 0.25,
  angle: 0,
  offset: 0,
  invert: false,
};

const DEFAULT_EFFECT_PARAMS: Record<EffectKind, Record<string, number>> = {
  vignette: { amount: 0.45, midpoint: 0.62, feather: 0.45, roundness: 0.0 },
  tilt_shift: { blur: 0.6, band: 0.18, feather: 0.24, angle: 0 },
  pixelate: { blockSize: 8 },
  ripple: { amplitude: 6, frequency: 22, phase: 0 },
  swirl: { radius: 0.35, angle: 2.4 },
  pinch_bulge: { radius: 0.35, strength: 0.35 },
  chromatic_aberration: { amount: 2.2, radialBias: 1.0 },
  film_grain: { intensity: 0.18, size: 1.0, monochrome: 1.0 },
};

export function createDefaultEffectLayer(kind: EffectKind = 'vignette'): EffectLayer {
  return {
    id: `fx_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`,
    kind,
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    region: { ...DEFAULT_EFFECT_REGION },
    params: { ...DEFAULT_EFFECT_PARAMS[kind] },
  };
}

function cloneEffectLayer(layer: EffectLayer): EffectLayer {
  return {
    ...layer,
    region: { ...layer.region },
    params: { ...layer.params },
  };
}

export interface EditAdjustments {
  exposure: number;      // -5 to +5 EV
  contrast: number;      // -100 to +100
  highlights: number;    // -100 to +100
  shadows: number;       // -100 to +100
  whites: number;        // -100 to +100
  blacks: number;        // -100 to +100
  temperature: number;   // -100 to +100
  tint: number;          // -100 to +100
  vibrance: number;      // -100 to +100
  saturation: number;    // -100 to +100
  hslHue: number[];      // 6 values, -30 to +30
  hslSat: number[];      // 6 values, -100 to +100
  hslLum: number[];      // 6 values, -100 to +100
  curveRGB: [number, number][];   // control points [[x,y], ...]
  curveRed: [number, number][];
  curveGreen: [number, number][];
  curveBlue: [number, number][];
  sharpen: number;       // 0 to 150
  clarity: number;       // -100 to +100
  effectsEnabled: boolean;
  effectLayers: EffectLayer[];
}

export const DEFAULT_ADJUSTMENTS: EditAdjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  hslHue: [0, 0, 0, 0, 0, 0],
  hslSat: [0, 0, 0, 0, 0, 0],
  hslLum: [0, 0, 0, 0, 0, 0],
  curveRGB: [[0, 0], [1, 1]],
  curveRed: [[0, 0], [1, 1]],
  curveGreen: [[0, 0], [1, 1]],
  curveBlue: [[0, 0], [1, 1]],
  sharpen: 0,
  clarity: 0,
  effectsEnabled: false,
  effectLayers: [],
};

/** Pipeline pass names in execution order */
const PASS_ORDER = [
  'exposure',
  'highlights_shadows',
  'white_balance',
  'vibrance_saturation',
  'hsl_mixer',
  'tone_curve',
  'sharpen_clarity',
] as const;

type PassName = typeof PASS_ORDER[number];

export class WebGLPipeline {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private loader: ShaderLoader;

  // Source image texture
  private sourceTexture: WebGLTexture | null = null;
  private imageWidth = 0;
  private imageHeight = 0;

  // Ping-pong framebuffers
  private fboA: WebGLFramebuffer | null = null;
  private fboB: WebGLFramebuffer | null = null;
  private texA: WebGLTexture | null = null;
  private texB: WebGLTexture | null = null;
  private currentRead: 'A' | 'B' = 'A';

  // Fullscreen quad VAO
  private quadVAO: WebGLVertexArrayObject | null = null;

  // Tone curve LUT texture
  private curveLUTTexture: WebGLTexture | null = null;
  private curveLUTData = new Uint8Array(256 * 4); // 256 pixels, RGBA

  // Current adjustments
  private adjustments: EditAdjustments = { ...DEFAULT_ADJUSTMENTS };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.loader = new ShaderLoader(gl);

    this.initQuad();
    this.initPrograms();
    this.initCurveLUT();
  }

  private initQuad(): void {
    const gl = this.gl;
    // Fullscreen quad: two triangles covering [-1,1]
    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]);

    this.quadVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVAO);

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private initPrograms(): void {
    const fragSources: Record<PassName, string> = {
      exposure: exposureFrag,
      highlights_shadows: highlightsShadowsFrag,
      white_balance: whiteBalanceFrag,
      vibrance_saturation: vibranceSaturationFrag,
      hsl_mixer: hslMixerFrag,
      tone_curve: toneCurveFrag,
      sharpen_clarity: sharpenClarityFrag,
    };

    for (const name of PASS_ORDER) {
      this.loader.getProgram(name, quadVert, fragSources[name]);
    }
    this.loader.getProgram('effect_layer', quadVert, effectLayerFrag);
  }

  private initCurveLUT(): void {
    const gl = this.gl;
    this.curveLUTTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUTTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Initialize with linear (identity) LUT
    this.buildCurveLUT();
  }

  private initPingPong(width: number, height: number): void {
    const gl = this.gl;

    // Clean up existing
    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);

    const createFBO = () => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

      return { fbo, tex };
    };

    const a = createFBO();
    const b = createFBO();
    this.fboA = a.fbo;
    this.texA = a.tex;
    this.fboB = b.fbo;
    this.texB = b.tex;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  async loadImage(src: string | HTMLImageElement): Promise<void> {
    const img = typeof src === 'string' ? await this.loadImageElement(src) : src;
    const gl = this.gl;

    this.imageWidth = img.naturalWidth || img.width;
    this.imageHeight = img.naturalHeight || img.height;

    // Resize canvas to match image
    this.canvas.width = this.imageWidth;
    this.canvas.height = this.imageHeight;
    gl.viewport(0, 0, this.imageWidth, this.imageHeight);

    // Upload source texture
    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
    this.sourceTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);

    // Reinit ping-pong buffers for new size
    this.initPingPong(this.imageWidth, this.imageHeight);
  }

  private loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  setAdjustments(adj: Partial<EditAdjustments>): void {
    const next = { ...this.adjustments, ...adj };
    if (adj.effectLayers) {
      next.effectLayers = adj.effectLayers.map(cloneEffectLayer);
    }
    this.adjustments = next;
  }

  getAdjustments(): EditAdjustments {
    return {
      ...this.adjustments,
      effectLayers: this.adjustments.effectLayers.map(cloneEffectLayer),
    };
  }

  /** Check if a pass can be skipped (all its uniforms are at default) */
  private isPassNeutral(pass: PassName): boolean {
    const a = this.adjustments;
    switch (pass) {
      case 'exposure':
        return a.exposure === 0 && a.contrast === 0;
      case 'highlights_shadows':
        return a.highlights === 0 && a.shadows === 0 && a.whites === 0 && a.blacks === 0;
      case 'white_balance':
        return a.temperature === 0 && a.tint === 0;
      case 'vibrance_saturation':
        return a.vibrance === 0 && a.saturation === 0;
      case 'hsl_mixer':
        return a.hslHue.every(v => v === 0) && a.hslSat.every(v => v === 0) && a.hslLum.every(v => v === 0);
      case 'tone_curve':
        return this.isCurveLinear(a.curveRGB) && this.isCurveLinear(a.curveRed) &&
               this.isCurveLinear(a.curveGreen) && this.isCurveLinear(a.curveBlue);
      case 'sharpen_clarity':
        return a.sharpen === 0 && a.clarity === 0;
    }
  }

  private isCurveLinear(points: [number, number][]): boolean {
    if (points.length !== 2) return false;
    return points[0][0] === 0 && points[0][1] === 0 && points[1][0] === 1 && points[1][1] === 1;
  }

  render(): void {
    if (!this.sourceTexture) return;
    const gl = this.gl;

    gl.viewport(0, 0, this.imageWidth, this.imageHeight);
    this.currentRead = 'A';

    // Copy source into texA to start the chain
    const copyProg = this.loader.getProgram('_copy', quadVert,
      `#version 300 es
       precision highp float;
       uniform sampler2D u_texture;
       in vec2 v_texCoord;
       out vec4 fragColor;
       void main() { fragColor = texture(u_texture, v_texCoord); }`
    );
    gl.useProgram(copyProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.uniform1i(gl.getUniformLocation(copyProg, 'u_texture'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA!);
    this.drawQuad();
    this.currentRead = 'A';

    // Run each pass
    for (const pass of PASS_ORDER) {
      if (this.isPassNeutral(pass)) continue;
      this.runPass(pass);
    }

    this.runEffectLayers();

    // Final output to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(copyProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.getReadTexture());
    gl.uniform1i(gl.getUniformLocation(copyProg, 'u_texture'), 0);
    this.drawQuad();
  }

  private runEffectLayers(): void {
    const a = this.adjustments;
    if (!a.effectsEnabled || !a.effectLayers.length) return;
    for (const layer of a.effectLayers) {
      if (!layer?.enabled || layer.opacity <= 0) continue;
      this.runEffectLayer(layer);
    }
  }

  private runPass(pass: PassName): void {
    const gl = this.gl;
    const program = this.loader.getProgram(pass, quadVert, ''); // Already cached

    gl.useProgram(program);

    // Bind input texture (current read)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.getReadTexture());
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

    // Set pass-specific uniforms
    this.setPassUniforms(program, pass);

    // Render to write framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.getWriteFBO());
    this.drawQuad();

    // Swap ping-pong
    this.currentRead = this.currentRead === 'A' ? 'B' : 'A';
  }

  private runEffectLayer(layer: EffectLayer): void {
    const gl = this.gl;
    const program = this.loader.getProgram('effect_layer', quadVert, '');
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.getReadTexture());
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform2f(loc('u_texelSize'), 1 / this.imageWidth, 1 / this.imageHeight);

    const [p0, p1, p2, p3, p4, p5, p6, p7] = this.layerParamsToArray(layer);
    gl.uniform1f(loc('u_param0'), p0);
    gl.uniform1f(loc('u_param1'), p1);
    gl.uniform1f(loc('u_param2'), p2);
    gl.uniform1f(loc('u_param3'), p3);
    gl.uniform1f(loc('u_param4'), p4);
    gl.uniform1f(loc('u_param5'), p5);
    gl.uniform1f(loc('u_param6'), p6);
    gl.uniform1f(loc('u_param7'), p7);

    gl.uniform1i(loc('u_kind'), this.effectKindToIndex(layer.kind));
    gl.uniform1i(loc('u_blendMode'), this.effectBlendToIndex(layer.blendMode));
    gl.uniform1f(loc('u_opacity'), Math.max(0, Math.min(1, layer.opacity)));

    const region = layer.region || DEFAULT_EFFECT_REGION;
    gl.uniform1i(loc('u_regionMode'), this.effectRegionToIndex(region.mode));
    gl.uniform2f(loc('u_regionCenter'), region.centerX, region.centerY);
    gl.uniform1f(loc('u_regionRadius'), Math.max(0.0001, region.radius));
    gl.uniform1f(loc('u_regionFeather'), Math.max(0, Math.min(1, region.feather)));
    gl.uniform1f(loc('u_regionAngle'), region.angle * Math.PI / 180);
    gl.uniform1f(loc('u_regionOffset'), region.offset);
    gl.uniform1i(loc('u_regionInvert'), region.invert ? 1 : 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.getWriteFBO());
    this.drawQuad();
    this.currentRead = this.currentRead === 'A' ? 'B' : 'A';
  }

  private layerParamsToArray(layer: EffectLayer): number[] {
    const p = layer.params || {};
    switch (layer.kind) {
      case 'vignette':
        return [p.amount ?? 0.45, p.midpoint ?? 0.62, p.feather ?? 0.45, p.roundness ?? 0, 0, 0, 0, 0];
      case 'tilt_shift':
        return [p.blur ?? 0.6, p.band ?? 0.18, p.feather ?? 0.24, p.angle ?? 0, 0, 0, 0, 0];
      case 'pixelate':
        return [p.blockSize ?? 8, 0, 0, 0, 0, 0, 0, 0];
      case 'ripple':
        return [p.amplitude ?? 6, p.frequency ?? 22, p.phase ?? 0, 0, 0, 0, 0, 0];
      case 'swirl':
        return [p.radius ?? 0.35, p.angle ?? 2.4, 0, 0, 0, 0, 0, 0];
      case 'pinch_bulge':
        return [p.radius ?? 0.35, p.strength ?? 0.35, 0, 0, 0, 0, 0, 0];
      case 'chromatic_aberration':
        return [p.amount ?? 2.2, p.radialBias ?? 1.0, 0, 0, 0, 0, 0, 0];
      case 'film_grain':
        return [p.intensity ?? 0.18, p.size ?? 1.0, p.monochrome ?? 1.0, Date.now() * 0.001, 0, 0, 0, 0];
    }
  }

  private effectKindToIndex(kind: EffectKind): number {
    switch (kind) {
      case 'vignette': return 0;
      case 'tilt_shift': return 1;
      case 'pixelate': return 2;
      case 'ripple': return 3;
      case 'swirl': return 4;
      case 'pinch_bulge': return 5;
      case 'chromatic_aberration': return 6;
      case 'film_grain': return 7;
    }
  }

  private effectBlendToIndex(mode: EffectBlendMode): number {
    switch (mode) {
      case 'screen': return 1;
      case 'multiply': return 2;
      default: return 0;
    }
  }

  private effectRegionToIndex(mode: EffectRegionMode): number {
    switch (mode) {
      case 'linear_gradient': return 1;
      case 'radial': return 2;
      default: return 0;
    }
  }

  private setPassUniforms(program: WebGLProgram, pass: PassName): void {
    const gl = this.gl;
    const a = this.adjustments;
    const loc = (name: string) => gl.getUniformLocation(program, name);

    switch (pass) {
      case 'exposure':
        gl.uniform1f(loc('u_exposure'), a.exposure);
        gl.uniform1f(loc('u_contrast'), a.contrast);
        break;

      case 'highlights_shadows':
        gl.uniform1f(loc('u_highlights'), a.highlights);
        gl.uniform1f(loc('u_shadows'), a.shadows);
        gl.uniform1f(loc('u_whites'), a.whites);
        gl.uniform1f(loc('u_blacks'), a.blacks);
        break;

      case 'white_balance':
        gl.uniform1f(loc('u_temperature'), a.temperature);
        gl.uniform1f(loc('u_tint'), a.tint);
        break;

      case 'vibrance_saturation':
        gl.uniform1f(loc('u_vibrance'), a.vibrance);
        gl.uniform1f(loc('u_saturation'), a.saturation);
        break;

      case 'hsl_mixer':
        gl.uniform1fv(loc('u_hsl_hue[0]'), new Float32Array(a.hslHue));
        gl.uniform1fv(loc('u_hsl_sat[0]'), new Float32Array(a.hslSat));
        gl.uniform1fv(loc('u_hsl_lum[0]'), new Float32Array(a.hslLum));
        break;

      case 'tone_curve':
        this.buildCurveLUT();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.curveLUTTexture);
        gl.uniform1i(loc('u_curveLUT'), 1);
        break;

      case 'sharpen_clarity':
        gl.uniform1f(loc('u_sharpen'), a.sharpen);
        gl.uniform1f(loc('u_clarity'), a.clarity);
        gl.uniform2f(loc('u_texelSize'), 1.0 / this.imageWidth, 1.0 / this.imageHeight);
        break;
    }
  }

  /** Build the 256x1 RGBA curve LUT texture from control points */
  private buildCurveLUT(): void {
    const gl = this.gl;
    const a = this.adjustments;

    const redLUT = this.interpolateCurve(a.curveRed);
    const greenLUT = this.interpolateCurve(a.curveGreen);
    const blueLUT = this.interpolateCurve(a.curveBlue);
    const rgbLUT = this.interpolateCurve(a.curveRGB);

    for (let i = 0; i < 256; i++) {
      this.curveLUTData[i * 4 + 0] = Math.round(redLUT[i] * 255);
      this.curveLUTData[i * 4 + 1] = Math.round(greenLUT[i] * 255);
      this.curveLUTData[i * 4 + 2] = Math.round(blueLUT[i] * 255);
      this.curveLUTData[i * 4 + 3] = Math.round(rgbLUT[i] * 255);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.curveLUTTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.curveLUTData);
  }

  /** Monotone cubic spline interpolation from control points to 256 values */
  private interpolateCurve(points: [number, number][]): Float32Array {
    const result = new Float32Array(256);
    if (points.length < 2) {
      for (let i = 0; i < 256; i++) result[i] = i / 255;
      return result;
    }

    // Sort points by x
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    const n = sorted.length;
    const xs = sorted.map(p => p[0]);
    const ys = sorted.map(p => p[1]);

    if (n === 2) {
      // Linear interpolation
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        const frac = (t - xs[0]) / (xs[1] - xs[0]);
        result[i] = Math.max(0, Math.min(1, ys[0] + frac * (ys[1] - ys[0])));
      }
      return result;
    }

    // Compute slopes using Fritsch-Carlson method for monotonic cubic
    const deltas = new Float32Array(n - 1);
    const m = new Float32Array(n);

    for (let i = 0; i < n - 1; i++) {
      deltas[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    }

    m[0] = deltas[0];
    m[n - 1] = deltas[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (deltas[i - 1] * deltas[i] <= 0) {
        m[i] = 0;
      } else {
        m[i] = (deltas[i - 1] + deltas[i]) / 2;
      }
    }

    // Monotonicity constraints
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(deltas[i]) < 1e-10) {
        m[i] = 0;
        m[i + 1] = 0;
      } else {
        const alpha = m[i] / deltas[i];
        const beta = m[i + 1] / deltas[i];
        const mag = alpha * alpha + beta * beta;
        if (mag > 9) {
          const tau = 3 / Math.sqrt(mag);
          m[i] = tau * alpha * deltas[i];
          m[i + 1] = tau * beta * deltas[i];
        }
      }
    }

    // Evaluate spline at each of 256 positions
    for (let i = 0; i < 256; i++) {
      const t = i / 255;

      // Find segment
      let seg = 0;
      for (let j = 0; j < n - 1; j++) {
        if (t >= xs[j]) seg = j;
      }
      if (seg >= n - 1) seg = n - 2;

      const h = xs[seg + 1] - xs[seg];
      const frac = h > 0 ? (t - xs[seg]) / h : 0;
      const frac2 = frac * frac;
      const frac3 = frac2 * frac;

      // Hermite basis
      const h00 = 2 * frac3 - 3 * frac2 + 1;
      const h10 = frac3 - 2 * frac2 + frac;
      const h01 = -2 * frac3 + 3 * frac2;
      const h11 = frac3 - frac2;

      result[i] = Math.max(0, Math.min(1,
        h00 * ys[seg] + h10 * h * m[seg] + h01 * ys[seg + 1] + h11 * h * m[seg + 1]
      ));
    }

    return result;
  }

  private drawQuad(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  private getReadTexture(): WebGLTexture {
    return this.currentRead === 'A' ? this.texA! : this.texB!;
  }

  private getWriteFBO(): WebGLFramebuffer {
    return this.currentRead === 'A' ? this.fboB! : this.fboA!;
  }

  /** Read pixels from the current output (for histogram computation) */
  readPixels(): Uint8Array {
    const gl = this.gl;
    const pixels = new Uint8Array(this.imageWidth * this.imageHeight * 4);

    // Read from the last-written framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentRead === 'A' ? this.fboA! : this.fboB!);
    gl.readPixels(0, 0, this.imageWidth, this.imageHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return pixels;
  }

  /** Export the current rendered output as a Blob */
  async toBlob(format = 'image/png', quality = 0.92): Promise<Blob> {
    this.render();
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
        format,
        quality
      );
    });
  }

  getImageDimensions(): { width: number; height: number } {
    return { width: this.imageWidth, height: this.imageHeight };
  }

  /** Get the source (unedited) texture for compare mode */
  getSourceTexture(): WebGLTexture | null {
    return this.sourceTexture;
  }

  getGL(): WebGL2RenderingContext {
    return this.gl;
  }

  destroy(): void {
    const gl = this.gl;
    this.loader.destroy();
    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);
    if (this.curveLUTTexture) gl.deleteTexture(this.curveLUTTexture);
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
  }
}
