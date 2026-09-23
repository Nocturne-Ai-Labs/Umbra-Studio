import { basename } from 'path';
import { CensorReviewError, UmbraUiCensorReviewService } from '../UmbraUiCensorReviewService';

interface Context {
  service: UmbraUiCensorReviewService;
  source: (path: unknown) => string;
  overlay: (path: string) => string;
  tags: (path: string) => string[];
  output: (source: string, folder: unknown, pinned: unknown) => string;
  register: (path: string, censored: boolean, protectedMedia: boolean) => Promise<void>;
}
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function readLimited(req: Request, limit: number, message: string): Promise<Uint8Array> {
  if (Number(req.headers.get('content-length')) > limit)
    throw new CensorReviewError(message, 413);
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new CensorReviewError(message, 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function body(req: Request): Promise<Record<string, any>> {
  const bytes = await readLimited(req, 16 * 1024 * 1024, 'Review edits exceed the 16 MB limit.');
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new CensorReviewError('Invalid review request.');
  return data;
}
export async function handleCensorReviewRoute(req: Request, context: Context): Promise<Response> {
  try {
    const parts = new URL(req.url).pathname
      .slice('/api/umbra-ui/censor-review/projects'.length)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const [projectId, segment, itemId, action, filename] = parts;
    const { service } = context;
    if (!projectId) {
      if (req.method === 'GET') return json(await service.list());
      if (req.method === 'POST')
        return json(await service.create(String((await body(req)).name || 'Censor review')));
    }
    if (parts.length === 1) {
      if (req.method === 'GET') return json(await service.getProject(projectId));
      if (req.method === 'PATCH')
        return json(await service.rename(projectId, String((await body(req)).name || '')));
    }
    if (segment === 'items') {
      if (!itemId && req.method === 'POST') {
        // Stay below Bun's default request limit; local-file imports allow larger sources.
        const bytes = await readLimited(req, 121 * 1024 * 1024, 'Review uploads exceed the 120 MB limit.');
        const form = await new Response(bytes.buffer as ArrayBuffer, { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData();
        const upload = form.get('file');
        const path = context.source(form.get('path'));
        const initial = JSON.parse(String(form.get('settings') || '{}'));
        if (initial.overlayPath) initial.overlayPath = context.overlay(initial.overlayPath);
        if (path)
          return json(
            await service.importImage(
              projectId,
              { path, name: basename(path), tags: context.tags(path) },
              initial,
            ),
          );
        if (!(upload instanceof File) || upload.size > 120 * 1024 * 1024 || !upload.size)
          throw new CensorReviewError('Choose an upload up to 120 MB, or import a local image up to 256 MB.');
        return json(
          await service.importImage(
            projectId,
            { name: upload.name, bytes: new Uint8Array(await upload.arrayBuffer()) },
            initial,
          ),
        );
      }
      if (itemId && !action) {
        if (req.method === 'GET') return json(await service.getItem(projectId, itemId));
        if (req.method === 'DELETE')
          return json(await service.removeItem(projectId, itemId, (await body(req)).revision));
        if (req.method === 'PUT')
          return json(await service.saveEdits(projectId, itemId, await body(req), context.overlay));
      }
      if (itemId && action === 'assets' && filename && req.method === 'GET') {
        return new Response(Bun.file(await service.asset(projectId, itemId, filename)), {
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        });
      }
      if (itemId && req.method === 'POST') {
        const data = await body(req);
        if (action === 'detect') return json(await service.detect(projectId, itemId, data.revision));
        if (action === 'render') return json(await service.render(projectId, itemId, data.revision));
        if (action === 'approve-uncensored')
          return json(await service.approveUncensored(projectId, itemId, data.revision));
        if (action === 'review')
          return json(await service.review(projectId, itemId, data.revision, data.approve === true));
        if (action === 'export')
          return json(
            await service.exportItem(
              projectId,
              itemId,
              data.revision,
              (source) => context.output(source, data.outputFolder, data.pinnedOutputFolder),
              context.register,
            ),
          );
      }
    }
    return json({ error: 'Review route not found.' }, 404);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Review operation failed.' },
      error instanceof CensorReviewError ? error.status : 400,
    );
  }
}
