function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Apply only submitted settings fields to the latest persisted document. */
export function mergePowerPrompterSettingsPatch(
  current: Record<string, unknown>,
  changes: unknown,
): Record<string, unknown> {
  if (!isRecord(changes)) throw new TypeError('Invalid Power Prompter settings patch');
  const next = { ...current, ...changes };
  for (const key of ['colors', 'autocomplete']) {
    if (!Object.hasOwn(changes, key)) continue;
    const changedSection = changes[key];
    if (!isRecord(changedSection)) throw new TypeError(`Invalid Power Prompter ${key} patch`);
    next[key] = {
      ...(isRecord(current[key]) ? current[key] : {}),
      ...changedSection,
    };
  }
  return next;
}
