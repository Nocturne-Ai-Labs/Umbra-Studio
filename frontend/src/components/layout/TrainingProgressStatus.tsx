import { useEffect, useState } from 'react';
import { GraduationCap, RefreshCw } from 'lucide-react';
import {
  getTrainingProgressUrls,
  watchTrainingProgress,
  type TrainingProgressJob,
  type TrainingProgressUpdate,
  type TrainingToolAvailability,
} from '@/lib/trainingProgress';

export interface TrainingProgressStatusProps {
  collapsed?: boolean;
  enabled?: boolean;
  /** Reuse the parent's lifecycle status; no extra tool discovery poll. */
  aiToolkit?: TrainingToolAvailability | null;
  /** Optional in-app navigation. The fallback opens the trainer's proxied queue. */
  onOpenTrainer?: (tool: 'aitoolkit') => void;
}

const STATUS_LABELS = { running: 'Running', queued: 'Queued', stopping: 'Stopping' };

function describeJob(job: TrainingProgressJob): string {
  const steps = job.step === null ? 'Steps unavailable' : `${job.step.toLocaleString()} / ${job.totalSteps?.toLocaleString() ?? '?'} steps`;
  return `${STATUS_LABELS[job.status]} - ${steps}${job.progress === null ? '' : ` - ${job.progress}%`}`;
}

export function TrainingProgressStatus({ collapsed = false, enabled = true, aiToolkit, onOpenTrainer }: TrainingProgressStatusProps) {
  const urls = enabled ? getTrainingProgressUrls(aiToolkit) : null;
  const endpoint = urls?.status;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ endpoint: string; update: TrainingProgressUpdate } | null>(null);
  const update = state?.endpoint === endpoint ? state?.update : null;

  useEffect(() => {
    if (!endpoint) return;
    return watchTrainingProgress(endpoint, (next) => setState({ endpoint, update: next }));
  }, [endpoint, retry]);

  if (!urls) return null;
  const jobs = update?.status === 'ready' ? update.snapshot.jobs : [];
  const primary = jobs[0];
  const message = update?.status === 'error' ? update.message : update ? 'No active training jobs' : 'Checking training status';
  const summary = primary ? `${primary.name}: ${describeJob(primary)}` : message;
  const title = `AI-Toolkit - ${summary}`;
  const navigationClass = 'min-w-0 text-left hover:text-[var(--umbra-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)]';
  const content = collapsed ? (
    <>
      <GraduationCap size={18} aria-hidden="true" />
      <span className="text-[9px] leading-3 tabular-nums">{primary?.progress != null ? `${primary.progress}%` : update?.status === 'error' ? '!' : primary ? '...' : '-'}</span>
    </>
  ) : (
    <><GraduationCap size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">AI-Toolkit</span></>
  );
  const navClass = `${navigationClass} ${collapsed ? 'flex h-11 w-10 shrink-0 flex-col items-center justify-center gap-0.5' : 'flex h-6 flex-1 items-center gap-2 text-xs font-medium'}`;
  const navigation = onOpenTrainer ? (
    <button type="button" title={title} aria-label={`Open trainer. ${title}`} className={navClass} onClick={() => onOpenTrainer('aitoolkit')}>{content}</button>
  ) : (
    <a title={title} aria-label={`Open trainer. ${title}`} className={navClass} href={urls.trainer} target="_blank" rel="noopener noreferrer">{content}</a>
  );

  return (
    <section aria-label="Model training" className={`min-w-0 overflow-hidden text-[var(--umbra-text)] ${collapsed ? 'flex w-full flex-col items-center' : 'w-full border-t border-[var(--umbra-border)] px-3 py-2'}`}>
      <div className={`flex min-w-0 items-center ${collapsed ? 'flex-col' : 'gap-1'}`}>
        {navigation}
        {update?.status === 'error' && (
          <button type="button" title="Retry training status" aria-label="Retry training status" className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--umbra-text-muted)] hover:text-[var(--umbra-accent)]" onClick={() => { setState(null); setRetry((value) => value + 1); }}>
            <RefreshCw size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="max-h-48 overflow-y-auto">
          {jobs.length ? jobs.map((job) => (
            <div key={job.id} className="min-w-0 py-1.5" title={`${job.name}: ${describeJob(job)}`}>
              <div className="truncate text-xs font-medium">{job.name}</div>
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 text-[10px] leading-4 text-[var(--umbra-text-muted)]">
                <span>{STATUS_LABELS[job.status]}</span>
                <span className="min-w-0 break-all tabular-nums">{job.step?.toLocaleString() ?? '?'} / {job.totalSteps?.toLocaleString() ?? '?'} steps{job.progress === null ? '' : ` (${job.progress}%)`}</span>
              </div>
              <div role="progressbar" aria-label={`${job.name} training progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress ?? undefined} aria-valuetext={describeJob(job)} className="mt-1 h-1 overflow-hidden rounded-sm bg-[var(--umbra-border)]">
                {job.progress !== null && <div className="h-full bg-[var(--umbra-accent)]" style={{ width: `${job.progress}%` }} />}
              </div>
            </div>
          )) : <p className="break-words py-1 text-[10px] leading-4 text-[var(--umbra-text-muted)]">{message}</p>}
          {update?.status === 'ready' && update.snapshot.additionalJobs > 0 && <p className="text-[10px] text-[var(--umbra-text-muted)]">+{update.snapshot.additionalJobs} more active jobs</p>}
        </div>
      )}
    </section>
  );
}
