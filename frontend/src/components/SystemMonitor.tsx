'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
    Monitor,
    Cpu,
    HardDrive,
    Thermometer,
    Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { loadAppSettings, subscribeToAppSettings } from '@/lib/appSettings';

interface GPUStats {
    name: string;
    utilization: number;
    memory: {
        used: number; // MB
        total: number; // MB
        percent: number;
    };
    temperature: number;
    power?: {
        draw: number | null;
        limit: number | null;
    };
}

interface RAMStats {
    used: number; // GB
    total: number; // GB
    percent: number;
    swap?: {
        used: number; // GB
        total: number; // GB
        percent: number; // 0-100
    };
}

interface CPUStats {
    usage: number; // 0-100
    cores: number;
    temperature: number | null; // Celsius (if available)
}

interface DriveStats {
    path: string;
    name?: string;
    type?: string;
    used: number; // GB
    total: number; // GB
    percent: number;
}

interface SystemStats {
    gpus: GPUStats[];
    ram: RAMStats;
    cpu: CPUStats;
    drives: DriveStats[];
    timestamp?: string;
    sampleAgeMs?: number;
    stale?: boolean;
    refreshing?: boolean;
}

export function SystemMonitor({ className }: { className?: string }) {
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [visibleDrives, setVisibleDrives] = useState<string[]>([]);
    const [monitorEnabled, setMonitorEnabled] = useState<boolean>(true);
    const [monitorGPU, setMonitorGPU] = useState<boolean>(true);
    const [monitorCPU, setMonitorCPU] = useState<boolean>(true);
    const [monitorRAM, setMonitorRAM] = useState<boolean>(true);
    const [monitorDrives, setMonitorDrives] = useState<boolean>(true);
    const [webSocketEnabled, setWebSocketEnabled] = useState<boolean>(true);
    const [lastKnownGpus, setLastKnownGpus] = useState<GPUStats[]>([]);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const fetchInFlightRef = useRef(false);
    const fetchAbortRef = useRef<AbortController | null>(null);
    const lastStatsSignatureRef = useRef<string>('');
    const lastKnownGpusRef = useRef<GPUStats[]>([]);
    const updateSystemStats = useStore(state => state.updateSystemStats);
    const activeWorkspace = useStore(state => state.activeWorkspace);
    const isGalleryWorkspace = activeWorkspace === 'library';

    const applyStats = useCallback((data: SystemStats) => {
        const timestamp = String(data?.timestamp || '');
        const signature = [
            timestamp,
            Math.max(0, Math.floor(Number(data?.sampleAgeMs) || 0)),
            data?.stale === true ? 1 : 0,
            data?.refreshing === true ? 1 : 0,
            Array.isArray(data?.gpus) ? data.gpus.length : 0,
        ].join('|');
        if (signature && signature === lastStatsSignatureRef.current) return;
        lastStatsSignatureRef.current = signature;
        setStats(data);
        const reportedGpus = Array.isArray(data?.gpus) ? data.gpus : [];
        if (reportedGpus.length > 0) {
            lastKnownGpusRef.current = reportedGpus;
            setLastKnownGpus(reportedGpus);
        }
        const gpu = reportedGpus[0] || lastKnownGpusRef.current[0];
        const sampledAt = timestamp ? Date.parse(timestamp) : 0;
        updateSystemStats({
            gpuUsage: monitorGPU ? (gpu?.utilization || 0) : 0,
            vramUsed: monitorGPU && gpu ? (gpu.memory.used / 1024) : 0,
            vramTotal: monitorGPU && gpu ? (gpu.memory.total / 1024) : 0,
            gpuName: monitorGPU ? (gpu?.name || 'N/A') : 'N/A',
            cpuUsage: monitorCPU ? (data?.cpu?.usage || 0) : 0,
            ramUsed: monitorRAM ? (data?.ram?.used || 0) : 0,
            ramTotal: monitorRAM ? (data?.ram?.total || 0) : 0,
            updatedAt: Number.isFinite(sampledAt) && sampledAt > 0 ? sampledAt : Date.now(),
            sampleAgeMs: Math.max(0, Math.floor(Number(data?.sampleAgeMs) || 0)),
            stale: data?.stale === true,
            refreshing: data?.refreshing === true,
        });
    }, [monitorCPU, monitorGPU, monitorRAM, updateSystemStats]);

    const fetchStats = useCallback(async () => {
        if (!monitorEnabled) return;
        if (fetchInFlightRef.current) return;
        fetchInFlightRef.current = true;
        fetchAbortRef.current?.abort();
        const controller = new AbortController();
        fetchAbortRef.current = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(`/api/system/stats?t=${Date.now()}`, {
                cache: 'no-store',
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            applyStats(data);
        } catch (err) {
            const isAbort = err instanceof DOMException && err.name === 'AbortError';
            if (!isAbort) {
                console.error('[SystemMonitor] Failed to fetch stats:', err);
            }
        } finally {
            window.clearTimeout(timeoutId);
            if (fetchAbortRef.current === controller) {
                fetchAbortRef.current = null;
            }
            fetchInFlightRef.current = false;
        }
    }, [applyStats, monitorEnabled]);

    const connectWebSocket = useCallback(() => {
        if (!monitorEnabled || !webSocketEnabled || isGalleryWorkspace) return;

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${protocol}://${window.location.host}/ws/system`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg?.type === 'system_stats' && msg?.data) {
                    applyStats(msg.data);
                }
            } catch {
                // ignore malformed WS payloads
            }
        };

        ws.onclose = () => {
            if (!webSocketEnabled) return;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => connectWebSocket(), 2000);
        };

        ws.onerror = () => {
            try {
                ws.close();
            } catch {
                // ignore close errors
            }
        };
    }, [applyStats, isGalleryWorkspace, monitorEnabled, webSocketEnabled]);

    useEffect(() => {
        const applySettings = () => {
            const settings = loadAppSettings();
            setVisibleDrives(settings['system.visibleDrives'] || []);
            setMonitorEnabled(settings['system.monitorEnabled'] !== false);
            setMonitorGPU(settings['system.monitorGPU'] !== false);
            setMonitorCPU(settings['system.monitorCPU'] !== false);
            setMonitorRAM(settings['system.monitorRAM'] !== false);
            setMonitorDrives(settings['system.monitorDrives'] !== false);
            setWebSocketEnabled(settings['advanced.enableWebSocket'] !== false);
        };

        applySettings();
        const unsubscribe = subscribeToAppSettings(() => applySettings());
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!monitorEnabled) {
            setStats(null);
            lastKnownGpusRef.current = [];
            setLastKnownGpus([]);
            updateSystemStats({
                gpuUsage: 0,
                vramUsed: 0,
                vramTotal: 0,
                gpuName: 'N/A',
                cpuUsage: 0,
                ramUsed: 0,
                ramTotal: 0,
                updatedAt: 0,
                sampleAgeMs: 0,
                stale: true,
                refreshing: false,
            });
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            fetchAbortRef.current?.abort();
            fetchAbortRef.current = null;
            fetchInFlightRef.current = false;
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            return;
        }

        fetchStats();
        const effectiveWebSocketEnabled = webSocketEnabled && !isGalleryWorkspace;

        if (effectiveWebSocketEnabled) {
            connectWebSocket();
        } else if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        const pollIntervalMs = effectiveWebSocketEnabled
            ? (isGalleryWorkspace ? 30000 : 10000)
            : (isGalleryWorkspace ? 15000 : 5000);
        pollIntervalRef.current = setInterval(fetchStats, pollIntervalMs);
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            fetchAbortRef.current?.abort();
            fetchAbortRef.current = null;
            fetchInFlightRef.current = false;
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [fetchStats, connectWebSocket, isGalleryWorkspace, monitorEnabled, updateSystemStats, webSocketEnabled]);

    const getWarningClass = (percent: number) => {
        if (percent >= 90) return 'bg-gradient-to-r from-red-500 to-red-600 shadow-[0_0_10px_rgba(239,68,68,0.6)]';
        if (percent >= 80) return 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
        return 'bg-[var(--umbra-accent)] shadow-[0_0_8px_var(--umbra-accent-glow)]';
    };

    const getTempColor = (temp: number) => {
        if (temp >= 85) return 'text-red-500';
        if (temp >= 75) return 'text-amber-500';
        return 'text-zinc-400';
    };

    const displayGpus = monitorEnabled && monitorGPU
        ? (stats?.gpus && stats.gpus.length > 0 ? stats.gpus : lastKnownGpus)
        : [];

    return (
        <div className={cn("p-3 flex flex-col gap-3", className)}>
            {!monitorEnabled && (
                <div className="flex items-center justify-center gap-2 p-4 text-[10px] text-zinc-500">
                    <Activity className="w-4 h-4" />
                    <span>System monitor disabled in settings.</span>
                </div>
            )}

            {monitorEnabled && !stats && (
                <div className="flex items-center justify-center gap-2 p-4 text-[10px] text-zinc-500">
                    <Activity className="w-4 h-4 animate-pulse" />
                    <span className="animate-pulse">Loading system stats...</span>
                </div>
            )}

            {/* GPUs */}
            {displayGpus.map((gpu, idx) => (
                <div key={idx} className="flex flex-col gap-2 pb-3 border-b border-white/5 last:border-0 last:pb-0">
                    {/* GPU Utilization */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[10px]">
                            <Monitor className="w-3 h-3 text-[var(--umbra-accent)]" />
                            <span className="font-bold text-white uppercase tracking-wider">GPU {idx}</span>
                            <span className="ml-auto font-mono font-bold text-[var(--umbra-accent)]">
                                {Math.round(gpu.utilization)}%
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
                            <div
                                className={cn("h-full transition-all duration-500", getWarningClass(gpu.utilization))}
                                style={{ width: `${gpu.utilization}%` }}
                            />
                        </div>
                        <div className="text-[8px] text-zinc-500 italic truncate mt-0.5">{gpu.name}</div>
                    </div>

                    {/* VRAM */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[10px]">
                            <Cpu className="w-3 h-3 text-[var(--umbra-accent)]" />
                            <span className="font-bold text-white uppercase tracking-wider">VRAM</span>
                            <span className="ml-auto font-mono font-bold text-[var(--umbra-accent)]">
                                {(gpu.memory.used / 1024).toFixed(1)}/{(gpu.memory.total / 1024).toFixed(1)}GB
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
                            <div
                                className={cn("h-full transition-all duration-500", getWarningClass(gpu.memory.percent))}
                                style={{ width: `${gpu.memory.percent}%` }}
                            />
                        </div>
                    </div>

                    {/* Temperature / Power */}
                    <div className="flex items-center justify-end gap-3 mt-1">
                        {typeof gpu.power?.draw === 'number' && Number.isFinite(gpu.power.draw) && (
                            <div className="flex items-center gap-1.5 text-[9px]">
                                <Activity className="w-3 h-3 text-amber-400/80" />
                                <span className="font-mono font-bold text-amber-300">
                                    {Math.round(gpu.power.draw)}W
                                    {typeof gpu.power?.limit === 'number' && Number.isFinite(gpu.power.limit)
                                        ? ` / ${Math.round(gpu.power.limit)}W`
                                        : ''}
                                </span>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[9px]">
                            <Thermometer className="w-3 h-3 text-red-400/70" />
                            <span className={cn("font-mono font-bold", getTempColor(gpu.temperature))}>
                                {Math.round(gpu.temperature)}C
                            </span>
                        </div>
                    </div>
                </div>
            ))}

            {/* RAM */}
            {monitorEnabled && monitorRAM && stats?.ram && (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px]">
                        <Cpu className="w-3 h-3 text-[var(--umbra-accent)]" />
                        <span className="font-bold text-white uppercase tracking-wider">RAM</span>
                        <span className="ml-auto font-mono font-bold text-[var(--umbra-accent)]">
                            {stats.ram.used.toFixed(1)}/{stats.ram.total.toFixed(1)}GB
                        </span>
                        <span className="text-[9px] text-zinc-500 ml-1">
                            {Math.round(stats.ram.percent)}%
                        </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
                        <div
                            className={cn("h-full transition-all duration-500", getWarningClass(stats.ram.percent))}
                            style={{ width: `${stats.ram.percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Swap / Page File */}
            {monitorEnabled && monitorRAM && stats?.ram?.swap && stats.ram.swap.total > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px]">
                        <Cpu className="w-3 h-3 text-violet-400" />
                        <span className="font-bold text-white uppercase tracking-wider">Swap</span>
                        <span className="ml-auto font-mono font-bold text-violet-400">
                            {stats.ram.swap.used.toFixed(1)}/{stats.ram.swap.total.toFixed(1)}GB
                        </span>
                        <span className="text-[9px] text-zinc-500 ml-1">
                            {Math.round(stats.ram.swap.percent)}%
                        </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
                        <div
                            className="h-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)] transition-all duration-500"
                            style={{ width: `${stats.ram.swap.percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* CPU */}
            {monitorEnabled && monitorCPU && stats?.cpu && (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px]">
                        <Activity className="w-3 h-3 text-[var(--umbra-accent)]" />
                        <span className="font-bold text-white uppercase tracking-wider">CPU</span>
                        <span className="text-[9px] text-zinc-500 ml-1">{stats.cpu.cores} cores</span>
                        <span className="ml-auto font-mono font-bold text-[var(--umbra-accent)]">
                            {Math.round(stats.cpu.usage)}%
                        </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
                        <div
                            className={cn("h-full transition-all duration-500", getWarningClass(stats.cpu.usage))}
                            style={{ width: `${stats.cpu.usage}%` }}
                        />
                    </div>
                    {stats.cpu.temperature && (
                        <div className="flex justify-end text-[9px] mt-0.5">
                            <span className={cn("font-mono font-bold", getTempColor(stats.cpu.temperature))}>
                                {Math.round(stats.cpu.temperature)}°C
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Storage */}
            {monitorEnabled && monitorDrives && stats?.drives && stats.drives.length > 0 && stats.drives
                .filter(drive => {
                    // If no drives are selected, show all drives
                    if (visibleDrives.length === 0) return true;
                    // Otherwise, only show selected drives
                    return visibleDrives.includes(drive.path);
                })
                .map((drive, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[10px]">
                            <HardDrive className="w-3 h-3 text-[var(--umbra-accent)]" />
                            <span className="font-bold text-white uppercase tracking-wider truncate max-w-[80px]" title={drive.name || drive.path}>
                                {drive.name || `Drive ${idx}`}
                            </span>
                            <span className="ml-auto font-mono font-bold text-[var(--umbra-accent)]">
                                {drive.used.toFixed(0)}GB
                            </span>
                            <span className="text-[9px] text-zinc-500 ml-1">{Math.round(drive.percent)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
                            <div
                                className={cn("h-full transition-all duration-500", getWarningClass(drive.percent))}
                                style={{ width: `${drive.percent}%` }}
                            />
                        </div>
                        {drive.type && <div className="text-[8px] text-zinc-500 italic">{drive.type}</div>}
                    </div>
                ))
            }
        </div>
    );
}
