import React from 'react';
import { Check, ChevronDown, Download, Loader2, RefreshCw, Save, Trash2, X, XCircle } from 'lucide-react';
import { PowerPrompterGlobalSearchBox } from './PowerPrompterGlobalSearchBox';

type PowerPrompterPresetBarProps = Record<string, any>;

export function PowerPrompterPresetBar(props: PowerPrompterPresetBarProps) {
  const [phonePresetPickerOpen, setPhonePresetPickerOpen] = React.useState(false);
  const {
    currentFile,
    presets = [],
    selectedPresetId,
    setSelectedPresetId,
    presetNameDraft,
    setPresetNameDraft,
    presetBusy,
    onSavePreset,
    onLoadPreset,
    onUnloadPreset,
    onDeletePreset,
    onRefreshPresets,
    activePresetSession,
    globalSearchBoxRef,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchSuggestionOpen,
    setGlobalSearchSuggestionOpen,
    globalSearchSuggestionIndex,
    setGlobalSearchSuggestionIndex,
    filteredGlobalSearchSuggestions,
    applyGlobalSearchSelection,
    isPhoneRemote = false,
  } = props;

  const hasPresets = Array.isArray(presets) && presets.length > 0;
  const hasCurrentFile = Boolean(currentFile);
  const isBusy = Boolean(presetBusy);
  const presetSessionName = String(activePresetSession?.presetName || '').trim();
  const hasActivePresetSession = Boolean(presetSessionName);
  const isImageRestoreSession = activePresetSession?.kind === 'image-restore';
  const selectedPreset = Array.isArray(presets)
    ? presets.find((preset: any) => preset.id === selectedPresetId) || null
    : null;
  const currentFileLabel = String(currentFile || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\.ppcards\.json$/i, '')
    .replace(/\.txt$/i, '')
    || '';

  if (isPhoneRemote) {
    return (
      <section
        data-umbra-powerprompter-preset-bar=""
        data-umbra-powerprompter-phone-preset-bar=""
        className="shrink-0 border-t border-amber-300/15 bg-[#07070a]/98 px-3 py-3"
      >
        <div data-umbra-powerprompter-phone-preset-header="" className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">Preset Editor</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-zinc-400" title={currentFile || ''}>
              {currentFileLabel || 'Open a card file'}
            </div>
          </div>
          {hasActivePresetSession ? (
            <span className="max-w-[46%] truncate rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-100">
              {presetSessionName}
            </span>
          ) : null}
        </div>

        <div data-umbra-powerprompter-phone-preset-grid="" className="mt-2.5">
          <button
            type="button"
            onClick={() => setPhonePresetPickerOpen(true)}
            disabled={!hasCurrentFile || isBusy}
            data-umbra-powerprompter-phone-preset-trigger=""
            className="inline-flex h-12 w-full min-w-0 items-center rounded-lg border border-white/15 bg-white/[0.045] px-3 text-left text-sm font-semibold text-zinc-200 outline-none transition-colors disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-600"
            title={hasCurrentFile ? `Manage presets for ${currentFileLabel || 'this card file'}` : 'Open or create a card file before managing presets'}
          >
            <span className="min-w-0 flex-1 truncate">
              {selectedPreset?.name || (hasCurrentFile ? 'Manage presets' : 'Open a card file')}
            </span>
            <ChevronDown
              size={15}
              className="ml-3 shrink-0 text-zinc-500"
            />
          </button>
        </div>

        {phonePresetPickerOpen ? (
          <>
            <button
              type="button"
              aria-label="Close preset picker"
              data-umbra-powerprompter-phone-preset-picker-backdrop=""
              onClick={() => setPhonePresetPickerOpen(false)}
            />
            <section
              data-umbra-powerprompter-phone-preset-picker=""
              role="dialog"
              aria-modal="true"
              aria-label="Choose preset"
            >
              <div data-umbra-powerprompter-phone-preset-picker-handle="" />
              <header data-umbra-powerprompter-phone-preset-picker-header="">
                <div>
                  <span>Preset Editor</span>
                  <strong>Manage presets</strong>
                </div>
                <button
                  type="button"
                  onClick={() => setPhonePresetPickerOpen(false)}
                  aria-label="Close preset picker"
                >
                  <X size={18} />
                </button>
              </header>
              <div data-umbra-powerprompter-phone-preset-picker-body="">
                <div data-umbra-powerprompter-phone-preset-picker-list="">
                  {hasPresets ? presets.map((preset: any) => {
                    const active = preset.id === selectedPresetId;
                    return (
                      <button
                        type="button"
                        key={`phone-preset-option-${preset.id}`}
                        data-active={active ? '1' : '0'}
                        onClick={() => setSelectedPresetId(String(preset.id || ''))}
                      >
                        <span>{preset.name}</span>
                        {active ? <Check size={17} /> : null}
                      </button>
                    );
                  }) : (
                    <div data-umbra-powerprompter-phone-preset-empty="">
                      No presets saved for this card file yet.
                    </div>
                  )}
                </div>

                <div data-umbra-powerprompter-phone-preset-picker-actions="">
                  <button
                    type="button"
                    onClick={() => {
                      onLoadPreset();
                      setPhonePresetPickerOpen(false);
                    }}
                    disabled={!selectedPresetId || isBusy}
                    className="border-cyan-400/35 bg-cyan-500/10 text-cyan-100"
                  >
                    {presetBusy === 'load' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={onRefreshPresets}
                    disabled={isBusy}
                    className="border-white/15 bg-white/[0.045] text-zinc-200"
                  >
                    {presetBusy === 'refresh' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    Refresh
                  </button>

                  {hasActivePresetSession ? (
                    <button
                      type="button"
                      onClick={() => {
                        onUnloadPreset();
                        setPhonePresetPickerOpen(false);
                      }}
                      disabled={isBusy}
                      className="col-span-2 border-amber-300/30 bg-amber-400/10 text-amber-100"
                    >
                      <XCircle size={15} />
                      {isImageRestoreSession ? 'Close' : 'Unload'} {presetSessionName}
                    </button>
                  ) : null}

                  <label className="col-span-2">
                    <span className="sr-only">Preset name</span>
                    <input
                      value={presetNameDraft}
                      onChange={(event) => setPresetNameDraft(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') onSavePreset();
                      }}
                      disabled={isBusy}
                      className="h-12 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm font-semibold text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-400/55 disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-600"
                      placeholder="Preset name"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      onSavePreset();
                      setPhonePresetPickerOpen(false);
                    }}
                    disabled={isBusy}
                    className="border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                  >
                    {presetBusy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={onDeletePreset}
                    disabled={!selectedPresetId || isBusy}
                    className="border-red-400/30 bg-red-500/10 text-red-100"
                  >
                    {presetBusy === 'delete' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    Delete
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <div
      data-umbra-powerprompter-preset-bar=""
      className="shrink-0 border-b border-white/5 bg-[#05070b]/88 px-3 py-2"
    >
      <div className="flex min-h-9 items-center gap-2 overflow-x-auto">
        <div className="shrink-0 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
          Presets
        </div>

        {globalSearchBoxRef && (
          <>
            <div className="h-7 w-px shrink-0 bg-white/10" />
            <div className="min-w-[220px] max-w-[360px] flex-1">
              <PowerPrompterGlobalSearchBox
                searchBoxRef={globalSearchBoxRef}
                query={globalSearchQuery || ''}
                suggestionsOpen={!!globalSearchSuggestionOpen}
                suggestionIndex={globalSearchSuggestionIndex || 0}
                suggestions={filteredGlobalSearchSuggestions || []}
                onQueryChange={setGlobalSearchQuery}
                onSuggestionsOpenChange={setGlobalSearchSuggestionOpen}
                onSuggestionIndexChange={setGlobalSearchSuggestionIndex}
                onSelect={(value) => {
                  applyGlobalSearchSelection?.(value);
                }}
              />
            </div>
            {String(globalSearchQuery || '').trim() ? (
              <button
                type="button"
                onClick={() => {
                  setGlobalSearchQuery?.('');
                  setGlobalSearchSuggestionOpen?.(false);
                }}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.045] px-2.5 text-zinc-300 transition-colors hover:border-white/30 hover:text-zinc-100"
                title="Clear prompt search"
              >
                <XCircle size={13} />
              </button>
            ) : null}
          </>
        )}

        <div className="relative min-w-[210px] max-w-[340px] flex-1">
          <select
            value={selectedPresetId || ''}
            onChange={(event) => setSelectedPresetId(String(event.currentTarget.value || ''))}
            disabled={!hasPresets || isBusy}
            className="h-9 w-full appearance-none rounded-lg border border-white/15 bg-white/[0.045] pl-3 pr-8 text-xs font-semibold text-zinc-200 outline-none transition-colors hover:border-white/25 disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-600"
            title={hasCurrentFile ? `Choose a preset for ${currentFileLabel || 'this card file'}` : 'Open or create a card file before choosing a preset'}
          >
            {!hasPresets ? (
              <option value="" style={{ color: '#71717a', backgroundColor: '#09090b' }}>
                {hasCurrentFile ? 'No presets for this file' : 'Open a card file'}
              </option>
            ) : null}
            {presets.map((preset: any) => (
              <option
                key={preset.id}
                value={preset.id}
                style={{ color: '#e4e4e7', backgroundColor: '#09090b' }}
              >
                {preset.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
          />
        </div>

        <button
          type="button"
          onClick={onLoadPreset}
          disabled={!hasCurrentFile || !selectedPresetId || isBusy}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
            !hasCurrentFile || !selectedPresetId || isBusy
              ? 'cursor-not-allowed border-white/10 bg-white/[0.025] text-zinc-600'
              : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/60'
          }`}
          title={hasCurrentFile ? 'Load the selected preset in the Preset Editor' : 'Open or create a card file before loading a preset'}
        >
          {presetBusy === 'load' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Load
        </button>

        {hasActivePresetSession ? (
          <div className="inline-flex h-9 shrink-0 items-center overflow-hidden rounded-lg border border-amber-300/35 bg-amber-400/10 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-100">
            <span className="max-w-[220px] truncate px-3" title={`${isImageRestoreSession ? 'Image Restore' : 'Preset Editor'}: ${presetSessionName}`}>
              {isImageRestoreSession ? 'Image Restore' : 'Preset Editor'}: {presetSessionName}
            </span>
            <button
              type="button"
              onClick={onUnloadPreset}
              disabled={isBusy}
              className={`inline-flex h-full items-center gap-1.5 border-l border-amber-200/20 px-2.5 transition-colors ${
                isBusy
                  ? 'cursor-not-allowed text-amber-100/45'
                  : 'text-amber-50 hover:bg-amber-300/15'
              }`}
              title={isImageRestoreSession ? 'Close restored image and return to the open card file' : 'Unload preset and restore the open card file'}
            >
              <XCircle size={13} />
              {isImageRestoreSession ? 'Close' : 'Unload'}
            </button>
          </div>
        ) : null}

        <div className="h-7 w-px shrink-0 bg-white/10" />

        <input
          value={presetNameDraft}
          onChange={(event) => setPresetNameDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onSavePreset();
            }
          }}
          disabled={!hasCurrentFile || isBusy}
          className="h-9 min-w-[180px] max-w-[320px] flex-1 rounded-lg border border-white/15 bg-black/30 px-3 text-xs font-semibold text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400/55 disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-600"
          placeholder="Preset name"
          title={hasActivePresetSession ? 'Name for saving this temporary preset setup' : 'Name for saving the current card setup as a preset'}
        />

        <button
          type="button"
          onClick={onSavePreset}
          disabled={!hasCurrentFile || isBusy}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
            !hasCurrentFile || isBusy
              ? 'cursor-not-allowed border-white/10 bg-white/[0.025] text-zinc-600'
              : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/60'
          }`}
          title={hasActivePresetSession ? 'Save this temporary setup as a preset' : 'Save the current card setup as a preset'}
        >
          {presetBusy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save
        </button>

        <button
          type="button"
          onClick={onDeletePreset}
          disabled={!selectedPresetId || isBusy}
          className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-2.5 transition-colors ${
            !selectedPresetId || isBusy
              ? 'cursor-not-allowed border-white/10 bg-white/[0.025] text-zinc-600'
              : 'border-red-400/30 bg-red-500/10 text-red-200 hover:border-red-300/55'
          }`}
          title="Delete the selected preset"
        >
          {presetBusy === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>

        <button
          type="button"
          onClick={onRefreshPresets}
          disabled={isBusy}
          className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-2.5 transition-colors ${
            isBusy
              ? 'cursor-not-allowed border-white/10 bg-white/[0.025] text-zinc-600'
              : 'border-white/15 bg-white/[0.045] text-zinc-300 hover:border-white/30 hover:text-zinc-100'
          }`}
          title="Refresh saved presets"
        >
          {presetBusy === 'refresh' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>
    </div>
  );
}
