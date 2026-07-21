#!/usr/bin/env node

import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(repoRoot, 'User', 'CheckpointMetadata');
const DEFAULT_CHARACTER_TAGS_CSV = path.join(repoRoot, 'User', 'DanbooruTags', 'danbooru-character-tags.csv');
const HEADER_SIZE_BYTES = 8;
const MAX_HEADER_BYTES = 256 * 1024 * 1024;
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
    includeRaw: false,
    maxTags: 12,
    outCharacterCsv: '',
    outJson: '',
    printRaw: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--include-raw') {
      options.includeRaw = true;
    } else if (arg === '--print-raw') {
      options.printRaw = true;
    } else if (arg === '--file' && next) {
      options.file = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--file=')) {
      options.file = path.resolve(arg.slice('--file='.length));
    } else if (arg === '--out-json' && next) {
      options.outJson = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--out-json=')) {
      options.outJson = path.resolve(arg.slice('--out-json='.length));
    } else if (arg === '--out-character-csv' && next) {
      options.outCharacterCsv = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--out-character-csv=')) {
      options.outCharacterCsv = path.resolve(arg.slice('--out-character-csv='.length));
    } else if (arg === '--character-tags-csv' && next) {
      options.characterTagsCsv = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--character-tags-csv=')) {
      options.characterTagsCsv = path.resolve(arg.slice('--character-tags-csv='.length));
    } else if (arg === '--max-tags' && next) {
      options.maxTags = parsePositiveInt(next, 'max-tags');
      i += 1;
    } else if (arg.startsWith('--max-tags=')) {
      options.maxTags = parsePositiveInt(arg.slice('--max-tags='.length), 'max-tags');
    } else if (!options.file && !arg.startsWith('--')) {
      options.file = path.resolve(arg);
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
Inspect metadata embedded in a .safetensors checkpoint or LoRA.

Usage:
  node scripts/safetensors-metadata.mjs --file path/to/model.safetensors [options]
  bun run checkpoint:metadata -- --file path/to/model.safetensors [options]

Options:
  --file <path>                 Safetensors checkpoint/LoRA file to inspect
  --out-json <path>             Write parsed metadata JSON
  --out-character-csv <path>    Write inferred character trigger tags from ss_tag_frequency
  --character-tags-csv <path>   Danbooru character tag CSV for character detection
  --max-tags <number>           Max trigger tags per character row. Default: 12
  --include-raw                 Include raw safetensors metadata in JSON output
  --print-raw                   Print raw metadata to stdout
  -h, --help                    Show this help

Notes:
  This reads only the safetensors header. It does not load model weights.
  Dataset tags are only available if the training tool embedded them, commonly as ss_tag_frequency metadata.
`);
}

async function readSafetensorsHeader(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.safetensors') {
    throw new Error('This inspector only supports .safetensors files. .ckpt files are pickle archives and are not safe to parse casually.');
  }

  const file = await open(filePath, 'r');
  try {
    const sizeBuffer = Buffer.alloc(HEADER_SIZE_BYTES);
    await file.read(sizeBuffer, 0, HEADER_SIZE_BYTES, 0);
    const headerLength = Number(sizeBuffer.readBigUInt64LE(0));

    if (!Number.isSafeInteger(headerLength) || headerLength <= 0 || headerLength > MAX_HEADER_BYTES) {
      throw new Error(`Unexpected safetensors header length: ${headerLength}`);
    }

    const headerBuffer = Buffer.alloc(headerLength);
    await file.read(headerBuffer, 0, headerLength, HEADER_SIZE_BYTES);
    return JSON.parse(headerBuffer.toString('utf8'));
  } finally {
    await file.close();
  }
}

function parseEmbeddedMetadata(header) {
  const rawMetadata = header.__metadata__ ?? {};
  const parsed = {};

  for (const [key, value] of Object.entries(rawMetadata)) {
    parsed[key] = parseMaybeJson(value);
  }

  return parsed;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function summarizeMetadata(filePath, header, metadata, includeRaw) {
  const tensorNames = Object.keys(header).filter((key) => key !== '__metadata__');
  const summary = {
    file: filePath,
    tensor_count: tensorNames.length,
    metadata_keys: Object.keys(metadata).sort(),
    model: pickKeys(metadata, [
      'modelspec.title',
      'modelspec.architecture',
      'modelspec.implementation',
      'modelspec.date',
      'ss_output_name',
      'ss_network_module',
      'ss_sd_model_name',
      'ss_v2',
      'ss_base_model_version',
      'ss_training_started_at',
    ]),
    training: pickKeys(metadata, [
      'ss_num_epochs',
      'ss_epoch',
      'ss_steps',
      'ss_learning_rate',
      'ss_text_encoder_lr',
      'ss_unet_lr',
      'ss_batch_size_per_device',
      'ss_gradient_checkpointing',
      'ss_noise_offset',
      'ss_caption_dropout_rate',
      'ss_caption_tag_dropout_rate',
      'ss_shuffle_caption',
      'ss_keep_tokens',
      'ss_max_token_length',
    ]),
    datasets: extractDatasetSummary(metadata),
    tag_frequency: metadata.ss_tag_frequency ?? null,
  };

  if (includeRaw) {
    summary.raw_metadata = metadata;
  }

  return summary;
}

function pickKeys(source, keys) {
  const picked = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== '') {
      picked[key] = source[key];
    }
  }

  return picked;
}

function extractDatasetSummary(metadata) {
  const dirs = metadata.ss_dataset_dirs;
  const regDirs = metadata.ss_reg_dataset_dirs;
  const bucketInfo = metadata.ss_bucket_info;
  return {
    dataset_dirs: dirs ?? null,
    regularization_dirs: regDirs ?? null,
    bucket_info: bucketInfo ?? null,
  };
}

async function loadCharacterTags(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const startIndex = lines[0]?.split(',')[0]?.trim().toLowerCase() === 'tag' ? 1 : 0;
    return new Set(
      lines.slice(startIndex)
        .map((line) => normalizeTag(line.split(',')[0]))
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

async function writeCharacterCsvFromMetadata(summary, options) {
  const tagFrequency = summary.tag_frequency;
  if (!tagFrequency || typeof tagFrequency !== 'object' || Array.isArray(tagFrequency)) {
    throw new Error('No ss_tag_frequency metadata found, so character trigger tags cannot be inferred from this file.');
  }

  const characterTags = await loadCharacterTags(options.characterTagsCsv);
  const rows = Object.entries(tagFrequency)
    .map(([datasetName, tagCounts]) => makeCharacterRow(datasetName, tagCounts, characterTags, options.maxTags))
    .filter(Boolean)
    .sort((a, b) => b.imageCount - a.imageCount || a.character.localeCompare(b.character));

  await mkdir(path.dirname(options.outCharacterCsv), { recursive: true });
  await writeFile(options.outCharacterCsv, rows.map((row) => [
    displayTag(row.character),
    ...row.tags.map(([tag]) => displayTag(tag)),
  ].join(', ')).join('\n') + (rows.length > 0 ? '\n' : ''), 'utf8');

  return rows.length;
}

function makeCharacterRow(datasetName, tagCounts, characterTags, maxTags) {
  if (!tagCounts || typeof tagCounts !== 'object' || Array.isArray(tagCounts)) {
    return null;
  }

  const normalizedCounts = Object.entries(tagCounts)
    .map(([tag, count]) => [normalizeTag(tag), Number(count) || 0])
    .filter(([tag, count]) => tag && count > 0);
  const detectedCharacter = normalizedCounts
    .filter(([tag]) => characterTags.has(tag))
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  const character = detectedCharacter ?? inferCharacterFromDatasetName(datasetName);

  const tags = normalizedCounts
    .filter(([tag]) => tag !== character && !characterTags.has(tag) && !DEFAULT_IGNORE_TAGS.has(tag))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTags);

  if (!character || tags.length === 0) {
    return null;
  }

  const imageCount = Math.max(...normalizedCounts.map(([, count]) => count));
  return { character, imageCount, tags };
}

function inferCharacterFromDatasetName(datasetName) {
  return normalizeTag(String(datasetName || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/^\d+[_ -]*/, '') ?? '');
}

function normalizeTag(tag) {
  return String(tag || '').trim().replaceAll(' ', '_').toLowerCase();
}

function displayTag(tag) {
  return tag.replaceAll('_', ' ');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.file) {
    throw new Error('Missing required --file path/to/model.safetensors');
  }

  const header = await readSafetensorsHeader(options.file);
  const metadata = parseEmbeddedMetadata(header);
  const summary = summarizeMetadata(options.file, header, metadata, options.includeRaw);
  const defaultJson = path.join(DEFAULT_OUT_DIR, `${path.basename(options.file, '.safetensors')}.metadata.json`);
  const outJson = options.outJson || defaultJson;

  await mkdir(path.dirname(outJson), { recursive: true });
  await writeFile(outJson, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Read ${summary.tensor_count.toLocaleString()} tensors from ${path.basename(options.file)}`);
  console.log(`Found ${summary.metadata_keys.length.toLocaleString()} metadata keys`);
  console.log(`Wrote metadata JSON to ${path.relative(repoRoot, outJson)}`);

  if (summary.tag_frequency) {
    console.log('Found ss_tag_frequency dataset tag counts');
  } else {
    console.log('No ss_tag_frequency dataset tag counts found');
  }

  if (options.outCharacterCsv) {
    const rows = await writeCharacterCsvFromMetadata(summary, options);
    console.log(`Wrote ${rows.toLocaleString()} character rows to ${path.relative(repoRoot, options.outCharacterCsv)}`);
  }

  if (options.printRaw) {
    console.log(JSON.stringify(metadata, null, 2));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
