export interface UmbraCanvasMaskSnapshotLeaseInput {
  referencedUrls: ReadonlySet<string>;
  leases: ReadonlyMap<string, number>;
  pendingRestoreUrl: string;
  presentRevision: number;
}

export interface UmbraCanvasMaskSnapshotLeaseResolution {
  retainedUrls: Set<string>;
  settledLeaseUrls: string[];
}

export function resolveUmbraCanvasMaskSnapshotLeases({
  referencedUrls,
  leases,
  pendingRestoreUrl,
  presentRevision,
}: UmbraCanvasMaskSnapshotLeaseInput): UmbraCanvasMaskSnapshotLeaseResolution {
  const retainedUrls = new Set(referencedUrls);
  const settledLeaseUrls: string[] = [];
  if (pendingRestoreUrl) retainedUrls.add(pendingRestoreUrl);

  for (const [url, expectedRevision] of leases) {
    if (referencedUrls.has(url)) {
      settledLeaseUrls.push(url);
      continue;
    }
    if (presentRevision < expectedRevision) {
      retainedUrls.add(url);
      continue;
    }
    settledLeaseUrls.push(url);
  }

  return { retainedUrls, settledLeaseUrls };
}
