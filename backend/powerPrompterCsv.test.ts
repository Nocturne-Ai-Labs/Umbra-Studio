import { describe, expect, test } from 'bun:test';
import { parsePowerPrompterCsv } from './powerPrompterCsv';

describe('Power Prompter CSV parsing', () => {
  test('keeps localized columns out of character prompt attributes', () => {
    const [item] = parsePowerPrompterCsv(
      [
        'character,attributes,localized_name,localized_aliases',
        '"hatsune_miku","blue_hair, twintails","初音ミク","ミク, 初音"',
      ].join('\n'),
      'character',
      'characters-ja.csv',
    );

    expect(item.tag).toBe('hatsune_miku');
    expect(item.extra).toBe('blue_hair, twintails');
    expect(item.displayTag).toBe('初音ミク');
    expect(item.searchAliases).toBe('ミク, 初音');
  });

  test('supports localized tag CSVs while preserving canonical tags', () => {
    const [item] = parsePowerPrompterCsv(
      'tag,category,color,localized_name,localized_aliases\n1girl,0,#fff,女の子,"女性, 少女"',
      'tag',
      'tags-ja.csv',
    );

    expect(item.tag).toBe('1girl');
    expect(item.displayTag).toBe('女の子');
    expect(item.searchAliases).toBe('女性, 少女');
  });
});
