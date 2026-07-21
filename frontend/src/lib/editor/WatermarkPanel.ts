/**
 * WatermarkPanel — Vanilla JS panel for configuring watermark settings.
 * Used inside ExportDialog and BatchExportDialog.
 */

import { WatermarkEngine, WatermarkConfig, WatermarkPosition, WatermarkType } from './WatermarkEngine';

const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact'];
const WATERMARK_FONT_FOLDER = 'User/FontforWatermark';
const FONT_EXTENSIONS = /\.(ttf|otf|ttc|otc|woff|woff2)$/i;

interface UserWatermarkFont {
  name: string;
  path: string;
}

const POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: 'top-left', label: 'TL' },
  { id: 'top-center', label: 'TC' },
  { id: 'top-right', label: 'TR' },
  { id: 'center-left', label: 'CL' },
  { id: 'center', label: 'C' },
  { id: 'center-right', label: 'CR' },
  { id: 'bottom-left', label: 'BL' },
  { id: 'bottom-center', label: 'BC' },
  { id: 'bottom-right', label: 'BR' },
];

export class WatermarkPanel {
  private container: HTMLElement;
  private config: WatermarkConfig;
  private onChange: (config: WatermarkConfig) => void;
  private contentEl: HTMLDivElement;
  private userFonts: UserWatermarkFont[] = [];
  private isLoadingFonts = false;

  constructor(container: HTMLElement, onChange: (config: WatermarkConfig) => void) {
    this.container = container;
    this.onChange = onChange;
    this.config = WatermarkEngine.loadConfig();

    // Main wrapper
    this.contentEl = document.createElement('div');
    this.contentEl.style.cssText = 'font-size: 12px; color: #a1a1aa; min-width: 0;';
    this.container.appendChild(this.contentEl);

    this.build();
    void this.refreshUserFonts();
  }

  getConfig(): WatermarkConfig {
    return this.config;
  }

  private emit(): void {
    WatermarkEngine.saveConfig(this.config);
    this.onChange(this.config);
  }

  private build(): void {
    this.contentEl.innerHTML = '';

    // Enable toggle
    this.contentEl.appendChild(this.buildToggle('Enable Watermark', this.config.enabled, (v) => {
      this.config.enabled = v;
      this.emit();
      this.build(); // Rebuild to show/hide controls
    }));

    if (!this.config.enabled) return;

    // Type tabs
    this.contentEl.appendChild(this.buildTypeTabs());

    // Dedicated export counter text
    this.contentEl.appendChild(this.buildToggle('Image Counter (IMG X/Y)', this.config.enableCounter, (v) => {
      this.config.enableCounter = v;
      this.emit();
      this.build();
    }));

    if (this.config.enableCounter) {
      this.contentEl.appendChild(this.buildSlider('Counter Opacity', this.config.counterOpacity, 0, 1, 0.01, (v) => {
        this.config.counterOpacity = v;
        this.emit();
      }, (v) => `${Math.round(v * 100)}%`));

      this.contentEl.appendChild(this.buildToggle('Counter Custom Position', this.config.counterUseCustomPosition, (v) => {
        const wasCustom = this.config.counterUseCustomPosition;
        this.config.counterUseCustomPosition = v;
        if (v && !wasCustom) {
          this.config.counterOffsetX = this.config.customOffsetX;
          this.config.counterOffsetY = this.config.customOffsetY;
        }
        this.emit();
        this.build();
      }));

      if (this.config.counterUseCustomPosition) {
        this.contentEl.appendChild(this.buildSlider('Counter Position X', this.config.counterOffsetX, 0, 1, 0.01, (v) => {
          this.config.counterOffsetX = v;
          this.emit();
        }, (v) => `${Math.round(v * 100)}%`));
        this.contentEl.appendChild(this.buildSlider('Counter Position Y', this.config.counterOffsetY, 0, 1, 0.01, (v) => {
          this.config.counterOffsetY = v;
          this.emit();
        }, (v) => `${Math.round(v * 100)}%`));
      }
    }

    if (this.config.type === 'image') {
      this.contentEl.appendChild(this.buildImageUpload());
    }
    if (this.config.type === 'text' || this.config.enableCounter) {
      this.contentEl.appendChild(this.buildTextControls());
    }

    // Position grid
    this.contentEl.appendChild(this.buildSectionLabel('Position'));
    this.contentEl.appendChild(this.buildPositionGrid());

    // Custom offset sliders (only when position is 'custom')
    if (this.config.position === 'custom') {
      this.contentEl.appendChild(this.buildSlider('Offset X', this.config.customOffsetX, 0, 1, 0.01, (v) => {
        this.config.customOffsetX = v;
        this.emit();
      }));
      this.contentEl.appendChild(this.buildSlider('Offset Y', this.config.customOffsetY, 0, 1, 0.01, (v) => {
        this.config.customOffsetY = v;
        this.emit();
      }));
    }

    // Opacity
    this.contentEl.appendChild(this.buildSlider('Opacity', this.config.opacity, 0, 1, 0.01, (v) => {
      this.config.opacity = v;
      this.emit();
    }, (v) => `${Math.round(v * 100)}%`));

    // Scale
    this.contentEl.appendChild(this.buildSlider('Scale', this.config.scale, 0.05, 2.0, 0.01, (v) => {
      this.config.scale = v;
      this.emit();
    }, (v) => `${Math.round(v * 100)}%`));

    // Rotation
    this.contentEl.appendChild(this.buildSlider('Rotation', this.config.rotation, 0, 360, 1, (v) => {
      this.config.rotation = v;
      this.emit();
    }, (v) => `${Math.round(v)}\u00B0`));

    // Tiling
    this.contentEl.appendChild(this.buildToggle('Tiling', this.config.tiling, (v) => {
      this.config.tiling = v;
      this.emit();
      this.build();
    }));

    if (this.config.tiling) {
      this.contentEl.appendChild(this.buildSlider('Tile Spacing X', this.config.tileSpacingX, 20, 500, 10, (v) => {
        this.config.tileSpacingX = v;
        this.emit();
      }, (v) => `${Math.round(v)}px`));
      this.contentEl.appendChild(this.buildSlider('Tile Spacing Y', this.config.tileSpacingY, 20, 500, 10, (v) => {
        this.config.tileSpacingY = v;
        this.emit();
      }, (v) => `${Math.round(v)}px`));
    }
  }

  private buildSectionLabel(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin: 12px 0 6px;';
    return el;
  }

  private buildToggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px;';

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'font-size: 12px; color: #d4d4d8; flex: 1 1 170px; min-width: 0; line-height: 1.35; overflow-wrap: anywhere;';
    row.appendChild(lbl);

    const toggle = document.createElement('button');
    toggle.style.cssText = `
      width: 36px; height: 20px; border-radius: 10px; border: none; cursor: pointer;
      transition: background 0.15s; position: relative;
      background: ${checked ? 'var(--umbra-accent, #6366f1)' : '#3f3f46'};
      flex: 0 0 auto;
    `;

    const knob = document.createElement('div');
    knob.style.cssText = `
      width: 16px; height: 16px; border-radius: 50%; background: white;
      position: absolute; top: 2px; transition: left 0.15s;
      left: ${checked ? '18px' : '2px'};
    `;
    toggle.appendChild(knob);

    toggle.addEventListener('click', () => onChange(!checked));
    row.appendChild(toggle);

    return row;
  }

  private buildTypeTabs(): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px;';

    for (const type of ['image', 'text'] as WatermarkType[]) {
      const btn = document.createElement('button');
      btn.textContent = type === 'image' ? 'Image' : 'Text';
      const isActive = this.config.type === type;
      btn.style.cssText = `
        flex: 1 1 120px; min-width: 0; padding: 6px; border-radius: 4px; font-size: 11px; font-weight: 600;
        cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: all 0.15s;
        background: ${isActive ? 'var(--umbra-accent, #6366f1)' : '#27272a'};
        color: ${isActive ? 'white' : '#a1a1aa'};
        white-space: normal; overflow-wrap: anywhere; text-align: center;
      `;
      btn.addEventListener('click', () => {
        this.config.type = type;
        this.emit();
        this.build();
      });
      row.appendChild(btn);
    }

    return row;
  }

  private buildImageUpload(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 12px;';

    const dropzone = document.createElement('div');
    dropzone.style.cssText = `
      border: 2px dashed rgba(255,255,255,0.15); border-radius: 8px;
      padding: 16px; text-align: center; cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      min-height: 60px; display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 4px;
    `;

    if (this.config.imageData) {
      const preview = document.createElement('img');
      preview.src = this.config.imageData;
      preview.style.cssText = 'max-width: 100%; max-height: 60px; object-fit: contain; border-radius: 4px;';
      dropzone.appendChild(preview);

      const changeLabel = document.createElement('div');
      changeLabel.textContent = 'Click to change';
      changeLabel.style.cssText = 'font-size: 10px; color: #71717a; margin-top: 4px;';
      dropzone.appendChild(changeLabel);
    } else {
      const label = document.createElement('div');
      label.textContent = 'Drop image or click to select';
      label.style.cssText = 'font-size: 11px; color: #71717a;';
      dropzone.appendChild(label);
    }

    // Click to select file
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.readImageFile(file);
    });
    wrapper.appendChild(fileInput);

    dropzone.addEventListener('click', () => fileInput.click());

    // Drag & drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--umbra-accent, #6366f1)';
      dropzone.style.background = 'rgba(99,102,241,0.05)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
      dropzone.style.background = 'transparent';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
      dropzone.style.background = 'transparent';
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        this.readImageFile(file);
      }
    });

    wrapper.appendChild(dropzone);
    return wrapper;
  }

  private readImageFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.config.imageData = reader.result as string;
      this.emit();
      this.build();
    };
    reader.readAsDataURL(file);
  }

  private buildTextControls(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0;';

    // Text input
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = this.config.enableCounter ? 'IMG 1/1' : this.config.text;
    textInput.placeholder = this.config.enableCounter ? 'Counter format is fixed to IMG X/Y' : 'Watermark text...';
    textInput.disabled = this.config.enableCounter;
    textInput.style.cssText = `
      width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 4px;
      background: ${this.config.enableCounter ? '#1f1f23' : '#27272a'};
      border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7;
      font-size: 12px; outline: none;
      opacity: ${this.config.enableCounter ? '0.8' : '1'};
    `;
    textInput.addEventListener('input', () => {
      if (this.config.enableCounter) return;
      this.config.text = textInput.value;
      this.emit();
    });
    wrapper.appendChild(textInput);

    // Font family + size row
    const fontRow = document.createElement('div');
    fontRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; align-items: stretch;';

    const fontSelect = document.createElement('select');
    fontSelect.style.cssText = `
      flex: 1 1 170px; width: 100%; min-width: 0; max-width: 100%; padding: 4px 6px; border-radius: 4px;
      background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7;
      font-size: 11px; outline: none; cursor: pointer;
    `;
    const fontOptions = this.getFontOptions();
    for (const option of fontOptions) {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      opt.selected = option.selected;
      fontSelect.appendChild(opt);
    }
    if (this.isLoadingFonts) {
      const loadingOpt = document.createElement('option');
      loadingOpt.value = '';
      loadingOpt.textContent = 'Loading user fonts...';
      loadingOpt.disabled = true;
      loadingOpt.selected = false;
      fontSelect.appendChild(loadingOpt);
    }
    fontSelect.addEventListener('change', () => {
      this.applySelectedFont(fontSelect.value);
      this.emit();
      void WatermarkEngine.ensureFontLoadedForConfig(this.config);
    });
    fontRow.appendChild(fontSelect);

    const refreshFontsBtn = document.createElement('button');
    refreshFontsBtn.textContent = 'Refresh';
    refreshFontsBtn.style.cssText = `
      flex: 1 1 92px; min-height: 28px; min-width: 0; max-width: 100%;
      padding: 0 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);
      background: #27272a; color: #a1a1aa; cursor: pointer; font-size: 10px; font-weight: 600;
      white-space: normal; overflow-wrap: anywhere;
    `;
    refreshFontsBtn.disabled = this.isLoadingFonts;
    refreshFontsBtn.style.opacity = this.isLoadingFonts ? '0.6' : '1';
    refreshFontsBtn.addEventListener('click', () => {
      void this.refreshUserFonts();
    });
    fontRow.appendChild(refreshFontsBtn);

    // Font size
    const sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = '8';
    sizeInput.max = '200';
    sizeInput.value = String(this.config.fontSize);
    sizeInput.style.cssText = `
      flex: 1 1 68px; min-width: 68px; max-width: 100%; width: 100%;
      padding: 4px 6px; border-radius: 4px;
      background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7;
      font-size: 11px; outline: none;
    `;
    sizeInput.addEventListener('input', () => {
      this.config.fontSize = parseInt(sizeInput.value) || 24;
      this.emit();
    });
    fontRow.appendChild(sizeInput);

    wrapper.appendChild(fontRow);

    // Color + bold row
    const styleRow = document.createElement('div');
    styleRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; align-items: center;';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = this.config.fontColor;
    colorInput.style.cssText = `
      flex: 0 0 32px; width: 32px; height: 28px; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px; cursor: pointer; background: transparent; padding: 0;
    `;
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = this.config.fontColor.toUpperCase();
    hexInput.placeholder = '#FFFFFF';
    hexInput.maxLength = 7;
    hexInput.style.cssText = `
      flex: 1 1 96px; min-width: 88px; width: 100%; height: 28px; border-radius: 4px;
      background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7;
      font-size: 11px; outline: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 0 8px;
    `;
    hexInput.addEventListener('input', () => {
      const normalized = this.normalizeHexColor(hexInput.value);
      if (!normalized) return;
      this.config.fontColor = normalized;
      colorInput.value = normalized;
      hexInput.value = normalized.toUpperCase();
      this.emit();
    });
    hexInput.addEventListener('blur', () => {
      hexInput.value = this.config.fontColor.toUpperCase();
    });
    colorInput.addEventListener('input', () => {
      this.config.fontColor = colorInput.value;
      hexInput.value = this.config.fontColor.toUpperCase();
      this.emit();
    });
    styleRow.appendChild(colorInput);
    styleRow.appendChild(hexInput);

    const boldBtn = document.createElement('button');
    const isBold = this.config.fontWeight === 'bold';
    boldBtn.textContent = 'B';
    boldBtn.style.cssText = `
      flex: 0 0 28px; width: 28px; height: 28px; border-radius: 4px; font-weight: 900; font-size: 13px;
      cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: all 0.15s;
      background: ${isBold ? 'var(--umbra-accent, #6366f1)' : '#27272a'};
      color: ${isBold ? 'white' : '#a1a1aa'};
    `;
    boldBtn.addEventListener('click', () => {
      this.config.fontWeight = this.config.fontWeight === 'bold' ? 'normal' : 'bold';
      this.emit();
      this.build();
    });
    styleRow.appendChild(boldBtn);

    wrapper.appendChild(styleRow);

    return wrapper;
  }

  private buildPositionGrid(): HTMLDivElement {
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; margin-bottom: 8px;';

    for (const pos of POSITIONS) {
      const btn = document.createElement('button');
      const isActive = this.config.position === pos.id;
      btn.textContent = pos.label;
      btn.style.cssText = `
        padding: 6px 4px; border-radius: 4px; font-size: 9px; font-weight: 700;
        cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: all 0.15s;
        background: ${isActive ? 'var(--umbra-accent, #6366f1)' : '#27272a'};
        color: ${isActive ? 'white' : '#71717a'};
      `;
      btn.addEventListener('click', () => {
        this.config.position = pos.id;
        this.emit();
        this.build();
      });
      grid.appendChild(btn);
    }

    // Custom position button
    const customBtn = document.createElement('button');
    const isCustom = this.config.position === 'custom';
    customBtn.textContent = 'Custom';
    customBtn.style.cssText = `
      grid-column: span 3; padding: 4px; border-radius: 4px; font-size: 10px; font-weight: 600;
      cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: all 0.15s;
      background: ${isCustom ? 'var(--umbra-accent, #6366f1)' : '#27272a'};
      color: ${isCustom ? 'white' : '#71717a'};
    `;
    customBtn.addEventListener('click', () => {
      this.config.position = 'custom';
      this.emit();
      this.build();
    });
    grid.appendChild(customBtn);

    return grid;
  }

  private buildSlider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    formatValue?: (v: number) => string,
  ): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 8px; min-width: 0;';

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; min-width: 0;';

    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'font-size: 11px; color: #a1a1aa; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere;';
    header.appendChild(lbl);

    const valLabel = document.createElement('span');
    valLabel.textContent = formatValue ? formatValue(value) : String(Math.round(value * 100) / 100);
    valLabel.style.cssText = 'font-size: 10px; color: #71717a; font-weight: 600;';
    header.appendChild(valLabel);

    wrapper.appendChild(header);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.style.cssText = `
      width: 100%; height: 4px; border-radius: 2px; appearance: none;
      background: #3f3f46; cursor: pointer; accent-color: var(--umbra-accent, #6366f1);
    `;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valLabel.textContent = formatValue ? formatValue(v) : String(Math.round(v * 100) / 100);
      onChange(v);
    });

    wrapper.appendChild(slider);
    return wrapper;
  }

  destroy(): void {
    this.contentEl.remove();
  }

  private getFontOptions(): { value: string; label: string; selected: boolean }[] {
    const options: { value: string; label: string; selected: boolean }[] = [];

    for (const font of FONTS) {
      options.push({
        value: `builtin:${font}`,
        label: font,
        selected: this.config.fontSource !== 'custom' && this.config.fontFamily === font,
      });
    }

    for (const font of this.userFonts) {
      options.push({
        value: `custom:${font.path}`,
        label: `${font.name} (User)`,
        selected: this.config.fontSource === 'custom' && this.config.fontPath === font.path,
      });
    }

    return options;
  }

  private applySelectedFont(value: string): void {
    if (value.startsWith('custom:')) {
      const fontPath = value.slice('custom:'.length);
      const match = this.userFonts.find((font) => font.path === fontPath);
      this.config.fontSource = 'custom';
      this.config.fontPath = fontPath;
      if (match) {
        this.config.fontFamily = match.name;
      }
      return;
    }

    const builtin = value.startsWith('builtin:') ? value.slice('builtin:'.length) : value;
    this.config.fontSource = 'builtin';
    this.config.fontPath = null;
    this.config.fontFamily = builtin || 'Arial';
  }

  private normalizeHexColor(value: string): string | null {
    const trimmed = value.trim().toUpperCase();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (!/^#[0-9A-F]{6}$/.test(withHash)) return null;
    return withHash.toLowerCase();
  }

  private async refreshUserFonts(): Promise<void> {
    this.isLoadingFonts = true;
    this.build();

    try {
      await fetch('/api/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: WATERMARK_FONT_FOLDER }),
      });

      const response = await fetch(`/api/fs/list?path=${encodeURIComponent(WATERMARK_FONT_FOLDER)}&filter=font`);
      if (!response.ok) throw new Error(`Failed to list fonts (${response.status})`);

      const data = await response.json();
      const files = Array.isArray(data.files) ? data.files : [];

      this.userFonts = files
        .map((file: { name?: string; path?: string }) => ({
          name: (file.name || '').replace(/\.[^/.]+$/, ''),
          path: file.path || '',
        }))
        .filter((font: UserWatermarkFont) => Boolean(font.name && font.path && FONT_EXTENSIONS.test(font.path)))
        .sort((a: UserWatermarkFont, b: UserWatermarkFont) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

      const hasSelectedCustomFont = this.userFonts.some((font) => font.path === this.config.fontPath);
      if (this.config.fontSource === 'custom' && !hasSelectedCustomFont) {
        this.config.fontSource = 'builtin';
        this.config.fontPath = null;
        this.config.fontFamily = FONTS[0];
        this.emit();
      } else if (this.config.fontSource === 'custom' && this.config.fontPath) {
        void WatermarkEngine.ensureFontLoadedForConfig(this.config);
      }
    } catch (error) {
      console.error('[WatermarkPanel] Failed to refresh user fonts:', error);
      this.userFonts = [];
    } finally {
      this.isLoadingFonts = false;
      this.build();
    }
  }
}
