/**
 * PasteSettingsDialog — Modal dialog for choosing which adjustment groups to paste.
 * Vanilla JS, no React dependencies.
 */

import { pushModal, popModal } from './ModalGuard';
import { EditAdjustments } from '../webgl/WebGLPipeline';

export interface PasteGroup {
  id: string;
  label: string;
  keys: (keyof EditAdjustments)[];
}

const PASTE_GROUPS: PasteGroup[] = [
  { id: 'basic', label: 'Basic', keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'] },
  { id: 'color', label: 'Color', keys: ['temperature', 'tint', 'vibrance', 'saturation'] },
  { id: 'hsl', label: 'HSL', keys: ['hslHue', 'hslSat', 'hslLum'] },
  { id: 'curves', label: 'Curves', keys: ['curveRGB', 'curveRed', 'curveGreen', 'curveBlue'] },
  { id: 'detail', label: 'Detail', keys: ['sharpen', 'clarity'] },
  { id: 'effects', label: 'Effects', keys: ['effectsEnabled', 'effectLayers'] },
];

const STORAGE_KEY = 'paste_settings_selection';

export class PasteSettingsDialog {
  private overlay: HTMLDivElement;
  private selected = new Set<string>();

  constructor(
    clipboard: EditAdjustments,
    onPaste: (filteredAdj: Partial<EditAdjustments>) => void,
    onCancel: () => void,
  ) {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    this.selected = new Set(PASTE_GROUPS.map(g => g.id));

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
    `;
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) { this.close(); onCancel(); }
    });

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #18181b; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 24px; width: 320px;
      color: #e4e4e7; font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    `;

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Paste Settings';
    title.style.cssText = 'margin: 0 0 16px; font-size: 16px; font-weight: 700; color: white;';
    dialog.appendChild(title);

    // Quick toggles
    const quickRow = document.createElement('div');
    quickRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';

    const selectAllBtn = this.createSmallBtn('Select All', () => {
      PASTE_GROUPS.forEach(g => this.selected.add(g.id));
      this.updateCheckboxes(checkboxes);
    });
    const deselectAllBtn = this.createSmallBtn('Deselect All', () => {
      this.selected.clear();
      this.updateCheckboxes(checkboxes);
    });
    quickRow.appendChild(selectAllBtn);
    quickRow.appendChild(deselectAllBtn);
    dialog.appendChild(quickRow);

    // Checkbox groups
    const checkboxes: { groupId: string; checkbox: HTMLInputElement }[] = [];
    for (const group of PASTE_GROUPS) {
      const row = document.createElement('label');
      row.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 6px 4px; cursor: pointer; font-size: 13px; color: #d4d4d8;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = this.selected.has(group.id);
      cb.style.cssText = 'accent-color: var(--umbra-accent, #6366f1); width: 16px; height: 16px;';
      cb.addEventListener('change', () => {
        if (cb.checked) this.selected.add(group.id);
        else this.selected.delete(group.id);
      });

      const label = document.createElement('span');
      label.textContent = group.label;

      // Show which keys have non-default values
      const activeKeys = group.keys.filter(k => {
        const val = clipboard[k];
        if (typeof val === 'number') return val !== 0;
        if (Array.isArray(val)) {
          if (Array.isArray(val[0])) {
            // Curve points: default is [[0,0],[1,1]]
            const pts = val as [number, number][];
            return !(pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1);
          }
          return (val as number[]).some(v => v !== 0);
        }
        return false;
      });
      if (activeKeys.length > 0) {
        const badge = document.createElement('span');
        badge.textContent = `${activeKeys.length} changed`;
        badge.style.cssText = 'font-size: 10px; color: var(--umbra-accent, #6366f1); margin-left: auto;';
        row.appendChild(cb);
        row.appendChild(label);
        row.appendChild(badge);
      } else {
        row.appendChild(cb);
        row.appendChild(label);
      }

      dialog.appendChild(row);
      checkboxes.push({ groupId: group.id, checkbox: cb });
    }

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px; margin-top: 20px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      flex: 1; padding: 10px; border-radius: 6px; font-size: 13px; font-weight: 600;
      background: #27272a; color: #a1a1aa; border: 1px solid rgba(255,255,255,0.1);
      cursor: pointer;
    `;
    cancelBtn.addEventListener('click', () => { this.close(); onCancel(); });
    btnRow.appendChild(cancelBtn);

    const pasteBtn = document.createElement('button');
    pasteBtn.textContent = 'Paste';
    pasteBtn.style.cssText = `
      flex: 1; padding: 10px; border-radius: 6px; font-size: 13px; font-weight: 600;
      background: var(--umbra-accent, #6366f1); color: white; border: none;
      cursor: pointer;
    `;
    pasteBtn.addEventListener('click', () => {
      // Filter clipboard to selected groups
      const filtered: Partial<EditAdjustments> = {};
      for (const group of PASTE_GROUPS) {
        if (!this.selected.has(group.id)) continue;
        for (const key of group.keys) {
          (filtered as any)[key] = clipboard[key];
        }
      }

      this.close();
      onPaste(filtered);
    });
    btnRow.appendChild(pasteBtn);

    dialog.appendChild(btnRow);
    this.overlay.appendChild(dialog);
    document.body.appendChild(this.overlay);
    pushModal('paste-settings');
  }

  private createSmallBtn(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      font-size: 10px; color: #a1a1aa; background: #27272a; border: 1px solid rgba(255,255,255,0.1);
      padding: 3px 8px; border-radius: 3px; cursor: pointer;
    `;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private updateCheckboxes(checkboxes: { groupId: string; checkbox: HTMLInputElement }[]): void {
    for (const { groupId, checkbox } of checkboxes) {
      checkbox.checked = this.selected.has(groupId);
    }
  }

  private close(): void {
    popModal('paste-settings');
    this.overlay.remove();
  }
}
