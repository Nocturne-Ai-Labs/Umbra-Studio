export function nextMergeRevisionName(original: string, existingNames: string[]): string {
  const stem = original.replace(/\.safetensors$/i, '').trim();
  const existing = new Set(existingNames.map(name => name.replace(/\.safetensors$/i, '').toLowerCase()));
  existing.add(stem.toLowerCase());
  for (let revision = 1; ; revision++) {
    const suffix = revision === 1 ? ' - edit' : ` - edit ${revision}`;
    const candidate = `${stem.slice(0, 100 - suffix.length).trimEnd()}${suffix}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
}
