import { useEffect, useRef, useState } from 'react';

export function useCaptionDraft(key: string, savedCaption: string, persist?: (caption: string) => Promise<boolean>) {
  const [state, setState] = useState({ key, caption: savedCaption, saved: savedCaption, saving: false, error: '' });
  const active = useRef(key);
  const operation = useRef(0);
  const busy = useRef(false);
  if (active.current !== key) {
    active.current = key;
    operation.current++;
    busy.current = false;
  }
  const current = state.key === key ? state : { key, caption: savedCaption, saved: savedCaption, saving: false, error: '' };
  useEffect(() => {
    setState(previous => previous.key !== key
      ? { key, caption: savedCaption, saved: savedCaption, saving: false, error: '' }
      : { ...previous, saved: savedCaption, caption: previous.caption === previous.saved ? savedCaption : previous.caption });
  }, [key, savedCaption]);
  useEffect(() => () => { operation.current++; }, []);
  return {
    caption: current.caption,
    isDirty: current.caption !== current.saved,
    isSaving: current.saving,
    error: current.error,
    setCaption(caption: string) {
      setState(previous => ({ ...(previous.key === key ? previous : current), caption, error: '' }));
    },
    async save() {
      if (!persist || busy.current || current.caption === current.saved) return;
      busy.current = true;
      const token = ++operation.current;
      const caption = current.caption;
      setState(previous => ({ ...previous, saving: true, error: '' }));
      try {
        if (!await persist(caption)) throw new Error('Could not save caption. Your changes have been kept.');
        if (operation.current === token && active.current === key) setState(previous => ({ ...previous, saved: caption }));
      } catch (error) {
        if (operation.current === token && active.current === key) setState(previous => ({ ...previous, error: error instanceof Error ? error.message : 'Could not save caption.' }));
      } finally {
        if (operation.current === token && active.current === key) {
          busy.current = false;
          setState(previous => ({ ...previous, saving: false }));
        }
      }
    },
  };
}
