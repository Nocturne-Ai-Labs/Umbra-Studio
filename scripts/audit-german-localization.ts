import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { hasLegacyUiTranslation, translateLegacyUiText } from '../frontend/src/i18n/legacyUiLocalization';

const COMPONENT_ROOT = path.resolve('frontend/src/components');
const MINIMUM_STATIC_COVERAGE = 95;
const values = new Set<string>();

function isTechnicalLiteral(value: string): boolean {
  return /^(?:https?:|[A-Z]:[\\/]|\/|#|\.|[\w.-]+\.(?:png|jpg|jpeg|webp|gif|json|csv|safetensors|onnx|txt|ini))/.test(value)
    || /^(?:[\w.-]+\/[\w.-]+|[A-Z][\w-]*(?:\s*\|\s*[A-Z][\w-]*)+)$/i.test(value);
}

function addCandidate(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (
    !normalized
    || !/[A-Za-z]/.test(normalized)
    || normalized.length > 140
    || isTechnicalLiteral(normalized)
  ) return;
  values.add(normalized);
}

function scanFile(filePath: string) {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) addCandidate(node.text);
    if (
      ts.isJsxAttribute(node)
      && ['alt', 'aria-label', 'placeholder', 'title'].includes(node.name.getText(source))
      && node.initializer
      && ts.isStringLiteral(node.initializer)
    ) {
      addCandidate(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function walk(directory: string) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith('.tsx')) scanFile(target);
  }
}

walk(COMPONENT_ROOT);

function hasGermanTranslation(value: string): boolean {
  return hasLegacyUiTranslation('de', value) || translateLegacyUiText('de', value) !== value;
}

const untranslated = [...values]
  .filter((value) => !hasGermanTranslation(value))
  .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
const translatedCount = values.size - untranslated.length;
const coverage = values.size > 0 ? Math.round((translatedCount / values.size) * 100) : 100;

console.log(`[i18n:de] ${translatedCount}/${values.size} static UI phrases localized (${coverage}%).`);
if (process.env.I18N_AUDIT_VERBOSE === '1' && untranslated.length > 0) {
  console.log(untranslated.map((value) => `  - ${value}`).join('\n'));
}
if (coverage < MINIMUM_STATIC_COVERAGE) {
  console.error(`[i18n:de] Coverage fell below the ${MINIMUM_STATIC_COVERAGE}% regression floor.`);
  console.error(untranslated.slice(0, 40).map((value) => `  - ${value}`).join('\n'));
  process.exit(1);
}
