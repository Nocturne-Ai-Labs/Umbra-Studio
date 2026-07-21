'use client';

import React, { Component, ReactNode } from 'react';
import { useDebugStore } from '@/store/useDebugStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DebugErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const debugStore = useDebugStore.getState();

    if (debugStore.config.enabled && debugStore.isRecording) {
      debugStore.logEvent({
        category: 'error',
        type: 'error',
        data: {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        },
        stackTrace: error.stack,
      });

      console.error('[Debug] CRITICAL UI ERROR:', error);
      if (errorInfo?.componentStack) {
        console.error('[Debug] Component Stack:', errorInfo.componentStack);
      }

      if (debugStore.config.exportOnError) {
        const sessionData = debugStore.exportSession();
        console.error('[Debug] Error captured, session exported:', sessionData);
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#050508] text-white p-8">
          <div className="glass-panel p-8 max-w-2xl w-full border-red-500/20 bg-red-500/5">
            <h1 className="text-2xl font-black uppercase tracking-tighter text-red-500 mb-4">Neural Hub Crash</h1>
            <p className="text-zinc-400 font-mono text-sm mb-6">
              A critical error occurred in the UI layer. The event has been logged to the telemetry system.
            </p>
            <div className="bg-black/40 p-4 rounded border border-white/5 font-mono text-xs text-red-400 overflow-auto max-h-48 mb-6">
              {this.state.error?.message}
            </div>
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
