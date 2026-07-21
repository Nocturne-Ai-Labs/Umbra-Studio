import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_INTERVAL_MS = 5000;

function resolveRuntimeRoot() {
  const explicit = process.env.UMBRA_ROOT || process.env.UMBRA_RUNTIME_ROOT;
  if (explicit && explicit.trim()) return path.resolve(explicit.trim());
  return process.cwd();
}

function resolveNvidiaSmiPath() {
  const candidates = [
    'nvidia-smi',
    process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'nvidia-smi.exe') : null,
    'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
  ].filter(Boolean);

  return candidates;
}

function runNvidiaSmi(executable, args, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      resolve({ ok: false, error: `nvidia-smi timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ok: false, error: error.message || String(error) });
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        error: code === 0 ? null : (stderr || stdout || `nvidia-smi exited with ${code}`).trim(),
      });
    });
  });
}

async function findNvidiaSmi() {
  for (const candidate of resolveNvidiaSmiPath()) {
    const result = await runNvidiaSmi(candidate, ['--help'], 2500);
    if (result.ok) return candidate;
  }
  return null;
}

function parseCsvLine(line) {
  const parts = String(line || '').split(',').map((part) => part.trim());
  if (parts.length < 11) return null;
  const numberAt = (index) => {
    const value = Number(parts[index]);
    return Number.isFinite(value) ? value : null;
  };
  return {
    index: numberAt(0),
    name: parts[1] || 'NVIDIA GPU',
    temperatureGpuC: numberAt(2),
    powerDrawW: numberAt(3),
    powerLimitW: numberAt(4),
    utilizationGpuPercent: numberAt(5),
    utilizationMemoryPercent: numberAt(6),
    memoryUsedMiB: numberAt(7),
    memoryTotalMiB: numberAt(8),
    graphicsClockMhz: numberAt(9),
    memoryClockMhz: numberAt(10),
  };
}

async function collectSample(executable) {
  const query = [
    'index',
    'name',
    'temperature.gpu',
    'power.draw',
    'power.limit',
    'utilization.gpu',
    'utilization.memory',
    'memory.used',
    'memory.total',
    'clocks.gr',
    'clocks.mem',
  ].join(',');
  const result = await runNvidiaSmi(executable, [`--query-gpu=${query}`, '--format=csv,noheader,nounits'], 2500);
  if (!result.ok) {
    return {
      timestamp: new Date().toISOString(),
      available: false,
      error: result.error || 'nvidia-smi failed',
    };
  }
  return {
    timestamp: new Date().toISOString(),
    available: true,
    gpus: String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseCsvLine)
      .filter(Boolean),
  };
}

function getLogPath(runtimeRoot) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return path.join(runtimeRoot, 'User', 'Logs', `gpu-telemetry-${dateStamp}.jsonl`);
}

function parseIntervalMs() {
  const arg = process.argv.find((value) => value.startsWith('--interval-ms='));
  const raw = arg ? Number(arg.split('=')[1]) : Number(process.env.UMBRA_GPU_TELEMETRY_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MS;
  return Math.max(1000, Math.round(raw));
}

const runtimeRoot = resolveRuntimeRoot();
const intervalMs = parseIntervalMs();
const executable = await findNvidiaSmi();

if (!executable) {
  console.error('[UmbraGpuTelemetry] nvidia-smi was not found.');
  process.exit(1);
}

let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});

console.info(`[UmbraGpuTelemetry] Runtime root: ${runtimeRoot}`);
console.info(`[UmbraGpuTelemetry] Interval: ${intervalMs}ms`);
console.info(`[UmbraGpuTelemetry] NVIDIA SMI: ${executable}`);

while (!stopped) {
  const sample = await collectSample(executable);
  const logPath = getLogPath(runtimeRoot);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(sample)}\n`);
  const firstGpu = sample.gpus?.[0];
  if (firstGpu) {
    console.info(
      `[${sample.timestamp}] ${firstGpu.name} ${firstGpu.temperatureGpuC ?? '?'}C ${firstGpu.powerDrawW ?? '?'}W ` +
        `${firstGpu.memoryUsedMiB ?? '?'}/${firstGpu.memoryTotalMiB ?? '?'}MiB ${firstGpu.utilizationGpuPercent ?? '?'}%`,
    );
  } else {
    console.warn(`[${sample.timestamp}] ${sample.error || 'No GPU sample'}`);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.info('[UmbraGpuTelemetry] Stopped.');
