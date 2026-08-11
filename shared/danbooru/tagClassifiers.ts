export type DanbooruTagClassifierId =
  | 'facial_expression'
  | 'gaze'
  | 'pose'
  | 'hand_gesture'
  | 'camera_composition'
  | 'clothing'
  | 'clothing_interaction'
  | 'accessory'
  | 'hair'
  | 'body_trait'
  | 'location'
  | 'background_lighting'
  | 'object_prop'
  | 'quality_style'
  | 'explicit_action'
  | 'explicit_anatomy'
  | 'adult_fluid'
  | 'bondage_fetish';

export interface DanbooruTagClassifierDefinition {
  id: DanbooruTagClassifierId;
  label: string;
  description: string;
  explicit: boolean;
}

export const DANBOORU_TAG_CLASSIFIERS: readonly DanbooruTagClassifierDefinition[] = [
  { id: 'facial_expression', label: 'Facial Expressions', description: 'Emotion, mouth, and face-state tags.', explicit: false },
  { id: 'gaze', label: 'Gaze & Direction', description: 'Eye direction, head direction, and viewer-facing cues.', explicit: false },
  { id: 'pose', label: 'Poses', description: 'Body positions, posture, and physical staging.', explicit: false },
  { id: 'hand_gesture', label: 'Hands & Gestures', description: 'Hand placement, finger gestures, and arm cues.', explicit: false },
  { id: 'camera_composition', label: 'Camera & Composition', description: 'Angles, framing, focus, and point-of-view tags.', explicit: false },
  { id: 'clothing', label: 'Clothing', description: 'Garments, uniforms, footwear, and outfit pieces.', explicit: false },
  { id: 'clothing_interaction', label: 'Clothing Interaction', description: 'Adjusting, lifting, removing, or moving clothing.', explicit: false },
  { id: 'accessory', label: 'Accessories', description: 'Jewelry, eyewear, headwear, and wearable details.', explicit: false },
  { id: 'hair', label: 'Hair', description: 'Hair color, length, texture, bangs, and hairstyles.', explicit: false },
  { id: 'body_trait', label: 'Body Traits', description: 'Non-action body, skin, eye, and physique descriptors.', explicit: false },
  { id: 'location', label: 'Locations', description: 'Named environments, rooms, venues, and places.', explicit: false },
  { id: 'background_lighting', label: 'Background & Lighting', description: 'Background, weather, time, atmosphere, and lighting.', explicit: false },
  { id: 'object_prop', label: 'Objects & Props', description: 'Vehicles, furniture, weapons, tools, and scene props.', explicit: false },
  { id: 'quality_style', label: 'Quality & Style', description: 'Render quality, medium, palette, and visual-style tags.', explicit: false },
  { id: 'explicit_action', label: 'Explicit Actions', description: 'Adult sexual actions and positions.', explicit: true },
  { id: 'explicit_anatomy', label: 'Explicit Anatomy', description: 'Nudity and explicit anatomical tags.', explicit: true },
  { id: 'adult_fluid', label: 'Adult Fluids', description: 'Adult fluid, ejaculation, and placement tags.', explicit: true },
  { id: 'bondage_fetish', label: 'Bondage & Fetish', description: 'Bondage, restraint, gag, and chastity tags.', explicit: true },
] as const;

const CLASSIFIER_IDS = new Set<string>(DANBOORU_TAG_CLASSIFIERS.map((entry) => entry.id));
const EXPLICIT_CLASSIFIER_IDS = new Set<DanbooruTagClassifierId>(
  DANBOORU_TAG_CLASSIFIERS.filter((entry) => entry.explicit).map((entry) => entry.id),
);

interface ClassifierRule {
  id: DanbooruTagClassifierId;
  categories?: readonly number[];
  exact?: readonly string[];
  patterns?: readonly RegExp[];
}

const CLASSIFIER_RULES: readonly ClassifierRule[] = [
  {
    id: 'facial_expression',
    exact: [
      'angry', 'annoyed', 'anxious', 'blush', 'bored', 'confused', 'crazy', 'crying',
      'disappointed', 'disgust', 'embarrassed', 'evil_smile', 'excited', 'expressionless',
      'frown', 'frustrated', 'grin', 'happy', 'light_smile', 'lonely', 'nervous', 'pout',
      'sad', 'scared', 'seductive_smile', 'serious', 'shy', 'sleepy', 'smile', 'smirk',
      'surprised', 'tears', 'teasing_smile', 'worried', 'open_mouth', 'closed_mouth',
      'parted_lips', 'clenched_teeth', 'gritted_teeth', 'tongue_out', 'licking_lips',
      'biting_lip', 'lip_bite', 'drooling', 'flustered', 'ahegao', ':3', ':d', ':p', ':q',
      ';d', ';p', 'd:', 'o_o', 'o3o', 'uwu', 'xd', '>_<', '^_^',
    ],
    patterns: [
      /^(?:slight_|wide_|soft_|gentle_|forced_|nervous_|sad_|happy_|evil_|seductive_|teasing_)?(?:smile|grin|smirk|frown)$/,
      /^(?:facial_)?expression(?:less)?$/,
      /^(?:open|closed|parted|puckered|pursed)_mouth$/,
      /^(?:blush|tears|drool|saliva)(?:_|$)/,
    ],
  },
  {
    id: 'gaze',
    exact: [
      'looking_at_viewer', 'looking_away', 'looking_back', 'looking_down', 'looking_up',
      'looking_ahead', 'looking_to_the_side', 'sideways_glance', 'eye_contact', 'facing_viewer',
      'facing_away', 'head_tilt', 'head_down', 'head_back', 'eyes_closed', 'closed_eyes',
      'half-closed_eyes', 'one_eye_closed', 'cross-eyed', 'rolling_eyes', 'upturned_eyes',
    ],
    patterns: [/^looking_(?:at_|towards_|to_|over_|away|back|down|up|ahead)/, /^facing_(?:viewer|away|left|right|sideways)$/],
  },
  {
    id: 'pose',
    exact: [
      'all_fours', 'against_surface', 'against_wall', 'arched_back', 'arms_above_head',
      'arms_behind_back', 'bent_over', 'contrapposto', 'crouching', 'doggystyle', 'fetal_position',
      'full_body', 'hugging', 'kneeling', 'legs_apart', 'legs_spread', 'lying', 'midair',
      'on_back', 'on_side', 'on_stomach', 'on_all_fours', 'paw_pose', 'prone', 'reclining',
      'sitting', 'squatting', 'standing', 'straddling', 'suspended', 'tiptoes', 'wariza',
      'yokozuwari', 'seiza', 'spread_legs', 'outstretched_arms', 'outstretched_legs',
    ],
    patterns: [
      /(?:^|_)(?:pose|stance|posture)$/, /^leaning_(?:against|back|forward|to_the_side)/,
      /^(?:sitting|standing|kneeling|lying|crouching|squatting|straddling|reclining|bent_over)(?:_|$)/,
      /^on_(?:back|side|stomach|all_fours|knees|one_knee|tiptoes)(?:_|$)/,
    ],
  },
  {
    id: 'hand_gesture',
    exact: [
      'arms_crossed', 'finger_in_mouth', 'fingers_in_mouth', 'hand_in_hair', 'hand_on_cheek',
      'hand_on_chin', 'hand_on_head', 'hand_on_hip', 'hand_over_face', 'hands_on_hips',
      'heart_hands', 'middle_finger', 'ok_sign', 'paw_pose', 'peace_sign', 'pointing',
      'pointing_at_viewer', 'salute', 'shushing', 'thumbs_up', 'v', 'waving',
    ],
    patterns: [/^(?:hand|hands|finger|fingers)_(?:in|on|over|under|behind|between|around|to)_/, /_(?:hand|finger)_gesture$/],
  },
  {
    id: 'camera_composition',
    exact: [
      'aerial_view', 'close-up', 'cowboy_shot', 'dutch_angle', 'establishing_shot', 'fisheye',
      'foreshortening', 'from_above', 'from_behind', 'from_below', 'from_front', 'from_side',
      'full_body', 'headshot', 'low_angle', 'over_shoulder', 'panorama', 'portrait', 'pov',
      'profile', 'three-quarter_view', 'upper_body', 'wide_shot', 'worm\'s_eye_view',
    ],
    patterns: [/^from_/, /_focus$/, /_shot$/, /^(?:pov|taker_pov|viewer_pov)(?:_|$)/, /^(?:extreme_)?(?:close-up|wide_shot)$/],
  },
  {
    id: 'clothing',
    exact: [
      'apron', 'armor', 'bikini', 'bodysuit', 'bra', 'business_suit', 'cardigan', 'chemise',
      'coat', 'corset', 'dress', 'fundoshi', 'gloves', 'gym_uniform', 'hoodie', 'jacket',
      'jeans', 'kimono', 'lingerie', 'loincloth', 'miniskirt', 'negligee', 'nightgown',
      'panties', 'pantyhose', 'pants', 'pajamas', 'school_uniform', 'serafuku', 'shirt',
      'shorts', 'skirt', 'socks', 'stockings', 'suit', 'sundress', 'sweater', 'swimsuit',
      'thighhighs', 'thong', 't-shirt', 'underwear', 'uniform', 'vest', 'yukata',
    ],
    patterns: [
      /(?:^|_)(?:bikini|bodysuit|bra|coat|corset|dress|gloves|hoodie|jacket|jeans|kimono|lingerie|panties|pantyhose|pants|shirt|shorts|skirt|socks|stockings|suit|sweater|swimsuit|thighhighs|thong|underwear|uniform|vest|yukata)$/,
      /_(?:boots|footwear|loafers|sandals|shoes|sneakers)$/, /^(?:wearing|dressed_in)_/,
    ],
  },
  {
    id: 'clothing_interaction',
    exact: [
      'adjusting_clothes', 'bra_lift', 'clothes_down', 'clothes_lift', 'clothes_pull',
      'clothes_removed', 'clothing_aside', 'dress_lift', 'hand_under_clothes', 'open_clothes',
      'panties_aside', 'panties_down', 'panties_pull', 'shirt_lift', 'skirt_lift',
      'top_lift', 'undressing', 'wardrobe_malfunction',
    ],
    patterns: [/(?:clothes|clothing|dress|shirt|skirt|bra|panties|pants|shorts)_(?:aside|down|lift|open|pull|removed|tug)$/, /^removing_(?:clothes|clothing|shirt|skirt|pants|underwear)$/],
  },
  {
    id: 'accessory',
    exact: [
      'anklet', 'armlet', 'bandana', 'belt', 'bowtie', 'bracelet', 'brooch', 'choker',
      'collar', 'crown', 'earrings', 'eyepatch', 'glasses', 'goggles', 'hair_ornament',
      'hair_ribbon', 'hat', 'headband', 'headphones', 'jewelry', 'mask', 'necklace',
      'piercing', 'ring', 'scarf', 'sunglasses', 'tiara', 'tie', 'watch',
    ],
    patterns: [/(?:^|_)(?:earrings|glasses|goggles|jewelry|necklace|bracelet|choker|collar|ring|piercing|hair_ornament|headwear|hat|mask|scarf|tie|belt)$/],
  },
  {
    id: 'hair',
    exact: [
      'afro', 'ahoge', 'bob_cut', 'braid', 'blunt_bangs', 'drill_hair', 'dreadlocks',
      'hair_bun', 'hair_over_one_eye', 'hime_cut', 'long_hair', 'medium_hair', 'messy_hair',
      'ponytail', 'short_hair', 'side_ponytail', 'straight_hair', 'twintails', 'very_long_hair',
      'wavy_hair',
    ],
    patterns: [/(?:^|_)(?:hair|bangs)$/, /_(?:hair|bangs)$/, /^(?:hair|bangs)_/],
  },
  {
    id: 'body_trait',
    exact: [
      'adult', 'androgynous', 'athletic', 'curvy', 'dark_skin', 'freckles', 'huge_breasts',
      'large_breasts', 'long_legs', 'medium_breasts', 'muscular', 'muscular_female', 'pale_skin',
      'petite', 'scar', 'short', 'small_breasts', 'tall', 'tan', 'thick_thighs', 'wide_hips',
    ],
    patterns: [
      /_(?:eyes|skin)$/, /^(?:small|medium|large|huge|gigantic)_(?:breasts|muscles)$/, /^(?:dark|pale|tan|tanned)_skin$/,
      /^(?:long|short|thick|slender)_(?:arms|legs|thighs|fingers)$/, /^(?:wide|narrow)_(?:hips|shoulders)$/,
    ],
  },
  {
    id: 'location',
    exact: [
      'airport', 'alley', 'amusement_park', 'aquarium', 'beach', 'bedroom', 'bridge',
      'cafe', 'castle', 'classroom', 'construction_site', 'forest', 'garden', 'gym',
      'hospital', 'indoors', 'kitchen', 'library', 'living_room', 'office', 'outdoors',
      'parking_lot', 'park', 'pool', 'restaurant', 'rooftop', 'school', 'shopping_mall',
      'street', 'subway', 'temple', 'train_station', 'warehouse', 'waterfall',
    ],
    patterns: [/(?:^|_)(?:airport|alley|beach|bedroom|classroom|forest|garden|gym|hospital|kitchen|library|office|park|pool|restaurant|rooftop|school|street|temple|warehouse)$/, /_(?:room|station|store|shop|site|street|beach|forest|park)$/],
  },
  {
    id: 'background_lighting',
    exact: [
      'backlighting', 'black_background', 'blue_sky', 'bokeh', 'cinematic_lighting',
      'city_lights', 'cloudy_sky', 'day', 'diffused_lighting', 'dramatic_lighting',
      'flower_field', 'fog', 'golden_hour', 'gradient_background', 'lens_flare', 'moonlight',
      'morning', 'night', 'rain', 'rim_lighting', 'simple_background', 'snow', 'spotlight',
      'sunlight', 'sunset', 'volumetric_lighting', 'white_background',
    ],
    patterns: [/_background$/, /_(?:lighting|light|sky|weather)$/, /^(?:sunrise|sunset|morning|day|evening|night|dawn|dusk)$/],
  },
  {
    id: 'object_prop',
    exact: [
      'airplane', 'bed', 'bench', 'bicycle', 'book', 'car', 'chair', 'computer', 'couch',
      'desk', 'flower', 'gun', 'motorcycle', 'phone', 'pillow', 'rock', 'sword', 'table',
      'train', 'tree', 'umbrella', 'weapon',
    ],
    patterns: [/(?:^|_)(?:airplane|bed|bench|bicycle|book|car|chair|computer|couch|desk|gun|motorcycle|phone|pillow|sword|table|train|umbrella|weapon)$/],
  },
  {
    id: 'quality_style',
    categories: [0, 5],
    exact: [
      '4k', 'absurdres', 'anime_coloring', 'cel_shading', 'chiaroscuro', 'chromatic_aberration',
      'color_splash', 'depth_of_field', 'film_grain', 'greyscale', 'high_contrast', 'highres',
      'lineart', 'lowres', 'monochrome', 'motion_blur', 'oil_painting', 'photorealistic',
      'realistic', 'sepia', 'silhouette', 'sketch', 'soft_focus', 'traditional_media',
      'watercolor',
    ],
    patterns: [/(?:^|_)(?:monochrome|greyscale|sepia|silhouette|sketch|lineart|watercolor|photorealistic|realistic)$/],
  },
  {
    id: 'explicit_action',
    exact: [
      'anal_penetration', 'anilingus', 'cunnilingus', 'deepthroat', 'doggystyle', 'double_penetration',
      'face_fucking', 'fellatio', 'fingering', 'gangbang', 'handjob', 'intercrural_sex',
      'irrumatio', 'masturbation', 'multiple_penetration', 'paizuri', 'sex', 'spitroast',
      'tentacle_sex', 'tribadism', 'vaginal_penetration',
    ],
    patterns: [
      /(?:^|_)(?:anal|vaginal|oral|double|multiple)_penetration(?:_|$)/,
      /(?:^|_)(?:penetration|sex|sexual|fingering)(?:_|$)/,
      /(?:^|_)(?:auto)?(?:fellatio|cunnilingus|anilingus|deepthroat|irrumatio|paizuri|handjob|footjob|pussyjob|masturbation|tribadism|gangbang|spitroast)(?:_|$)/,
    ],
  },
  {
    id: 'explicit_anatomy',
    exact: [
      'anus', 'ass', 'bare_breasts', 'bottomless', 'breasts', 'clitoris', 'erection', 'female_pubic_hair',
      'naked', 'nipple', 'nipples', 'nude', 'penis', 'pussy', 'scrotum', 'testicles', 'topless',
      'uncensored', 'vagina', 'vulva',
    ],
    patterns: [
      /^(?:exposed|visible)_(?:anus|breasts|nipples|penis|pussy|vagina|vulva)$/,
      /(?:^|_)(?:nude|naked|topless|bottomless)(?:_|$)/,
      /(?:^|_)(?:breast|breasts|nipple|nipples|penis|penises|pussy|vagina|vaginal|vulva|anus|anal|testicle|testicles|scrotum)(?:_|$)/,
    ],
  },
  {
    id: 'adult_fluid',
    exact: [
      'bukkake', 'creampie', 'cum', 'cumdrip', 'ejaculation', 'female_ejaculation', 'gokkun',
      'precum', 'semen', 'squirting',
    ],
    patterns: [
      /(?:^|_)cum(?:_|$|shot|drip|dump|flation)/,
      /(?:^|_)(?:semen|ejaculation|precum|bukkake|creampie|gokkun|squirting)(?:_|$)/,
      /(?:^|_)pussy_juice(?:_|$)/,
    ],
  },
  {
    id: 'bondage_fetish',
    exact: [
      'ball_gag', 'bondage', 'bound', 'bound_arms', 'bound_legs', 'chastity_belt', 'chastity_cage',
      'gag', 'gagged', 'handcuffs', 'leash', 'restrained', 'rope_bondage', 'shibari', 'spread_bondage',
      'suspension_bondage',
    ],
    patterns: [/(?:^|_)(?:bondage|gag|gagged|bound|restrained|shibari|chastity)(?:_|$)/],
  },
] as const;

const RULE_EXACT_SETS = CLASSIFIER_RULES.map((rule) => ({
  rule,
  exact: new Set(rule.exact || []),
}));

export function normalizeDanbooruTag(value: unknown): string {
  return String(value || '').trim().toLowerCase().replaceAll(' ', '_');
}

export function parseDanbooruTagClassifiers(value: unknown): DanbooruTagClassifierId[] {
  const source = Array.isArray(value) ? value : String(value || '').split(/[|;,\s]+/);
  const seen = new Set<DanbooruTagClassifierId>();
  const output: DanbooruTagClassifierId[] = [];
  for (const raw of source) {
    const id = String(raw || '').trim().toLowerCase() as DanbooruTagClassifierId;
    if (!CLASSIFIER_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }
  return DANBOORU_TAG_CLASSIFIERS.map((entry) => entry.id).filter((id) => seen.has(id));
}

export function classifyDanbooruTag(tagValue: unknown, categoryValue: unknown = 0): DanbooruTagClassifierId[] {
  const tag = normalizeDanbooruTag(tagValue);
  const category = Number.isFinite(Number(categoryValue)) ? Math.max(0, Math.floor(Number(categoryValue))) : 0;
  if (!tag) return [];

  const matches = new Set<DanbooruTagClassifierId>();
  for (const { rule, exact } of RULE_EXACT_SETS) {
    const categories = rule.categories || [0];
    if (!categories.includes(category)) continue;
    if (exact.has(tag) || rule.patterns?.some((pattern) => pattern.test(tag))) matches.add(rule.id);
  }
  return DANBOORU_TAG_CLASSIFIERS.map((entry) => entry.id).filter((id) => matches.has(id));
}

export function hasExplicitDanbooruClassifier(classifiers: readonly DanbooruTagClassifierId[]): boolean {
  return classifiers.some((id) => EXPLICIT_CLASSIFIER_IDS.has(id));
}

export function getDanbooruTagClassifierDefinition(id: string): DanbooruTagClassifierDefinition | null {
  return DANBOORU_TAG_CLASSIFIERS.find((entry) => entry.id === id) || null;
}
