/**
 * TagInput — Text input with autocomplete and tag chips.
 * Fetches available tags from API, shows suggestions as you type.
 * Vanilla JS.
 */

export interface TagItem {
  id: number;
  name: string;
  color: string;
}

export interface TagInputOptions {
  onChange: (tags: TagItem[]) => void;
}

export class TagInput {
  private root: HTMLDivElement;
  private chipsContainer: HTMLDivElement;
  private input: HTMLInputElement;
  private dropdown: HTMLDivElement;
  private tags: TagItem[] = [];
  private allTags: TagItem[] = [];
  private onChange: (tags: TagItem[]) => void;
  private dropdownVisible = false;

  constructor(container: HTMLElement, options: TagInputOptions) {
    this.onChange = options.onChange;

    this.root = document.createElement('div');
    this.root.style.cssText = 'padding: 6px 0;';

    const label = document.createElement('span');
    label.textContent = 'Tags';
    label.style.cssText = 'font-size: 10px; color: #a1a1aa; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;';
    this.root.appendChild(label);

    // Chips container
    this.chipsContainer = document.createElement('div');
    this.chipsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; min-height: 0;';
    this.root.appendChild(this.chipsContainer);

    // Input wrapper (relative for dropdown)
    const inputWrapper = document.createElement('div');
    inputWrapper.style.cssText = 'position: relative;';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Add tag...';
    this.input.style.cssText = `
      width: 100%; box-sizing: border-box;
      background: #181a20; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px; padding: 7px 9px; color: #e4e4e7;
      font-size: 11px; outline: none; transition: border-color 0.15s;
    `;
    this.input.addEventListener('focus', () => {
      this.input.style.borderColor = 'var(--umbra-accent, #6366f1)';
      this.showDropdown();
    });
    this.input.addEventListener('blur', () => {
      this.input.style.borderColor = 'rgba(255,255,255,0.1)';
      // Delay hide so click on dropdown item registers
      setTimeout(() => this.hideDropdown(), 150);
    });
    this.input.addEventListener('input', () => this.updateDropdown());
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));

    inputWrapper.appendChild(this.input);

    // Dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.style.cssText = `
      position: absolute; top: 100%; left: 0; right: 0; z-index: 50;
      background: #181a20; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px; margin-top: 4px; max-height: 140px; overflow-y: auto;
      display: none; scrollbar-width: thin; scrollbar-color: #3f3f46 transparent;
    `;
    inputWrapper.appendChild(this.dropdown);

    this.root.appendChild(inputWrapper);
    container.appendChild(this.root);

    // Load available tags
    this.fetchAllTags();
  }

  private async fetchAllTags(): Promise<void> {
    try {
      const res = await fetch('/api/editor/tags');
      if (!res.ok) return;
      const data = await res.json();
      this.allTags = data.tags || [];
    } catch {
      // ignore
    }
  }

  private showDropdown(): void {
    this.dropdownVisible = true;
    this.updateDropdown();
  }

  private hideDropdown(): void {
    this.dropdownVisible = false;
    this.dropdown.style.display = 'none';
  }

  private updateDropdown(): void {
    if (!this.dropdownVisible) return;

    const query = this.input.value.trim().toLowerCase();
    const currentTagIds = new Set(this.tags.map(t => t.id));

    // Filter: not already added, and matches query
    let suggestions = this.allTags.filter(t => !currentTagIds.has(t.id));
    if (query) {
      suggestions = suggestions.filter(t => t.name.toLowerCase().includes(query));
    }

    this.dropdown.innerHTML = '';

    if (query && !this.allTags.some(t => t.name.toLowerCase() === query)) {
      // Show "create new" option
      const createItem = this.createDropdownItem(`Create "${this.input.value.trim()}"`, true);
      createItem.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.createAndAddTag(this.input.value.trim());
      });
      this.dropdown.appendChild(createItem);
    }

    for (const tag of suggestions.slice(0, 10)) {
      const item = this.createDropdownItem(tag.name, false);
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.addTag(tag);
      });
      this.dropdown.appendChild(item);
    }

    this.dropdown.style.display = this.dropdown.children.length > 0 ? 'block' : 'none';
  }

  private createDropdownItem(text: string, isCreate: boolean): HTMLDivElement {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 7px 9px; font-size: 11px; cursor: pointer;
      color: ${isCreate ? 'var(--umbra-accent, #6366f1)' : '#d4d4d8'};
      transition: background 0.1s;
    `;
    item.textContent = text;
    item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,0.05)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    return item;
  }

  private async createAndAddTag(name: string): Promise<void> {
    try {
      const res = await fetch('/api/editor/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const tag: TagItem = { id: data.id, name, color: '' };
      this.allTags.push(tag);
      this.addTag(tag);
    } catch {
      // ignore
    }
  }

  private addTag(tag: TagItem): void {
    if (this.tags.some(t => t.id === tag.id)) return;
    this.tags.push(tag);
    this.input.value = '';
    this.renderChips();
    this.hideDropdown();
    this.onChange(this.tags);
  }

  private removeTag(tagId: number): void {
    this.tags = this.tags.filter(t => t.id !== tagId);
    this.renderChips();
    this.onChange(this.tags);
  }

  private renderChips(): void {
    this.chipsContainer.innerHTML = '';
    for (const tag of this.tags) {
      const chip = document.createElement('span');
      chip.style.cssText = `
        display: inline-flex; align-items: center; gap: 3px;
        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 3px; padding: 2px 6px; font-size: 10px; color: #d4d4d8;
      `;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = tag.name;
      chip.appendChild(nameSpan);

      const removeBtn = document.createElement('span');
      removeBtn.textContent = '\u00d7';
      removeBtn.style.cssText = 'cursor: pointer; color: #71717a; font-size: 12px; line-height: 1; margin-left: 2px;';
      removeBtn.addEventListener('click', () => this.removeTag(tag.id));
      removeBtn.addEventListener('mouseenter', () => { removeBtn.style.color = '#ef4444'; });
      removeBtn.addEventListener('mouseleave', () => { removeBtn.style.color = '#71717a'; });
      chip.appendChild(removeBtn);

      this.chipsContainer.appendChild(chip);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = this.input.value.trim();
      if (!query) return;

      // Check if exact match exists in allTags
      const existing = this.allTags.find(t => t.name.toLowerCase() === query.toLowerCase());
      if (existing) {
        this.addTag(existing);
      } else {
        this.createAndAddTag(query);
      }
    }
    if (e.key === 'Backspace' && !this.input.value && this.tags.length > 0) {
      this.removeTag(this.tags[this.tags.length - 1].id);
    }
  }

  setTags(tags: TagItem[], silent = false): void {
    this.tags = [...tags];
    this.renderChips();
    if (!silent) this.onChange(this.tags);
  }

  getTags(): TagItem[] {
    return [...this.tags];
  }

  destroy(): void {
    this.root.remove();
  }
}
