import React from 'react';
import { createPortal } from 'react-dom';
import { Bell, Play, Save, Volume2, VolumeX } from 'lucide-react';
import { BaseModal } from '@/components/modals/BaseModal';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { useStore } from '@/store/useStore';
import { loadAppSettings, pushAppSettingsToBackend, saveAppSettings } from '@/lib/appSettings';
import { POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME } from '@/lib/powerPrompter';
import {
  configurePowerPrompterNotificationAudio, getUmbraAlertPreferences, playPowerPrompterNotificationSound,
  primePowerPrompterNotificationAudio, POWER_PROMPTER_SOUND_STYLE_OPTIONS,
} from '@/components/power-prompter/powerPrompterAudio';

export function useUmbraAlertRuntime() {
  React.useEffect(() => {
    let disposed = false;
    void fetch('/api/powerprompter/settings', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return;
      const settings = await response.json();
      if (!disposed) configurePowerPrompterNotificationAudio(settings);
    }).catch(() => {});
    const prime = () => { void primePowerPrompterNotificationAudio(); };
    window.addEventListener('pointerdown', prime, { passive: true });
    window.addEventListener('keydown', prime);
    return () => {
      disposed = true;
      window.removeEventListener('pointerdown', prime); window.removeEventListener('keydown', prime);
    };
  }, []);
}

export function UmbraAlertSettingsButton() {
  const [open, setOpen] = React.useState(false);
  return <>
    <button type="button" data-umbra-alert-settings="" onClick={() => setOpen(true)} title="Configure Umbra alerts" aria-label="Configure Umbra alerts"
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/15 px-2.5 text-xs text-[var(--umbra-text)] hover:border-[var(--umbra-accent)]"><Bell size={14} />Alerts</button>
    {open && <UmbraAlertSettingsDialog onClose={() => setOpen(false)} />}
  </>;
}

function UmbraAlertSettingsDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = React.useState(getUmbraAlertPreferences);
  const [toasts, setToasts] = React.useState(() => loadAppSettings().enableToasts);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const busyRef = React.useRef(false);
  const save = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    const patch = {
      'alerts.configured': true, 'alerts.soundEnabled': draft.enabled, 'alerts.style': draft.style,
      'alerts.volume': draft.volume, 'alerts.submitted': draft.submitted, 'alerts.completed': draft.completed,
      'alerts.failed': draft.failed, enableToasts: toasts,
    };
    try {
      await pushAppSettingsToBackend(patch);
      useStore.getState().applyAppSettings(saveAppSettings(patch)); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save alert settings.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const testSound = async (kind: 'submitted' | 'completed' | 'failed') => {
    setError('');
    if (!await primePowerPrompterNotificationAudio()) { setError('Audio is unavailable. Check browser sound permissions.'); return; }
    playPowerPrompterNotificationSound(kind, { preview: { ...draft, enabled: true } });
  };
  return createPortal(<div className="fixed inset-0 z-[400000]"><BaseModal isOpen onClose={() => { if (!busyRef.current) onClose(); }} title="Alerts" size="sm">
    <div data-umbra-alert-settings-panel="" className="space-y-5 text-sm text-zinc-200">
      <label className="flex min-h-10 items-center gap-3"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />{draft.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}Sound alerts</label>
      <div className="space-y-2 border-y border-white/10 py-3">
        {([['submitted', 'Job submitted'], ['completed', 'Image / sample completed'], ['failed', 'Errors and failed jobs']] as const).map(([key, label]) => (
          <div key={key} className="flex min-h-10 items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-3"><input type="checkbox" checked={draft[key]} disabled={busy || !draft.enabled} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />{label}</label>
            <button type="button" disabled={busy || draft.volume <= 0} onClick={() => void testSound(key)} title={`Test ${label.toLowerCase()} sound`} aria-label={`Test ${label.toLowerCase()} sound`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 hover:bg-white/10 disabled:opacity-40"><Play size={14} /></button>
          </div>
        ))}
      </div>
      <label className="block space-y-2">Tone
        <UmbraSelectControl value={draft.style} disabled={busy} onChange={(e) => setDraft({ ...draft, style: e.target.value as typeof draft.style })} className="h-10 w-full rounded border border-white/15 bg-black/30 px-2" title="Alert tone">
          {POWER_PROMPTER_SOUND_STYLE_OPTIONS.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
        </UmbraSelectControl>
      </label>
      <label className="block space-y-2"><span className="flex justify-between"><span>Volume</span><span className="font-mono tabular-nums">{Math.round(draft.volume / POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME * 100)}%</span></span>
        <input aria-label="Alert volume" type="range" min={0} max={POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME} step={0.01} disabled={busy} value={draft.volume} onChange={(e) => setDraft({ ...draft, volume: Number(e.target.value) })} className="w-full" />
      </label>
      <label className="flex min-h-10 items-center gap-3 border-t border-white/10 pt-3"><input type="checkbox" checked={toasts} disabled={busy} onChange={(e) => setToasts(e.target.checked)} />Routine toast notifications</label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-10 rounded border border-white/15 px-3">Cancel</button><button type="button" disabled={busy} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 rounded border border-[var(--umbra-accent)] px-3"><Save size={14} />{busy ? 'Saving...' : 'Save'}</button></div>
    </div>
  </BaseModal></div>, document.body);
}
