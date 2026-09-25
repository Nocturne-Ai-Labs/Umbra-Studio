export function getTrackedComfyProcessPids(
  trackedPid: number | null,
  trackedAlive: boolean,
  signaturePids: number[],
  parents: ReadonlyMap<number, number>,
): number[] {
  if (!trackedAlive || !trackedPid) return [];

  const owned = new Set<number>([trackedPid]);
  for (const candidate of signaturePids) {
    let pid = candidate;
    const visited = new Set<number>();
    while (pid > 0 && !visited.has(pid)) {
      if (pid === trackedPid) {
        owned.add(candidate);
        break;
      }
      visited.add(pid);
      pid = parents.get(pid) || 0;
    }
  }
  return [...owned];
}
