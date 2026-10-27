import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Play, RefreshCw, Square, Wrench } from 'lucide-react';
import { AIToolkitTab } from './AIToolkitTab';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { TRAINER_DESCRIPTIONS } from '../../../../shared/fizgig';

type FizgigStatus = { installed: boolean; ready: boolean; running: boolean; healthy: boolean; canStop: boolean; url: string; error: string };
export function TrainingWorkspace({ isActive }: { isActive: boolean }) {
  const remote = isUmbraRemoteClient();
  const [ai, setAI] = useState(false);
  const [fizgig, setFizgig] = useState<FizgigStatus | null>(null);
  const [selected, setSelected] = useState<'aitoolkit' | 'fizgig' | null>(null);
  const [visited, setVisited] = useState({ aitoolkit: false, fizgig: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
    setBusy(true); setError('');
    try { const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const result = await response.json(); if (!response.ok || result.success === false) throw new Error(result.error || 'Action failed.'); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <div className="flex h-full min-h-0 flex-col bg-[var(--umbra-bg)]">
    <div className="glass-panel flex flex-wrap items-center gap-2 rounded-none border-x-0 border-t-0 p-2">
      {ai && <button className="forge-button" aria-pressed={selected === 'aitoolkit'} onClick={() => setSelected('aitoolkit')}>AI Toolkit</button>}
      {fizgig?.installed && <button className="forge-button" aria-pressed={selected === 'fizgig'} onClick={() => setSelected('fizgig')}>Fizgig</button>}
      <button className="forge-button" title="Refresh trainer status" aria-label="Refresh trainer status" onClick={() => void refresh()}><RefreshCw size={14} /></button>
      {!remote && <button className="forge-button ml-auto" disabled={busy} onClick={() => void action('/api/tools/setup')}><Wrench size={14} />Manage trainers in Setup</button>}
    </div>
    {error && <p role="alert" className="p-3 text-sm text-amber-200">{error}</p>}
    {!selected && <div className="space-y-3 p-5 text-sm text-[var(--umbra-text-muted)]">
      <h2 className="text-base text-[var(--umbra-text)]">{loaded ? 'Install a training tool to get started' : 'Checking installed trainers…'}</h2>
      <p><strong>AI Toolkit:</strong> {TRAINER_DESCRIPTIONS.aitoolkit}</p><p><strong>Fizgig:</strong> {TRAINER_DESCRIPTIONS.fizgig}</p>
      <p>{remote ? 'Install and manage trainers from Umbra Setup on the host PC.' : 'Open Setup → Training or Advanced → Tools. Choose either trainer or install both.'}</p>
    </div>}
    <div className="relative min-h-0 flex-1">
      {visited.aitoolkit && <div className="absolute inset-0" hidden={selected !== 'aitoolkit'}><AIToolkitTab isActive={isActive && selected === 'aitoolkit'} /></div>}
      {visited.fizgig && <div hidden={selected !== 'fizgig'} className={selected === 'fizgig' ? 'flex h-full min-h-0 flex-col' : 'hidden'}>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-2 text-xs">
          <span className="flex-1">{TRAINER_DESCRIPTIONS.fizgig}</span>
          <button className="forge-button" disabled={busy || !fizgig?.ready || fizgig.running} onClick={() => void action('/api/data-forge/fizgig/launch')}><Play size={14} />Launch Fizgig</button>
          {fizgig?.canStop && <button className="forge-button" disabled={busy} onClick={() => { if (window.confirm("Close Fizgig? Finish training and other tasks first. Active training will not be stopped.")) void action('/api/data-forge/fizgig/stop'); }}><Square size={14} />Close Fizgig</button>}
          {fizgig?.healthy && <a className="forge-button" href={fizgig.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open separately</a>}
        </div>
        {!fizgig?.healthy && <p className="p-4 text-sm">{fizgig?.error || (fizgig?.running ? 'Fizgig is starting…' : 'Launch Fizgig to open its training workspace.')}</p>}
        <p className="px-3 py-1 text-xs text-[var(--umbra-text-muted)]">Fizgig by shootthesound · Apache-2.0. Training continues when you leave this tab or close Umbra. Finish training and close Fizgig before updating it.</p>
        {frameUrl && <iframe src={frameUrl} title="Fizgig training workspace" className="min-h-0 flex-1 w-full border-0 bg-black" allow="clipboard-read; clipboard-write" />}
      </div>}
    </div>
  </div>;
}
