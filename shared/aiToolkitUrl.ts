// Empty keeps the existing default-endpoint behavior. Explicit endpoints must
// parse before they are persisted or used by the tool proxy.
export function validateAIToolkitUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'AI-Toolkit URL must be a full http:// or https:// URL.';
  if (!value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) return null;
  } catch { /* Return the same actionable validation message below. */ }
  return 'AI-Toolkit URL must be a full http:// or https:// URL, such as http://127.0.0.1:8675.';
}
