import { ACTION_FRAME, renderAction, shouldReportAction, validateActionRecord } from './backendActionLogger';
export type ActionRelayOptions = {
  sink?: (line: string) => void; diagnostic: (line: string) => void;
  env?: Record<string,string | undefined>; tty?: boolean; diagnostics?: () => boolean;
};
// Bound pending lines and discard oversized records until their next newline.
export function createActionRelay(options: ActionRelayOptions) {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const sink = options.sink || ((line: string) => console.log(line));
  let pending = ''; let discard = false; let ended = false;
  const emit = (line: string) => {
    try {
      if (line.startsWith(ACTION_FRAME)) {
        const value: unknown = JSON.parse(line.slice(ACTION_FRAME.length));
        if (validateActionRecord(value) && shouldReportAction(value, options)) sink(renderAction(value, options.env, options.tty));
        return;
      }
      const text = line.trim();
      if (text) options.diagnostic(text);
    } catch { /* Malformed frames and unavailable sinks are best effort. */ }
  };
  const consume = (text: string) => {
    for (const char of text) {
      if (char === '\n') { if (!discard) emit(pending); pending = ''; discard = false; }
      else if (!discard) {
        if (pending.length >= 8192) { pending = ''; discard = true; }
        else pending += char;
      }
    }
  };
  return {
    write(chunk: Uint8Array) {
      if (ended) return;
      try { for (let i = 0; i < chunk.length; i += 4096) consume(decoder.decode(chunk.subarray(i, i + 4096), { stream: true })); } catch {}
    },
    end() {
      if (ended) return;
      ended = true;
      try { consume(decoder.decode()); if (!discard && pending) emit(pending); } catch {}
      pending = '';
    },
  };
}
