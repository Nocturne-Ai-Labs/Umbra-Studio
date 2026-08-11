#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  getLocalizedTag,
  loadDanbooruLocalizationMap,
  normalizeOutputLanguage,
} from './lib/danbooru-localization.mjs';
import { classifyDanbooruTag } from '../shared/danbooru/tagClassifiers.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DANBOORU_TAGS_URL = 'https://danbooru.donmai.us/tags.json';
const DANBOORU_POSTS_URL = 'https://danbooru.donmai.us/posts.json';
const DEFAULT_CHARACTER_TAGS_CSV = path.join(repoRoot, 'User', 'DanbooruTags', 'danbooru-character-tags.csv');
const DEFAULT_OUT_FILE = path.join(repoRoot, 'User', 'PowerPrompter', 'CSV', 'Characters', 'danbooru-character-attributes.csv');
const DEFAULT_TAG_LIST_OUT_FILE = path.join(repoRoot, 'User', 'PowerPrompter', 'CSV', 'tags', 'danbooru-tags.csv');
const DEFAULT_LOCALIZATION_CACHE_FILE = path.join(repoRoot, 'User', 'Cache', 'Danbooru', 'danbooru-tags-multilingual.csv');
const DANBOORU_MAX_TAG_LIMIT = 1000;
const DEFAULT_GENERAL_TAG_MIN_POSTS = 150;
const DEFAULT_ARTIST_TAG_MIN_POSTS = 100;
const DEFAULT_CONTEXT_TAG_MIN_POSTS = 10;
const MAX_POST_LIMIT = 200;
const MAX_FETCH_ATTEMPTS = 10;
const GENERATOR_STOP_EXIT_CODE = 75;
let runtimeControlFile = '';
let pauseWasAnnounced = false;
const TAG_CATEGORIES = {
  general: 0,
  artist: 1,
  copyright: 3,
  character: 4,
  meta: 5,
};
const TAG_CATEGORY_NAMES = {
  0: 'general',
  1: 'artist',
  2: 'unknown',
  3: 'copyright',
  4: 'character',
  5: 'meta',
};
const TAG_CATEGORY_LABELS = new Map(
  Object.entries(TAG_CATEGORIES).map(([label, id]) => [id, label])
);
const TAG_CATEGORY_COLORS = {
  general: '#2f80ed',
  artist: '#eb5757',
  copyright: '#9b51e0',
  character: '#27ae60',
  meta: '#f2c94c',
  unknown: '#828282',
};
const TAG_LIST_CATEGORY_IDS = [0, 1, 3, 4, 5];
const TAG_LIST_ALLOWED_CATEGORY_IDS = new Set(TAG_LIST_CATEGORY_IDS);
const DEFAULT_IGNORE_TAGS = new Set([
  '',
  'absurdres',
  'alternate_costume',
  'alternate_hair_length',
  'alternate_hairstyle',
  'artist_name',
  'breasts',
  'commentary',
  'comic',
  'cosplay',
  'english_commentary',
  'greyscale',
  'highres',
  'lineart',
  'looking_at_viewer',
  'lowres',
  'monochrome',
  'multiple_boys',
  'multiple_girls',
  'official_art',
  'sensitive',
  'solo',
  'speech_bubble',
  'text',
  'transparent_background',
]);
const ALWAYS_KEEP_TAGS = new Set([
  '1boy',
  '1girl',
  'adult',
  'boy',
  'flat_chest',
  'girl',
  'huge_breasts',
  'large_breasts',
  'loli',
  'mature_female',
  'medium_breasts',
  'old_man',
  'old_woman',
  'oppai',
  'pettanko',
  'shota',
  'small_breasts',
]);
const ATTRIBUTE_KEYWORDS = [
  'apron',
  'armor',
  'ascot',
  'bag',
  'bangs',
  'belt',
  'bikini',
  'blazer',
  'boots',
  'bow',
  'bra',
  'bracelet',
  'breasts',
  'buttons',
  'cape',
  'cardigan',
  'choker',
  'cleavage',
  'coat',
  'collar',
  'corset',
  'crown',
  'dress',
  'earrings',
  'ears',
  'eyes',
  'fang',
  'flower',
  'footwear',
  'frills',
  'garter',
  'glasses',
  'gloves',
  'goggles',
  'gown',
  'hair',
  'hat',
  'headband',
  'headphones',
  'headwear',
  'hood',
  'horns',
  'jacket',
  'jewelry',
  'kimono',
  'leotard',
  'mask',
  'necktie',
  'panties',
  'pants',
  'ribbon',
  'robe',
  'sailor',
  'sandals',
  'sash',
  'scarf',
  'serafuku',
  'shirt',
  'shoes',
  'shorts',
  'skirt',
  'sleeves',
  'socks',
  'stockings',
  'suit',
  'sweater',
  'swimsuit',
  'tail',
  'thighhighs',
  'tiara',
  'tie',
  'twintails',
  'uniform',
  'veil',
  'wings',
];
const ATTRIBUTE_PATTERNS = [
  /(?:^|_)hair$/,
  /(?:^|_)eyes?$/,
  /(?:^|_)sleeves?$/,
  /(?:^|_)skirt$/,
  /(?:^|_)dress$/,
  /(?:^|_)shirt$/,
  /(?:^|_)uniform$/,
  /(?:^|_)bow$/,
  /(?:^|_)ribbon$/,
  /(?:^|_)hat$/,
  /(?:^|_)gloves?$/,
  /(?:^|_)boots?$/,
  /(?:^|_)socks?$/,
  /(?:^|_)stockings?$/,
  /(?:^|_)thighhighs?$/,
];
const DENY_KEYWORDS = [
  'background',
  'blush',
  'camera',
  'censored',
  'cropped',
  'depth_of_field',
  'expression',
  'from_above',
  'from_behind',
  'from_below',
  'holding',
  'looking',
  'meme',
  'motion',
  'open_mouth',
  'outdoors',
  'panel',
  'parody',
  'perspective',
  'pose',
  'profile',
  'rating',
  'sitting',
  'smile',
  'standing',
  'tears',
  'upper_body',
  'watermark',
];

function parseArgs(argv) {
  const options = {
    characterTagsCsv: DEFAULT_CHARACTER_TAGS_CSV,
    characterSource: 'danbooru',
    controlFile: '',
    appendCopyright: true,
    concurrency: 4,
    delayMs: 0,
    limit: 100,
    maxAttributes: 12,
    minCharacterPosts: 100,
    minFrequency: 0.12,
    minTagPosts: null,
    outFile: DEFAULT_OUT_FILE,
    outputLanguage: 'canonical',
    pageConcurrency: 2,
    postFilter: 'solo',
    postSample: 100,
    removeUnderscores: false,
    seriesPostSample: 200,
    seriesTag: '',
    tag: '',
    tagCategory: 0,
    mode: 'character-attributes',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--mode' && next) {
      options.mode = parseMode(next);
      if (options.mode === 'tags' && options.outFile === DEFAULT_OUT_FILE) options.outFile = DEFAULT_TAG_LIST_OUT_FILE;
      i += 1;
    } else if (arg.startsWith('--mode=')) {
      options.mode = parseMode(arg.slice('--mode='.length));
      if (options.mode === 'tags' && options.outFile === DEFAULT_OUT_FILE) options.outFile = DEFAULT_TAG_LIST_OUT_FILE;
    } else if (arg === '--tags') {
      options.mode = 'tags';
      if (options.outFile === DEFAULT_OUT_FILE) options.outFile = DEFAULT_TAG_LIST_OUT_FILE;
    } else if (arg === '--all') {
      options.limit = Number.POSITIVE_INFINITY;
    } else if (arg === '--interactive' || arg === '-i') {
      options.interactive = true;
    } else if (arg === '--remove-underscores') {
      options.removeUnderscores = true;
    } else if (arg === '--output-language' && next) {
      options.outputLanguage = normalizeOutputLanguage(next);
      i += 1;
    } else if (arg.startsWith('--output-language=')) {
      options.outputLanguage = normalizeOutputLanguage(arg.slice('--output-language='.length));
    } else if (arg === '--no-append-copyright') {
      options.appendCopyright = false;
    } else if (arg === '--tag-category' && next) {
      options.tagCategory = parseTagCategory(next);
      i += 1;
    } else if (arg.startsWith('--tag-category=')) {
      options.tagCategory = parseTagCategory(arg.slice('--tag-category='.length));
    } else if (arg === '--character-source' && next) {
      options.characterSource = parseCharacterSource(next);
      i += 1;
    } else if (arg.startsWith('--character-source=')) {
      options.characterSource = parseCharacterSource(arg.slice('--character-source='.length));
    } else if (arg === '--character-tags-csv' && next) {
      options.characterTagsCsv = path.resolve(next);
      options.characterSource = 'csv';
      i += 1;
    } else if (arg.startsWith('--character-tags-csv=')) {
      options.characterTagsCsv = path.resolve(arg.slice('--character-tags-csv='.length));
      options.characterSource = 'csv';
    } else if (arg === '--out-file' && next) {
      options.outFile = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--out-file=')) {
      options.outFile = path.resolve(arg.slice('--out-file='.length));
    } else if (arg === '--control-file' && next) {
      options.controlFile = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--control-file=')) {
      options.controlFile = path.resolve(arg.slice('--control-file='.length));
    } else if (arg === '--limit' && next) {
      options.limit = parseLimit(next);
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseLimit(arg.slice('--limit='.length));
    } else if (arg === '--post-sample' && next) {
      options.postSample = Math.min(MAX_POST_LIMIT, parsePositiveInt(next, 'post-sample'));
      i += 1;
    } else if (arg.startsWith('--post-sample=')) {
      options.postSample = Math.min(MAX_POST_LIMIT, parsePositiveInt(arg.slice('--post-sample='.length), 'post-sample'));
    } else if (arg === '--max-attributes' && next) {
      options.maxAttributes = parsePositiveInt(next, 'max-attributes');
      i += 1;
    } else if (arg.startsWith('--max-attributes=')) {
      options.maxAttributes = parsePositiveInt(arg.slice('--max-attributes='.length), 'max-attributes');
    } else if (arg === '--min-character-posts' && next) {
      options.minCharacterPosts = parseNonNegativeInt(next, 'min-character-posts');
      i += 1;
    } else if (arg.startsWith('--min-character-posts=')) {
      options.minCharacterPosts = parseNonNegativeInt(arg.slice('--min-character-posts='.length), 'min-character-posts');
    } else if (arg === '--min-tag-posts' && next) {
      options.minTagPosts = parseNonNegativeInt(next, 'min-tag-posts');
      i += 1;
    } else if (arg.startsWith('--min-tag-posts=')) {
      options.minTagPosts = parseNonNegativeInt(arg.slice('--min-tag-posts='.length), 'min-tag-posts');
    } else if (arg === '--min-frequency' && next) {
      options.minFrequency = parseFrequency(next);
      i += 1;
    } else if (arg.startsWith('--min-frequency=')) {
      options.minFrequency = parseFrequency(arg.slice('--min-frequency='.length));
    } else if (arg === '--delay-ms' && next) {
      options.delayMs = parseNonNegativeInt(next, 'delay-ms');
      i += 1;
    } else if (arg.startsWith('--delay-ms=')) {
      options.delayMs = parseNonNegativeInt(arg.slice('--delay-ms='.length), 'delay-ms');
    } else if (arg === '--concurrency' && next) {
      options.concurrency = parsePositiveInt(next, 'concurrency');
      i += 1;
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parsePositiveInt(arg.slice('--concurrency='.length), 'concurrency');
    } else if (arg === '--page-concurrency' && next) {
      options.pageConcurrency = parsePositiveInt(next, 'page-concurrency');
      i += 1;
    } else if (arg.startsWith('--page-concurrency=')) {
      options.pageConcurrency = parsePositiveInt(arg.slice('--page-concurrency='.length), 'page-concurrency');
    } else if (arg === '--post-filter' && next) {
      options.postFilter = next;
      i += 1;
    } else if (arg.startsWith('--post-filter=')) {
      options.postFilter = arg.slice('--post-filter='.length);
    } else if ((arg === '--series' || arg === '--copyright') && next) {
      options.seriesTag = normalizeTag(next);
      options.characterSource = 'series';
      i += 1;
    } else if (arg.startsWith('--series=')) {
      options.seriesTag = normalizeTag(arg.slice('--series='.length));
      options.characterSource = 'series';
    } else if (arg.startsWith('--copyright=')) {
      options.seriesTag = normalizeTag(arg.slice('--copyright='.length));
      options.characterSource = 'series';
    } else if (arg === '--series-post-sample' && next) {
      options.seriesPostSample = parseLimit(next);
      i += 1;
    } else if (arg.startsWith('--series-post-sample=')) {
      options.seriesPostSample = parseLimit(arg.slice('--series-post-sample='.length));
    } else if (arg === '--tag' && next) {
      options.tag = normalizeTag(next);
      options.characterSource = 'single';
      options.limit = 1;
      i += 1;
    } else if (arg.startsWith('--tag=')) {
      options.tag = normalizeTag(arg.slice('--tag='.length));
      options.characterSource = 'single';
      options.limit = 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'character-attributes' || normalized === 'tags') return normalized;
  throw new Error('--mode must be "character-attributes" or "tags".');
}

function parseTagCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'all') return 'all';

  const categoryId = /^\d+$/.test(normalized)
    ? Number(normalized)
    : TAG_CATEGORIES[normalized];

  if (!Number.isInteger(categoryId) || categoryId < 0 || categoryId > 5) {
    throw new Error('--tag-category must be a Danbooru category number from 0-5.');
  }
  if (!TAG_LIST_ALLOWED_CATEGORY_IDS.has(categoryId)) {
    throw new Error('--tag-category must be all, 0 general, 1 artist, 3 copyright, 4 character, or 5 meta.');
  }

  return categoryId;
}

function parseCharacterSource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'danbooru' || normalized === 'csv' || normalized === 'series') {
    return normalized;
  }

  throw new Error('--character-source must be "danbooru", "csv", or "series".');
}

async function promptForOutputLanguage(rl) {
  console.log('\nOptional localized search aliases:');
  console.log('  1. Off - canonical tags only');
  console.log('  2. Japanese');
  console.log('  3. Chinese');
  const choice = (await ask(rl, 'Choice [1]: ', '1')).trim();
  if (choice === '2') return 'ja';
  if (choice === '3') return 'zh-CN';
  return 'canonical';
}

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }

  return parsed;
}

function parseLimit(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'all') return Number.POSITIVE_INFINITY;
  return parsePositiveInt(value, 'limit');
}

function parseNonNegativeInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be 0 or a positive integer.`);
  }

  return parsed;
}

function parseFrequency(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error('--min-frequency must be between 0 and 1.');
  }

  return parsed;
}

function printHelp() {
  console.log(`
Create Danbooru CSVs for character attributes or plain tag lists.

Usage:
  bun scripts/danbooru-character-attributes-csv.mjs [options]
  bun scripts/danbooru-character-attributes-csv.mjs --interactive

Recommended:
  Run --interactive for a guided menu.

Options:
  -i, --interactive            Open a prompt menu
  --mode <value>               character-attributes or tags. Default: character-attributes
  --tags                       Shortcut for --mode tags
  --tag-category <value>       Tag CSV category: all, 0 general, 1 artist, 3 copyright, 4 character, or 5 meta
  --remove-underscores         Output tags with spaces instead of underscores
  --output-language <value>    Optional search aliases: canonical (default), ja, or zh-CN
  --no-append-copyright        Do not append copyright to ambiguous character names
  --character-source <value>   Character list source: danbooru or csv. Default: danbooru
  --character-tags-csv <path>  Input character tag CSV when using --character-source csv
  --out-file <path>            Output CSV. Default: User/PowerPrompter/CSV/Characters/danbooru-character-attributes.csv
  --limit <number>             Rows to process, per category in all-category tag mode. Default: 100
  --all                        Process every matching character or selected-category tag
  --tag <danbooru_tag>         Process a single character tag instead of the CSV list
  --series <danbooru_tag>      Find characters from recent posts for a series/copyright tag
  --copyright <danbooru_tag>   Alias for --series
  --series-post-sample <num>   Recent series posts to scan, or all. Default: 200
  --post-sample <number>       Danbooru posts sampled per character, max 200. Default: 100
  --max-attributes <number>    Max attributes per character. Default: 12
  --min-character-posts <num>  Minimum Danbooru post count / series appearances. Default: 100
  --min-tag-posts <num>        Minimum post count. Defaults: general 150, artist 100, other categories 10
  --min-frequency <0..1>       How common a tag must be to keep it. Default: 0.12
  --post-filter <tags>         Extra Danbooru filters, comma-separated. Use underscores inside tags. Default: "solo"
  --concurrency <number>       Parallel Danbooru post requests. Default: 4
  --page-concurrency <number>  Parallel series-discovery page requests. Default: 2
  --delay-ms <number>          Delay after each request inside each worker. Default: 0
  -h, --help                   Show this help

Output format:
  character mode: character,attributes
  tags mode: tag,category,color,post_count,classifiers
  ja/zh-CN add localized_name and localized_aliases columns while preserving canonical prompt columns

Examples:
  bun scripts/danbooru-character-attributes-csv.mjs --interactive
  bun scripts/danbooru-character-attributes-csv.mjs --tags --tag-category all --all
  bun scripts/danbooru-character-attributes-csv.mjs --tags --tag-category 0 --limit 1000
  bun scripts/danbooru-character-attributes-csv.mjs --tag hatsune_miku
  bun scripts/danbooru-character-attributes-csv.mjs --series zenless_zone_zero --limit 50
  bun scripts/danbooru-character-attributes-csv.mjs --limit 100 --post-filter "solo, rating:g"
  bun scripts/danbooru-character-attributes-csv.mjs --all --concurrency 4
`);
}

async function promptForOptions(options) {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nDanbooru Character Outfit CSV\n');
    console.log('What do you want to make?');
    console.log('  1. Character attributes CSV');
    console.log('  2. Plain Danbooru tag CSV');
    const outputMode = (await ask(rl, '\nChoice [1]: ', '1')).trim();
    if (outputMode === '2') {
      options.mode = 'tags';
      options.outFile = DEFAULT_TAG_LIST_OUT_FILE;
      console.log('\nChoose tag category:');
      console.log('  A. All supported categories');
      console.log('  0. General');
      console.log('  1. Artist');
      console.log('  3. Copyright');
      console.log('  4. Character');
      console.log('  5. Meta');
      const categoryChoice = (await ask(rl, '\nChoice [A]: ', 'all')).trim();
      options.tagCategory = parseTagCategory(categoryChoice === 'a' ? 'all' : categoryChoice || 'all');
      if (options.minTagPosts === null && options.tagCategory !== 'all') {
        options.minTagPosts = getDefaultMinTagPosts(options.tagCategory);
      }
      options.limit = parseLimit(await ask(rl, `How many tags? Type all for everything. [${formatLimit(options.limit)}]: `, formatLimit(options.limit)));
      if (options.tagCategory === 'all') {
        const minimum = await ask(rl, 'Minimum tag post count [category defaults]: ', '');
        options.minTagPosts = minimum ? parseNonNegativeInt(minimum, 'min-tag-posts') : null;
      } else {
        options.minTagPosts = parseNonNegativeInt(await ask(rl, `Minimum tag post count [${options.minTagPosts}]: `, String(options.minTagPosts)), 'min-tag-posts');
      }
      options.removeUnderscores = parseYesNo(await ask(rl, 'Output tags with spaces instead of underscores? [y/N]: ', 'n'));
      options.outputLanguage = await promptForOutputLanguage(rl);
      const outFile = await ask(rl, `Output CSV path [${path.relative(repoRoot, options.outFile)}]: `, options.outFile);
      options.outFile = path.resolve(outFile);
      console.log('\nReady to scan.');
      console.log(`Mode: tags`);
      console.log(`Category: ${options.tagCategory === 'all' ? 'all supported categories' : `${options.tagCategory} (${TAG_CATEGORY_NAMES[options.tagCategory] || 'unknown'})`}`);
      console.log(`Tags: ${formatLimit(options.limit)}`);
      console.log(`Minimum tag post count: ${options.minTagPosts ?? 'category defaults'}`);
      console.log(`Remove underscores: ${options.removeUnderscores ? 'yes' : 'no'}`);
      console.log(`Localized aliases: ${options.outputLanguage}`);
      console.log(`Output: ${path.relative(repoRoot, options.outFile)}\n`);
      const confirm = (await ask(rl, 'Run now? [Y/n]: ', 'y')).trim().toLowerCase();
      if (confirm && confirm !== 'y' && confirm !== 'yes') {
        options.cancelled = true;
      }
      return options;
    }

    options.mode = 'character-attributes';
    console.log('\nThis creates a two-column CSV:');
    console.log('  character, attributes');
    console.log('Example:');
    console.log('  hatsune_miku, "1girl, twintails, detached_sleeves, skirt"\n');
    console.log('Choose what characters to scan:');
    console.log('  1. Top Danbooru characters');
    console.log('  2. One character I already know');
    console.log('  3. Characters from a local CSV');
    console.log('  4. Recent characters from a series/copyright tag');
    const mode = (await ask(rl, '\nChoice [1]: ', '1')).trim();

    if (mode === '2') {
      const tag = await ask(rl, 'Danbooru character tag, e.g. hatsune_miku: ', '');
      options.tag = normalizeTag(tag);
      if (!options.tag) throw new Error('Character tag is required.');
      options.characterSource = 'single';
      options.limit = 1;
    } else if (mode === '3') {
      options.characterSource = 'csv';
      const csvPath = await ask(rl, `Character CSV path [${path.relative(repoRoot, options.characterTagsCsv)}]: `, options.characterTagsCsv);
      options.characterTagsCsv = path.resolve(csvPath);
      options.limit = parseLimit(await ask(rl, `How many characters from the CSV? Type all for everything. [${formatLimit(options.limit)}]: `, formatLimit(options.limit)));
    } else if (mode === '4') {
      options.characterSource = 'series';
      options.seriesTag = normalizeTag(await ask(rl, 'Series/copyright tag, e.g. zenless_zone_zero: ', ''));
      if (!options.seriesTag) throw new Error('Series/copyright tag is required.');
      options.seriesPostSample = parseLimit(await ask(rl, `Recent series posts to scan. Type all for everything. [${formatLimit(options.seriesPostSample)}]: `, formatLimit(options.seriesPostSample)));
      options.limit = parseLimit(await ask(rl, `How many discovered characters? Type all for everything. [${formatLimit(options.limit)}]: `, formatLimit(options.limit)));
    } else {
      options.characterSource = 'danbooru';
      options.limit = parseLimit(await ask(rl, `How many top Danbooru characters? Type all for everything. [${formatLimit(options.limit)}]: `, formatLimit(options.limit)));
    }

    console.log('\nChoose how picky the attribute picker should be:');
    console.log('  1. Balanced - good default');
    console.log('  2. Strict - fewer, more repeated outfit/body tags');
    console.log('  3. Loose - more tags, may include weaker guesses');
    applyPickerPreset(options, (await ask(rl, '\nChoice [1]: ', '1')).trim());

    if (parseYesNo(await ask(rl, 'Customize image count / attribute count? [y/N]: ', 'n'))) {
      options.postSample = Math.min(
        MAX_POST_LIMIT,
        parsePositiveInt(await ask(rl, `Images to check per character, max ${MAX_POST_LIMIT} [${options.postSample}]: `, String(options.postSample)), 'post-sample')
      );
      options.maxAttributes = parsePositiveInt(await ask(rl, `Attributes to keep per character [${options.maxAttributes}]: `, String(options.maxAttributes)), 'max-attributes');
      options.minCharacterPosts = parseNonNegativeInt(await ask(rl, `Minimum character posts/appearances [${options.minCharacterPosts}]: `, String(options.minCharacterPosts)), 'min-character-posts');
      options.minFrequency = parseFrequency(await ask(rl, `Picky score 0..1, higher means stricter [${options.minFrequency}]: `, String(options.minFrequency)));
    }

    options.concurrency = parsePositiveInt(await ask(rl, `Download speed: parallel requests [${options.concurrency}]: `, String(options.concurrency)), 'concurrency');
    if (options.characterSource === 'series') {
      options.pageConcurrency = parsePositiveInt(await ask(rl, `Series page scan speed: parallel pages [${options.pageConcurrency}]: `, String(options.pageConcurrency)), 'page-concurrency');
    }

    options.postFilter = await ask(
      rl,
      `\nExtra Danbooru filters [${formatPostFilterForPrompt(options.postFilter)}]\nUse underscores inside tags and commas between tags.\nExample: solo, rating:g, score:>5\nFilters: `,
      formatPostFilterForPrompt(options.postFilter)
    );
    options.removeUnderscores = parseYesNo(await ask(rl, '\nOutput tags with spaces instead of underscores? [y/N]: ', 'n'));
    options.outputLanguage = await promptForOutputLanguage(rl);
    options.appendCopyright = parseYesNo(await ask(rl, 'Append copyright to character names when missing? [Y/n]: ', 'y'));

    const outFile = await ask(rl, `Output CSV path [${path.relative(repoRoot, options.outFile)}]: `, options.outFile);
    options.outFile = path.resolve(outFile);

    console.log('\nReady to scan.');
    console.log(`Source: ${options.characterSource}`);
    if (options.characterSource === 'series') console.log(`Series: ${options.seriesTag}`);
    console.log(`Characters: ${options.characterSource === 'single' ? options.tag : formatLimit(options.limit)}`);
    console.log(`Images checked: ${options.postSample}`);
    console.log(`Attributes: ${options.maxAttributes}`);
    console.log(`Minimum character posts/appearances: ${options.minCharacterPosts}`);
    console.log(`Picky score: ${options.minFrequency}`);
    console.log(`Parallel requests: ${options.concurrency}`);
    if (options.characterSource === 'series') console.log(`Parallel series pages: ${options.pageConcurrency}`);
    console.log(`Filters: ${normalizePostFilter(options.postFilter) || '(none)'}`);
    console.log(`Remove underscores: ${options.removeUnderscores ? 'yes' : 'no'}`);
    console.log(`Localized aliases: ${options.outputLanguage}`);
    console.log(`Append copyright: ${options.appendCopyright ? 'yes' : 'no'}`);
    console.log(`Output: ${path.relative(repoRoot, options.outFile)}\n`);

    const confirm = (await ask(rl, 'Run now? [Y/n]: ', 'y')).trim().toLowerCase();
    if (confirm && confirm !== 'y' && confirm !== 'yes') {
      options.cancelled = true;
    }

    return options;
  } finally {
    rl.close();
  }
}

function parseYesNo(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes' || normalized === 'true' || normalized === '1';
}

function applyPickerPreset(options, preset) {
  if (preset === '2') {
    options.postSample = 160;
    options.maxAttributes = 10;
    options.minFrequency = 0.18;
    return;
  }

  if (preset === '3') {
    options.postSample = 80;
    options.maxAttributes = 16;
    options.minFrequency = 0.08;
    return;
  }

  options.postSample = 100;
  options.maxAttributes = 12;
  options.minFrequency = 0.12;
}

function formatLimit(limit) {
  return Number.isFinite(limit) ? String(limit) : 'all';
}

async function ask(rl, question, fallback) {
  const answer = await rl.question(question);
  const trimmed = String(answer || '').trim();
  return trimmed || fallback;
}

async function fetchCharacterTagsFromDanbooru(limit, options) {
  const tags = [];
  let page = 1;

  console.log(`Loading ${formatLimit(limit)} character tags from Danbooru...`);
  while (tags.length < limit) {
    await waitForGeneratorControl();
    const remaining = Number.isFinite(limit) ? limit - tags.length : DANBOORU_MAX_TAG_LIMIT;
    const pageLimit = Math.min(DANBOORU_MAX_TAG_LIMIT, remaining);
    const url = new URL(DANBOORU_TAGS_URL);
    url.searchParams.set('limit', String(pageLimit));
    url.searchParams.set('page', String(page));
    url.searchParams.set('search[category]', '4');
    url.searchParams.set('search[order]', 'count');
    if (options.minCharacterPosts > 0) {
      url.searchParams.set('search[post_count]', `>=${options.minCharacterPosts}`);
    }

    const response = await danbooruFetch(url, 'character tag list');
    const pageTags = await response.json();
    if (!Array.isArray(pageTags) || pageTags.length === 0) break;

    for (const tag of pageTags) {
      const postCount = Number(tag?.post_count || 0);
      if (postCount < options.minCharacterPosts) continue;
      const name = normalizeTag(tag?.name);
      if (name) tags.push(name);
      if (tags.length >= limit) break;
    }

    if (pageTags.length < pageLimit) break;
    console.log(`  character tag page ${page}: ${tags.length.toLocaleString()} found`);
    page += 1;
  }

  console.log(`Loaded ${tags.length.toLocaleString()} character tags.\n`);
  return tags;
}

async function fetchTagRowsForCategory(options, categoryId, onProgress) {
  const rows = [];
  let page = 1;
  let beforeId = '';
  const categoryName = TAG_CATEGORY_NAMES[categoryId] || 'unknown';
  const minPostCount = options.minTagPosts ?? getDefaultMinTagPosts(categoryId);
  const useStableFullCatalogPagination = !Number.isFinite(options.limit);

  console.log(`Loading ${formatLimit(options.limit)} category ${categoryId} (${categoryName}) tags from Danbooru...`);
  if (minPostCount > 0) {
    console.log(`  minimum post count: ${minPostCount.toLocaleString()}`);
  }
  while (rows.length < options.limit) {
    await waitForGeneratorControl();
    const remaining = Number.isFinite(options.limit) ? options.limit - rows.length : DANBOORU_MAX_TAG_LIMIT;
    const pageLimit = Math.min(DANBOORU_MAX_TAG_LIMIT, remaining);
    const url = new URL(DANBOORU_TAGS_URL);
    url.searchParams.set('limit', String(pageLimit));
    url.searchParams.set('search[category]', String(categoryId));
    if (useStableFullCatalogPagination) {
      url.searchParams.set('search[order]', 'date');
      if (beforeId) url.searchParams.set('page', `b${beforeId}`);
    } else {
      url.searchParams.set('page', String(page));
      url.searchParams.set('search[order]', 'count');
    }
    if (minPostCount > 0) {
      url.searchParams.set('search[post_count]', `>=${minPostCount}`);
    }

    const response = await danbooruFetch(url, `category ${categoryId} tag list`);
    const tags = await response.json();
    if (!Array.isArray(tags) || tags.length === 0) break;

    for (const tag of tags) {
      const postCount = Math.max(0, Math.floor(Number(tag?.post_count) || 0));
      if (postCount < minPostCount) continue;
      const name = normalizeTag(tag?.name);
      if (!name) continue;
      const category = Number(tag?.category);
      rows.push({
        category,
        classifiers: classifyDanbooruTag(name, category),
        color: TAG_CATEGORY_COLORS[TAG_CATEGORY_LABELS.get(category) || 'unknown'] || TAG_CATEGORY_COLORS.unknown,
        postCount,
        tag: name,
        options,
      });
      if (rows.length >= options.limit) break;
    }

    console.log(`  tag page ${page}: ${rows.length.toLocaleString()} found`);
    if (typeof onProgress === 'function') await onProgress(rows);
    if (tags.length < pageLimit) break;
    if (useStableFullCatalogPagination) {
      const nextBeforeId = String(tags.at(-1)?.id || '');
      if (!nextBeforeId || nextBeforeId === beforeId) break;
      beforeId = nextBeforeId;
    }
    page += 1;
  }

  console.log(`Loaded ${rows.length.toLocaleString()} category ${categoryId} tags.\n`);
  return rows;
}

async function fetchTagRowsFromDanbooru(options) {
  const categoryIds = options.tagCategory === 'all'
    ? TAG_LIST_CATEGORY_IDS
    : [options.tagCategory];
  const rows = [];
  const seenTags = new Set();

  for (const categoryId of categoryIds) {
    const categoryRows = await fetchTagRowsForCategory(options, categoryId, async (partialRows) => {
      if (typeof options.writeRows === 'function') {
        await options.writeRows([...rows, ...partialRows]);
      }
    });
    for (const row of categoryRows) {
      if (seenTags.has(row.tag)) continue;
      seenTags.add(row.tag);
      rows.push(row);
    }
    if (typeof options.writeRows === 'function') await options.writeRows(rows);
  }

  rows.sort((left, right) => (
    left.category - right.category
    || right.postCount - left.postCount
    || left.tag.localeCompare(right.tag)
  ));

  console.log(`Loaded ${rows.length.toLocaleString()} total tags across ${categoryIds.length} categor${categoryIds.length === 1 ? 'y' : 'ies'}.\n`);
  return rows;
}

function getDefaultMinTagPosts(categoryId) {
  if (categoryId === 0) return DEFAULT_GENERAL_TAG_MIN_POSTS;
  if (categoryId === 1) return DEFAULT_ARTIST_TAG_MIN_POSTS;
  return DEFAULT_CONTEXT_TAG_MIN_POSTS;
}

async function loadCharacterTags(filePath, limit) {
  const text = await readFile(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const startIndex = lines[0]?.split(',')[0]?.trim().toLowerCase() === 'tag' ? 1 : 0;
  const tags = [];
  const seen = new Set();

  for (const line of lines.slice(startIndex)) {
    const tag = normalizeTag(line.split(',')[0]);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= limit) break;
  }

  return tags;
}

async function fetchCharacterTagsFromSeries(seriesTag, options) {
  const counts = new Map();
  const firstSeen = new Map();
  let page = 1;
  let seenPosts = 0;
  let stop = false;

  console.log(`Discovering characters from ${seriesTag} posts...`);
  console.log(`  posts to scan: ${formatLimit(options.seriesPostSample)}`);
  console.log(`  parallel pages: ${options.pageConcurrency}`);

  while (!stop && seenPosts < options.seriesPostSample) {
    await waitForGeneratorControl();
    const pageJobs = [];
    for (let i = 0; i < options.pageConcurrency; i += 1) {
      if (Number.isFinite(options.seriesPostSample) && seenPosts + (i * MAX_POST_LIMIT) >= options.seriesPostSample) break;
      const remaining = Number.isFinite(options.seriesPostSample)
        ? options.seriesPostSample - seenPosts - (i * MAX_POST_LIMIT)
        : MAX_POST_LIMIT;
      const pageLimit = Math.min(MAX_POST_LIMIT, remaining);
      if (pageLimit <= 0) break;
      const pageNumber = page + i;
      pageJobs.push(fetchSeriesPage(seriesTag, pageNumber, pageLimit));
    }

    if (pageJobs.length === 0) break;
    const pages = await Promise.all(pageJobs);
    pages.sort((a, b) => a.page - b.page);

    for (const pageResult of pages) {
      const posts = pageResult.posts;
      if (!Array.isArray(posts) || posts.length === 0) {
        stop = true;
        break;
      }

      for (const post of posts) {
        if (seenPosts >= options.seriesPostSample) break;
        seenPosts += 1;
        const characterTags = String(post?.tag_string_character || '').split(/\s+/).map(normalizeTag).filter(Boolean);
        for (const character of new Set(characterTags)) {
          counts.set(character, (counts.get(character) || 0) + 1);
          if (!firstSeen.has(character)) firstSeen.set(character, seenPosts);
        }
      }

      console.log(
        `  page ${pageResult.page}: ${seenPosts.toLocaleString()} posts scanned, ${counts.size.toLocaleString()} characters found`
      );

      if (posts.length < pageResult.limit || seenPosts >= options.seriesPostSample) {
        stop = true;
        break;
      }
    }

    page += pageJobs.length;
  }

  const limit = options.limit;
  const characters = Array.from(counts.entries())
    .filter(([, count]) => count >= options.minCharacterPosts)
    .sort((a, b) => firstSeen.get(a[0]) - firstSeen.get(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map(([character]) => character);
  console.log(`Discovered ${characters.length.toLocaleString()} characters from ${seenPosts.toLocaleString()} posts after minimum ${options.minCharacterPosts.toLocaleString()} appearances.\n`);
  return characters;
}

async function fetchSeriesPage(seriesTag, page, limit) {
  const url = new URL(DANBOORU_POSTS_URL);
  url.searchParams.set('tags', seriesTag);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('page', String(page));

  const response = await danbooruFetch(url, `series ${seriesTag} page ${page}`);
  const posts = await response.json();
  return {
    limit,
    page,
    posts: Array.isArray(posts) ? posts : [],
  };
}

async function fetchPostsForCharacter(characterTag, options) {
  const tags = [characterTag, normalizePostFilter(options.postFilter)].filter(Boolean).join(' ').trim();
  const url = new URL(DANBOORU_POSTS_URL);
  url.searchParams.set('tags', tags);
  url.searchParams.set('limit', String(options.postSample));

  const response = await danbooruFetch(url, characterTag);

  const posts = await response.json();
  return Array.isArray(posts) ? posts : [];
}

async function danbooruFetch(url, label, attempt = 1) {
  await waitForGeneratorControl();
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'UmbraStudioDanbooruCharacterAttributes/1.0',
    },
  });

  if (response.ok) return response;
  if ((response.status === 429 || response.status >= 500) && attempt < MAX_FETCH_ATTEMPTS) {
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    const waitMs = retryAfter > 0
      ? retryAfter * 1000
      : response.status === 429
        ? Math.min(60_000, 5_000 * attempt)
        : Math.min(20_000, 1_000 * attempt);
    console.warn(`Danbooru returned ${response.status} for ${label}; retrying in ${Math.round(waitMs / 1000)}s (${attempt + 1}/${MAX_FETCH_ATTEMPTS})...`);
    await controlledSleep(waitMs);
    return danbooruFetch(url, label, attempt + 1);
  }

  throw new Error(`Danbooru request failed for ${label}: ${response.status} ${response.statusText}`);
}

function normalizePostFilter(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'none') return '';
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(' ');
}

function formatPostFilterForPrompt(value) {
  return String(value || '').trim().replace(/\s+/g, ', ') || 'none';
}

function getCommonAttributes(characterTag, posts, options) {
  const counts = new Map();
  let usablePostCount = 0;

  for (const post of posts) {
    const generalTags = String(post?.tag_string_general || '').split(/\s+/).map(normalizeTag).filter(Boolean);
    if (generalTags.length === 0) continue;
    usablePostCount += 1;

    for (const tag of new Set(generalTags)) {
      if (tag === characterTag || !isCharacterAttributeTag(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const minCount = Math.max(1, Math.ceil(usablePostCount * options.minFrequency));
  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => getTagPriority(a[0]) - getTagPriority(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, options.maxAttributes);
}

function getPrimaryCopyright(posts) {
  const counts = new Map();

  for (const post of posts) {
    const copyrightTags = String(post?.tag_string_copyright || '').split(/\s+/).map(normalizeTag).filter(Boolean);
    for (const tag of new Set(copyrightTags)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
}

function formatCharacterTag(character, copyright, options) {
  const tag = String(character || '').trim();
  if (!options.appendCopyright) return tag;
  if (!copyright) return tag;
  if (tag.endsWith(`_(${copyright})`) || tag.includes(`_(${copyright})`)) return tag;
  if (/\([^)]+\)$/.test(tag)) return tag;
  return `${tag}_(${copyright})`;
}

function isCharacterAttributeTag(tag) {
  if (!tag || DEFAULT_IGNORE_TAGS.has(tag)) return false;
  if (DENY_KEYWORDS.some((keyword) => tag === keyword || tag.includes(keyword))) return false;
  if (ALWAYS_KEEP_TAGS.has(tag)) return true;
  if (ATTRIBUTE_KEYWORDS.some((keyword) => tag === keyword || tag.includes(keyword))) return true;
  return ATTRIBUTE_PATTERNS.some((pattern) => pattern.test(tag));
}

function getTagPriority(tag) {
  if (tag === '1girl' || tag === '1boy') return 0;
  if (/^(loli|shota|adult|mature_|old_)/.test(tag)) return 1;
  if (tag.includes('breast') || tag === 'flat_chest' || tag === 'pettanko' || tag === 'oppai') return 2;
  if (isOutfitTag(tag)) return 3;
  if (tag.includes('hair') || tag.includes('eyes')) return 4;
  return 5;
}

function isOutfitTag(tag) {
  return ATTRIBUTE_KEYWORDS.some((keyword) => {
    if (keyword === 'hair' || keyword === 'eyes' || keyword === 'breasts') return false;
    return tag === keyword || tag.includes(keyword);
  });
}

function toCsv(rows, fallbackOptions = {}) {
  const localized = (rows[0]?.options || fallbackOptions).outputLanguage !== 'canonical';
  const headers = localized
    ? ['character', 'attributes', 'localized_name', 'localized_aliases']
    : ['character', 'attributes'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => {
      const canonicalCells = [
        csvCell(displayTag(row.character, row.options)),
        csvCell(row.attributes.map(([tag]) => displayTag(tag, row.options)).join(', ')),
      ];
      if (!localized) return canonicalCells.join(',');

      const characterLocalization = getLocalizedTag(row.options.localizationMap, row.localizationTag || row.character);
      const attributeAliases = row.attributes.flatMap(([tag]) => getLocalizedTag(row.options.localizationMap, tag).aliases);
      return [
        ...canonicalCells,
        csvCell(characterLocalization.name),
        csvCell(Array.from(new Set([...characterLocalization.aliases, ...attributeAliases])).join(', ')),
      ].join(',');
    }),
  ];

  return `${lines.join('\n')}\n`;
}

function tagRowsToCsv(rows, fallbackOptions = {}) {
  const localized = (rows[0]?.options || fallbackOptions).outputLanguage !== 'canonical';
  const headers = localized
    ? ['tag', 'category', 'color', 'post_count', 'classifiers', 'localized_name', 'localized_aliases']
    : ['tag', 'category', 'color', 'post_count', 'classifiers'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => {
      const canonicalCells = [
        csvCell(displayTag(row.tag, row.options)),
        csvCell(row.category),
        csvCell(row.color),
        csvCell(row.postCount),
        csvCell((row.classifiers || classifyDanbooruTag(row.tag, row.category)).join('|')),
      ];
      if (!localized) return canonicalCells.join(',');
      const localization = getLocalizedTag(row.options.localizationMap, row.tag);
      return [
        ...canonicalCells,
        csvCell(localization.name),
        csvCell(localization.aliases.join(', ')),
      ].join(',');
    }),
  ];

  return `${lines.join('\n')}\n`;
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function normalizeTag(tag) {
  return String(tag || '').trim().replaceAll(' ', '_').toLowerCase();
}

function displayTag(tag, options = {}) {
  const value = String(tag || '');
  return options.removeUnderscores ? value.replaceAll('_', ' ') : value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class GeneratorStoppedError extends Error {
  constructor() {
    super('Generator stopped by user.');
    this.name = 'GeneratorStoppedError';
  }
}

async function readGeneratorControl() {
  if (!runtimeControlFile) return { paused: false, stopRequested: false };
  try {
    const parsed = JSON.parse(await readFile(runtimeControlFile, 'utf8'));
    return {
      paused: parsed?.paused === true,
      stopRequested: parsed?.stopRequested === true,
    };
  } catch {
    return { paused: false, stopRequested: false };
  }
}

async function waitForGeneratorControl() {
  let control = await readGeneratorControl();
  if (control.stopRequested) throw new GeneratorStoppedError();
  while (control.paused) {
    if (!pauseWasAnnounced) {
      console.log('Generator paused. Completed rows are safely checkpointed.');
      pauseWasAnnounced = true;
    }
    await sleep(250);
    control = await readGeneratorControl();
    if (control.stopRequested) throw new GeneratorStoppedError();
  }
  if (pauseWasAnnounced) {
    console.log('Generator resumed.');
    pauseWasAnnounced = false;
  }
}

async function controlledSleep(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await waitForGeneratorControl();
    await sleep(Math.min(250, Math.max(0, deadline - Date.now())));
  }
}

async function mapWithConcurrency(items, concurrency, worker, onResult) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function runWorker() {
    while (nextIndex < items.length) {
      await waitForGeneratorControl();
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
      if (typeof onResult === 'function') await onResult(results.filter(Boolean));
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  runtimeControlFile = options.controlFile;
  if (options.help) {
    printHelp();
    return;
  }
  if (options.interactive || (process.argv.slice(2).length === 0 && process.stdin.isTTY)) {
    await promptForOptions(options);
  }
  if (options.cancelled) {
    console.log('Cancelled.');
    return;
  }
  options.localizationMap = await loadDanbooruLocalizationMap({
    cacheFile: DEFAULT_LOCALIZATION_CACHE_FILE,
    outputLanguage: options.outputLanguage,
    waitForControl: waitForGeneratorControl,
  });

  if (options.mode === 'tags') {
    await mkdir(path.dirname(options.outFile), { recursive: true });
    await writeFile(options.outFile, tagRowsToCsv([], options), 'utf8');
    options.writeRows = (rows) => writeFile(options.outFile, tagRowsToCsv(rows, options), 'utf8');
    const rows = await fetchTagRowsFromDanbooru(options);
    await writeFile(options.outFile, tagRowsToCsv(rows, options), 'utf8');
    console.log(`Wrote ${rows.length.toLocaleString()} tag rows to ${path.relative(repoRoot, options.outFile)}`);
    return;
  }

  const characters = options.characterSource === 'single'
    ? [options.tag]
    : options.characterSource === 'csv'
      ? await loadCharacterTags(options.characterTagsCsv, options.limit)
      : options.characterSource === 'series'
        ? await fetchCharacterTagsFromSeries(options.seriesTag, options)
        : await fetchCharacterTagsFromDanbooru(options.limit, options);
  await mkdir(path.dirname(options.outFile), { recursive: true });
  await writeFile(options.outFile, toCsv([], options), 'utf8');
  let checkpointWrite = Promise.resolve();
  const rows = await mapWithConcurrency(characters, options.concurrency, async (character, i) => {
    await waitForGeneratorControl();
    const posts = await fetchPostsForCharacter(character, options);
    const attributes = getCommonAttributes(character, posts, options);
    const copyright = options.characterSource === 'series' && options.seriesTag
      ? options.seriesTag
      : getPrimaryCopyright(posts);
    const outputCharacter = formatCharacterTag(character, copyright, options);
    console.log(`${i + 1}/${characters.length} ${character}: ${attributes.map(([tag]) => tag).join(', ') || '(no attributes)'}`);

    if (options.delayMs > 0) {
      await controlledSleep(options.delayMs);
    }
    return { character: outputCharacter, localizationTag: character, attributes, options };
  }, (completedRows) => {
    const csv = toCsv(completedRows, options);
    checkpointWrite = checkpointWrite.then(() => writeFile(options.outFile, csv, 'utf8'));
    return checkpointWrite;
  });

  await writeFile(options.outFile, toCsv(rows, options), 'utf8');
  console.log(`Wrote ${rows.length.toLocaleString()} character rows to ${path.relative(repoRoot, options.outFile)}`);
}

main().catch((error) => {
  if (error instanceof GeneratorStoppedError) {
    console.log('Generator stopped. The completed rows remain in the output CSV.');
    process.exitCode = GENERATOR_STOP_EXIT_CODE;
    return;
  }
  console.error(error.message);
  process.exitCode = 1;
});
