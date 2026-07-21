/**
 * WatermarkEngine — Renders image or text watermarks onto a 2D canvas.
 * Supports tiling, rotation, opacity, and 9-position placement.
 * Vanilla JS, no React dependencies.
 */

import { buildFsImageUrl } from '@/lib/utils';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';

export type WatermarkPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'custom';

export type WatermarkType = 'image' | 'text';

export interface WatermarkCounterContext {
  index?: number;
  total?: number;
}

export type WatermarkFontSource = 'builtin' | 'custom';

export interface WatermarkConfig {
  enabled: boolean;
  type: WatermarkType;
  // Image watermark
  imageData: string | null;       // data URL
  // Text watermark
  text: string;
  fontFamily: string;
  fontSource: WatermarkFontSource;
  fontPath: string | null;
  fontSize: number;               // px
  fontColor: string;              // hex color
  fontWeight: 'normal' | 'bold';
  enableCounter: boolean;
  counterOpacity: number;         // 0-1 (applies to IMG X/Y text)
  counterUseCustomPosition: boolean;
  counterOffsetX: number;         // 0-1 normalized (only when counterUseCustomPosition)
  counterOffsetY: number;         // 0-1 normalized (only when counterUseCustomPosition)
  // Common placement
  position: WatermarkPosition;
  customOffsetX: number;          // 0-1 normalized
  customOffsetY: number;          // 0-1 normalized
  opacity: number;                // 0-1
  scale: number;                  // 0.05-2.0
  rotation: number;               // degrees
  // Tiling
  tiling: boolean;
  tileSpacingX: number;           // px
  tileSpacingY: number;           // px
}

const STORAGE_KEY = 'umbra_watermark_config';
const WATERMARK_CONFIG_KEY = 'editor-watermark-settings';

const POSITION_MARGIN = 0.03; // 3% margin from edges
const FALLBACK_FONT = 'Arial, sans-serif';

export class WatermarkEngine {
  private static loadedCustomFonts = new Map<string, string>();
  private static loadingCustomFonts = new Map<string, Promise<string>>();
  private static configCache: WatermarkConfig | null = null;
  private static configLoadPromise: Promise<void> | null = null;

  /**
   * Apply watermark to a 2D canvas context.
   */
  static async apply(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    config: WatermarkConfig,
    counterContext?: WatermarkCounterContext,
  ): Promise<void> {
    if (!config.enabled) return;

    ctx.save();
    const baseOpacity = Math.min(1, Math.max(0, config.opacity));
    const counterOpacity = Math.min(1, Math.max(0, config.counterOpacity ?? 1));

    const textToRender = WatermarkEngine.resolveText(config, counterContext);

    if (config.type === 'image' && config.imageData) {
      await WatermarkEngine.applyImage(ctx, canvasWidth, canvasHeight, config, baseOpacity);
    }

    if (textToRender) {
      const textConfig = WatermarkEngine.resolveTextConfig(config);
      if (config.fontSource === 'custom' && config.fontPath) {
        await WatermarkEngine.ensureFontLoadedForConfig(textConfig);
      }
      const textOpacity = config.enableCounter
        ? baseOpacity * counterOpacity
        : baseOpacity;
      WatermarkEngine.applyText(ctx, canvasWidth, canvasHeight, textConfig, textToRender, textOpacity);
    }

    ctx.restore();
  }

  private static async applyImage(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    config: WatermarkConfig,
    opacity: number,
  ): Promise<void> {
    const img = await WatermarkEngine.loadImageFromDataURL(config.imageData!);
    const w = img.width * config.scale;
    const h = img.height * config.scale;
    ctx.globalAlpha = opacity;

    if (config.tiling) {
      WatermarkEngine.drawTiled(cw, ch, config, (x, y) => {
        WatermarkEngine.drawRotated(ctx, x, y, config.rotation, () => {
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        });
      }, w, h);
    } else {
      const { x, y } = WatermarkEngine.getPosition(cw, ch, w, h, config);
      WatermarkEngine.drawRotated(ctx, x + w / 2, y + h / 2, config.rotation, () => {
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      });
    }
  }

  private static applyText(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    config: WatermarkConfig,
    text: string,
    opacity: number,
  ): void {
    const fontSize = config.fontSize * config.scale;
    ctx.globalAlpha = opacity;
    ctx.font = `${config.fontWeight} ${fontSize}px ${WatermarkEngine.resolveFontFamily(config)}`;
    ctx.fillStyle = config.fontColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const textH = fontSize;

    if (config.tiling) {
      WatermarkEngine.drawTiled(cw, ch, config, (x, y) => {
        WatermarkEngine.drawRotated(ctx, x, y, config.rotation, () => {
          ctx.fillText(text, 0, 0);
        });
      }, textW, textH);
    } else {
      const { x, y } = WatermarkEngine.getPosition(cw, ch, textW, textH, config);
      WatermarkEngine.drawRotated(ctx, x + textW / 2, y + textH / 2, config.rotation, () => {
        ctx.fillText(text, 0, 0);
      });
    }
  }

  private static resolveText(config: WatermarkConfig, counterContext?: WatermarkCounterContext): string {
    if (config.enableCounter) {
      const index = Math.max(1, Math.floor(counterContext?.index ?? 1));
      const total = Math.max(1, Math.floor(counterContext?.total ?? 1));
      return `IMG ${index}/${total}`;
    }

    if (config.type === 'text') {
      return config.text?.trim() ?? '';
    }

    return '';
  }

  private static resolveTextConfig(config: WatermarkConfig): WatermarkConfig {
    if (!config.enableCounter || !config.counterUseCustomPosition) {
      return config;
    }

    return {
      ...config,
      position: 'custom',
      customOffsetX: Math.min(1, Math.max(0, config.counterOffsetX)),
      customOffsetY: Math.min(1, Math.max(0, config.counterOffsetY)),
    };
  }

  private static resolveFontFamily(config: WatermarkConfig): string {
    if (config.fontSource === 'custom' && config.fontPath) {
      const family = WatermarkEngine.loadedCustomFonts.get(config.fontPath)
        ?? WatermarkEngine.familyFromPath(config.fontPath);
      return `"${family}", ${FALLBACK_FONT}`;
    }

    const family = (config.fontFamily || '').trim();
    return family ? `${family}, ${FALLBACK_FONT}` : FALLBACK_FONT;
  }

  static async ensureFontLoadedForConfig(config: WatermarkConfig): Promise<void> {
    if (config.fontSource !== 'custom' || !config.fontPath) return;
    if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return;
    const fontPath = config.fontPath;

    const cachedFamily = WatermarkEngine.loadedCustomFonts.get(fontPath);
    if (cachedFamily) return;

    const pending = WatermarkEngine.loadingCustomFonts.get(fontPath);
    if (pending) {
      await pending;
      return;
    }

    const loadPromise = (async () => {
      const family = WatermarkEngine.familyFromPath(fontPath);
      const srcUrl = buildFsImageUrl(fontPath);
      const fontFace = new FontFace(family, `url("${srcUrl}")`);
      const loadedFace = await fontFace.load();
      (document.fonts as any).add?.(loadedFace);
      WatermarkEngine.loadedCustomFonts.set(fontPath, family);
      return family;
    })();

    WatermarkEngine.loadingCustomFonts.set(fontPath, loadPromise);
    try {
      await loadPromise;
    } catch {
      // fallback to built-in font when load fails
    } finally {
      WatermarkEngine.loadingCustomFonts.delete(fontPath);
    }
  }

  private static familyFromPath(fontPath: string): string {
    const safe = fontPath
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 48) || 'Custom';
    return `UmbraWM_${safe}`;
  }

  private static drawTiled(
    cw: number,
    ch: number,
    config: WatermarkConfig,
    drawFn: (x: number, y: number) => void,
    itemW: number,
    itemH: number,
  ): void {
    const spacingX = itemW + (config.tileSpacingX || 100);
    const spacingY = itemH + (config.tileSpacingY || 100);

    // Start before canvas to handle rotation overflow
    const startX = -itemW;
    const startY = -itemH;
    const endX = cw + itemW;
    const endY = ch + itemH;

    for (let y = startY; y < endY; y += spacingY) {
      for (let x = startX; x < endX; x += spacingX) {
        drawFn(x + itemW / 2, y + itemH / 2);
      }
    }
  }

  private static drawRotated(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    degrees: number,
    drawFn: () => void,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);
    if (degrees !== 0) {
      ctx.rotate((degrees * Math.PI) / 180);
    }
    drawFn();
    ctx.restore();
  }

  private static getPosition(
    cw: number,
    ch: number,
    itemW: number,
    itemH: number,
    config: WatermarkConfig,
  ): { x: number; y: number } {
    const mx = cw * POSITION_MARGIN;
    const my = ch * POSITION_MARGIN;

    switch (config.position) {
      case 'top-left':      return { x: mx, y: my };
      case 'top-center':    return { x: (cw - itemW) / 2, y: my };
      case 'top-right':     return { x: cw - itemW - mx, y: my };
      case 'center-left':   return { x: mx, y: (ch - itemH) / 2 };
      case 'center':        return { x: (cw - itemW) / 2, y: (ch - itemH) / 2 };
      case 'center-right':  return { x: cw - itemW - mx, y: (ch - itemH) / 2 };
      case 'bottom-left':   return { x: mx, y: ch - itemH - my };
      case 'bottom-center': return { x: (cw - itemW) / 2, y: ch - itemH - my };
      case 'bottom-right':  return { x: cw - itemW - mx, y: ch - itemH - my };
      case 'custom':
        return {
          x: config.customOffsetX * (cw - itemW),
          y: config.customOffsetY * (ch - itemH),
        };
      default:
        return { x: cw - itemW - mx, y: ch - itemH - my };
    }
  }

  private static loadImageFromDataURL(dataURL: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load watermark image'));
      img.src = dataURL;
    });
  }

  static getDefault(): WatermarkConfig {
    return {
      enabled: false,
      type: 'image',
      imageData: null,
      text: '',
      fontFamily: 'Arial',
      fontSource: 'builtin',
      fontPath: null,
      fontSize: 24,
      fontColor: '#ffffff',
      fontWeight: 'normal',
      enableCounter: false,
      counterOpacity: 1,
      counterUseCustomPosition: false,
      counterOffsetX: 0.9,
      counterOffsetY: 0.9,
      position: 'bottom-right',
      customOffsetX: 0.5,
      customOffsetY: 0.5,
      opacity: 0.5,
      scale: 0.2,
      rotation: 0,
      tiling: false,
      tileSpacingX: 100,
      tileSpacingY: 100,
    };
  }

  static loadConfig(): WatermarkConfig {
    WatermarkEngine.clearLegacyStorage();
    if (!WatermarkEngine.configCache) {
      WatermarkEngine.configCache = WatermarkEngine.getDefault();
      void WatermarkEngine.loadConfigFromFile();
    }
    return WatermarkEngine.configCache;
  }

  static saveConfig(config: WatermarkConfig): void {
    WatermarkEngine.configCache = { ...WatermarkEngine.getDefault(), ...config };
    WatermarkEngine.clearLegacyStorage();
    void writeUserConfig(WATERMARK_CONFIG_KEY, WatermarkEngine.configCache).catch((error) => {
      console.warn('[WatermarkEngine] Failed to persist watermark config:', error);
    });
  }

  private static clearLegacyStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Legacy cleanup only.
    }
  }

  private static loadConfigFromFile(): Promise<void> {
    if (WatermarkEngine.configLoadPromise) return WatermarkEngine.configLoadPromise;
    WatermarkEngine.configLoadPromise = readUserConfig<Partial<WatermarkConfig>>(WATERMARK_CONFIG_KEY, {})
      .then((config) => {
        WatermarkEngine.configCache = { ...WatermarkEngine.getDefault(), ...config };
        WatermarkEngine.clearLegacyStorage();
      })
      .finally(() => {
        WatermarkEngine.configLoadPromise = null;
      });
    return WatermarkEngine.configLoadPromise;
  }
}
