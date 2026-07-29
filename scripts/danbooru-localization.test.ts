import { describe, expect, test } from 'bun:test';
import {
  buildLocalizationMap,
  normalizeOutputLanguage,
  selectLocalizedAliases,
} from './lib/danbooru-localization.mjs';

const FIXTURE = [
  'tag,category,count,alias',
  '1girl,0,100,"女の子,女性,少女,girl,소녀,女孩"',
  'long_hair,0,100,"ロングヘアー,長髪,长发,長い髪"',
].join('\n');

describe('Danbooru optional localization', () => {
  test('canonical remains the default', () => {
    expect(normalizeOutputLanguage(undefined)).toBe('canonical');
    expect(selectLocalizedAliases('女の子,女孩', 'canonical')).toEqual([]);
  });

  test('Japanese selection keeps aliases containing kana', () => {
    expect(buildLocalizationMap(FIXTURE, 'ja').get('1girl')).toEqual(['女の子']);
    expect(buildLocalizationMap(FIXTURE, 'ja').get('long_hair')).toEqual(['ロングヘアー', '長い髪']);
  });

  test('Chinese selection keeps Han aliases without kana or Hangul', () => {
    expect(buildLocalizationMap(FIXTURE, 'zh-CN').get('1girl')).toEqual(['女性', '少女', '女孩']);
    expect(buildLocalizationMap(FIXTURE, 'zh-CN').get('long_hair')).toEqual(['長髪', '长发']);
  });
});
