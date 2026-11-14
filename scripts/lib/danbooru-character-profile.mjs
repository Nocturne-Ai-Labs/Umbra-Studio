import { classifyDanbooruTag } from '../../shared/danbooru/tagClassifiers.ts';

export const CHARACTER_PROFILE_POLICY = Object.freeze({
  version: 13, clothingLimit: 3, accessoryLimit: 1, identityLimit: 5,
  fallbackOutfitFrequency: 0.7,
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
  return ['maid', 'serafuku', 'armor', 'japanese_armor', 'power_armor', 'full_armor', 'breastplate', 'pauldrons', 'gauntlets', 'greaves', 'chainmail', 'leggings', 'thong_straps', 'garters', 'garter_belt', 'garter_straps', 'leg_garter', 'thigh_strap', 'leg_warmers', 'arm_warmers'].includes(tag) || classifyDanbooruTag(tag).includes('clothing')
    || additionalGarment.test(tag)
    || /(?:^|_)(?:sleeves|sleeveless|strapless|boots|footwear|loafers|sandals|shoes|sneakers)$/.test(tag)
    || /(?:^|_)(?:elbow_pads|knee_pads|shoulder_armor)$/.test(tag)
    || ['frills', 'ruffles', 'pleats', 'ribbon_trim', 'lace_trim', 'fur_trim'].includes(tag);
}
export function isAccessoryAttributeTag(tag) {
  return !isClothingAttributeTag(tag) && (classifyDanbooruTag(tag).includes('accessory')
    || /(?:^|_)(?:bow|ribbon|hair_tubes|hairclip|hairpin|hair_flower|hair_ornament|headdress)$/.test(tag));
}
export const isEyePatternTag = tag => ['ringed_eyes', 'slit_pupils', 'horizontal_pupils', 'no_pupils'].includes(tag)
  || /^[a-z]+(?:-[a-z]+)*-shaped_pupils$/.test(tag);

export function isIdentityAttributeTag(tag) {
  return !isClothingAttributeTag(tag) && !isAccessoryAttributeTag(tag)
    && (classifyDanbooruTag(tag).includes('hair') || /(?:^|_)eyes$/.test(tag) || tag === 'heterochromia' || isEyePatternTag(tag));
}
export function isCoreOutfitTag(tag) {
  return (classifyDanbooruTag(tag).includes('clothing') || additionalGarment.test(tag))
    && !/(?:^|_)(?:gloves|socks|stockings|thighhighs|pantyhose|boots|footwear|loafers|sandals|shoes|sneakers)$/.test(tag);
}

const garmentSlots = {
  top: ['tank_top', 'crop_top', 'tube_top', 'halter_top', 'camisole', 'blouse', 'shirt', 'sweater', 'hoodie'],
  bottom: ['miniskirt', 'skirt', 'shorts', 'pants', 'trousers'],
  body: ['dress', 'china_dress', 'kimono', 'yukata', 'leotard', 'robe', 'overalls', 'bodysuit', 'jumpsuit'],
  outer: ['jacket', 'coat', 'cape', 'blazer'],
  signature: ['detached_sleeves'],
  armor: ['armor', 'japanese_armor', 'power_armor', 'full_armor'],
  uniform: ['serafuku', 'maid', 'military_uniform'],
  footwear: ['shoes', 'boots', 'sneakers', 'sandals', 'loafers', 'pumps'],
  straps: ['thong_straps', 'garter_straps', 'garter_belt', 'garters', 'leg_garter', 'thigh_strap'],
  leg_warmers: ['leg_warmers'],
  arm_warmers: ['arm_warmers'],
  legwear: ['thighhighs', 'leggings', 'pantyhose', 'stockings', 'socks', 'striped_thighhighs', 'striped_stockings', 'striped_socks', 'argyle_thighhighs', 'argyle_pantyhose', 'fishnet_thighhighs', 'fishnet_pantyhose'],
};

function garmentTokens(post) {
  const tags = postTags(post).filter(tag => !/^(?:no_|unworn_|missing_|invisible_)/.test(tag)
    && !classifyDanbooruTag(tag).includes('clothing_interaction'));
  return Object.fromEntries(Object.entries(garmentSlots).map(([slot, values]) => {
    const found = values.filter(value => tags.some(tag => tag === value || tag.endsWith(`_${value}`)));
    // A specific subtype replaces its implied parent; color and trim don't split outfits.
    const specific = found.filter(value => !found.some(other => other !== value && (other.endsWith(value)
      || (value === 'kimono' && other === 'yukata'))));
    return [slot, slot === 'footwear' && specific.some(value => value !== 'shoes') ? specific.filter(value => value !== 'shoes') : specific];
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
  const fallbackCandidates = [];
  const required = Math.max(CHARACTER_PROFILE_POLICY.minimumSamples, Math.ceil(standard.length * Math.max(0.3, minFrequency)));
  for (const slot of Object.keys(garmentSlots)) {
    const tagged = garments.filter(row => row[slot].length);
    const counts = new Map();
    for (const row of tagged) for (const tag of row[slot]) counts.set(tag, (counts.get(tag) || 0) + 1);
    let ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    let best = ranked[0];
    if (slot === 'legwear') {
      // Untagged pattern details are not evidence of plain legwear.
      const family = tag => ['thighhighs', 'leggings', 'pantyhose', 'stockings', 'socks'].find(base => tag === base || tag.endsWith(`_${base}`)) || tag;
      const familyCounts = new Map();
      for (const row of tagged) for (const tag of new Set(row[slot].map(family))) familyCounts.set(tag, (familyCounts.get(tag) || 0) + 1);
      ranked = [...familyCounts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
      best = ranked[0];
      if (best) {
        const variants = [...counts].filter(([tag]) => tag !== best[0] && family(tag) === best[0]).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
        const detailed = tagged.filter(row => row[slot].some(tag => tag !== best[0] && family(tag) === best[0])).length;
        if (variants[0]?.[1] >= required && variants[0][1] >= detailed * Math.max(0.9, minFrequency)
          && (!variants[1] || variants[0][1] > variants[1][1])) {
          // Eligibility uses the family; the exported variant still requires direct supporting posts.
          best = [variants[0][0], best[1]];
        }
      }
    }
    const slotRequired = slot === 'uniform' ? Math.max(3, Math.ceil(standard.length * Math.max(0.15, minFrequency))) : required;
    if (best && best[1] >= required && best[1] / tagged.length >= Math.max(CHARACTER_PROFILE_POLICY.fallbackOutfitFrequency, minFrequency)
      && (!ranked[1] || best[1] > ranked[1][1])) {
      const tag = best[0];
      const matching = garments.map((row, i) => row[slot].includes(tag)
        || (slot === 'legwear' && row[slot].some(value => value.endsWith(`_${tag}`))) ? i : -1).filter(i => i >= 0);
      if (matching.length >= required) fallbackCandidates.push({slot, entry: [tag, matching.length], matching});
    }
    if (best && best[1] >= slotRequired && best[1] / tagged.length >= Math.max(CHARACTER_PROFILE_POLICY.outfitFrequency, minFrequency)
      && (!ranked[1] || best[1] > ranked[1][1])) {
      const baseLegwear = slot === 'legwear' && ['thighhighs', 'leggings', 'pantyhose', 'stockings', 'socks'].includes(best[0]);
      candidates.push({slot, entry: [best[0], baseLegwear ? best[1] : counts.get(best[0]) || best[1]]});
      if (baseLegwear) {
        for (const row of garments) if (!row[slot].includes(best[0]) && row[slot].some(tag => tag.endsWith(`_${best[0]}`))) row[slot].push(best[0]);
      }
    }
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
  // A supported dress describes the complete garment; shirt tags must not crowd it out.
  const garmentPriority = candidate => candidate.slot === 'uniform' ? 2 : /(?:^|_)dress$/.test(candidate.entry[0]) ? 1 : 0;
  candidates.sort((a, b) => garmentPriority(b) - garmentPriority(a) || b.entry[1] - a.entry[1] || a.slot.localeCompare(b.slot));
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
  let usedFallback = false;
  if (!selected.length) {
    // Keep just one dominant piece, without combining competing outfits or relaxing accessories.
    fallbackCandidates.sort((a,b) => b.entry[1] - a.entry[1] || garmentPriority(b) - garmentPriority(a) || a.slot.localeCompare(b.slot));
    const best = fallbackCandidates[0];
    const conflict = best && fallbackCandidates.slice(1).some(other =>
      other.entry[1] >= best.entry[1] * 0.8
      && other.matching.filter(i => best.matching.includes(i)).length < CHARACTER_PROFILE_POLICY.minimumSamples);
    if (best && !conflict) {
      selected.push(best); supporting = best.matching; usedFallback = true;
    }
  }
  const accessoryCounts = new Map();
  const accessoryRows = standard.map(p => [...new Set(postTags(p).filter(isAccessoryAttributeTag)
    .map(tag => tag === 'choker' || tag.endsWith('_choker') ? 'choker' : tag))]);
  for (const tags of accessoryRows) for (const tag of tags) {
    if (['jewelry', 'hair_ornament', 'bow', 'ribbon'].includes(tag)) continue;
    accessoryCounts.set(tag, (accessoryCounts.get(tag) || 0) + 1);
  }
  const namedHeadwear = [...accessoryCounts].filter(([tag]) => /_headdress$/.test(tag));
  const headwearPosts = standard.filter(p => postTags(p).some(tag => /_headdress$/.test(tag))).length;
  const accessories = selected.length && !usedFallback ? [...accessoryCounts].filter(([tag, count]) =>
    (count >= Math.max(required, Math.ceil(standard.length * Math.max(0.9, minFrequency)))
      || (tag === 'choker' && count >= required)
      || (namedHeadwear.some(([name]) => name === tag) && count >= Math.max(required, Math.ceil(standard.length * 0.5)) && count >= headwearPosts * 0.9))
    && supporting.filter(i => accessoryRows[i].includes(tag)).length >= CHARACTER_PROFILE_POLICY.minimumSamples)
    .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0, CHARACTER_PROFILE_POLICY.accessoryLimit) : [];
  return {clothing: selected.map(p => p.entry), accessories,
    profileStatus: selected.length && !usedFallback ? 'consistent_minimal_outfit' : 'needs_review_outfit',
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
  const patternCounts = new Map();
  let patternPosts = 0;
  for (const tags of rows) {
    let patterns = tags.filter(isEyePatternTag);
    if (patterns.some(tag => tag !== 'symbol-shaped_pupils' && tag.endsWith('-shaped_pupils'))) patterns = patterns.filter(tag => tag !== 'symbol-shaped_pupils');
    if (patterns.length) patternPosts++;
    for (const tag of patterns) patternCounts.set(tag, (patternCounts.get(tag) || 0) + 1);
  }
  const patterns = [...patternCounts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  if (patterns[0]?.[1] >= minimum && patterns[0][1] >= patternPosts * 0.6 && (!patterns[1] || patterns[0][1] > patterns[1][1])) essential.push(patterns[0]);
  const groups = [/^(?:very_long|long|medium|short|very_short)_hair$/,
    /^(?:twintails|twin_braids|braid|ponytail|side_ponytail|low_ponytail|low-tied_long_hair|hair_bun|double_bun|bob_cut|hime_cut|drill_hair|ahoge)$/,
    /^(?:blunt_bangs|swept_bangs|parted_bangs|double-parted_bangs|hair_over_one_eye|hair_between_eyes)$/];
  const details = groups.flatMap(pattern => ranked.filter(([tag]) => pattern.test(tag)).slice(0,1));
  // Usually five; dual-colored hair/eyes plus a defining eye pattern can need seven essential tokens.
  return [...essential, ...details].slice(0, Math.max(CHARACTER_PROFILE_POLICY.identityLimit, essential.length));
}

const animalTypes = ['cat', 'dog', 'fox', 'wolf', 'rabbit', 'horse', 'cow', 'mouse', 'rat', 'raccoon', 'squirrel', 'lion', 'tiger', 'leopard', 'cheetah', 'lynx', 'deer', 'sheep', 'goat', 'bear', 'panda', 'red_panda', 'hyena', 'bat', 'bird', 'monkey', 'dragon'];
const tailTypes = new Set([...animalTypes.map(type => `${type}_tail`), 'shark_tail', 'fish_tail', 'demon_tail', 'lizard_tail', 'snake_tail', 'scorpion_tail']);
const earTypes = new Set([...animalTypes.map(type => `${type}_ears`), 'animal_ears']);
const breastSizes = new Set(['flat_chest', 'small_breasts', 'medium_breasts', 'large_breasts', 'huge_breasts', 'gigantic_breasts']);
const furColor = /^(?:white|black|grey|gray|brown|blue|red|orange|yellow|green|pink|purple|cream|tan|multicolored)_fur$/;
export const isDistinctiveTraitTag = tag => tailTypes.has(tag) || earTypes.has(tag) || tag === 'fake_animal_ears' || tag === 'fur' || furColor.test(tag) || breastSizes.has(tag) || tag === 'navel';

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
  const visibleNavel = rows.filter(tags => tags.includes('navel') && !tags.includes('covered_navel')).length;
  const navelTagged = rows.filter(tags => tags.includes('navel') || tags.includes('covered_navel')).length;
  const navel = visibleNavel >= minimum && visibleNavel >= navelTagged * 0.6 ? [['navel', visibleNavel]] : [];
  return [...tails, ...ears, ...fur, ...size, ...navel];
}
