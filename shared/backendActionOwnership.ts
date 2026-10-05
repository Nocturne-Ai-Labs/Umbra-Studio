import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
const CONTEXT_HEADER = 'x-umbra-internal-action-context';
const RETURN_HEADER = 'x-umbra-action-return';
const contextPattern = /^main-v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Only the authorized main proxy helpers call this, after their path admission.
export function addMainActionDelegation(headers: Headers, token: string): void {
  try {
    headers.delete(CONTEXT_HEADER);
    headers.delete(RETURN_HEADER);
    if (token) headers.set(CONTEXT_HEADER, `main-v1:${randomUUID()}`);
  } catch { /* Logging metadata must not affect dispatch. */ }
}
function returnSignature(context: string, token: string): string {
  return createHmac('sha256', token).update('gallery-return-v1:' + context).digest('hex');
}
export function isReturnedMainAction(req: Request, token: string): boolean {
  try {
    const context = req.headers.get(CONTEXT_HEADER) || '';
    const signature = req.headers.get(RETURN_HEADER) || '';
    if (!token || !contextPattern.test(context) || !/^[0-9a-f]{64}$/.test(signature)) return false;
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(returnSignature(context, token), 'hex'));
  } catch { return false; }
}
export function createGalleryActionOwnership() {
  const delegated = new WeakMap<Request, { context: string; token: string }>();
  const forwarded = new WeakSet<Response>();
  return {
    accept(req: Request, token: string) {
      delegated.delete(req);
      try {
        const context = req.headers.get(CONTEXT_HEADER) || '';
        if (token && req.headers.get('x-umbra-gallery-bridge-token') === token
          && contextPattern.test(context)) delegated.set(req, { context, token });
      } catch { /* Unavailable metadata cannot establish ownership. */ }
    },
    returnToMain(req: Request, headers: Headers): void {
      // Strip all caller flags. Add a proof only for a request authenticated and
      // admitted by Gallery; main validates it before suppressing a returned hop.
      try {
        headers.delete(CONTEXT_HEADER);
        headers.delete(RETURN_HEADER);
        const context = delegated.get(req);
        if (context) {
          const signature = returnSignature(context.context, context.token);
          headers.set(CONTEXT_HEADER, context.context);
          headers.set(RETURN_HEADER, signature);
        }
      } catch {
        // Remove partial metadata where writable; never let reporting break an API.
        try { headers.delete(CONTEXT_HEADER); } catch {}
        try { headers.delete(RETURN_HEADER); } catch {}
      }
    },
    forwarded(response: Response): Response { forwarded.add(response); return response; },
    suppressed(req: Request, response: Response | undefined): boolean {
      return delegated.has(req) || Boolean(response && forwarded.has(response));
    },
  };
}
