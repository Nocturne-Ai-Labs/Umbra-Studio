// Keep explicit privacy exclusions consistent across source and portable builds.
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_MARKDOWN = new Set([
  'CHANGELOG.md',
  'Credits.md',
  'README.md',
  'REQUIREMENTS.md',
  'UMBRA_UI_TOUR.md',
  'User/README.md',
]);

export function isPrivateDevelopmentSource(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = normalized.split('/');
  const name = parts.at(-1) || '';
  return (name.toLowerCase().endsWith('.md') && !PUBLIC_MARKDOWN.has(normalized))
    || parts.some((part) => ['.agents', '.codex', '.git'].includes(part))
    || /^\.env(?:\.|$)/i.test(name)
    || /\.test\./i.test(name)
    || /^test-.*\.[cm]?[jt]sx?$/i.test(name)
    || /^scripts\/(?:test_anima_model_merge\.py|qualify-anima-[^/]+\.(?:py|ts)|gallery-(?:operation|copy-collision)-audit\.ts)$/i.test(normalized)
    || /^scripts\/generate-[^/]*wildcard[^/]*\.mjs$/i.test(normalized)
    || /^defaults\/PowerPrompter\/Wildcards(?:\/|$)/i.test(normalized);
}

export function findPrivatePackagedSource(appRoot, managedEntries) {
  const found = [];
  for (const entry of managedEntries) {
    if (entry === 'node_modules') continue;
    const target = path.resolve(appRoot, entry);
    if (!fs.existsSync(target) || !fs.lstatSync(target).isDirectory()) continue;
    const pending = [target];
    while (pending.length > 0) {
      const directory = pending.pop();
      for (const child of fs.readdirSync(directory, { withFileTypes: true })) {
        if (child.name === 'node_modules') continue;
        const fullPath = path.join(directory, child.name);
        const relativePath = path.relative(appRoot, fullPath);
        if (isPrivateDevelopmentSource(relativePath)) found.push(fullPath);
        else if (child.isDirectory()) pending.push(fullPath);
      }
    }
  }
  return found;
}
