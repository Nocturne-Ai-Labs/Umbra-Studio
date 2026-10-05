import { StringDecoder } from 'node:string_decoder';

export const MAX_TOOL_LINE = 16_384;
export const MAX_TOOL_LOGS = 200;
export const MAX_TOOL_JOBS = 64;

export function sanitizeToolLine(text: string): string {
  return text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

// CR replaces a progress row; LF commits it. Each pipe has its own decoder.
export function createToolLineFramer(emit: (line: string) => void) {
  const decoder = new StringDecoder('utf8');
  let carry = '';
  let carriage = false;
  let truncated = false;
  const flush = () => {
    const line = sanitizeToolLine(carry) + (truncated ? ' [line truncated]' : '');
    if (line.trim()) emit(line);
    carry = '';
    truncated = false;
  };
  const accept = (text: string) => {
    for (const char of text) {
      if (char === '\n') { flush(); carriage = false; }
      else if (char === '\r') { carriage = true; }
      else {
        if (carriage) { carry = ''; truncated = false; carriage = false; }
        if (carry.length < MAX_TOOL_LINE) carry += char;
        else truncated = true;
      }
    }
  };
  return {
    write(chunk: Uint8Array | string) { accept(typeof chunk === 'string' ? chunk : decoder.write(Buffer.from(chunk))); },
    end() { accept(decoder.end()); flush(); carriage = false; },
  };
}
