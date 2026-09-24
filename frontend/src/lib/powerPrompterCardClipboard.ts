import type { PowerPrompterCardNode, PowerPrompterCardType } from '@/types/powerPrompter';
import { deleteUserConfig, readUserConfig, writeUserConfig } from '@/lib/userConfig';

export type PowerPrompterCardClipboardMode = 'copy' | 'cut';

export interface PowerPrompterCardClipboardPayload {
  version: 1;
  mode: PowerPrompterCardClipboardMode;
  sourceFile: string | null;
  sourceFingerprint?: string;
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
let clipboardRevision = 0;
let clipboardWriteQueue: Promise<void> = Promise.resolve();

export function getPowerPrompterCardSlotFingerprint(cards: PowerPrompterCardNode[], slotId: string): string {
  const variants = cards.filter((card) => card.slotId === slotId)
    .slice().sort((left, right) => left.order - right.order)
    .map(({ order: _order, ...card }) => card);
  // Object property order can change after a save; only content and variant order matter.
  const stableValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]));
    }
    return value;
  };
  return JSON.stringify(stableValue(variants));
}

export function canRemovePowerPrompterCutSource(
  cards: PowerPrompterCardNode[],
  payload: PowerPrompterCardClipboardPayload,
): boolean {
  return payload.mode === 'cut' && Boolean(payload.sourceFingerprint)
    && cards.some((card) => card.slotId === payload.slot.slotId)
    && getPowerPrompterCardSlotFingerprint(cards, payload.slot.slotId) === payload.sourceFingerprint;
}

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
  clipboardRevision += 1;
  clipboardLoaded = true;
  clipboardCache = payload;
  clearLegacyClipboardStorage();
  clipboardWriteQueue = clipboardWriteQueue
    .then(() => writeUserConfig(POWER_PROMPTER_CARD_CLIPBOARD_CONFIG_KEY, payload))
    .catch((error) => {
      console.warn('[PowerPrompterClipboard] Failed to persist clipboard:', error);
    });
  emitClipboardUpdate(payload);
}

export function clearPowerPrompterCardClipboard(expectedPayload?: PowerPrompterCardClipboardPayload) {
  if (expectedPayload && clipboardCache !== expectedPayload) return;
  clipboardRevision += 1;
  clipboardLoaded = true;
  clipboardCache = null;
  clearLegacyClipboardStorage();
  clipboardWriteQueue = clipboardWriteQueue
    .then(() => deleteUserConfig(POWER_PROMPTER_CARD_CLIPBOARD_CONFIG_KEY))
    .catch((error) => {
      console.warn('[PowerPrompterClipboard] Failed to clear clipboard:', error);
    });
  emitClipboardUpdate(null);
}

export function loadPowerPrompterCardClipboard(): Promise<void> {
  if (clipboardLoadPromise) return clipboardLoadPromise;
  const revision = clipboardRevision;
  clipboardLoadPromise = clipboardWriteQueue
    .then(() => readUserConfig<unknown>(POWER_PROMPTER_CARD_CLIPBOARD_CONFIG_KEY, null))
    .then((payload) => {
      if (revision !== clipboardRevision) return;
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
