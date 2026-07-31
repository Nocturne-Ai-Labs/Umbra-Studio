import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const COMPONENT_ROOT = path.resolve('frontend/src/components');
const CATALOG_FILES = [
  'frontend/src/i18n/japaneseUiCatalog.ts',
  'frontend/src/i18n/chineseUiCatalog.ts',
  'frontend/src/i18n/koreanUiCatalog.ts',
];
const OUTPUT_FILE = path.resolve('frontend/src/i18n/germanUiCatalog.ts');
const CACHE_FILE = path.resolve('.tmp/german-ui-translation-cache.json');
const BATCH_LIMIT = 3800;
const GERMAN_MANUAL_OVERRIDES = [
  ['accept', 'Akzeptieren'],
  ['active', 'Aktiv'],
  ['add', 'Hinzufügen'],
  ['advanced', 'Erweitert'],
  ['after generation', 'Nach der Generierung'],
  ['all', 'Alle'],
  ['apply', 'Anwenden'],
  ['auto', 'Automatisch'],
  ['back', 'Zurück'],
  ['batch', 'Stapel'],
  ['browse', 'Durchsuchen'],
  ['cancel', 'Abbrechen'],
  ['clear', 'Leeren'],
  ['clear all', 'Alles löschen'],
  ['close', 'Schließen'],
  ['copy', 'Kopieren'],
  ['create', 'Erstellen'],
  ['delete', 'Löschen'],
  ['disable', 'Deaktivieren'],
  ['download', 'Herunterladen'],
  ['edit', 'Bearbeiten'],
  ['enable', 'Aktivieren'],
  ['export', 'Exportieren'],
  ['generate', 'Generieren'],
  ['hide', 'Ausblenden'],
  ['import', 'Importieren'],
  ['load', 'Laden'],
  ['loading', 'Wird geladen'],
  ['new', 'Neu'],
  ['open', 'Öffnen'],
  ['refresh', 'Aktualisieren'],
  ['remove', 'Entfernen'],
  ['rename', 'Umbenennen'],
  ['save', 'Speichern'],
  ['search', 'Suchen'],
  ['select', 'Auswählen'],
  ['show', 'Anzeigen'],
  ['start', 'Starten'],
  ['stop', 'Stoppen'],
  ['update', 'Aktualisieren'],
  ['upload', 'Hochladen'],
  ['agent', 'Agent'],
  ['audio', 'Audio'],
  ['caption', 'Bildbeschreibung'],
  ['checkpoint', 'Checkpoint'],
  ['concept', 'Konzept'],
  ['controls', 'Steuerung'],
  ['dataset', 'Datensatz'],
  ['datasets', 'Datensätze'],
  ['detailer', 'Detailer'],
  ['diffusion', 'Diffusion'],
  ['folder', 'Ordner'],
  ['folders', 'Ordner'],
  ['gallery', 'Galerie'],
  ['history', 'Verlauf'],
  ['image', 'Bild'],
  ['images', 'Bilder'],
  ['image inspector', 'Bildinspektor'],
  ['inpaint', 'Inpainting'],
  ['layers', 'Ebenen'],
  ['mask', 'Maske'],
  ['media', 'Medien'],
  ['model', 'Modell'],
  ['models', 'Modelle'],
  ['model manager', 'Modellmanager'],
  ['negative prompt', 'Negativer Prompt'],
  ['output', 'Ausgabe'],
  ['pipeline', 'Pipeline'],
  ['preview', 'Vorschau'],
  ['prompt', 'Prompt'],
  ['queue', 'Warteschlange'],
  ['resolution', 'Auflösung'],
  ['seed', 'Seed'],
  ['settings', 'Einstellungen'],
  ['source', 'Quelle'],
  ['status', 'Status'],
  ['tag', 'Tag'],
  ['tags', 'Tags'],
  ['video', 'Video'],
  ['workflow', 'Workflow'],
  ['workflow resources', 'Workflow-Ressourcen'],
  ['add shot', 'Aufnahme hinzufügen'],
  ['clear queue', 'Warteschlange leeren'],
  ['generate image', 'Bild generieren'],
  ['generate video', 'Video generieren'],
  ['open path', 'Pfad öffnen'],
  ['send to umbra ui', 'An Umbra UI senden'],
  ['ai-toolkit', 'AI-Toolkit'],
  ['comfyui', 'ComfyUI'],
  ['civitai', 'CivitAI'],
  ['data forge', 'Data Forge'],
  ['lora', 'LoRA'],
  ['power prompter', 'Power Prompter'],
  ['umbra remote', 'Umbra Remote'],
  ['umbra studio', 'Umbra Studio'],
  ['umbra ui', 'Umbra UI'],
  ['text encoder', 'Text-Encoder'],
  ['image-to-image', 'Bild-zu-Bild'],
  ['text-to-image', 'Text-zu-Bild'],
  ['global settings', 'Globale Einstellungen'],
  ['send to video generation', 'An Videogenerierung senden'],
  ['send to inpaint', 'An Inpainting senden'],
  ['first-time setup', 'Ersteinrichtung'],
  ['prompt history', 'Prompt-Verlauf'],
  ['clear prompt history', 'Prompt-Verlauf löschen'],
  ['clear prompt history for this canvas project', 'Prompt-Verlauf für dieses Canvas-Projekt löschen'],
  ['show prompt history', 'Prompt-Verlauf anzeigen'],
  ['show prompt history for this canvas project', 'Prompt-Verlauf für dieses Canvas-Projekt anzeigen'],
  ['clear prompt search', 'Prompt-Suche löschen'],
  ['comfy', 'Comfy'],
  ['comfy output', 'Comfy-Ausgabe'],
  ['external comfy output path (optional)', 'Externer Comfy-Ausgabepfad (optional)'],
  ['refresh comfy output', 'Comfy-Ausgabe aktualisieren'],
  ['scanning Comfy graph for image loader nodes...', 'Comfy-Graph wird nach Bildlade-Nodes durchsucht...'],
  ['show built-in Comfy output root', 'Integrierten Comfy-Ausgabe-Stammordner anzeigen'],
  ['hires cfg', 'Hires-CFG'],
  ['hires fix', 'Hires-Fix'],
  ['hires sampler', 'Hires-Sampler'],
  ['hires scheduler', 'Hires-Scheduler'],
  ['hires steps', 'Hires-Schritte'],
  ['shot', 'Aufnahme'],
  ['shot prompt', 'Aufnahme-Prompt'],
  ['remove shot', 'Aufnahme entfernen'],
  ['move shot earlier', 'Aufnahme früher einordnen'],
  ['move shot later', 'Aufnahme später einordnen'],
  ['shots /', 'Aufnahmen /'],
  ['timed shots', 'Zeitgesteuerte Aufnahmen'],
  ['use an exclusive timed-shot LTX pipeline', 'Exklusive LTX-Pipeline mit zeitgesteuerten Aufnahmen verwenden'],
];

function isTechnicalLiteral(value) {
  return /^(?:https?:|[A-Z]:[\\/]|\/|#|\.|[\w.-]+\.(?:png|jpg|jpeg|webp|gif|json|csv|safetensors|onnx|txt|ini))/.test(value);
}

function addCandidate(values, value) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || !/[A-Za-z]/.test(normalized) || normalized.length > 500 || isTechnicalLiteral(normalized)) return;
  values.add(normalized);
}

function scanComponentFile(values, filePath) {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node) => {
    if (ts.isJsxText(node)) addCandidate(values, node.text);
    if (
      ts.isJsxAttribute(node)
      && ['alt', 'aria-label', 'placeholder', 'title'].includes(node.name.getText(source))
      && node.initializer
      && ts.isStringLiteral(node.initializer)
    ) {
      addCandidate(values, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function scanComponentDirectory(values, directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) scanComponentDirectory(values, target);
    else if (entry.name.endsWith('.tsx')) scanComponentFile(values, target);
  }
}

function readCatalogKeys(values, filePath) {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && /(ENTRIES|OVERRIDES)$/i.test(node.name.text)
      && node.initializer
      && ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const entry of node.initializer.elements) {
        if (
          ts.isArrayLiteralExpression(entry)
          && entry.elements.length === 2
          && ts.isStringLiteralLike(entry.elements[0])
        ) {
          addCandidate(values, entry.elements[0].text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function loadCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

function splitIntoBatches(values) {
  const batches = [];
  let current = [];
  let length = 0;
  for (const value of values) {
    const addedLength = value.length + 48;
    if (current.length > 0 && length + addedLength > BATCH_LIMIT) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(value);
    length += addedLength;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function sourcePriority(value) {
  const brands = /\b(?:AI-Toolkit|ComfyUI|CivitAI|Data Forge|Power Prompter|Umbra(?: Studio| UI| Remote)?|LoRA)\b/.test(value) ? 100 : 0;
  const capitals = (value.match(/[A-Z]/g) || []).length;
  return brands + capitals;
}

function normalizeGermanTranslation(value) {
  return value
    .replace(/\b(?:bequemui|comfui|comfortui|comfy\s*ui)\b/gi, 'ComfyUI')
    .replace(/\b(?:ki[-\s]?toolkit|ai[-\s]?toolkit)\b/gi, 'AI-Toolkit')
    .replace(/\b(?:civitai|civit ai)\b/gi, 'CivitAI')
    .replace(/\b(?:lora)\b/gi, 'LoRA')
    .replace(/\b(?:power[-\s]?prompter)\b/gi, 'Power Prompter')
    .replace(/\b(?:umbra[-\s]?studio)\b/gi, 'Umbra Studio')
    .replace(/\b(?:umbra[-\s]?ui)\b/gi, 'Umbra UI')
    .replace(/\b(?:umbra[-\s]?remote)\b/gi, 'Umbra Remote');
}

async function translateBatch(batch, attempt = 0) {
  const separators = batch.slice(1).map((_, index) => `__UMBRA_I18N_SPLIT_${index}__`);
  const input = batch.map((value, index) => index === 0 ? value : `${separators[index - 1]}\n${value}`).join('\n');
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=de&dt=t&q=${encodeURIComponent(input)}`;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Umbra-Studio-Localization-Generator/1.0' } });
    if (!response.ok) throw new Error(`Google Translate returned ${response.status}`);
    const payload = await response.json();
    const translated = Array.isArray(payload?.[0]) ? payload[0].map((segment) => segment?.[0] || '').join('') : '';
    const values = translated.split(/__UMBRA_I18N_SPLIT_\d+__/);
    if (values.length !== batch.length) throw new Error('Translation batch delimiters were not preserved');
    return values.map((value) => value.trim());
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    return translateBatch(batch, attempt + 1);
  }
}

function renderCatalog(entries) {
  const generatedEntries = entries
    .map(([english, german]) => `  [${JSON.stringify(english)}, ${JSON.stringify(normalizeGermanTranslation(german))}],`)
    .join('\n');
  const manualEntries = GERMAN_MANUAL_OVERRIDES
    .map(([english, german]) => `  [${JSON.stringify(english)}, ${JSON.stringify(german)}],`)
    .join('\n');
  const content = `// Generated from Umbra's maintained UI phrase inventory.\n// Run: node scripts/generate-german-ui-catalog.mjs\n\nconst GENERATED_GERMAN_UI_TEXT: Array<readonly [string, string]> = [\n${generatedEntries}\n];\n\nconst GERMAN_MANUAL_OVERRIDES: Array<readonly [string, string]> = [\n${manualEntries}\n];\n\nexport const GERMAN_UI_TEXT = new Map<string, string>(\n  [...GENERATED_GERMAN_UI_TEXT, ...GERMAN_MANUAL_OVERRIDES]\n    .map(([english, german]) => [english.toLocaleLowerCase('en-US'), german]),\n);\n`;
  fs.writeFileSync(OUTPUT_FILE, content);
}

const values = new Set();
scanComponentDirectory(values, COMPONENT_ROOT);
for (const catalogFile of CATALOG_FILES) readCatalogKeys(values, path.resolve(catalogFile));

const sourceByKey = new Map();
for (const value of values) {
  const key = value.toLocaleLowerCase('en-US');
  const existing = sourceByKey.get(key);
  if (!existing || sourcePriority(value) > sourcePriority(existing)) sourceByKey.set(key, value);
}
const sources = [...sourceByKey.values()].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
const cache = loadCache();
const pending = sources.filter((value) => !cache[value]);
const batches = splitIntoBatches(pending);

console.log(`[i18n:de] ${sources.length - pending.length}/${sources.length} phrases restored from cache.`);
for (let index = 0; index < batches.length; index += 1) {
  const batch = batches[index];
  const translated = await translateBatch(batch);
  for (let valueIndex = 0; valueIndex < batch.length; valueIndex += 1) cache[batch[valueIndex]] = translated[valueIndex];
  saveCache(cache);
  console.log(`[i18n:de] Translated batch ${index + 1}/${batches.length} (${batch.length} phrases).`);
}

renderCatalog(sources.map((source) => [source, cache[source] || source]));
console.log(`[i18n:de] Wrote ${sources.length} German UI phrases to ${path.relative(process.cwd(), OUTPUT_FILE)}.`);
