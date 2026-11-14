export const CHARACTER_CLOTHING_POLICY = Object.freeze({ maxTags: 8, minFrequency: 0.9 });

export function soloGeneralFallbackFilter(filter) {
  const tokens = String(filter || '').replaceAll(',', ' ').split(/\s+/).filter(Boolean);
  if (!tokens.includes('solo') || !tokens.some(token => /^rating:(g|general)$/i.test(token))) return null;
  return tokens.filter(token => token !== 'solo').join(' ');
}

export function selectSingleCharacterGeneralPosts(posts, character) {
  return posts.filter(post => {
    if (post.rating !== 'g') return false;
    const characters = [...new Set(String(post.tag_string_character || '').split(/\s+/).filter(Boolean))];
    if (characters.length !== 1 || characters[0] !== character) return false;
    const tags = String(post.tag_string_general || '').split(/\s+/);
    if (tags.some(tag => {
      const count = tag.match(/^(\d+)(girls|boys|others)$/);
      return (count && Number(count[1]) > 1) || /^(multiple_(girls|boys|others|persona)|crowd|group|\d+\+(girls|boys|others))$/.test(tag);
    })) return false;
    return tags.filter(tag => /^(1girl|1boy|1other)$/.test(tag)).length <= 1;
  });
}
