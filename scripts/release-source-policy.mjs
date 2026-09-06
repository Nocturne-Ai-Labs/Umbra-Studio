// Keep explicit privacy exclusions consistent across source and portable builds.
export function isPrivateDevelopmentSource(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = normalized.split('/');
  const name = parts.at(-1) || '';
  return parts.some((part) => ['.agents', '.codex', '.git'].includes(part))
    || /^\.env(?:\.|$)/i.test(name)
    || /\.test\./i.test(name)
    || /^test-.*\.[cm]?[jt]sx?$/i.test(name)
    || /^scripts\/(?:test_anima_model_merge\.py|qualify-anima-[^/]+\.(?:py|ts)|gallery-(?:operation|copy-collision)-audit\.ts)$/i.test(normalized)
    || /^scripts\/generate-[^/]*wildcard[^/]*\.mjs$/i.test(normalized)
    || /^defaults\/PowerPrompter\/Wildcards(?:\/|$)/i.test(normalized);
}
