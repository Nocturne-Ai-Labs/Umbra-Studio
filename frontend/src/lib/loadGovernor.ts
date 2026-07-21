type LoadLane = 'critical' | 'interactive' | 'background';

const lastRunAt = new Map<string, number>();
const inFlightByLane: Record<LoadLane, number> = {
  critical: 0,
  interactive: 0,
  background: 0,
};

let stressScore = 0;
let initialized = false;

function getNow(): number {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function decayStress() {
  stressScore = Math.max(0, stressScore - 1);
}

function sampleEventLoopLag() {
  if (typeof window === 'undefined') return;
  if (initialized) return;
  initialized = true;

  let last = getNow();
  window.setInterval(() => {
    const now = getNow();
    const drift = now - last - 1000;
    last = now;
    if (drift > 120) stressScore = Math.min(12, stressScore + 3);
    else if (drift > 70) stressScore = Math.min(12, stressScore + 2);
    else if (drift > 35) stressScore = Math.min(12, stressScore + 1);
    else decayStress();
  }, 1000);
}

function laneLimit(lane: LoadLane): number {
  const highStress = stressScore >= 5;
  if (!highStress) {
    if (lane === 'critical') return 6;
    if (lane === 'interactive') return 4;
    return 2;
  }
  if (lane === 'critical') return 4;
  if (lane === 'interactive') return 2;
  return 1;
}

sampleEventLoopLag();

export function governorShouldRun(key: string, minIntervalMs: number): boolean {
  const now = getNow();
  const last = lastRunAt.get(key) || 0;
  if (now - last < Math.max(0, minIntervalMs || 0)) return false;
  lastRunAt.set(key, now);
  return true;
}

export function governorTryAcquire(lane: LoadLane): (() => void) | null {
  const limit = laneLimit(lane);
  if (inFlightByLane[lane] >= limit) return null;
  inFlightByLane[lane] += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlightByLane[lane] = Math.max(0, inFlightByLane[lane] - 1);
  };
}

export function getLoadGovernorSnapshot(): {
  stressScore: number;
  inFlightByLane: Record<LoadLane, number>;
  trackedKeys: number;
} {
  return {
    stressScore,
    inFlightByLane: {
      critical: inFlightByLane.critical,
      interactive: inFlightByLane.interactive,
      background: inFlightByLane.background,
    },
    trackedKeys: lastRunAt.size,
  };
}
