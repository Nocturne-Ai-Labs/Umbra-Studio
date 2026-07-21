import type { PowerPrompterCardNode, PowerPrompterCardType } from '@/types/powerPrompter';
import { deleteUserConfig, readUserConfig, writeUserConfig } from '@/lib/userConfig';

export type PowerPrompterCardClipboardMode = 'copy' | 'cut';

export interface PowerPrompterCardClipboardPayload {
  version: 1;
  mode: PowerPrompterCardClipboardMode;
  sourceFile: string | null;
  createdAt: string;
  slot: {
    slotId: string;
    type: PowerPrompterCardType;
    label: string;
    variants: PowerPrompterCardNode[];
  };
}

const POWER_PROMPTER_CARD_CLIPBOARD_KEY = 'umbra.powerprompter.cardClipboard';
const POWER_PROMPTER_CARD_CLIPBOARD_CONFIG_KEY = 'powerprompter-card-clipboard';
const POWER_PROMPTER_CARD_CLIPBOARD_EVENT = 'umbra:powerprompter-card-clipboard';
let clipboardCache: PowerPrompterCardClipboardPayload | null = null;
let clipboardLoaded = false;
let clipboardLoadPromise: Promise<void> | null = null;

function canUseWindow() {
  return typeof window !== 'undefined';
}

function emitClipboardUpdate(payload: PowerPrompterCardClipboardPayload | null) {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(POWER_PROMPTER_CARD_CLIPBOARD_EVENT, {
    detail: payload,
  }));
}

function clearLegacyClipboardStorage() {
  if (!canUseWindow()) return;
  try {
    window.localStorage.removeItem(POWER_PROMPTER_CARD_CLIPBOARD_KEY);
  } catch {
    // Legacy cleanup only.
  }
}

function isValidPayload(raw: unknown): raw is PowerPrompterCardClipboardPayload {
  if (!raw || typeof raw !== 'object') return false;
  const payload = raw as Partial<PowerPrompterCardClipboardPayload>;
  if (payload.version !== 1) return false;
  if (payload.mode !== 'copy' && payload.mode !== 'cut') return false;
  if (!payload.slot || typeof payload.slot !== 'object') return false;
  if (!Array.isArray(payload.slot.variants)) return false;
  return true;
}

export function readPowerPrompterCardClipboard(): PowerPrompterCardClipboardPayload | null {
  clearLegacyClipboardStorage();
  if (!clipboardLoaded) void loadPowerPrompterCardClipboard();
  return clipboardCache;
}

export function writePowerPrompterCardClipboard(payload: PowerPrompterCardClipboardPayload) {
  clipboardLoaded = true;
  clipboardCache = payload;
  clearLegacyClipboardStorage();
  void writeUserConfig(POWER_PROMPTER_CARD_CLIPBOARD_CONFIG_KEY, payload).catch((error) => {
    console.warn('[PowerPrompterClipboard] Failed to persist clipboard:', error);
  });
  emitClipboardUpdate(payload);
}

export function clearPowerPrompterCardClipboard() {
  clipboardLoaded = true;
  clipboardCache = null;
  clearLegacyClipboardStorage();
  void deleteUserConfig(POWER_PROMPTER_CARD_CLIPBOARD_CONFIG_KEY).catch((error) => {
    console.warn('[PowerPrompterClipboard] Failed to clear clipboard:', error);
  });
  emitClipboardUpdate(null);
}

export function loadPowerPrompterCardClipboard(): Promise<void> {
  if (clipboardLoadPromise) return clipboardLoadPromise;
  clipboardLoadPromise = readUserConfig<unknown>(POWER_PROMPTER_CARD_CLIPBOARD_CONFIG_KEY, null)
    .then((payload) => {
      clipboardLoaded = true;
      clipboardCache = isValidPayload(payload) ? payload : null;
      clearLegacyClipboardStorage();
      emitClipboardUpdate(clipboardCache);
    })
    .finally(() => {
      clipboardLoadPromise = null;
    });
  return clipboardLoadPromise;
}

export function subscribePowerPrompterCardClipboard(
  listener: (payload: PowerPrompterCardClipboardPayload | null) => void
) {
  if (!canUseWindow()) return () => undefined;
  void loadPowerPrompterCardClipboard();
  const handleEvent = (event: Event) => {
    const custom = event as CustomEvent<PowerPrompterCardClipboardPayload | null>;
    listener(custom.detail ?? readPowerPrompterCardClipboard());
  };

  window.addEventListener(POWER_PROMPTER_CARD_CLIPBOARD_EVENT, handleEvent as EventListener);

  return () => {
    window.removeEventListener(POWER_PROMPTER_CARD_CLIPBOARD_EVENT, handleEvent as EventListener);
  };
}
