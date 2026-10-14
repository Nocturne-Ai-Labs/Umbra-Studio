import React from 'react';
import { ExternalLink, Play, Square, Wrench } from 'lucide-react';
import { openUmbraToolsSetup } from '@/lib/openUmbraSetup';

const button = 'inline-flex h-8 items-center gap-2 rounded border border-white/15 px-3 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40';
export function UmbraFrameForge() {
  const [url, setUrl] = React.useState('');
  const [installed, setInstalled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const refresh = React.useCallback(async (method = 'GET') => {
    const response = await fetch('/api/frameforge', { method });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error || 'Unable to connect to Frame Forge.');
    setInstalled(state.installed); setUrl(state.url || '');
  }, []);
  React.useEffect(() => { void refresh().catch(cause => setError(cause.message)); }, [refresh]);
  const act = async (method: string) => {
    setBusy(true); setError('');
    try { await refresh(method); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <section className="flex min-h-0 flex-1 flex-col" aria-label="Frame Forge">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs">
      <span className="mr-auto text-zinc-400">Frame Forge by <a className="underline" href="https://github.com/spacesimeco-hue/Chain-Motion-AI-Video-Editor" target="_blank" rel="noopener noreferrer">spacesimeco-hue and contributors</a></span>
      <button type="button" className={button} onClick={() => { void openUmbraToolsSetup().catch(cause => setError(cause.message)); }}><Wrench size={14} />Setup</button>
      <button type="button" className={button} disabled={busy} onClick={() => { void act(url ? 'DELETE' : 'POST'); }}>{url ? <Square size={14} /> : <Play size={14} />}{busy ? 'Please wait…' : url ? 'Stop' : 'Launch'}</button>
      {url && <a className={button} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Open separately</a>}
    </div>
    {error && <p role="alert" className="p-3 text-sm text-zinc-300">{error}</p>}
    {!url && <p className="p-3 text-sm text-zinc-400">{installed ? 'Launch Frame Forge to open its original editing interface.' : 'Install Frame Forge in Umbra Setup → Tools, then launch it here.'} Its video nodes, optional 3D nodes, and model choices are separate Setup selections. Projects are saved in User/FrameForge. Available on the host PC.</p>}
    {url && <iframe src={url} title="Frame Forge by spacesimeco-hue" className="min-h-0 w-full flex-1 border-0" allow="fullscreen; autoplay; clipboard-read; clipboard-write" allowFullScreen />}
  </section>;
}
