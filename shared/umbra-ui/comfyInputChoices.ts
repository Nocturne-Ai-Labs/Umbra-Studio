export function readComfyInputChoices(input: unknown): unknown[] | null {
  if (!Array.isArray(input)) return null;
  if (Array.isArray(input[0])) return input[0];
  const descriptor = input[1];
  return input[0] === 'COMBO'
    && descriptor !== null
    && typeof descriptor === 'object'
    && !Array.isArray(descriptor)
    && Array.isArray((descriptor as Record<string, unknown>).options)
    ? (descriptor as { options: unknown[] }).options
    : null;
}
