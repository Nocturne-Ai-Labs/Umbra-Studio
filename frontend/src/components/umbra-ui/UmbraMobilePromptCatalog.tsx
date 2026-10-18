'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Tags } from 'lucide-react';
import { PowerPrompterSearchPanel } from '@/components/layout/PowerPrompterSearchPanel';

type CatalogProps = React.ComponentProps<typeof PowerPrompterSearchPanel>;

export function UmbraMobilePromptCatalog({
  onInsert,
  enabledCSVs,
  onToggleCSV,
  onBeforeOpen,
}: Pick<CatalogProps, 'onInsert' | 'enabledCSVs' | 'onToggleCSV'> & {
  onBeforeOpen: (trigger: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const dialogId = React.useId();

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      dialog.focus({ preventScroll: true });
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  }, [open]);

  return <>
    <button
      type="button"
      aria-label="Open tag catalog"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={dialogId}
      onClick={(event) => { onBeforeOpen(event.currentTarget); setOpen(true); }}
      className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.025] px-2.5 text-xs font-semibold text-zinc-200 hover:border-[var(--umbra-accent)]"
    >
      <Tags size={15} /> Catalog
    </button>
    {createPortal(<dialog
      id={dialogId}
      ref={dialogRef}
      tabIndex={-1}
      aria-label="Tag Catalog"
      data-umbra-mobile-prompt-catalog=""
      onCancel={(event) => { event.preventDefault(); setOpen(false); }}
      className="border border-white/15 bg-[var(--umbra-bg)] p-0 text-[var(--umbra-text)] outline-none backdrop:bg-black/70"
    >
        <PowerPrompterSearchPanel
          onInsert={(text, options) => {
            setOpen(false);
            // Let the dialog release focus before restoring the prompt's caret.
            requestAnimationFrame(() => onInsert(text, options));
          }}
          enabledCSVs={enabledCSVs}
          onToggleCSV={onToggleCSV}
          drawerMode
          mobileLayout
          drawerTriggerContainer={null}
          drawerOpen={open}
          onDrawerOpenChange={setOpen}
        />
    </dialog>, document.body)}
  </>;
}
