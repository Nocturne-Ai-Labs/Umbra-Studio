export type CaptionProgress = { total: number; completed: number; failed: number; filename: string; phase: string };
export function captionProgressReader(callback?: (progress: { completed: number; failed: number; filename: string }) => void) {
  let pending = '';
  return (chunk: string) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    if (pending.length > 65536) pending = '';
    for (const line of lines) {
      if (!line.startsWith('UMBRA_PROGRESS ')) continue;
      try {
        const value = JSON.parse(line.slice(15));
        if (Number.isInteger(value.completed) && value.completed >= 0 && Number.isInteger(value.failed)) callback?.(value);
      } catch { /* Other helper output is not progress. */ }
    }
  };
}

