export interface MangaAnimation { speed: number; loop: boolean; trigger: 'visible' | 'hover' }
export const defaultMangaAnimation = (): MangaAnimation => ({speed:1,loop:true,trigger:'visible'});
export function parseMangaAnimation(value:unknown):MangaAnimation {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid Manga animation settings.');
  const raw=value as Record<string,unknown>;
  if(typeof raw.speed!=='number' || !Number.isFinite(raw.speed) || raw.speed<=0 || raw.speed>100 || typeof raw.loop!=='boolean' || !['visible','hover'].includes(String(raw.trigger))) throw new Error('Invalid Manga animation settings.');
  return {speed:raw.speed,loop:raw.loop,trigger:raw.trigger as MangaAnimation['trigger']};
}
