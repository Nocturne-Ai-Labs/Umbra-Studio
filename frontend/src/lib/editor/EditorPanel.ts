/**
 * EditorPanel — Main editor panel with 4-tab layout:
 *   Adjustments | Watermark | Export | Split
 * Lightroom-style scrollable right side panel with collapsible sections.
 * Pure vanilla JS, no React dependencies.
 */

import { SliderControl } from './controls/SliderControl';
import { CurveControl } from './controls/CurveControl';
import { HSLMixer } from './controls/HSLMixer';
import { TagInput, TagItem } from './controls/TagInput';
import { CropTool } from './CropTool';
import { WatermarkPanel } from './WatermarkPanel';
import { WatermarkConfig } from './WatermarkEngine';
import { EventBus } from '../EventBus';
import {
  EditAdjustments,
  DEFAULT_ADJUSTMENTS,
  EffectLayer,
  EffectKind,
  EffectBlendMode,
  EffectRegionMode,
  createDefaultEffectLayer,
} from '../webgl/WebGLPipeline';
import { isModalOpen } from './ModalGuard';
import { PresetManager, Preset } from './PresetManager';
import {
  ExportSettings, loadExportSettings, saveExportSettings,
  FORMAT_LABELS, exportImage, downloadBlob,
} from './ExportEngine';
import { previewTemplate } from './FilenameTemplate';
import { SplitStackingPanel } from './SplitStackingPanel';
import { buildFsImageUrl } from '@/lib/utils';

const MAX_UNDO = 50;

type TabId = 'adjustments' | 'watermark' | 'export' | 'split';

export class EditorPanel {
  private root: HTMLDivElement;
  private eventBus: EventBus;

  // Tab system
  private activeTab: TabId = 'adjustments';
  private tabBar: HTMLDivElement;
  private adjustmentsContainer: HTMLDivElement;
  private watermarkContainer: HTMLDivElement;
  private exportContainer: HTMLDivElement;
  private splitContainer: HTMLDivElement;
  private tabButtons = new Map<TabId, HTMLButtonElement>();

  // Current adjustments
  private adjustments: EditAdjustments = { ...DEFAULT_ADJUSTMENTS };

  // Undo/redo
  private undoStack: EditAdjustments[] = [];
  private redoStack: EditAdjustments[] = [];

  // Controls
  private sliders = new Map<string, SliderControl>();
  private curveControl: CurveControl | null = null;
  private hslMixer: HSLMixer | null = null;
  private cropTool: CropTool | null = null;
  private tagInput: TagInput | null = null;

  // Presets
  private presetManager = new PresetManager();
  private presetListEl: HTMLDivElement | null = null;
  private presetNameInputEl: HTMLInputElement | null = null;
  private presetSelectEl: HTMLSelectElement | null = null;
  private presetStatusEl: HTMLDivElement | null = null;
  private fxPresetNameInputEl: HTMLInputElement | null = null;
  private fxPresetSelectEl: HTMLSelectElement | null = null;
  private fxPresetStatusEl: HTMLDivElement | null = null;
  private effectsEnableCheckEl: HTMLInputElement | null = null;

  // Effects
  private selectedEffectLayerId: string | null = null;
  private effectsListEl: HTMLDivElement | null = null;
  private effectsEditorEl: HTMLDivElement | null = null;
  private distortionsListEl: HTMLDivElement | null = null;

  // Sections for collapse state
  private sections = new Map<string, { header: HTMLElement; body: HTMLElement; expanded: boolean }>();

  // Loaded image path
  private currentPath: string | null = null;

  // Watermark
  private watermarkPanel: WatermarkPanel | null = null;
  private watermarkConfig: WatermarkConfig | null = null;
  private watermarkPreviewEnabled = false;
  private watermarkPreviewBtnEl: HTMLButtonElement | null = null;
  private watermarkPreviewHintEl: HTMLDivElement | null = null;

  // Export
  private exportSettings: ExportSettings;
  private exportStatusEl: HTMLDivElement | null = null;
  private exportBtn: HTMLButtonElement | null = null;
  private exportWatermarkCheckEl: HTMLInputElement | null = null;
  private splitPanel: SplitStackingPanel | null = null;

  // Multi-edit
  private multiEditPaths: string[] = [];

  constructor(container: HTMLElement, eventBus: EventBus) {
    this.eventBus = eventBus;
    this.exportSettings = loadExportSettings();

    this.root = document.createElement('div');
    this.root.style.cssText = `
      width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden;
      background: linear-gradient(180deg, #0b0c10 0%, #090a0d 100%);
      border-left: 1px solid rgba(255,255,255,0.08);
      color: #a1a1aa; font-family: system-ui, -apple-system, sans-serif;
      scrollbar-width: thin; scrollbar-color: #27272a transparent;
      display: flex; flex-direction: column;
    `;

    // Panel header with title + buttons
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
      flex-shrink: 0; background: #0d0f14; z-index: 5;
    `;

    const title = document.createElement('span');
    title.textContent = 'Editor';
    title.style.cssText = 'font-size: 12px; font-weight: 800; color: #f4f4f5; text-transform: uppercase; letter-spacing: 1px; flex: 0 0 auto; padding-top: 2px;';

    const headerBtns = document.createElement('div');
    headerBtns.style.cssText = `
      display: flex; gap: 6px; align-items: center; justify-content: flex-end;
      flex-wrap: wrap; flex: 1 1 auto; min-width: 0;
    `;
    headerBtns.id = 'editor-header-btns';

    header.appendChild(title);
    header.appendChild(headerBtns);
    this.root.appendChild(header);

    // Tab bar
    this.tabBar = document.createElement('div');
    this.tabBar.style.cssText = `
      display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0; background: #0b0d12;
      padding: 0 8px;
    `;

    const tabs: { id: TabId; label: string }[] = [
      { id: 'adjustments', label: 'Adjustments' },
      { id: 'watermark', label: 'Watermark' },
      { id: 'export', label: 'Export' },
      { id: 'split', label: 'Split' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.textContent = tab.label;
      btn.style.cssText = `
        flex: 1; padding: 10px 6px; border: none; cursor: pointer;
        font-size: 10px; font-weight: 700; transition: all 0.15s;
        background: transparent; position: relative;
        text-transform: uppercase; letter-spacing: 0.6px;
        color: ${tab.id === this.activeTab ? '#f4f4f5' : '#71717a'};
        border-bottom: 2px solid ${tab.id === this.activeTab ? 'var(--umbra-accent, #6366f1)' : 'transparent'};
      `;
      btn.addEventListener('click', () => this.switchTab(tab.id));
      this.tabBar.appendChild(btn);
      this.tabButtons.set(tab.id, btn);
    }

    this.root.appendChild(this.tabBar);

    // Tab content containers
    this.adjustmentsContainer = document.createElement('div');
    this.adjustmentsContainer.style.cssText = 'flex: 1; overflow-y: auto; overflow-x: hidden; padding: 8px 8px 12px; scrollbar-width: thin; scrollbar-color: #27272a transparent;';

    this.watermarkContainer = document.createElement('div');
    this.watermarkContainer.style.cssText = 'flex: 1; overflow-y: auto; overflow-x: hidden; display: none; padding: 8px 14px; scrollbar-width: thin; scrollbar-color: #27272a transparent;';

    this.exportContainer = document.createElement('div');
    this.exportContainer.style.cssText = 'flex: 1; overflow-y: auto; overflow-x: hidden; display: none; padding: 8px 14px; scrollbar-width: thin; scrollbar-color: #27272a transparent;';

    this.splitContainer = document.createElement('div');
    this.splitContainer.style.cssText = 'flex: 1; overflow-y: auto; overflow-x: hidden; display: none; scrollbar-width: thin; scrollbar-color: #27272a transparent;';

    this.root.appendChild(this.adjustmentsContainer);
    this.root.appendChild(this.watermarkContainer);
    this.root.appendChild(this.exportContainer);
    this.root.appendChild(this.splitContainer);

    // Build sections in adjustments tab
    this.buildAdjustmentsHeader(headerBtns);
    this.buildPresetSection();
    this.buildOrganizationSection();
    this.buildBasicSection();
    this.buildColorSection();
    this.buildHSLSection();
    this.buildCurvesSection();
    this.buildDetailSection();
    this.buildEffectsSection();
    this.buildDistortionsSection();
    this.buildCropSection();
    this.refreshEffectsUI();

    // Build watermark tab
    this.buildWatermarkTab();

    // Build export tab
    this.buildExportTab();

    // Build split tab
    this.buildSplitTab();

    // Stop keyboard events from inputs in watermark/export tabs from reaching
    // window-level handlers (Lightbox, Filmstrip, LibraryLayout, etc.)
    const stopInputPropagation = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        !!target?.isContentEditable ||
        !!target?.closest('[contenteditable="true"]') ||
        !!target?.closest('.monaco-editor') ||
        !!target?.closest('.monaco-list') ||
        !!target?.closest('.suggest-widget') ||
        !!target?.closest('.quick-input-widget') ||
        !!target?.closest('.parameter-hints-widget');
      if (isTyping) {
        e.stopPropagation();
      }
    };
    this.watermarkContainer.addEventListener('keydown', stopInputPropagation);
    this.exportContainer.addEventListener('keydown', stopInputPropagation);
    this.splitContainer.addEventListener('keydown', stopInputPropagation);
    this.adjustmentsContainer.addEventListener('keydown', stopInputPropagation);

    container.appendChild(this.root);

    // Listen for undo/redo keyboard shortcuts
    this._onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this._onKeyDown);

    this._onOpenSplit = () => {
      this.switchTab('split');
    };
    eventBus.on('editor:open-split', this._onOpenSplit);
  }

  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onOpenSplit: (() => void) | null = null;

  // --- Tab switching ---

  private switchTab(tab: TabId): void {
    this.activeTab = tab;

    // Update tab button styles
    for (const [id, btn] of this.tabButtons) {
      const isActive = id === tab;
      btn.style.color = isActive ? '#f4f4f5' : '#71717a';
      btn.style.borderBottom = isActive ? '2px solid var(--umbra-accent, #6366f1)' : '2px solid transparent';
    }

    // Show/hide containers
    this.adjustmentsContainer.style.display = tab === 'adjustments' ? 'block' : 'none';
    this.watermarkContainer.style.display = tab === 'watermark' ? 'block' : 'none';
    this.exportContainer.style.display = tab === 'export' ? 'block' : 'none';
    this.splitContainer.style.display = tab === 'split' ? 'block' : 'none';

    // Show/hide header buttons (only show Reset on adjustments tab)
    const headerBtns = this.root.querySelector('#editor-header-btns') as HTMLElement;
    if (headerBtns) {
      headerBtns.style.display = tab === 'adjustments' ? 'flex' : 'none';
    }
  }

  // --- Adjustments Tab Header Buttons ---

  private styleControlButton(btn: HTMLButtonElement, variant: 'neutral' | 'primary' | 'danger' = 'neutral'): void {
    const styleMap = {
      neutral: {
        bg: '#181a20',
        color: '#d4d4d8',
        border: '1px solid rgba(255,255,255,0.12)',
      },
      primary: {
        bg: 'var(--umbra-accent, #6366f1)',
        color: '#ffffff',
        border: '1px solid var(--umbra-accent, #6366f1)',
      },
      danger: {
        bg: 'rgba(239,68,68,0.12)',
        color: '#e4e4e7',
        border: '1px solid rgba(239,68,68,0.5)',
      },
    } as const;
    const selected = styleMap[variant];
    btn.style.cssText = `
      min-height: 30px; padding: 6px 9px; border-radius: 6px; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.4px; cursor: pointer; white-space: normal;
      background: ${selected.bg}; color: ${selected.color}; border: ${selected.border};
      display: inline-flex; align-items: center; justify-content: center; flex: 0 1 auto; line-height: 1.2;
      min-width: 0; max-width: 100%; text-align: center; overflow-wrap: anywhere; word-break: break-word;
      transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.15s;
    `;
  }

  private styleControlSelect(select: HTMLSelectElement): void {
    select.style.cssText = `
      flex: 1; width: 100%; min-width: 0; min-height: 30px; padding: 6px 8px; border-radius: 6px; font-size: 11px;
      background: #181a20; border: 1px solid rgba(255,255,255,0.12); color: #e4e4e7;
      outline: none; box-sizing: border-box;
    `;
  }

  private styleControlInput(input: HTMLInputElement): void {
    input.style.cssText = `
      flex: 1; min-width: 0; width: 100%; min-height: 30px; padding: 6px 8px; border-radius: 6px; font-size: 11px;
      background: #181a20; border: 1px solid rgba(255,255,255,0.12); color: #e4e4e7;
      outline: none; box-sizing: border-box;
    `;
  }

  private buildAdjustmentsHeader(headerBtns: HTMLDivElement): void {
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset All';
    this.styleControlButton(resetBtn, 'danger');
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.color = '#ffffff';
      resetBtn.style.background = 'rgba(239,68,68,0.28)';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.color = '#e4e4e7';
      resetBtn.style.background = 'rgba(239,68,68,0.12)';
    });
    resetBtn.addEventListener('click', () => this.resetAll());

    headerBtns.appendChild(resetBtn);
  }

  // --- Section builder (appends to adjustmentsContainer) ---

  private createSection(title: string, defaultExpanded = true): HTMLDivElement {
    const section = document.createElement('div');
    section.style.cssText = `
      margin: 0 0 8px 0; border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px; background: #101217; overflow: hidden;
      box-shadow: 0 1px 0 rgba(255,255,255,0.02) inset;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 12px; cursor: pointer; display: flex;
      justify-content: space-between; align-items: center;
      user-select: none; transition: background 0.15s;
    `;
    header.addEventListener('mouseenter', () => { header.style.background = 'rgba(255,255,255,0.03)'; });
    header.addEventListener('mouseleave', () => { header.style.background = 'transparent'; });

    const label = document.createElement('span');
    label.textContent = title;
    label.style.cssText = 'font-size: 10px; font-weight: 700; color: #f4f4f5; text-transform: uppercase; letter-spacing: 0.6px;';

    const chevron = document.createElement('span');
    chevron.textContent = '\u25BC';
    chevron.style.cssText = `font-size: 8px; color: #52525b; transition: transform 0.2s;`;
    if (!defaultExpanded) chevron.style.transform = 'rotate(-90deg)';

    const right = document.createElement('div');
    right.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    right.appendChild(chevron);

    header.appendChild(label);
    header.appendChild(right);

    const body = document.createElement('div');
    body.style.cssText = `padding: 6px 12px 12px; overflow: visible; transition: max-height 0.25s ease, opacity 0.2s;`;
    if (!defaultExpanded) {
      body.style.maxHeight = '0';
      body.style.opacity = '0';
      body.style.padding = '0 12px';
      body.style.overflow = 'hidden';
    } else {
      body.style.maxHeight = '1200px';
      body.style.overflow = 'visible';
    }

    header.addEventListener('click', () => {
      const info = this.sections.get(title)!;
      info.expanded = !info.expanded;
      if (info.expanded) {
        body.style.maxHeight = '1200px';
        body.style.opacity = '1';
        body.style.padding = '6px 12px 12px';
        body.style.overflow = 'visible';
        chevron.style.transform = 'rotate(0deg)';
      } else {
        body.style.maxHeight = '0';
        body.style.opacity = '0';
        body.style.padding = '0 12px';
        body.style.overflow = 'hidden';
        chevron.style.transform = 'rotate(-90deg)';
      }
    });

    section.appendChild(header);
    section.appendChild(body);
    this.adjustmentsContainer.appendChild(section);
    this.sections.set(title, { header, body, expanded: defaultExpanded });

    return body;
  }

  private addSectionBadge(title: string, text: string): void {
    const info = this.sections.get(title);
    if (!info) return;
    const badge = document.createElement('span');
    badge.textContent = text;
    badge.style.cssText = `
      font-size: 8px; font-weight: 800; letter-spacing: 0.45px;
      color: #f59e0b; border: 1px solid rgba(245,158,11,0.45);
      background: rgba(245,158,11,0.12); border-radius: 999px; padding: 2px 7px;
      margin-left: 8px;
    `;
    const label = info.header.querySelector('span');
    if (label?.parentElement) {
      label.parentElement.insertBefore(badge, label.nextSibling);
    }
  }

  private addSlider(container: HTMLElement, key: string, label: string, min: number, max: number, defaultVal: number, step: number, format?: (v: number) => string): void {
    const slider = new SliderControl(container, {
      label,
      min,
      max,
      default: defaultVal,
      step,
      value: (this.adjustments as any)[key] ?? defaultVal,
      format: format || (v => (v > 0 ? '+' : '') + Math.round(v)),
      onChange: v => {
        this.pushUndo();
        (this.adjustments as any)[key] = v;
        this.emitAdjustments();
      },
    });
    this.sliders.set(key, slider);
  }

  private buildBasicSection(): void {
    const body = this.createSection('Basic', true);
    this.addSlider(body, 'exposure', 'Exposure', -5, 5, 0, 0.05, v => (v > 0 ? '+' : '') + v.toFixed(2) + ' EV');
    this.addSlider(body, 'contrast', 'Contrast', -100, 100, 0, 1);
    this.addSlider(body, 'highlights', 'Highlights', -100, 100, 0, 1);
    this.addSlider(body, 'shadows', 'Shadows', -100, 100, 0, 1);
    this.addSlider(body, 'whites', 'Whites', -100, 100, 0, 1);
    this.addSlider(body, 'blacks', 'Blacks', -100, 100, 0, 1);
  }

  private buildColorSection(): void {
    const body = this.createSection('Color', true);
    this.addSlider(body, 'temperature', 'Temperature', -100, 100, 0, 1);
    this.addSlider(body, 'tint', 'Tint', -100, 100, 0, 1);
    this.addSlider(body, 'vibrance', 'Vibrance', -100, 100, 0, 1);
    this.addSlider(body, 'saturation', 'Saturation', -100, 100, 0, 1);
  }

  private buildHSLSection(): void {
    const body = this.createSection('HSL Mixer', false);
    this.hslMixer = new HSLMixer(body, {
      onChange: (hue, sat, lum) => {
        this.pushUndo();
        this.adjustments.hslHue = hue;
        this.adjustments.hslSat = sat;
        this.adjustments.hslLum = lum;
        this.emitAdjustments();
      },
    });
  }

  private buildCurvesSection(): void {
    const body = this.createSection('Tone Curves', false);
    this.curveControl = new CurveControl(body, {
      onChange: (channel, points) => {
        this.pushUndo();
        switch (channel) {
          case 'rgb': this.adjustments.curveRGB = points; break;
          case 'red': this.adjustments.curveRed = points; break;
          case 'green': this.adjustments.curveGreen = points; break;
          case 'blue': this.adjustments.curveBlue = points; break;
        }
        this.emitAdjustments();
      },
    });
  }

  private buildDetailSection(): void {
    const body = this.createSection('Detail', false);
    this.addSlider(body, 'sharpen', 'Sharpen', 0, 150, 0, 1, v => String(Math.round(v)));
    this.addSlider(body, 'clarity', 'Clarity', -100, 100, 0, 1);
  }

  private buildEffectsSection(): void {
    const body = this.createSection('Effects', false);
    this.addSectionBadge('Effects', 'BETA');

    const enableRow = document.createElement('label');
    enableRow.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:10px; font-size:11px; color:#e4e4e7;';
    const enableCheck = document.createElement('input');
    enableCheck.type = 'checkbox';
    enableCheck.checked = this.adjustments.effectsEnabled;
    enableCheck.style.cssText = 'accent-color: var(--umbra-accent, #6366f1);';
    this.effectsEnableCheckEl = enableCheck;
    enableCheck.addEventListener('change', () => {
      this.pushUndo();
      this.adjustments.effectsEnabled = enableCheck.checked;
      this.emitAdjustments();
      this.refreshEffectsUI();
    });
    enableRow.appendChild(enableCheck);
    enableRow.appendChild(document.createTextNode('Enable Effects Stack'));
    body.appendChild(enableRow);

    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;';
    const effectSelect = document.createElement('select');
    this.styleControlSelect(effectSelect);
    const effectOptions: { kind: EffectKind; label: string }[] = [
      { kind: 'vignette', label: 'Vignette' },
      { kind: 'tilt_shift', label: 'Tilt Shift' },
      { kind: 'chromatic_aberration', label: 'Chromatic Aberration' },
      { kind: 'film_grain', label: 'Film Grain' },
      { kind: 'pixelate', label: 'Pixelate' },
      { kind: 'ripple', label: 'Ripple' },
      { kind: 'swirl', label: 'Swirl' },
      { kind: 'pinch_bulge', label: 'Pinch/Bulge' },
    ];
    for (const o of effectOptions) {
      const opt = document.createElement('option');
      opt.value = o.kind;
      opt.textContent = o.label;
      effectSelect.appendChild(opt);
    }
    addRow.appendChild(effectSelect);

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Layer';
    this.styleControlButton(addBtn, 'primary');
    addBtn.style.flex = '1 1 118px';
    addBtn.addEventListener('click', () => this.addEffectLayer(effectSelect.value as EffectKind));
    addRow.appendChild(addBtn);
    body.appendChild(addRow);

    const saveRow = document.createElement('div');
    saveRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;';

    const fxPresetNameInput = document.createElement('input');
    fxPresetNameInput.type = 'text';
    fxPresetNameInput.placeholder = 'FX preset name...';
    this.styleControlInput(fxPresetNameInput);
    fxPresetNameInput.style.flex = '1 1 175px';
    this.fxPresetNameInputEl = fxPresetNameInput;
    fxPresetNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveFxPresetWithInputName();
      }
    });
    saveRow.appendChild(fxPresetNameInput);

    const saveFxBtn = document.createElement('button');
    saveFxBtn.textContent = 'Save FX Preset';
    this.styleControlButton(saveFxBtn, 'neutral');
    saveFxBtn.style.flex = '1 1 132px';
    saveFxBtn.addEventListener('click', () => this.saveFxPresetWithInputName());
    saveRow.appendChild(saveFxBtn);

    body.appendChild(saveRow);

    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;';
    const fxPresetSelect = document.createElement('select');
    this.styleControlSelect(fxPresetSelect);
    fxPresetSelect.style.flex = '1 1 175px';
    this.fxPresetSelectEl = fxPresetSelect;
    fxPresetSelect.addEventListener('change', () => {
      const selectedName = fxPresetSelect.options[fxPresetSelect.selectedIndex]?.textContent || '';
      if (this.fxPresetNameInputEl && selectedName && selectedName !== 'No FX presets') {
        this.fxPresetNameInputEl.value = selectedName;
      }
    });
    presetRow.appendChild(fxPresetSelect);

    const loadFxBtn = document.createElement('button');
    loadFxBtn.textContent = 'Load FX Preset';
    this.styleControlButton(loadFxBtn, 'neutral');
    loadFxBtn.style.flex = '1 1 132px';
    loadFxBtn.addEventListener('click', () => {
      this.loadSelectedFxPreset();
    });
    presetRow.appendChild(loadFxBtn);
    body.appendChild(presetRow);

    const status = document.createElement('div');
    status.style.cssText = 'font-size:10px; color:#71717a; min-height:14px; margin-top:-2px; margin-bottom:8px;';
    this.fxPresetStatusEl = status;
    body.appendChild(status);

    this.refreshFxPresetOptions();

    this.effectsListEl = document.createElement('div');
    this.effectsListEl.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-bottom:10px;';
    body.appendChild(this.effectsListEl);

    this.effectsEditorEl = document.createElement('div');
    this.effectsEditorEl.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;';
    body.appendChild(this.effectsEditorEl);
  }

  private buildDistortionsSection(): void {
    const body = this.createSection('Distortions', false);
    const hint = document.createElement('div');
    hint.textContent = 'Quick add distortion layers.';
    hint.style.cssText = 'font-size:10px; color:#71717a; margin-bottom:10px;';
    body.appendChild(hint);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;';
    const kinds: { kind: EffectKind; label: string }[] = [
      { kind: 'ripple', label: 'Ripple' },
      { kind: 'swirl', label: 'Swirl' },
      { kind: 'pinch_bulge', label: 'Pinch/Bulge' },
      { kind: 'pixelate', label: 'Pixelate' },
      { kind: 'tilt_shift', label: 'Tilt Shift' },
    ];
    for (const k of kinds) {
      const btn = document.createElement('button');
      btn.textContent = `+ ${k.label}`;
      this.styleControlButton(btn, 'neutral');
      btn.addEventListener('click', () => this.addEffectLayer(k.kind));
      row.appendChild(btn);
    }
    body.appendChild(row);

    this.distortionsListEl = document.createElement('div');
    this.distortionsListEl.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    body.appendChild(this.distortionsListEl);
  }

  private addEffectLayer(kind: EffectKind): void {
    this.pushUndo();
    const layer = createDefaultEffectLayer(kind);
    this.adjustments.effectLayers = [...this.adjustments.effectLayers, layer];
    this.adjustments.effectsEnabled = true;
    this.selectedEffectLayerId = layer.id;
    this.emitAdjustments();
    this.refreshEffectsUI();
  }

  private updateEffectLayer(id: string, updater: (layer: EffectLayer) => EffectLayer): void {
    this.adjustments.effectLayers = this.adjustments.effectLayers.map((layer) =>
      layer.id === id ? updater(layer) : layer,
    );
  }

  private getSelectedEffectLayer(): EffectLayer | null {
    if (!this.selectedEffectLayerId) return null;
    return this.adjustments.effectLayers.find((layer) => layer.id === this.selectedEffectLayerId) || null;
  }

  private refreshEffectsUI(): void {
    if (!this.effectsListEl || !this.effectsEditorEl) return;
    const layers = this.adjustments.effectLayers;
    this.effectsListEl.innerHTML = '';

    if (!layers.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No effect layers yet.';
      empty.style.cssText = 'font-size:10px; color:#71717a; padding:6px 2px;';
      this.effectsListEl.appendChild(empty);
    } else {
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const row = document.createElement('div');
        const selected = layer.id === this.selectedEffectLayerId;
        row.style.cssText = `
          display:flex; align-items:center; gap:6px; padding:7px 8px; border-radius:8px;
          border:1px solid ${selected ? 'var(--umbra-accent, #6366f1)' : 'rgba(255,255,255,0.1)'};
          background:${selected ? 'color-mix(in srgb, var(--umbra-accent, #6366f1) 16%, #151821)' : '#161920'};
          font-size:10px; color:#e4e4e7; cursor:pointer;
        `;
        row.addEventListener('click', () => {
          this.selectedEffectLayerId = layer.id;
          this.refreshEffectsUI();
        });

        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = layer.enabled;
        enabled.addEventListener('click', (e) => e.stopPropagation());
        enabled.addEventListener('change', () => {
          this.pushUndo();
          this.updateEffectLayer(layer.id, (curr) => ({ ...curr, enabled: enabled.checked }));
          this.emitAdjustments();
          this.refreshEffectsUI();
        });
        row.appendChild(enabled);

        const name = document.createElement('span');
        name.textContent = layer.kind.replace(/_/g, ' ');
        name.style.cssText = 'flex:1; text-transform: capitalize; font-weight:600;';
        row.appendChild(name);

        const up = document.createElement('button');
        up.textContent = '↑';
        up.style.cssText = 'background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:11px;';
        up.addEventListener('click', (e) => {
          e.stopPropagation();
          if (i === 0) return;
          this.pushUndo();
          const next = [...layers];
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
          this.adjustments.effectLayers = next;
          this.emitAdjustments();
          this.refreshEffectsUI();
        });
        row.appendChild(up);

        const down = document.createElement('button');
        down.textContent = '↓';
        down.style.cssText = 'background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:11px;';
        down.addEventListener('click', (e) => {
          e.stopPropagation();
          if (i >= layers.length - 1) return;
          this.pushUndo();
          const next = [...layers];
          [next[i + 1], next[i]] = [next[i], next[i + 1]];
          this.adjustments.effectLayers = next;
          this.emitAdjustments();
          this.refreshEffectsUI();
        });
        row.appendChild(down);

        const del = document.createElement('button');
        del.textContent = '×';
        del.style.cssText = 'background:none; border:none; color:#ef4444; cursor:pointer; font-size:14px; line-height:1;';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          this.pushUndo();
          this.adjustments.effectLayers = this.adjustments.effectLayers.filter((curr) => curr.id !== layer.id);
          if (this.selectedEffectLayerId === layer.id) this.selectedEffectLayerId = this.adjustments.effectLayers[0]?.id || null;
          this.emitAdjustments();
          this.refreshEffectsUI();
        });
        row.appendChild(del);

        this.effectsListEl.appendChild(row);
      }
    }

    if (this.distortionsListEl) {
      this.distortionsListEl.innerHTML = '';
      const distortions = this.adjustments.effectLayers.filter((layer) =>
        ['ripple', 'swirl', 'pinch_bulge', 'pixelate', 'tilt_shift'].includes(layer.kind),
      );
      if (!distortions.length) {
        const empty = document.createElement('div');
        empty.textContent = 'No distortion layers.';
        empty.style.cssText = 'font-size:10px; color:#71717a; padding:4px 2px;';
        this.distortionsListEl.appendChild(empty);
      } else {
        for (const layer of distortions) {
          const line = document.createElement('button');
          line.textContent = `${layer.enabled ? '●' : '○'} ${layer.kind.replace(/_/g, ' ')}`;
          line.style.cssText = `
            text-align:left; font-size:10px; font-weight:600; padding:6px 8px; border-radius:7px; cursor:pointer;
            background:#161920; border:1px solid rgba(255,255,255,0.1); color:#d4d4d8;
          `;
          line.addEventListener('click', () => {
            this.selectedEffectLayerId = layer.id;
            this.refreshEffectsUI();
          });
          this.distortionsListEl.appendChild(line);
        }
      }
    }

    this.effectsEditorEl.innerHTML = '';
    const selectedLayer = this.getSelectedEffectLayer();
    if (!selectedLayer) return;

    const blendRow = document.createElement('div');
    blendRow.style.cssText = 'display:flex; gap:8px; margin-bottom:10px;';
    const kindSel = document.createElement('select');
    this.styleControlSelect(kindSel);
    for (const kind of ['vignette', 'tilt_shift', 'pixelate', 'ripple', 'swirl', 'pinch_bulge', 'chromatic_aberration', 'film_grain'] as EffectKind[]) {
      const opt = document.createElement('option');
      opt.value = kind;
      opt.textContent = kind.replace(/_/g, ' ');
      opt.selected = kind === selectedLayer.kind;
      kindSel.appendChild(opt);
    }
    kindSel.addEventListener('change', () => {
      this.pushUndo();
      const next = createDefaultEffectLayer(kindSel.value as EffectKind);
      this.updateEffectLayer(selectedLayer.id, (curr) => ({
        ...curr,
        kind: next.kind,
        params: next.params,
      }));
      this.emitAdjustments();
      this.refreshEffectsUI();
    });
    blendRow.appendChild(kindSel);

    const blendSel = document.createElement('select');
    this.styleControlSelect(blendSel);
    blendSel.style.width = '120px';
    blendSel.style.flex = '0 0 120px';
    for (const mode of ['normal', 'screen', 'multiply'] as EffectBlendMode[]) {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = mode;
      opt.selected = mode === selectedLayer.blendMode;
      blendSel.appendChild(opt);
    }
    blendSel.addEventListener('change', () => {
      this.pushUndo();
      this.updateEffectLayer(selectedLayer.id, (curr) => ({ ...curr, blendMode: blendSel.value as EffectBlendMode }));
      this.emitAdjustments();
      this.refreshEffectsUI();
    });
    blendRow.appendChild(blendSel);
    this.effectsEditorEl.appendChild(blendRow);

    this.createEffectSlider(this.effectsEditorEl, 'Opacity', 0, 1, 0.01, selectedLayer.opacity, (v) => {
      this.updateEffectLayer(selectedLayer.id, (curr) => ({ ...curr, opacity: v }));
      this.emitAdjustments();
    });

    const regionRow = document.createElement('div');
    regionRow.style.cssText = 'display:flex; gap:8px; margin:10px 0;';
    const regionMode = document.createElement('select');
    this.styleControlSelect(regionMode);
    for (const mode of ['global', 'linear_gradient', 'radial'] as EffectRegionMode[]) {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = mode.replace('_', ' ');
      opt.selected = mode === selectedLayer.region.mode;
      regionMode.appendChild(opt);
    }
    regionMode.addEventListener('change', () => {
      this.pushUndo();
      this.updateEffectLayer(selectedLayer.id, (curr) => ({
        ...curr,
        region: { ...curr.region, mode: regionMode.value as EffectRegionMode },
      }));
      this.emitAdjustments();
      this.refreshEffectsUI();
    });
    regionRow.appendChild(regionMode);

    const invertBtn = document.createElement('button');
    invertBtn.textContent = selectedLayer.region.invert ? 'Invert On' : 'Invert Off';
    this.styleControlButton(invertBtn, 'neutral');
    invertBtn.style.width = '110px';
    invertBtn.addEventListener('click', () => {
      this.pushUndo();
      this.updateEffectLayer(selectedLayer.id, (curr) => ({
        ...curr,
        region: { ...curr.region, invert: !curr.region.invert },
      }));
      this.emitAdjustments();
      this.refreshEffectsUI();
    });
    regionRow.appendChild(invertBtn);
    this.effectsEditorEl.appendChild(regionRow);

    this.createEffectSlider(this.effectsEditorEl, 'Center X', 0, 1, 0.01, selectedLayer.region.centerX, (v) => {
      this.updateEffectLayer(selectedLayer.id, (curr) => ({ ...curr, region: { ...curr.region, centerX: v } }));
      this.emitAdjustments();
    });
    this.createEffectSlider(this.effectsEditorEl, 'Center Y', 0, 1, 0.01, selectedLayer.region.centerY, (v) => {
      this.updateEffectLayer(selectedLayer.id, (curr) => ({ ...curr, region: { ...curr.region, centerY: v } }));
      this.emitAdjustments();
    });
    this.createEffectSlider(this.effectsEditorEl, 'Radius', 0.01, 1, 0.01, selectedLayer.region.radius, (v) => {
      this.updateEffectLayer(selectedLayer.id, (curr) => ({ ...curr, region: { ...curr.region, radius: v } }));
      this.emitAdjustments();
    });
    this.createEffectSlider(this.effectsEditorEl, 'Feather', 0, 1, 0.01, selectedLayer.region.feather, (v) => {
      this.updateEffectLayer(selectedLayer.id, (curr) => ({ ...curr, region: { ...curr.region, feather: v } }));
      this.emitAdjustments();
    });
    this.createEffectSlider(this.effectsEditorEl, 'Angle', -180, 180, 1, selectedLayer.region.angle, (v) => {
      this.updateEffectLayer(selectedLayer.id, (curr) => ({ ...curr, region: { ...curr.region, angle: v } }));
      this.emitAdjustments();
    });

    this.buildEffectKindControls(this.effectsEditorEl, selectedLayer);
  }

  private createEffectSlider(
    container: HTMLElement,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onInput: (value: number) => void,
  ): void {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:8px;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:3px;';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.cssText = 'font-size:10px; color:#a1a1aa; text-transform:uppercase; letter-spacing:0.4px;';
    const v = document.createElement('span');
    v.style.cssText = 'font-size:10px; color:#d4d4d8; font-family:monospace;';
    head.appendChild(l);
    head.appendChild(v);
    row.appendChild(head);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.cssText = 'width:100%; accent-color: var(--umbra-accent, #6366f1);';
    const format = () => {
      const n = parseFloat(input.value);
      v.textContent = step >= 1 ? String(Math.round(n)) : n.toFixed(2);
    };
    format();
    let pushedUndo = false;
    input.addEventListener('input', () => {
      if (!pushedUndo) {
        this.pushUndo();
        pushedUndo = true;
      }
      format();
      onInput(parseFloat(input.value));
    });
    input.addEventListener('change', () => {
      pushedUndo = false;
    });
    row.appendChild(input);
    container.appendChild(row);
  }

  private buildEffectKindControls(container: HTMLElement, layer: EffectLayer): void {
    const setParam = (key: string, value: number) => {
      this.updateEffectLayer(layer.id, (curr) => ({
        ...curr,
        params: { ...curr.params, [key]: value },
      }));
      this.emitAdjustments();
    };

    const slider = (label: string, key: string, min: number, max: number, step: number, fallback: number) => {
      this.createEffectSlider(container, label, min, max, step, layer.params[key] ?? fallback, (v) => setParam(key, v));
    };

    switch (layer.kind) {
      case 'vignette':
        slider('Amount', 'amount', 0, 1.2, 0.01, 0.45);
        slider('Midpoint', 'midpoint', 0.05, 1, 0.01, 0.62);
        slider('Roundness', 'roundness', -1, 1, 0.01, 0);
        break;
      case 'tilt_shift':
        slider('Blur', 'blur', 0, 1.5, 0.01, 0.6);
        slider('Band', 'band', 0.02, 0.6, 0.01, 0.18);
        break;
      case 'pixelate':
        slider('Block Size', 'blockSize', 1, 80, 1, 8);
        break;
      case 'ripple':
        slider('Amplitude', 'amplitude', 0, 30, 0.1, 6);
        slider('Frequency', 'frequency', 1, 80, 0.1, 22);
        slider('Phase', 'phase', 0, 20, 0.01, 0);
        break;
      case 'swirl':
        slider('Radius', 'radius', 0.05, 1, 0.01, 0.35);
        slider('Angle', 'angle', -7, 7, 0.01, 2.4);
        break;
      case 'pinch_bulge':
        slider('Radius', 'radius', 0.05, 1, 0.01, 0.35);
        slider('Strength', 'strength', -1, 1, 0.01, 0.35);
        break;
      case 'chromatic_aberration':
        slider('Amount', 'amount', 0, 12, 0.01, 2.2);
        slider('Radial Bias', 'radialBias', 0, 1, 0.01, 1);
        break;
      case 'film_grain':
        slider('Intensity', 'intensity', 0, 1, 0.01, 0.18);
        slider('Size', 'size', 0.5, 3, 0.01, 1);
        slider('Monochrome', 'monochrome', 0, 1, 1, 1);
        break;
    }
  }

  private buildCropSection(): void {
    const body = this.createSection('Crop & Rotate', false);
    this.cropTool = new CropTool(body, {
      onChange: (_crop) => {
        this.eventBus.emit('editor:crop-changed', _crop);
      },
    });
  }

  private buildOrganizationSection(): void {
    const body = this.createSection('Organization');
    const section = body.parentElement as HTMLDivElement | null;
    if (section) {
      section.style.position = 'relative';
      section.style.zIndex = '30';
    }

    this.tagInput = new TagInput(body, {
      onChange: (tags) => {
        this.eventBus.emit('editor:tags-changed', {
          path: this.currentPath,
          tags,
        });
      },
    });
  }

  private buildPresetSection(): void {
    const body = this.createSection('Presets', false);

    // Save preset row
    const saveRow = document.createElement('div');
    saveRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Preset name...';
    this.styleControlInput(nameInput);
    nameInput.style.flex = '1 1 175px';
    this.presetNameInputEl = nameInput;
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveAdjustmentPresetWithInputName();
      }
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Preset';
    this.styleControlButton(saveBtn, 'primary');
    saveBtn.style.flex = '1 1 132px';
    saveBtn.addEventListener('click', () => this.saveAdjustmentPresetWithInputName());

    saveRow.appendChild(nameInput);
    saveRow.appendChild(saveBtn);
    body.appendChild(saveRow);

    const loadRow = document.createElement('div');
    loadRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;';

    const presetSelect = document.createElement('select');
    this.styleControlSelect(presetSelect);
    presetSelect.style.flex = '1 1 175px';
    this.presetSelectEl = presetSelect;
    presetSelect.addEventListener('change', () => {
      const selectedName = presetSelect.options[presetSelect.selectedIndex]?.textContent || '';
      if (this.presetNameInputEl && selectedName && selectedName !== 'No adjustment presets') {
        this.presetNameInputEl.value = selectedName;
      }
    });
    loadRow.appendChild(presetSelect);

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load Preset';
    this.styleControlButton(loadBtn, 'neutral');
    loadBtn.style.flex = '1 1 132px';
    loadBtn.addEventListener('click', () => this.loadSelectedAdjustmentPreset());
    loadRow.appendChild(loadBtn);
    body.appendChild(loadRow);

    const status = document.createElement('div');
    status.style.cssText = 'font-size:10px; color:#71717a; min-height:14px; margin-bottom:8px;';
    this.presetStatusEl = status;
    body.appendChild(status);

    // Preset list container
    this.presetListEl = document.createElement('div');
    this.presetListEl.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    body.appendChild(this.presetListEl);

    this.refreshPresetList();
  }

  private buildSplitTab(): void {
    this.splitPanel = new SplitStackingPanel(this.splitContainer, this.eventBus);
  }

  private cloneEffectLayers(layers: EffectLayer[]): EffectLayer[] {
    return layers.map((layer) => ({
      ...layer,
      region: { ...layer.region },
      params: { ...layer.params },
    }));
  }

  private parsePresetAdjustments(preset: Preset): Partial<EditAdjustments> {
    try {
      return typeof preset.adjustments === 'string'
        ? JSON.parse(preset.adjustments)
        : preset.adjustments;
    } catch {
      return {};
    }
  }

  private setFxPresetStatus(message: string, tone: 'muted' | 'success' | 'error' = 'muted'): void {
    if (!this.fxPresetStatusEl) return;
    const colors = {
      muted: '#71717a',
      success: '#22c55e',
      error: '#ef4444',
    } as const;
    this.fxPresetStatusEl.textContent = message;
    this.fxPresetStatusEl.style.color = colors[tone];
  }

  private setPresetStatus(message: string, tone: 'muted' | 'success' | 'error' = 'muted'): void {
    if (!this.presetStatusEl) return;
    const colors = {
      muted: '#71717a',
      success: '#22c55e',
      error: '#ef4444',
    } as const;
    this.presetStatusEl.textContent = message;
    this.presetStatusEl.style.color = colors[tone];
  }

  private async saveFxPresetWithInputName(): Promise<void> {
    const name = this.fxPresetNameInputEl?.value.trim() || '';
    if (!name) {
      this.setFxPresetStatus('Enter an FX preset name.', 'error');
      return;
    }
    const fxOnly: EditAdjustments = {
      ...DEFAULT_ADJUSTMENTS,
      effectsEnabled: this.adjustments.effectsEnabled,
      effectLayers: this.cloneEffectLayers(this.adjustments.effectLayers),
    };
    const savedId = await this.presetManager.save(name, fxOnly, 'effects');
    if (!savedId) {
      this.setFxPresetStatus('Failed to save FX preset.', 'error');
      return;
    }
    await this.refreshPresetList();
    await this.refreshFxPresetOptions(savedId);
    this.setFxPresetStatus(`Saved FX preset "${name}".`, 'success');
  }

  private async saveAdjustmentPresetWithInputName(): Promise<void> {
    const name = this.presetNameInputEl?.value.trim() || '';
    if (!name) {
      this.setPresetStatus('Enter a preset name.', 'error');
      return;
    }
    const savedId = await this.presetManager.save(name, this.adjustments, 'custom');
    if (!savedId) {
      this.setPresetStatus('Failed to save preset.', 'error');
      return;
    }
    await this.refreshPresetList();
    await this.refreshPresetOptions(savedId);
    this.setPresetStatus(`Saved preset "${name}".`, 'success');
  }

  private async refreshPresetOptions(preferredPresetId?: number): Promise<void> {
    if (!this.presetSelectEl) return;

    const selectedBefore = Number(this.presetSelectEl.value);
    const presets = await this.presetManager.list();
    const adjustmentPresets = presets.filter((p) => (p.category || 'custom') !== 'effects');
    this.presetSelectEl.innerHTML = '';

    if (adjustmentPresets.length === 0) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No adjustment presets';
      this.presetSelectEl.appendChild(empty);
      this.presetSelectEl.disabled = true;
      return;
    }

    this.presetSelectEl.disabled = false;
    for (const preset of adjustmentPresets) {
      const opt = document.createElement('option');
      opt.value = String(preset.id);
      opt.textContent = preset.name;
      this.presetSelectEl.appendChild(opt);
    }

    if (preferredPresetId && adjustmentPresets.some((p) => p.id === preferredPresetId)) {
      this.presetSelectEl.value = String(preferredPresetId);
    } else if (selectedBefore && adjustmentPresets.some((p) => p.id === selectedBefore)) {
      this.presetSelectEl.value = String(selectedBefore);
    } else {
      this.presetSelectEl.value = String(adjustmentPresets[0].id);
    }

    const selectedName = this.presetSelectEl.options[this.presetSelectEl.selectedIndex]?.textContent || '';
    if (this.presetNameInputEl && selectedName && selectedName !== 'No adjustment presets') {
      this.presetNameInputEl.value = selectedName;
    }
  }

  private async refreshFxPresetOptions(preferredPresetId?: number): Promise<void> {
    if (!this.fxPresetSelectEl) return;

    const selectedBefore = Number(this.fxPresetSelectEl.value);
    const presets = await this.presetManager.list();
    const effectPresets = presets.filter((p) => (p.category || 'custom') === 'effects');
    this.fxPresetSelectEl.innerHTML = '';

    if (effectPresets.length === 0) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No FX presets';
      this.fxPresetSelectEl.appendChild(empty);
      this.fxPresetSelectEl.disabled = true;
      return;
    }

    this.fxPresetSelectEl.disabled = false;
    for (const preset of effectPresets) {
      const opt = document.createElement('option');
      opt.value = String(preset.id);
      opt.textContent = preset.name;
      this.fxPresetSelectEl.appendChild(opt);
    }

    if (preferredPresetId && effectPresets.some((p) => p.id === preferredPresetId)) {
      this.fxPresetSelectEl.value = String(preferredPresetId);
      return;
    }

    if (selectedBefore && effectPresets.some((p) => p.id === selectedBefore)) {
      this.fxPresetSelectEl.value = String(selectedBefore);
      return;
    }

    this.fxPresetSelectEl.value = String(effectPresets[0].id);
  }

  private async loadSelectedFxPreset(): Promise<void> {
    if (!this.fxPresetSelectEl) return;
    const presetId = Number(this.fxPresetSelectEl.value);
    if (!Number.isFinite(presetId) || presetId <= 0) {
      this.setFxPresetStatus('Pick an FX preset to load.', 'error');
      return;
    }

    const presets = await this.presetManager.list();
    const preset = presets.find((p) => p.id === presetId && (p.category || 'custom') === 'effects');
    if (!preset) {
      this.setFxPresetStatus('FX preset not found.', 'error');
      return;
    }

    const adj = this.parsePresetAdjustments(preset);
    const layers = Array.isArray((adj as any).effectLayers)
      ? this.cloneEffectLayers((adj as any).effectLayers as EffectLayer[])
      : [];

    this.pushUndo();
    this.adjustments.effectLayers = layers;
    this.adjustments.effectsEnabled = Boolean((adj as any).effectsEnabled) || layers.length > 0;
    this.selectedEffectLayerId = this.adjustments.effectLayers[0]?.id || null;
    if (this.effectsEnableCheckEl) {
      this.effectsEnableCheckEl.checked = this.adjustments.effectsEnabled;
    }
    this.emitAdjustments();
    this.refreshEffectsUI();
    if (this.fxPresetNameInputEl) this.fxPresetNameInputEl.value = preset.name;
    this.setFxPresetStatus(`Loaded FX preset "${preset.name}".`, 'success');
  }

  private async loadSelectedAdjustmentPreset(): Promise<void> {
    if (!this.presetSelectEl) return;
    const presetId = Number(this.presetSelectEl.value);
    if (!Number.isFinite(presetId) || presetId <= 0) {
      this.setPresetStatus('Pick a preset to load.', 'error');
      return;
    }

    const presets = await this.presetManager.list();
    const preset = presets.find((p) => p.id === presetId && (p.category || 'custom') !== 'effects');
    if (!preset) {
      this.setPresetStatus('Preset not found.', 'error');
      return;
    }

    const adj = this.parsePresetAdjustments(preset);
    this.pushUndo();
    this.adjustments = { ...DEFAULT_ADJUSTMENTS, ...adj };
    if ((adj as any).effectLayers) {
      this.adjustments.effectLayers = this.cloneEffectLayers((adj as any).effectLayers as EffectLayer[]);
    }
    this.syncControlsFromAdjustments();
    this.emitAdjustments();
    if (this.presetNameInputEl) this.presetNameInputEl.value = preset.name;
    this.setPresetStatus(`Loaded preset "${preset.name}".`, 'success');
  }

  private async refreshPresetList(): Promise<void> {
    if (!this.presetListEl) return;
    const presets = await this.presetManager.list();
    const adjustmentPresets = presets.filter((p) => (p.category || 'custom') !== 'effects');
    this.presetListEl.innerHTML = '';

    if (adjustmentPresets.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No adjustment presets saved';
      empty.style.cssText = 'font-size: 10px; color: #52525b; padding: 8px 0; text-align: center;';
      this.presetListEl.appendChild(empty);
      await this.refreshPresetOptions();
      await this.refreshFxPresetOptions();
      return;
    }

    // Group by category
    const grouped = new Map<string, Preset[]>();
    for (const p of adjustmentPresets) {
      const cat = p.category || 'custom';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(p);
    }

    for (const [category, items] of grouped) {
      if (grouped.size > 1) {
        const catLabel = document.createElement('div');
        catLabel.textContent = category;
        catLabel.style.cssText = 'font-size: 9px; color: #71717a; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 4px; padding: 2px 2px;';
        this.presetListEl.appendChild(catLabel);
      }

      for (const preset of items) {
        const row = document.createElement('div');
        row.style.cssText = `
          display: flex; align-items: flex-start; justify-content: space-between; gap: 6px;
          padding: 7px 8px; border-radius: 7px; cursor: pointer;
          transition: background 0.1s; font-size: 11px; color: #d4d4d8;
          border: 1px solid rgba(255,255,255,0.08); background: #161920;
        `;
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.05)'; });
        row.addEventListener('mouseleave', () => { row.style.background = '#161920'; });

        const nameEl = document.createElement('span');
        nameEl.textContent = preset.name;
        nameEl.style.cssText = 'flex: 1; min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.28;';

        const adj = this.parsePresetAdjustments(preset);

        nameEl.addEventListener('click', () => {
          this.pushUndo();
          this.adjustments = { ...DEFAULT_ADJUSTMENTS, ...adj };
          if ((adj as any).effectLayers) {
            this.adjustments.effectLayers = this.cloneEffectLayers((adj as any).effectLayers as EffectLayer[]);
          }
          this.syncControlsFromAdjustments();
          this.emitAdjustments();
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = '\u00D7';
        delBtn.style.cssText = `
          font-size: 14px; color: #52525b; background: none; border: none;
          cursor: pointer; padding: 0 2px; line-height: 1; flex: 0 0 auto;
        `;
        delBtn.addEventListener('mouseenter', () => { delBtn.style.color = '#ef4444'; });
        delBtn.addEventListener('mouseleave', () => { delBtn.style.color = '#52525b'; });
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.presetManager.delete(preset.id);
          this.refreshPresetList();
        });

        row.appendChild(nameEl);
        row.appendChild(delBtn);
        this.presetListEl.appendChild(row);
      }
    }

    await this.refreshPresetOptions();
    await this.refreshFxPresetOptions();
  }

  // --- Watermark Tab ---

  private getWatermarkPreviewConfig(): WatermarkConfig | null {
    if (!this.watermarkConfig) return null;
    return {
      ...this.watermarkConfig,
      enabled: this.watermarkPreviewEnabled && this.watermarkConfig.enabled,
    };
  }

  private emitWatermarkPreviewConfig(): void {
    const previewConfig = this.getWatermarkPreviewConfig();
    if (!previewConfig) return;
    this.eventBus.emit('editor:watermark-changed', previewConfig);
  }

  private updateWatermarkPreviewButton(): void {
    if (!this.watermarkPreviewBtnEl) return;
    const active = this.watermarkPreviewEnabled;
    this.watermarkPreviewBtnEl.textContent = active ? 'Preview On' : 'Preview Watermark';
    this.watermarkPreviewBtnEl.style.background = active ? 'var(--umbra-accent, #6366f1)' : '#181a20';
    this.watermarkPreviewBtnEl.style.color = active ? '#ffffff' : '#d4d4d8';
    this.watermarkPreviewBtnEl.style.borderColor = active
      ? 'var(--umbra-accent, #6366f1)'
      : 'rgba(255,255,255,0.12)';

    if (!this.watermarkPreviewHintEl) return;
    this.watermarkPreviewHintEl.textContent = active
      ? 'Live preview is active. Export watermark settings are unchanged.'
      : 'Preview is off. Toggle to see live watermark placement before export.';
    this.watermarkPreviewHintEl.style.color = active ? '#a5b4fc' : '#71717a';
  }

  private buildWatermarkTab(): void {
    this.watermarkPanel = new WatermarkPanel(this.watermarkContainer, (config) => {
      this.watermarkConfig = config;
      // Emit for live preview in viewer (honors preview toggle override)
      this.emitWatermarkPreviewConfig();
      // Also update export settings watermark config
      this.exportSettings.watermarkConfig = config;
      if (this.exportWatermarkCheckEl) {
        this.exportWatermarkCheckEl.checked = !!config.enabled;
      }
      saveExportSettings(this.exportSettings);
    });

    this.watermarkConfig = this.watermarkPanel.getConfig();

    const previewWrap = document.createElement('div');
    previewWrap.style.cssText = `
      position: sticky; bottom: -8px; z-index: 4; margin-top: 12px; padding: 10px 0 8px;
      border-top: 1px solid rgba(255,255,255,0.08);
      background: linear-gradient(180deg, rgba(11,13,18,0.2) 0%, rgba(11,13,18,0.95) 35%);
    `;

    const previewBtn = document.createElement('button');
    this.styleControlButton(previewBtn, 'neutral');
    previewBtn.style.width = '100%';
    previewBtn.style.minHeight = '34px';
    previewBtn.style.fontSize = '11px';
    previewBtn.addEventListener('click', () => {
      this.watermarkPreviewEnabled = !this.watermarkPreviewEnabled;
      this.updateWatermarkPreviewButton();
      this.emitWatermarkPreviewConfig();
    });
    this.watermarkPreviewBtnEl = previewBtn;
    previewWrap.appendChild(previewBtn);

    const previewHint = document.createElement('div');
    previewHint.style.cssText = 'font-size:10px; line-height:1.35; margin-top:8px;';
    this.watermarkPreviewHintEl = previewHint;
    previewWrap.appendChild(previewHint);

    this.watermarkContainer.appendChild(previewWrap);
    this.updateWatermarkPreviewButton();
    this.emitWatermarkPreviewConfig();
  }

  // --- Export Tab ---

  private buildExportTab(): void {
    const el = this.exportContainer;

    // Format selector
    el.appendChild(this.createExportLabel('Format'));
    const formatRow = document.createElement('div');
    formatRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 12px;';

    for (const fmt of ['image/png', 'image/jpeg', 'image/webp'] as const) {
      const btn = document.createElement('button');
      btn.textContent = FORMAT_LABELS[fmt];
      const isActive = this.exportSettings.format === fmt;
      btn.style.cssText = `
        flex: 1; padding: 6px; border-radius: 4px; font-size: 11px; font-weight: 600;
        cursor: pointer; transition: all 0.15s; border: 1px solid rgba(255,255,255,0.1);
        background: ${isActive ? 'var(--umbra-accent, #6366f1)' : '#27272a'};
        color: ${isActive ? 'white' : '#a1a1aa'};
      `;
      btn.addEventListener('click', () => {
        this.exportSettings.format = fmt;
        saveExportSettings(this.exportSettings);
        this.updateExportFormatButtons(formatRow);
        this.updateExportQualityVisibility();
      });
      formatRow.appendChild(btn);
    }
    el.appendChild(formatRow);

    // Quality slider
    const qualityContainer = document.createElement('div');
    qualityContainer.dataset.exportQuality = 'true';
    qualityContainer.style.cssText = 'margin-bottom: 12px;';

    const qualityHeader = document.createElement('div');
    qualityHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';
    qualityHeader.appendChild(this.createExportLabel('Quality'));

    const qualityLabel = document.createElement('span');
    qualityLabel.textContent = `${Math.round(this.exportSettings.quality * 100)}%`;
    qualityLabel.style.cssText = 'font-size: 10px; color: #a1a1aa; font-weight: 600;';
    qualityHeader.appendChild(qualityLabel);
    qualityContainer.appendChild(qualityHeader);

    const qualitySlider = document.createElement('input');
    qualitySlider.type = 'range';
    qualitySlider.min = '10';
    qualitySlider.max = '100';
    qualitySlider.value = String(Math.round(this.exportSettings.quality * 100));
    qualitySlider.style.cssText = `
      width: 100%; height: 4px; border-radius: 2px; appearance: none;
      background: #3f3f46; cursor: pointer; accent-color: var(--umbra-accent, #6366f1);
    `;
    qualitySlider.addEventListener('input', () => {
      const val = parseInt(qualitySlider.value);
      this.exportSettings.quality = val / 100;
      qualityLabel.textContent = `${val}%`;
      saveExportSettings(this.exportSettings);
    });
    qualityContainer.appendChild(qualitySlider);
    el.appendChild(qualityContainer);

    // Max longest side
    el.appendChild(this.createExportLabel('Max Longest Side (px)'));
    const maxSideInput = document.createElement('input');
    maxSideInput.type = 'number';
    maxSideInput.min = '0';
    maxSideInput.max = '16384';
    maxSideInput.placeholder = '0 = no resize';
    maxSideInput.value = this.exportSettings.maxLongestSide > 0 ? String(this.exportSettings.maxLongestSide) : '';
    maxSideInput.style.cssText = `
      width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 4px;
      background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7;
      font-size: 12px; outline: none; margin-bottom: 12px;
    `;
    maxSideInput.addEventListener('input', () => {
      this.exportSettings.maxLongestSide = parseInt(maxSideInput.value) || 0;
      saveExportSettings(this.exportSettings);
    });
    el.appendChild(maxSideInput);

    // Filename template
    el.appendChild(this.createExportLabel('Filename Template'));
    const templateInput = document.createElement('input');
    templateInput.type = 'text';
    templateInput.value = this.exportSettings.filenameTemplate;
    templateInput.placeholder = '{name}_edited';
    templateInput.style.cssText = `
      width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 4px;
      background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7;
      font-size: 12px; font-family: monospace; outline: none; margin-bottom: 4px;
    `;

    const templatePreview = document.createElement('div');
    templatePreview.style.cssText = 'font-size: 10px; color: #52525b; margin-bottom: 12px; font-family: monospace;';
    const updatePreview = () => {
      const sampleName = this.currentPath
        ? (this.currentPath.split('/').pop() || 'image').replace(/\.[^.]+$/, '')
        : 'DSC_0042';
      templatePreview.textContent = `\u2192 ${previewTemplate(this.exportSettings.filenameTemplate, sampleName)}`;
    };
    updatePreview();

    templateInput.addEventListener('input', () => {
      this.exportSettings.filenameTemplate = templateInput.value;
      saveExportSettings(this.exportSettings);
      updatePreview();
    });
    el.appendChild(templateInput);
    el.appendChild(templatePreview);

    // Embed metadata checkbox
    const metaRow = document.createElement('label');
    metaRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 16px; cursor: pointer; font-size: 12px; color: #d4d4d8;';
    const metaCheck = document.createElement('input');
    metaCheck.type = 'checkbox';
    metaCheck.checked = this.exportSettings.embedMetadata;
    metaCheck.style.cssText = 'accent-color: var(--umbra-accent, #6366f1);';
    metaCheck.addEventListener('change', () => {
      this.exportSettings.embedMetadata = metaCheck.checked;
      saveExportSettings(this.exportSettings);
    });
    metaRow.appendChild(metaCheck);
    metaRow.appendChild(document.createTextNode('Embed generation metadata'));
    el.appendChild(metaRow);

    // Apply watermark checkbox (export-only toggle)
    const watermarkRow = document.createElement('label');
    watermarkRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 16px; cursor: pointer; font-size: 12px; color: #d4d4d8;';
    const watermarkCheck = document.createElement('input');
    watermarkCheck.type = 'checkbox';
    watermarkCheck.checked = !!this.exportSettings.watermarkConfig?.enabled;
    watermarkCheck.style.cssText = 'accent-color: var(--umbra-accent, #6366f1);';
    watermarkCheck.addEventListener('change', () => {
      this.exportSettings.watermarkConfig = {
        ...this.exportSettings.watermarkConfig,
        enabled: watermarkCheck.checked,
      };
      if (this.watermarkConfig) {
        this.watermarkConfig = {
          ...this.watermarkConfig,
          enabled: watermarkCheck.checked,
        };
      }
      this.emitWatermarkPreviewConfig();
      saveExportSettings(this.exportSettings);
    });
    this.exportWatermarkCheckEl = watermarkCheck;
    watermarkRow.appendChild(watermarkCheck);
    watermarkRow.appendChild(document.createTextNode('Apply watermark'));
    el.appendChild(watermarkRow);

    // Status
    this.exportStatusEl = document.createElement('div');
    this.exportStatusEl.style.cssText = 'font-size: 11px; color: #71717a; text-align: center; min-height: 16px; margin-bottom: 8px;';
    el.appendChild(this.exportStatusEl);

    // Export button
    this.exportBtn = document.createElement('button');
    this.exportBtn.textContent = 'Export';
    this.exportBtn.style.cssText = `
      width: 100%; padding: 10px; border-radius: 6px; font-size: 13px; font-weight: 600;
      background: var(--umbra-accent, #6366f1); color: white; border: none;
      cursor: pointer; transition: all 0.15s;
    `;
    this.exportBtn.addEventListener('mouseenter', () => { this.exportBtn!.style.filter = 'brightness(1.15)'; });
    this.exportBtn.addEventListener('mouseleave', () => { this.exportBtn!.style.filter = 'none'; });
    this.exportBtn.addEventListener('click', () => this.doExport());
    el.appendChild(this.exportBtn);

    this.updateExportQualityVisibility();
  }

  private createExportLabel(text: string): HTMLDivElement {
    const label = document.createElement('div');
    label.textContent = text;
    label.style.cssText = 'font-size: 11px; color: #71717a; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;';
    return label;
  }

  private updateExportFormatButtons(row: HTMLElement): void {
    const buttons = row.querySelectorAll('button');
    const formats = ['image/png', 'image/jpeg', 'image/webp'];
    buttons.forEach((btn, i) => {
      const isActive = this.exportSettings.format === formats[i];
      (btn as HTMLElement).style.background = isActive ? 'var(--umbra-accent, #6366f1)' : '#27272a';
      (btn as HTMLElement).style.color = isActive ? 'white' : '#a1a1aa';
    });
  }

  private updateExportQualityVisibility(): void {
    const container = this.exportContainer.querySelector('[data-export-quality]') as HTMLElement;
    if (container) {
      container.style.display = this.exportSettings.format === 'image/png' ? 'none' : 'block';
    }
  }

  private async doExport(): Promise<void> {
    if (!this.currentPath || !this.exportBtn || !this.exportStatusEl) return;

    this.exportBtn.disabled = true;
    this.exportBtn.style.opacity = '0.5';
    this.exportStatusEl.textContent = 'Rendering...';
    this.exportStatusEl.style.color = 'var(--umbra-accent, #6366f1)';

    try {
      const imageSrc = buildFsImageUrl(this.currentPath);

      // Use current watermark config from watermark panel
      const settings = { ...this.exportSettings };
      if (this.watermarkConfig) {
        settings.watermarkConfig = {
          ...this.watermarkConfig,
          enabled: !!this.exportSettings.watermarkConfig?.enabled,
        };
      }

      const result = await exportImage(
        this.currentPath,
        imageSrc,
        this.adjustments,
        settings,
        1,
        1,
        (status) => { if (this.exportStatusEl) this.exportStatusEl.textContent = status; },
      );

      downloadBlob(result.blob, result.filename);

      const sizeMB = (result.blob.size / 1024 / 1024).toFixed(1);
      this.exportStatusEl.textContent = `Exported ${result.filename} (${sizeMB} MB)`;
      this.exportStatusEl.style.color = '#22c55e';
    } catch (err: any) {
      console.error('[EditorPanel] Export failed:', err);
      this.exportStatusEl.textContent = `Export failed: ${err.message}`;
      this.exportStatusEl.style.color = '#ef4444';
    } finally {
      this.exportBtn.disabled = false;
      this.exportBtn.style.opacity = '1';
    }
  }

  // --- Public API ---

  /** Load organization meta (called by wrapper when image changes) */
  loadMeta(tags: TagItem[]): void {
    this.tagInput?.setTags(tags, true);
  }

  /** Push current state onto undo stack (call before making changes) */
  private pushUndo(): void {
    this.undoStack.push(structuredClone(this.adjustments));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(structuredClone(this.adjustments));
    this.adjustments = prev;
    this.syncControlsFromAdjustments();
    this.emitAdjustments();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(structuredClone(this.adjustments));
    this.adjustments = next;
    this.syncControlsFromAdjustments();
    this.emitAdjustments();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (isModalOpen()) return;
    const target = e.target as HTMLElement | null;
    const isTyping =
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.tagName === 'SELECT' ||
      !!target?.isContentEditable ||
      !!target?.closest('[contenteditable="true"]') ||
      !!target?.closest('.monaco-editor') ||
      !!target?.closest('.monaco-list') ||
      !!target?.closest('.suggest-widget') ||
      !!target?.closest('.quick-input-widget') ||
      !!target?.closest('.parameter-hints-widget');
    if (isTyping) return;
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    }
    if (e.ctrlKey && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      this.redo();
    }
    if (e.ctrlKey && e.key === 'Z') {
      e.preventDefault();
      this.redo();
    }
  }

  /** Sync all slider/control UI to match current adjustments (for undo/redo/load) */
  private syncControlsFromAdjustments(): void {
    const a = this.adjustments;

    // Scalar sliders
    const sliderKeys = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks',
      'temperature', 'tint', 'vibrance', 'saturation', 'sharpen', 'clarity'];
    for (const key of sliderKeys) {
      this.sliders.get(key)?.setValue((a as any)[key], true);
    }

    // HSL mixer
    this.hslMixer?.setValues(a.hslHue, a.hslSat, a.hslLum, true);

    // Curves
    this.curveControl?.setPoints('rgb', a.curveRGB, true);
    this.curveControl?.setPoints('red', a.curveRed, true);
    this.curveControl?.setPoints('green', a.curveGreen, true);
    this.curveControl?.setPoints('blue', a.curveBlue, true);
    if (this.effectsEnableCheckEl) {
      this.effectsEnableCheckEl.checked = !!a.effectsEnabled;
    }

    if (!this.selectedEffectLayerId || !a.effectLayers.some((layer) => layer.id === this.selectedEffectLayerId)) {
      this.selectedEffectLayerId = a.effectLayers[0]?.id || null;
    }
    this.refreshEffectsUI();
  }

  private emitAdjustments(): void {
    const payload = {
      ...this.adjustments,
      effectLayers: this.adjustments.effectLayers.map((layer) => ({
        ...layer,
        region: { ...layer.region },
        params: { ...layer.params },
      })),
    };
    this.eventBus.emit('editor:adjustments-changed', payload);

    // Multi-edit: also emit for all selected paths
    if (this.multiEditPaths.length > 1) {
      this.eventBus.emit('editor:multi-adjustments-changed', {
        paths: this.multiEditPaths,
        adjustments: payload,
      });
    }
  }

  /** Load adjustments (e.g., from a sidecar file) */
  loadAdjustments(path: string, adj: Partial<EditAdjustments> | null): void {
    this.currentPath = path;
    this.undoStack = [];
    this.redoStack = [];

    if (adj) {
      this.adjustments = { ...DEFAULT_ADJUSTMENTS, ...adj };
    } else {
      this.adjustments = { ...DEFAULT_ADJUSTMENTS };
    }
    if (adj?.effectLayers) {
      this.adjustments.effectLayers = adj.effectLayers.map((layer) => ({
        ...layer,
        region: { ...layer.region },
        params: { ...layer.params },
      }));
    }

    this.syncControlsFromAdjustments();
    this.emitAdjustments();
    this.splitPanel?.setSelection(this.currentPath, this.multiEditPaths);
  }

  getAdjustments(): EditAdjustments {
    return {
      ...structuredClone(this.adjustments),
      effectLayers: this.adjustments.effectLayers.map((layer) => ({
        ...layer,
        region: { ...layer.region },
        params: { ...layer.params },
      })),
    };
  }

  getCurrentPath(): string | null {
    return this.currentPath;
  }

  getCropTool(): CropTool | null {
    return this.cropTool;
  }

  getExportSettings(): ExportSettings {
    return { ...this.exportSettings };
  }

  /** Set multi-edit paths for batch editing */
  setMultiEditPaths(paths: string[]): void {
    this.multiEditPaths = paths;
    this.splitPanel?.setSelection(this.currentPath, this.multiEditPaths);
  }

  resetAll(): void {
    this.pushUndo();
    this.adjustments = { ...DEFAULT_ADJUSTMENTS };
    this.selectedEffectLayerId = null;
    this.hslMixer?.resetAll(true);
    this.curveControl?.resetAll(true);
    this.cropTool?.reset(true);
    this.syncControlsFromAdjustments();
    this.emitAdjustments();
  }

  destroy(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._onOpenSplit) this.eventBus.off('editor:open-split', this._onOpenSplit);
    this.sliders.forEach(s => s.destroy());
    this.curveControl?.destroy();
    this.hslMixer?.destroy();
    this.cropTool?.destroy();
    this.tagInput?.destroy();
    this.watermarkPanel?.destroy();
    this.splitPanel?.destroy();
    this.root.remove();
  }
}

