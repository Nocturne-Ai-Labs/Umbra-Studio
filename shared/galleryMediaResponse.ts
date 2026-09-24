import { extname } from 'node:path';

export function galleryMediaSecurityHeaders(filePath: string): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    ...(extname(filePath).toLowerCase() === '.svg' ? { 'Content-Security-Policy': 'sandbox' } : {}),
  };
}
