'use client';

export {
  classifyUmbraMediaMetadata,
  classifyUmbraPrompt,
  type UmbraPrivacyClass,
} from '../../../shared/nsfwPrivacyClassifier';

export interface UmbraPrivacyLockState {
  mode: 'off' | 'blur' | 'lock';
  unlockedUntil: number;
}

export const NSFW_PRIVACY_UNLOCK_DURATION_MS = 15 * 60 * 1000;

export function isUmbraPrivacyLocked(state: UmbraPrivacyLockState, now = Date.now()): boolean {
  return state.mode === 'lock' && state.unlockedUntil <= now;
}

export function normalizeFourDigitPin(value: unknown): string | null {
  const pin = String(value ?? '').trim();
  return /^\d{4}$/.test(pin) ? pin : null;
}

export async function hashUmbraPrivacyPin(pin: string, salt: string): Promise<string> {
  const normalizedPin = normalizeFourDigitPin(pin);
  if (!normalizedPin) throw new Error('Privacy PIN must contain exactly four digits.');
  const data = new TextEncoder().encode(`${salt}:${normalizedPin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createUmbraPrivacySalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createUmbraPrivacyCoverLabel(): string {
  return 'NSFW PREVIEW BLOCKED';
}
