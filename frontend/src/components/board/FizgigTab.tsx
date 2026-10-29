import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, GraduationCap, Loader2, Play, RefreshCw, Square, Wrench } from 'lucide-react';

export type FizgigStatus = { installed: boolean; ready: boolean; running: boolean; healthy: boolean; canStop: boolean; url: string; error: string };
type Props = {
  status: FizgigStatus | null;
  frameUrl: string;
  busyAction: string | null;
  onLaunch: () => void;
  onStop: () => void;
  onSetup: () => void;
  onRefresh: () => void;
};
const button = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 px-4 text-xs font-bold text-[var(--umbra-text)] transition-colors hover:border-white/25 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';
const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-white/25 hover:text-white disabled:opacity-40';

function FizgigFrame({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  return <div className="relative min-h-0 flex-1 bg-black">
    <iframe src={url} title="Fizgig training workspace" className="h-full w-full border-0 bg-black" allow="clipboard-read; clipboard-write" onLoad={() => setLoaded(true)} />
    {!loaded && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 bg-[var(--umbra-bg)] text-sm text-zinc-400"><Loader2 size={18} className="animate-spin text-[var(--umbra-accent)]" />Loading Fizgig workspace…</div>}
  </div>;
}

export function FizgigTab({ status, frameUrl, busyAction, onLaunch, onStop, onSetup, onRefresh }: Props) {
  const [frameKey, setFrameKey] = useState(0);
  const busy = busyAction !== null;
  const starting = !status?.healthy && (status?.running || busyAction === '/api/data-forge/fizgig/launch');
  const repair = status?.installed && !status.ready;
  const statusLabel = status?.healthy ? 'Online' : starting ? 'Starting' : repair ? 'Repair needed' : status?.ready ? 'Ready to launch' : 'Not installed';
  const launchButton = <button type="button" className={`${button} border-[var(--umbra-accent)]/40 bg-[var(--umbra-accent)]/10 hover:bg-[var(--umbra-accent)]/20`} disabled={busy || !status?.ready || status.running} onClick={onLaunch}>
    {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}{starting ? 'Starting Fizgig…' : 'Launch Fizgig'}
  </button>;
  return <div className="flex h-full min-h-0 flex-col bg-[var(--umbra-bg)]">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-black/25 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--umbra-accent)]/30 bg-[var(--umbra-accent)]/10 text-[var(--umbra-accent)]"><GraduationCap size={19} /></span>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--umbra-text)]">Fizgig</h2><p className="mt-0.5 text-xs text-zinc-500">LoRA training inside Data Forge</p></div>
      <span role="status" className="flex items-center gap-2 text-xs text-zinc-400"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${status?.healthy ? 'bg-emerald-400' : starting || repair ? 'bg-amber-400' : 'bg-zinc-500'}`} />{statusLabel}</span>
      {!frameUrl && <button type="button" className={iconButton} title="Refresh Fizgig status" aria-label="Refresh Fizgig status" disabled={busy} onClick={onRefresh}><RefreshCw size={14} /></button>}
      {frameUrl && <>
        <button type="button" className={iconButton} title="Reload Fizgig workspace" aria-label="Reload Fizgig workspace" onClick={() => setFrameKey(key => key + 1)}><RefreshCw size={14} /></button>
        {status?.healthy && <a className={iconButton} href={status.url} target="_blank" rel="noreferrer" title="Open Fizgig separately" aria-label="Open Fizgig separately"><ExternalLink size={14} /></a>}
        {status?.canStop && <button type="button" className={`${iconButton} border-red-400/20 text-red-300`} title="Close Fizgig" aria-label="Close Fizgig" disabled={busy} onClick={onStop}>{busyAction === '/api/data-forge/fizgig/stop' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}</button>}
      </>}
    </header>
    {!frameUrl ? <div className="flex min-h-0 flex-1 overflow-y-auto p-5 sm:p-8"><div className="m-auto w-full max-w-2xl">
      <div className="flex items-start gap-4 border-b border-white/10 pb-5">
        <GraduationCap size={40} className="mt-1 shrink-0 text-[var(--umbra-accent)]" />
        <div><h3 className="text-xl font-black tracking-wide text-[var(--umbra-text)] sm:text-2xl">{starting ? 'Starting Fizgig' : repair ? 'Finish setting up Fizgig' : status?.ready ? 'Fizgig is ready to launch' : 'Install Fizgig to get started'}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Train and fine-tune LoRAs with Fizgig’s original workspace. Prepare datasets, review samples and use the LoRA workbench without leaving Data Forge.</p></div>
      </div>
      <div className="grid gap-4 py-5 sm:grid-cols-2">
        <div className="border-l-2 border-[var(--umbra-accent)]/40 pl-3"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300">{status?.ready ? <CheckCircle2 size={14} /> : <Wrench size={14} />}Installation</span><p className="mt-1 text-xs leading-5 text-zinc-500">{status?.ready ? 'Dependencies verified by Umbra Setup.' : 'Install or repair dependencies through Umbra Setup.'}</p></div>
        <div className="border-l-2 border-white/20 pl-3"><span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Your training session</span><p className="mt-1 text-xs leading-5 text-zinc-500">Training continues when you change tabs or close Umbra. Choose models and datasets inside Fizgig.</p></div>
      </div>
      {status?.error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-amber-400/25 bg-amber-500/[0.06] p-3 text-sm text-amber-100"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{status.error}</span></div>}
      <div className="flex flex-wrap gap-2">{status?.ready && launchButton}<button type="button" className={button} disabled={busy} onClick={onSetup}><Wrench size={15} />{repair ? 'Repair in Setup' : status?.installed ? 'Manage in Setup' : 'Install through Setup'}</button></div>
      {starting && <p role="status" className="mt-4 flex items-center gap-2 text-xs text-zinc-400"><Loader2 size={14} className="shrink-0 animate-spin" />Loading the training runtime. The workspace will open automatically when ready.</p>}
    </div></div> : <>
      {!status?.healthy && <div role="status" className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-100"><AlertTriangle size={14} className="shrink-0" />Connection interrupted. Checking for Fizgig to reconnect.</div>}
      <FizgigFrame key={`${frameUrl}-${frameKey}`} url={frameUrl} />
    </>}
    <footer className="shrink-0 border-t border-white/10 px-4 py-2 text-[10px] leading-4 text-zinc-500">Fizgig by shootthesound · Apache-2.0. Finish training and close Fizgig before updating it.</footer>
  </div>;
}
