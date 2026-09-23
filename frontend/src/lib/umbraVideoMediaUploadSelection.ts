interface UmbraVideoMediaUploadToken {
  selectionRevision: number;
  uploadGeneration: number;
}

export class UmbraVideoMediaUploadSelection {
  private selectionRevision = 0;
  private uploadGeneration = 0;
  private mounted = true;
  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  begin(): UmbraVideoMediaUploadToken {
    this.uploadGeneration += 1;
    return { selectionRevision: this.selectionRevision, uploadGeneration: this.uploadGeneration };
  }

  mount(): void {
    this.mounted = true;
  }

  dispose(): void {
    this.mounted = false;
    this.invalidate();
  }

  observePath(path: string): void {
    if (path === this.path) return;
    this.path = path;
    this.invalidate();
  }

  invalidate(): void {
    this.selectionRevision += 1;
  }

  isCurrent(token: UmbraVideoMediaUploadToken): boolean {
    return this.isLatestUpload(token) && token.selectionRevision === this.selectionRevision;
  }

  isLatestUpload(token: UmbraVideoMediaUploadToken): boolean {
    return this.mounted && token.uploadGeneration === this.uploadGeneration;
  }
}
