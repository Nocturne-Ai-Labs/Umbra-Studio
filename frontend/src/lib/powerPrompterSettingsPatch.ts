const nestedSettingsKeys = new Set(['colors', 'autocomplete']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Keep unchanged fields from an older settings view out of a PATCH request. */
export function diffPowerPrompterSettings(previous: object, next: object): Record<string, unknown> {
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (sameValue(before[key], value)) continue;
    if (nestedSettingsKeys.has(key) && isRecord(value)) {
      const oldSection = isRecord(before[key]) ? before[key] as Record<string, unknown> : {};
      const sectionChanges = Object.fromEntries(
        Object.entries(value).filter(([nestedKey, nestedValue]) => !sameValue(oldSection[nestedKey], nestedValue)),
      );
      if (Object.keys(sectionChanges).length > 0) changes[key] = sectionChanges;
    } else if (value !== undefined) {
      changes[key] = value;
    }
  }
  return changes;
}
