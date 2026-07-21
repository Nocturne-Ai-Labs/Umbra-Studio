import { describe, expect, test } from 'bun:test';
import {
  parseDanbooruPosts,
  parseE621Posts,
  parseGelbooruPosts,
  parseRule34Posts,
} from './booruApi';

describe('Data Forge booru response adapters', () => {
  test('normalizes Danbooru posts', () => {
    const posts = parseDanbooruPosts([{
      id: 1,
      preview_file_url: 'https://cdn.donmai.us/preview.jpg',
      file_url: 'https://cdn.donmai.us/full.png',
      image_width: 1024,
      image_height: 1536,
      tag_string: '1girl solo',
      rating: 'g',
      file_ext: 'png',
    }]);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ id: '1', width: 1024, height: 1536, tags: ['1girl', 'solo'] });
  });

  test('normalizes Gelbooru post envelopes', () => {
    const posts = parseGelbooruPosts({ post: [{
      id: 2,
      preview_url: '//img3.gelbooru.com/preview.jpg',
      file_url: 'https://img3.gelbooru.com/full.jpg',
      tags: '1girl solo',
    }] });
    expect(posts[0].url).toBe('https://img3.gelbooru.com/preview.jpg');
    expect(posts[0].tags).toEqual(['1girl', 'solo']);
  });

  test('flattens e621 tag categories', () => {
    const posts = parseE621Posts({ posts: [{
      id: 3,
      preview: { url: 'https://static1.e621.net/preview.jpg' },
      file: { url: 'https://static1.e621.net/full.webp', width: 800, height: 1200, ext: 'webp' },
      tags: { general: ['solo'], species: ['human'] },
      score: { total: 42 },
    }] });
    expect(posts[0]).toMatchObject({ id: '3', score: 42, fileExt: 'webp' });
    expect(posts[0].tags).toEqual(['solo', 'human']);
  });

  test('normalizes Rule34 posts', () => {
    const posts = parseRule34Posts([{
      id: 4,
      preview_url: 'https://wimg.rule34.xxx/preview.jpg',
      file_url: 'https://wimg.rule34.xxx/full.jpeg',
      tags: '1girl solo',
      hash: 'abc123',
    }]);
    expect(posts[0]).toMatchObject({ id: '4', md5: 'abc123', rating: 'explicit', fileExt: 'jpeg' });
  });
});
