export type InstallerFailure = { code: string; title: string; details: string[]; nextSteps: string[] };

export function parseInstallerFailure(line: string): InstallerFailure | null {
  const clean = line.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').trim();
  const prefix = 'UMBRA_VERIFY_FAIL|';
  if (!clean.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(clean.slice(prefix.length));
    if (typeof value?.code !== 'string' || !value.code || typeof value.title !== 'string' || !value.title) return null;
    const strings = (items: unknown): string[] => Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string') : [];
    return { code: value.code, title: value.title, details: strings(value.details), nextSteps: strings(value.nextSteps) };
  } catch { return null; }
}

export function installerFailureMessage(lines: string[], code: number): string {
  for (const line of [...lines].reverse()) {
    const failure = parseInstallerFailure(line);
    if (failure) return [...(failure.details.length ? failure.details : [failure.title]), ...failure.nextSteps].join(' ');
  }
  return `Installer exited with code ${code}. Review the setup log and retry.`;
}
