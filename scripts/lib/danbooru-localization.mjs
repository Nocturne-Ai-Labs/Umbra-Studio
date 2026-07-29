import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DANBOORU_LOCALIZATION_URL =
  'https://huggingface.co/datasets/newtextdoc1111/danbooru-tag-csv/resolve/main/danbooru_tags.csv';

export function normalizeOutputLanguage(value) {
  const normalized = String(value || 'canonical').trim().toLowerCase();
  if (normalized === 'canonical') return 'canonical';
  if (normalized === 'ja' || normalized === 'japanese') return 'ja';
  if (normalized === 'zh-cn' || normalized === 'zh' || normalized === 'chinese') return 'zh-CN';
  throw new Error('--output-language must be canonical, ja, or zh-CN.');
}

export function parseCsvRows(content) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return rows;
}

function isJapaneseAlias(value) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

function isChineseAlias(value) {
  return /\p{Script=Han}/u.test(value)
    && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
}

export function selectLocalizedAliases(aliasText, outputLanguage) {
  const language = normalizeOutputLanguage(outputLanguage);
  if (language === 'canonical') return [];
  const matchesLanguage = language === 'ja' ? isJapaneseAlias : isChineseAlias;
  return Array.from(new Set(
    String(aliasText || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value && matchesLanguage(value)),
  ));
}

export function buildLocalizationMap(content, outputLanguage) {
  const rows = parseCsvRows(content);
  const headers = (rows.shift() || []).map((value) => value.toLowerCase());
  const tagIndex = headers.indexOf('tag');
  const aliasIndex = headers.indexOf('alias');
  if (tagIndex < 0 || aliasIndex < 0) {
    throw new Error('The multilingual Danbooru alias CSV has an unsupported format.');
  }

  const result = new Map();
  for (const row of rows) {
    const tag = String(row[tagIndex] || '').trim().toLowerCase();
    if (!tag) continue;
    const aliases = selectLocalizedAliases(row[aliasIndex], outputLanguage);
    if (aliases.length > 0) result.set(tag, aliases);
  }
  return result;
}

export async function loadDanbooruLocalizationMap({
  cacheFile,
  outputLanguage,
  waitForControl = async () => {},
}) {
  const language = normalizeOutputLanguage(outputLanguage);
  if (language === 'canonical') return new Map();

  let content = '';
  try {
    content = await readFile(cacheFile, 'utf8');
  } catch {
    await waitForControl();
    console.log(`Downloading optional ${language} Danbooru search aliases...`);
    const response = await fetch(DANBOORU_LOCALIZATION_URL, {
      headers: { 'User-Agent': 'Umbra-Studio-Danbooru-CSV-Generator/1.0' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`Could not download multilingual Danbooru aliases (${response.status}).`);
    }
    content = await response.text();
    if (!content.includes('tag,category,count,alias')) {
      throw new Error('Downloaded multilingual Danbooru alias data is invalid.');
    }
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, content, 'utf8');
  }

  await waitForControl();
  return buildLocalizationMap(content, language);
}

export function getLocalizedTag(localizationMap, tag) {
  const aliases = localizationMap.get(String(tag || '').trim().toLowerCase()) || [];
  return {
    name: aliases[0] || '',
    aliases,
  };
}
