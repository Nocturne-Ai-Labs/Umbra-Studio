import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fetchDanbooruPosts,
  fetchE621Posts,
  fetchGelbooruPosts,
  fetchRule34Posts,
  loadApiKeys,
} from '../backend/booruApi';

const root = process.cwd();
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const config = await loadApiKeys(join(root, 'User', 'Config', 'api-keys.json'));
const sources = [
  { id: 'danbooru', run: () => fetchDanbooruPosts('1girl', 3, 1, config.danbooru) },
  { id: 'gelbooru', run: () => fetchGelbooruPosts('1girl', 3, 1, config.gelbooru) },
  { id: 'rule34', run: () => fetchRule34Posts('1girl', 3, 1, config.rule34) },
  { id: 'e621', run: () => fetchE621Posts('1girl', 3, 1, config.e621) },
];

let failures = 0;
for (const source of sources) {
  try {
    const posts = await source.run();
    if (posts.length === 0) throw new Error('search returned no posts');
    const mediaUrl = posts[0].url || posts[0].fullUrl || '';
    const media = await fetch(mediaUrl, {
      headers: {
        'User-Agent': `UmbraStudio/${packageVersion} (Data Forge source test)`,
        Range: 'bytes=0-2047',
      },
      signal: AbortSignal.timeout(20000),
    });
    const mediaType = String(media.headers.get('content-type') || '');
    if (!media.ok && media.status !== 206) throw new Error(`media returned HTTP ${media.status}`);
    if (!mediaType.startsWith('image/')) throw new Error(`media returned ${mediaType || 'no content type'}`);
    console.log(`[source-test] ${source.id}: ${posts.length} posts, media ${media.status} ${mediaType}`);
  } catch (error: any) {
    failures += 1;
    console.log(`[source-test] ${source.id}: ${error?.message || error}`);
  }
}

if (failures > 0) {
  console.log(`[source-test] ${failures} source(s) require attention or credentials.`);
  process.exitCode = 1;
}
