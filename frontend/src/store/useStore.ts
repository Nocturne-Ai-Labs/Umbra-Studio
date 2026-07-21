import { create } from 'zustand';
import { debugMiddleware } from './debugMiddleware';
import { AppSettings, loadAppSettings, pushAppSettingsToBackend, saveAppSettings } from '@/lib/appSettings';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';
import { subscribeUiSession } from '@/lib/uiSessionSocket';
import {
  reconcileComfyLaunchRuntimeState,
  reduceComfyLaunchRuntimeState,
  type ComfyLaunchPhase,
} from '@/lib/comfyLaunchState';
import { useToastStore } from './useToastStore';

export type WorkspaceType = 'comfyui' | 'library' | 'modelmanager' | 'powerprompter' | 'umbraui' | 'imageinspector' | 'board' | 'remote' | 'localserver';

const SHARED_UI_SESSION_CONFIG_KEY = 'remote-ui-session';
const SHARED_UI_SESSION_POLL_MS = 15000;
const VALID_WORKSPACES: WorkspaceType[] = ['comfyui', 'library', 'modelmanager', 'powerprompter', 'umbraui', 'imageinspector', 'board', 'remote', 'localserver'];

interface SharedUiSession {
  activeWorkspace?: WorkspaceType;
  selectedLocalServerAppId?: string | null;
  updatedAt?: number;
  clientId?: string;
}

function normalizeWorkspace(value: unknown): WorkspaceType {
  const workspace = String(value || '').trim() === 'browser' ? 'comfyui' : String(value || '').trim();
  return (VALID_WORKSPACES as string[]).includes(workspace) ? workspace as WorkspaceType : 'umbraui';
}

function isPhoneRemoteClient(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const mode = document.documentElement.dataset.umbraRemoteMode || new URLSearchParams(window.location.search).get('remoteMode') || '';
  return mode === 'phone';
}

function isAuthoritativeRemoteClient(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.umbraRemoteClient === '1';
}

function createSharedUiClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export interface LogEntry {
  id: string;
  type: 'info' | 'warn' | 'error' | 'critical';
  message: string;
  timestamp: number;
}

export interface ToastNotification {
  message: string;
  type: 'success' | 'error';
}

interface AppState {
  activeWorkspace: WorkspaceType;
  setActiveWorkspace: (workspace: WorkspaceType) => void;
  selectedLocalServerAppId: string | null;
  setSelectedLocalServerAppId: (id: string | null) => void;

  // Connection Status (only for web service backends)
  connections: {
    comfyui: 'connected' | 'disconnected' | 'connecting';
  };
  setConnectionStatus: (backend: 'comfyui', status: 'connected' | 'disconnected' | 'connecting') => void;
  setComfyLaunchPhase: (phase: ComfyLaunchPhase) => void;

  // Backend readiness/health (port/service responding)
  backendReady: boolean;
  backendHealth: {
    comfyui: boolean;
  };

  // Booting state - tracks backends that are currently starting up
  // This persists across workspace switches to keep splash screens visible
  booting: {
    comfyui: boolean;
    comfyuiVersions: boolean;
    gallery: boolean;
  };
  setBooting: (backend: 'comfyui' | 'comfyuiVersions' | 'gallery', isBooting: boolean) => void;

  // Backend URLs (only for web service backends)
  urls: {
    comfyui: string;
  };
  appSettings: AppSettings;
  applyAppSettings: (settings: AppSettings) => void;
  setAppSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;

  // System Stats
  systemStats: {
    vramUsed: number;
    vramTotal: number;
    gpuName: string;
    gpuUsage: number;
    cpuUsage: number;
    ramUsed: number;
    ramTotal: number;
    updatedAt: number;
    sampleAgeMs: number;
    stale: boolean;
    refreshing: boolean;
  };
  updateSystemStats: (stats: Partial<AppState['systemStats']>) => void;

  // UI Toggles
  ui: {
    showFilmstrip: boolean;
    filmstripHeight: number;
    isAppBarCollapsed: boolean;
    showConsole: boolean;
    powerPrompterOverlayOpen: boolean;
    currentAlbumPath: string | null;
    currentAlbumImages: string[]; // Array of paths
    isEditorOpen: boolean;
    editorWidth: number;
    activeEditPath: string | null;
    scannedImportQueue: string[];
    lightboxOpen: boolean; // Track if lightbox is open
    imageInspectorTab: 'scanner' | 'waifu'; // Track active tab in Image Inspector
  };
  toggleUI: (key: keyof AppState['ui']) => void;
  setUI: (key: keyof AppState['ui'], value: any) => void;
  setCurrentAlbumPath: (path: string | null) => void;
  addScannedImport: (paths: string[]) => void;
  clearScannedImport: () => void;

  // Custom Ordering
  customOrders: Record<string, string[]>; // albumPath -> array of image paths
  setCustomOrder: (albumPath: string, order: string[]) => void;
  reorderImage: (albumPath: string, activeId: string, overId: string, currentImages: string[]) => void;

  // Favorites
  favorites: string[];
  toggleFavorite: (path: string) => void;

  // Logs
  logs: LogEntry[];
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;

  // Global Viewer
  viewer: {
    isOpen: boolean;
    currentIndex: number;
    images: any[];
  };
  openViewer: (images: any[], index: number) => void;
  setViewerIndex: (index: number) => void;
  closeViewer: () => void;

  // Toast Notifications
  toast: ToastNotification | null;
  showToast: (message: string, type: 'success' | 'error') => void;
  clearToast: () => void;

  // API Bridge Actions
  fetchSystemStatus: (options?: { force?: boolean }) => Promise<boolean>;
}

export const useStore = create<AppState>()(
  debugMiddleware(
    (set, get) => {
      let initialCustomOrders = {};
      let initialFavorites: string[] = [];
      let initialSettings: AppSettings = loadAppSettings();
      let systemStatusInFlight: Promise<boolean> | null = null;
      let lastSystemStatusAt = 0;
      let consecutiveSystemStatusFailures = 0;
      const SYSTEM_STATUS_MIN_INTERVAL_MS = 1500;
      const SYSTEM_STATUS_MIN_INTERVAL_GALLERY_MS = 12000;
      const SYSTEM_STATUS_MIN_INTERVAL_BACKGROUND_MS = 8000;
      const SYSTEM_STATUS_MIN_INTERVAL_HIDDEN_MS = 30000;
      const SYSTEM_STATUS_MIN_INTERVAL_FAILURE_BACKOFF_MS = 45000;
      const SYSTEM_STATUS_TIMEOUT_MS = 6000;
      const sharedUiClientId = createSharedUiClientId();
      let sharedUiSessionUpdatedAt = 0;
      let sharedUiSessionPollStarted = false;

      const shouldUseSharedUiSession = () => {
        const settings = get()?.appSettings || initialSettings;
        return typeof window !== 'undefined'
          && !isPhoneRemoteClient()
          && settings['remote.syncUiAcrossDevices'] !== false;
      };
      const shouldPublishSharedUiSession = () => shouldUseSharedUiSession() && !isAuthoritativeRemoteClient();
      const normalizeLocalServerAppId = (value: unknown) => String(value || '').trim() || null;
      const applySharedUiSession = (session: SharedUiSession | null | undefined) => {
        if (!shouldUseSharedUiSession() || !session || typeof session !== 'object') return;
        const updatedAt = Math.max(0, Math.floor(Number(session.updatedAt) || 0));
        if (updatedAt <= sharedUiSessionUpdatedAt) return;
        const activeWorkspace = normalizeWorkspace(session.activeWorkspace);
        sharedUiSessionUpdatedAt = updatedAt;
        set({
          activeWorkspace,
          selectedLocalServerAppId: normalizeLocalServerAppId(session.selectedLocalServerAppId),
        });
      };
      const persistSharedUiSession = (activeWorkspace: WorkspaceType, selectedLocalServerAppId: string | null = get()?.selectedLocalServerAppId || null) => {
        if (!shouldPublishSharedUiSession()) return;
        const updatedAt = Date.now();
        sharedUiSessionUpdatedAt = updatedAt;
        void writeUserConfig(SHARED_UI_SESSION_CONFIG_KEY, {
          activeWorkspace,
          selectedLocalServerAppId: normalizeLocalServerAppId(selectedLocalServerAppId),
          updatedAt,
          clientId: sharedUiClientId,
        } satisfies SharedUiSession).catch((error) => {
          console.warn('[useStore] Failed to persist shared UI session:', error);
        });
      };
      const startSharedUiSessionSync = () => {
        if (sharedUiSessionPollStarted || !shouldUseSharedUiSession()) return;
        sharedUiSessionPollStarted = true;
        subscribeUiSession((event) => {
          if (event.type === 'ui_session_state') {
            const session = event.sessions?.[SHARED_UI_SESSION_CONFIG_KEY];
            applySharedUiSession(session as SharedUiSession | null | undefined);
          } else if (event.key === SHARED_UI_SESSION_CONFIG_KEY) {
            applySharedUiSession(event.value as SharedUiSession | null | undefined);
          }
        });
        const readAndApply = () => {
          void readUserConfig<SharedUiSession | null>(SHARED_UI_SESSION_CONFIG_KEY, null)
            .then((session) => {
              if (session?.clientId === sharedUiClientId) return;
              applySharedUiSession(session);
            })
            .catch(() => undefined);
        };
        readAndApply();
        window.setInterval(readAndApply, SHARED_UI_SESSION_POLL_MS);
      };

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('umbralab_custom_orders');
          window.localStorage.removeItem('umbralab_favorites');
        } catch {
          // Legacy cleanup only.
        }
        initialSettings = loadAppSettings();
        startSharedUiSessionSync();
      }

      return {
        activeWorkspace: 'umbraui',
        selectedLocalServerAppId: null,
        setActiveWorkspace: (workspace) => {
          const activeWorkspace = normalizeWorkspace(workspace);
          persistSharedUiSession(activeWorkspace);
          set({ activeWorkspace });
        },
        setSelectedLocalServerAppId: (id) => {
          const selectedLocalServerAppId = normalizeLocalServerAppId(id);
          persistSharedUiSession('localserver', selectedLocalServerAppId);
          set({ activeWorkspace: 'localserver', selectedLocalServerAppId });
        },

        connections: {
          comfyui: 'disconnected',
        },
        setConnectionStatus: (backend, status) => set((state) => ({
          connections: { ...state.connections, [backend]: status }
        })),
        setComfyLaunchPhase: (phase) => set((state) => {
          const runtime = reduceComfyLaunchRuntimeState({
            connection: state.connections.comfyui,
            healthy: state.backendHealth.comfyui,
            booting: state.booting.comfyui,
          }, phase);
          return {
            connections: { ...state.connections, comfyui: runtime.connection },
            backendHealth: { ...state.backendHealth, comfyui: runtime.healthy },
            booting: { ...state.booting, comfyui: runtime.booting },
          };
        }),
        backendReady: false,
        backendHealth: {
          comfyui: false,
        },

        booting: {
          comfyui: false,
          comfyuiVersions: true,
          gallery: false,
        },
        setBooting: (backend, isBooting) => set((state) => ({
          booting: { ...state.booting, [backend]: isBooting }
        })),

        urls: {
          comfyui: initialSettings['comfyui.url'] || 'http://127.0.0.1:8188',
        },
        appSettings: initialSettings,
        applyAppSettings: (settings) => set((state) => ({
          appSettings: settings,
          logs: state.logs.slice(-(settings['advanced.consoleMaxLogs'] || 1000)),
            urls: {
              ...state.urls,
              comfyui: settings['comfyui.url'] || 'http://127.0.0.1:8188',
            },
          ui: {
            ...state.ui,
            showFilmstrip: settings['comfyui.showFilmstrip'] ?? state.ui.showFilmstrip,
          },
        })),
        setAppSetting: (key, value) => set((state) => {
          const nextSettings = saveAppSettings({ [key]: value });
          void pushAppSettingsToBackend(nextSettings).catch((error) => {
            console.warn('[useStore] Failed to persist app setting:', error);
          });
          return {
            appSettings: nextSettings,
            logs: state.logs.slice(-(nextSettings['advanced.consoleMaxLogs'] || 1000)),
            urls: {
              ...state.urls,
              comfyui: nextSettings['comfyui.url'] || 'http://127.0.0.1:8188',
            },
            ui: {
              ...state.ui,
              showFilmstrip: nextSettings['comfyui.showFilmstrip'] ?? state.ui.showFilmstrip,
            },
          };
        }),

        systemStats: {
          vramUsed: 0,
          vramTotal: 0,
          gpuName: 'N/A',
          gpuUsage: 0,
          cpuUsage: 0,
          ramUsed: 0,
          ramTotal: 0,
          updatedAt: 0,
          sampleAgeMs: 0,
          stale: true,
          refreshing: false,
        },
        updateSystemStats: (stats) => set((state) => ({
          systemStats: { ...state.systemStats, ...stats }
        })),

        ui: {
          showFilmstrip: initialSettings['comfyui.showFilmstrip'] ?? true,
          filmstripHeight: 0,
          isAppBarCollapsed: false,
          showConsole: false,
          powerPrompterOverlayOpen: false,
          currentAlbumPath: null,
          currentAlbumImages: [],
          isEditorOpen: false,
          editorWidth: 280,
          activeEditPath: null,
          scannedImportQueue: [],
          lightboxOpen: false,
          imageInspectorTab: 'scanner',
        },
        toggleUI: (key) => set((state) => ({
          ui: { ...state.ui, [key]: !state.ui[key] }
        })),
        setUI: (key, value) => set((state) => ({
          ui: { ...state.ui, [key]: value }
        })),
        setCurrentAlbumPath: (path) => set((state) => ({
          ui: { ...state.ui, currentAlbumPath: path }
        })),
        addScannedImport: (paths) => set((state) => ({
          ui: { ...state.ui, scannedImportQueue: [...state.ui.scannedImportQueue, ...paths] }
        })),
        clearScannedImport: () => set((state) => ({
          ui: { ...state.ui, scannedImportQueue: [] }
        })),

        customOrders: initialCustomOrders,
        setCustomOrder: (albumPath, order) => set((state) => {
          const updated = { ...state.customOrders, [albumPath]: order };
          void writeUserConfig('library-preferences', {
            customOrders: updated,
            favorites: state.favorites,
          }).catch((error) => console.warn('[useStore] Failed to persist custom orders:', error));
          return { customOrders: updated };
        }),
        reorderImage: (albumPath, activeId, overId, currentImages) => set((state) => {
          const order = state.customOrders[albumPath] || currentImages;
          const oldIndex = order.indexOf(activeId);
          const newIndex = order.indexOf(overId);

          if (oldIndex !== -1 && newIndex !== -1) {
            const newOrder = [...order];
            const [removed] = newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, removed);

            const updatedOrders = { ...state.customOrders, [albumPath]: newOrder };
            void writeUserConfig('library-preferences', {
              customOrders: updatedOrders,
              favorites: state.favorites,
            }).catch((error) => console.warn('[useStore] Failed to persist reordered images:', error));
            return { customOrders: updatedOrders };
          }
          return state;
        }),

        favorites: initialFavorites,
        toggleFavorite: (path) => set((state) => {
          const isFav = state.favorites.includes(path);
          const newFavorites = isFav
            ? state.favorites.filter(p => p !== path)
            : [...state.favorites, path];

          void writeUserConfig('library-preferences', {
            customOrders: state.customOrders,
            favorites: newFavorites,
          }).catch((error) => console.warn('[useStore] Failed to persist favorites:', error));
          return { favorites: newFavorites };
        }),

        logs: [],
        addLog: (entry) =>
          set((state) => {
            const newEntry = {
              ...entry,
              id: Math.random().toString(36).substring(7),
              timestamp: Date.now()
            };
            const maxLogs = state.appSettings['advanced.consoleMaxLogs'] || 1000;
            return { logs: [...state.logs, newEntry].slice(-maxLogs) };
          }),
        clearLogs: () => set({ logs: [] }),

        viewer: {
          isOpen: false,
          currentIndex: 0,
          images: [],
        },
        openViewer: (images, index) => set({
          viewer: { isOpen: true, images, currentIndex: index }
        }),
        setViewerIndex: (index) => set((state) => ({
          viewer: { ...state.viewer, currentIndex: index }
        })),
        closeViewer: () => set((state) => ({
          viewer: { ...state.viewer, isOpen: false }
        })),

        toast: null,
        showToast: (message, type) => {
          if (get().appSettings.enableToasts === false) return;
          useToastStore.getState().addToast({ message, type });
        },
        clearToast: () => {
          set({ toast: null });
        },

        fetchSystemStatus: async (options) => {
          const force = options?.force === true;
          if (systemStatusInFlight) {
            if (!force) return systemStatusInFlight;
            await systemStatusInFlight.catch(() => false);
          }

          const now = Date.now();
          const state = get();
          const inGalleryWorkspace = state.activeWorkspace === 'library' || state.activeWorkspace === 'modelmanager';
          const inBackgroundWorkspace = state.activeWorkspace === 'board' || state.activeWorkspace === 'imageinspector';
          const hasActiveBoot = Object.values(state.booting || {}).some(Boolean);
          const tabHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
          const hasFailureBackoff = consecutiveSystemStatusFailures >= 3 && !hasActiveBoot;
          const minIntervalMs = inGalleryWorkspace && !hasActiveBoot
            ? SYSTEM_STATUS_MIN_INTERVAL_GALLERY_MS
            : tabHidden
              ? SYSTEM_STATUS_MIN_INTERVAL_HIDDEN_MS
              : hasFailureBackoff
                ? SYSTEM_STATUS_MIN_INTERVAL_FAILURE_BACKOFF_MS
                : inBackgroundWorkspace && !hasActiveBoot
                  ? SYSTEM_STATUS_MIN_INTERVAL_BACKGROUND_MS
                  : SYSTEM_STATUS_MIN_INTERVAL_MS;
          const sinceLast = now - lastSystemStatusAt;
          if (!force && sinceLast > 0 && sinceLast < minIntervalMs) {
            return get().backendReady;
          }
          lastSystemStatusAt = now;

          systemStatusInFlight = (async () => {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), SYSTEM_STATUS_TIMEOUT_MS);
            try {
              const response = await fetch(`/api/umbrabridge/status?t=${Date.now()}&refresh=${force ? 'true' : 'false'}`, {
                cache: 'no-store',
                signal: controller.signal,
                headers: {
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache'
                }
              });
              if (!response.ok) throw new Error('API unreachable');

              const data = await response.json();
              const current = get();
              consecutiveSystemStatusFailures = 0;

              if (!current.backendReady) {
                set({ backendReady: true });
              }

              const comfyRuntime = reconcileComfyLaunchRuntimeState({
                connection: current.connections.comfyui,
                healthy: current.backendHealth.comfyui,
                booting: current.booting.comfyui,
              }, {
                running: data.backends?.comfyui?.running === true,
                healthy: data.backends?.comfyui?.healthy === true,
              });
              const newConnections = {
                comfyui: comfyRuntime.connection,
              };
              const newHealth = {
                comfyui: comfyRuntime.healthy,
              };
              const newBooting = {
                ...current.booting,
                comfyui: comfyRuntime.booting,
              };

              // Deep check connections
              if (
                newConnections.comfyui !== current.connections.comfyui) {
                set({ connections: newConnections });
              }
              if (
                newHealth.comfyui !== current.backendHealth.comfyui) {
                set({ backendHealth: newHealth });
              }
              if (
                newBooting.comfyui !== current.booting.comfyui
              ) {
                set({
                  booting: {
                    ...current.booting,
                    comfyui: newBooting.comfyui,
                  }
                });
              }

              const newStats = {
                vramUsed: data.vram?.used_gb || 0,
                vramTotal: data.vram?.total_gb || 0,
                gpuName: data.vram?.gpu_name || data.gpu_name || current.systemStats.gpuName || 'NVIDIA GPU',
                updatedAt: data.vram?.sampledAt ? Date.parse(data.vram.sampledAt) || current.systemStats.updatedAt : current.systemStats.updatedAt,
                sampleAgeMs: Math.max(0, Math.floor(Number(data.vram?.sampleAgeMs) || current.systemStats.sampleAgeMs || 0)),
                stale: typeof data.vram?.stale === 'boolean' ? data.vram.stale : current.systemStats.stale,
                refreshing: data.vram?.refreshing === true,
              };

              // Check if stats changed significantly (e.g. VRAM)
              if (
                newStats.vramUsed !== current.systemStats.vramUsed ||
                newStats.vramTotal !== current.systemStats.vramTotal ||
                newStats.updatedAt !== current.systemStats.updatedAt ||
                newStats.stale !== current.systemStats.stale ||
                newStats.refreshing !== current.systemStats.refreshing
              ) {
                set({ systemStats: { ...current.systemStats, ...newStats } });
              }
              return true;
            } catch (err) {
              const current = get();
              const isAbort = err instanceof DOMException && err.name === 'AbortError';
              if (isAbort) {
                return current.backendReady;
              }
              if (current.backendReady) {
                consecutiveSystemStatusFailures += 1;
                console.warn('[Store] Failed to fetch system status:', err);
                if (consecutiveSystemStatusFailures < 3) {
                  return current.backendReady;
                }
                set({
                  backendReady: false,
                  connections: {
                    comfyui: 'disconnected',
                  },
                  backendHealth: {
                    comfyui: false,
                  },
                  booting: {
                    comfyui: false,
                  },
                });
              }
              return false;
            } finally {
              window.clearTimeout(timeoutId);
              systemStatusInFlight = null;
            }
          })();

          return systemStatusInFlight;
        }
      };
    },
    'useStore'
  )
);

if (typeof window !== 'undefined') {
  void readUserConfig<{ customOrders?: Record<string, string[]>; favorites?: string[] }>('library-preferences', {})
    .then((preferences) => {
      useStore.setState({
        customOrders: preferences?.customOrders && typeof preferences.customOrders === 'object'
          ? preferences.customOrders
          : {},
        favorites: Array.isArray(preferences?.favorites) ? preferences.favorites : [],
      });
    })
    .catch(() => undefined);
}
