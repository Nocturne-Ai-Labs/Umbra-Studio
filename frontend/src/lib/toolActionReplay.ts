export interface ActionReplay {
  actionId: string;
  rows: { sequence: number; message: string }[];
  dropped: number;
  logEnd: number;
}

export interface ActionSnapshot {
  id: string;
  action?: string;
  tool?: string;
  status?: 'running' | 'completed' | 'failed';
  startedAt?: number;
  logs?: string[];
  logStart?: number;
  logEnd?: number;
  droppedLogs?: number;
  error?: string;
  verifyFailure?: { title?: string; nextSteps?: string[] };
}

export function emptyReplay(actionId: string): ActionReplay {
  return { actionId, rows: [], dropped: 0, logEnd: 0 };
}

// Sequence offsets, never ring length or socket readiness, identify records.
export function mergeActionReplay(current: ActionReplay, snapshot: ActionSnapshot): ActionReplay {
  if (snapshot.id !== current.actionId) return current;
  const rows = new Map(current.rows.map(row => [row.sequence, row.message]));
  const logs = snapshot.logs || [];
  const start = snapshot.logStart ?? 0;
  logs.forEach((message, index) => rows.set(start + index, message));
  const ordered = [...rows].sort(([a], [b]) => a - b).slice(-200);
  const logEnd = Math.max(current.logEnd, snapshot.logEnd ?? 0, (ordered.at(-1)?.[0] ?? -1) + 1);
  return {
    actionId: current.actionId,
    rows: ordered.map(([sequence, message]) => ({ sequence, message })),
    logEnd,
    dropped: Math.max(current.dropped, snapshot.droppedLogs ?? 0, rows.size > 200 ? ordered[0]?.[0] ?? 0 : 0),
  };
}
