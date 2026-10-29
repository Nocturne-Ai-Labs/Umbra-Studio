import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';
import { AIToolkitTab } from './AIToolkitTab';
import { FizgigTab, type FizgigStatus } from './FizgigTab';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { TRAINER_DESCRIPTIONS } from '../../../../shared/fizgig';

export function TrainingWorkspace({ isActive }: { isActive: boolean }) {
  const remote = isUmbraRemoteClient();
  const [ai, setAI] = useState(false);
  const [fizgig, setFizgig] = useState<FizgigStatus | null>(null);
  const [selected, setSelected] = useState<'aitoolkit' | 'fizgig' | null>(null);
  const [visited, setVisited] = useState({ aitoolkit: false, fizgig: false });
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busy = busyAction !== null;
  const [loaded, setLoaded] = useState(false);
  const [frameUrl, setFrameUrl] = useState('');
  const refresh = useCallback(async () => {
    try {
      const aiResponse = await fetch('/api/data-forge/ai-toolkit/status');
      if (!aiResponse.ok) throw new Error('Could not check installed trainers. Retry status.');
      const a = await aiResponse.json();
      let f: FizgigStatus | null = null;
      if (!remote) {
        const response = await fetch('/api/data-forge/fizgig/status');
        if (!response.ok) throw new Error('Could not check Fizgig. Retry status.');
        f = await response.json();
      }
      if (f?.healthy) setFrameUrl(f.url);
      else if (f && !f.running) setFrameUrl('');
      setAI(a.installed === true); setFizgig(f); setLoaded(true); setError('');
      setSelected(current => current === 'aitoolkit' && a.installed || current === 'fizgig' && f?.installed ? current : a.installed ? 'aitoolkit' : f?.installed ? 'fizgig' : null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [remote]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), isActive ? 5000 : 20000); return () => window.clearInterval(timer); }, [refresh, isActive]);
  useEffect(() => { if (selected) setVisited(current => ({ ...current, [selected]: true })); }, [selected]);
  async function action(path: string) {
    if (busy) return;
    setBusyAction(path); setActionError('');
    try { const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const result = await response.json(); if (!response.ok || result.success === false) throw new Error(result.error || 'Action failed.'); await refresh(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusyAction(null); }
  }
  return <div className="flex h-full min-h-0 flex-col bg-[var(--umbra-bg)]">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-black/25 p-2">
      {ai && <button className="h-8 rounded-md border border-white/10 px-3 text-xs font-semibold text-zinc-400 hover:text-white aria-pressed:border-[var(--umbra-accent)]/40 aria-pressed:bg-[var(--umbra-accent)]/10 aria-pressed:text-[var(--umbra-text)]" aria-pressed={selected === 'aitoolkit'} onClick={() => setSelected('aitoolkit')}>AI Toolkit</button>}
      {fizgig?.installed && <button className="h-8 rounded-md border border-white/10 px-3 text-xs font-semibold text-zinc-400 hover:text-white aria-pressed:border-[var(--umbra-accent)]/40 aria-pressed:bg-[var(--umbra-accent)]/10 aria-pressed:text-[var(--umbra-text)]" aria-pressed={selected === 'fizgig'} onClick={() => setSelected('fizgig')}>Fizgig</button>}
      <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:text-white" title="Refresh trainer status" aria-label="Refresh trainer status" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} /></button>
      {!remote && <button className="ml-auto inline-flex h-8 items-center gap-2 rounded-md border border-white/10 px-3 text-xs text-zinc-400 hover:text-white disabled:opacity-40" disabled={busy} onClick={() => void action('/api/tools/setup')}><Wrench size={14} />Manage trainers<span className="hidden sm:inline"> in Setup</span></button>}
    </div>
    {(actionError || error) && <p role="alert" className="border-b border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">{actionError || error}</p>}
    {!selected && <div className="space-y-3 p-5 text-sm text-[var(--umbra-text-muted)]">
      <h2 className="text-base text-[var(--umbra-text)]">{loaded ? 'Install a training tool to get started' : 'Checking installed trainers…'}</h2>
      <p><strong>AI Toolkit:</strong> {TRAINER_DESCRIPTIONS.aitoolkit}</p><p><strong>Fizgig:</strong> {TRAINER_DESCRIPTIONS.fizgig}</p>
      <p>{remote ? 'Install and manage trainers from Umbra Setup on the host PC.' : 'Open Setup → Training or Advanced → Tools. Choose either trainer or install both.'}</p>
    </div>}
    <div className="relative min-h-0 flex-1">
      {visited.aitoolkit && <div className="absolute inset-0" hidden={selected !== 'aitoolkit'}><AIToolkitTab isActive={isActive && selected === 'aitoolkit'} /></div>}
      {visited.fizgig && <div hidden={selected !== 'fizgig'} className={selected === 'fizgig' ? 'flex h-full min-h-0 flex-col' : 'hidden'}>
        <FizgigTab status={fizgig} frameUrl={frameUrl} busyAction={busyAction}
          onLaunch={() => void action('/api/data-forge/fizgig/launch')}
          onStop={() => { if (window.confirm('Close Fizgig? Finish training and other tasks first. Active training will not be stopped.')) void action('/api/data-forge/fizgig/stop'); }}
          onSetup={() => void action('/api/tools/setup')} onRefresh={() => void refresh()} />
      </div>}
    </div>
  </div>;
}
