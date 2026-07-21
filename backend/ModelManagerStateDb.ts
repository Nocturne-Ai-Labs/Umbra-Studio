import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

export type ModelManagerClipboardRow = {
  id: number;
  capturedAt: number;
  model: Record<string, unknown>;
};

export type ModelManagerStateRecord = {
  openedModelIds: number[];
  civitaiClipboard: ModelManagerClipboardRow[];
};

export type ModelManagerMediaCacheEntry = {
  mediaUrl: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number;
  fetchedAt: number;
};

const DEFAULT_DB_RELATIVE_PATH = join('User', 'Config', 'GalleryDb.db');

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(value || ''));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class ModelManagerStateDb {
  private readonly db: Database;

  constructor(rootDir: string, relativeDbPath = DEFAULT_DB_RELATIVE_PATH) {
    const dbPath = resolve(rootDir, relativeDbPath);
    const dbDir = resolve(dbPath, '..');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA synchronous = NORMAL');
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  getState(): ModelManagerStateRecord {
    const openedRow = this.db.prepare(`
      SELECT value
      FROM model_manager_state
      WHERE key = 'opened_model_ids'
      LIMIT 1
    `).get() as { value?: string } | null;
    let openedModelIds: number[] = [];
    try {
      const parsed = JSON.parse(String(openedRow?.value || '[]'));
      if (Array.isArray(parsed)) {
        openedModelIds = parsed
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
          .map((value) => Math.floor(value));
      }
    } catch {
      openedModelIds = [];
    }

    const clipboardRows = this.db.prepare(`
      SELECT model_id AS id, captured_at AS capturedAt, model_json AS modelJson
      FROM model_manager_clipboard
      ORDER BY captured_at DESC
    `).all() as Array<{ id: number; capturedAt: number; modelJson: string }>;

    const civitaiClipboard: ModelManagerClipboardRow[] = [];
    for (const row of clipboardRows) {
      const id = Number(row?.id || 0);
      if (!Number.isFinite(id) || id <= 0) continue;
      const model = parseJsonObject(String(row?.modelJson || ''));
      if (!model) continue;
      model.id = Math.floor(id);
      civitaiClipboard.push({
        id: Math.floor(id),
        capturedAt: Number.isFinite(Number(row?.capturedAt)) ? Math.floor(Number(row.capturedAt)) : Date.now(),
        model,
      });
    }

    return {
      openedModelIds,
      civitaiClipboard,
    };
  }

  replaceState(state: ModelManagerStateRecord): void {
    const openedModelIds = Array.from(new Set(
      (state.openedModelIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value)),
    ));

    const clipboard = Array.from(new Set(
      (state.civitaiClipboard || [])
        .map((entry) => Number(entry?.id || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
        .map((id) => Math.floor(id)),
    ));

    const byId = new Map<number, ModelManagerClipboardRow>();
    for (const entry of state.civitaiClipboard || []) {
      const id = Number(entry?.id || 0);
      if (!Number.isFinite(id) || id <= 0) continue;
      const normalizedId = Math.floor(id);
      if (!clipboard.includes(normalizedId)) continue;
      const model = entry?.model && typeof entry.model === 'object' && !Array.isArray(entry.model)
        ? { ...entry.model, id: normalizedId }
        : { id: normalizedId };
      byId.set(normalizedId, {
        id: normalizedId,
        capturedAt: Number.isFinite(Number(entry?.capturedAt)) ? Math.floor(Number(entry.capturedAt)) : Date.now(),
        model,
      });
    }

    const upsertState = this.db.prepare(`
      INSERT INTO model_manager_state (key, value, updated_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_ms = excluded.updated_ms
    `);
    const clearClipboard = this.db.prepare('DELETE FROM model_manager_clipboard');
    const insertClipboard = this.db.prepare(`
      INSERT INTO model_manager_clipboard (model_id, captured_at, model_json)
      VALUES (?, ?, ?)
      ON CONFLICT(model_id) DO UPDATE SET
        captured_at = excluded.captured_at,
        model_json = excluded.model_json
    `);

    const tx = this.db.transaction(() => {
      const now = Date.now();
      upsertState.run('opened_model_ids', JSON.stringify(openedModelIds), now);
      clearClipboard.run();
      for (const modelId of clipboard) {
        const entry = byId.get(modelId);
        if (!entry) continue;
        insertClipboard.run(modelId, entry.capturedAt, JSON.stringify(entry.model));
      }
    });

    tx();
  }

  getMediaCache(mediaUrl: string): ModelManagerMediaCacheEntry | null {
    const row = this.db.prepare(`
      SELECT media_url AS mediaUrl, local_path AS localPath, mime_type AS mimeType, size_bytes AS sizeBytes, fetched_at AS fetchedAt
      FROM model_manager_media_cache
      WHERE media_url = ?
      LIMIT 1
    `).get(String(mediaUrl || '').trim()) as ModelManagerMediaCacheEntry | null;
    return row || null;
  }

  upsertMediaCache(entry: ModelManagerMediaCacheEntry): void {
    const mediaUrl = String(entry.mediaUrl || '').trim();
    const localPath = String(entry.localPath || '').trim();
    if (!mediaUrl || !localPath) return;
    this.db.prepare(`
      INSERT INTO model_manager_media_cache (media_url, local_path, mime_type, size_bytes, fetched_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(media_url) DO UPDATE SET
        local_path = excluded.local_path,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        fetched_at = excluded.fetched_at
    `).run(
      mediaUrl,
      localPath,
      entry.mimeType || null,
      Math.max(0, Math.floor(Number(entry.sizeBytes || 0))),
      Number.isFinite(Number(entry.fetchedAt)) ? Math.floor(Number(entry.fetchedAt)) : Date.now(),
    );
  }

  deleteMediaCache(mediaUrlInput: string): ModelManagerMediaCacheEntry | null {
    const mediaUrl = String(mediaUrlInput || '').trim();
    if (!mediaUrl) return null;
    const existing = this.getMediaCache(mediaUrl);
    if (!existing) return null;
    this.db.prepare('DELETE FROM model_manager_media_cache WHERE media_url = ?').run(mediaUrl);
    return existing;
  }

  private ensureSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS model_manager_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_ms INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS model_manager_clipboard (
        model_id INTEGER PRIMARY KEY,
        captured_at INTEGER NOT NULL,
        model_json TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS model_manager_media_cache (
        media_url TEXT PRIMARY KEY,
        local_path TEXT NOT NULL,
        mime_type TEXT,
        size_bytes INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_model_manager_clipboard_captured
      ON model_manager_clipboard(captured_at DESC)
    `);
  }
}
