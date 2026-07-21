#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DANBOORU_TAGS_URL = 'https://danbooru.donmai.us/tags.json';
const MAX_PAGE_SIZE = 1000;
const TAG_CATEGORIES = {
  general: 0,
  artist: 1,
  copyright: 3,
  character: 4,
  meta: 5,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = {
    includeMetadata: false,
    limit: 1000,
    minPostCount: 0,
    outDir: path.join(repoRoot, 'User', 'DanbooruTags'),
    order: 'count',
    tagOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--include-metadata') {
      options.includeMetadata = true;
    } else if (arg === '--tag-only') {
      options.tagOnly = true;
    } else if (arg === '--limit' && next) {
      options.limit = parsePositiveInt(next, 'limit');
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInt(arg.slice('--limit='.length), 'limit');
    } else if (arg === '--min-post-count' && next) {
      options.minPostCount = parsePositiveInt(next, 'min-post-count', true);
      i += 1;
    } else if (arg.startsWith('--min-post-count=')) {
      options.minPostCount = parsePositiveInt(arg.slice('--min-post-count='.length), 'min-post-count', true);
    } else if (arg === '--out-dir' && next) {
      options.outDir = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--out-dir=')) {
      options.outDir = path.resolve(arg.slice('--out-dir='.length));
    } else if (arg === '--order' && next) {
      options.order = next;
      i += 1;
    } else if (arg.startsWith('--order=')) {
      options.order = arg.slice('--order='.length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInt(value, name, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  const valid = Number.isInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0);

  if (!valid) {
    throw new Error(`--${name} must be ${allowZero ? '0 or a positive integer' : 'a positive integer'}.`);
  }

  return parsed;
}

function printHelp() {
  console.log(`
Create Danbooru tag CSV samples.

Usage:
  node scripts/danbooru-tags-csv.mjs [options]
  bun run scripts/danbooru-tags-csv.mjs [options]

Options:
  --limit <number>           Number of tags per CSV. Default: 1000
  --min-post-count <number>  Only include tags with at least this many posts. Default: 0
  --out-dir <path>           Output folder. Default: User/DanbooruTags
  --order <value>            Danbooru tag order, usually count/name/date. Default: count
  --tag-only                 Write only a tag column, matching the older simple sample
  --include-metadata         Include category and post_count columns
  -h, --help                 Show this help

Output:
  danbooru-tags.csv
  danbooru-character-tags.csv
`);
}

async function fetchTagSample({ category, label, limit, minPostCount, order }) {
  const tags = [];
  let page = 1;

  while (tags.length < limit) {
    const pageLimit = Math.min(MAX_PAGE_SIZE, limit - tags.length);
    const url = new URL(DANBOORU_TAGS_URL);
    url.searchParams.set('limit', String(pageLimit));
    url.searchParams.set('page', String(page));
    url.searchParams.set('search[category]', String(category));
    url.searchParams.set('search[order]', order);

    if (minPostCount > 0) {
      url.searchParams.set('search[post_count]', `>=${minPostCount}`);
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'UmbraStudioDanbooruTagCsv/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Danbooru request failed for ${label} tags: ${response.status} ${response.statusText}`);
    }

    const pageTags = await response.json();
    if (!Array.isArray(pageTags) || pageTags.length === 0) {
      break;
    }

    tags.push(...pageTags);
    page += 1;
  }

  return tags.slice(0, limit).map((tag) => ({
    category: resolveCategoryLabel(tag.category, label),
    color: resolveCategoryColor(tag.category, label),
    post_count: tag.post_count ?? 0,
    tag: tag.name ?? '',
  }));
}

function resolveCategoryLabel(category, fallbackLabel) {
  const parsed = Number.parseInt(String(category), 10);
  return TAG_CATEGORY_LABELS.get(parsed) ?? fallbackLabel ?? 'unknown';
}

function resolveCategoryColor(category, fallbackLabel) {
  return TAG_CATEGORY_COLORS[resolveCategoryLabel(category, fallbackLabel)] ?? TAG_CATEGORY_COLORS.unknown;
}

function toCsv(rows, options) {
  let headers = ['tag', 'category', 'color'];
  if (options.tagOnly) {
    headers = ['tag'];
  } else if (options.includeMetadata) {
    headers = ['tag', 'category', 'color', 'post_count'];
  }

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
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

async function writeSample(options, label, category, fileName) {
  const rows = await fetchTagSample({
    category,
    label,
    limit: options.limit,
    minPostCount: options.minPostCount,
    order: options.order,
  });
  const csv = toCsv(rows, options);
  const outFile = path.join(options.outDir, fileName);

  await writeFile(outFile, csv, 'utf8');
  console.log(`Wrote ${rows.length.toLocaleString()} ${label} tags to ${path.relative(repoRoot, outFile)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  await mkdir(options.outDir, { recursive: true });
  await writeSample(options, 'general', TAG_CATEGORIES.general, 'danbooru-tags.csv');
  await writeSample(options, 'character', TAG_CATEGORIES.character, 'danbooru-character-tags.csv');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
