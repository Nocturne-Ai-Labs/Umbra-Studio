#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_DATASET_DIR = path.join(repoRoot, 'User', 'Datasets');
const DEFAULT_CHARACTER_TAGS_CSV = path.join(repoRoot, 'User', 'DanbooruTags', 'danbooru-character-tags.csv');
const DEFAULT_OUT_FILE = path.join(repoRoot, 'User', 'PowerPrompter', 'CSV', 'Characters', 'trained-character-tags.csv');
const CAPTION_EXTENSIONS = new Set(['.txt', '.caption']);
const DEFAULT_IGNORE_TAGS = new Set([
  '',
  '1boy',
  '1girl',
  '2boys',
  '2girls',
  '3boys',
  '3girls',
  '4boys',
  '4girls',
  '5boys',
  '5girls',
  '6+boys',
  '6+girls',
  'solo',
  'multiple_boys',
  'multiple_girls',
]);

function parseArgs(argv) {
  const options = {
    characterTagsCsv: DEFAULT_CHARACTER_TAGS_CSV,
    datasetDir: DEFAULT_DATASET_DIR,
    includeCounts: false,
    maxTags: 12,
    minCount: 2,
    outFile: DEFAULT_OUT_FILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--include-counts') {
      options.includeCounts = true;
    } else if (arg === '--dataset-dir' && next) {
      options.datasetDir = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--dataset-dir=')) {
      options.datasetDir = path.resolve(arg.slice('--dataset-dir='.length));
    } else if (arg === '--character-tags-csv' && next) {
      options.characterTagsCsv = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--character-tags-csv=')) {
      options.characterTagsCsv = path.resolve(arg.slice('--character-tags-csv='.length));
    } else if (arg === '--out-file' && next) {
      options.outFile = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--out-file=')) {
      options.outFile = path.resolve(arg.slice('--out-file='.length));
    } else if (arg === '--max-tags' && next) {
      options.maxTags = parsePositiveInt(next, 'max-tags');
      i += 1;
    } else if (arg.startsWith('--max-tags=')) {
      options.maxTags = parsePositiveInt(arg.slice('--max-tags='.length), 'max-tags');
    } else if (arg === '--min-count' && next) {
      options.minCount = parsePositiveInt(next, 'min-count');
      i += 1;
    } else if (arg.startsWith('--min-count=')) {
      options.minCount = parsePositiveInt(arg.slice('--min-count='.length), 'min-count');
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }

  return parsed;
}

function printHelp() {
  console.log(`
Create character trigger-tag CSV rows from local dataset captions.

Usage:
  node scripts/dataset-character-tags-csv.mjs [options]
  bun run dataset:character-tags [-- options]

Options:
  --dataset-dir <path>          Dataset root containing .txt/.caption sidecars. Default: User/Datasets
  --character-tags-csv <path>   Danbooru character tag CSV. Default: User/DanbooruTags/danbooru-character-tags.csv
  --out-file <path>             Output CSV. Default: User/PowerPrompter/CSV/Characters/trained-character-tags.csv
  --max-tags <number>           Max trigger tags per character. Default: 12
  --min-count <number>          Minimum co-occurrences to keep a tag. Default: 2
  --include-counts              Add image_count and trigger_tag_counts columns
  -h, --help                    Show this help

Input assumptions:
  Captions are comma-separated tag files next to training images.
  Character names are detected by matching tags against the Danbooru character tag CSV.
`);
}

async function loadCharacterTags(filePath) {
  const text = await readFile(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const startIndex = lines[0]?.split(',')[0]?.trim().toLowerCase() === 'tag' ? 1 : 0;
  const tags = new Set();

  for (const line of lines.slice(startIndex)) {
    const firstCell = line.split(',')[0]?.trim();
    if (firstCell) {
      tags.add(normalizeTag(firstCell));
    }
  }

  return tags;
}

async function findCaptionFiles(rootDir) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && CAPTION_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

async function analyzeDataset(options) {
  const characterTags = await loadCharacterTags(options.characterTagsCsv);
  const captionFiles = await findCaptionFiles(options.datasetDir);
  const characterStats = new Map();

  for (const filePath of captionFiles) {
    const caption = await readFile(filePath, 'utf8');
    const tags = parseCaptionTags(caption);
    const characters = tags.filter((tag) => characterTags.has(tag));
    const uniqueCharacters = [...new Set(characters)];

    for (const character of uniqueCharacters) {
      const stats = getCharacterStats(characterStats, character);
      stats.imageCount += 1;

      for (const tag of tags) {
        if (tag === character || characterTags.has(tag) || DEFAULT_IGNORE_TAGS.has(tag)) {
          continue;
        }

        stats.tagCounts.set(tag, (stats.tagCounts.get(tag) ?? 0) + 1);
      }
    }
  }

  return [...characterStats.entries()]
    .map(([character, stats]) => ({
      character,
      imageCount: stats.imageCount,
      triggerTags: [...stats.tagCounts.entries()]
        .filter(([, count]) => count >= options.minCount)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, options.maxTags),
    }))
    .filter((entry) => entry.triggerTags.length > 0)
    .sort((a, b) => b.imageCount - a.imageCount || a.character.localeCompare(b.character));
}

function getCharacterStats(map, character) {
  if (!map.has(character)) {
    map.set(character, {
      imageCount: 0,
      tagCounts: new Map(),
    });
  }

  return map.get(character);
}

function parseCaptionTags(caption) {
  return [...new Set(
    caption
      .split(',')
      .map((tag) => normalizeTag(tag))
      .filter(Boolean)
  )];
}

function normalizeTag(tag) {
  return String(tag || '').trim().replaceAll(' ', '_').toLowerCase();
}

function displayTag(tag) {
  return tag.replaceAll('_', ' ');
}

function toCsv(rows, includeCounts) {
  if (!includeCounts) {
    return rows
      .map((row) => [
        displayTag(row.character),
        ...row.triggerTags.map(([tag]) => displayTag(tag)),
      ].join(', '))
      .join('\n') + (rows.length > 0 ? '\n' : '');
  }

  const headers = ['character_name', 'trigger_tags', 'image_count', 'trigger_tag_counts'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => {
      const values = {
        character_name: displayTag(row.character),
        image_count: row.imageCount,
        trigger_tag_counts: row.triggerTags.map(([tag, count]) => `${displayTag(tag)}:${count}`).join('; '),
        trigger_tags: row.triggerTags.map(([tag]) => displayTag(tag)).join(', '),
      };

      return headers.map((header) => csvCell(values[header])).join(',');
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const rows = await analyzeDataset(options);
  await mkdir(path.dirname(options.outFile), { recursive: true });
  await writeFile(options.outFile, toCsv(rows, options.includeCounts), 'utf8');
  console.log(`Read captions from ${path.relative(repoRoot, options.datasetDir)}`);
  console.log(`Wrote ${rows.length.toLocaleString()} character rows to ${path.relative(repoRoot, options.outFile)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
