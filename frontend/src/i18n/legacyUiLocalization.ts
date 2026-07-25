import type { AppLanguage } from '@/lib/appSettings';
import { CHINESE_UI_TEXT } from './chineseUiCatalog';
import { JAPANESE_UI_TEXT } from './japaneseUiCatalog';
import { KOREAN_UI_TEXT } from './koreanUiCatalog';

const ORIGINAL_TEXT = new WeakMap<Text, string>();
const LAST_RENDERED_TEXT = new WeakMap<Text, string>();
const ORIGINAL_ATTRIBUTES = new WeakMap<Element, Map<string, string>>();
const LAST_RENDERED_ATTRIBUTES = new WeakMap<Element, Map<string, string>>();
const LOCALIZED_ATTRIBUTES = ['aria-label', 'placeholder', 'title', 'alt'] as const;

const JAPANESE_ACTION_AFFIXES = new Map<string, string>([
  ['add', 'を追加'],
  ['apply', 'を適用'],
  ['cancel', 'をキャンセル'],
  ['choose', 'を選択'],
  ['clear', 'をクリア'],
  ['close', 'を閉じる'],
  ['copy', 'をコピー'],
  ['create', 'を作成'],
  ['delete', 'を削除'],
  ['disable', 'を無効化'],
  ['download', 'をダウンロード'],
  ['edit', 'を編集'],
  ['enable', 'を有効化'],
  ['export', 'を書き出し'],
  ['hide', 'を非表示'],
  ['import', 'を読み込み'],
  ['load', 'を読み込み'],
  ['open', 'を開く'],
  ['refresh', 'を更新'],
  ['remove', 'を削除'],
  ['rename', 'の名前を変更'],
  ['save', 'を保存'],
  ['search', 'を検索'],
  ['select', 'を選択'],
  ['show', 'を表示'],
  ['start', 'を開始'],
  ['stop', 'を停止'],
  ['test', 'をテスト'],
  ['update', 'を更新'],
  ['upload', 'をアップロード'],
]);

const CHINESE_ACTION_AFFIXES = new Map<string, string>([
  ['add', '添加'],
  ['apply', '应用'],
  ['cancel', '取消'],
  ['choose', '选择'],
  ['clear', '清除'],
  ['close', '关闭'],
  ['copy', '复制'],
  ['create', '创建'],
  ['delete', '删除'],
  ['disable', '禁用'],
  ['download', '下载'],
  ['edit', '编辑'],
  ['enable', '启用'],
  ['export', '导出'],
  ['hide', '隐藏'],
  ['import', '导入'],
  ['load', '加载'],
  ['open', '打开'],
  ['refresh', '刷新'],
  ['remove', '移除'],
  ['rename', '重命名'],
  ['save', '保存'],
  ['search', '搜索'],
  ['select', '选择'],
  ['show', '显示'],
  ['start', '启动'],
  ['stop', '停止'],
  ['test', '测试'],
  ['update', '更新'],
  ['upload', '上传'],
]);

const KOREAN_ACTION_SUFFIXES = new Map<string, string>([
  ['add', '추가'],
  ['apply', '적용'],
  ['cancel', '취소'],
  ['choose', '선택'],
  ['clear', '지우기'],
  ['close', '닫기'],
  ['copy', '복사'],
  ['create', '만들기'],
  ['delete', '삭제'],
  ['disable', '비활성화'],
  ['download', '다운로드'],
  ['edit', '편집'],
  ['enable', '활성화'],
  ['export', '내보내기'],
  ['hide', '숨기기'],
  ['import', '가져오기'],
  ['load', '불러오기'],
  ['open', '열기'],
  ['refresh', '새로 고침'],
  ['remove', '제거'],
  ['rename', '이름 바꾸기'],
  ['save', '저장'],
  ['search', '검색'],
  ['select', '선택'],
  ['show', '표시'],
  ['start', '시작'],
  ['stop', '중지'],
  ['test', '테스트'],
  ['update', '업데이트'],
  ['upload', '업로드'],
]);

const JAPANESE_NOUN_SUFFIXES = new Map<string, string>([
  ['browser', 'ブラウザー'],
  ['controls', '操作'],
  ['editor', 'エディター'],
  ['folder', 'フォルダー'],
  ['history', '履歴'],
  ['manager', '管理'],
  ['menu', 'メニュー'],
  ['mode', 'モード'],
  ['model', 'モデル'],
  ['name', '名'],
  ['panel', 'パネル'],
  ['path', 'パス'],
  ['pipeline', 'パイプライン'],
  ['preview', 'プレビュー'],
  ['prompt', 'プロンプト'],
  ['queue', 'キュー'],
  ['settings', '設定'],
  ['source', 'ソース'],
  ['status', '状態'],
  ['workspace', 'ワークスペース'],
]);

const CHINESE_NOUN_SUFFIXES = new Map<string, string>([
  ['browser', '浏览器'],
  ['controls', '控制'],
  ['editor', '编辑器'],
  ['folder', '文件夹'],
  ['history', '历史'],
  ['manager', '管理器'],
  ['menu', '菜单'],
  ['mode', '模式'],
  ['model', '模型'],
  ['name', '名称'],
  ['panel', '面板'],
  ['path', '路径'],
  ['pipeline', '流水线'],
  ['preview', '预览'],
  ['prompt', '提示词'],
  ['queue', '队列'],
  ['settings', '设置'],
  ['source', '来源'],
  ['status', '状态'],
  ['workspace', '工作区'],
]);

const KOREAN_NOUN_SUFFIXES = new Map<string, string>([
  ['browser', '브라우저'],
  ['controls', '컨트롤'],
  ['editor', '편집기'],
  ['folder', '폴더'],
  ['history', '기록'],
  ['manager', '관리자'],
  ['menu', '메뉴'],
  ['mode', '모드'],
  ['model', '모델'],
  ['name', '이름'],
  ['panel', '패널'],
  ['path', '경로'],
  ['pipeline', '파이프라인'],
  ['preview', '미리보기'],
  ['prompt', '프롬프트'],
  ['queue', '대기열'],
  ['settings', '설정'],
  ['source', '소스'],
  ['status', '상태'],
  ['workspace', '작업 공간'],
]);

function lookupLocalized(language: AppLanguage, value: string): string | null {
  const key = value.trim().toLocaleLowerCase('en-US');
  if (language === 'ja') return JAPANESE_UI_TEXT.get(key) || null;
  if (language === 'zh-CN') return CHINESE_UI_TEXT.get(key) || null;
  if (language === 'ko') return KOREAN_UI_TEXT.get(key) || null;
  return null;
}

function translateNounPhrase(language: AppLanguage, value: string): string | null {
  const exact = lookupLocalized(language, value);
  if (exact) return exact;

  const normalized = value.trim();
  const suffixMatch = normalized.match(/^(.+?)\s+(Browser|Controls|Editor|Folder|History|Manager|Menu|Mode|Model|Name|Panel|Path|Pipeline|Preview|Prompt|Queue|Settings|Source|Status|Workspace)$/i);
  if (!suffixMatch) return null;
  const rawHead = suffixMatch[1].trim();
  const safeTechnicalHead = /^(?:AI-Toolkit|ComfyUI|CivitAI|Umbra(?:\s+(?:Studio|UI|Remote))?|Power Prompter|Data Forge|IMG2IMG|TXT2IMG|IMG2VID|VID2VID|LoRA|CLIP|VAE|GPU|CPU)$/i.test(rawHead)
    ? rawHead
    : null;
  const head = lookupLocalized(language, rawHead) || safeTechnicalHead;
  const suffixes = language === 'zh-CN'
    ? CHINESE_NOUN_SUFFIXES
    : language === 'ko'
      ? KOREAN_NOUN_SUFFIXES
      : JAPANESE_NOUN_SUFFIXES;
  const suffix = suffixes.get(suffixMatch[2].toLocaleLowerCase('en-US'));
  return head && suffix ? `${head}${language === 'ko' ? ' ' : ''}${suffix}` : null;
}

function translateDynamicUi(language: AppLanguage, value: string): string | null {
  const countMatch = value.match(/^(\d[\d,.]*)\s+(available|completed|done|failed|folders?|groups?|images?|img|items?|media|outputs?|pending|previews?|remaining|running|selected|selectors?|sets?|staged|total)$/i);
  if (countMatch) {
    const noun = /^img$/i.test(countMatch[2])
      ? lookupLocalized(language, 'images')
      : lookupLocalized(language, countMatch[2]);
    return noun ? `${countMatch[1]} ${noun}` : null;
  }

  const loadedCountMatch = value.match(/^(\d[\d,.]*)\/(\d[\d,.]*)\s+loaded$/i);
  if (loadedCountMatch) {
    return language === 'zh-CN'
      ? `已加载 ${loadedCountMatch[1]}/${loadedCountMatch[2]}`
      : language === 'ko'
        ? `${loadedCountMatch[1]}/${loadedCountMatch[2]} 불러옴`
      : `${loadedCountMatch[1]}/${loadedCountMatch[2]} 読み込み済み`;
  }

  const positionMatch = value.match(/^(Running|Queue|Set|Group|Image|Prompt)\s+(\d[\d,.]*)\s+(?:of|\/)\s+(\d[\d,.]*)$/i);
  if (positionMatch) {
    const noun = lookupLocalized(language, positionMatch[1]);
    return noun ? `${noun} ${positionMatch[2]} / ${positionMatch[3]}` : null;
  }

  const numberedLabelMatch = value.match(/^(Position|Detailer|Batch)\s+(\d+)$/i);
  if (numberedLabelMatch) {
    const label = lookupLocalized(language, numberedLabelMatch[1]);
    return label ? `${label} ${numberedLabelMatch[2]}` : null;
  }

  const enabledPromptCountMatch = value.match(/^(\d[\d,.]*)\s+prompts?\s+enabled\s+for\s+set\s+(\d+)$/i);
  if (enabledPromptCountMatch) {
    return language === 'zh-CN'
      ? `集合 ${enabledPromptCountMatch[2]} 已启用 ${enabledPromptCountMatch[1]} 个提示词`
      : language === 'ko'
        ? `세트 ${enabledPromptCountMatch[2]}에서 프롬프트 ${enabledPromptCountMatch[1]}개 사용`
      : `セット ${enabledPromptCountMatch[2]} で ${enabledPromptCountMatch[1]} 件のプロンプトが有効`;
  }

  const mixedCountMatch = value.match(/^(\d[\d,.]*)\s+(media|images?|items?),\s+(\d[\d,.]*)\s+(folders?)$/i);
  if (mixedCountMatch) {
    const firstNoun = lookupLocalized(language, mixedCountMatch[2]);
    const secondNoun = lookupLocalized(language, mixedCountMatch[4]);
    return firstNoun && secondNoun
      ? `${mixedCountMatch[1]} ${firstNoun}${
        language === 'zh-CN' ? '，' : language === 'ko' ? ', ' : '、'
      }${mixedCountMatch[3]} ${secondNoun}`
      : null;
  }

  const resolutionPresetMatch = value.match(/^(.+?)\s+-\s+(\S+)\s+(square|portrait|landscape|cinema|anamorphic)\s+(\d+x\d+)$/i);
  if (resolutionPresetMatch) {
    const orientation = lookupLocalized(language, resolutionPresetMatch[3]);
    return orientation
      ? `${resolutionPresetMatch[1]} - ${resolutionPresetMatch[2]} ${orientation} ${resolutionPresetMatch[4]}`
      : null;
  }

  const actionMatch = value.match(/^(Add|Apply|Cancel|Choose|Clear|Close|Copy|Create|Delete|Disable|Download|Edit|Enable|Export|Hide|Import|Load|Open|Refresh|Remove|Rename|Save|Search|Select|Show|Start|Stop|Test|Update|Upload)\s+(.+)$/i);
  if (actionMatch) {
    const object = translateNounPhrase(language, actionMatch[2]);
    const action = actionMatch[1].toLocaleLowerCase('en-US');
    if (!object) return null;
    if (language === 'zh-CN') {
      const prefix = CHINESE_ACTION_AFFIXES.get(action);
      return prefix ? `${prefix}${object}` : null;
    }
    if (language === 'ko') {
      const suffix = KOREAN_ACTION_SUFFIXES.get(action);
      return suffix ? `${object} ${suffix}` : null;
    }
    const suffix = JAPANESE_ACTION_AFFIXES.get(action);
    return suffix ? `${object}${suffix}` : null;
  }

  const sendMatch = value.match(/^Send(?:\s+selected)?\s+to\s+(.+)$/i);
  if (sendMatch) {
    const destination = translateNounPhrase(language, sendMatch[1]) || lookupLocalized(language, sendMatch[1]);
    if (!destination) return null;
    return language === 'zh-CN'
      ? `发送到${destination}`
      : language === 'ko'
        ? `${destination}로 보내기`
        : `${destination}へ送る`;
  }

  const colonMatch = value.match(/^(.+):$/);
  if (colonMatch) {
    const label = translateNounPhrase(language, colonMatch[1]) || lookupLocalized(language, colonMatch[1]);
    return label ? `${label}：` : null;
  }

  const definedByMatch = value.match(/^Defined by\s+(.+)$/i);
  if (definedByMatch) {
    return language === 'zh-CN'
      ? `由 ${definedByMatch[1]} 定义`
      : language === 'ko'
        ? `${definedByMatch[1]}에서 정의`
      : `${definedByMatch[1]}で定義`;
  }

  const missingPipelineMatch = value.match(/^No locked Umbra UI\s+(.+?)\s+pipeline is installed for\s+(.+)\.$/i);
  if (missingPipelineMatch) {
    const feature = /^(?:txt2img|img2img|img2vid|vid2vid)$/i.test(missingPipelineMatch[1])
      ? missingPipelineMatch[1].toUpperCase()
      : missingPipelineMatch[1];
    return language === 'zh-CN'
      ? `未安装适用于 ${missingPipelineMatch[2]} 的锁定 Umbra UI ${feature} 流水线。`
      : language === 'ko'
        ? `${missingPipelineMatch[2]}용 잠긴 Umbra UI ${feature} 파이프라인이 설치되어 있지 않습니다.`
      : `${missingPipelineMatch[2]}用のロック済みUmbra UI ${feature}パイプラインがインストールされていません。`;
  }

  const catalogErrorMatch = value.match(/^(.+?)\s+catalog returned\s+(\d+)\.$/i);
  if (catalogErrorMatch) {
    return language === 'zh-CN'
      ? `${catalogErrorMatch[1]}目录返回了 ${catalogErrorMatch[2]}。`
      : language === 'ko'
        ? `${catalogErrorMatch[1]} 카탈로그가 ${catalogErrorMatch[2]}을(를) 반환했습니다.`
      : `${catalogErrorMatch[1]}カタログが${catalogErrorMatch[2]}を返しました。`;
  }

  return null;
}

export function translateLegacyUiText(language: AppLanguage, value: string): string {
  if ((language !== 'ja' && language !== 'zh-CN' && language !== 'ko') || !/[A-Za-z]/.test(value)) return value;
  const leading = value.match(/^\s*/)?.[0] || '';
  const trailing = value.match(/\s*$/)?.[0] || '';
  const core = value.slice(leading.length, value.length - trailing.length);
  if (!core) return value;

  const translated = lookupLocalized(language, core) || translateDynamicUi(language, core);
  return translated ? `${leading}${translated}${trailing}` : value;
}

function shouldSkipNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  if (!element) return true;
  return Boolean(element.closest([
    '[data-i18n-skip]',
    '[contenteditable="true"]',
    'canvas',
    'code',
    'kbd',
    'pre',
    'samp',
    'script',
    'style',
    'svg',
    'textarea',
  ].join(',')));
}

function localizeTextNode(node: Text, language: AppLanguage) {
  if (shouldSkipNode(node)) return;
  const current = node.nodeValue || '';
  const previousRendered = LAST_RENDERED_TEXT.get(node);
  if (!ORIGINAL_TEXT.has(node) || (previousRendered !== undefined && current !== previousRendered)) {
    ORIGINAL_TEXT.set(node, current);
  }
  const source = ORIGINAL_TEXT.get(node) || current;
  const next = translateLegacyUiText(language, source);
  LAST_RENDERED_TEXT.set(node, next);
  if (current !== next) node.nodeValue = next;
}

function localizeElementAttributes(element: Element, language: AppLanguage) {
  if (element.closest('[data-i18n-skip],[contenteditable="true"],code,kbd,pre,samp,script,style,svg')) return;
  let originals = ORIGINAL_ATTRIBUTES.get(element);
  let rendered = LAST_RENDERED_ATTRIBUTES.get(element);
  if (!originals) {
    originals = new Map();
    ORIGINAL_ATTRIBUTES.set(element, originals);
  }
  if (!rendered) {
    rendered = new Map();
    LAST_RENDERED_ATTRIBUTES.set(element, rendered);
  }

  for (const attribute of LOCALIZED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (current === null) continue;
    const previousRendered = rendered.get(attribute);
    if (!originals.has(attribute) || (previousRendered !== undefined && current !== previousRendered)) {
      originals.set(attribute, current);
    }
    const source = originals.get(attribute) || current;
    const next = translateLegacyUiText(language, source);
    rendered.set(attribute, next);
    if (current !== next) element.setAttribute(attribute, next);
  }
}

function localizeSubtree(root: Node, language: AppLanguage) {
  if (root.nodeType === Node.TEXT_NODE) {
    localizeTextNode(root as Text, language);
    return;
  }
  if (!(root instanceof Element) && !(root instanceof Document)) return;
  if (root instanceof Element) localizeElementAttributes(root, language);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) localizeTextNode(current as Text, language);
    else localizeElementAttributes(current as Element, language);
    current = walker.nextNode();
  }
}

export function mountLegacyUiLocalization(language: AppLanguage): () => void {
  if (typeof document === 'undefined' || !document.body) return () => undefined;

  localizeSubtree(document.body, language);
  const pending = new Set<Node>();
  let frame = 0;
  const flush = () => {
    frame = 0;
    for (const node of pending) localizeSubtree(node, language);
    pending.clear();
  };
  const schedule = (node: Node) => {
    pending.add(node);
    if (!frame) frame = window.requestAnimationFrame(flush);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') schedule(mutation.target);
      else {
        for (const node of mutation.addedNodes) schedule(node);
        if (mutation.type === 'attributes') schedule(mutation.target);
      }
    }
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: [...LOCALIZED_ATTRIBUTES],
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
    pending.clear();
  };
}
