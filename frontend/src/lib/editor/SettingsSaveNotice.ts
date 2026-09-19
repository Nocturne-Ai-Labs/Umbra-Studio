/** Inline save failure with an explicit retry; never replaces the editor controls. */
export class SettingsSaveNotice {
  private element = document.createElement('div');
  private sequence = 0;

  constructor(container: HTMLElement) {
    this.element.setAttribute('role', 'status');
    this.element.style.cssText = 'min-height:24px;font-size:11px;color:#f87171;';
    container.prepend(this.element);
  }

  save(write: () => Promise<void>): void {
    const sequence = ++this.sequence;
    this.element.style.color = '#a1a1aa';
    this.element.textContent = 'Saving settings...';
    void write().then(() => {
      if (sequence === this.sequence) this.element.textContent = '';
    }).catch(() => {
      if (sequence !== this.sequence) return;
      this.element.style.color = '#f87171';
      this.element.textContent = 'Settings not saved. ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => this.save(write));
      this.element.appendChild(retry);
    });
  }
}
