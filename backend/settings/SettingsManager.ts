import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, resolve } from 'path';

export interface UmbraSettings {
    paths: {
        comfyui: string;
        galleryDl: string;
        dreambooth: string;
        datasets: string;
        outputs: string;
        models: string;
    };
    servers: {
        comfyui: { host: string; port: number };
        umbrabridge: { host: string; port: number };
    };
    training: {
        dreamboothPath: string;
    };
    app: Record<string, unknown>;
}

class SettingsManager {
    private settings: UmbraSettings;
    private settingsPath: string;
    private projectRoot: string;
    private bundledProjectRoot: string;
    private bundledSettingsPath: string;

    constructor() {
        this.bundledProjectRoot = resolve(__dirname, '../../');
        const runtimeRoot = String(process.env.UMBRA_ROOT || '').trim();
        this.projectRoot = runtimeRoot ? resolve(runtimeRoot) : this.bundledProjectRoot;
        this.settingsPath = join(this.projectRoot, 'User', 'Config', 'settings.json');
        this.bundledSettingsPath = join(this.bundledProjectRoot, 'User', 'Config', 'settings.json');
        this.migrateBundledSettingsIfNeeded();
        this.settings = this.loadSettings();
    }

    private migrateBundledSettingsIfNeeded() {
        if (this.projectRoot === this.bundledProjectRoot) return;
        if (existsSync(this.settingsPath)) return;
        if (!existsSync(this.bundledSettingsPath)) return;

        try {
            const configDir = join(this.projectRoot, 'User', 'Config');
            if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
            }
            copyFileSync(this.bundledSettingsPath, this.settingsPath);
        } catch (err) {
            console.warn('[SettingsManager] Failed to migrate bundled settings:', err);
        }
    }

    private resolveVariables(obj: any): any {
        if (typeof obj === 'string') {
            return obj.replace(/\${PROJECT_ROOT}/g, this.projectRoot);
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.resolveVariables(item));
        }
        if (typeof obj === 'object' && obj !== null) {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.resolveVariables(value);
            }
            return result;
        }
        return obj;
    }

    private toPortableVariables(obj: any): any {
        if (typeof obj === 'string') {
            return obj.replace(new RegExp(this.escapeRegExp(this.projectRoot), 'g'), '${PROJECT_ROOT}');
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.toPortableVariables(item));
        }
        if (typeof obj === 'object' && obj !== null) {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.toPortableVariables(value);
            }
            return result;
        }
        return obj;
    }

    private escapeRegExp(input: string): string {
        return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private buildDefaultSettings(): UmbraSettings {
        return {
            paths: {
                comfyui: join(this.projectRoot, 'Tools', 'ComfyUI'),
                galleryDl: 'gallery-dl',
                dreambooth: join(this.projectRoot, 'Tools', 'dreambooth'),
                datasets: join(this.projectRoot, 'User', 'Datasets'),
                outputs: join(this.projectRoot, 'User', 'Outputs'),
                models: join(this.projectRoot, 'User', 'Models')
            },
            servers: {
                comfyui: { host: '127.0.0.1', port: 8188 },
                umbrabridge: { host: '127.0.0.1', port: 8212 }
            },
            training: {
                dreamboothPath: join(this.projectRoot, 'Tools', 'dreambooth')
            },
            app: {}
        };
    }

    private mergeWithDefaults(settings: Partial<UmbraSettings>): UmbraSettings {
        const defaults = this.buildDefaultSettings();
        return {
            paths: {
                ...defaults.paths,
                ...(settings.paths || {})
            },
            servers: {
                comfyui: {
                    ...defaults.servers.comfyui,
                    ...(settings.servers?.comfyui || {})
                },
                umbrabridge: {
                    ...defaults.servers.umbrabridge,
                    ...(settings.servers?.umbrabridge || {})
                }
            },
            training: {
                ...defaults.training,
                ...(settings.training || {})
            },
            app: {
                ...defaults.app,
                ...((settings.app && typeof settings.app === 'object' && !Array.isArray(settings.app)) ? settings.app : {})
            }
        };
    }

    private loadSettings(): UmbraSettings {
        try {
            if (!existsSync(this.settingsPath)) {
                return this.createDefaultSettings();
            }

            const raw = readFileSync(this.settingsPath, 'utf-8');
            const parsed = JSON.parse(raw);
            const resolved = this.resolveVariables(parsed);
            const merged = this.mergeWithDefaults(resolved);

            // Self-heal sparse/missing config to keep schema consistent.
            this.saveSettings(merged);
            return merged;
        } catch (err) {
            console.error('[SettingsManager] Failed to load settings:', err);
            return this.createDefaultSettings();
        }
    }

    private createDefaultSettings(): UmbraSettings {
        const defaults = this.buildDefaultSettings();
        this.saveSettings(defaults);
        return defaults;
    }

    private saveSettings(settings: UmbraSettings) {
        try {
            const configDir = join(this.projectRoot, 'User', 'Config');
            if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
            }

            const portable = this.toPortableVariables(settings);
            const raw = JSON.stringify(portable, null, 2);
            writeFileSync(this.settingsPath, raw, 'utf-8');
        } catch (err) {
            console.error('[SettingsManager] Failed to save settings:', err);
        }
    }

    getSettings(): UmbraSettings {
        return this.settings;
    }

    getAppSettings(): Record<string, unknown> {
        return { ...(this.settings.app || {}) };
    }

    updateAppSettings(patch: Record<string, unknown>) {
        const safe = (patch && typeof patch === 'object' && !Array.isArray(patch))
            ? patch
            : {};
        this.settings.app = {
            ...(this.settings.app || {}),
            ...safe
        };
        this.saveSettings(this.settings);
    }
}

export const settingsManager = new SettingsManager();
