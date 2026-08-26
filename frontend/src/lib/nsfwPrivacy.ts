'use client';

export type UmbraPrivacyClass = 'normal' | 'nsfw';

export interface UmbraPrivacyLockState {
  engaged: boolean;
  engagedAt: number;
  minimumDurationMs: number;
  unlockedUntil: number;
}

export const NSFW_PRIVACY_MINIMUM_DURATION_MS = 10 * 60 * 1000;

const EXPLICIT_TOKEN_PATTERNS = [
  /\bnsfw\b/i,
  /\bexplicit(?:[_ -](?:action|content|rating|genital|nudity))?\b/i,
  /\bnude\b/i,
  /\bnudity\b/i,
  /\bnaked\b/i,
  /\btopless\b/i,
  /\bsex\b/i,
  /\berotic\b/i,
  /\bporn(?:ographic)?\b/i,
  /\bxxx\b/i,
];

export function classifyUmbraPrompt(prompt: unknown, tags: unknown[] = []): UmbraPrivacyClass {
  const haystack = [
    typeof prompt === 'string' ? prompt : '',
    ...tags.filter((tag): tag is string => typeof tag === 'string'),
  ].join(' ');
  return EXPLICIT_TOKEN_PATTERNS.some((pattern) => pattern.test(haystack)) ? 'nsfw' : 'normal';
}

export function isUmbraPrivacyLocked(state: UmbraPrivacyLockState, now = Date.now()): boolean {
  if (!state.engaged) return false;
  if (state.unlockedUntil > now) return false;
  return true;
}

export function canUnlockUmbraPrivacyLock(state: UmbraPrivacyLockState, now = Date.now()): boolean {
  if (!state.engaged) return true;
  return now - state.engagedAt >= state.minimumDurationMs;
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
