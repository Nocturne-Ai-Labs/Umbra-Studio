'use client';

import type { BootTextVariant } from '@/store/useThemeStore';
import asciiBloodyText from '@/assets/boot-text-bloody.txt?raw';
import asciiPoisonText from '@/assets/boot-text-poison.txt?raw';
import asciiWhismyText from '@/assets/boot-text-whismy.txt?raw';
import asciiBlockyDotsText from '@/assets/boot-text-blocky-dots.txt?raw';

export const normalizeBootAsciiText = (text: string) => text.replace(/\r/g, '').replace(/\n$/, '');

export const BOOT_ASCII_LOGOS: Record<BootTextVariant, string> = {
  bloody: normalizeBootAsciiText(asciiBloodyText),
  poison: normalizeBootAsciiText(asciiPoisonText),
  whismy: normalizeBootAsciiText(asciiWhismyText),
  'blocky-dots': normalizeBootAsciiText(asciiBlockyDotsText),
};

export function getBootAsciiLogo(variant: BootTextVariant | undefined | null): string {
  if (!variant) return BOOT_ASCII_LOGOS.bloody;
  return BOOT_ASCII_LOGOS[variant] ?? BOOT_ASCII_LOGOS.bloody;
}
