'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal, ExternalLink, Trash2, Copy, Check } from 'lucide-react';
import { logDiagnostic } from '@/lib/diagnostics';

type BackendType = 'comfyui';

interface LogMessage {
    backend: BackendType;
    stream: 'stdout' | 'stderr';
    message: string;
    timestamp: string;
}

export const ConsoleViewer = () => {
    const [activeTab, setActiveTab] = useState<BackendType | 'all'>(() => {
        const params = new URLSearchParams(window.location.search);
        const backend = params.get('backend');
        if (backend === 'comfyui') {
            return backend;
        }
        return 'all';
    });
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [copied, setCopied] = useState(false);
    const consoleRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [logs]);

    // WebSocket connection
    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);

        ws.onopen = () => {
            logDiagnostic('[ConsoleViewer] WebSocket connected', undefined, 'log');
            setIsConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'backend_log') {
                    // Server sends: { type: 'backend_log', data: { backend, stream, message } }
                    // Keep backward compatibility with top-level payload too.
                    const payload = data.data || data;
                    if (!payload?.backend || !payload?.message) return;
                    setLogs(prev => [...prev, {
                        backend: payload.backend,
                        stream: payload.stream || 'stdout',
                        message: payload.message,
                        timestamp: payload.timestamp || new Date().toISOString()
                    }]);
                }
            } catch (err) {
                console.error('[ConsoleViewer] Failed to parse message:', err);
            }
        };

        ws.onerror = (error) => {
            console.error('[ConsoleViewer] WebSocket error:', error);
            setIsConnected(false);
        };

        ws.onclose = () => {
            logDiagnostic('[ConsoleViewer] WebSocket disconnected', undefined, 'log');
            setIsConnected(false);
        };

        wsRef.current = ws;

        return () => {
            ws.close();
        };
    }, []);

    const filteredLogs = logs.filter(log => {
        if (activeTab === 'all') return true;
        return log.backend === activeTab;
    });

    const clearLogs = () => {
        setLogs([]);
    };

    const copyLogs = () => {
        const text = filteredLogs.map(log =>
            `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.backend.toUpperCase()}] ${log.message}`
        ).join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const openInNewWindow = () => {
        const url = `/console?backend=${activeTab}`;
        window.open(url, 'CozyUI Console', 'width=900,height=600,menubar=no,toolbar=no,location=no,status=no');
    };

    return (
        <div className="flex flex-col h-full">
            {/* Tab Header */}
            <div className="flex items-center justify-between border-b border-[var(--umbra-border)] pb-3 mb-3">
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`glass-panel px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                            activeTab === 'all'
                                ? 'bg-[var(--umbra-accent)] text-white border-[var(--umbra-accent)]'
                                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setActiveTab('comfyui')}
                        className={`glass-panel px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                            activeTab === 'comfyui'
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        ComfyUI
                    </button>
                </div>

                <div className="flex gap-2 items-center">
                    {/* Connection Status */}
                    <div className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-zinc-500 uppercase tracking-wider font-mono">
                            {isConnected ? 'Live' : 'Disconnected'}
                        </span>
                    </div>

                    {/* Action Buttons */}
                    <button
                        onClick={copyLogs}
                        className="glass-panel p-1.5 bg-white/5 hover:bg-white/10 transition-all text-zinc-400 hover:text-[var(--umbra-accent)]"
                        title="Copy logs to clipboard"
                    >
                        {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                    <button
                        onClick={clearLogs}
                        className="glass-panel p-1.5 bg-white/5 hover:bg-red-500/20 transition-all text-zinc-400 hover:text-red-400"
                        title="Clear console"
                    >
                        <Trash2 size={16} />
                    </button>
                    <button
                        onClick={openInNewWindow}
                        className="glass-panel p-1.5 bg-white/5 hover:bg-white/10 transition-all text-zinc-400 hover:text-[var(--umbra-accent)]"
                        title="Pop-out console"
                    >
                        <ExternalLink size={16} />
                    </button>
                </div>
            </div>

            {/* Console Output */}
            <div
                ref={consoleRef}
                className="flex-1 bg-black/60 rounded-lg p-4 font-mono text-xs overflow-y-auto custom-scrollbar"
                style={{
                    minHeight: '400px',
                    maxHeight: '600px'
                }}
            >
                {filteredLogs.length === 0 && (
                    <div className="flex items-center justify-center h-full text-zinc-600">
                        <div className="text-center">
                            <Terminal size={48} className="mx-auto mb-3 opacity-20" />
                            <p className="uppercase tracking-wider font-bold">No logs yet</p>
                            <p className="text-[10px] mt-1">Console output will appear here when backends are running</p>
                        </div>
                    </div>
                )}

                {filteredLogs.map((log, index) => {
                    const time = new Date(log.timestamp).toLocaleTimeString();
                    const isError = log.stream === 'stderr';

                    // Backend-specific colors
                    const bgColor = 'bg-orange-500/5';

                    const textColor = 'text-orange-400';

                    return (
                        <div
                            key={`${log.timestamp}-${index}`}
                            className={`mb-1 p-2 rounded ${bgColor} hover:bg-white/5 transition-colors animate-fade-in`}
                        >
                            <div className="flex gap-3">
                                <span className="text-zinc-600 flex-shrink-0">{time}</span>
                                <span className={`${textColor} font-bold flex-shrink-0 uppercase`}>
                                    [{log.backend}]
                                </span>
                                <span className={`flex-1 ${isError ? 'text-red-400' : 'text-zinc-300'}`}>
                                    {log.message}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
