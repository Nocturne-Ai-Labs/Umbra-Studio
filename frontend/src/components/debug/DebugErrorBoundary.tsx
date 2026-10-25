'use client';

import React, { Component, ReactNode } from 'react';
import { useDebugStore } from '@/store/useDebugStore';
import { createUiCrashReport, saveUiCrashReport } from '@/lib/uiCrashReport';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  details: string;
  copyStatus: string;
}

export class DebugErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, details: '', copyStatus: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const report = createUiCrashReport(error, errorInfo?.componentStack || '', import.meta.env.UMBRA_APP_VERSION || '');
    saveUiCrashReport(report);
    this.setState({ details: JSON.stringify(report, null, 2) });
    // Critical errors must remain inspectable even when optional tracing is off.
    try { console.error('[Umbra] UI crash:', report); } catch { /* Console hooks are optional. */ }

    try {
      const debugStore = useDebugStore.getState();
      if (debugStore.config.enabled && debugStore.isRecording) {
        debugStore.logEvent({
          category: 'error',
          type: 'error',
          data: report,
          stackTrace: report.stack,
        });
      }
    } catch { /* A failed diagnostics subscriber must not crash the error boundary. */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#050508] text-white p-8">
          <div className="glass-panel p-8 max-w-2xl w-full border-red-500/20 bg-red-500/5">
            <h1 className="text-2xl font-black uppercase tracking-tighter text-red-500 mb-4">Neural Hub Crash</h1>
            <p className="text-zinc-400 font-mono text-sm mb-6">
              Studio’s interface stopped unexpectedly. Copy the error details before restarting.
            </p>
            <div className="bg-black/40 p-4 rounded border border-white/5 font-mono text-xs text-red-400 overflow-auto max-h-48 mb-6">
              {this.state.error?.message}
            </div>
            <details className="mb-4">
              <summary className="cursor-pointer text-sm text-zinc-300">Error details</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-400" translate="no">{this.state.details}</pre>
            </details>
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(this.state.details); this.setState({ copyStatus: 'Error details copied.' }); }
                catch { this.setState({ copyStatus: 'Copy unavailable. Select the text under Error details.' }); }
              }}
              disabled={!this.state.details}
              className="mb-3 w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-200 disabled:opacity-50"
            >Copy error details</button>
            <p role="status" className="mb-3 text-xs text-zinc-400">{this.state.copyStatus}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-600 text-white font-black uppercase tracking-widest text-xs hover:bg-red-500 transition-all rounded-lg"
            >
              Restart Session
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
