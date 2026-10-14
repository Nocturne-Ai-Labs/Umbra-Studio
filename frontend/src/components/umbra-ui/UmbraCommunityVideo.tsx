'use client';

import React from 'react';
import { ExternalLink, RefreshCw, Wrench } from 'lucide-react';
import { openUmbraToolsSetup } from '@/lib/openUmbraSetup';
import { UmbraFrameForge } from './UmbraFrameForge';

const button = 'inline-flex h-8 items-center gap-2 rounded border border-white/15 px-3 text-xs text-zinc-300 hover:bg-white/5';
const required = {
  H3_Prompt_Compiler: ['MiniMaxH3Subject', 'MiniMaxH3RefPromptBuilder'],
  H3_Longshot: ['MiniMaxH3LongShot', 'MiniMaxH3TimelineShot', 'MiniMaxH3Take', 'MiniMaxH3SaveVideo', 'MiniMaxH3LoadVideo'],
};

function LongshotStudio() {
  const [status, setStatus] = React.useState('Checking Longshot Studio…');
  const [ready, setReady] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]);
        const response = await fetch('/comfy/object_info', { signal, cache: 'no-store' });
        if (!response.ok) throw new Error('ComfyUI is unavailable. Start it, or wait for it to finish restarting.');
        const info = await response.json();
        const missing = Object.entries(required).filter(([, classes]) => classes.some(name => !info[name])).map(([name]) => name);
        const studio = await fetch('/longshot/options', { signal, cache: 'no-store' });
        if (studio.status === 404) missing.unshift('Longshot_Studio');
        else if (!studio.ok) throw new Error('Longshot Studio is unavailable. Check ComfyUI’s node import log, then restart it.');
        else {
          const options = await studio.json();
          if (!options || typeof options !== 'object' || Array.isArray(options) || !options.version || !options.nodes) throw new Error('Longshot Studio returned an invalid readiness response.');
        }
        if (abort.signal.aborted) return;
        if (missing.length) {
          setStatus('Required components are missing or failed to load: ' + missing.join(', ') + '. Open Umbra Setup → Tools → Longshot Studio, install the bundle, then restart ComfyUI.');
        } else {
          setReady(true);
          setStatus('');
        }
      } catch (cause) {
        if (!abort.signal.aborted) setStatus(cause instanceof Error ? cause.message : 'Unable to check Longshot Studio.');
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(check, 10000);
      }
    };
    void check();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [revision]);
  return <section className="flex min-h-0 flex-1 flex-col" aria-label="Longshot Studio">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs">
      <span className="mr-auto text-zinc-400">Longshot Studio by <a className="underline" href="https://github.com/r34vtraining/Longshot_Studio" target="_blank" rel="noopener noreferrer">r34vtraining and contributors</a></span>
      <button type="button" className={button} onClick={() => { setError(''); void openUmbraToolsSetup().catch(cause => setError(String(cause.message || cause))); }}><Wrench size={14} />Setup</button>
      <button type="button" className={button} onClick={() => setRevision(value => value + 1)} title="Reload Longshot Studio"><RefreshCw size={14} />Reload</button>
      {ready ? <a className={button} href="/longshot/" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Open separately</a> : null}
    </div>
    {status || error ? <div role="status" className="border-b border-white/10 p-3 text-sm text-zinc-300">{error || status}</div> : null}
    {!ready ? <p className="p-3 text-sm text-zinc-400">Longshot requires its Studio, H3 Long Shot and H3 Prompt Compiler node packs. MiniMax H3 models and FFmpeg are also needed for generation.</p> : null}
    {ready ? <iframe key={revision} src="/longshot/" title="Longshot Studio by r34vtraining" className="min-h-0 w-full flex-1 border-0" allow="fullscreen; autoplay; clipboard-read; clipboard-write" allowFullScreen /> : null}
  </section>;
}

// Keep both applications mounted when switching so upstream projects and Umbra drafts survive.
export function UmbraCommunityVideo({ children }: { children: React.ReactNode }) {
  const [studio, setStudio] = React.useState<'umbra' | 'longshot' | 'frameforge'>('umbra');
  const [frameForgeVisited, setFrameForgeVisited] = React.useState(false);
  const [visited, setVisited] = React.useState(false);
  return <>
    <div role="group" aria-label="Video studio" className="flex shrink-0 gap-2 border-b border-white/10 px-3 py-1.5">
      <button type="button" className={button} aria-pressed={studio === 'umbra'} onClick={() => setStudio('umbra')}>Umbra / DaSiWa</button>
      <button type="button" className={button} aria-pressed={studio === 'longshot'} onClick={() => { setVisited(true); setStudio('longshot'); }}>Longshot Studio</button>
      <button type="button" className={button} aria-pressed={studio === 'frameforge'} onClick={() => { setFrameForgeVisited(true); setStudio('frameforge'); }}>Frame Forge</button>
    </div>
    <div className={studio === 'umbra' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>{children}</div>
    {visited ? <div className={studio === 'longshot' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}><LongshotStudio /></div> : null}
    {frameForgeVisited ? <div className={studio === 'frameforge' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}><UmbraFrameForge /></div> : null}
  </>;
}
