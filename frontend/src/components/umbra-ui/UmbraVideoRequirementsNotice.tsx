'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Wrench } from 'lucide-react';
import { readUmbraObjectInfoRequiredInputs } from '@/lib/umbraUiObjectInfo';
import { useStore } from '@/store/useStore';

type Family = 'minimax_h3' | 'ltx25';
type ModelStatus = { totalFiles: number; missing: string[] };
type NodeStatus = { installed: boolean; updateAvailable: boolean };

export function UmbraVideoRequirementsNotice({ family, referenceMode, directorEnabled, promptForgeOpen, comfyConnected }: {
  family: Family;
  referenceMode: boolean;
  directorEnabled: boolean;
  promptForgeOpen: boolean;
  comfyConnected: boolean;
}) {
  const needsDaSiWa = directorEnabled || promptForgeOpen;
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const [refresh, setRefresh] = React.useState(0);
  const [models, setModels] = React.useState<ModelStatus | null>(null);
  const [nodes, setNodes] = React.useState<NodeStatus | null>(null);
  const [missingNativeNodes, setMissingNativeNodes] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const abort = new AbortController();
    setModels(null);
    setNodes(null);
    setMissingNativeNodes([]);
    setError('');
    const check = async () => {
      const params = new URLSearchParams({ family, reference: String(referenceMode), promptForge: String(promptForgeOpen) });
      const modelResponse = await fetch(`/api/umbra-ui/video-setup-readiness?${params}`, { signal: abort.signal, cache: 'no-store' });
      const modelResult = await modelResponse.json() as ModelStatus & { error?: string };
      if (!modelResponse.ok) throw new Error(modelResult.error || 'Video model requirements could not be checked.');
      if (!abort.signal.aborted) setModels(modelResult);

      if (family !== 'minimax_h3') return;
      if (needsDaSiWa) {
        const nodeResponse = await fetch('/api/umbra-ui/h3-director/node-update', { signal: abort.signal, cache: 'no-store' });
        if (!nodeResponse.ok) throw new Error('DaSiWa node installation could not be checked.');
        if (!abort.signal.aborted) setNodes(await nodeResponse.json() as NodeStatus);
      }
      if (!comfyConnected) return;
      const required = ['MiniMaxH3SigmaShift', ...(referenceMode ? ['MiniMaxH3ReferenceToVideo'] : []),
        ...(directorEnabled ? ['MiniMaxH3Director'] : [])];
      const missing = await Promise.all(required.map(async (nodeType) => {
        const response = await fetch(`/object_info/${encodeURIComponent(nodeType)}`, { signal: abort.signal, cache: 'no-store' });
        if (response.status === 404) return nodeType;
        if (!response.ok) throw new Error('ComfyUI node registration could not be checked.');
        try {
          readUmbraObjectInfoRequiredInputs(await response.json(), nodeType);
          return null;
        } catch {
          return nodeType;
        }
      }));
      if (!abort.signal.aborted) setMissingNativeNodes(missing.filter((node): node is string => Boolean(node)));
    };
    void check().catch((checkError) => {
      if (!abort.signal.aborted) setError(checkError instanceof Error ? checkError.message : 'Video requirements could not be checked.');
    });
    return () => abort.abort();
  }, [comfyConnected, directorEnabled, family, needsDaSiWa, promptForgeOpen, referenceMode, refresh]);

  const missingModels = models?.missing || [];
  const missingDirector = family === 'minimax_h3' && needsDaSiWa && nodes?.installed === false;
  const updateAvailable = family === 'minimax_h3' && needsDaSiWa && nodes?.updateAvailable === true;
  if (!error && models?.totalFiles && !missingModels.length && !missingDirector && !missingNativeNodes.length && !updateAvailable) return null;
  if (!error && (!models || (family === 'minimax_h3' && needsDaSiWa && !nodes && !missingModels.length))) return null;

  return <div role="status" className="mb-3 border-l-2 border-amber-400 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-100">
    <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={14} /> Video setup needs attention</div>
    {error ? <p className="mt-1">{error}</p> : null}
    {models?.totalFiles === 0 ? <p className="mt-1">No managed model requirements were found for this video family.</p> : null}
    {missingModels.length ? <p className="mt-1">{missingModels.length} managed model file{missingModels.length === 1 ? '' : 's'} missing or incomplete. Open Umbra Setup &gt; Models and select {family === 'minimax_h3' ? referenceMode ? 'MiniMax H3 Reference Video' : 'MiniMax H3 Video' : 'LTX-2.5 Video'}{promptForgeOpen ? ' and DaSiWa H3 Prompt Forge Model' : ''}.</p> : null}
    {missingDirector ? <p className="mt-1">DaSiWa nodes are missing. Install or update managed Custom Nodes, then restart ComfyUI.</p> : null}
    {missingNativeNodes.length ? <p className="mt-1">ComfyUI is missing {missingNativeNodes.join(', ')}. Update managed ComfyUI, then restart it.</p> : null}
    {updateAvailable ? <p className="mt-1">A DaSiWa node update is available. Check Director compatibility before updating.</p> : null}
    {comfyConnected && (missingDirector || missingNativeNodes.length > 0 || updateAvailable) ? <p className="mt-1 text-amber-200/75">Stop ComfyUI before running an update.</p> : null}
    <div className="mt-2 flex flex-wrap gap-2">
      {(missingDirector || missingNativeNodes.length > 0 || updateAvailable) ? <button type="button" className="inline-flex h-8 items-center gap-1 border border-amber-300/30 px-2 hover:bg-amber-300/10" onClick={() => setActiveWorkspace('comfyui')}><Wrench size={13} /> ComfyUI controls</button> : null}
      <button type="button" title="Check video requirements again" aria-label="Check video requirements again" className="inline-flex h-8 w-8 items-center justify-center border border-white/15 hover:bg-white/5" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={13} /></button>
    </div>
  </div>;
}
