import React, { Component, type ReactNode } from 'react';
import { createUiCrashReport, saveUiCrashReport } from '../../lib/uiCrashReport';

type SurfaceProps = { active: boolean; render: () => ReactNode };

// Gallery's data controller must stay mounted for the filmstrip and its viewer.
// Its folder browser does not need to build/diff an invisible tree on every poll.
export class FrozenGalleryBrowser extends Component<SurfaceProps> {
  shouldComponentUpdate(next: SurfaceProps) { return next.active; }
  render() { return this.props.active ? this.props.render() : null; }
}

export class GalleryBrowserBoundary extends Component<{ children: ReactNode }, { details: string }> {
  state = { details: '' };

  static getDerivedStateFromError() { return { details: 'Gallery could not be displayed.' }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const report = createUiCrashReport(error, info.componentStack || 'Gallery folder browser', import.meta.env.UMBRA_APP_VERSION || '');
    saveUiCrashReport(report);
    this.setState({ details: JSON.stringify(report, null, 2) });
    try { console.error('[Umbra] Gallery browser crash:', report); } catch { /* Optional console hooks. */ }
  }

  render() {
    if (!this.state.details) return this.props.children;
    return <div role="alert" className="m-4 flex min-w-0 flex-1 flex-col gap-3 rounded border border-white/10 bg-black p-4 text-sm text-zinc-300">
      <p>Gallery stopped unexpectedly. Your files and other workspaces are still available.</p>
      <details><summary className="cursor-pointer">Error details</summary><pre translate="no" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{this.state.details}</pre></details>
      <button type="button" onClick={() => this.setState({ details: '' })} className="self-start rounded border border-white/15 px-3 py-2 hover:bg-white/5">Retry Gallery</button>
    </div>;
  }
}
