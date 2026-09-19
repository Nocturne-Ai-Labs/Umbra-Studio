import type { DatasetConceptSettings } from './hooks/useDatasets';

export type ConceptSaveStatus = { state: 'saved' | 'pending' | 'saving' | 'error'; error?: string };

function signature(settings: DatasetConceptSettings): string {
  const { updatedAt: _revision, ...values } = settings;
  return JSON.stringify(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
}

/** One writer per concept; acknowledgment never replaces a newer local draft. */
export function createConceptSettingsSession(
  initial: DatasetConceptSettings,
  save: (settings: DatasetConceptSettings) => Promise<DatasetConceptSettings>,
  notify: (status: ConceptSaveStatus) => void,
) {
  let draft = { ...initial };
  let revision = initial.updatedAt ?? 0;
  let acknowledged = signature(initial);
  let status: ConceptSaveStatus = { state: 'saved' };
  let writing: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const report = (next: ConceptSaveStatus) => { status = next; notify(next); };

  function flush(): Promise<boolean> {
    clearTimeout(timer);
    if (writing) return writing;
    if (status.state === 'error') return Promise.resolve(false);
    writing = Promise.resolve().then(async () => {
      while (signature(draft) !== acknowledged) {
        const snapshot = { ...draft, updatedAt: revision };
        const submitted = signature(snapshot);
        report({ state: 'saving' });
        try {
          const saved = await save(snapshot);
          if (!Number.isFinite(saved.updatedAt)) throw new Error('Missing settings save acknowledgment');
          revision = saved.updatedAt!;
          acknowledged = submitted;
        } catch (error) {
          report({ state: 'error', error: error instanceof Error ? error.message : 'Settings not saved' });
          return false;
        }
      }
      report({ state: 'saved' });
      return true;
    }).finally(() => { writing = null; });
    return writing;
  }

  return {
    get draft() { return { ...draft, updatedAt: revision }; },
    get status() { return status; },
    update(settings: DatasetConceptSettings) {
      draft = { ...settings };
      if (status.state === 'error') return;
      if (!writing && signature(draft) !== acknowledged) {
        report({ state: 'pending' });
        clearTimeout(timer);
        timer = setTimeout(() => { void flush(); }, 500);
      }
    },
    flush,
    retry() { report({ state: 'pending' }); return flush(); },
  };
}
