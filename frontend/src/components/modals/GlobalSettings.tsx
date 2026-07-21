'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sliders,
  Bolt,
  Wand2,
  Code,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  Loader2,
  RotateCcw,
  Save,
  Plus,
  X,
  Settings as SettingsIcon,
  AlertTriangle,
  Palette
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeStudioSettings } from './ThemeStudioComponents';
import { useComponentDebug } from '@/hooks/useComponentDebug';
import { useStore } from '@/store/useStore';
import {
  applyThemeSettingsSnapshot,
  getThemeSettingsSnapshot,
} from '@/store/useThemeStore';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  AppSettings,
  COMFY_ATTENTION_BACKENDS,
  COMFY_SECURITY_LEVELS,
  DEFAULT_APP_SETTINGS,
  fetchAppSettingsFromBackend,
  loadAppSettings,
  normalizeAppSettings,
  pushAppSettingsToBackend,
  resetAppSettings,
  saveAppSettings,
} from '@/lib/appSettings';

interface GlobalSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ToolVersionCatalogResponse {
  available?: boolean;
  unavailableReason?: string | null;
  currentRef?: string;
  currentCommit?: string;
  versions?: ComfyVersionOption[];
  error?: string;
}

type SettingsSection =
  | 'general'
  | 'storage'
  | 'theme'
  | 'comfyui'
  | 'system'
  | 'advanced';

type Settings = AppSettings;
const defaultSettings: Settings = DEFAULT_APP_SETTINGS;

interface UmbraSettingsBundle {
  schemaVersion?: number;
  exportedAt?: string;
  appSettings?: Record<string, unknown>;
  powerPrompterSettings?: Record<string, unknown>;
  themeSettings?: Record<string, unknown> | null;
}

function parseThemeStorageSnapshot(): Record<string, unknown> | null {
  try {
    return getThemeSettingsSnapshot();
  } catch {
    return null;
  }
}

export function GlobalSettings({ isOpen, onClose }: GlobalSettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  useComponentDebug('GlobalSettings', { activeSection, isOpen });
  const [settings, setSettings] = useState<Settings>({ ...defaultSettings });

  // Load settings when modal opens to avoid stale state.
  useEffect(() => {
    if (!isOpen) return;
    loadSettings().catch(() => {});
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const loadSettings = async () => {
    try {
      const backend = await fetchAppSettingsFromBackend();
      const merged = backend
        ? normalizeAppSettings(backend)
        : loadAppSettings();
      setSettings(merged);
      saveAppSettings(merged, { broadcast: false, replace: true });
      useStore.getState().applyAppSettings(merged);
    } catch (err) {
      console.error('[GlobalSettings] Failed to load settings:', err);
    }
  };

  const saveSettings = async () => {
    try {
      const normalized = saveAppSettings(settings, { replace: true });
      const store = useStore.getState();
      store.applyAppSettings(normalized);

      try {
        await pushAppSettingsToBackend(normalized);
        await fetch('/api/settings/bundle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bundle: {
              schemaVersion: 1,
              appSettings: normalized,
              themeSettings: getThemeSettingsSnapshot(),
            },
          }),
        });
      } catch (syncError) {
        console.warn('[GlobalSettings] Failed to sync settings to backend:', syncError);
      }
      console.log('[GlobalSettings] Settings saved successfully');
      onClose();
    } catch (err) {
      console.error('[GlobalSettings] Failed to save settings:', err);
    }
  };

  const resetSettings = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      const reset = resetAppSettings();
      setSettings(reset);
      useStore.getState().applyAppSettings(reset);
      applyThemeSettingsSnapshot(null);
      void (async () => {
        try {
          await pushAppSettingsToBackend(reset);
          await fetch('/api/settings/bundle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bundle: {
                schemaVersion: 1,
                appSettings: reset,
                themeSettings: null,
              },
            }),
          });
        } catch (err) {
          console.warn('[GlobalSettings] Failed to sync reset settings to backend:', err);
        }
      })();
    }
  };

  const exportSettings = async () => {
    try {
      const response = await fetch('/api/settings/bundle', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const data = await response.json();
      const serverBundle = (data?.bundle && typeof data.bundle === 'object' && !Array.isArray(data.bundle))
        ? data.bundle as UmbraSettingsBundle
        : {};

      const themeSnapshot = parseThemeStorageSnapshot();
      const exportBundle: UmbraSettingsBundle = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        appSettings: normalizeAppSettings(serverBundle.appSettings || settings) as unknown as Record<string, unknown>,
        powerPrompterSettings: (serverBundle.powerPrompterSettings && typeof serverBundle.powerPrompterSettings === 'object')
          ? serverBundle.powerPrompterSettings
          : {},
        themeSettings: themeSnapshot ?? serverBundle.themeSettings ?? null,
      };

      const json = JSON.stringify(exportBundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'umbra-user-settings.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[GlobalSettings] Failed to export settings bundle:', err);
      alert('Failed to export settings. Check console for details.');
    }
  };

  const importSettings = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event: any) => {
        try {
          const parsed = JSON.parse(event.target.result || '{}');
          const parsedRecord = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            ? parsed as Record<string, unknown>
            : {};
          const isBundleShape =
            'appSettings' in parsedRecord ||
            'powerPrompterSettings' in parsedRecord ||
            'schemaVersion' in parsedRecord;

          const bundlePayload: UmbraSettingsBundle = isBundleShape
            ? {
                schemaVersion: Number(parsedRecord.schemaVersion) || 1,
                exportedAt: typeof parsedRecord.exportedAt === 'string' ? parsedRecord.exportedAt : undefined,
                appSettings: (parsedRecord.appSettings && typeof parsedRecord.appSettings === 'object' && !Array.isArray(parsedRecord.appSettings))
                  ? parsedRecord.appSettings as Record<string, unknown>
                  : {},
                powerPrompterSettings: (parsedRecord.powerPrompterSettings && typeof parsedRecord.powerPrompterSettings === 'object' && !Array.isArray(parsedRecord.powerPrompterSettings))
                  ? parsedRecord.powerPrompterSettings as Record<string, unknown>
                  : {},
                themeSettings: (parsedRecord.themeSettings && typeof parsedRecord.themeSettings === 'object' && !Array.isArray(parsedRecord.themeSettings))
                  ? parsedRecord.themeSettings as Record<string, unknown>
                  : null,
              }
            : {
                schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                appSettings: (
                  parsedRecord.settings &&
                  typeof parsedRecord.settings === 'object' &&
                  !Array.isArray(parsedRecord.settings)
                )
                  ? parsedRecord.settings as Record<string, unknown>
                  : parsedRecord,
                powerPrompterSettings: {},
                themeSettings: null,
              };

          const response = await fetch('/api/settings/bundle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bundle: bundlePayload }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || result?.success === false) {
            throw new Error(result?.error || `Import failed (${response.status})`);
          }

          const importedSettings = normalizeAppSettings(result?.settings || bundlePayload.appSettings || {});
          setSettings(importedSettings);
          saveAppSettings(importedSettings, { broadcast: false });
          useStore.getState().applyAppSettings(importedSettings);

          const importedTheme = (bundlePayload.themeSettings && typeof bundlePayload.themeSettings === 'object')
            ? bundlePayload.themeSettings
            : null;
          if (importedTheme) {
            applyThemeSettingsSnapshot(importedTheme);
            const shouldReload = confirm('Settings imported. Reload now to apply theme changes?');
            if (shouldReload) {
              window.location.reload();
              return;
            }
          }

          console.log('[GlobalSettings] Settings imported successfully');
        } catch (err) {
          console.error('[GlobalSettings] Failed to import settings:', err);
          alert('Failed to import settings. Check console for details.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const clearCache = () => {
    if (confirm('Clear all cache and temporary files? This will reload the page.')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  const wipeUserData = async () => {
    const confirmed = confirm(
      '⚠️ DANGER: This will permanently delete ALL user data including:\n\n' +
      '• All settings and preferences\n' +
      '• Theme customizations\n' +
      '• Saved paths and configurations\n' +
      '• Library cache and thumbnails\n' +
      '• All localStorage and sessionStorage data\n\n' +
      'This action CANNOT be undone. Are you sure?'
    );

    if (confirmed) {
      const doubleConfirm = confirm(
        'Are you ABSOLUTELY sure? Type "DELETE" in the next prompt to confirm.'
      );

      if (doubleConfirm) {
        const typed = prompt('Type DELETE to confirm:');
        if (typed === 'DELETE') {
          // Clear all browser storage
          localStorage.clear();
          sessionStorage.clear();

          // Clear IndexedDB databases
          try {
            const databases = await indexedDB.databases();
            for (const db of databases) {
              if (db.name) {
                indexedDB.deleteDatabase(db.name);
              }
            }
          } catch (err) {
            console.error('Failed to clear IndexedDB:', err);
          }

          // Clear cookies
          document.cookie.split(';').forEach(cookie => {
            document.cookie = cookie.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
          });

          alert('All user data has been wiped. The page will now reload.');
          window.location.reload();
        } else {
          alert('Wipe cancelled - confirmation text did not match.');
        }
      }
    }
  };

  const updateSetting = (key: keyof Settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const sections = [
    { id: 'general' as SettingsSection, name: 'General', icon: Sliders },
    { id: 'storage' as SettingsSection, name: 'Storage', icon: Save },
    { id: 'theme' as SettingsSection, name: 'Theme Studio', icon: Palette },
    { id: 'comfyui' as SettingsSection, name: 'ComfyUI', icon: Wand2 },
    { id: 'system' as SettingsSection, name: 'System Monitor', icon: Bolt },
    { id: 'advanced' as SettingsSection, name: 'Advanced', icon: Code },
  ];

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md animate-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        data-umbra-global-settings=""
        className="glass-panel relative w-[95%] max-w-[1400px] h-[95vh] flex flex-col overflow-hidden z-10 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--umbra-border)] flex-shrink-0 bg-black/20">
              <div className="flex items-center gap-3">
                <SettingsIcon className="text-[var(--umbra-accent)]" size={20} />
                <h2 className="text-xl font-semibold text-white">Umbra Studio Settings</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-[var(--umbra-accent)] hover:scale-110 text-zinc-400 hover:text-white transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body: Sidebar + Content */}
            <div data-umbra-settings-body="" className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <div data-umbra-settings-nav="" className="w-[220px] bg-black/20 border-r border-[var(--umbra-border)] p-2 overflow-y-auto custom-scrollbar flex-shrink-0">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all mb-1 rounded-lg",
                        activeSection === section.id
                          ? "bg-[var(--umbra-accent)]/20 text-white border border-[var(--umbra-accent)]/50"
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent"
                      )}
                    >
                      <Icon size={16} />
                      <span>{section.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Content */}
              <div data-umbra-settings-content="" className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {activeSection === 'general' && (
                  <GeneralSettings settings={settings} updateSetting={updateSetting} />
                )}
                {activeSection === 'storage' && (
                  <StorageSettings settings={settings} updateSetting={updateSetting} />
                )}
                {activeSection === 'theme' && (
                  <ThemeStudioSettings />
                )}
                {activeSection === 'comfyui' && (
                  <ComfyUISettings settings={settings} updateSetting={updateSetting} />
                )}
                {activeSection === 'system' && (
                  <SystemSettings settings={settings} updateSetting={updateSetting} />
                )}
                {activeSection === 'advanced' && (
                  <AdvancedSettings
                    settings={settings}
                    updateSetting={updateSetting}
                    exportSettings={exportSettings}
                    importSettings={importSettings}
                    clearCache={clearCache}
                    wipeUserData={wipeUserData}
                  />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--umbra-border)] bg-black/20 flex-shrink-0">
              <button
                onClick={resetSettings}
                className="glass-panel px-4 py-2 bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 text-sm font-medium transition-all flex items-center gap-2 hover:scale-105"
              >
                <RotateCcw size={14} />
                Reset to Defaults
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="glass-panel px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-sm font-medium transition-all hover:scale-105"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSettings}
                  className="glass-panel px-4 py-2 bg-[var(--umbra-accent)] hover:brightness-110 text-white text-sm font-medium transition-all flex items-center gap-2 hover:scale-105"
                >
                  <Save size={14} />
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
  );

  return createPortal(modalContent, document.body);
}

// Helper Components
const SettingGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <label className="block text-sm font-bold text-zinc-300">{label}</label>
    {children}
  </div>
);

const SettingHint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-zinc-500 mt-1">{children}</p>
);

const SettingInput = ({ value, onChange, placeholder, type = 'text', disabled = false }: any) => (
  <input
    type={type}
    value={value ?? ''}
    disabled={disabled}
    onChange={(e) => {
      if (type === 'number') {
        const raw = e.target.value;
        onChange(raw === '' ? undefined : Number(raw));
        return;
      }
      onChange(e.target.value);
    }}
    placeholder={placeholder}
    className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:border-[var(--umbra-accent)] outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  />
);

const SettingSelect = ({ value, onChange, options, disabled = false }: any) => (
  <select
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
    className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:border-[var(--umbra-accent)] outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {options.map((option: { value: string; label: string }) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const SettingsActionButton = ({ onClick, children, disabled = false }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </button>
);

const SettingCheckbox = ({ checked, onChange, label, description }: any) => (
  <label className="flex items-start gap-3 cursor-pointer group">
    <input
      type="checkbox"
      checked={checked || false}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 mt-0.5 accent-[var(--umbra-accent)] cursor-pointer"
    />
    <div className="flex-1">
      <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">{label}</span>
      {description && <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">{description}</p>}
    </div>
  </label>
);

// Section Components
const GeneralSettings = ({ settings, updateSetting }: any) => {
  useComponentDebug('GeneralSettings');
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white uppercase">General Settings</h3>

      <SettingGroup label="Preferences">
        <div className="space-y-2">
          <SettingCheckbox
            checked={settings.enableToasts}
            onChange={(val: boolean) => updateSetting('enableToasts', val)}
            label="Show toast notifications"
          />
        </div>
      </SettingGroup>

      <SettingGroup label="OLED Screen Saver">
        <div className="glass-panel p-4 bg-black/20 space-y-4">
          <SettingCheckbox
            checked={settings['oledMode.enabled']}
            onChange={(val: boolean) => updateSetting('oledMode.enabled', val)}
            label="Enable OLED screen saver"
            description="Converts the screen to greyscale when idle and app loses focus to prevent burn-in on OLED displays"
          />
          {settings['oledMode.enabled'] && (
            <div className="ml-7 space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Idle timeout (seconds)</label>
                <SettingInput
                  type="number"
                  value={settings['oledMode.idleTime']}
                  onChange={(val: number) => updateSetting('oledMode.idleTime', val)}
                  placeholder="120"
                />
              </div>
              <SettingHint>
                After this many seconds of inactivity AND when the app window loses focus,
                the display will fade to greyscale. Move your mouse or focus the window to restore colors.
              </SettingHint>
            </div>
          )}
        </div>
      </SettingGroup>

      <SettingGroup label="Idle Frame Cap">
        <div className="glass-panel p-4 bg-black/20 space-y-4">
          <SettingCheckbox
            checked={settings['ui.idleFrameCapEnabled']}
            onChange={(val: boolean) => updateSetting('ui.idleFrameCapEnabled', val)}
            label="Reduce app FPS while idle"
            description="Lowers the entire app's animation/render frame rate after inactivity to reduce idle GPU usage."
          />
          {settings['ui.idleFrameCapEnabled'] && (
            <div className="ml-7 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Idle timeout (seconds)</label>
                <SettingInput
                  type="number"
                  value={settings['ui.idleFrameCapIdleTime']}
                  onChange={(val: number) => updateSetting('ui.idleFrameCapIdleTime', val)}
                  placeholder="3"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Idle FPS cap</label>
                <SettingInput
                  type="number"
                  value={settings['ui.idleFrameCapFps']}
                  onChange={(val: number) => updateSetting('ui.idleFrameCapFps', val)}
                  placeholder="18"
                />
              </div>
              <div className="col-span-2">
                <SettingHint>
                  When the mouse and keyboard have been inactive for this long, Umbra caps renderer updates to the chosen FPS.
                  Activity restores normal frame flow immediately.
                </SettingHint>
              </div>
            </div>
          )}
        </div>
      </SettingGroup>
    </div>
  );
};

const StorageSettings = ({ settings, updateSetting }: any) => {
  useComponentDebug('StorageSettings');

  const toExternalRootsDraft = (roots: unknown): string[] => {
    if (!Array.isArray(roots)) return [''];
    const values = roots.map((entry) => String(entry ?? ''));
    return values.length > 0 ? values : [''];
  };

  const [externalRootsDraft, setExternalRootsDraft] = useState<string[]>(
    toExternalRootsDraft(settings['library.externalRoots'])
  );

  useEffect(() => {
    setExternalRootsDraft(toExternalRootsDraft(settings['library.externalRoots']));
  }, [settings['library.externalRoots']]);

  const commitExternalRoots = (rootsDraft: string[]) => {
    updateSetting('library.externalRoots', rootsDraft.map((entry) => String(entry ?? '')));
  };

  const syncExternalRootsDraft = (next: string[]) => {
    setExternalRootsDraft(next);
    commitExternalRoots(next);
  };

  const updateExternalRootDraft = (index: number, value: string) => {
    const next = [...externalRootsDraft];
    next[index] = value;
    syncExternalRootsDraft(next);
  };

  const addExternalRootField = () => {
    syncExternalRootsDraft([...externalRootsDraft, '']);
  };

  const removeExternalRootField = (index: number) => {
    const next = externalRootsDraft.filter((_, i) => i !== index);
    syncExternalRootsDraft(next.length > 0 ? next : ['']);
  };

  const clearAllExternalPaths = () => {
    updateSetting('comfyui.externalOutputPath', '');
    updateSetting('library.externalRoots', []);
    setExternalRootsDraft(['']);
    if (typeof window !== 'undefined') {
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white uppercase">Storage Settings</h3>

      <div className="glass-panel p-4 space-y-4">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Tool Root Directories</h4>

        <SettingGroup label="ComfyUI Root Directory">
          <SettingInput
            value={settings['comfyui.path']}
            onChange={(val: string) => updateSetting('comfyui.path', val)}
            placeholder="D:/Tools/ComfyUI"
          />
        </SettingGroup>

        <SettingGroup label="AI-Toolkit Root Directory">
          <SettingInput
            value={settings['aitoolkit.path']}
            onChange={(val: string) => updateSetting('aitoolkit.path', val)}
            placeholder="D:/Tools/AI-Toolkit"
          />
        </SettingGroup>

        <SettingGroup label="AI-Toolkit URL">
          <SettingInput
            value={settings['aitoolkit.url']}
            onChange={(val: string) => updateSetting('aitoolkit.url', val)}
            placeholder="http://127.0.0.1:8675"
          />
        </SettingGroup>

      </div>

      <div className="glass-panel p-4 space-y-4">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Library Roots</h4>

        <SettingGroup label="External Comfy Output Path (Optional)">
          <SettingInput
            value={settings['comfyui.externalOutputPath']}
            onChange={(val: string) => updateSetting('comfyui.externalOutputPath', val)}
            placeholder="D:/AI/Outputs"
          />
          <SettingHint>
            If set, Umbra save nodes and Output Browser can use this external output base path.
          </SettingHint>
        </SettingGroup>

        <SettingCheckbox
          checked={settings['library.showDefaultOutputRoot']}
          onChange={(val: boolean) => updateSetting('library.showDefaultOutputRoot', val)}
          label="Show built-in Comfy output root"
          description="When disabled and an external output path is set, Output Browser hides Tools/ComfyUI/output from root shortcuts."
        />

        <SettingCheckbox
          checked={settings['library.enableExternalRoots'] !== false}
          onChange={(val: boolean) => updateSetting('library.enableExternalRoots', val)}
          label="Enable additional external viewer roots"
          description="Turn this on to use custom external root folders in Output Browser."
        />

        <SettingGroup label="Additional External Viewer Roots">
          <div className="space-y-2">
            {externalRootsDraft.map((root, index) => (
              <div key={`external-root-${index}`} className="flex items-center gap-2">
                <SettingInput
                  value={root}
                  onChange={(val: string) => updateExternalRootDraft(index, val)}
                  placeholder={index === 0 ? 'D:/Archive/Images' : 'E:/Projects/Outputs'}
                  disabled={settings['library.enableExternalRoots'] === false}
                />
                <button
                  type="button"
                  onClick={() => removeExternalRootField(index)}
                  disabled={settings['library.enableExternalRoots'] === false}
                  className="px-2 py-2 rounded-md border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Remove path"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addExternalRootField}
                disabled={settings['library.enableExternalRoots'] === false}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-white/10 text-xs text-zinc-300 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={12} />
                Add Root Path
              </button>
              <button
                type="button"
                onClick={clearAllExternalPaths}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-red-500/30 text-xs text-red-300 hover:text-red-200 hover:border-red-400/50 transition-colors"
              >
                <Trash2 size={12} />
                Clear All External Paths
              </button>
            </div>
          </div>
          <SettingHint>
            Add any extra folders you want visible in Output Browser. Clear All removes the external output path and all extra roots.
          </SettingHint>
        </SettingGroup>
      </div>

      <div className="glass-panel p-4 space-y-4">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Trash Storage</h4>

        <SettingGroup label="Trash Storage Path (Optional)">
          <SettingInput
            value={settings['library.trashStoragePath']}
            onChange={(val: string) => updateSetting('library.trashStoragePath', val)}
            placeholder="D:/UmbraTrash"
          />
          <SettingHint>
            Keep `User/Trash` in the UI, but physically store trash files in another folder if you want.
          </SettingHint>
        </SettingGroup>

        <SettingGroup label="Delete Mode">
          <SettingSelect
            value={settings['library.deleteMode']}
            onChange={(val: string) => updateSetting('library.deleteMode', val)}
            options={[
              { value: 'umbra-trash', label: 'Umbra Trash' },
              { value: 'system-trash', label: 'OS Trash / Recycle Bin' },
              { value: 'permanent', label: 'Permanent Delete' },
            ]}
          />
        </SettingGroup>

        <SettingGroup label="Auto Delete Days">
          <SettingInput
            type="number"
            value={settings['library.trashAutoDeleteDays']}
            onChange={(val: number) => updateSetting('library.trashAutoDeleteDays', val)}
            placeholder="30"
          />
          <SettingHint>
            Items placed in Umbra Trash are permanently deleted after this many days.
          </SettingHint>
        </SettingGroup>
      </div>
    </div>
  );
};

interface ComfyVersionOption {
  ref: string;
  commit: string;
  date: string | null;
  subject: string | null;
}

type VersionManagedTool = 'comfyui';

const TOOL_VERSION_LABEL: Record<VersionManagedTool, string> = {
  comfyui: 'ComfyUI',
};

const TOOL_VERSION_WARNING: Record<VersionManagedTool, string> = {
  comfyui: 'Warning: Switching ComfyUI versions will uninstall all custom nodes not set to preinstall with Umbra Studio.',
};

const ToolVersionManager = ({
  tool,
  dependency,
}: {
  tool: VersionManagedTool;
  dependency: unknown;
}) => {
  const { showToast } = useStore();
  const toolLabel = TOOL_VERSION_LABEL[tool];
  const [versions, setVersions] = useState<ComfyVersionOption[]>([]);
  const [currentRef, setCurrentRef] = useState('');
  const [currentCommit, setCurrentCommit] = useState('');
  const [selectedRef, setSelectedRef] = useState('');
  const [versionError, setVersionError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const isRemoteClient = isUmbraRemoteClient();

  const loadVersions = React.useCallback(async () => {
    setIsLoading(true);
    setVersionError('');
    try {
      const response = await fetch(`/api/tools/${tool}/versions?limit=500`);
      const data = await response.json() as ToolVersionCatalogResponse;
      if (!response.ok) {
        throw new Error(data?.error || `Failed to load ${toolLabel} versions`);
      }
      if (data?.available === false) {
        setVersions([]);
        setCurrentRef('');
        setCurrentCommit('');
        setSelectedRef('');
        setVersionError(String(data?.unavailableReason || `${toolLabel} version switching is unavailable.`));
        return;
      }

      const nextVersions = Array.isArray(data?.versions) ? data.versions as ComfyVersionOption[] : [];
      const nextCurrentRef = String(data?.currentRef || '');
      const nextCurrentCommit = String(data?.currentCommit || '');
      setVersions(nextVersions);
      setCurrentRef(nextCurrentRef);
      setCurrentCommit(nextCurrentCommit);
      setSelectedRef((prev) => {
        const normalizedPrev = String(prev || '').trim();
        if (normalizedPrev && nextVersions.some((entry) => entry.ref === normalizedPrev)) {
          return normalizedPrev;
        }
        return nextCurrentRef || normalizedPrev;
      });
    } catch (error: any) {
      const message = error?.message || `Failed to load ${toolLabel} versions`;
      setVersions([]);
      setCurrentRef('');
      setCurrentCommit('');
      setVersionError(message);
    } finally {
      setIsLoading(false);
    }
  }, [tool, toolLabel]);

  useEffect(() => {
    loadVersions().catch(() => {});
  }, [dependency, loadVersions]);

  const formatVersionDate = (dateText: string | null) => {
    if (!dateText) return '';
    const parsed = new Date(dateText);
    if (Number.isNaN(parsed.getTime())) return dateText;
    return parsed.toLocaleString();
  };

  const handleSwitchVersion = async () => {
    const targetRef = String(selectedRef || '').trim();
    if (!targetRef || isSwitching) return;
    if (isRemoteClient) {
      setVersionError(`${toolLabel} version switching is only available from the host PC.`);
      return;
    }
    setIsSwitching(true);
    setVersionError('');
    try {
      const startRes = await fetch(`/api/tools/${tool}/version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: targetRef })
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData?.actionId) {
        throw new Error(startData?.error || `Failed to start ${toolLabel} version switch`);
      }

      const actionId = String(startData.actionId);
      let completed = false;
      while (!completed) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusRes = await fetch(`/api/tools/actions/${actionId}`);
        const statusData = await statusRes.json();
        if (!statusRes.ok) {
          throw new Error(statusData?.error || `Failed to read ${toolLabel} version switch status`);
        }
        if (statusData.status === 'completed') {
          completed = true;
          break;
        }
        if (statusData.status === 'failed') {
          const verifyFailure = statusData?.verifyFailure;
          const verifyMessage = verifyFailure?.nextSteps?.[0] || verifyFailure?.title;
          throw new Error(verifyMessage || statusData?.error || `${toolLabel} version switch failed`);
        }
      }

      showToast(`${toolLabel} switched to ${targetRef}`, 'success');
      await loadVersions();
    } catch (error: any) {
      const message = error?.message || `Failed to switch ${toolLabel} version`;
      setVersionError(message);
      showToast(message, 'error');
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <SettingGroup label="Portable Version Management">
      <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-zinc-300">
            Current: <span className="font-bold text-white">{currentRef || 'Unknown'}</span>
            {currentCommit && (
              <span className="ml-2 text-zinc-500">({currentCommit})</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => loadVersions()}
            disabled={isRemoteClient || isLoading || isSwitching}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={cn(isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        <select
          value={selectedRef}
          onChange={(event) => setSelectedRef(event.target.value)}
          disabled={isRemoteClient || isLoading || isSwitching || versions.length === 0}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-[var(--umbra-accent)] focus:outline-none disabled:opacity-40"
        >
          <option value="">Select {toolLabel} version...</option>
          {versions.map((version) => (
            <option key={`${version.ref}-${version.commit}`} value={version.ref}>
              {version.ref}
              {version.date ? ` • ${formatVersionDate(version.date)}` : ''}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleSwitchVersion}
          disabled={isRemoteClient || isLoading || isSwitching || !selectedRef || selectedRef === currentRef}
          className="inline-flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSwitching ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
          {isSwitching ? 'Switching Version...' : 'Switch / Downgrade to Selected Version'}
        </button>
        <div className="text-xs font-semibold text-red-400">
          {TOOL_VERSION_WARNING[tool]}
        </div>
        {(versionError || (selectedRef && selectedRef === currentRef)) && (
          <div className={`text-xs ${versionError ? 'text-red-400' : 'text-zinc-500'}`}>
            {versionError || 'Selected version is already active.'}
          </div>
        )}
      </div>
      <SettingHint>
        Lists available {toolLabel} git versions and switches to the selected reference using Umbra&apos;s managed tool installer.
      </SettingHint>
    </SettingGroup>
  );
};

const ComfyUISettings = ({ settings, updateSetting }: any) => {
  useComponentDebug('ComfyUISettings');
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white uppercase">ComfyUI Settings</h3>

      {/* Important Notice */}
      <div className="glass-panel p-4 bg-orange-500/10 border-orange-500/30">
        <h4 className="text-sm font-bold text-orange-400 uppercase tracking-wider mb-2">Setup Guide</h4>
        <p className="text-xs text-zinc-300 leading-relaxed">
          Storage paths now live in <strong>Settings &gt; Storage</strong>.
          Use this page for ComfyUI runtime, connection, security, and version management.
          <br /><br />
          Set your <strong>Server URL</strong> to the ComfyUI endpoint Umbra should connect to.
        </p>
      </div>

      <div className="glass-panel p-4 space-y-4">
        <h4 className="text-sm font-bold text-orange-400 uppercase tracking-wider">Runtime</h4>

        <SettingGroup label="Server URL">
          <SettingInput
            value={settings['comfyui.url']}
            onChange={(val: string) => updateSetting('comfyui.url', val)}
            placeholder="http://127.0.0.1:8188"
          />
          <SettingHint>Used for the embedded ComfyUI view and backend launch host/port</SettingHint>
        </SettingGroup>

        <SettingGroup label="ComfyUI Security Level">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {COMFY_SECURITY_LEVELS.map((level) => {
              const selected = settings['comfyui.securityLevel'] === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => updateSetting('comfyui.securityLevel', level)}
                  className={cn(
                    'px-3 py-2 rounded-md border text-xs font-bold uppercase tracking-wide transition-colors',
                    selected
                      ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/20 text-white'
                      : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:text-white'
                  )}
                >
                  {level}
                </button>
              );
            })}
          </div>
          <SettingHint>
            Writes <code className="bg-black/30 px-1 py-0.5 rounded">security_level</code> to ComfyUI Manager&apos;s
            <code className="bg-black/30 px-1 py-0.5 rounded ml-1">config.ini</code> on save and before launch.
          </SettingHint>
        </SettingGroup>

        <SettingGroup label="Attention Backend">
          <SettingSelect
            value={settings['comfyui.attentionBackend']}
            onChange={(val: string) => updateSetting('comfyui.attentionBackend', val)}
            options={COMFY_ATTENTION_BACKENDS.map((backend) => ({
              value: backend,
              label:
                backend === 'default'
                  ? 'Default (ComfyUI)'
                  : backend === 'sage'
                    ? 'Sage Attention'
                    : backend === 'flash'
                      ? 'Flash Attention'
                      : backend === 'pytorch'
                        ? 'PyTorch Cross Attention'
                        : backend === 'split'
                          ? 'Split Cross Attention'
                          : 'Quad Cross Attention',
            }))}
          />
          <SettingHint>
            Applied to ComfyUI launch arguments when Umbra starts/restarts ComfyUI. Default auto-uses Sage when SageAttention is installed.
          </SettingHint>
        </SettingGroup>

        <SettingGroup label="External Output Path (Optional)">
          <SettingInput
            value={settings['comfyui.externalOutputPath']}
            onChange={(val: string) => updateSetting('comfyui.externalOutputPath', val)}
            placeholder="/mnt/external/ComfyOutput"
          />
          <SettingHint>
            If set, Umbra save nodes and the Gallery can use this external output base path.
          </SettingHint>
        </SettingGroup>
        <SettingCheckbox
          checked={settings['comfyui.autoLaunch']}
          onChange={(val: boolean) => updateSetting('comfyui.autoLaunch', val)}
          label="Launch ComfyUI on startup"
        />

        <ToolVersionManager tool="comfyui" dependency={settings['comfyui.path']} />
      </div>

      <div className="glass-panel p-4 space-y-4">
        <h4 className="text-sm font-bold text-orange-400 uppercase tracking-wider">Options</h4>

        <SettingCheckbox
          checked={settings['comfyui.showFilmstrip']}
          onChange={(val: boolean) => updateSetting('comfyui.showFilmstrip', val)}
          label="Show filmstrip in generate view"
          description="Display recent generations in a filmstrip at the bottom"
        />
      </div>
    </div>
  );
};

const SystemSettings = ({ settings, updateSetting }: any) => {
  useComponentDebug('SystemSettings');
  const [availableDrives, setAvailableDrives] = React.useState<Array<{ path: string; name: string; type: string }>>([]);

  React.useEffect(() => {
    // Fetch available drives from the API
    fetch('/api/system/stats')
      .then(res => res.json())
      .then(data => {
        if (data.drives && Array.isArray(data.drives)) {
          setAvailableDrives(data.drives.map((d: any) => ({
            path: d.path,
            name: d.name,
            type: d.type || 'Unknown'
          })));
        }
      })
      .catch(err => console.error('Failed to fetch drives:', err));
  }, []);

  const visibleDrives = settings['system.visibleDrives'] || [];
  const monitorEnabled = settings['system.monitorEnabled'] !== false;
  const monitorGPU = settings['system.monitorGPU'] !== false;
  const monitorCPU = settings['system.monitorCPU'] !== false;
  const monitorRAM = settings['system.monitorRAM'] !== false;
  const monitorDrives = settings['system.monitorDrives'] !== false;

  const toggleDrive = (drivePath: string) => {
    const allDrivePaths = availableDrives.map((d) => d.path);
    const allSelected = visibleDrives.length === 0 || allDrivePaths.every((p) => visibleDrives.includes(p));

    if (allSelected) {
      const nextExplicit = allDrivePaths.filter((p) => p !== drivePath);
      updateSetting('system.visibleDrives', nextExplicit.length === allDrivePaths.length ? [] : nextExplicit);
      return;
    }

    const toggled = visibleDrives.includes(drivePath)
      ? visibleDrives.filter((p: string) => p !== drivePath)
      : [...visibleDrives, drivePath];

    updateSetting(
      'system.visibleDrives',
      toggled.length === allDrivePaths.length ? [] : toggled,
    );
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white uppercase">System Monitor</h3>

      <div className="glass-panel p-4 space-y-4">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Monitoring</h4>
        <div className="space-y-2">
          <SettingCheckbox
            checked={monitorEnabled}
            onChange={(val: boolean) => updateSetting('system.monitorEnabled', val)}
            label="Enable system monitor"
            description="Disable all live hardware polling and monitoring updates."
          />
          <SettingCheckbox
            checked={monitorGPU}
            onChange={(val: boolean) => updateSetting('system.monitorGPU', val)}
            label="Monitor GPU"
          />
          <SettingCheckbox
            checked={monitorCPU}
            onChange={(val: boolean) => updateSetting('system.monitorCPU', val)}
            label="Monitor CPU"
          />
          <SettingCheckbox
            checked={monitorRAM}
            onChange={(val: boolean) => updateSetting('system.monitorRAM', val)}
            label="Monitor RAM"
          />
          <SettingCheckbox
            checked={monitorDrives}
            onChange={(val: boolean) => updateSetting('system.monitorDrives', val)}
            label="Monitor Drives"
          />
        </div>
      </div>

      <div className={cn(
        "glass-panel p-4 space-y-4",
        (!monitorEnabled || !monitorDrives) && "opacity-50 pointer-events-none"
      )}>
        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Visible Drives</h4>
        <p className="text-[10px] text-zinc-400 leading-relaxed">
          Select which drives/partitions to display in the System Monitor. All drives are shown by default.
        </p>

        {availableDrives.length === 0 ? (
          <div className="text-[10px] text-zinc-500 italic p-3 bg-black/20 rounded">
            Loading available drives...
          </div>
        ) : (
          <div className="space-y-2">
            {availableDrives.map((drive) => (
              <label
                key={drive.path}
                className="flex items-center gap-3 p-2 rounded hover:bg-white/5 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={visibleDrives.length === 0 || visibleDrives.includes(drive.path)}
                  onChange={() => toggleDrive(drive.path)}
                  className="w-4 h-4 rounded border-white/10 bg-black/30 text-[var(--umbra-accent)] focus:ring-2 focus:ring-[var(--umbra-accent)]/50"
                />
                <div className="flex-1">
                  <div className="text-[11px] font-bold text-white">{drive.name}</div>
                  <div className="text-[9px] text-zinc-500">{drive.path} • {drive.type}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const AdvancedSettings = ({ settings, updateSetting, exportSettings, importSettings, clearCache, wipeUserData }: any) => {
  useComponentDebug('AdvancedSettings');
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white uppercase">Advanced Settings</h3>

      <SettingGroup label="Diagnostics">
        <SettingCheckbox
          checked={settings['advanced.diagnosticLogging']}
          onChange={(val: boolean) => updateSetting('advanced.diagnosticLogging', val)}
          label="Enable diagnostic logging"
          description="Turns on verbose console traces for gallery navigation, Power Prompter queues, debug telemetry, and performance probes. Leave this off for the polished app experience."
        />
      </SettingGroup>

      <SettingGroup label="Data Management">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportSettings}
            className="glass-panel px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-sm font-medium transition-all flex items-center gap-2"
          >
            <Download size={14} />
            Export Settings
          </button>
          <button
            onClick={importSettings}
            className="glass-panel px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-sm font-medium transition-all flex items-center gap-2"
          >
            <Upload size={14} />
            Import Settings
          </button>
          <button
            onClick={clearCache}
            className="glass-panel px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 text-sm font-medium transition-all flex items-center gap-2"
          >
            <Trash2 size={14} />
            Clear Cache
          </button>
        </div>
      </SettingGroup>

      {/* Danger Zone */}
      <div className="mt-8 pt-6 border-t border-red-500/20">
        <div className="glass-panel p-4 bg-red-500/10 border-red-500/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-red-500" />
            <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">Danger Zone</h4>
          </div>
          <p className="text-xs text-zinc-400 mb-4">
            These actions are irreversible and will permanently delete your data.
          </p>
          <button
            onClick={wipeUserData}
            className="glass-panel px-4 py-2 bg-red-500/20 hover:bg-red-500/40 border-red-500/50 text-red-400 hover:text-red-300 text-sm font-bold transition-all flex items-center gap-2"
          >
            <Trash2 size={14} />
            Wipe All User Data
          </button>
        </div>
      </div>
    </div>
  );
};



