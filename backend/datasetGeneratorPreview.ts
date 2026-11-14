import { open } from 'node:fs/promises';
import { parseCsvRows } from './powerPrompterCsv';

const MAX_PREVIEW_BYTES = 64 * 1024 * 1024;
export function paginateDatasetPreview(csv: string, requestedPage: number, query: string) {
  const [headers = [], ...savedRows] = parseCsvRows(csv);
  const terms = query.trim().toLowerCase().replace(/_/g, ' ').split(/\s+/).filter(Boolean);
  const matches = terms.length ? savedRows.filter(row => {
    const text = row.join(' ').toLowerCase().replace(/_/g, ' ');
    return terms.every(term => text.includes(term));
  }) : savedRows;
  const pageSize = 100;
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(pages - 1, Math.max(0, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
  return { headers, rows: matches.slice(page * pageSize, (page + 1) * pageSize), page, pages,
    pageSize, total: matches.length, savedRows: savedRows.length };
}

// The caller supplies only a registered generator job's output, never a client file path.
export async function readDatasetPreview(file: string, page: number, query: string) {
  const handle = await open(file, 'r').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!handle) return paginateDatasetPreview('', page, query);
  try {
    const before = await handle.stat();
    if (before.size > MAX_PREVIEW_BYTES) throw new Error('This CSV exceeds the 64 MB browser review limit. Use Open Path to inspect it.');
    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (offset !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error('The collection is saving this file. Refresh the preview in a moment.');
    }
    const text = buffer.toString('utf8');
    if (text && !text.endsWith('\n')) throw new Error('The collection is saving this file. Refresh the preview in a moment.');
    return paginateDatasetPreview(text, page, query.slice(0, 200));
  } finally { await handle.close(); }
}
