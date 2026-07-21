import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import { MetadataParser, type ImageMetadata } from '../backend/MetadataParser';

export type GalleryMediaType = 'image' | 'gif' | 'video';
export type GallerySortBy = 'created' | 'modified' | 'name' | 'custom';
export type GallerySortOrder = 'asc' | 'desc';

export type GalleryFileInput = {
  path: string;
  folderPath: string;
  name: string;
  type: GalleryMediaType;
  size: number;
  createdMs: number;
  modifiedMs: number;
};

export type GalleryIndexedFile = {
  uid: string;
  path: string;
  folderPath: string;
  name: string;
  type: GalleryMediaType;
  size: number;
  createdMs: number;
  modifiedMs: number;
  customOrder: number;
  width: number;
  height: number;
  metadataReady: boolean;
  metadataFormat: string | null;
  tags: string[];
};

export type GallerySearchSuggestion = {
  type: 'tag' | 'folder';
  label: string;
  detail: string;
  value: string;
};

export type GalleryTagSummaryItem = {
  tag: string;
  count: number;
};

export type GalleryMetadataSearchMatch = {
  uid: string;
  path: string;
  name: string;
  folderPath: string;
  metadataFormat: string | null;
  snippet: string;
};

type FileRow = {
  uid: string;
  path: string;
  folderPath: string;
  name: string;
  type: GalleryMediaType;
  size: number;
  createdMs: number;
  modifiedMs: number;
  fileSig: string;
  customOrder: number;
  width: number;
  height: number;
  metadataJson: string | null;
  metadataUpdatedMs: number | null;
  metadataFormat: string | null;
};

type MetadataQueueRow = {
  uid: string;
  path: string;
  modifiedMs: number;
  type: GalleryMediaType;
};

const DEFAULT_DB_RELATIVE_PATH = join('User', 'Config', 'GalleryDb.db');

function normalizePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

function normalizeTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function normalizeTag(value: string): string {
  const compact = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!compact) return '';
  return compact.slice(0, 48);
}

function normalizeTagList(values: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const entry of values || []) {
    const normalized = normalizeTag(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= 32) break;
  }
  return output;
}

function normalizeMetadataSearchTerms(value: string): string[] {
  return Array.from(new Set(
    String(value || '')
      .toLowerCase()
      .split(/[,\s]+/g)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2),
  )).slice(0, 12);
}

function escapeSqlLike(value: string): string {
  return String(value || '').replace(/[\\%_]/g, (char) => `\\${char}`);
}

function metadataSearchSnippet(metadataJson: string | null | undefined, terms: string[]): string {
  const raw = String(metadataJson || '');
  if (!raw) return '';
  let text = raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const parts = [
      parsed.positive_prompt,
      parsed.negative_prompt,
      parsed.model,
      parsed.sampler,
      parsed.scheduler,
    ].map((entry) => String(entry || '').trim()).filter(Boolean);
    text = parts.length > 0 ? parts.join(' ') : raw;
  } catch {
    text = raw;
  }
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const lower = compact.toLowerCase();
  const indexes = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0);
  const first = indexes.length > 0 ? Math.min(...indexes) : 0;
  const start = Math.max(0, first - 72);
  const end = Math.min(compact.length, first + 220);
  return `${start > 0 ? '...' : ''}${compact.slice(start, end)}${end < compact.length ? '...' : ''}`;
}

function buildFileSignature(file: GalleryFileInput): string {
  return [
    file.name.toLowerCase(),
    Math.trunc(file.size),
    normalizeTimestamp(file.createdMs),
    normalizeTimestamp(file.modifiedMs),
  ].join('|');
}

function isMetadataSupportedType(filePath: string, type: GalleryMediaType): boolean {
  if (type === 'video') return false;
  const ext = extname(filePath).toLowerCase();
  return ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif';
}

function sanitizeMetadata(meta: ImageMetadata): Record<string, unknown> | null {
  const output: Record<string, unknown> = {};
  const keys: Array<keyof ImageMetadata> = [
    'format',
    'positive_prompt',
    'negative_prompt',
    'model',
    'seed',
    'steps',
    'sampler',
    'scheduler',
    'cfg',
    'width',
    'height',
    'workflow',
  ];

  for (const key of keys) {
    const value = meta[key];
    if (value === undefined || value === null || value === '') continue;
    output[key] = value;
  }

  return Object.keys(output).length > 0 ? output : null;
}

function parseMetadataDimensions(metadataJson: string | null | undefined): { width: number; height: number } {
  if (!metadataJson) return { width: 0, height: 0 };
  try {
    const parsed = JSON.parse(String(metadataJson || '')) as { width?: unknown; height?: unknown } | null;
    const width = Math.max(0, Math.trunc(Number(parsed?.width || 0)));
    const height = Math.max(0, Math.trunc(Number(parsed?.height || 0)));
    return { width, height };
  } catch {
    return { width: 0, height: 0 };
  }
}

let sharpPromise: Promise<any> | null = null;
async function readImageDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const BunImage = (globalThis as any)?.Bun?.Image;
  if (typeof BunImage === 'function') {
    try {
      const metadata = await new BunImage(filePath).metadata();
      const width = Math.max(0, Math.trunc(Number(metadata?.width || 0)));
      const height = Math.max(0, Math.trunc(Number(metadata?.height || 0)));
      if (width > 0 && height > 0) return { width, height };
    } catch {
      // Fall through to Sharp for formats Bun.Image cannot inspect.
    }
  }

  try {
    if (!sharpPromise) {
      sharpPromise = import('sharp').then((mod) => mod.default).catch(() => null);
    }
    const sharp = await sharpPromise;
    if (!sharp) return { width: 0, height: 0 };
    const metadata = await sharp(filePath).metadata();
    const width = Math.max(0, Math.trunc(Number(metadata?.width || 0)));
    const height = Math.max(0, Math.trunc(Number(metadata?.height || 0)));
    return { width, height };
  } catch {
    return { width: 0, height: 0 };
  }
}

export class GalleryDb {
  private readonly db: Database;

  private readonly metadataQueue: string[] = [];

  private readonly metadataQueuedSet = new Set<string>();

  private metadataActive = 0;

  private readonly metadataConcurrency = 2;

  constructor(rootDir: string, relativeDbPath = DEFAULT_DB_RELATIVE_PATH) {
    const dbPath = resolve(rootDir, relativeDbPath);
    const dbDir = resolve(dbPath, '..');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA busy_timeout = 5000');
    this.db.run('PRAGMA synchronous = NORMAL');
    this.db.run('PRAGMA temp_store = MEMORY');
    this.ensureSchema();
    console.log('[GalleryDb] Initialized:', dbPath);
  }

  close(): void {
    this.db.close();
  }

  upsertFolderFiles(folderPathInput: string, files: GalleryFileInput[]): GalleryIndexedFile[] {
    const folderPath = normalizePath(folderPathInput);
    const nextIndexRow = this.db.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM folder_order WHERE folder_path = ?').get(folderPath) as { nextIndex?: number } | null;
    let nextIndex = Number(nextIndexRow?.nextIndex || 0);

    const rowsByPath = new Map<string, FileRow>();
    const metadataCandidates: Array<{ uid: string; path: string; modifiedMs: number; type: GalleryMediaType }> = [];
    const now = Date.now();

    const selectByPath = this.db.query(`
      SELECT
        uid,
        path,
        folder_path AS folderPath,
        file_name AS name,
        file_type AS type,
        file_size AS size,
        created_ms AS createdMs,
        modified_ms AS modifiedMs,
        file_sig AS fileSig,
        metadata_json AS metadataJson,
        metadata_updated_ms AS metadataUpdatedMs,
        metadata_format AS metadataFormat
      FROM files
      WHERE path = ?
      LIMIT 1
    `);

    const selectOrder = this.db.query(`
      SELECT order_index AS customOrder
      FROM folder_order
      WHERE folder_path = ? AND uid = ?
      LIMIT 1
    `);

    const upsertOrder = this.db.prepare(`
      INSERT INTO folder_order (folder_path, uid, order_index, updated_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(folder_path, uid) DO UPDATE SET
        order_index = excluded.order_index,
        updated_ms = excluded.updated_ms
    `);

    const insertFile = this.db.prepare(`
      INSERT INTO files (
        uid, path, folder_path, file_name, file_type, file_size,
        created_ms, modified_ms, file_sig, metadata_json, metadata_format,
        metadata_updated_ms, first_seen_ms, last_seen_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
    `);

    const updateFile = this.db.prepare(`
      UPDATE files
      SET
        folder_path = ?,
        file_name = ?,
        file_type = ?,
        file_size = ?,
        created_ms = ?,
        modified_ms = ?,
        file_sig = ?,
        last_seen_ms = ?
      WHERE uid = ?
    `);
    const deleteFileTags = this.db.prepare('DELETE FROM file_tags WHERE uid = ?');
    const deleteFolderOrder = this.db.prepare('DELETE FROM folder_order WHERE uid = ?');
    const deleteFile = this.db.prepare('DELETE FROM files WHERE uid = ?');

    const transaction = this.db.transaction((items: GalleryFileInput[]) => {
      for (const input of items) {
        const path = normalizePath(input.path);
        if (!path) continue;
        const folder = normalizePath(input.folderPath);
        const createdMs = normalizeTimestamp(input.createdMs);
        const modifiedMs = normalizeTimestamp(input.modifiedMs);
        const size = Math.max(0, Math.trunc(Number(input.size || 0)));
        const fileSig = buildFileSignature({ ...input, path, folderPath: folder, createdMs, modifiedMs, size });

        let existing = selectByPath.get(path) as FileRow | null;
        let uid = existing?.uid;
        if (existing && existing.fileSig !== fileSig) {
          deleteFileTags.run(existing.uid);
          deleteFolderOrder.run(existing.uid);
          deleteFile.run(existing.uid);
          existing = null;
          uid = undefined;
        }
        if (!uid) {
          uid = crypto.randomUUID();
          insertFile.run(
            uid,
            path,
            folder,
            input.name,
            input.type,
            size,
            createdMs,
            modifiedMs,
            fileSig,
            now,
            now,
          );
        } else {
          updateFile.run(
            folder,
            input.name,
            input.type,
            size,
            createdMs,
            modifiedMs,
            fileSig,
            now,
            uid,
          );
        }

        const orderRow = selectOrder.get(folder, uid) as { customOrder?: number } | null;
        let customOrder: number;
        if (orderRow && Number.isFinite(orderRow.customOrder)) {
          customOrder = Math.trunc(Number(orderRow.customOrder));
        } else {
          customOrder = nextIndex;
          upsertOrder.run(folder, uid, customOrder, now);
          nextIndex += 1;
        }

        const metadataUpdatedMs = existing?.metadataUpdatedMs == null ? null : normalizeTimestamp(existing.metadataUpdatedMs);
        const existingDimensions = parseMetadataDimensions(existing?.metadataJson || null);
        if (
          isMetadataSupportedType(path, input.type)
          && (
            metadataUpdatedMs !== modifiedMs
            || existingDimensions.width <= 0
            || existingDimensions.height <= 0
          )
        ) {
          metadataCandidates.push({ uid, path, modifiedMs, type: input.type });
        }

        rowsByPath.set(path, {
          uid,
          path,
          folderPath: folder,
          name: input.name,
          type: input.type,
          size,
          createdMs,
          modifiedMs,
          customOrder,
          width: existingDimensions.width,
          height: existingDimensions.height,
          fileSig,
          metadataJson: existing?.metadataJson || null,
          metadataUpdatedMs,
          metadataFormat: existing?.metadataFormat || null,
        });
      }
    });

    transaction(files);

    for (const candidate of metadataCandidates) {
      this.enqueueMetadataRefresh(candidate.uid);
    }

    const rows = files
      .map((item) => rowsByPath.get(normalizePath(item.path)))
      .filter((row): row is FileRow => Boolean(row));
    const tagsByUid = this.getTagsForUids(rows.map((row) => row.uid));

    return rows
      .map((row) => ({
        uid: row.uid,
        path: row.path,
        folderPath: row.folderPath,
        name: row.name,
        type: row.type,
        size: row.size,
        createdMs: row.createdMs,
        modifiedMs: row.modifiedMs,
        customOrder: row.customOrder,
        width: row.width,
        height: row.height,
        metadataReady: row.metadataUpdatedMs === row.modifiedMs,
        metadataFormat: row.metadataFormat,
        tags: tagsByUid.get(row.uid) || [],
      }));
  }

  getFolderFilesByPaths(folderPathInput: string, pathInputs: string[]): GalleryIndexedFile[] {
    const folderPath = normalizePath(folderPathInput);
    const normalizedPaths: string[] = [];
    const seenPaths = new Set<string>();
    for (const entry of pathInputs || []) {
      const normalized = normalizePath(String(entry || ''));
      if (!normalized || seenPaths.has(normalized)) continue;
      seenPaths.add(normalized);
      normalizedPaths.push(normalized);
    }
    if (!folderPath || normalizedPaths.length === 0) return [];

    const rowsByPath = new Map<string, FileRow>();
    const chunkSize = 300;
    for (let offset = 0; offset < normalizedPaths.length; offset += chunkSize) {
      const chunk = normalizedPaths.slice(offset, offset + chunkSize);
      if (chunk.length === 0) continue;
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = this.db.query(`
        SELECT
          f.uid AS uid,
          f.path AS path,
          f.folder_path AS folderPath,
          f.file_name AS name,
          f.file_type AS type,
          f.file_size AS size,
          f.created_ms AS createdMs,
          f.modified_ms AS modifiedMs,
          COALESCE(fo.order_index, 0) AS customOrder,
          f.metadata_json AS metadataJson,
          f.metadata_updated_ms AS metadataUpdatedMs,
          f.metadata_format AS metadataFormat
        FROM files f
        LEFT JOIN folder_order fo
          ON fo.uid = f.uid AND fo.folder_path = ?
        WHERE f.folder_path = ? AND f.path IN (${placeholders})
      `).all(folderPath, folderPath, ...chunk) as FileRow[];

      for (const row of rows) {
        const path = normalizePath(String(row?.path || ''));
        if (!path || rowsByPath.has(path)) continue;
        const dimensions = parseMetadataDimensions(row.metadataJson || null);
        rowsByPath.set(path, {
          ...row,
          path,
          folderPath: normalizePath(row.folderPath),
          customOrder: Number.isFinite(row.customOrder) ? Math.trunc(Number(row.customOrder)) : 0,
          width: dimensions.width,
          height: dimensions.height,
        });
      }
    }

    const rows = normalizedPaths
      .map((path) => rowsByPath.get(path))
      .filter((row): row is FileRow => Boolean(row));
    const tagsByUid = this.getTagsForUids(rows.map((row) => row.uid));

    return rows.map((row) => ({
      uid: row.uid,
      path: row.path,
      folderPath: row.folderPath,
      name: row.name,
      type: row.type,
      size: Number(row.size || 0),
      createdMs: normalizeTimestamp(row.createdMs),
      modifiedMs: normalizeTimestamp(row.modifiedMs),
      customOrder: Number.isFinite(row.customOrder) ? Math.trunc(Number(row.customOrder)) : 0,
      width: row.width,
      height: row.height,
      metadataReady: normalizeTimestamp(row.metadataUpdatedMs || 0) === normalizeTimestamp(row.modifiedMs),
      metadataFormat: row.metadataFormat,
      tags: tagsByUid.get(row.uid) || [],
    }));
  }

  getTagsForUids(uidInputs: string[]): Map<string, string[]> {
    const uids = Array.from(new Set((uidInputs || []).map((entry) => String(entry || '').trim()).filter(Boolean)));
    const tagsByUid = new Map<string, string[]>();
    if (uids.length === 0) return tagsByUid;

    const chunkSize = 300;
    for (let offset = 0; offset < uids.length; offset += chunkSize) {
      const chunk = uids.slice(offset, offset + chunkSize);
      if (chunk.length === 0) continue;
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = this.db.query(`
        SELECT uid, tag
        FROM file_tags
        WHERE uid IN (${placeholders})
        ORDER BY uid ASC, tag COLLATE NOCASE ASC
      `).all(...chunk) as Array<{ uid: string; tag: string }>;

      for (const row of rows) {
        const uid = String(row?.uid || '').trim();
        const tag = normalizeTag(String(row?.tag || ''));
        if (!uid || !tag) continue;
        const existing = tagsByUid.get(uid);
        if (existing) {
          existing.push(tag);
        } else {
          tagsByUid.set(uid, [tag]);
        }
      }
    }

    for (const uid of uids) {
      if (!tagsByUid.has(uid)) tagsByUid.set(uid, []);
    }
    return tagsByUid;
  }

  searchFiles(rootInputs: string[], queryInput: string, limitInput = 400): GalleryIndexedFile[] {
    const query = String(queryInput || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const roots = Array.from(new Set((rootInputs || []).map(normalizePath).filter(Boolean)));
    const limit = Math.max(1, Math.min(1200, Math.trunc(Number(limitInput || 400))));
    if (!query || roots.length === 0) return [];

    const rootClauses: string[] = [];
    const rootParams: string[] = [];
    for (const root of roots) {
      const lowerRoot = root.toLowerCase();
      rootClauses.push('(lower(f.path) = ? OR lower(f.path) LIKE ?)');
      rootParams.push(lowerRoot, `${lowerRoot}/%`);
    }

    const needle = `%${query.replace(/[%_]/g, (char) => `\\${char}`)}%`;
    const rows = this.db.query(`
      SELECT DISTINCT
        f.uid AS uid,
        f.path AS path,
        f.folder_path AS folderPath,
        f.file_name AS name,
        f.file_type AS type,
        f.file_size AS size,
        f.created_ms AS createdMs,
        f.modified_ms AS modifiedMs,
        COALESCE(fo.order_index, 0) AS customOrder,
        f.metadata_json AS metadataJson,
        f.metadata_updated_ms AS metadataUpdatedMs,
        f.metadata_format AS metadataFormat
      FROM files f
      LEFT JOIN folder_order fo
        ON fo.uid = f.uid AND fo.folder_path = f.folder_path
      LEFT JOIN file_tags ft
        ON ft.uid = f.uid
      WHERE (${rootClauses.join(' OR ')})
        AND (
          lower(f.file_name) LIKE ? ESCAPE '\\'
          OR lower(f.path) LIKE ? ESCAPE '\\'
          OR lower(ft.tag) LIKE ? ESCAPE '\\'
        )
      ORDER BY f.modified_ms DESC, f.file_name COLLATE NOCASE ASC
      LIMIT ?
    `).all(...rootParams, needle, needle, needle, limit) as FileRow[];

    const normalizedRows = rows.map((row) => {
      const dimensions = parseMetadataDimensions(row.metadataJson || null);
      return {
        ...row,
        path: normalizePath(row.path),
        folderPath: normalizePath(row.folderPath),
        customOrder: Number.isFinite(row.customOrder) ? Math.trunc(Number(row.customOrder)) : 0,
        width: dimensions.width,
        height: dimensions.height,
      };
    }).filter((row) => row.path);

    const tagsByUid = this.getTagsForUids(normalizedRows.map((row) => row.uid));
    return normalizedRows.map((row) => ({
      uid: row.uid,
      path: row.path,
      folderPath: row.folderPath,
      name: row.name,
      type: row.type,
      size: Number(row.size || 0),
      createdMs: normalizeTimestamp(row.createdMs),
      modifiedMs: normalizeTimestamp(row.modifiedMs),
      customOrder: Number.isFinite(row.customOrder) ? Math.trunc(Number(row.customOrder)) : 0,
      width: row.width,
      height: row.height,
      metadataReady: normalizeTimestamp(row.metadataUpdatedMs || 0) === normalizeTimestamp(row.modifiedMs),
      metadataFormat: row.metadataFormat,
      tags: tagsByUid.get(row.uid) || [],
    }));
  }

  searchFolderMetadata(folderPathInput: string, queryInput: string, limitInput = 2000): GalleryMetadataSearchMatch[] {
    const folderPath = normalizePath(folderPathInput);
    const terms = normalizeMetadataSearchTerms(queryInput);
    const limit = Math.max(1, Math.min(5000, Math.trunc(Number(limitInput || 2000))));
    if (!folderPath || terms.length === 0) return [];

    const whereTerms = terms.map(() => 'lower(COALESCE(metadata_json, \'\')) LIKE ? ESCAPE \'\\\'').join(' AND ');
    const params = terms.map((term) => `%${escapeSqlLike(term)}%`);
    const rows = this.db.query(`
      SELECT
        uid,
        path,
        folder_path AS folderPath,
        file_name AS name,
        metadata_json AS metadataJson,
        metadata_format AS metadataFormat
      FROM files
      WHERE lower(folder_path) = ?
        AND metadata_json IS NOT NULL
        AND ${whereTerms}
      ORDER BY file_name COLLATE NOCASE ASC, path COLLATE NOCASE ASC
      LIMIT ?
    `).all(folderPath.toLowerCase(), ...params, limit) as Array<{
      uid: string;
      path: string;
      folderPath: string;
      name: string;
      metadataJson: string | null;
      metadataFormat: string | null;
    }>;

    return rows.map((row) => ({
      uid: String(row.uid || ''),
      path: normalizePath(String(row.path || '')),
      folderPath: normalizePath(String(row.folderPath || '')),
      name: String(row.name || basename(String(row.path || ''))),
      metadataFormat: row.metadataFormat || null,
      snippet: metadataSearchSnippet(row.metadataJson, terms),
    })).filter((row) => row.path);
  }

  searchSuggestions(rootInputs: string[], queryInput: string, limitInput = 18): GallerySearchSuggestion[] {
    const query = String(queryInput || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const roots = Array.from(new Set((rootInputs || []).map(normalizePath).filter(Boolean)));
    const limit = Math.max(1, Math.min(40, Math.trunc(Number(limitInput || 18))));
    if (!query || roots.length === 0) return [];

    const rootClauses: string[] = [];
    const rootParams: string[] = [];
    for (const root of roots) {
      const lowerRoot = root.toLowerCase();
      rootClauses.push('(lower(f.path) = ? OR lower(f.path) LIKE ?)');
      rootParams.push(lowerRoot, `${lowerRoot}/%`);
    }

    const escaped = query.replace(/[%_]/g, (char) => `\\${char}`);
    const containsNeedle = `%${escaped}%`;
    const prefixNeedle = `${escaped}%`;
    const perKindLimit = Math.max(4, Math.ceil(limit / 2));

    const tagRows = this.db.query(`
      SELECT
        ft.tag AS tag,
        COUNT(DISTINCT ft.uid) AS count
      FROM file_tags ft
      INNER JOIN files f
        ON f.uid = ft.uid
      WHERE (${rootClauses.join(' OR ')})
        AND lower(ft.tag) LIKE ? ESCAPE '\\'
      GROUP BY ft.tag
      ORDER BY
        CASE
          WHEN lower(ft.tag) = ? THEN 0
          WHEN lower(ft.tag) LIKE ? ESCAPE '\\' THEN 1
          ELSE 2
        END ASC,
        count DESC,
        ft.tag COLLATE NOCASE ASC
      LIMIT ?
    `).all(...rootParams, containsNeedle, query, prefixNeedle, perKindLimit) as Array<{ tag: string; count: number }>;

    const folderRows = this.db.query(`
      SELECT
        f.folder_path AS path,
        COUNT(*) AS count
      FROM files f
      WHERE (${rootClauses.join(' OR ')})
        AND lower(f.folder_path) LIKE ? ESCAPE '\\'
      GROUP BY f.folder_path
      ORDER BY
        CASE
          WHEN lower(f.folder_path) = ? THEN 0
          WHEN lower(f.folder_path) LIKE ? ESCAPE '\\' THEN 1
          ELSE 2
        END ASC,
        f.folder_path COLLATE NOCASE ASC
      LIMIT ?
    `).all(...rootParams, containsNeedle, query, prefixNeedle, perKindLimit) as Array<{ path: string; count: number }>;

    const suggestions: GallerySearchSuggestion[] = [];
    for (const row of tagRows) {
      const tag = normalizeTag(String(row?.tag || ''));
      if (!tag) continue;
      suggestions.push({
        type: 'tag',
        label: tag,
        detail: `${Math.max(0, Math.trunc(Number(row?.count || 0)))} tagged media`,
        value: tag,
      });
    }
    for (const row of folderRows) {
      const path = normalizePath(String(row?.path || ''));
      if (!path) continue;
      suggestions.push({
        type: 'folder',
        label: basename(path) || path,
        detail: path,
        value: path,
      });
    }

    return suggestions.slice(0, limit);
  }

  tagSummaryForFolders(folderInputs: string[], limitInput = 300): GalleryTagSummaryItem[] {
    const folders = Array.from(new Set((folderInputs || []).map(normalizePath).filter(Boolean))).slice(0, 240);
    const limit = Math.max(1, Math.min(600, Math.trunc(Number(limitInput || 300))));
    if (folders.length === 0) return [];

    const clauses = folders.map(() => 'lower(f.folder_path) = ?').join(' OR ');
    const params = folders.map((folder) => folder.toLowerCase());
    const rows = this.db.query(`
      SELECT
        ft.tag AS tag,
        COUNT(DISTINCT ft.uid) AS count
      FROM file_tags ft
      INNER JOIN files f
        ON f.uid = ft.uid
      WHERE ${clauses}
      GROUP BY ft.tag
      ORDER BY count DESC, ft.tag COLLATE NOCASE ASC
      LIMIT ?
    `).all(...params, limit) as Array<{ tag: string; count: number }>;

    return rows
      .map((row) => ({
        tag: normalizeTag(String(row?.tag || '')),
        count: Math.max(0, Math.trunc(Number(row?.count || 0))),
      }))
      .filter((row) => row.tag && row.count > 0);
  }

  resolveUidsForPaths(pathInputs: string[]): string[] {
    const normalizedPaths: string[] = [];
    const seenPaths = new Set<string>();
    for (const entry of pathInputs || []) {
      const normalized = normalizePath(String(entry || ''));
      if (!normalized || seenPaths.has(normalized)) continue;
      seenPaths.add(normalized);
      normalizedPaths.push(normalized);
    }
    if (normalizedPaths.length === 0) return [];

    const rowsByPath = new Map<string, string>();
    const chunkSize = 300;
    for (let offset = 0; offset < normalizedPaths.length; offset += chunkSize) {
      const chunk = normalizedPaths.slice(offset, offset + chunkSize);
      if (chunk.length === 0) continue;
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = this.db.query(`
        SELECT path, uid
        FROM files
        WHERE path IN (${placeholders})
      `).all(...chunk) as Array<{ path: string; uid: string }>;
      for (const row of rows) {
        const path = normalizePath(String(row?.path || ''));
        const uid = String(row?.uid || '').trim();
        if (!path || !uid || rowsByPath.has(path)) continue;
        rowsByPath.set(path, uid);
      }
    }

    const orderedUids: string[] = [];
    const seenUids = new Set<string>();
    for (const path of normalizedPaths) {
      const uid = String(rowsByPath.get(path) || '').trim();
      if (!uid || seenUids.has(uid)) continue;
      seenUids.add(uid);
      orderedUids.push(uid);
    }
    return orderedUids;
  }

  addTagsToFiles(uidInputs: string[], tagInputs: string[]): Map<string, string[]> {
    const uids = Array.from(new Set((uidInputs || []).map((entry) => String(entry || '').trim()).filter(Boolean)));
    const tags = normalizeTagList(tagInputs || []);
    if (uids.length === 0 || tags.length === 0) return new Map<string, string[]>();

    const selectExistingUid = this.db.prepare('SELECT uid FROM files WHERE uid = ? LIMIT 1');
    const validUids = uids.filter((uid) => Boolean(selectExistingUid.get(uid)));
    if (validUids.length === 0) return new Map<string, string[]>();

    const now = Date.now();
    const upsertTag = this.db.prepare(`
      INSERT INTO tags (tag, created_ms, updated_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(tag) DO UPDATE SET
        updated_ms = excluded.updated_ms
    `);
    const upsertFileTag = this.db.prepare(`
      INSERT INTO file_tags (uid, tag, created_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(uid, tag) DO NOTHING
    `);

    const transaction = this.db.transaction((txUids: string[], txTags: string[]) => {
      for (const tag of txTags) {
        upsertTag.run(tag, now, now);
      }
      for (const uid of txUids) {
        for (const tag of txTags) {
          upsertFileTag.run(uid, tag, now);
        }
      }
    });
    transaction(validUids, tags);

    return this.getTagsForUids(validUids);
  }

  setTagsForFiles(uidInputs: string[], tagInputs: string[]): Map<string, string[]> {
    const uids = Array.from(new Set((uidInputs || []).map((entry) => String(entry || '').trim()).filter(Boolean)));
    const tags = normalizeTagList(tagInputs || []);
    if (uids.length === 0) return new Map<string, string[]>();

    const selectExistingUid = this.db.prepare('SELECT uid FROM files WHERE uid = ? LIMIT 1');
    const validUids = uids.filter((uid) => Boolean(selectExistingUid.get(uid)));
    if (validUids.length === 0) return new Map<string, string[]>();

    const now = Date.now();
    const upsertTag = this.db.prepare(`
      INSERT INTO tags (tag, created_ms, updated_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(tag) DO UPDATE SET
        updated_ms = excluded.updated_ms
    `);
    const deleteFileTags = this.db.prepare('DELETE FROM file_tags WHERE uid = ?');
    const upsertFileTag = this.db.prepare(`
      INSERT INTO file_tags (uid, tag, created_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(uid, tag) DO NOTHING
    `);

    const transaction = this.db.transaction((txUids: string[], txTags: string[]) => {
      for (const tag of txTags) {
        upsertTag.run(tag, now, now);
      }
      for (const uid of txUids) {
        deleteFileTags.run(uid);
        for (const tag of txTags) {
          upsertFileTag.run(uid, tag, now);
        }
      }
    });
    transaction(validUids, tags);

    return this.getTagsForUids(validUids);
  }

  moveRecordsForPaths(pairs: Array<{ sourcePath: string; targetPath: string }>): number {
    const normalizedPairs = (pairs || [])
      .map((pair) => ({
        sourcePath: normalizePath(pair.sourcePath),
        targetPath: normalizePath(pair.targetPath),
      }))
      .filter((pair) => pair.sourcePath && pair.targetPath && pair.sourcePath !== pair.targetPath);
    if (normalizedPairs.length === 0) return 0;

    const now = Date.now();
    const selectRows = this.db.prepare(`
      SELECT
        uid, path, folder_path AS folderPath, file_name AS name, file_type AS type,
        file_size AS size, created_ms AS createdMs, modified_ms AS modifiedMs,
        file_sig AS fileSig, metadata_json AS metadataJson,
        metadata_updated_ms AS metadataUpdatedMs, metadata_format AS metadataFormat
      FROM files
      WHERE path = ? OR path LIKE ?
      ORDER BY length(path) ASC
    `);
    const selectTargetUid = this.db.prepare('SELECT uid FROM files WHERE path = ? LIMIT 1');
    const deleteFileTags = this.db.prepare('DELETE FROM file_tags WHERE uid = ?');
    const deleteFolderOrder = this.db.prepare('DELETE FROM folder_order WHERE uid = ?');
    const deleteFile = this.db.prepare('DELETE FROM files WHERE uid = ?');
    const updateFile = this.db.prepare(`
      UPDATE files
      SET path = ?, folder_path = ?, file_name = ?, last_seen_ms = ?
      WHERE uid = ?
    `);
    const selectNextIndex = this.db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM folder_order WHERE folder_path = ?');
    const deleteOrderForUid = this.db.prepare('DELETE FROM folder_order WHERE uid = ?');
    const upsertOrder = this.db.prepare(`
      INSERT INTO folder_order (folder_path, uid, order_index, updated_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(folder_path, uid) DO UPDATE SET
        order_index = excluded.order_index,
        updated_ms = excluded.updated_ms
    `);

    let changed = 0;
    const transaction = this.db.transaction((txPairs: typeof normalizedPairs) => {
      for (const pair of txPairs) {
        const rows = selectRows.all(pair.sourcePath, `${pair.sourcePath}/%`) as FileRow[];
        for (const row of rows) {
          const suffix = row.path === pair.sourcePath ? '' : row.path.slice(pair.sourcePath.length);
          const nextPath = normalizePath(`${pair.targetPath}${suffix}`);
          if (!nextPath) continue;
          const existingTarget = selectTargetUid.get(nextPath) as { uid?: string } | null;
          const existingTargetUid = String(existingTarget?.uid || '').trim();
          if (existingTargetUid && existingTargetUid !== row.uid) {
            deleteFileTags.run(existingTargetUid);
            deleteFolderOrder.run(existingTargetUid);
            deleteFile.run(existingTargetUid);
          }
          const nextFolder = normalizePath(dirname(nextPath));
          updateFile.run(nextPath, nextFolder, basename(nextPath), now, row.uid);
          deleteOrderForUid.run(row.uid);
          const nextIndexRow = selectNextIndex.get(nextFolder) as { nextIndex?: number } | null;
          const nextIndex = Math.max(0, Math.trunc(Number(nextIndexRow?.nextIndex || 0)));
          upsertOrder.run(nextFolder, row.uid, nextIndex, now);
          changed += 1;
        }
      }
    });
    transaction(normalizedPairs);
    return changed;
  }

  copyRecordsForPaths(pairs: Array<{ sourcePath: string; targetPath: string }>): number {
    const normalizedPairs = (pairs || [])
      .map((pair) => ({
        sourcePath: normalizePath(pair.sourcePath),
        targetPath: normalizePath(pair.targetPath),
      }))
      .filter((pair) => pair.sourcePath && pair.targetPath && pair.sourcePath !== pair.targetPath);
    if (normalizedPairs.length === 0) return 0;

    const now = Date.now();
    const selectRows = this.db.prepare(`
      SELECT
        uid, path, folder_path AS folderPath, file_name AS name, file_type AS type,
        file_size AS size, created_ms AS createdMs, modified_ms AS modifiedMs,
        file_sig AS fileSig, metadata_json AS metadataJson,
        metadata_updated_ms AS metadataUpdatedMs, metadata_format AS metadataFormat
      FROM files
      WHERE path = ? OR path LIKE ?
      ORDER BY length(path) ASC
    `);
    const selectTargetUid = this.db.prepare('SELECT uid FROM files WHERE path = ? LIMIT 1');
    const insertFile = this.db.prepare(`
      INSERT INTO files (
        uid, path, folder_path, file_name, file_type, file_size,
        created_ms, modified_ms, file_sig, metadata_json, metadata_format,
        metadata_updated_ms, first_seen_ms, last_seen_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateFile = this.db.prepare(`
      UPDATE files
      SET
        folder_path = ?, file_name = ?, file_type = ?, file_size = ?,
        created_ms = ?, modified_ms = ?, file_sig = ?,
        metadata_json = COALESCE(metadata_json, ?),
        metadata_format = COALESCE(metadata_format, ?),
        metadata_updated_ms = COALESCE(metadata_updated_ms, ?),
        last_seen_ms = ?
      WHERE uid = ?
    `);
    const selectTags = this.db.prepare('SELECT tag FROM file_tags WHERE uid = ? ORDER BY tag COLLATE NOCASE ASC');
    const upsertTag = this.db.prepare(`
      INSERT INTO tags (tag, created_ms, updated_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(tag) DO UPDATE SET updated_ms = excluded.updated_ms
    `);
    const upsertFileTag = this.db.prepare(`
      INSERT INTO file_tags (uid, tag, created_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(uid, tag) DO NOTHING
    `);
    const selectNextIndex = this.db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM folder_order WHERE folder_path = ?');
    const upsertOrder = this.db.prepare(`
      INSERT INTO folder_order (folder_path, uid, order_index, updated_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(folder_path, uid) DO UPDATE SET updated_ms = excluded.updated_ms
    `);

    let changed = 0;
    const transaction = this.db.transaction((txPairs: typeof normalizedPairs) => {
      for (const pair of txPairs) {
        const rows = selectRows.all(pair.sourcePath, `${pair.sourcePath}/%`) as FileRow[];
        for (const row of rows) {
          const suffix = row.path === pair.sourcePath ? '' : row.path.slice(pair.sourcePath.length);
          const nextPath = normalizePath(`${pair.targetPath}${suffix}`);
          if (!nextPath) continue;
          const nextFolder = normalizePath(dirname(nextPath));
          const nextName = basename(nextPath);
          const nextFileSig = [
            nextName.toLowerCase(),
            Math.trunc(row.size),
            normalizeTimestamp(row.createdMs),
            normalizeTimestamp(row.modifiedMs),
          ].join('|');
          const existingTarget = selectTargetUid.get(nextPath) as { uid?: string } | null;
          const targetUid = String(existingTarget?.uid || '').trim() || crypto.randomUUID();
          if (!existingTarget?.uid) {
            insertFile.run(
              targetUid,
              nextPath,
              nextFolder,
              nextName,
              row.type,
              row.size,
              row.createdMs,
              row.modifiedMs,
              nextFileSig,
              row.metadataJson,
              row.metadataFormat,
              row.metadataUpdatedMs,
              now,
              now,
            );
          } else {
            updateFile.run(
              nextFolder,
              nextName,
              row.type,
              row.size,
              row.createdMs,
              row.modifiedMs,
              nextFileSig,
              row.metadataJson,
              row.metadataFormat,
              row.metadataUpdatedMs,
              now,
              targetUid,
            );
          }
          const tags = (selectTags.all(row.uid) as Array<{ tag: string }>).map((entry) => normalizeTag(entry.tag)).filter(Boolean);
          for (const tag of tags) {
            upsertTag.run(tag, now, now);
            upsertFileTag.run(targetUid, tag, now);
          }
          const nextIndexRow = selectNextIndex.get(nextFolder) as { nextIndex?: number } | null;
          const nextIndex = Math.max(0, Math.trunc(Number(nextIndexRow?.nextIndex || 0)));
          upsertOrder.run(nextFolder, targetUid, nextIndex, now);
          changed += 1;
        }
      }
    });
    transaction(normalizedPairs);
    return changed;
  }

  removeRecordsForPaths(pathInputs: string[]): number {
    const paths = Array.from(new Set((pathInputs || []).map((entry) => normalizePath(entry)).filter(Boolean)));
    if (paths.length === 0) return 0;

    const selectRows = this.db.prepare('SELECT uid, path FROM files WHERE path = ? OR path LIKE ?');
    const deleteFileTags = this.db.prepare('DELETE FROM file_tags WHERE uid = ?');
    const deleteFolderOrderByUid = this.db.prepare('DELETE FROM folder_order WHERE uid = ?');
    const deleteFile = this.db.prepare('DELETE FROM files WHERE uid = ?');
    const deleteFolderOrders = this.db.prepare('DELETE FROM folder_order WHERE folder_path = ? OR folder_path LIKE ?');

    let removed = 0;
    const transaction = this.db.transaction((txPaths: string[]) => {
      for (const path of txPaths) {
        const rows = selectRows.all(path, `${path}/%`) as Array<{ uid: string; path: string }>;
        for (const row of rows) {
          const uid = String(row.uid || '').trim();
          if (!uid) continue;
          deleteFileTags.run(uid);
          deleteFolderOrderByUid.run(uid);
          deleteFile.run(uid);
          removed += 1;
        }
        deleteFolderOrders.run(path, `${path}/%`);
      }
    });
    transaction(paths);
    return removed;
  }

  reorderFolder(folderPathInput: string, orderedUidsInput: string[]): string[] {
    const folderPath = normalizePath(folderPathInput);
    const existingRows = this.db.query(`
      SELECT fo.uid AS uid
      FROM folder_order fo
      INNER JOIN files f ON f.uid = fo.uid
      WHERE fo.folder_path = ? AND f.folder_path = ?
      ORDER BY fo.order_index ASC
    `).all(folderPath, folderPath) as Array<{ uid: string }>;

    const existingUids = existingRows.map((row) => String(row.uid || '').trim()).filter(Boolean);
    const validSet = new Set(existingUids);
    const incomingUnique: string[] = [];
    const seen = new Set<string>();
    for (const uid of orderedUidsInput || []) {
      const normalized = String(uid || '').trim();
      if (!normalized || seen.has(normalized) || !validSet.has(normalized)) continue;
      seen.add(normalized);
      incomingUnique.push(normalized);
    }
    const merged = incomingUnique.concat(existingUids.filter((uid) => !seen.has(uid)));
    const now = Date.now();

    const upsertOrder = this.db.prepare(`
      INSERT INTO folder_order (folder_path, uid, order_index, updated_ms)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(folder_path, uid) DO UPDATE SET
        order_index = excluded.order_index,
        updated_ms = excluded.updated_ms
    `);

    const transaction = this.db.transaction((uids: string[]) => {
      uids.forEach((uid, index) => {
        upsertOrder.run(folderPath, uid, index, now);
      });
    });

    transaction(merged);
    return merged;
  }

  resolveUidsForFolderPaths(folderPathInput: string, pathInputs: string[]): string[] {
    const folderPath = normalizePath(folderPathInput);
    const normalizedPaths: string[] = [];
    const seenPaths = new Set<string>();
    for (const entry of pathInputs || []) {
      const normalized = normalizePath(String(entry || ''));
      if (!normalized || seenPaths.has(normalized)) continue;
      seenPaths.add(normalized);
      normalizedPaths.push(normalized);
    }
    if (!folderPath || normalizedPaths.length === 0) return [];

    const rowsByPath = new Map<string, string>();
    const chunkSize = 300;
    for (let offset = 0; offset < normalizedPaths.length; offset += chunkSize) {
      const chunk = normalizedPaths.slice(offset, offset + chunkSize);
      if (chunk.length === 0) continue;
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = this.db.query(`
        SELECT path, uid
        FROM files
        WHERE folder_path = ? AND path IN (${placeholders})
      `).all(folderPath, ...chunk) as Array<{ path: string; uid: string }>;
      for (const row of rows) {
        const path = normalizePath(String(row?.path || ''));
        const uid = String(row?.uid || '').trim();
        if (!path || !uid || rowsByPath.has(path)) continue;
        rowsByPath.set(path, uid);
      }
    }

    const orderedUids: string[] = [];
    const seenUids = new Set<string>();
    for (const path of normalizedPaths) {
      const uid = String(rowsByPath.get(path) || '').trim();
      if (!uid || seenUids.has(uid)) continue;
      seenUids.add(uid);
      orderedUids.push(uid);
    }
    return orderedUids;
  }

  private enqueueMetadataRefresh(uid: string): void {
    const normalized = String(uid || '').trim();
    if (!normalized || this.metadataQueuedSet.has(normalized)) return;
    this.metadataQueuedSet.add(normalized);
    this.metadataQueue.push(normalized);
    this.pumpMetadataQueue();
  }

  private pumpMetadataQueue(): void {
    while (this.metadataActive < this.metadataConcurrency && this.metadataQueue.length > 0) {
      const uid = this.metadataQueue.shift() as string;
      this.metadataQueuedSet.delete(uid);
      this.metadataActive += 1;
      this.processMetadataJob(uid)
        .catch(() => {})
        .finally(() => {
          this.metadataActive = Math.max(0, this.metadataActive - 1);
          this.pumpMetadataQueue();
        });
    }
  }

  private async processMetadataJob(uid: string): Promise<void> {
    const row = this.db.query(`
      SELECT uid, path, modified_ms AS modifiedMs, file_type AS type
      FROM files
      WHERE uid = ?
      LIMIT 1
    `).get(uid) as MetadataQueueRow | null;
    if (!row || !row.path || !isMetadataSupportedType(row.path, row.type)) return;

    let metadataJson: string | null = null;
    let metadataFormat: string | null = null;

    try {
      const parsed = (await MetadataParser.parse(row.path)) || {};
      const dimensions = await readImageDimensions(row.path);
      const merged = {
        ...parsed,
        ...(dimensions.width > 0 ? { width: dimensions.width } : {}),
        ...(dimensions.height > 0 ? { height: dimensions.height } : {}),
      } as ImageMetadata;
      const sanitized = sanitizeMetadata(merged);
      metadataJson = sanitized ? JSON.stringify(sanitized) : null;
      metadataFormat = sanitized && typeof sanitized.format === 'string' ? String(sanitized.format) : null;
    } catch {
      metadataJson = null;
      metadataFormat = null;
    }

    const modifiedMs = normalizeTimestamp(row.modifiedMs);
    this.db.prepare(`
      UPDATE files
      SET
        metadata_json = ?,
        metadata_format = ?,
        metadata_updated_ms = ?
      WHERE uid = ?
    `).run(metadataJson, metadataFormat, modifiedMs, row.uid);
  }

  private ensureSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        uid TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        folder_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_ms REAL NOT NULL,
        modified_ms REAL NOT NULL,
        file_sig TEXT NOT NULL,
        metadata_json TEXT,
        metadata_format TEXT,
        metadata_updated_ms REAL,
        first_seen_ms REAL NOT NULL,
        last_seen_ms REAL NOT NULL
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_files_folder_path
      ON files(folder_path, file_name)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_files_sig
      ON files(folder_path, file_sig)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS folder_order (
        folder_path TEXT NOT NULL,
        uid TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        updated_ms REAL NOT NULL,
        PRIMARY KEY (folder_path, uid)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_folder_order_position
      ON folder_order(folder_path, order_index)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        tag TEXT PRIMARY KEY,
        created_ms REAL NOT NULL,
        updated_ms REAL NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_tags (
        uid TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_ms REAL NOT NULL,
        PRIMARY KEY (uid, tag)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_file_tags_tag
      ON file_tags(tag)
    `);
  }
}
