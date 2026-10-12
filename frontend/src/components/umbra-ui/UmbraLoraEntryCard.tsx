'use client';
import React from 'react';
import { Check, Copy, Image as ImageIcon, Minus, Plus, Tags, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildUmbraUiLoraSyntax, type UmbraUiLoraEntry } from '@/lib/umbraUiModels';
import { useStore } from '@/store/useStore';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.11em] text-zinc-500';

export function parseLoraStrength(value: string, fallback: number, min = -10, max = 10): number {
  if (value.trim() === '' || value.trim() === '-' || value.trim() === '.') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

export function adjustLoraStrength(value: number, delta: number, min = -10, max = 10): number {
  return Math.max(min, Math.min(max, Number((value + delta).toFixed(6))));
}

function formatStrength(value: number): string {
  return String(value);
}

function UmbraLoraStrengthInput({
  value,
  label,
  name,
  onChange,
  min,
  max,
  commitOnBlur,
  ariaLabel,
  title,
}: {
  value: number;
  label: string;
  name: string;
  onChange: (value: number) => void;
  min: number;
  max: number;
  commitOnBlur: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const emittedValue = React.useRef<number | null>(null);
  const draftName = React.useRef(name);
  React.useEffect(() => {
    // Preserve a signed/decimal draft during its own immediate updates, but reset on outside edits.
    if (name !== draftName.current || value !== emittedValue.current) setDraft(null);
    draftName.current = name;
    emittedValue.current = null;
  }, [value, name]);
  return (
    <input
      type="text"
      value={draft ?? formatStrength(value)}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (!commitOnBlur && next.trim() && Number.isFinite(Number(next))) {
          emittedValue.current = parseLoraStrength(next, value, min, max);
          onChange(emittedValue.current);
        }
      }}
      onBlur={() => {
        if (draft !== null) onChange(parseLoraStrength(draft, value, min, max));
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      inputMode="decimal"
      aria-label={ariaLabel || `${label} strength for ${name}`}
      title={title}
      className="umbra-lora-strength min-w-0 flex-1 bg-transparent px-1 text-center font-mono text-xs text-zinc-100 outline-none"
    />
  );
}

export function UmbraLoraStrengthControl({
  value,
  label,
  name,
  onChange,
  min = -10,
  max = 10,
  step = 0.05,
  commitOnBlur = false,
  ariaLabel,
  title,
}: {
  value: number;
  label: string;
  name: string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  commitOnBlur?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <span className={labelClass}>{label}</span>
      <div className="umbra-lora-strength-row flex overflow-hidden rounded-sm border border-white/10 bg-black/35 focus-within:border-[var(--umbra-accent)]">
        <button
          type="button"
          onClick={() => onChange(adjustLoraStrength(value, -step, min, max))}
          className="flex w-7 shrink-0 items-center justify-center border-r border-white/10"
          title={`Decrease ${label} strength by ${step}`}
          aria-label={`Decrease ${label} strength by ${step} for ${name}`}
        >
          <Minus size={11} />
        </button>
        <UmbraLoraStrengthInput
          value={value}
          label={label}
          name={name}
          onChange={onChange}
          min={min}
          max={max}
          commitOnBlur={commitOnBlur}
          ariaLabel={ariaLabel}
          title={title}
        />
        <button
          type="button"
          onClick={() => onChange(adjustLoraStrength(value, step, min, max))}
          className="flex w-7 shrink-0 items-center justify-center border-l border-white/10"
          title={`Increase ${label} strength by ${step}`}
          aria-label={`Increase ${label} strength by ${step} for ${name}`}
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}

export function UmbraLoraEntryCard({
  lora,
  onChange,
  onRemove,
  modelOnly = false,
  syntax: customSyntax,
  collapsed = false,
  disabled = false,
  headerActions,
  beforeControls,
  strengths,
  children,
  onPreview,
  onCopy,
}: {
  lora: UmbraUiLoraEntry;
  onChange: (patch: Partial<UmbraUiLoraEntry>) => void;
  onRemove: () => void;
  modelOnly?: boolean;
  syntax?: string;
  collapsed?: boolean;
  disabled?: boolean;
  headerActions?: React.ReactNode;
  beforeControls?: React.ReactNode;
  strengths?: React.ReactNode;
  children?: React.ReactNode;
  onPreview?: () => void;
  onCopy?: (token: string) => void | Promise<void>;
}) {
  const showToast = useStore((state) => state.showToast);
  const [copiedToken, setCopiedToken] = React.useState('');
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );
  const copyToken = React.useCallback(
    async (rawToken: string) => {
      const token = String(rawToken || '').trim();
      if (!token) return;
      try {
        if (onCopy) await onCopy(token);
        else await navigator.clipboard.writeText(token);
        setCopiedToken(token);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => {
          copiedTimerRef.current = null;
          setCopiedToken((current) => (current === token ? '' : current));
        }, 1400);
        if (!onCopy) showToast('LoRA token copied.', 'success');
      } catch {
        showToast('Failed to copy LoRA token.', 'error');
      }
    },
    [onCopy, showToast],
  );

  const syntax = customSyntax ?? buildUmbraUiLoraSyntax(lora, modelOnly);
  const thumbnail = String(lora.thumbnailUrls?.[0] || lora.thumbnailUrl || '').trim();
  const triggerWords = Array.from(
    new Set((lora.triggerWords || []).map((word) => String(word || '').trim()).filter(Boolean)),
  );
  const triggerWordKeys = new Set(triggerWords.map((word) => word.toLowerCase()));
  const trainingTags = lora.trainedTags.filter((tag) => !triggerWordKeys.has(tag.toLowerCase()));
  return (
    <fieldset
      data-umbra-lora-entry=""
      disabled={disabled}
      className={cn(
        'min-w-0 rounded-md border border-white/10 bg-black/25 p-2',
        !lora.enabled && 'opacity-55',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ enabled: !lora.enabled })}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border',
            lora.enabled
              ? 'border-emerald-300/35 bg-emerald-500/[0.12] text-emerald-100'
              : 'border-white/10 text-zinc-700',
          )}
          title={lora.enabled ? 'Disable LoRA' : 'Enable LoRA'}
          aria-label={`${lora.enabled ? 'Disable' : 'Enable'} LoRA ${lora.name}`}
          aria-pressed={lora.enabled}
        >
          {lora.enabled ? <Check size={12} /> : null}
        </button>
        <div
          onClick={disabled ? undefined : onPreview}
          role={onPreview ? 'button' : undefined}
          aria-disabled={disabled || undefined}
          tabIndex={onPreview && !disabled ? 0 : undefined}
          onKeyDown={(event) => {
            if (!disabled && onPreview && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              onPreview();
            }
          }}
          className="h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black/45"
        >
          {thumbnail ? (
            <img src={thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-700">
              <ImageIcon size={13} />
            </div>
          )}
        </div>
        <div
          className="min-w-[60px] flex-1 truncate font-mono text-[10px] text-zinc-100"
          title={lora.name}
        >
          {lora.name}
        </div>
        {headerActions}
        <button
          type="button"
          onClick={() => onRemove()}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-red-300/15 text-red-200/65 hover:border-red-300/35 hover:text-red-100"
          title="Remove LoRA"
          aria-label={`Remove LoRA ${lora.name}`}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {!collapsed && (
        <>
          {beforeControls}
          <div className="mt-2 space-y-1.5">
            {syntax && (
              <button
                type="button"
                onClick={() => {
                  void copyToken(syntax);
                }}
                className="flex w-full min-w-0 max-w-full items-start gap-1.5 rounded-sm border border-cyan-300/18 bg-cyan-500/[0.05] px-2 py-1.5 text-left font-mono text-[10px] leading-relaxed text-cyan-100/90 hover:border-cyan-300/35"
                title={`Copy LoRA syntax: ${syntax}`}
                aria-label="Copy LoRA syntax"
              >
                {copiedToken === syntax ? (
                  <Check size={10} className="shrink-0 text-emerald-300" />
                ) : (
                  <Copy size={10} className="shrink-0" />
                )}
                <span className="min-w-0 break-all">{syntax}</span>
              </button>
            )}
            {strengths ?? (
              <div className={modelOnly ? 'grid grid-cols-1 gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
                {(
                  [
                    ['strengthModel', 'Model'],
                    ...(!modelOnly ? [['strengthClip', 'CLIP']] : []),
                  ] as Array<['strengthModel' | 'strengthClip', string]>
                ).map(([key, label]) => (
                  <UmbraLoraStrengthControl
                    key={key}
                    value={lora[key]}
                    label={label}
                    name={lora.name}
                    onChange={(value) => onChange({ [key]: value })}
                  />
                ))}
              </div>
            )}
          </div>

          {triggerWords.length > 0 ? (
            <div className="mt-2">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">
                <Tags size={10} /> Trigger Words
              </div>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto custom-scrollbar">
                {triggerWords.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => {
                      void copyToken(tag);
                    }}
                    className="inline-flex max-w-full items-center gap-1.5 truncate rounded-sm border border-emerald-300/18 bg-emerald-500/[0.055] px-2 py-1.5 font-mono text-[9px] text-emerald-100/90 hover:border-emerald-300/40 hover:bg-emerald-500/[0.1]"
                    title={`Copy "${tag}"`}
                  >
                    {copiedToken === tag ? (
                      <Check size={9} className="shrink-0" />
                    ) : (
                      <Copy size={9} className="shrink-0" />
                    )}
                    <span data-i18n-skip="" className="truncate">
                      {tag}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {trainingTags.length > 0 ? (
            <details className="mt-2 border-t border-white/[0.06] pt-2">
              <summary className="cursor-pointer select-none text-[9px] font-black uppercase tracking-[0.1em] text-zinc-600 hover:text-zinc-400">
                Trained Tokens ({trainingTags.length})
              </summary>
              <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto custom-scrollbar">
                {trainingTags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => {
                      void copyToken(tag);
                    }}
                    className="inline-flex max-w-full items-center gap-1.5 truncate rounded-sm border border-white/10 bg-white/[0.025] px-2 py-1.5 font-mono text-[9px] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    title={`Copy "${tag}"`}
                  >
                    {copiedToken === tag ? (
                      <Check size={9} className="shrink-0" />
                    ) : (
                      <Copy size={9} className="shrink-0" />
                    )}
                    <span data-i18n-skip="" className="truncate">
                      {tag}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          {children}
        </>
      )}
    </fieldset>
  );
}
