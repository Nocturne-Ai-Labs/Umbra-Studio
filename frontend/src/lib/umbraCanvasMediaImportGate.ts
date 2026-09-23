import type { UmbraUiMediaHandoff } from '@/lib/umbraUiMediaHandoff';

type CanvasImportHandoff = Pick<UmbraUiMediaHandoff, 'createdAt' | 'path'>;

export function isSameUmbraCanvasImportHandoff(
  left: CanvasImportHandoff | null,
  right: CanvasImportHandoff | null,
): boolean {
  return !!left && !!right && left.createdAt === right.createdAt && left.path === right.path;
}

export class UmbraCanvasMediaImportGate {
  private selected: CanvasImportHandoff | null = null;
  private importing: CanvasImportHandoff | null = null;

  select(handoff: CanvasImportHandoff): void {
    this.selected = handoff;
  }

  begin(handoff: CanvasImportHandoff): boolean {
    if (this.importing || !this.isCurrent(handoff)) return false;
    this.importing = handoff;
    return true;
  }

  isCurrent(handoff: CanvasImportHandoff): boolean {
    return isSameUmbraCanvasImportHandoff(this.selected, handoff);
  }

  dismiss(handoff: CanvasImportHandoff): boolean {
    if (!this.isCurrent(handoff)) return false;
    this.selected = null;
    return true;
  }

  finish(handoff: CanvasImportHandoff): void {
    if (isSameUmbraCanvasImportHandoff(this.importing, handoff)) this.importing = null;
  }
}
