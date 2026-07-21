/**
 * EditorDb compatibility layer.
 * Uses the shared GalleryDb SQLite file so we only maintain one DB file.
 */

import { Database } from 'bun:sqlite';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';

const ROOT_DIR = process.env.UMBRA_ROOT
  ? resolve(process.env.UMBRA_ROOT)
  : import.meta.dir.replace(/\/backend$|\\backend$/, '');
const USER_DIR = join(ROOT_DIR, 'User');
const DB_PATH = join(USER_DIR, 'Config', 'GalleryDb.db');
const LEGACY_DB_PATH = join(USER_DIR, 'Config', 'EditorDb.db');

let db: Database | null = null;

async function cleanupLegacyEditorDbArtifacts(): Promise<void> {
  const legacyPaths = [
    LEGACY_DB_PATH,
    `${LEGACY_DB_PATH}-wal`,
    `${LEGACY_DB_PATH}-shm`,
  ];
  for (const artifactPath of legacyPaths) {
    if (!existsSync(artifactPath)) continue;
    await fs.unlink(artifactPath).catch(() => {});
  }
}

/**
 * Initialize the database and create tables if needed
 */
export async function initDatabase(): Promise<void> {
  // Ensure User/Config directory exists
  const dbDir = join(USER_DIR, 'Config');
  if (!existsSync(dbDir)) {
    await fs.mkdir(dbDir, { recursive: true });
  }

  // Open database (creates file if doesn't exist)
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent performance
  db.run('PRAGMA journal_mode = WAL');

  // Remove deprecated rating/color metadata table from older installs.
  db.run('DROP TABLE IF EXISTS image_meta');

  // Create custom_order table
  db.run(`
    CREATE TABLE IF NOT EXISTS custom_order (
      folder_path TEXT NOT NULL,
      image_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (folder_path, image_id)
    )
  `);

  // Create index for faster lookups
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_custom_order_folder 
    ON custom_order(folder_path, position)
  `);

  // Create presets table
  db.run(`
    CREATE TABLE IF NOT EXISTS presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT DEFAULT 'custom',
      adjustments TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create editor tag tables in a namespaced form to avoid collision with GalleryDb tags schema.
  db.run(`
    CREATE TABLE IF NOT EXISTS editor_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT ''
    )
  `);

  // Create editor_image_tags junction table
  db.run(`
    CREATE TABLE IF NOT EXISTS editor_image_tags (
      image_path TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (image_path, tag_id),
      FOREIGN KEY (tag_id) REFERENCES editor_tags(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_editor_image_tags_path
    ON editor_image_tags(image_path)
  `);

  // Create editor_config table (persists editor settings like export/watermark config)
  db.run(`
    CREATE TABLE IF NOT EXISTS editor_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create editor_adjustments table (non-destructive edit payload per image path)
  db.run(`
    CREATE TABLE IF NOT EXISTS editor_adjustments (
      path TEXT PRIMARY KEY,
      sidecar_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS editor_db_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // One-time migration from legacy standalone EditorDb file into shared GalleryDb file.
  const migrationKey = 'legacy-editor-db-migrated-to-gallerydb';
  const migrationRow = db.prepare('SELECT value FROM editor_db_meta WHERE key = ?').get(migrationKey) as { value?: string } | null;
  const migrationDone = String(migrationRow?.value || '').trim() === '1';
  let migrationCompleted = migrationDone;
  if (!migrationDone && resolve(LEGACY_DB_PATH) !== resolve(DB_PATH) && existsSync(LEGACY_DB_PATH)) {
    try {
      db.run(`ATTACH DATABASE '${LEGACY_DB_PATH.replace(/'/g, "''")}' AS legacy_editor_db`);

      try {
        db.run(`
          INSERT OR IGNORE INTO custom_order (folder_path, image_id, position, updated_at)
          SELECT folder_path, image_id, position, updated_at FROM legacy_editor_db.custom_order
        `);
      } catch {}

      try {
        db.run(`
          INSERT OR IGNORE INTO presets (id, name, category, adjustments, created_at, updated_at)
          SELECT id, name, category, adjustments, created_at, updated_at FROM legacy_editor_db.presets
        `);
      } catch {}

      try {
        db.run(`
          INSERT OR IGNORE INTO editor_tags (id, name, color)
          SELECT id, name, color FROM legacy_editor_db.tags
        `);
      } catch {}

      try {
        db.run(`
          INSERT OR IGNORE INTO editor_image_tags (image_path, tag_id)
          SELECT image_path, tag_id FROM legacy_editor_db.image_tags
        `);
      } catch {}

      try {
        db.run(`
          INSERT OR IGNORE INTO editor_config (key, value, updated_at)
          SELECT key, value, updated_at FROM legacy_editor_db.editor_config
        `);
      } catch {}

      try {
        db.run(`
          INSERT OR IGNORE INTO editor_adjustments (path, sidecar_json, created_at, updated_at)
          SELECT path, sidecar_json, created_at, updated_at FROM legacy_editor_db.editor_adjustments
        `);
      } catch {}

      db.run('DETACH DATABASE legacy_editor_db');
      db.prepare(`
        INSERT INTO editor_db_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(migrationKey, '1');
      migrationCompleted = true;
    } catch (migrationError) {
      console.warn('[EditorDb] Legacy migration skipped:', migrationError);
      try {
        db.run('DETACH DATABASE legacy_editor_db');
      } catch {}
    }
  }

  if (migrationCompleted) {
    await cleanupLegacyEditorDbArtifacts();
  }

  console.log('[EditorDb] Database initialized at:', DB_PATH);
}

/**
 * Get the custom order for a folder
 * Returns array of image IDs in order
 */
export function getCustomOrder(folderPath: string): string[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    SELECT image_id 
    FROM custom_order 
    WHERE folder_path = ? 
    ORDER BY position ASC
  `);

  const rows = stmt.all(folderPath) as Array<{ image_id: string }>;
  return rows.map(row => row.image_id);
}

/**
 * Set the custom order for a folder
 * Replaces all existing order for that folder
 */
export function setCustomOrder(folderPath: string, imageIds: string[]): void {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();

  // Use transaction for atomic update
  const transaction = db.transaction((folderPath: string, imageIds: string[], now: number) => {
    // Delete existing order for this folder
    const deleteStmt = db!.prepare('DELETE FROM custom_order WHERE folder_path = ?');
    deleteStmt.run(folderPath);

    // Insert new order
    const insertStmt = db!.prepare(`
      INSERT INTO custom_order (folder_path, image_id, position, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    imageIds.forEach((imageId, index) => {
      insertStmt.run(folderPath, imageId, index, now);
    });
  });

  transaction(folderPath, imageIds, now);
}

/**
 * Clear custom order for a folder
 */
export function clearCustomOrder(folderPath: string): void {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM custom_order WHERE folder_path = ?');
  stmt.run(folderPath);
}

/**
 * Get all folders that have custom order
 */
export function getFoldersWithCustomOrder(): string[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT DISTINCT folder_path FROM custom_order');
  const rows = stmt.all() as Array<{ folder_path: string }>;
  return rows.map(row => row.folder_path);
}

// ============================================
// PRESETS
// ============================================

export interface PresetRow {
  id: number;
  name: string;
  category: string;
  adjustments: string;
  created_at: number;
  updated_at: number;
}

export function listPresets(): PresetRow[] {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM presets ORDER BY name ASC').all() as PresetRow[];
}

export function getPreset(id: number): PresetRow | null {
  if (!db) throw new Error('Database not initialized');
  return (db.prepare('SELECT * FROM presets WHERE id = ?').get(id) as PresetRow) || null;
}

export function getPresetByName(name: string): PresetRow | null {
  if (!db) throw new Error('Database not initialized');
  return (db.prepare('SELECT * FROM presets WHERE name = ?').get(name) as PresetRow) || null;
}

export function createPreset(name: string, adjustments: string, category = 'custom'): number {
  if (!db) throw new Error('Database not initialized');
  const now = Date.now();
  const result = db.prepare(
    'INSERT INTO presets (name, category, adjustments, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(name, category, adjustments, now, now);
  return Number(result.lastInsertRowid);
}

export function upsertPreset(name: string, adjustments: string, category = 'custom'): { id: number; created: boolean } {
  if (!db) throw new Error('Database not initialized');
  const existing = getPresetByName(name);
  if (existing) {
    updatePreset(existing.id, name, adjustments, category);
    return { id: existing.id, created: false };
  }
  const id = createPreset(name, adjustments, category);
  return { id, created: true };
}

export function updatePreset(id: number, name: string, adjustments: string, category?: string): void {
  if (!db) throw new Error('Database not initialized');
  const now = Date.now();
  if (category !== undefined) {
    db.prepare('UPDATE presets SET name = ?, adjustments = ?, category = ?, updated_at = ? WHERE id = ?')
      .run(name, adjustments, category, now, id);
  } else {
    db.prepare('UPDATE presets SET name = ?, adjustments = ?, updated_at = ? WHERE id = ?')
      .run(name, adjustments, now, id);
  }
}

export function deletePreset(id: number): void {
  if (!db) throw new Error('Database not initialized');
  db.prepare('DELETE FROM presets WHERE id = ?').run(id);
}

// ============================================
// TAGS
// ============================================

export interface TagRow {
  id: number;
  name: string;
  color: string;
}

export function listTags(): TagRow[] {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM editor_tags ORDER BY name ASC').all() as TagRow[];
}

export function createTag(name: string, color = ''): number {
  if (!db) throw new Error('Database not initialized');
  const result = db.prepare('INSERT OR IGNORE INTO editor_tags (name, color) VALUES (?, ?)').run(name, color);
  if (Number(result.lastInsertRowid) > 0) return Number(result.lastInsertRowid);
  // Already exists, return existing id
  const existing = db.prepare('SELECT id FROM editor_tags WHERE name = ?').get(name) as { id: number } | undefined;
  return existing?.id ?? 0;
}

export function deleteTag(id: number): void {
  if (!db) throw new Error('Database not initialized');
  db.prepare('DELETE FROM editor_image_tags WHERE tag_id = ?').run(id);
  db.prepare('DELETE FROM editor_tags WHERE id = ?').run(id);
}

export function getImageTags(imagePath: string): TagRow[] {
  if (!db) throw new Error('Database not initialized');
  return db.prepare(`
    SELECT t.* FROM editor_tags t
    INNER JOIN editor_image_tags it ON it.tag_id = t.id
    WHERE it.image_path = ?
    ORDER BY t.name ASC
  `).all(imagePath) as TagRow[];
}

export function getImageTagsBatch(imagePaths: string[]): Record<string, TagRow[]> {
  if (!db) throw new Error('Database not initialized');
  const normalizedPaths = Array.from(new Set(
    (Array.isArray(imagePaths) ? imagePaths : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
  if (normalizedPaths.length === 0) return {};

  const placeholders = normalizedPaths.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT it.image_path, t.id, t.name, t.color
    FROM editor_image_tags it
    INNER JOIN editor_tags t ON t.id = it.tag_id
    WHERE it.image_path IN (${placeholders})
    ORDER BY it.image_path ASC, t.name ASC
  `).all(...normalizedPaths) as Array<{ image_path: string; id: number; name: string; color: string }>;

  const tagsByPath: Record<string, TagRow[]> = {};
  for (const path of normalizedPaths) {
    tagsByPath[path] = [];
  }
  for (const row of rows) {
    if (!tagsByPath[row.image_path]) tagsByPath[row.image_path] = [];
    tagsByPath[row.image_path].push({
      id: row.id,
      name: row.name,
      color: row.color,
    });
  }
  return tagsByPath;
}

export function addImageTag(imagePath: string, tagId: number): void {
  if (!db) throw new Error('Database not initialized');
  db.prepare('INSERT OR IGNORE INTO editor_image_tags (image_path, tag_id) VALUES (?, ?)').run(imagePath, tagId);
}

export function removeImageTag(imagePath: string, tagId: number): void {
  if (!db) throw new Error('Database not initialized');
  db.prepare('DELETE FROM editor_image_tags WHERE image_path = ? AND tag_id = ?').run(imagePath, tagId);
}

export function setImageTags(imagePath: string, tagIds: number[]): void {
  if (!db) throw new Error('Database not initialized');

  const transaction = db.transaction((imagePath: string, tagIds: number[]) => {
    db!.prepare('DELETE FROM editor_image_tags WHERE image_path = ?').run(imagePath);
    const stmt = db!.prepare('INSERT INTO editor_image_tags (image_path, tag_id) VALUES (?, ?)');
    for (const tagId of tagIds) {
      stmt.run(imagePath, tagId);
    }
  });

  transaction(imagePath, tagIds);
}

export function searchImagePathsByTag(query: string, limit = 100): string[] {
  if (!db) throw new Error('Database not initialized');
  const q = `%${query.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT DISTINCT it.image_path
    FROM editor_image_tags it
    INNER JOIN editor_tags t ON t.id = it.tag_id
    WHERE LOWER(t.name) LIKE ?
    ORDER BY it.image_path ASC
    LIMIT ?
  `).all(q, limit) as Array<{ image_path: string }>;
  return rows.map((r) => r.image_path);
}

// --- Editor Config ---

export function getEditorConfig(key: string): string | null {
  if (!db) throw new Error('Database not initialized');
  const row = db.prepare('SELECT value FROM editor_config WHERE key = ?').get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function setEditorConfig(key: string, value: string): void {
  if (!db) throw new Error('Database not initialized');
  db.prepare(`
    INSERT INTO editor_config (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

// --- Editor Adjustments (DB-backed sidecars) ---

export function getEditorAdjustment(path: string): string | null {
  if (!db) throw new Error('Database not initialized');
  const row = db.prepare('SELECT sidecar_json FROM editor_adjustments WHERE path = ?').get(path) as { sidecar_json: string } | null;
  return row?.sidecar_json ?? null;
}

export function setEditorAdjustment(path: string, sidecarJson: string): void {
  if (!db) throw new Error('Database not initialized');
  const now = Date.now();
  db.prepare(`
    INSERT INTO editor_adjustments (path, sidecar_json, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET sidecar_json = excluded.sidecar_json, updated_at = excluded.updated_at
  `).run(path, sidecarJson, now, now);
}

export function deleteEditorAdjustment(path: string): void {
  if (!db) throw new Error('Database not initialized');
  db.prepare('DELETE FROM editor_adjustments WHERE path = ?').run(path);
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get database instance (for direct queries if needed)
 */
export function getDB(): Database | null {
  return db;
}
