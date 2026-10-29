/** Send only explicitly edited keys; stale browser defaults must not overwrite other preferences. */
export function selectSettingsPatch<T extends object>(requested: Partial<T>, normalized: T): Partial<T> {
  return Object.fromEntries(Object.keys(requested).map(key => [key, normalized[key as keyof T]])) as Partial<T>;
}
