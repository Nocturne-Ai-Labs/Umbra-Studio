import React from 'react';
import { createVideoProject, validateVideoProject, type VideoStudioProject, type VideoStudioSummary } from '../../../../shared/umbra-ui/videoStudioProject';
import type { OfficialVideoEditorDraft } from '../../../../shared/umbra-ui/officialVideoEditor';
import type { OfficialVideoWorkflowId } from '../../../../shared/umbra-ui/officialVideoWorkflow';

export function useVideoStudioProject() {
  const [project, setProject] = React.useState<VideoStudioProject | null>(null);
  const [projects, setProjects] = React.useState<VideoStudioSummary[]>([]);
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const current = React.useRef(project);
  const dirty = React.useRef(false);
  const inFlight = React.useRef<Promise<void> | null>(null);
  const history = React.useRef<VideoStudioProject[]>([]);
  const future = React.useRef<VideoStudioProject[]>([]);
  const [historyVersion, setHistoryVersion] = React.useState(0);
  const mounted = React.useRef(true);
  const assign = React.useCallback((next: VideoStudioProject | null) => {
    current.current = next;
    if (mounted.current) setProject(next);
  }, []);
  const refresh = React.useCallback(async () => {
    const response = await fetch('/api/video/projects');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not list video projects.');
    if (mounted.current) setProjects(data.projects);
    return data.projects as VideoStudioSummary[];
  }, []);
  const save = React.useCallback(async () => {
    while (inFlight.current) await inFlight.current;
    if (!dirty.current || !current.current) return;
    const snapshot = current.current;
    const task = (async () => {
      if (mounted.current) setSaving(true);
      const response = await fetch('/api/video/projects/' + snapshot.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save video project.');
      const saved = validateVideoProject(data.project);
      if (current.current?.id === snapshot.id) {
        dirty.current = current.current !== snapshot;
        assign({ ...current.current, revision: saved.revision, updatedAt: saved.updatedAt });
      }
      if (mounted.current) setError('');
    })();
    inFlight.current = task;
    try { await task; } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Project save failed.');
      throw cause;
    } finally { if (inFlight.current === task) inFlight.current = null; if (mounted.current) setSaving(false); }
  }, [assign]);
  const change = React.useCallback((next: VideoStudioProject, recordHistory = true) => {
    if (recordHistory && current.current) {
      history.current = [...history.current.slice(-49), current.current]; future.current = [];
      setHistoryVersion(v => v + 1);
    }
    dirty.current = true; assign(next);
  }, [assign]);
  const open = React.useCallback(async (id: string) => {
    await save();
    // A save in flight may have captured an older edit; flush once more.
    if (dirty.current) await save();
    const response = await fetch('/api/video/projects/' + id);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not open video project.');
    dirty.current = false; history.current = []; future.current = [];
    assign(validateVideoProject(data.project));
    window.localStorage.setItem('umbra.videoStudio.lastProject', id);
    setError('');
  }, [assign, save]);
  const create = React.useCallback(async (name: string, workflowId: OfficialVideoWorkflowId, draft: OfficialVideoEditorDraft) => {
    await save(); if (dirty.current) await save();
    const next = createVideoProject(name, workflowId, draft);
    history.current = []; future.current = []; change(next, false);
    await save();
    window.localStorage.setItem('umbra.videoStudio.lastProject', next.id);
    await refresh();
  }, [change, refresh, save]);
  React.useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const list = await refresh();
        const last = window.localStorage.getItem('umbra.videoStudio.lastProject');
        if (last && list.some(p => p.id === last)) await open(last);
      } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not load video projects.'); }
      finally { if (mounted.current) setReady(true); }
    })();
    return () => { mounted.current = false; };
  }, [open, refresh]);
  React.useEffect(() => {
    if (!project || !dirty.current || error) return;
    const timer = window.setTimeout(() => { void save().catch(() => {}); }, 650);
    return () => window.clearTimeout(timer);
  }, [project, save, error]);
  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const travel = (redo: boolean) => {
    const from = redo ? future : history, to = redo ? history : future;
    const next = from.current.pop();
    if (!next || !current.current) return;
    to.current.push(current.current);
    change({ ...next, revision: current.current.revision }, false);
    setHistoryVersion(v => v + 1);
  };
  return { project, projects, ready, saving, dirty: dirty.current, error, change, save, open, create, refresh,
    undo: () => travel(false), redo: () => travel(true), canUndo: history.current.length > 0,
    canRedo: future.current.length > 0, historyVersion };
}
