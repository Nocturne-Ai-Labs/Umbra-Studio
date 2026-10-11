import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LocalRequirement = { text: string; constraint: boolean };
export type LocalRequirements = { fingerprint: string; declarations: LocalRequirement[] };

// No network or metadata resolution. A receipt describes every bounded local input,
// including constraints, rather than just the top-level requirements.txt.
export function inspectLocalRequirements(path: string, constraints: string[] = []): LocalRequirements {
  const files: { path: string; constraint: boolean; content: string }[] = [];
  const declarations: LocalRequirement[] = [];
  const active = new Set<string>();
  let bytes = 0, lines = 0;
  const local = (value: string, parent: string) => {
    if (/\$\{|^(?:\\\\|\/\/)/.test(value)) throw new Error('Remote or environment-dependent requirements cannot be verified. Use inspectable local inputs.');
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) {
      if (!value.startsWith('file:')) throw new Error('Remote requirements cannot be verified. Use inspectable local inputs.');
      value = fileURLToPath(value);
    }
    return realpathSync(resolve(parent, value));
  };
  const visit = (value: string, parent: string, constraint: boolean) => {
    const path = local(value, parent), key = JSON.stringify([path, constraint]);
    if (active.has(key)) throw new Error('Cyclic requirements include. Review local requirements before retrying.');
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error('Requirements inspection needs regular local files.');
    if (files.length >= 64 || stat.size > 1048576) throw new Error('Local requirements inspection limit exceeded.');
    const content = readFileSync(path, 'utf8');
    bytes += Buffer.byteLength(content);
    if (bytes > 1048576) throw new Error('Local requirements inspection limit exceeded.');
    files.push({ path, constraint, content }); active.add(key);
    for (let line of content.replace(/\\\r?\n/g, '').split(/\r?\n/)) {
      if (++lines > 10000) throw new Error('Local requirements inspection limit exceeded.');
      line = line.replace(/\s+#.*$/, '').trim();
      if (!line || line.startsWith('#')) continue;
      const include = line.match(/^(?:(-r|-c)\s*|(--requirement|--constraint)(?:\s+|=))(.+)$/);
      if (include) {
        const child = include[3].trim().replace(/^(['"])(.*)\1$/, '$2');
        visit(child, dirname(path), include[1] === '-c' || include[2] === '--constraint');
        continue;
      }
      // Index/format flags affect installation and remain in the fingerprint. Other
      // directives require review; they must not accidentally look like packages.
      if (/^--(?:index-url|extra-index-url|find-links|trusted-host|only-binary|no-binary|prefer-binary|no-index|require-hashes|pre)(?:[=\s]|$)/.test(line)) continue;
      if (line.startsWith('-')) throw new Error(`Unsupported requirement directive: ${line.slice(0, 160)}. Review this input instead of repeating installation.`);
      declarations.push({ text: line.replace(/\s+--hash(?:=|\s+)\S+/g, ''), constraint });
    }
    active.delete(key);
  };
  visit(path, dirname(resolve(path)), false);
  for (const constraint of constraints) visit(constraint, process.cwd(), true);
  return { fingerprint: createHash('sha256').update(JSON.stringify(files)).digest('hex'), declarations };
}
