import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

const RECEIPT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_LIMIT = 500;
const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled', 'interrupted']);

export type UmbraUiImg2ImgReceiptStatus = 'saved' | 'completed' | 'failed' | 'canceled' | 'interrupted';

export interface UmbraUiImg2ImgCompletionReceipt {
  requestId: string;
  promptIndex: 0;
  status: UmbraUiImg2ImgReceiptStatus;
  outputPath: string;
  createdAt: number;
  updatedAt: number;
}

interface ReceiptIdentity {
  requestId: unknown;
  promptIndex: unknown;
  outputOwner: unknown;
  outputMode: unknown;
}

interface SavedInput extends ReceiptIdentity {
  outputPath: unknown;
}

interface TerminalInput extends ReceiptIdentity {
  status: unknown;
}

function normalizeRequestId(value: unknown): string {
  const requestId = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{8,128}$/.test(requestId) ? requestId : '';
}

function isImg2ImgRequest(input: ReceiptIdentity): boolean {
  return normalizeRequestId(input.requestId).length > 0
    && Number(input.promptIndex) === 0
    && String(input.outputOwner || '').trim() === 'umbra_ui'
    && String(input.outputMode || '').trim() === 'img2img';
}

function normalizeImagePath(value: unknown): string {
  const path = String(value || '').trim().replace(/\\/g, '/');
  if (!path || path.includes('\0') || /^(?:https?:|data:|blob:)/i.test(path)) return '';
  return IMAGE_EXTENSIONS.has(extname(path).toLowerCase()) ? path : '';
}

function normalizeReceipt(value: unknown): UmbraUiImg2ImgCompletionReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const requestId = normalizeRequestId(source.requestId);
  const status = String(source.status || '').trim() as UmbraUiImg2ImgReceiptStatus;
  const createdAt = Number(source.createdAt);
  const updatedAt = Number(source.updatedAt);
  if (!requestId || Number(source.promptIndex) !== 0
    || (status !== 'saved' && !TERMINAL_STATUSES.has(status))
    || !Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
  return {
    requestId,
    promptIndex: 0,
    status,
    outputPath: normalizeImagePath(source.outputPath),
    createdAt,
    updatedAt,
  };
}

export class UmbraUiImg2ImgCompletionReceipts {
  private readonly filePath: string;
  private receipts = new Map<string, UmbraUiImg2ImgCompletionReceipt>();

  constructor(directory: string, private readonly now = Date.now) {
    this.filePath = join(directory, 'receipts.json');
    try {
      const document = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, unknown>;
      if (document.version !== 1 || !Array.isArray(document.receipts)) return;
      for (const entry of document.receipts) {
        const receipt = normalizeReceipt(entry);
        if (receipt) this.receipts.set(receipt.requestId, receipt);
      }
      this.prune(this.receipts);
    } catch { /* Missing or corrupt receipts cannot authorize replacement. */ }
  }

  private prune(receipts: Map<string, UmbraUiImg2ImgCompletionReceipt>): void {
    const now = this.now();
    for (const [requestId, receipt] of receipts) {
      if (receipt.createdAt > now || now - receipt.createdAt > RECEIPT_MAX_AGE_MS) receipts.delete(requestId);
    }
    const oldest = [...receipts.values()].sort((left, right) => left.createdAt - right.createdAt);
    for (const receipt of oldest.slice(0, Math.max(0, oldest.length - RECEIPT_LIMIT))) {
      receipts.delete(receipt.requestId);
    }
  }

  private commit(next: Map<string, UmbraUiImg2ImgCompletionReceipt>): void {
    this.prune(next);
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(tempPath, JSON.stringify({ version: 1, receipts: [...next.values()] }), { encoding: 'utf8', mode: 0o600 });
      renameSync(tempPath, this.filePath);
      this.receipts = next;
    } catch (error) {
      try { unlinkSync(tempPath); } catch { /* The temporary file may not exist. */ }
      throw error;
    }
  }

  recordSaved(input: SavedInput): boolean {
    if (!isImg2ImgRequest(input)) return false;
    const outputPath = normalizeImagePath(input.outputPath);
    if (!outputPath) return false;
    const requestId = normalizeRequestId(input.requestId);
    const previous = this.receipts.get(requestId);
    if (previous && TERMINAL_STATUSES.has(previous.status) && previous.status !== 'completed') return false;
    if (previous?.outputPath) return true; // The first image from prompt zero wins.
    const now = this.now();
    const next = new Map(this.receipts);
    next.set(requestId, {
      requestId,
      promptIndex: 0,
      status: previous?.status || 'saved',
      outputPath,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    });
    this.commit(next);
    return true;
  }

  recordTerminal(input: TerminalInput): boolean {
    if (!isImg2ImgRequest(input)) return false;
    const status = String(input.status || '').trim() as UmbraUiImg2ImgReceiptStatus;
    if (!TERMINAL_STATUSES.has(status)) return false;
    const requestId = normalizeRequestId(input.requestId);
    const previous = this.receipts.get(requestId);
    const now = this.now();
    const next = new Map(this.receipts);
    next.set(requestId, {
      requestId,
      promptIndex: 0,
      status,
      outputPath: status === 'completed' ? previous?.outputPath || '' : '',
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    });
    this.commit(next);
    return true;
  }

  async get(
    requestIdInput: unknown,
    authorizeOutputPath: (path: string) => Promise<string | null>,
  ): Promise<UmbraUiImg2ImgCompletionReceipt | null> {
    const requestId = normalizeRequestId(requestIdInput);
    const receipt = this.receipts.get(requestId);
    if (!receipt) return null;
    const now = this.now();
    if (receipt.createdAt > now || now - receipt.createdAt > RECEIPT_MAX_AGE_MS) return null;
    if (receipt.status !== 'completed' || !receipt.outputPath) {
      return { ...receipt, outputPath: '' };
    }
    const allowedPath = await authorizeOutputPath(receipt.outputPath);
    return allowedPath ? { ...receipt, outputPath: allowedPath } : null;
  }
}
