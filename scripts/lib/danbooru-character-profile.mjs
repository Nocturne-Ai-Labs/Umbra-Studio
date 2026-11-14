import { classifyDanbooruTag } from '../../shared/danbooru/tagClassifiers.ts';

export const CHARACTER_PROFILE_POLICY = Object.freeze({
  version: 3, clothingLimit: 3, accessoryLimit: 3, identityLimit: 5,
  outfitFrequency: 0.9, minimumSamples: 3,
});

const alternateTags = new Set([
  'alternate_costume', 'alternate_outfit', 'official_alternate_costume', 'official_alternate_outfit',
  'alternate_hairstyle', 'official_alternate_hairstyle', 'alternate_hair_color', 'official_alternate_hair_color',
  'alternate_eye_color', 'official_alternate_eye_color', 'alternate_color', 'alternate_form',
  'alternate_age', 'aged_up', 'aged_down', 'costume_switch', 'clothes_swap', 'hairstyle_switch',
  'color_swap', 'palette_swap', 'cosplay',
]);
export const postTags = post => [...new Set(String(post?.tag_string_general || '').trim().split(/\s+/).filter(Boolean))];

const additionalGarment = /(?:^|_)(?:tank_top|crop_top|tube_top|halter_top|camisole|blouse|blazer|leotard|tunic|robe|cape|overalls|overcoat|sarong)$/;

export function isClothingAttributeTag(tag) {
  return classifyDanbooruTag(tag).includes('clothing')
    || additionalGarment.test(tag)
    || /(?:^|_)(?:sleeves|sleeveless|strapless|boots|footwear|loafers|sandals|shoes|sneakers)$/.test(tag)
    || /(?:^|_)(?:elbow_pads|knee_pads|shoulder_armor)$/.test(tag)
    || ['frills', 'ruffles', 'pleats', 'ribbon_trim', 'lace_trim', 'fur_trim'].includes(tag);
}
export function isAccessoryAttributeTag(tag) {
  return !isClothingAttributeTag(tag) && (classifyDanbooruTag(tag).includes('accessory')
    || /(?:^|_)(?:bow|ribbon|hair_tubes|hairclip|hairpin|hair_flower|hair_ornament)$/.test(tag));
}
export function isIdentityAttributeTag(tag) {
  return !isClothingAttributeTag(tag) && !isAccessoryAttributeTag(tag)
    && (classifyDanbooruTag(tag).includes('hair') || /(?:^|_)eyes$/.test(tag) || tag === 'heterochromia');
}
export function isCoreOutfitTag(tag) {
  return (classifyDanbooruTag(tag).includes('clothing') || additionalGarment.test(tag))
    && !/(?:^|_)(?:gloves|socks|stockings|thighhighs|pantyhose|boots|footwear|loafers|sandals|shoes|sneakers)$/.test(tag);
}

// Exact garment combinations avoid synthesizing an outfit from unrelated posts.
// A strict majority and a minimum sample count deliberately leave ambiguous cases blank.
export function characterProfileEvidence(posts) {
  const seen = new Set();
  const standard = posts.filter(post => {
    if (post.id != null) { const id = String(post.id); if (seen.has(id)) return false; seen.add(id); }
    const tags = postTags(post);
    return tags.length && !tags.some(tag => alternateTags.has(tag));
  });
  const groups = new Map();
  for (const post of standard) {
    const core = postTags(post).filter(isCoreOutfitTag);
    // "red_dress dress" and "red_dress" describe the same tagged garment.
    const specific = core.filter(tag => !core.some(other => other !== tag && other.endsWith(`_${tag}`))).sort();
    if (!specific.length) continue;
    const key = specific.join(' ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(post);
  }
  const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
  const winner = ranked[0] || [];
  const supported = standard.length >= CHARACTER_PROFILE_POLICY.minimumSamples
    && winner.length >= CHARACTER_PROFILE_POLICY.minimumSamples && winner.length > standard.length / 2;
  return { standard, outfit: supported ? winner : [],
    profileStatus: standard.length < CHARACTER_PROFILE_POLICY.minimumSamples ? 'needs_review_insufficient_samples'
      : supported ? 'consistent_outfit_sample' : 'needs_review_outfit',
    eligibleSampleCount: standard.length, outfitSampleCount: supported ? winner.length : 0 };
}
