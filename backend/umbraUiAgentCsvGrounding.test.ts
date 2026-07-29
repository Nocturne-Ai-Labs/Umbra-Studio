import { describe, expect, test } from 'bun:test';
import { buildUmbraUiAgentCsvGrounding } from './umbraUiAgentCsvGrounding';

describe('Umbra UI agent CSV grounding', () => {
  test('returns exact relevant Danbooru tags from user CSV rows', () => {
    const result = buildUmbraUiAgentCsvGrounding(
      'A woman with short brown hair, swept bangs, and a black jacket',
      [
        { tag: 'brown_hair', source: 'danbooru-tags.csv', type: 'tag' },
        { tag: 'short_hair', source: 'danbooru-tags.csv', type: 'tag' },
        { tag: 'swept_bangs', source: 'danbooru-tags.csv', type: 'tag' },
        { tag: 'black_jacket', source: 'wardrobe.csv', type: 'tag' },
        { tag: 'blue_eyes', source: 'danbooru-tags.csv', type: 'tag' },
      ],
    );

    expect(new Set(result.tags)).toEqual(new Set([
      'brown_hair',
      'short_hair',
      'swept_bangs',
      'black_jacket',
    ]));
    expect(result.sources).toEqual(['danbooru-tags.csv', 'wardrobe.csv']);
    expect(result.text).toContain('exact spellings');
    expect(result.text).not.toContain('blue_eyes');
  });

  test('includes identity attributes from a matching character CSV row', () => {
    const result = buildUmbraUiAgentCsvGrounding(
      'Draw hatsune miku singing',
      [{
        tag: 'hatsune_miku',
        source: 'characters.csv',
        type: 'character',
        extra: 'aqua_hair, twintails, aqua_eyes',
      }],
    );

    expect(result.tags).toEqual([
      'hatsune_miku',
      'aqua_hair',
      'twintails',
      'aqua_eyes',
    ]);
  });

  test('does not provide unrelated vocabulary when there is no match', () => {
    const result = buildUmbraUiAgentCsvGrounding(
      'an abstract concept',
      [{ tag: 'brown_hair', source: 'tags.csv', type: 'tag' }],
    );

    expect(result.tags).toEqual([]);
    expect(result.text).toContain('No related exact tags were found');
  });
});
