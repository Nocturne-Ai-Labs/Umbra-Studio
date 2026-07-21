import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, Globe2, Plus } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useStore } from '@/store/useStore';
import {
  getLocalServerFrameUrl,
  loadLocalServerApps,
  openLocalServerAppFolder,
  probeLocalServerUrl,
  type LocalServerApp,
  type LocalServerHealth,
} from '@/lib/localServerApps';
import { isUmbraRemoteClient } from '@/utils/hostOnly';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LocalServersSidebarSectionProps {
  active: boolean;
  navItemClass: (active: boolean, extra?: string) => string;
  auxButtonClass: string;
  onClosePhoneSidebar?: () => void;
}

function healthClass(status: LocalServerHealth): string {
  if (status === 'online') return 'bg-emerald-400 text-emerald-400';
  if (status === 'offline') return 'bg-red-400 text-red-400';
  return 'bg-zinc-600 text-zinc-600';
}

export const LocalServersSidebarSection = React.memo(({
  active,
  navItemClass,
  auxButtonClass,
  onClosePhoneSidebar,
}: LocalServersSidebarSectionProps) => {
  const selectedLocalServerAppId = useStore((state) => state.selectedLocalServerAppId);
  const setSelectedLocalServerAppId = useStore((state) => state.setSelectedLocalServerAppId);
  const [apps, setApps] = useState<LocalServerApp[]>([]);
  const [health, setHealth] = useState<Record<string, LocalServerHealth>>({});

  const selectedId = selectedLocalServerAppId || null;

  const reloadApps = useCallback(async () => {
    const loaded = await loadLocalServerApps().catch(() => []);
    setApps(loaded);
  }, []);

  useEffect(() => {
    void reloadApps();
    const onChanged = () => void reloadApps();
    window.addEventListener('umbra:local-server-apps-changed', onChanged);
    return () => window.removeEventListener('umbra:local-server-apps-changed', onChanged);
  }, [reloadApps]);

  useEffect(() => {
    if (apps.length === 0) {
      setHealth({});
      return;
    }
    let cancelled = false;
    const probeAll = async () => {
      const pairs = await Promise.all(apps.map(async (app) => [app.id, await probeLocalServerUrl(app.url)] as const));
      if (cancelled) return;
      setHealth((current) => {
        const next: Record<string, LocalServerHealth> = {};
        for (const [id, status] of pairs) next[id] = status;
        return { ...current, ...next };
      });
    };
    void probeAll();
    const timer = window.setInterval(() => void probeAll(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apps]);

  const sortedApps = useMemo(() => [...apps].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)), [apps]);

  const openSplash = useCallback(() => {
    setSelectedLocalServerAppId(null);
    onClosePhoneSidebar?.();
  }, [onClosePhoneSidebar, setSelectedLocalServerAppId]);

  const handleSelect = useCallback((app: LocalServerApp) => {
    setSelectedLocalServerAppId(app.id);
    onClosePhoneSidebar?.();
  }, [onClosePhoneSidebar, setSelectedLocalServerAppId]);

  const handleExternal = useCallback((event: React.MouseEvent, app: LocalServerApp) => {
    event.stopPropagation();
    window.open(getLocalServerFrameUrl(app.url, isUmbraRemoteClient()), '_blank', 'noopener,noreferrer');
  }, []);

  const handleOpenFolder = useCallback((event: React.MouseEvent, app: LocalServerApp) => {
    event.stopPropagation();
    if (!app.folderPath) return;
    void openLocalServerAppFolder(app.folderPath).catch(() => undefined);
  }, []);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={openSplash}
        className={navItemClass(active && !selectedId, 'w-full')}
        title="Open Local Servers"
      >
        <Globe2 size={14} />
        <span>Local Servers</span>
        <Plus size={12} className="ml-auto text-zinc-500" />
      </button>

      {sortedApps.map((app) => {
        const isSelected = active && selectedId === app.id;
        const status = health[app.id] || 'unknown';
        return (
          <div key={app.id} className="flex items-stretch gap-1 pl-3">
            <button
              type="button"
              onClick={() => handleSelect(app)}
              className={navItemClass(isSelected, 'min-w-0 flex-1')}
              title={app.url}
            >
              <span
                className={cn('h-1.5 w-1.5 rounded-full shadow-[0_0_5px_currentColor]', healthClass(status))}
                title={status === 'unknown' ? 'Status unknown' : status === 'online' ? 'Online' : 'Offline'}
              />
              <span className="truncate">{app.name}</span>
            </button>
            <button
              type="button"
              onClick={(event) => handleExternal(event, app)}
              className={auxButtonClass}
              title={`Open ${app.name} externally`}
              aria-label={`Open ${app.name} externally`}
            >
              <ExternalLink size={12} />
            </button>
            {app.folderPath ? (
              <button
                type="button"
                onClick={(event) => handleOpenFolder(event, app)}
                className={auxButtonClass}
                title={`Open ${app.name} folder`}
                aria-label={`Open ${app.name} folder`}
              >
                <FolderOpen size={12} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

LocalServersSidebarSection.displayName = 'LocalServersSidebarSection';
