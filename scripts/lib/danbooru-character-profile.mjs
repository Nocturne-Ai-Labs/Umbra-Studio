import { classifyDanbooruTag } from '../../shared/danbooru/tagClassifiers.ts';

export const CHARACTER_PROFILE_POLICY = Object.freeze({
  version: 8, clothingLimit: 3, accessoryLimit: 1, identityLimit: 5,
  outfitFrequency: 0.9, minimumSamples: 3, identityFrequency: 0.35,
});

const alternateTags = new Set([
  'alternate_costume', 'alternate_outfit', 'official_alternate_costume', 'official_alternate_outfit',
  'alternate_hairstyle', 'official_alternate_hairstyle', 'alternate_hair_color', 'official_alternate_hair_color',
  'alternate_eye_color', 'official_alternate_eye_color', 'alternate_color', 'alternate_form',
  'alternate_age', 'aged_up', 'aged_down', 'costume_switch', 'clothes_swap', 'hairstyle_switch',
  'color_swap', 'palette_swap', 'cosplay', 'alternate_animal_ears', 'alternate_tail',
]);
export const postTags = post => [...new Set(String(post?.tag_string_general || '').trim().split(/\s+/).filter(Boolean))];

const additionalGarment = /(?:^|_)(?:tank_top|crop_top|tube_top|halter_top|camisole|blouse|blazer|leotard|tunic|robe|cape|overalls|overcoat|sarong|jumpsuit|trousers)$/;

export function isClothingAttributeTag(tag) {
  return ['maid', 'serafuku', 'armor', 'japanese_armor', 'power_armor', 'full_armor', 'breastplate', 'pauldrons', 'gauntlets', 'greaves', 'chainmail'].includes(tag) || classifyDanbooruTag(tag).includes('clothing')
    || additionalGarment.test(tag)
    || /(?:^|_)(?:sleeves|sleeveless|strapless|boots|footwear|loafers|sandals|shoes|sneakers)$/.test(tag)
    || /(?:^|_)(?:elbow_pads|knee_pads|shoulder_armor)$/.test(tag)
    || ['frills', 'ruffles', 'pleats', 'ribbon_trim', 'lace_trim', 'fur_trim'].includes(tag);
}
export function isAccessoryAttributeTag(tag) {
  return !isClothingAttributeTag(tag) && (classifyDanbooruTag(tag).includes('accessory')
    || /(?:^|_)(?:bow|ribbon|hair_tubes|hairclip|hairpin|hair_flower|hair_ornament|headdress)$/.test(tag));
}
export function isIdentityAttributeTag(tag) {
  return !isClothingAttributeTag(tag) && !isAccessoryAttributeTag(tag)
    && (classifyDanbooruTag(tag).includes('hair') || /(?:^|_)eyes$/.test(tag) || tag === 'heterochromia');
}
export function isCoreOutfitTag(tag) {
  return (classifyDanbooruTag(tag).includes('clothing') || additionalGarment.test(tag))
    && !/(?:^|_)(?:gloves|socks|stockings|thighhighs|pantyhose|boots|footwear|loafers|sandals|shoes|sneakers)$/.test(tag);
}

const garmentSlots = {
  top: ['tank_top', 'crop_top', 'tube_top', 'halter_top', 'camisole', 'blouse', 'shirt', 'sweater', 'hoodie'],
  bottom: ['miniskirt', 'skirt', 'shorts', 'pants', 'trousers'],
  body: ['dress', 'kimono', 'leotard', 'robe', 'overalls', 'bodysuit', 'jumpsuit'],
  outer: ['jacket', 'coat', 'cape', 'blazer'],
  signature: ['detached_sleeves'],
  armor: ['armor', 'japanese_armor', 'power_armor', 'full_armor'],
  uniform: ['serafuku', 'maid', 'military_uniform'],
  legwear: ['striped_thighhighs', 'striped_stockings', 'striped_socks', 'argyle_thighhighs', 'argyle_pantyhose', 'fishnet_thighhighs', 'fishnet_pantyhose'],
};

function garmentTokens(post) {
  const tags = postTags(post);
  return Object.fromEntries(Object.entries(garmentSlots).map(([slot, values]) => {
    const found = values.filter(value => tags.some(tag => tag === value || tag.endsWith(`_${value}`)));
    // A specific subtype replaces its implied parent; color and trim don't split outfits.
    return [slot, found.filter(value => !found.some(other => other !== value && other.endsWith(value)))];
  }));
}

export function characterProfileEvidence(posts) {
  const seen = new Set();
  const standard = posts.filter(post => {
    if (post.id != null) { const id = String(post.id); if (seen.has(id)) return false; seen.add(id); }
    const tags = postTags(post);
    return tags.length && !tags.some(tag => alternateTags.has(tag));
  });
  return { standard, eligibleSampleCount: standard.length };
}

export function minimalOutfitEvidence(standard, minFrequency = 0) {
  const garments = standard.map(garmentTokens);
  const candidates = [];
  const required = Math.max(CHARACTER_PROFILE_POLICY.minimumSamples, Math.ceil(standard.length * Math.max(0.3, minFrequency)));
  for (const slot of Object.keys(garmentSlots)) {
    const tagged = garments.filter(row => row[slot].length);
    const counts = new Map();
    for (const row of tagged) for (const tag of row[slot]) counts.set(tag, (counts.get(tag) || 0) + 1);
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const best = ranked[0];
    const slotRequired = slot === 'uniform' ? Math.max(3, Math.ceil(standard.length * Math.max(0.15, minFrequency))) : required;
    if (best && best[1] >= slotRequired && best[1] / tagged.length >= Math.max(CHARACTER_PROFILE_POLICY.outfitFrequency, minFrequency)
      && (!ranked[1] || best[1] > ranked[1][1])) candidates.push({slot, entry: best});
  }
  // Equally supported incompatible pieces are ambiguous, not a reason to pick alphabetically.
  const ambiguous = new Set();
  for (const a of candidates) for (const b of candidates) {
    if (a === b) continue;
    const joint = garments.filter(row => row[a.slot].includes(a.entry[0]) && row[b.slot].includes(b.entry[0])).length;
    if (joint < CHARACTER_PROFILE_POLICY.minimumSamples && Math.min(a.entry[1], b.entry[1]) / Math.max(a.entry[1], b.entry[1]) >= 0.8) {
      ambiguous.add(a); ambiguous.add(b);
    }
  }
  candidates.sort((a, b) => Number(b.slot === 'uniform') - Number(a.slot === 'uniform') || b.entry[1] - a.entry[1] || a.slot.localeCompare(b.slot));
  const selected = [];
  let supporting = garments.map((_, i) => i);
  for (const candidate of candidates.filter(c => !ambiguous.has(c))) {
    if (selected.length === CHARACTER_PROFILE_POLICY.clothingLimit) break;
    if (selected.some(p => p.slot === 'uniform') && ['top', 'bottom', 'body'].includes(candidate.slot)) continue;
    // A one-piece and a top/bottom combination are alternative outfits.
    if (selected.some(p => (p.slot === 'body' && ['top','bottom'].includes(candidate.slot))
      || (candidate.slot === 'body' && ['top','bottom'].includes(p.slot)))) continue;
    const matching = supporting.filter(i => garments[i][candidate.slot].includes(candidate.entry[0]));
    if (matching.length < CHARACTER_PROFILE_POLICY.minimumSamples) continue;
    selected.push(candidate); supporting = matching;
  }
  const accessoryCounts = new Map();
  for (const p of standard) for (const tag of postTags(p).filter(isAccessoryAttributeTag)) {
    if (['jewelry', 'hair_ornament', 'bow', 'ribbon'].includes(tag)) continue;
    accessoryCounts.set(tag, (accessoryCounts.get(tag) || 0) + 1);
  }
  const namedHeadwear = [...accessoryCounts].filter(([tag]) => /_headdress$/.test(tag));
  const headwearPosts = standard.filter(p => postTags(p).some(tag => /_headdress$/.test(tag))).length;
  const accessories = selected.length ? [...accessoryCounts].filter(([tag, count]) =>
    (count >= Math.max(required, Math.ceil(standard.length * Math.max(0.9, minFrequency)))
      || (namedHeadwear.some(([name]) => name === tag) && count >= Math.max(required, Math.ceil(standard.length * 0.5)) && count >= headwearPosts * 0.9))
    && supporting.filter(i => postTags(standard[i]).includes(tag)).length >= CHARACTER_PROFILE_POLICY.minimumSamples)
    .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0, CHARACTER_PROFILE_POLICY.accessoryLimit) : [];
  return {clothing: selected.map(p => p.entry), accessories,
    profileStatus: selected.length ? 'consistent_minimal_outfit' : 'needs_review_outfit',
    outfitSampleCount: selected.length ? supporting.length : 0};
}

export function selectMinimalIdentity(counts, standard, minFrequency = 0) {
  const sampleCount = standard.length;
  const minimum = Math.max(CHARACTER_PROFILE_POLICY.minimumSamples, Math.ceil(sampleCount * Math.max(CHARACTER_PROFILE_POLICY.identityFrequency, minFrequency)));
  const ranked = [...counts].filter(([,count]) => count >= minimum).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  const color = '(?:(?:light|dark)_)?(?:aqua|amber|black|blonde|blue|brown|cyan|gold|green|grey|gray|hazel|orange|pink|platinum_blonde|purple|red|silver|white|yellow)';
  const hairColors = new RegExp(`^${color}_hair$`);
  const eyeColors = new RegExp(`^${color}_eyes$`);
  const rows = standard.map(postTags);
  function colorGroup(pattern, qualifiers) {
    // Specific pattern tags already qualify multiple colors; don't also emit a generic duplicate.
    const qualifying = qualifiers.filter(tag => (counts.get(tag) || 0) >= minimum);
    const qualifier = qualifying[0];
    if (!qualifier) return ranked.filter(([tag]) => pattern.test(tag)).slice(0,1);
    const qualified = rows.filter(tags => tags.some(tag => qualifiers.includes(tag)));
    const pairCounts = new Map();
    let pairedPosts = 0;
    for (const tags of qualified) {
      const colors = tags.filter(tag => pattern.test(tag)).sort();
      if (colors.length > 1) pairedPosts++;
      for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
        const key = `${colors[i]} ${colors[j]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
    const pairs = [...pairCounts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
    const best = pairs[0];
    const supported = best && best[1] >= Math.max(CHARACTER_PROFILE_POLICY.minimumSamples, Math.ceil(sampleCount * minFrequency))
      && best[1] >= pairedPosts * 0.6 && (!pairs[1] || best[1] > pairs[1][1]);
    const colors = supported ? best[0].split(' ').map(tag => [tag, counts.get(tag)])
      : ranked.filter(([tag]) => pattern.test(tag) && qualified.some(tags => tags.includes(tag))).slice(0,1);
    return [[qualifier, counts.get(qualifier)], ...colors];
  }
  const essential = [
    ...colorGroup(eyeColors, ['heterochromia', 'two-tone_eyes', 'multicolored_eyes']),
    ...colorGroup(hairColors, ['colored_inner_hair', 'streaked_hair', 'gradient_hair', 'two-tone_hair', 'multicolored_hair']),
  ];
  const groups = [/^(?:very_long|long|medium|short|very_short)_hair$/,
    /^(?:twintails|twin_braids|braid|ponytail|side_ponytail|low_ponytail|low-tied_long_hair|hair_bun|double_bun|bob_cut|hime_cut|drill_hair|ahoge)$/,
    /^(?:blunt_bangs|swept_bangs|parted_bangs|double-parted_bangs|hair_over_one_eye|hair_between_eyes)$/];
  const details = groups.flatMap(pattern => ranked.filter(([tag]) => pattern.test(tag)).slice(0,1));
  // Usually five; simultaneous dual-colored hair and eyes need six essential tokens.
  return [...essential, ...details].slice(0, Math.max(CHARACTER_PROFILE_POLICY.identityLimit, essential.length));
}

const animalTypes = ['cat', 'dog', 'fox', 'wolf', 'rabbit', 'horse', 'cow', 'mouse', 'rat', 'raccoon', 'squirrel', 'lion', 'tiger', 'leopard', 'cheetah', 'lynx', 'deer', 'sheep', 'goat', 'bear', 'panda', 'red_panda', 'hyena', 'bat', 'bird', 'monkey', 'dragon'];
const tailTypes = new Set([...animalTypes.map(type => `${type}_tail`), 'shark_tail', 'fish_tail', 'demon_tail', 'lizard_tail', 'snake_tail', 'scorpion_tail']);
const earTypes = new Set([...animalTypes.map(type => `${type}_ears`), 'animal_ears']);
const breastSizes = new Set(['flat_chest', 'small_breasts', 'medium_breasts', 'large_breasts', 'huge_breasts', 'gigantic_breasts']);
const furColor = /^(?:white|black|grey|gray|brown|blue|red|orange|yellow|green|pink|purple|cream|tan|multicolored)_fur$/;
export const isDistinctiveTraitTag = tag => tailTypes.has(tag) || earTypes.has(tag) || tag === 'fake_animal_ears' || tag === 'fur' || furColor.test(tag) || breastSizes.has(tag);

export function selectDistinctiveTraits(standard, minFrequency = 0) {
  const rows = standard.map(postTags);
  const minimum = Math.max(CHARACTER_PROFILE_POLICY.minimumSamples, Math.ceil(standard.length * Math.max(0.3, minFrequency)));
  function strongest(samples, agreement, rejectTie = true) {
    const counts = new Map();
    for (const tags of samples) for (const tag of new Set(tags)) counts.set(tag, (counts.get(tag) || 0) + 1);
    const tagged = samples.filter(tags => tags.length).length;
    const ranked = [...counts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
    const best = ranked[0];
    if (!best || best[1] < minimum || best[1] < tagged * agreement || (rejectTie && ranked[1]?.[1] === best[1])) return [];
    return [best];
  }
  const tails = strongest(rows.map(tags => tags.filter(tag => tailTypes.has(tag) && !(tag === 'fish_tail' && tags.includes('shark_tail')))), 0.9);
  // Fake-ear evidence is never counted as biological ears. Once supported, keep the qualifier alone.
  const fake = rows.filter(tags => tags.includes('fake_animal_ears')).length;
  const ears = fake >= minimum ? [['fake_animal_ears', fake]] : strongest(rows.map(tags => {
    if (tags.includes('fake_animal_ears')) return [];
    const typed = tags.filter(tag => earTypes.has(tag) && tag !== 'animal_ears');
    return typed.length ? typed : tags.includes('animal_ears') ? ['animal_ears'] : [];
  }), 0.9);
  const fur = strongest(rows.map(tags => {
    const colors = tags.filter(tag => furColor.test(tag));
    return colors.length ? colors : tags.includes('fur') ? ['fur'] : [];
  }), 0.6);
  // Size labels vary by artist. Keep only a clear most-supported size, never tied alternatives.
  const size = strongest(rows.map(tags => tags.filter(tag => breastSizes.has(tag))), 0.6);
  return [...tails, ...ears, ...fur, ...size];
}
