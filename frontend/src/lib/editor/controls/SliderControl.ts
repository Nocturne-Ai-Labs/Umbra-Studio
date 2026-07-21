/**
 * SliderControl — Reusable vanilla JS slider widget for the editor panel.
 * Dark-themed slider with label, value display, double-click to reset.
 */

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  value?: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}

export class SliderControl {
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private valueLabel: HTMLSpanElement;
  private options: SliderOptions;
  private _value: number;

  constructor(container: HTMLElement, options: SliderOptions) {
    this.options = options;
    this._value = options.value ?? options.default;

    this.root = document.createElement('div');
    this.root.style.cssText = 'padding: 3px 0; user-select: none;';

    // Header row: label + value
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;';

    const label = document.createElement('span');
    label.textContent = options.label;
    label.style.cssText = 'font-size: 10px; color: #a1a1aa; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;';
    label.title = 'Double-click to reset';
    label.addEventListener('dblclick', () => this.reset());

    this.valueLabel = document.createElement('span');
    this.valueLabel.style.cssText = 'font-size: 10px; color: #d4d4d8; font-family: monospace; min-width: 42px; text-align: right; cursor: pointer;';
    this.valueLabel.title = 'Double-click to reset';
    this.valueLabel.addEventListener('dblclick', () => this.reset());

    header.appendChild(label);
    header.appendChild(this.valueLabel);

    // Slider track
    const trackWrap = document.createElement('div');
    trackWrap.style.cssText = 'position: relative; height: 18px; display: flex; align-items: center;';

    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.min = String(options.min);
    this.input.max = String(options.max);
    this.input.step = String(options.step);
    this.input.value = String(this._value);
    this.input.style.cssText = `
      width: 100%; height: 4px; -webkit-appearance: none; appearance: none;
      background: transparent; cursor: pointer; outline: none; margin: 0;
    `;

    // Apply custom slider styling
    this.applySliderStyles();

    this.input.addEventListener('input', () => {
      this._value = parseFloat(this.input.value);
      this.updateDisplay();
      this.options.onChange(this._value);
    });

    trackWrap.appendChild(this.input);

    this.root.appendChild(header);
    this.root.appendChild(trackWrap);
    container.appendChild(this.root);

    this.updateDisplay();
  }

  private applySliderStyles(): void {
    // Inject scoped styles via a <style> element if not already added
    const styleId = 'umbra-slider-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .umbra-slider::-webkit-slider-runnable-track {
          height: 5px; border-radius: 999px; background: #2a2d35;
        }
        .umbra-slider::-webkit-slider-thumb {
          -webkit-appearance: none; width: 13px; height: 13px;
          border-radius: 50%; background: #ffffff; margin-top: -4px;
          border: 2px solid color-mix(in srgb, var(--umbra-accent, #6366f1) 35%, #3f3f46);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: background 0.15s, transform 0.15s;
        }
        .umbra-slider::-webkit-slider-thumb:hover {
          background: #fff; transform: scale(1.12);
        }
        .umbra-slider::-webkit-slider-thumb:active {
          background: var(--umbra-accent, #6366f1); transform: scale(1.06);
        }
        .umbra-slider::-moz-range-track {
          height: 5px; border-radius: 999px; background: #2a2d35; border: none;
        }
        .umbra-slider::-moz-range-thumb {
          width: 13px; height: 13px; border-radius: 50%;
          background: #ffffff; border: 2px solid color-mix(in srgb, var(--umbra-accent, #6366f1) 35%, #3f3f46); cursor: pointer;
        }
        .umbra-slider::-moz-range-thumb:hover {
          background: #fff;
        }
      `;
      document.head.appendChild(style);
    }
    this.input.className = 'umbra-slider';
  }

  private updateDisplay(): void {
    const formatted = this.options.format
      ? this.options.format(this._value)
      : String(Math.round(this._value * 100) / 100);
    this.valueLabel.textContent = formatted;

    // Update track fill color
    const pct = ((this._value - this.options.min) / (this.options.max - this.options.min)) * 100;
    const accent = 'var(--umbra-accent, #6366f1)';
    this.input.style.background = `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, #27272a ${pct}%, #27272a 100%)`;
  }

  getValue(): number {
    return this._value;
  }

  setValue(value: number, silent = false): void {
    this._value = Math.max(this.options.min, Math.min(this.options.max, value));
    this.input.value = String(this._value);
    this.updateDisplay();
    if (!silent) this.options.onChange(this._value);
  }

  reset(silent = false): void {
    this.setValue(this.options.default, silent);
  }

  setEnabled(enabled: boolean): void {
    this.input.disabled = !enabled;
    this.root.style.opacity = enabled ? '1' : '0.4';
    this.root.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  destroy(): void {
    this.root.remove();
  }
}
