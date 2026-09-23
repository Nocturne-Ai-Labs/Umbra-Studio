export class GalleryCachedPageValidation {
  private pendingKey = '';

  markCachedPage(key: string): void {
    this.pendingKey = key;
  }

  isPending(key: string): boolean {
    return this.pendingKey === key;
  }

  clearAfterFreshPage(key: string): void {
    if (this.isPending(key)) this.pendingKey = '';
  }

  needsRefreshForSummary(key: string, cachedSignature: string | undefined, currentSignature: string): boolean {
    if (!this.isPending(key)) return false;
    if (!cachedSignature || cachedSignature !== currentSignature) return true;
    this.pendingKey = '';
    return false;
  }
}
