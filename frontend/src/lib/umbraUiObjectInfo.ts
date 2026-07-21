function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * ComfyUI answers an unknown `/object_info/:node` request with HTTP 200 and `{}`.
 * Registration must therefore be proven from the payload, not the status code.
 */
export function readUmbraObjectInfoRequiredInputs(
  payload: unknown,
  nodeType: string,
): Record<string, unknown> {
  const root = asRecord(payload);
  const node = asRecord(root?.[nodeType]);
  if (!node) throw new Error(`${nodeType} is not registered in ComfyUI.`);
  const input = asRecord(node.input);
  return asRecord(input?.required) || {};
}
