/**
 * Main App Component
 * Migrated from Next.js app router to standard React + React Router
 */

import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { StudioShell } from '@/components/layout/StudioShell';
import { DebugErrorBoundary } from '@/components/debug/DebugErrorBoundary';
import { ModalProvider } from '@/contexts/ModalContext';
import { DuplicateModalProvider } from '@/components/providers/DuplicateModalProvider';
import { Toaster } from '@/components/ui/Toaster';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { IdleFrameCap } from '@/components/ui/IdleFrameCap';
import { PowerPrompter } from '@/components/layout/PowerPrompter';
import { RemoteAuthGate } from '@/components/layout/RemoteAuthGate';
import { RemoteTelemetryProbe } from '@/components/perf/RemoteTelemetryProbe';

const LAZY_CHUNK_RELOAD_PREFIX = 'umbra.lazyChunkReload.';

async function importWithChunkRecovery<T>(key: string, importer: () => Promise<T>): Promise<T> {
  try {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`${LAZY_CHUNK_RELOAD_PREFIX}${key}`);
      } catch {
        // ignore sessionStorage access failures
      }
    }
    return await importer();
  } catch (error: any) {
    const message = String(error?.message || error || '');
    const isChunkLoadFailure = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(message);
    if (typeof window !== 'undefined' && isChunkLoadFailure) {
      const storageKey = `${LAZY_CHUNK_RELOAD_PREFIX}${key}`;
      let alreadyRetried = false;
      try {
        alreadyRetried = window.sessionStorage.getItem(storageKey) === '1';
      } catch {
        alreadyRetried = false;
      }
      if (!alreadyRetried) {
        try {
          window.sessionStorage.setItem(storageKey, '1');
        } catch {
          // ignore sessionStorage access failures
        }
        window.location.reload();
        return new Promise<T>(() => undefined);
      }
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // ignore sessionStorage access failures
      }
    }
    throw error;
  }
}

const Workspace = lazy(async () => {
  const module = await importWithChunkRecovery('workspace', () => import('@/components/layout/Workspace'));
  return { default: module.Workspace };
});

const ConsoleViewer = lazy(async () => {
  const module = await importWithChunkRecovery('console-viewer', () => import('@/components/modals/ConsoleViewer'));
  return { default: module.ConsoleViewer };
});

const ReactGalleryWorkspace = lazy(async () => {
  const module = await importWithChunkRecovery('react-gallery', () => import('@/components/layout/ReactGalleryWorkspace'));
  return { default: module.ReactGalleryWorkspace };
});

const AppLoadingFallback = ({ fullscreen = false }: { fullscreen?: boolean }) => (
  <div className={fullscreen ? 'h-screen w-screen bg-[var(--umbra-bg)]' : 'absolute inset-0 bg-[var(--umbra-bg)]'} />
);

export function App() {
  const popoutMode = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('umbraPopout')
    : null;

  if (popoutMode === 'powerprompter') {
    return (
      <ThemeProvider>
        <DebugErrorBoundary>
          <ModalProvider>
            <DuplicateModalProvider>
              <IdleFrameCap />
              <RemoteAuthGate>
                <RemoteTelemetryProbe />
                <div className="h-screen w-screen bg-[var(--umbra-bg)] overflow-hidden">
                  <Suspense fallback={<AppLoadingFallback fullscreen />}>
                    <PowerPrompter />
                  </Suspense>
                </div>
              </RemoteAuthGate>
              <Toaster />
            </DuplicateModalProvider>
          </ModalProvider>
        </DebugErrorBoundary>
      </ThemeProvider>
    );
  }

  if (popoutMode === 'library') {
    return (
      <ThemeProvider>
        <DebugErrorBoundary>
          <ModalProvider>
            <DuplicateModalProvider>
              <IdleFrameCap />
              <RemoteAuthGate>
                <RemoteTelemetryProbe />
                <div className="h-screen w-screen bg-[var(--umbra-bg)] overflow-hidden">
                  <Suspense fallback={<AppLoadingFallback fullscreen />}>
                    <ReactGalleryWorkspace />
                  </Suspense>
                </div>
              </RemoteAuthGate>
              <Toaster />
            </DuplicateModalProvider>
          </ModalProvider>
        </DebugErrorBoundary>
      </ThemeProvider>
    );
  }

  return (
    <DebugErrorBoundary>
      <ModalProvider>
        <DuplicateModalProvider>
          <IdleFrameCap />
          <RemoteAuthGate>
            <RemoteTelemetryProbe />
            <BrowserRouter>
              <StudioShell>
                <Suspense fallback={<AppLoadingFallback />}>
                  <Routes>
                    {/* Main workspace */}
                    <Route path="/" element={<Workspace />} />

                    {/* Console page */}
                    <Route
                      path="/console"
                      element={
                        <div className="h-screen w-screen bg-[#050508] p-4">
                          <ConsoleViewer />
                        </div>
                      }
                    />
                  </Routes>
                </Suspense>
              </StudioShell>
              <Toaster />
            </BrowserRouter>
          </RemoteAuthGate>
        </DuplicateModalProvider>
      </ModalProvider>
    </DebugErrorBoundary>
  );
}
