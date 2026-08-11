import {
  classifyDanbooruTag,
  hasExplicitDanbooruClassifier,
  parseDanbooruTagClassifiers,
  type DanbooruTagClassifierId,
} from '../shared/danbooru/tagClassifiers';

export type PowerPrompterCsvItemType = 'tag' | 'character';

export interface PowerPrompterCsvItem {
  tag: string;
  category: number;
  count?: number;
  extra?: string;
  displayTag?: string;
  searchAliases?: string;
  classifiers: DanbooruTagClassifierId[];
  explicit: boolean;
  source: string;
  sourceId: string;
  type: PowerPrompterCsvItemType;
}

export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return rows;
}

function getSourceId(type: PowerPrompterCsvItemType, fileName: string): string {
  return `${type}:${String(fileName || '').trim()}`;
}

function getHeaderIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

function readCell(row: string[], index: number): string {
  return index >= 0 ? String(row[index] || '').trim() : '';
}

export function parsePowerPrompterCsv(
  content: string,
  type: PowerPrompterCsvItemType,
  fileName: string,
): PowerPrompterCsvItem[] {
  const rows = parseCsvRows(content);
  if (rows.length === 0) return [];

  const expectedHeader = type === 'tag' ? 'tag' : 'character';
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const hasHeader = headers.includes(expectedHeader);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const sourceId = getSourceId(type, fileName);

  if (!hasHeader) {
    return dataRows.flatMap((row) => {
      const tag = readCell(row, 0);
      if (!tag) return [];
      if (type === 'tag') {
        const category = Number.parseInt(readCell(row, 1), 10) || 0;
        const classifiers = classifyDanbooruTag(tag, category);
        return [{
          tag,
          category,
          classifiers,
          explicit: hasExplicitDanbooruClassifier(classifiers),
          source: fileName,
          sourceId,
          type,
        }];
      }
      return [{
        tag,
        category: 4,
        classifiers: [],
        explicit: false,
        extra: row.slice(1).map((value) => value.trim()).filter(Boolean).join(', '),
        source: fileName,
        sourceId,
        type,
      }];
    });
  }

  const tagIndex = getHeaderIndex(headers, expectedHeader);
  const categoryIndex = getHeaderIndex(headers, 'category');
  const attributesIndex = getHeaderIndex(headers, 'attributes');
  const postCountIndex = getHeaderIndex(headers, 'post_count', 'post count', 'postcount', 'count');
  const displayIndex = getHeaderIndex(headers, 'localized_name', 'localized_character');
  const aliasesIndex = getHeaderIndex(headers, 'localized_aliases', 'aliases', 'alias');
  const localizedAttributesIndex = getHeaderIndex(headers, 'localized_attributes');
  const classifiersIndex = getHeaderIndex(headers, 'classifiers', 'classifier');

  return dataRows.flatMap((row) => {
    const tag = readCell(row, tagIndex);
    if (!tag) return [];
    const displayTag = readCell(row, displayIndex);
    const rawPostCount = readCell(row, postCountIndex);
    const parsedPostCount = rawPostCount === '' ? null : Number.parseInt(rawPostCount, 10);
    const category = type === 'character'
      ? 4
      : Number.parseInt(readCell(row, categoryIndex), 10) || 0;
    const storedClassifiers = type === 'tag'
      ? parseDanbooruTagClassifiers(readCell(row, classifiersIndex))
      : [];
    const classifiers = type === 'tag' && storedClassifiers.length === 0
      ? classifyDanbooruTag(tag, category)
      : storedClassifiers;
    const searchAliases = [
      readCell(row, aliasesIndex),
      readCell(row, localizedAttributesIndex),
    ].filter(Boolean).join(', ');

    return [{
      tag,
      category,
      classifiers,
      explicit: hasExplicitDanbooruClassifier(classifiers),
      ...(parsedPostCount !== null && Number.isFinite(parsedPostCount) && parsedPostCount >= 0
        ? { count: parsedPostCount }
        : {}),
      ...(type === 'character' && readCell(row, attributesIndex)
        ? { extra: readCell(row, attributesIndex) }
        : {}),
      ...(displayTag ? { displayTag } : {}),
      ...(searchAliases ? { searchAliases } : {}),
      source: fileName,
      sourceId,
      type,
    }];
  });
}
