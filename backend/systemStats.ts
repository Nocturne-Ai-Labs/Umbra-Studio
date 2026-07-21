import * as os from 'os';
import { basename } from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RuntimeGpuStat {
  id: number;
  name: string;
  utilization: number;
  memory: { used: number; total: number; percent: number };
  temperature: number;
  power?: {
    draw: number | null;
    limit: number | null;
  };
  available: boolean;
}

export interface RuntimeRamStat {
  used: number;
  total: number;
  percent: number;
}

export interface RuntimeCpuStat {
  usage: number;
  cores: number;
  model: string;
  perCore: number[];
}

export interface StorageDriveStat {
  id: number;
  name: string;
  used: number;
  total: number;
  percent: number;
  path: string;
  type?: string;
}

export interface SystemStatsResult {
  gpus: RuntimeGpuStat[];
  ram: RuntimeRamStat;
  cpu: RuntimeCpuStat;
  drives: StorageDriveStat[];
  timestamp: string;
  sampleAgeMs?: number;
  stale?: boolean;
  refreshing?: boolean;
}

type CpuCoreSnapshot = { idle: number; total: number };
type CpuSnapshot = {
  timestamp: number;
  idle: number;
  total: number;
  cores: number;
  model: string;
  perCore: CpuCoreSnapshot[];
};

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  error?: string;
};

export function createSystemStatsService() {
  let gpuVendor: 'nvidia' | 'amd' | 'intel' | null = null;
  let gpuDetectInFlight: Promise<void> | null = null;
  let lastGpuDetectAt = 0;
  let previousCpuSnapshot: CpuSnapshot | null = null;
  let cachedCpuStats: RuntimeCpuStat | null = null;
  let cachedSystemStats: SystemStatsResult | null = null;
  let cachedGpuStats: RuntimeGpuStat[] | null = null;
  let cachedGpuStatsAt = 0;
  let gpuStatsInFlight: Promise<RuntimeGpuStat[]> | null = null;
  let gpuStatsFailureCount = 0;
  let gpuStatsCooldownUntil = 0;
  let lastGpuStatsWarningAt = 0;
  let cachedStorageStats: StorageDriveStat[] | null = null;
  let cachedStorageStatsAt = 0;
  let storageStatsInFlight: Promise<StorageDriveStat[]> | null = null;
  let systemStatsInFlight: Promise<SystemStatsResult> | null = null;
  let systemStatsSamplerTimer: ReturnType<typeof setInterval> | null = null;
  const CPU_SAMPLE_MIN_INTERVAL_MS = 400;
  const SYSTEM_STATS_REFRESH_MS = 10000;
  const SYSTEM_STATS_STALE_MS = 30000;
  const GPU_STATS_REFRESH_MS = 10000;
  const GPU_STATS_QUERY_TIMEOUT_MS = 5000;
  const GPU_STATS_FAILURE_LIMIT = 3;
  const GPU_STATS_FAILURE_COOLDOWN_MS = 60000;
  const GPU_STATS_WARNING_MIN_INTERVAL_MS = 60000;
  const STORAGE_STATS_REFRESH_MS = 60000;
  const GPU_DETECT_RETRY_MS = 30000;

  function createDefaultSystemStats(): SystemStatsResult {
    const totalMem = os.totalmem();
    const usedMem = Math.max(totalMem - os.freemem(), 0);
    const cpus = os.cpus();
    return {
      gpus: [],
      ram: {
        used: usedMem / (1024 ** 3),
        total: totalMem / (1024 ** 3),
        percent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
      },
      cpu: {
        usage: cachedCpuStats?.usage ?? 0,
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        perCore: cachedCpuStats?.perCore || Array.from({ length: cpus.length }, () => 0),
      },
      drives: [],
      timestamp: new Date().toISOString(),
      sampleAgeMs: 0,
      stale: true,
      refreshing: false,
    };
  }

  function withSampleState(stats: SystemStatsResult): SystemStatsResult {
    const sampledAt = Date.parse(stats.timestamp);
    const sampleAgeMs = Number.isFinite(sampledAt) ? Math.max(0, Date.now() - sampledAt) : 0;
    return {
      ...stats,
      sampleAgeMs,
      stale: sampleAgeMs > SYSTEM_STATS_STALE_MS,
      refreshing: Boolean(systemStatsInFlight),
    };
  }

  function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, value));
  }

  function runCommand(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
    return new Promise((resolve) => {
      let child: ReturnType<typeof spawn> | null = null;
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;

      const finish = (result: Omit<CommandResult, 'stdout' | 'stderr' | 'timedOut'>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          ...result,
          stdout,
          stderr,
          timedOut,
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child?.kill();
        } catch {
          // Best-effort timeout cleanup.
        }
      }, Math.max(1000, Math.floor(timeoutMs)));

      try {
        child = spawn(command, args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        finish({
          ok: false,
          code: null,
          signal: null,
          error: error?.message || String(error),
        });
        return;
      }

      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk || '');
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk || '');
      });
      child.on('error', (error) => {
        finish({
          ok: false,
          code: null,
          signal: null,
          error: error?.message || String(error),
        });
      });
      child.on('close', (code, signal) => {
        finish({
          ok: code === 0 && !timedOut,
          code,
          signal,
          error: timedOut
            ? `${command} timed out after ${timeoutMs}ms`
            : (code === 0 ? undefined : (stderr || stdout || `${command} exited with ${code ?? signal ?? 'unknown'}`).trim()),
        });
      });
    });
  }

  function formatCommandFailure(command: string, result: CommandResult): string {
    const reason = result.error || result.stderr.trim() || result.stdout.trim() || 'unknown error';
    const status = result.timedOut
      ? 'timeout'
      : `exit=${result.code ?? 'null'} signal=${result.signal ?? 'none'}`;
    return `${command} failed (${status}): ${reason}`;
  }

  async function runGpuDetection() {
    try {
      await execAsync('nvidia-smi --version', { timeout: 2000 });
      gpuVendor = 'nvidia';
      console.log('[System] NVIDIA GPU detected');
      return;
    } catch {}

    try {
      await execAsync('rocm-smi --version', { timeout: 2000 });
      gpuVendor = 'amd';
      console.log('[System] AMD GPU detected');
      return;
    } catch {}

    try {
      await execAsync('xpu-smi --version', { timeout: 2000 });
      gpuVendor = 'intel';
      console.log('[System] Intel GPU detected');
      return;
    } catch {}

    gpuVendor = null;
    console.log('[System] No GPU detected');
  }

  async function detectGPU() {
    if (gpuDetectInFlight) return gpuDetectInFlight;
    gpuDetectInFlight = (async () => {
      lastGpuDetectAt = Date.now();
      await runGpuDetection();
    })().finally(() => {
      gpuDetectInFlight = null;
    });
    return gpuDetectInFlight;
  }

  async function ensureGpuDetected() {
    if (gpuVendor) return;
    if (Date.now() - lastGpuDetectAt < GPU_DETECT_RETRY_MS) return;
    await detectGPU();
  }

  async function getGPUStats(): Promise<RuntimeGpuStat[]> {
    await ensureGpuDetected();
    if (!gpuVendor) return [];
    if (Date.now() < gpuStatsCooldownUntil) {
      return cachedGpuStats || [];
    }

    try {
      if (gpuVendor === 'nvidia') {
        const query = 'index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit';
        const result = await runCommand('nvidia-smi', [
          `--query-gpu=${query}`,
          '--format=csv,noheader,nounits',
        ], GPU_STATS_QUERY_TIMEOUT_MS);
        if (!result.ok) {
          throw new Error(formatCommandFailure('nvidia-smi', result));
        }
        const stats = result.stdout.trim().split('\n').filter(Boolean).map(line => {
          const [id, name, util, memUsed, memTotal, temp, powerDraw, powerLimit] = line.split(',').map(s => s.trim());
          const parsedMemUsed = Number.parseFloat(memUsed);
          const parsedMemTotal = Number.parseFloat(memTotal);
          const parsedPowerDraw = Number.parseFloat(powerDraw);
          const parsedPowerLimit = Number.parseFloat(powerLimit);
          return {
            id: Number.parseInt(id, 10),
            name: name || 'NVIDIA GPU',
            utilization: clampPercent(Number.parseFloat(util)),
            memory: {
              used: Number.isFinite(parsedMemUsed) ? parsedMemUsed : 0,
              total: Number.isFinite(parsedMemTotal) ? parsedMemTotal : 0,
              percent: parsedMemTotal > 0 ? clampPercent((parsedMemUsed / parsedMemTotal) * 100) : 0,
            },
            temperature: Number.parseFloat(temp) || 0,
            power: {
              draw: Number.isFinite(parsedPowerDraw) ? parsedPowerDraw : null,
              limit: Number.isFinite(parsedPowerLimit) ? parsedPowerLimit : null,
            },
            available: true,
          };
        });
        gpuStatsFailureCount = 0;
        gpuStatsCooldownUntil = 0;
        return stats;
      }

      if (gpuVendor === 'amd') {
        const { stdout: listOutput } = await execAsync('rocm-smi --showid', { timeout: 2000 });
        const gpuIds = [...listOutput.matchAll(/GPU\[(\d+)\]/g)].map(match => parseInt(match[1]));
        if (gpuIds.length === 0) gpuIds.push(0);

        const gpus: RuntimeGpuStat[] = [];
        for (const id of gpuIds) {
          try {
            const { stdout: statsOutput } = await execAsync(`rocm-smi --showuse --showmeminfo vram --showtemp --device ${id}`, { timeout: 2000 });
            const utilMatch = statsOutput.match(/GPU use \(%\):\s+([\d.]+)/);
            const vramUsedMatch = statsOutput.match(/VRAM Total Used Memory \(B\):\s+(\d+)/);
            const vramTotalMatch = statsOutput.match(/VRAM Total Memory \(B\):\s+(\d+)/);
            const tempMatch = statsOutput.match(/Temperature \(Sensor edge\) \(C\):\s+([\d.]+)/);

            const memUsed = vramUsedMatch ? parseFloat(vramUsedMatch[1]) / (1024 ** 2) : 0;
            const memTotal = vramTotalMatch ? parseFloat(vramTotalMatch[1]) / (1024 ** 2) : 0;

            gpus.push({
              id,
              name: `AMD GPU ${id}`,
              utilization: utilMatch ? parseFloat(utilMatch[1]) : 0,
              memory: { used: memUsed, total: memTotal, percent: memTotal > 0 ? (memUsed / memTotal) * 100 : 0 },
              temperature: tempMatch ? parseFloat(tempMatch[1]) : 0,
              power: {
                draw: null,
                limit: null,
              },
              available: true,
            });
          } catch {}
        }
        return gpus;
      }
    } catch (error: any) {
      gpuStatsFailureCount += 1;
      const now = Date.now();
      if (gpuStatsFailureCount >= GPU_STATS_FAILURE_LIMIT) {
        gpuStatsCooldownUntil = now + GPU_STATS_FAILURE_COOLDOWN_MS;
      }
      if (now - lastGpuStatsWarningAt >= GPU_STATS_WARNING_MIN_INTERVAL_MS || gpuStatsFailureCount === 1) {
        lastGpuStatsWarningAt = now;
        const cooldownText = gpuStatsCooldownUntil > now
          ? ` Cooling GPU polling for ${Math.ceil((gpuStatsCooldownUntil - now) / 1000)}s.`
          : '';
        console.warn(`[System] GPU stats unavailable (${gpuStatsFailureCount}/${GPU_STATS_FAILURE_LIMIT}): ${error?.message || String(error)}.${cooldownText}`);
      }
    }

    return cachedGpuStats || [];
  }

  async function getRAMStats(): Promise<RuntimeRamStat> {
    const totalMem = os.totalmem();
    let usedMem = totalMem - os.freemem();

    if (os.platform() === 'linux') {
      try {
        const { stdout } = await execAsync('cat /proc/meminfo | grep -E "MemTotal|MemAvailable"', { timeout: 2000 });
        let memTotal = 0;
        let memAvailable = 0;
        for (const line of stdout.trim().split('\n')) {
          if (line.startsWith('MemTotal:')) memTotal = parseInt(line.split(/\s+/)[1]) * 1024;
          else if (line.startsWith('MemAvailable:')) memAvailable = parseInt(line.split(/\s+/)[1]) * 1024;
        }
        usedMem = memTotal - memAvailable;
      } catch {}
    }

    return {
      used: usedMem / (1024 ** 3),
      total: totalMem / (1024 ** 3),
      percent: (usedMem / totalMem) * 100,
    };
  }

  function buildCpuSnapshot(): CpuSnapshot {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    const perCore: CpuCoreSnapshot[] = cpus.map(cpu => {
      const total = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
      totalIdle += cpu.times.idle;
      totalTick += total;
      return { idle: cpu.times.idle, total };
    });

    return {
      timestamp: Date.now(),
      idle: totalIdle,
      total: totalTick,
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      perCore,
    };
  }

  function computeUsage(prev: CpuCoreSnapshot, next: CpuCoreSnapshot): number | null {
    const deltaTotal = next.total - prev.total;
    const deltaIdle = next.idle - prev.idle;
    if (!Number.isFinite(deltaTotal) || deltaTotal <= 0) return null;
    return clampPercent((1 - deltaIdle / deltaTotal) * 100);
  }

  function getCPUStats(): RuntimeCpuStat {
    const snapshot = buildCpuSnapshot();

    if (!previousCpuSnapshot) {
      previousCpuSnapshot = snapshot;
      if (!cachedCpuStats) {
        cachedCpuStats = {
          usage: 0,
          cores: snapshot.cores,
          model: snapshot.model,
          perCore: Array.from({ length: snapshot.cores }, () => 0),
        };
      }
      return cachedCpuStats;
    }

    const elapsed = snapshot.timestamp - previousCpuSnapshot.timestamp;
    if (elapsed < CPU_SAMPLE_MIN_INTERVAL_MS && cachedCpuStats) {
      return { ...cachedCpuStats, cores: snapshot.cores, model: snapshot.model };
    }

    const aggregateUsage = computeUsage(
      { idle: previousCpuSnapshot.idle, total: previousCpuSnapshot.total },
      { idle: snapshot.idle, total: snapshot.total },
    );

    const coreCount = Math.min(previousCpuSnapshot.perCore.length, snapshot.perCore.length);
    const perCoreUsage: number[] = [];
    for (let i = 0; i < coreCount; i += 1) {
      perCoreUsage.push(computeUsage(previousCpuSnapshot.perCore[i], snapshot.perCore[i]) ?? 0);
    }

    const nextStats: RuntimeCpuStat = {
      usage: aggregateUsage ?? cachedCpuStats?.usage ?? 0,
      cores: snapshot.cores,
      model: snapshot.model,
      perCore: perCoreUsage,
    };

    previousCpuSnapshot = snapshot;
    cachedCpuStats = nextStats;
    return nextStats;
  }

  function clampStoragePercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, value));
  }

  function kbToGb(valueKb: number): number {
    if (!Number.isFinite(valueKb) || valueKb <= 0) return 0;
    return valueKb / (1024 ** 2);
  }

  function buildDriveName(pathValue: string, fallback = ''): string {
    const normalized = String(pathValue || '').trim();
    if (!normalized) return fallback || 'Drive';
    if (normalized === '/') return 'System';
    const base = basename(normalized.replace(/[\\/]+$/, ''));
    return base || fallback || normalized;
  }

  async function getLinuxStorageStats(): Promise<StorageDriveStat[]> {
    const ignoredFsTypes = new Set([
      'tmpfs', 'devtmpfs', 'squashfs', 'overlay', 'proc', 'sysfs', 'cgroup', 'cgroup2',
      'pstore', 'debugfs', 'mqueue', 'hugetlbfs', 'tracefs', 'configfs', 'fusectl',
      'rpc_pipefs', 'autofs', 'securityfs', 'binfmt_misc', 'ramfs', 'nsfs', 'devfs',
    ]);
    const { stdout } = await execAsync('df -kPT', { timeout: 3000 });
    const lines = stdout.trim().split('\n').slice(1);
    const drives: StorageDriveStat[] = [];
    const seenPaths = new Set<string>();

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 7) continue;
      const fsType = (fields[1] || '').toLowerCase();
      const totalKB = Number(fields[2]);
      const usedKB = Number(fields[3]);
      const mountPath = fields.slice(6).join(' ');
      if (!mountPath || seenPaths.has(mountPath)) continue;
      if (!Number.isFinite(totalKB) || totalKB <= 0) continue;
      if (!Number.isFinite(usedKB) || usedKB < 0) continue;
      if (ignoredFsTypes.has(fsType)) continue;
      seenPaths.add(mountPath);
      drives.push({
        id: drives.length,
        name: buildDriveName(mountPath),
        used: kbToGb(usedKB),
        total: kbToGb(totalKB),
        percent: clampStoragePercent((usedKB / totalKB) * 100),
        path: mountPath,
        type: fsType.toUpperCase() || 'UNKNOWN',
      });
    }

    drives.sort((a, b) => {
      if (a.path === '/') return -1;
      if (b.path === '/') return 1;
      return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
    });

    return drives.map((drive, index) => ({ ...drive, id: index }));
  }

  async function getMacStorageStats(): Promise<StorageDriveStat[]> {
    const ignoredFilesystemPrefixes = ['map', 'devfs', 'autofs'];
    const mountTypeByPath = new Map<string, string>();

    try {
      const { stdout: mountStdout } = await execAsync('mount', { timeout: 2000 });
      for (const line of mountStdout.split('\n')) {
        const match = line.match(/ on (.+?) \(([^,]+),/);
        if (!match) continue;
        mountTypeByPath.set(match[1], match[2]);
      }
    } catch {}

    const { stdout } = await execAsync('df -kP', { timeout: 3000 });
    const lines = stdout.trim().split('\n').slice(1);
    const drives: StorageDriveStat[] = [];
    const seenPaths = new Set<string>();

    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 6) continue;
      const filesystem = (fields[0] || '').toLowerCase();
      const totalKB = Number(fields[1]);
      const usedKB = Number(fields[2]);
      const mountPath = fields.slice(5).join(' ');
      const mountType = (mountTypeByPath.get(mountPath) || '').trim();
      if (!mountPath || seenPaths.has(mountPath)) continue;
      if (!Number.isFinite(totalKB) || totalKB <= 0) continue;
      if (!Number.isFinite(usedKB) || usedKB < 0) continue;
      if (ignoredFilesystemPrefixes.some(prefix => filesystem.startsWith(prefix))) continue;
      seenPaths.add(mountPath);
      drives.push({
        id: drives.length,
        name: buildDriveName(mountPath),
        used: kbToGb(usedKB),
        total: kbToGb(totalKB),
        percent: clampStoragePercent((usedKB / totalKB) * 100),
        path: mountPath,
        type: mountType ? mountType.toUpperCase() : 'UNKNOWN',
      });
    }

    drives.sort((a, b) => {
      if (a.path === '/') return -1;
      if (b.path === '/') return 1;
      return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
    });

    return drives.map((drive, index) => ({ ...drive, id: index }));
  }

  async function getWindowsStorageStats(): Promise<StorageDriveStat[]> {
    const driveTypeLabels: Record<number, string> = {
      2: 'REMOVABLE',
      3: 'LOCAL',
      4: 'NETWORK',
      5: 'CDROM',
      6: 'RAMDISK',
    };

    const command = [
      'powershell',
      '-NoProfile',
      '-Command',
      '"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType,Size,FreeSpace | ConvertTo-Json -Compress"',
    ].join(' ');

    const { stdout } = await execAsync(command, { timeout: 4000 });
    if (!stdout || !stdout.trim()) return [];
    const parsed = JSON.parse(stdout.trim()) as any[] | any;
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const drives: StorageDriveStat[] = [];

    for (const entry of entries) {
      const driveType = Number(entry?.DriveType || 0);
      if (![2, 3, 4].includes(driveType)) continue;
      const deviceId = String(entry?.DeviceID || '').trim();
      if (!deviceId) continue;
      const totalBytes = Number(entry?.Size || 0);
      const freeBytes = Number(entry?.FreeSpace || 0);
      if (!Number.isFinite(totalBytes) || totalBytes <= 0) continue;
      if (!Number.isFinite(freeBytes) || freeBytes < 0) continue;
      const usedBytes = Math.max(totalBytes - freeBytes, 0);
      const mountPath = `${deviceId.replace(/[\\/]+$/, '')}\\`;
      const volumeName = String(entry?.VolumeName || '').trim();
      drives.push({
        id: drives.length,
        name: volumeName || deviceId,
        used: usedBytes / (1024 ** 3),
        total: totalBytes / (1024 ** 3),
        percent: clampStoragePercent((usedBytes / totalBytes) * 100),
        path: mountPath,
        type: driveTypeLabels[driveType] || 'UNKNOWN',
      });
    }

    drives.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
    return drives.map((drive, index) => ({ ...drive, id: index }));
  }

  async function getStorageStats(): Promise<StorageDriveStat[]> {
    try {
      if (os.platform() === 'linux') return await getLinuxStorageStats();
      if (os.platform() === 'darwin') return await getMacStorageStats();
      if (os.platform() === 'win32') return await getWindowsStorageStats();
    } catch (error) {
      console.error('[System] Storage stats error:', error);
    }

    try {
      const { stdout } = await execAsync('df -k / | tail -1', { timeout: 2000 });
      const fields = stdout.trim().split(/\s+/);
      const totalKB = parseInt(fields[1]) || 0;
      const usedKB = parseInt(fields[2]) || 0;
      return [{
        id: 0,
        name: 'System',
        used: usedKB / (1024 ** 2),
        total: totalKB / (1024 ** 2),
        percent: totalKB > 0 ? (usedKB / totalKB) * 100 : 0,
        path: '/',
        type: 'UNKNOWN',
      }];
    } catch {
      return [];
    }
  }

  function getCachedGpuStatsForSampler(): Promise<RuntimeGpuStat[]> {
    const now = Date.now();
    if (cachedGpuStats && now - cachedGpuStatsAt < GPU_STATS_REFRESH_MS) {
      return Promise.resolve(cachedGpuStats);
    }
    if (gpuStatsInFlight) return gpuStatsInFlight;
    gpuStatsInFlight = getGPUStats()
      .then((stats) => {
        cachedGpuStats = stats;
        cachedGpuStatsAt = Date.now();
        return stats;
      })
      .finally(() => {
        gpuStatsInFlight = null;
      });
    return gpuStatsInFlight;
  }

  function getCachedStorageStatsForSampler(): Promise<StorageDriveStat[]> {
    const now = Date.now();
    if (cachedStorageStats && now - cachedStorageStatsAt < STORAGE_STATS_REFRESH_MS) {
      return Promise.resolve(cachedStorageStats);
    }
    if (storageStatsInFlight) return storageStatsInFlight;
    storageStatsInFlight = getStorageStats()
      .then((stats) => {
        cachedStorageStats = stats;
        cachedStorageStatsAt = Date.now();
        return stats;
      })
      .finally(() => {
        storageStatsInFlight = null;
      });
    return storageStatsInFlight;
  }

  async function collectSystemStats(): Promise<SystemStatsResult> {
    const [gpus, ram, cpu, drives] = await Promise.all([
      getCachedGpuStatsForSampler(),
      getRAMStats(),
      Promise.resolve(getCPUStats()),
      getCachedStorageStatsForSampler(),
    ]);
    return { gpus, ram, cpu, drives, timestamp: new Date().toISOString() };
  }

  function getCachedSystemStats(): SystemStatsResult {
    if (!cachedSystemStats) {
      cachedSystemStats = createDefaultSystemStats();
    }
    return withSampleState(cachedSystemStats);
  }

  function refreshSystemStats(): Promise<SystemStatsResult> {
    if (systemStatsInFlight) return systemStatsInFlight;
    systemStatsInFlight = collectSystemStats();
    systemStatsInFlight
      .then((stats) => {
        cachedSystemStats = stats;
      })
      .catch((error) => {
        console.error('[System] Stats sampler error:', error);
      })
      .finally(() => {
        systemStatsInFlight = null;
      });
    return systemStatsInFlight;
  }

  async function getSystemStats(): Promise<SystemStatsResult> {
    const now = Date.now();
    const cachedAt = cachedSystemStats ? Date.parse(cachedSystemStats.timestamp) : 0;
    if (!cachedSystemStats || !Number.isFinite(cachedAt) || now - cachedAt >= SYSTEM_STATS_REFRESH_MS) {
      void refreshSystemStats();
    }
    return getCachedSystemStats();
  }

  function startSystemStatsSampler(intervalMs = SYSTEM_STATS_REFRESH_MS) {
    if (systemStatsSamplerTimer) return;
    cachedSystemStats = cachedSystemStats || createDefaultSystemStats();
    void refreshSystemStats();
    systemStatsSamplerTimer = setInterval(() => {
      void refreshSystemStats();
    }, Math.max(1000, Math.floor(intervalMs)));
    (systemStatsSamplerTimer as any).unref?.();
  }

  function stopSystemStatsSampler() {
    if (!systemStatsSamplerTimer) return;
    clearInterval(systemStatsSamplerTimer);
    systemStatsSamplerTimer = null;
  }

  return {
    detectGPU,
    getGPUStats,
    getRAMStats,
    getCPUStats,
    getStorageStats,
    getSystemStats,
    getCachedSystemStats,
    refreshSystemStats,
    startSystemStatsSampler,
    stopSystemStatsSampler,
  };
}
