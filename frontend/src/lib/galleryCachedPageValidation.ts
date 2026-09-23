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

  needsRefreshForFirstSummary(
    key: string,
    cachedSummarySignature: string | undefined,
    listingInventorySignature: string | undefined,
    currentSummarySignature: string | undefined,
  ): boolean {
    if (this.isPending(key) || cachedSummarySignature) return false;
    // Split Gallery appends watcher and metadata revisions after the names hash.
    const summaryInventorySignature = String(currentSummarySignature || '').split(':', 1)[0];
    return Boolean(listingInventorySignature && summaryInventorySignature
      && listingInventorySignature !== summaryInventorySignature);
  }
}
