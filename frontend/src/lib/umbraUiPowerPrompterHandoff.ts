export const UMBRA_UI_POWER_PROMPTER_HANDOFF_KEY = 'umbra-ui:pending-power-prompter-handoff';
export const UMBRA_UI_POWER_PROMPTER_HANDOFF_EVENT = 'umbra:umbra-ui-power-prompter-handoff';

export interface UmbraUiPowerPrompterHandoff {
  version: 1;
  prompt: string;
  modelFamily: string;
  generation: Record<string, unknown>;
  sourceFile: string;
  createdAt: number;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeUmbraUiPowerPrompterHandoff(value: unknown): UmbraUiPowerPrompterHandoff | null {
  const source = normalizeRecord(value);
  const prompt = String(source.prompt || '').trim();
  const modelFamily = String(source.modelFamily || '').trim();
  if (!prompt || !modelFamily) return null;
  return {
    version: 1,
    prompt,
    modelFamily,
    generation: normalizeRecord(source.generation),
    sourceFile: String(source.sourceFile || '').trim(),
    createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : Date.now(),
  };
}

export function stageUmbraUiPowerPrompterHandoff(
  detail: Omit<UmbraUiPowerPrompterHandoff, 'version' | 'createdAt'>,
): UmbraUiPowerPrompterHandoff {
  const payload = normalizeUmbraUiPowerPrompterHandoff({
    ...detail,
    version: 1,
    createdAt: Date.now(),
  });
  if (!payload) throw new Error('The Power Prompter handoff is missing a prompt or model family.');
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.setItem(UMBRA_UI_POWER_PROMPTER_HANDOFF_KEY, JSON.stringify(payload)); } catch { /* best effort */ }
    window.dispatchEvent(new CustomEvent(UMBRA_UI_POWER_PROMPTER_HANDOFF_EVENT, { detail: payload }));
  }
  return payload;
}

export function takePendingUmbraUiPowerPrompterHandoff(): UmbraUiPowerPrompterHandoff | null {
  if (typeof window === 'undefined') return null;
  let stored = '';
  try {
    stored = window.sessionStorage.getItem(UMBRA_UI_POWER_PROMPTER_HANDOFF_KEY) || '';
    window.sessionStorage.removeItem(UMBRA_UI_POWER_PROMPTER_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!stored) return null;
  try {
    return normalizeUmbraUiPowerPrompterHandoff(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function clearPendingUmbraUiPowerPrompterHandoff(): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(UMBRA_UI_POWER_PROMPTER_HANDOFF_KEY); } catch { /* best effort */ }
}
