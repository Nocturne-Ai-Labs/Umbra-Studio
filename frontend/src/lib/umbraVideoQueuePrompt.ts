import type { PowerPrompterVideoControls } from '@/types/powerPrompter';

export function resolveUmbraVideoQueueNegativePrompt(
  video: Pick<PowerPrompterVideoControls, 'family'>,
  negativePrompt: string,
): string {
  return video.family === 'minimax_h3' ? '' : String(negativePrompt || '').trim();
}
