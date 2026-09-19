import { classifyUmbraPrompt } from '@/lib/nsfwPrivacy';
import type { BooruPost } from './types';

export function isProtectedBooruPost(post: BooruPost | undefined): boolean {
  return !!post && (post.rating !== 'safe' || classifyUmbraPrompt(post.tags.join(', ')) === 'nsfw');
}
