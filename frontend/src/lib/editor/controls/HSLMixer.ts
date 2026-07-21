/**
 * HSLMixer — Per-hue color adjustment with 6 color tabs.
 * Each tab has Hue, Saturation, Luminance sliders.
 */

import { SliderControl } from './SliderControl';

const HUE_BANDS = [
  { key: 'red',    label: 'Red',    color: '#ef4444' },
  { key: 'orange', label: 'Orange', color: '#f97316' },
  { key: 'yellow', label: 'Yellow', color: '#eab308' },
  { key: 'green',  label: 'Green',  color: '#22c55e' },
  { key: 'cyan',   label: 'Cyan',   color: '#06b6d4' },
  { key: 'blue',   label: 'Blue',   color: '#3b82f6' },
] as const;

type HueIndex = 0 | 1 | 2 | 3 | 4 | 5;

interface HSLMixerOptions {
  onChange: (hue: number[], sat: number[], lum: number[]) => void;
}

export class HSLMixer {
  private root: HTMLDivElement;
  private options: HSLMixerOptions;
  private activeIndex: HueIndex = 0;

  // Per-hue values
  private hue = [0, 0, 0, 0, 0, 0];
  private sat = [0, 0, 0, 0, 0, 0];
  private lum = [0, 0, 0, 0, 0, 0];

  // Current sliders (recreated when switching tabs)
  private slidersContainer: HTMLDivElement;
  private sliders: SliderControl[] = [];

  constructor(container: HTMLElement, options: HSLMixerOptions) {
    this.options = options;

    this.root = document.createElement('div');
    this.root.style.cssText = 'padding: 2px 0;';

    // Tab bar
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display: flex; gap: 4px; margin-bottom: 10px;';

    HUE_BANDS.forEach((band, i) => {
      const btn = document.createElement('button');
      btn.dataset.hueIndex = String(i);
      btn.style.cssText = `
        flex: 1; height: 22px; border-radius: 6px; cursor: pointer;
        border: 2px solid transparent; transition: all 0.15s;
        background: color-mix(in srgb, ${band.color} 20%, #151821); position: relative;
      `;
      btn.title = band.label;

      // Colored dot
      const dot = document.createElement('div');
      dot.style.cssText = `
        width: 8px; height: 8px; border-radius: 50%;
        background: ${band.color}; position: absolute;
        top: 50%; left: 50%; transform: translate(-50%, -50%);
      `;
      btn.appendChild(dot);

      btn.addEventListener('click', () => this.setActiveHue(i as HueIndex));
      tabs.appendChild(btn);
    });

    this.root.appendChild(tabs);

    // Sliders container
    this.slidersContainer = document.createElement('div');
    this.root.appendChild(this.slidersContainer);

    container.appendChild(this.root);

    this.updateTabs();
    this.buildSliders();
  }

  private setActiveHue(index: HueIndex): void {
    this.activeIndex = index;
    this.updateTabs();
    this.buildSliders();
  }

  private updateTabs(): void {
    const buttons = this.root.querySelectorAll('button[data-hue-index]') as NodeListOf<HTMLButtonElement>;
    buttons.forEach((btn, i) => {
      const isActive = i === this.activeIndex;
      btn.style.borderColor = isActive ? HUE_BANDS[i].color + '88' : 'rgba(255,255,255,0.08)';
      btn.style.background = isActive
        ? `color-mix(in srgb, ${HUE_BANDS[i].color} 28%, #151821)`
        : `color-mix(in srgb, ${HUE_BANDS[i].color} 14%, #151821)`;
    });
  }

  private buildSliders(): void {
    // Destroy old sliders
    this.sliders.forEach(s => s.destroy());
    this.sliders = [];
    this.slidersContainer.innerHTML = '';

    const i = this.activeIndex;
    const band = HUE_BANDS[i];

    // Label
    const label = document.createElement('div');
    label.textContent = band.label;
    label.style.cssText = 'font-size: 10px; color: #a1a1aa; margin-bottom: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;';
    this.slidersContainer.appendChild(label);

    // Hue slider
    const hueSlider = new SliderControl(this.slidersContainer, {
      label: 'Hue',
      min: -30,
      max: 30,
      default: 0,
      step: 1,
      value: this.hue[i],
      format: v => (v > 0 ? '+' : '') + v + '\u00B0',
      onChange: v => { this.hue[i] = v; this.emitChange(); },
    });
    this.sliders.push(hueSlider);

    // Saturation slider
    const satSlider = new SliderControl(this.slidersContainer, {
      label: 'Saturation',
      min: -100,
      max: 100,
      default: 0,
      step: 1,
      value: this.sat[i],
      format: v => (v > 0 ? '+' : '') + v,
      onChange: v => { this.sat[i] = v; this.emitChange(); },
    });
    this.sliders.push(satSlider);

    // Luminance slider
    const lumSlider = new SliderControl(this.slidersContainer, {
      label: 'Luminance',
      min: -100,
      max: 100,
      default: 0,
      step: 1,
      value: this.lum[i],
      format: v => (v > 0 ? '+' : '') + v,
      onChange: v => { this.lum[i] = v; this.emitChange(); },
    });
    this.sliders.push(lumSlider);
  }

  private emitChange(): void {
    this.options.onChange([...this.hue], [...this.sat], [...this.lum]);
  }

  setValues(hue: number[], sat: number[], lum: number[], silent = false): void {
    this.hue = [...hue];
    this.sat = [...sat];
    this.lum = [...lum];
    this.buildSliders(); // Rebuild to show updated values
    if (!silent) this.emitChange();
  }

  getValues(): { hue: number[]; sat: number[]; lum: number[] } {
    return { hue: [...this.hue], sat: [...this.sat], lum: [...this.lum] };
  }

  resetAll(silent = false): void {
    this.hue = [0, 0, 0, 0, 0, 0];
    this.sat = [0, 0, 0, 0, 0, 0];
    this.lum = [0, 0, 0, 0, 0, 0];
    this.buildSliders();
    if (!silent) this.emitChange();
  }

  destroy(): void {
    this.sliders.forEach(s => s.destroy());
    this.root.remove();
  }
}
