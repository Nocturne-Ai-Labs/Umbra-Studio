import { join } from "path";
import { existsSync } from "fs";
import { appendFile, mkdir, unlink } from "node:fs/promises";

// Inline helper
function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleConsoleLogs(req: Request, _url: URL, ctx: any) {
  const { ROOT_DIR } = ctx;
  const logsDir = join(ROOT_DIR, 'logs', 'browser');
  const logFile = join(logsDir, 'console.log');

  try {
    if (req.method === "POST") {
      const bodyRequest = req.clone();
      void persistConsoleLogs(bodyRequest, logsDir, logFile);
      return json({ success: true, queued: true });
    }

    if (req.method === "GET") {
      if (!existsSync(logFile)) return json({ logs: '' });
      const logs = await Bun.file(logFile).text();
      return json({ logs });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err: any) {
    console.error('[Console Logger] Error:', err);
    return json({ error: err.message }, 500);
  }
}

async function persistConsoleLogs(req: Request, logsDir: string, logFile: string) {
  try {
      const body: any = await req.json();
      const logs = body.logs;

      if (Array.isArray(logs)) {
        if (!existsSync(logsDir)) await mkdir(logsDir, { recursive: true });

        const logLines = logs.map((log: any) => {
          const timestamp = new Date(log.timestamp).toISOString();
          const levelPadded = log.level.toUpperCase().padEnd(5);
          return `[${timestamp}] [${levelPadded}] [${log.session}] ${log.message}`;
        }).join('\n') + '\n';

        try {
          await appendFile(logFile, logLines, 'utf-8');
        } catch (writeErr) {
          console.error('[Console Logger] Failed to write logs:', writeErr);
        }
      }
  } catch (err: any) {
    console.error('[Console Logger] Error:', err);
  }
}

export async function clearConsoleLogs(_req: Request, _url: URL, ctx: any) {
  const logFile = join(ctx.ROOT_DIR, 'logs', 'browser', 'console.log');

  try {
    if (existsSync(logFile)) await unlink(logFile);
    console.log('[Console Logger] Browser logs cleared');
    return json({ success: true });
  } catch (err: any) {
    console.error('[Console Logger] Clear error:', err);
    return json({ error: err.message }, 500);
  }
}
