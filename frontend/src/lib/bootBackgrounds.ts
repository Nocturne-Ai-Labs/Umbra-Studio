export type BootImageBackground = {
  id: string;
  name: string;
  src: string;
};

export const BOOT_IMAGE_BACKGROUND_RANDOM_ID = 'random';

export const BOOT_IMAGE_BACKGROUNDS: BootImageBackground[] = [
  { id: 'sky-harbor', name: 'Sky Harbor', src: '/assets/boot-backgrounds/sky-harbor.png' },
  { id: 'moonlit-citadel', name: 'Moonlit Citadel', src: '/assets/boot-backgrounds/moonlit-citadel.png' },
  { id: 'rainy-city-mural', name: 'Rainy City Mural', src: '/assets/boot-backgrounds/rainy-city-mural.png' },
  { id: 'arcane-workshop', name: 'Arcane Workshop', src: '/assets/boot-backgrounds/arcane-workshop.png' },
  { id: 'garden-overlook', name: 'Garden Overlook', src: '/assets/boot-backgrounds/garden-overlook.png' },
  { id: 'orbital-lounge', name: 'Orbital Lounge', src: '/assets/boot-backgrounds/orbital-lounge.png' },
  { id: 'neon-arcade', name: 'Neon Arcade', src: '/assets/boot-backgrounds/neon-arcade.png' },
  { id: 'riverside-mural', name: 'Riverside Mural', src: '/assets/boot-backgrounds/riverside-mural.png' },
  { id: 'deep-sea-atelier', name: 'Deep Sea Atelier', src: '/assets/boot-backgrounds/deep-sea-atelier.png' },
  { id: 'sunset-surf-shop', name: 'Sunset Surf Shop', src: '/assets/boot-backgrounds/sunset-surf-shop.png' },
  { id: 'alpine-village', name: 'Alpine Village', src: '/assets/boot-backgrounds/alpine-village.png' },
  { id: 'jungle-relic', name: 'Jungle Relic', src: '/assets/boot-backgrounds/jungle-relic.png' },
  { id: 'desert-diner', name: 'Desert Diner', src: '/assets/boot-backgrounds/desert-diner.png' },
  { id: 'sakura-alley', name: 'Sakura Alley', src: '/assets/boot-backgrounds/sakura-alley.png' },
  { id: 'fuji-overlook', name: 'Fuji Overlook', src: '/assets/boot-backgrounds/fuji-overlook.png' },
  { id: 'neon-festival', name: 'Neon Festival', src: '/assets/boot-backgrounds/neon-festival.png' },
  { id: 'midnight-video-store', name: 'Midnight Video Store', src: '/assets/boot-backgrounds/midnight-video-store.png' },
  { id: 'magical-witch-minokai', name: 'Magical Witch Minokai', src: '/assets/boot-backgrounds/magical-witch-minokai.png' },
];

export function getBootImageBackground(id: string | undefined | null, randomIndex = 0): BootImageBackground | null {
  if (BOOT_IMAGE_BACKGROUNDS.length === 0) return null;
  if (!id || id === BOOT_IMAGE_BACKGROUND_RANDOM_ID) {
    return BOOT_IMAGE_BACKGROUNDS[Math.abs(randomIndex) % BOOT_IMAGE_BACKGROUNDS.length] ?? null;
  }
  return BOOT_IMAGE_BACKGROUNDS.find((background) => background.id === id) ?? BOOT_IMAGE_BACKGROUNDS[0] ?? null;
}
