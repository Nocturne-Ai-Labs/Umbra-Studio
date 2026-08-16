import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { translateLegacyUiText } from '../frontend/src/i18n/legacyUiLocalization';
import {
  RECENT_UI_TEXT,
  type RecentUiLanguage,
} from '../frontend/src/i18n/recentUiCatalog';

const COMPONENT_ROOT = path.resolve('frontend/src/components');
const OUTPUT_FILE = path.resolve('frontend/src/i18n/recentUiCatalog.ts');
const CACHE_FILE = path.resolve('.tmp/ui-localization-translation-cache.json');
const BATCH_LIMIT = 3_200;

const LANGUAGE_CONFIG: Record<RecentUiLanguage, { target: string; arrayName: string }> = {
  ja: { target: 'ja', arrayName: 'JAPANESE_RECENT_UI_TEXT' },
  'zh-CN': { target: 'zh-CN', arrayName: 'CHINESE_RECENT_UI_TEXT' },
  ko: { target: 'ko', arrayName: 'KOREAN_RECENT_UI_TEXT' },
  de: { target: 'de', arrayName: 'GERMAN_RECENT_UI_TEXT' },
};

const MANUAL_OVERRIDES: Record<RecentUiLanguage, Record<string, string>> = {
  ja: {
    'AI-Toolkit': 'AI-Toolkit',
    'Add a region for this image': 'この画像に領域を追加',
    'Audio Shift': 'オーディオシフト',
    'Auto Prompter': '自動プロンプター',
    'Browse and edit existing wildcards': '既存のワイルドカードを参照・編集',
    'CivitAI': 'CivitAI',
    'ComfyUI': 'ComfyUI',
    'Censor Overlay': '検閲オーバーレイ',
    'Danbooru': 'Danbooru',
    'Data Forge': 'Data Forge',
    'Expanded': '展開表示',
    'Feed Strip': '出力ストリップ',
    'Generate LTX 2.5 Video': 'LTX 2.5動画を生成',
    'Image Censor': '画像検閲',
    'Instant': '即時',
    'Job submitted and prompt completed': 'ジョブ送信時とプロンプト完了時',
    'Off': 'オフ',
    'On': 'オン',
    'Power Prompter': 'Power Prompter',
    'Queue Alerts': 'キュー通知',
    'Queue alert volume': 'キュー通知の音量',
    'Select option': 'オプションを選択',
    'Tag Catalog': 'タグカタログ',
    'Video Shift': 'ビデオシフト',
    'Umbra Remote': 'Umbra Remote',
    'Umbra Studio': 'Umbra Studio',
    'Umbra UI': 'Umbra UI',
    'Waiting for queue activity': 'キューの動作を待機中',
    'Waiting for queue preview': 'キュープレビューを待機中',
    'Wheel Scrub': 'ホイールスクロール',
    'Wildcard Generator': 'ワイルドカードジェネレーター',
  },
  'zh-CN': {
    'AI-Toolkit': 'AI-Toolkit',
    'Add a region for this image': '为此图像添加区域',
    'Audio Shift': '音频偏移',
    'Auto Prompter': '自动提示词生成器',
    'Browse and edit existing wildcards': '浏览和编辑现有通配符',
    'CivitAI': 'CivitAI',
    'ComfyUI': 'ComfyUI',
    'Censor Overlay': '审查遮罩',
    'Danbooru': 'Danbooru',
    'Data Forge': 'Data Forge',
    'Expanded': '展开',
    'Feed Strip': '输出条',
    'Generate LTX 2.5 Video': '生成 LTX 2.5 视频',
    'Image Censor': '图像审查',
    'Instant': '立即',
    'Job submitted and prompt completed': '作业提交和提示词完成',
    'Off': '关闭',
    'On': '开启',
    'Power Prompter': 'Power Prompter',
    'Queue Alerts': '队列通知',
    'Queue alert volume': '队列通知音量',
    'Select option': '选择选项',
    'Tag Catalog': '标签目录',
    'Video Shift': '视频偏移',
    'Umbra Remote': 'Umbra Remote',
    'Umbra Studio': 'Umbra Studio',
    'Umbra UI': 'Umbra UI',
    'Volume': '音量',
    'Waiting for queue activity': '正在等待队列活动',
    'Waiting for queue preview': '正在等待队列预览',
    'Wheel Scrub': '滚轮浏览',
    'Wildcard Generator': '通配符生成器',
  },
  ko: {
    'AI-Toolkit': 'AI-Toolkit',
    'Add a region for this image': '이 이미지에 영역 추가',
    'Audio Shift': '오디오 시프트',
    'Auto Prompter': '자동 프롬프터',
    'Browse and edit existing wildcards': '기존 와일드카드 찾아보기 및 편집',
    'CivitAI': 'CivitAI',
    'ComfyUI': 'ComfyUI',
    'Censor Overlay': '검열 오버레이',
    'Danbooru': 'Danbooru',
    'Data Forge': 'Data Forge',
    'Expanded': '펼침',
    'Feed Strip': '출력 스트립',
    'Generate LTX 2.5 Video': 'LTX 2.5 비디오 생성',
    'Image Censor': '이미지 검열',
    'Instant': '즉시',
    'Job submitted and prompt completed': '작업 제출 및 프롬프트 완료',
    'Off': '꺼짐',
    'On': '켜짐',
    'Power Prompter': 'Power Prompter',
    'Queue Alerts': '대기열 알림',
    'Queue alert volume': '대기열 알림 볼륨',
    'Select option': '옵션 선택',
    'Tag Catalog': '태그 카탈로그',
    'Video Shift': '비디오 시프트',
    'Umbra Remote': 'Umbra Remote',
    'Umbra Studio': 'Umbra Studio',
    'Umbra UI': 'Umbra UI',
    'Waiting for queue activity': '대기열 작업 대기 중',
    'Waiting for queue preview': '대기열 미리보기 대기 중',
    'Wheel Scrub': '휠 탐색',
    'Wildcard Generator': '와일드카드 생성기',
  },
  de: {
    'AI-Toolkit': 'AI-Toolkit',
    'Add a region for this image': 'Bereich für dieses Bild hinzufügen',
    'Audio Shift': 'Audio-Verschiebung',
    'Auto Prompter': 'Automatischer Prompter',
    'Browse and edit existing wildcards': 'Vorhandene Wildcards durchsuchen und bearbeiten',
    'CivitAI': 'CivitAI',
    'ComfyUI': 'ComfyUI',
    'Censor Overlay': 'Zensur-Overlay',
    'Danbooru': 'Danbooru',
    'Data Forge': 'Data Forge',
    'Editor': 'Editor',
    'Expanded': 'Ausgeklappt',
    'Feed Strip': 'Ausgabestreifen',
    'Generate LTX 2.5 Video': 'LTX-2.5-Video generieren',
    'Image Censor': 'Bildzensur',
    'Instant': 'Sofort',
    'Job submitted and prompt completed': 'Auftrag gesendet und Prompt abgeschlossen',
    'Off': 'Aus',
    'On': 'An',
    'Power Prompter': 'Power Prompter',
    'Queue Alerts': 'Warteschlangenhinweise',
    'Queue alert volume': 'Lautstärke der Warteschlangenhinweise',
    'Select option': 'Option auswählen',
    'Tag Catalog': 'Tag-Katalog',
    'Video Shift': 'Video-Verschiebung',
    'Umbra Remote': 'Umbra Remote',
    'Umbra Studio': 'Umbra Studio',
    'Umbra UI': 'Umbra UI',
    'Waiting for queue activity': 'Warten auf Warteschlangenaktivität',
    'Waiting for queue preview': 'Warten auf Warteschlangenvorschau',
    'Wheel Scrub': 'Mausrad-Navigation',
    'Wildcard Generator': 'Wildcard-Generator',
  },
};

type TranslationCache = Partial<Record<RecentUiLanguage, Record<string, string>>>;

function isTechnicalLiteral(value: string): boolean {
  return /^(?:__.+__|https?:|[A-Z]:[\\/]|\/|#|\.|[\w.-]+\.(?:png|jpg|jpeg|webp|gif|json|csv|safetensors|onnx|txt|ini))/.test(value);
}

function isStandaloneTechnicalName(value: string): boolean {
  return /^(?:AI-Toolkit|Anima(?:\s+\d+(?:\.\d+)?B?)?|CivitAI|CLIP|ComfyUI|Danbooru|Data Forge|Flux(?:\s+\d+(?:\.\d+)?)?|LTX(?:\s+\d+(?:\.\d+)?)?|LoRA|MiniMax(?:\s+H\d+)?|NoobAI|Power Prompter|SDXL|Umbra(?:\s+(?:Remote|Studio|UI))?|VAE|VID2VID|IMG2VID|IMG2IMG|TXT2IMG)$/i.test(value.trim());
}

function addCandidate(values: Set<string>, value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (
    !normalized
    || !/[A-Za-z]/.test(normalized)
    || normalized.length > 140
    || isTechnicalLiteral(normalized)
  ) return;
  values.add(normalized);
}

function scanComponentFile(values: Set<string>, filePath: string) {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node) => {
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

function scanComponentDirectory(values: Set<string>, directory: string) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) scanComponentDirectory(values, target);
    else if (entry.name.endsWith('.tsx')) scanComponentFile(values, target);
  }
}

function loadCache(): TranslationCache {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache: TranslationCache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
}

function splitIntoBatches(values: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
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

function normalizeBrandNames(value: string): string {
  return value
    .replace(/\b(?:comfy\s*ui|comfui|comfortui)\b/gi, 'ComfyUI')
    .replace(/\b(?:ai[-\s]?toolkit|ki[-\s]?toolkit)\b/gi, 'AI-Toolkit')
    .replace(/\b(?:civit\s*ai)\b/gi, 'CivitAI')
    .replace(/\bpower[-\s]?prompter\b/gi, 'Power Prompter')
    .replace(/\bumbra[-\s]?studio\b/gi, 'Umbra Studio')
    .replace(/\bumbra[-\s]?ui\b/gi, 'Umbra UI')
    .replace(/\bumbra[-\s]?remote\b/gi, 'Umbra Remote')
    .replace(/\bdanbooru\b/gi, 'Danbooru')
    .replace(/\blora\b/gi, 'LoRA');
}

async function translateBatch(batch: string[], target: string, attempt = 0): Promise<string[]> {
  const separators = batch.slice(1).map((_, index) => `__UMBRA_I18N_SPLIT_${index}__`);
  const input = batch
    .map((value, index) => index === 0 ? value : `${separators[index - 1]}\n${value}`)
    .join('\n');
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(input)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Umbra-Studio-Localization-Generator/2.0' },
    });
    if (!response.ok) throw new Error(`Google Translate returned ${response.status}`);
    const payload = await response.json();
    const translated = Array.isArray(payload?.[0])
      ? payload[0].map((segment: unknown[]) => String(segment?.[0] || '')).join('')
      : '';
    const translatedValues = translated.split(/__UMBRA_I18N_SPLIT_\d+__/);
    if (translatedValues.length !== batch.length) {
      throw new Error(`Translation delimiters were not preserved (${translatedValues.length}/${batch.length})`);
    }
    return translatedValues.map((value: string) => normalizeBrandNames(value.trim()));
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    return translateBatch(batch, target, attempt + 1);
  }
}

function renderCatalog(entriesByLanguage: Record<RecentUiLanguage, Map<string, string>>) {
  const renderedArrays = (Object.keys(LANGUAGE_CONFIG) as RecentUiLanguage[])
    .map((language) => {
      const { arrayName } = LANGUAGE_CONFIG[language];
      const entries = [...entriesByLanguage[language].entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'en', { sensitivity: 'base' }))
        .map(([english, localized]) => `  [${JSON.stringify(english)}, ${JSON.stringify(localized)}],`)
        .join('\n');
      return `const ${arrayName}: Array<readonly [string, string]> = [\n${entries}\n];`;
    })
    .join('\n\n');

  const content = `// Generated additions for feature phrases that are not yet covered by the\n// maintained locale catalogs. Run \`bun run generate:i18n\` to refresh this file.\n\nexport type RecentUiLanguage = 'ja' | 'zh-CN' | 'ko' | 'de';\n\n${renderedArrays}\n\nfunction createCatalog(entries: Array<readonly [string, string]>): ReadonlyMap<string, string> {\n  return new Map(\n    entries.map(([english, localized]) => [english.toLocaleLowerCase('en-US'), localized]),\n  );\n}\n\nexport const RECENT_UI_TEXT: Record<RecentUiLanguage, ReadonlyMap<string, string>> = {\n  ja: createCatalog(JAPANESE_RECENT_UI_TEXT),\n  'zh-CN': createCatalog(CHINESE_RECENT_UI_TEXT),\n  ko: createCatalog(KOREAN_RECENT_UI_TEXT),\n  de: createCatalog(GERMAN_RECENT_UI_TEXT),\n};\n`;
  fs.writeFileSync(OUTPUT_FILE, content);
}

const phrases = new Set<string>();
scanComponentDirectory(phrases, COMPONENT_ROOT);
const sources = [...phrases].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
const cache = loadCache();
const entriesByLanguage = Object.fromEntries(
  (Object.keys(LANGUAGE_CONFIG) as RecentUiLanguage[]).map((language) => [
    language,
    new Map<string, string>(RECENT_UI_TEXT[language]),
  ]),
) as Record<RecentUiLanguage, Map<string, string>>;

for (const language of Object.keys(LANGUAGE_CONFIG) as RecentUiLanguage[]) {
  const languageCache = cache[language] || {};
  cache[language] = languageCache;
  const missing = sources.filter((source) => (
    translateLegacyUiText(language, source) === source
    && !isStandaloneTechnicalName(source)
    && !entriesByLanguage[language].has(source.toLocaleLowerCase('en-US'))
  ));
  const uncached = missing.filter((source) => !languageCache[source]);
  const batches = splitIntoBatches(uncached);
  console.log(`[i18n:${language}] ${missing.length - uncached.length}/${missing.length} missing phrases restored from cache.`);
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const translated = await translateBatch(batch, LANGUAGE_CONFIG[language].target);
    for (let valueIndex = 0; valueIndex < batch.length; valueIndex += 1) {
      languageCache[batch[valueIndex]] = translated[valueIndex] || batch[valueIndex];
    }
    saveCache(cache);
    console.log(`[i18n:${language}] Translated batch ${index + 1}/${batches.length} (${batch.length} phrases).`);
  }
  for (const source of missing) {
    entriesByLanguage[language].set(
      source.toLocaleLowerCase('en-US'),
      languageCache[source] || source,
    );
  }
  for (const [source, localized] of Object.entries(MANUAL_OVERRIDES[language])) {
    entriesByLanguage[language].set(source.toLocaleLowerCase('en-US'), localized);
  }
}

renderCatalog(entriesByLanguage);
console.log(`[i18n] Wrote refreshed feature translations to ${path.relative(process.cwd(), OUTPUT_FILE)}.`);
