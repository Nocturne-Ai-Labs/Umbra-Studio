'use client';

import React from 'react';

export type H3ForgeComputeDevice = 'cpu' | 'gpu';

const STORAGE_KEY = 'umbra:h3-forge-compute-device';

export function useH3ForgeComputeDevice() {
  const [device, setDevice] = React.useState<H3ForgeComputeDevice>('gpu');
  React.useEffect(() => {
    try { setDevice(window.localStorage.getItem(STORAGE_KEY) === 'cpu' ? 'cpu' : 'gpu'); }
    catch { /* Storage can be disabled. */ }
  }, []);
  const chooseDevice = React.useCallback((next: H3ForgeComputeDevice) => {
    setDevice(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage can be disabled. */ }
  }, []);
  return [device, chooseDevice] as const;
}

interface Props {
  value: H3ForgeComputeDevice;
  onChange: (value: H3ForgeComputeDevice) => void;
  disabled?: boolean;
}

export function UmbraH3ForgeDeviceControl({ value, onChange, disabled }: Props) {
  return <div className="flex items-center gap-2 text-xs text-zinc-400">
    <span>Local model compute</span>
    <div role="group" aria-label="Prompt Forge compute device" className="inline-flex overflow-hidden rounded border border-white/15">
      {(['gpu', 'cpu'] as const).map((device) => <button key={device} type="button"
        aria-pressed={value === device} disabled={disabled} onClick={() => onChange(device)}
        title={device === 'gpu' ? 'Run Llama on the GPU using PyTorch CUDA' : 'Run Llama on the CPU'}
        className={`min-h-8 min-w-14 px-2 font-medium disabled:opacity-40 ${value === device ? 'bg-fuchsia-400/20 text-fuchsia-100' : 'bg-black/25 text-zinc-400 hover:text-zinc-100'}`}>
        {device.toUpperCase()}
      </button>)}
    </div>
  </div>;
}
