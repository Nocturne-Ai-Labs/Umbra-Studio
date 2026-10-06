import fs from 'node:fs';
import path from 'node:path';
import { collectUiLocalizationPhrases, isTechnicalUiLiteral } from './ui-localization-phrases';
import { translateLegacyUiText } from '../frontend/src/i18n/legacyUiLocalization';
import {
  RECENT_UI_TEXT,
  type RecentUiLanguage,
} from '../frontend/src/i18n/recentUiCatalog';

const COMPONENT_ROOT = path.resolve('frontend/src/components');
const OUTPUT_FILE = path.resolve('frontend/src/i18n/recentUiCatalog.ts');
const CACHE_FILE = path.resolve('.tmp/ui-localization-translation-cache.json');
const BATCH_LIMIT = 3_200;
const OFFLINE_MODE = Bun.argv.includes('--offline');

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

const MAINTENANCE_UI_OVERRIDES: Record<RecentUiLanguage, Record<string, string>> = {
  "ja": {
    "Umbra Setup": "Umbra Setup",
    "Setup and updates": "セットアップと更新",
    "Cancel Setup launch": "セットアップの起動をキャンセル",
    "Opening Umbra Setup": "Umbra Setup を開いています",
    "Setup launch failed": "セットアップの起動に失敗しました",
    "Open Setup to update Umbra Studio?": "Umbra Studio を更新するためにセットアップを開きますか？",
    "Umbra Setup will open its Updates tab after Umbra Studio and its managed tools close cleanly.": "Umbra Studio と管理ツールが正常に終了した後、Umbra Setup の「更新」タブが開きます。",
    "Umbra Studio and ComfyUI will shut down before Setup opens. Save any work in progress before continuing.": "セットアップを開く前に Umbra Studio と ComfyUI が終了します。続行する前に作業を保存してください。",
    "Open Setup": "セットアップを開く",
    "Open Umbra Setup": "Umbra Setup を開く",
    "Open Umbra Setup > Tools on the host PC": "ホスト PC で Umbra Setup の「ツール」を開く",
    "Umbra Setup could not be launched.": "Umbra Setup を起動できませんでした。",
    "Unable to open Umbra Setup.": "Umbra Setup を開けません。",
    "Allow popups to open Umbra Setup, or run UmbraSetup.bat / umbra-setup.sh from your Umbra folder.": "ポップアップを許可して Umbra Setup を開くか、Umbra フォルダーから UmbraSetup.bat / umbra-setup.sh を実行してください。"
  },
  "zh-CN": {
    "Umbra Setup": "Umbra Setup",
    "Setup and updates": "设置与更新",
    "Cancel Setup launch": "取消启动设置",
    "Opening Umbra Setup": "正在打开 Umbra Setup",
    "Setup launch failed": "设置启动失败",
    "Open Setup to update Umbra Studio?": "打开设置以更新 Umbra Studio？",
    "Umbra Setup will open its Updates tab after Umbra Studio and its managed tools close cleanly.": "Umbra Studio 及其托管工具正常关闭后，Umbra Setup 将打开“更新”选项卡。",
    "Umbra Studio and ComfyUI will shut down before Setup opens. Save any work in progress before continuing.": "打开设置前 Umbra Studio 和 ComfyUI 将关闭。请先保存正在进行的工作。",
    "Open Setup": "打开设置",
    "Open Umbra Setup": "打开 Umbra Setup",
    "Open Umbra Setup > Tools on the host PC": "在主机 PC 上打开 Umbra Setup > 工具",
    "Umbra Setup could not be launched.": "无法启动 Umbra Setup。",
    "Unable to open Umbra Setup.": "无法打开 Umbra Setup。",
    "Allow popups to open Umbra Setup, or run UmbraSetup.bat / umbra-setup.sh from your Umbra folder.": "请允许弹出窗口以打开 Umbra Setup，或从 Umbra 文件夹运行 UmbraSetup.bat / umbra-setup.sh。"
  },
  "ko": {
    "Umbra Setup": "Umbra Setup",
    "Setup and updates": "설정 및 업데이트",
    "Cancel Setup launch": "설정 실행 취소",
    "Opening Umbra Setup": "Umbra Setup 여는 중",
    "Setup launch failed": "설정 실행 실패",
    "Open Setup to update Umbra Studio?": "Umbra Studio 업데이트를 위해 설정을 열까요?",
    "Umbra Setup will open its Updates tab after Umbra Studio and its managed tools close cleanly.": "Umbra Studio와 관리 도구가 정상적으로 종료된 후 Umbra Setup의 업데이트 탭이 열립니다.",
    "Umbra Studio and ComfyUI will shut down before Setup opens. Save any work in progress before continuing.": "설정을 열기 전에 Umbra Studio와 ComfyUI가 종료됩니다. 계속하기 전에 진행 중인 작업을 저장하세요.",
    "Open Setup": "설정 열기",
    "Open Umbra Setup": "Umbra Setup 열기",
    "Open Umbra Setup > Tools on the host PC": "호스트 PC에서 Umbra Setup > 도구 열기",
    "Umbra Setup could not be launched.": "Umbra Setup을 실행할 수 없습니다.",
    "Unable to open Umbra Setup.": "Umbra Setup을 열 수 없습니다.",
    "Allow popups to open Umbra Setup, or run UmbraSetup.bat / umbra-setup.sh from your Umbra folder.": "팝업을 허용하여 Umbra Setup을 열거나 Umbra 폴더에서 UmbraSetup.bat / umbra-setup.sh를 실행하세요."
  },
  "de": {
    "Umbra Setup": "Umbra Setup",
    "Setup and updates": "Einrichtung und Updates",
    "Cancel Setup launch": "Setup-Start abbrechen",
    "Opening Umbra Setup": "Umbra Setup wird geöffnet",
    "Setup launch failed": "Setup-Start fehlgeschlagen",
    "Open Setup to update Umbra Studio?": "Setup öffnen, um Umbra Studio zu aktualisieren?",
    "Umbra Setup will open its Updates tab after Umbra Studio and its managed tools close cleanly.": "Nachdem Umbra Studio und seine verwalteten Werkzeuge ordnungsgemäß geschlossen wurden, öffnet Umbra Setup den Tab „Updates“.",
    "Umbra Studio and ComfyUI will shut down before Setup opens. Save any work in progress before continuing.": "Umbra Studio und ComfyUI werden vor dem Öffnen von Setup geschlossen. Speichern Sie Ihre Arbeit, bevor Sie fortfahren.",
    "Open Setup": "Setup öffnen",
    "Open Umbra Setup": "Umbra Setup öffnen",
    "Open Umbra Setup > Tools on the host PC": "Auf dem Host-PC Umbra Setup > Werkzeuge öffnen",
    "Umbra Setup could not be launched.": "Umbra Setup konnte nicht gestartet werden.",
    "Unable to open Umbra Setup.": "Umbra Setup kann nicht geöffnet werden.",
    "Allow popups to open Umbra Setup, or run UmbraSetup.bat / umbra-setup.sh from your Umbra folder.": "Erlauben Sie Pop-ups für Umbra Setup oder starten Sie UmbraSetup.bat / umbra-setup.sh aus Ihrem Umbra-Ordner."
  }
};

const REVIEWED_FEATURE_UI_ADDITIONS: Record<RecentUiLanguage, Record<string, string>> = {
  "ja": {
    "Review only": "確認のみ",
    "Searching...": "検索中…",
    "2 images at a time": "一度に2枚の画像",
    "4-digit PIN": "4桁の PIN",
    "Add images to edit transparency": "透明度を編集する画像を追加",
    "Add LoRA slot": "LoRA スロットを追加",
    "Add media to begin": "メディアを追加して開始",
    "Add RefMod": "RefMod を追加",
    "Add Server": "サーバーを追加",
    "Add timed guide": "時間指定ガイドを追加",
    "Add to upscale batch": "拡大処理バッチに追加",
    "Add video audio to audio track": "動画の音声を音声トラックに追加",
    "Advanced block mix": "詳細ブロックミックス",
    "Advanced workflow tools": "高度なワークフローツール",
    "After preview": "編集後のプレビュー",
    "AI-Toolkit datasets": "AI-Toolkit データセット",
    "AI-Toolkit is ready to launch": "AI-Toolkit を起動できます",
    "AI-Toolkit URL": "AI-Toolkit URL",
    "Alert tone": "通知音",
    "Alert volume": "通知音量",
    "All blocks": "すべてのブロック",
    "All captions": "すべてのキャプション",
    "All folders": "すべてのフォルダー",
    "All images": "すべての画像",
    "All LoRAs": "すべての LoRA",
    "All model types": "すべてのモデル種別",
    "All video routes": "すべての動画ルート",
    "Allow Sage Compile": "Sage のコンパイルを許可",
    "Amount": "量",
    "Anima Text Encoders": "Anima テキストエンコーダー",
    "API JSON": "API JSON",
    "API key": "API キー",
    "API prompt graph": "API プロンプトグラフ",
    "API prompt graph embedded in the image.": "画像に埋め込まれた API プロンプトグラフ。",
    "Append": "末尾に追加",
    "Apply Crop & Resize": "切り抜きとサイズ変更を適用",
    "Apply standard sampling": "標準サンプリングを適用",
    "Apply to selected": "選択項目に適用",
    "Approve & next": "承認して次へ",
    "Approve and next image": "承認して次の画像へ",
    "Approve uncensored": "検閲なしで承認",
    "Approved": "承認済み",
    "Ascending": "昇順",
    "ASCII Logo Style": "ASCII ロゴのスタイル",
    "Aspect & Resolution": "縦横比と解像度",
    "Assign To Node": "ノードに割り当て",
    "Assigning...": "割り当て中…",
    "Attention strength": "アテンション強度",
    "Attention tuner": "アテンション調整",
    "Audio branch multiplier, 0 to 2": "音声分岐の倍率、0～2",
    "Audio length (frames)": "音声の長さ（フレーム）",
    "Audio Multiplier": "音声の倍率",
    "Audio only": "音声のみ",
    "Audio start (frames)": "音声の開始（フレーム）",
    "Audio trim-in (frames)": "音声のトリム開始（フレーム）",
    "Audio VAE": "音声 VAE",
    "Auto (reference)": "自動（参照）",
    "Auto cutout · CPU": "自動切り抜き · CPU",
    "Automatic detection": "自動検出",
    "Autosave failed": "自動保存に失敗",
    "Autosave ready": "自動保存の準備完了",
    "Autosaving": "自動保存中",
    "Backup on": "バックアップ有効",
    "Bake LoRAs": "LoRA をモデルに統合",
    "Base CFG": "基本 CFG",
    "Base Sampler": "基本サンプラー",
    "Base Video CFG": "基本動画 CFG",
    "Base video required": "元動画が必要",
    "Batch finished": "バッチ処理完了",
    "BBox Dilation": "境界ボックスの拡張",
    "BBox Expansion": "境界ボックスの拡大",
    "BBox Threshold": "境界ボックスのしきい値",
    "Before mask editor": "編集前のマスクエディター",
    "Blend ratio": "合成比率",
    "Block randomizer": "ブロックのランダム化",
    "AI-Toolkit uses a different dataset folder": "AI-Toolkit は別のデータセットフォルダーを使用します",
    "Capture from ComfyUI": "ComfyUI から取得",
    "Choose output folders from the host PC": "ホスト PC で出力フォルダーを選択",
    "Choose Workflow JSON and API JSON exported from the same configured workflow in ComfyUI. Maximum 16 MiB per file.": "ComfyUI で設定した同じワークフローから書き出した Workflow JSON と API JSON を選択してください。各ファイルの上限は16 MiBです。",
    "ComfyUI controls": "ComfyUI の操作",
    "ComfyUI interface is still loading": "ComfyUI の画面を読み込み中です",
    "ComfyUI is missing": "ComfyUI がインストールされていません",
    "ComfyUI is not connected.": "ComfyUI に接続されていません。",
    "ComfyUI is not connected. Open its workspace to use the managed controls.": "ComfyUI に接続されていません。管理機能を使うには ComfyUI ワークスペースを開いてください。",
    "ComfyUI Ready": "ComfyUI の準備完了",
    "ComfyUI server ready": "ComfyUI サーバーの準備完了",
    "ComfyUI VRAM Mode": "ComfyUI VRAM モード",
    "ComfyUI Workflow": "ComfyUI ワークフロー",
    "ComfyUI workspace": "ComfyUI ワークスペース",
    "Configure local server apps from the host PC. Saved apps remain available here.": "ホスト PC でローカルサーバーアプリを設定してください。保存済みのアプリは引き続きここから利用できます。",
    "Copy to ComfyUI": "ComfyUI にコピー",
    "CPU encoding saves VRAM but takes longer. Encoder retention is configured in Settings > ComfyUI.": "CPU エンコードは VRAM を節約しますが、時間がかかります。エンコーダーの保持は「設定 > ComfyUI」で設定できます。",
    "CPU encoding takes longer. Encoder retention is configured in Settings > ComfyUI.": "CPU エンコードは時間がかかります。エンコーダーの保持は「設定 > ComfyUI」で設定できます。",
    "DaSiWa nodes are missing. Install or update managed Custom Nodes, then restart ComfyUI.": "DaSiWa ノードがありません。管理対象のカスタムノードをインストールまたは更新し、ComfyUI を再起動してください。",
    "DaSiWa nodes changed upstream. Check Umbra Director compatibility before updating in ComfyUI Manager. Umbra workflow changes are reviewed separately.": "DaSiWa ノードの配布元が変更されました。ComfyUI Manager で更新する前に Umbra Director との互換性を確認してください。Umbra のワークフロー変更は別途確認します。",
    "Emergency Shutdown And Restart ComfyUI?": "ComfyUI を緊急終了して再起動しますか？",
    "Import native ComfyUI exports": "ComfyUI の標準エクスポートを読み込む",
    "Install AI-Toolkit": "AI-Toolkit をインストール",
    "Install Node.js 20 or newer on the host before installing or launching AI-Toolkit.": "AI-Toolkit をインストールまたは起動する前に、ホストに Node.js 20 以降をインストールしてください。",
    "Install NVIDIA RTX Nodes in the managed ComfyUI runtime": "管理対象の ComfyUI に NVIDIA RTX Nodes をインストール",
    "Install, update, CUDA/PyTorch and SageAttention are in Setup > Tools on the host PC.": "インストール、更新、CUDA/PyTorch、SageAttention は、ホスト PC の「Setup > ツール」にあります。",
    "Install, update, versions, CUDA/PyTorch and SageAttention are in Setup > Tools on the host PC.": "インストール、更新、バージョン、CUDA/PyTorch、SageAttention は、ホスト PC の「Setup > ツール」にあります。",
    "Launch ComfyUI with the background-removal node installed to use character cutout": "キャラクターの切り抜きを使うには、背景除去ノードをインストールした ComfyUI を起動してください",
    "Load official workflow in ComfyUI": "ComfyUI で公式ワークフローを読み込む",
    "Open API workflow in ComfyUI": "ComfyUI で API ワークフローを開く"
  },
  "zh-CN": {
    "Review only": "仅审核",
    "Searching...": "正在搜索…",
    "2 images at a time": "每次 2 张图像",
    "4-digit PIN": "4 位 PIN",
    "Add images to edit transparency": "添加图像以编辑透明度",
    "Add LoRA slot": "添加 LoRA 槽位",
    "Add media to begin": "添加媒体以开始",
    "Add RefMod": "添加 RefMod",
    "Add Server": "添加服务器",
    "Add timed guide": "添加定时引导",
    "Add to upscale batch": "添加到放大批次",
    "Add video audio to audio track": "将视频音频添加到音轨",
    "Advanced block mix": "高级区块混合",
    "Advanced workflow tools": "高级工作流工具",
    "After preview": "处理后预览",
    "AI-Toolkit datasets": "AI-Toolkit 数据集",
    "AI-Toolkit is ready to launch": "AI-Toolkit 已就绪，可以启动",
    "AI-Toolkit URL": "AI-Toolkit URL",
    "Alert tone": "提醒音",
    "Alert volume": "提醒音量",
    "All blocks": "所有区块",
    "All captions": "所有说明文本",
    "All folders": "所有文件夹",
    "All images": "所有图像",
    "All LoRAs": "所有 LoRA",
    "All model types": "所有模型类型",
    "All video routes": "所有视频路径",
    "Allow Sage Compile": "允许 Sage 编译",
    "Amount": "数量",
    "Anima Text Encoders": "Anima 文本编码器",
    "API JSON": "API JSON",
    "API key": "API 密钥",
    "API prompt graph": "API 提示词图",
    "API prompt graph embedded in the image.": "图像中嵌入的 API 提示词图。",
    "Append": "追加",
    "Apply Crop & Resize": "应用裁剪和调整大小",
    "Apply standard sampling": "应用标准采样",
    "Apply to selected": "应用到所选项",
    "Approve & next": "批准并继续",
    "Approve and next image": "批准并转到下一张图像",
    "Approve uncensored": "批准未经遮罩的内容",
    "Approved": "已批准",
    "Ascending": "升序",
    "ASCII Logo Style": "ASCII 标志样式",
    "Aspect & Resolution": "宽高比和分辨率",
    "Assign To Node": "分配到节点",
    "Assigning...": "正在分配…",
    "Attention strength": "注意力强度",
    "Attention tuner": "注意力调节器",
    "Audio branch multiplier, 0 to 2": "音频分支倍率，0 到 2",
    "Audio length (frames)": "音频长度（帧）",
    "Audio Multiplier": "音频倍率",
    "Audio only": "仅音频",
    "Audio start (frames)": "音频起点（帧）",
    "Audio trim-in (frames)": "音频裁剪起点（帧）",
    "Audio VAE": "音频 VAE",
    "Auto (reference)": "自动（参考）",
    "Auto cutout · CPU": "自动抠图 · CPU",
    "Automatic detection": "自动检测",
    "Autosave failed": "自动保存失败",
    "Autosave ready": "自动保存已就绪",
    "Autosaving": "正在自动保存",
    "Backup on": "备份已开启",
    "Bake LoRAs": "将 LoRA 合并到模型",
    "Base CFG": "基础 CFG",
    "Base Sampler": "基础采样器",
    "Base Video CFG": "基础视频 CFG",
    "Base video required": "需要基础视频",
    "Batch finished": "批次已完成",
    "BBox Dilation": "边界框扩张",
    "BBox Expansion": "边界框扩大",
    "BBox Threshold": "边界框阈值",
    "Before mask editor": "处理前蒙版编辑器",
    "Blend ratio": "混合比例",
    "Block randomizer": "区块随机化",
    "AI-Toolkit uses a different dataset folder": "AI-Toolkit 使用不同的数据集文件夹",
    "Capture from ComfyUI": "从 ComfyUI 获取",
    "Choose output folders from the host PC": "从主机 PC 选择输出文件夹",
    "Choose Workflow JSON and API JSON exported from the same configured workflow in ComfyUI. Maximum 16 MiB per file.": "请选择从 ComfyUI 中同一已配置工作流导出的 Workflow JSON 和 API JSON。每个文件最大 16 MiB。",
    "ComfyUI controls": "ComfyUI 控制",
    "ComfyUI interface is still loading": "ComfyUI 界面仍在加载",
    "ComfyUI is missing": "未安装 ComfyUI",
    "ComfyUI is not connected.": "未连接 ComfyUI。",
    "ComfyUI is not connected. Open its workspace to use the managed controls.": "未连接 ComfyUI。请打开其工作区以使用托管控制。",
    "ComfyUI Ready": "ComfyUI 已就绪",
    "ComfyUI server ready": "ComfyUI 服务器已就绪",
    "ComfyUI VRAM Mode": "ComfyUI 显存模式",
    "ComfyUI Workflow": "ComfyUI 工作流",
    "ComfyUI workspace": "ComfyUI 工作区",
    "Configure local server apps from the host PC. Saved apps remain available here.": "请从主机 PC 配置本地服务器应用。已保存的应用仍可在此使用。",
    "Copy to ComfyUI": "复制到 ComfyUI",
    "CPU encoding saves VRAM but takes longer. Encoder retention is configured in Settings > ComfyUI.": "CPU 编码可节省显存，但耗时更长。编码器保留设置位于“设置 > ComfyUI”。",
    "CPU encoding takes longer. Encoder retention is configured in Settings > ComfyUI.": "CPU 编码耗时更长。编码器保留设置位于“设置 > ComfyUI”。",
    "DaSiWa nodes are missing. Install or update managed Custom Nodes, then restart ComfyUI.": "缺少 DaSiWa 节点。请安装或更新托管自定义节点，然后重新启动 ComfyUI。",
    "DaSiWa nodes changed upstream. Check Umbra Director compatibility before updating in ComfyUI Manager. Umbra workflow changes are reviewed separately.": "上游 DaSiWa 节点已更改。在 ComfyUI Manager 中更新前，请检查 Umbra Director 兼容性。Umbra 工作流更改会单独审核。",
    "Emergency Shutdown And Restart ComfyUI?": "紧急关闭并重新启动 ComfyUI？",
    "Import native ComfyUI exports": "导入原生 ComfyUI 导出文件",
    "Install AI-Toolkit": "安装 AI-Toolkit",
    "Install Node.js 20 or newer on the host before installing or launching AI-Toolkit.": "安装或启动 AI-Toolkit 前，请在主机上安装 Node.js 20 或更高版本。",
    "Install NVIDIA RTX Nodes in the managed ComfyUI runtime": "在托管 ComfyUI 环境中安装 NVIDIA RTX Nodes",
    "Install, update, CUDA/PyTorch and SageAttention are in Setup > Tools on the host PC.": "安装、更新、CUDA/PyTorch 和 SageAttention 位于主机 PC 上的“Setup > 工具”。",
    "Install, update, versions, CUDA/PyTorch and SageAttention are in Setup > Tools on the host PC.": "安装、更新、版本、CUDA/PyTorch 和 SageAttention 位于主机 PC 上的“Setup > 工具”。",
    "Launch ComfyUI with the background-removal node installed to use character cutout": "要使用角色抠图，请启动已安装背景移除节点的 ComfyUI",
    "Load official workflow in ComfyUI": "在 ComfyUI 中加载官方工作流",
    "Open API workflow in ComfyUI": "在 ComfyUI 中打开 API 工作流"
  },
  "ko": {
    "Review only": "검토만",
    "Searching...": "검색 중…",
    "2 images at a time": "한 번에 이미지 2개",
    "4-digit PIN": "4자리 PIN",
    "Add images to edit transparency": "투명도를 편집할 이미지 추가",
    "Add LoRA slot": "LoRA 슬롯 추가",
    "Add media to begin": "미디어를 추가하여 시작",
    "Add RefMod": "RefMod 추가",
    "Add Server": "서버 추가",
    "Add timed guide": "시간 지정 가이드 추가",
    "Add to upscale batch": "업스케일 배치에 추가",
    "Add video audio to audio track": "영상의 오디오를 오디오 트랙에 추가",
    "Advanced block mix": "고급 블록 믹스",
    "Advanced workflow tools": "고급 워크플로 도구",
    "After preview": "편집 후 미리보기",
    "AI-Toolkit datasets": "AI-Toolkit 데이터셋",
    "AI-Toolkit is ready to launch": "AI-Toolkit 실행 준비 완료",
    "AI-Toolkit URL": "AI-Toolkit URL",
    "Alert tone": "알림 소리",
    "Alert volume": "알림 음량",
    "All blocks": "모든 블록",
    "All captions": "모든 캡션",
    "All folders": "모든 폴더",
    "All images": "모든 이미지",
    "All LoRAs": "모든 LoRA",
    "All model types": "모든 모델 유형",
    "All video routes": "모든 영상 경로",
    "Allow Sage Compile": "Sage 컴파일 허용",
    "Amount": "양",
    "Anima Text Encoders": "Anima 텍스트 인코더",
    "API JSON": "API JSON",
    "API key": "API 키",
    "API prompt graph": "API 프롬프트 그래프",
    "API prompt graph embedded in the image.": "이미지에 포함된 API 프롬프트 그래프입니다.",
    "Append": "뒤에 추가",
    "Apply Crop & Resize": "자르기 및 크기 조정 적용",
    "Apply standard sampling": "표준 샘플링 적용",
    "Apply to selected": "선택 항목에 적용",
    "Approve & next": "승인 후 다음",
    "Approve and next image": "승인 후 다음 이미지",
    "Approve uncensored": "가리지 않고 승인",
    "Approved": "승인됨",
    "Ascending": "오름차순",
    "ASCII Logo Style": "ASCII 로고 스타일",
    "Aspect & Resolution": "화면 비율 및 해상도",
    "Assign To Node": "노드에 할당",
    "Assigning...": "할당 중…",
    "Attention strength": "어텐션 강도",
    "Attention tuner": "어텐션 조정",
    "Audio branch multiplier, 0 to 2": "오디오 분기 배율, 0~2",
    "Audio length (frames)": "오디오 길이(프레임)",
    "Audio Multiplier": "오디오 배율",
    "Audio only": "오디오만",
    "Audio start (frames)": "오디오 시작(프레임)",
    "Audio trim-in (frames)": "오디오 트림 시작(프레임)",
    "Audio VAE": "오디오 VAE",
    "Auto (reference)": "자동(참조)",
    "Auto cutout · CPU": "자동 배경 제거 · CPU",
    "Automatic detection": "자동 감지",
    "Autosave failed": "자동 저장 실패",
    "Autosave ready": "자동 저장 준비 완료",
    "Autosaving": "자동 저장 중",
    "Backup on": "백업 켜짐",
    "Bake LoRAs": "LoRA를 모델에 병합",
    "Base CFG": "기본 CFG",
    "Base Sampler": "기본 샘플러",
    "Base Video CFG": "기본 영상 CFG",
    "Base video required": "기본 영상 필요",
    "Batch finished": "배치 완료",
    "BBox Dilation": "경계 상자 확장",
    "BBox Expansion": "경계 상자 확대",
    "BBox Threshold": "경계 상자 임곗값",
    "Before mask editor": "편집 전 마스크 편집기",
    "Blend ratio": "혼합 비율",
    "Block randomizer": "블록 무작위화",
    "AI-Toolkit uses a different dataset folder": "AI-Toolkit은 다른 데이터셋 폴더를 사용합니다",
    "Capture from ComfyUI": "ComfyUI에서 가져오기",
    "Choose output folders from the host PC": "호스트 PC에서 출력 폴더 선택",
    "Choose Workflow JSON and API JSON exported from the same configured workflow in ComfyUI. Maximum 16 MiB per file.": "ComfyUI에서 동일하게 설정된 워크플로에서 내보낸 Workflow JSON과 API JSON을 선택하세요. 파일당 최대 16 MiB입니다.",
    "ComfyUI controls": "ComfyUI 제어",
    "ComfyUI interface is still loading": "ComfyUI 인터페이스를 불러오는 중입니다",
    "ComfyUI is missing": "ComfyUI가 설치되어 있지 않습니다",
    "ComfyUI is not connected.": "ComfyUI가 연결되어 있지 않습니다.",
    "ComfyUI is not connected. Open its workspace to use the managed controls.": "ComfyUI가 연결되어 있지 않습니다. 관리 제어를 사용하려면 해당 작업 공간을 여세요.",
    "ComfyUI Ready": "ComfyUI 준비 완료",
    "ComfyUI server ready": "ComfyUI 서버 준비 완료",
    "ComfyUI VRAM Mode": "ComfyUI VRAM 모드",
    "ComfyUI Workflow": "ComfyUI 워크플로",
    "ComfyUI workspace": "ComfyUI 작업 공간",
    "Configure local server apps from the host PC. Saved apps remain available here.": "호스트 PC에서 로컬 서버 앱을 설정하세요. 저장한 앱은 여기에서 계속 사용할 수 있습니다.",
    "Copy to ComfyUI": "ComfyUI로 복사",
    "CPU encoding saves VRAM but takes longer. Encoder retention is configured in Settings > ComfyUI.": "CPU 인코딩은 VRAM을 절약하지만 시간이 더 걸립니다. 인코더 유지 설정은 설정 > ComfyUI에 있습니다.",
    "CPU encoding takes longer. Encoder retention is configured in Settings > ComfyUI.": "CPU 인코딩은 시간이 더 걸립니다. 인코더 유지 설정은 설정 > ComfyUI에 있습니다.",
    "DaSiWa nodes are missing. Install or update managed Custom Nodes, then restart ComfyUI.": "DaSiWa 노드가 없습니다. 관리되는 사용자 정의 노드를 설치하거나 업데이트한 후 ComfyUI를 다시 시작하세요.",
    "DaSiWa nodes changed upstream. Check Umbra Director compatibility before updating in ComfyUI Manager. Umbra workflow changes are reviewed separately.": "상위 DaSiWa 노드가 변경되었습니다. ComfyUI Manager에서 업데이트하기 전에 Umbra Director 호환성을 확인하세요. Umbra 워크플로 변경 사항은 별도로 검토됩니다.",
    "Emergency Shutdown And Restart ComfyUI?": "ComfyUI를 강제로 종료하고 다시 시작할까요?",
    "Import native ComfyUI exports": "기본 ComfyUI 내보내기 가져오기",
    "Install AI-Toolkit": "AI-Toolkit 설치",
    "Install Node.js 20 or newer on the host before installing or launching AI-Toolkit.": "AI-Toolkit을 설치하거나 실행하기 전에 호스트에 Node.js 20 이상을 설치하세요.",
    "Install NVIDIA RTX Nodes in the managed ComfyUI runtime": "관리되는 ComfyUI 환경에 NVIDIA RTX Nodes 설치",
    "Install, update, CUDA/PyTorch and SageAttention are in Setup > Tools on the host PC.": "설치, 업데이트, CUDA/PyTorch 및 SageAttention은 호스트 PC의 Setup > 도구에 있습니다.",
    "Install, update, versions, CUDA/PyTorch and SageAttention are in Setup > Tools on the host PC.": "설치, 업데이트, 버전, CUDA/PyTorch 및 SageAttention은 호스트 PC의 Setup > 도구에 있습니다.",
    "Launch ComfyUI with the background-removal node installed to use character cutout": "캐릭터 배경 제거를 사용하려면 배경 제거 노드가 설치된 ComfyUI를 실행하세요",
    "Load official workflow in ComfyUI": "ComfyUI에서 공식 워크플로 불러오기",
    "Open API workflow in ComfyUI": "ComfyUI에서 API 워크플로 열기"
  },
  "de": {
    "Review only": "Nur prüfen",
    "Searching...": "Suche läuft…",
    "2 images at a time": "2 Bilder gleichzeitig",
    "4-digit PIN": "4-stellige PIN",
    "Add images to edit transparency": "Bilder zur Transparenzbearbeitung hinzufügen",
    "Add LoRA slot": "LoRA-Slot hinzufügen",
    "Add media to begin": "Medien hinzufügen, um zu beginnen",
    "Add RefMod": "RefMod hinzufügen",
    "Add Server": "Server hinzufügen",
    "Add timed guide": "Zeitgesteuerte Anleitung hinzufügen",
    "Add to upscale batch": "Zum Upscaling-Stapel hinzufügen",
    "Add video audio to audio track": "Video-Audio zur Audiospur hinzufügen",
    "Advanced block mix": "Erweiterter Blockmix",
    "Advanced workflow tools": "Erweiterte Workflow-Werkzeuge",
    "After preview": "Vorschau danach",
    "AI-Toolkit datasets": "AI-Toolkit-Datensätze",
    "AI-Toolkit is ready to launch": "AI-Toolkit ist startbereit",
    "AI-Toolkit URL": "AI-Toolkit-URL",
    "Alert tone": "Hinweiston",
    "Alert volume": "Hinweislautstärke",
    "All blocks": "Alle Blöcke",
    "All captions": "Alle Beschriftungen",
    "All folders": "Alle Ordner",
    "All images": "Alle Bilder",
    "All LoRAs": "Alle LoRAs",
    "All model types": "Alle Modelltypen",
    "All video routes": "Alle Videorouten",
    "Allow Sage Compile": "Sage-Kompilierung erlauben",
    "Amount": "Menge",
    "Anima Text Encoders": "Anima-Textencoder",
    "API JSON": "API-JSON",
    "API key": "API-Schlüssel",
    "API prompt graph": "API-Promptgraph",
    "API prompt graph embedded in the image.": "Im Bild eingebetteter API-Promptgraph.",
    "Append": "Anhängen",
    "Apply Crop & Resize": "Zuschneiden und Größenänderung anwenden",
    "Apply standard sampling": "Standard-Sampling anwenden",
    "Apply to selected": "Auf Auswahl anwenden",
    "Approve & next": "Freigeben und weiter",
    "Approve and next image": "Freigeben und nächstes Bild",
    "Approve uncensored": "Unzensiert freigeben",
    "Approved": "Freigegeben",
    "Ascending": "Aufsteigend",
    "ASCII Logo Style": "ASCII-Logostil",
    "Aspect & Resolution": "Seitenverhältnis und Auflösung",
    "Assign To Node": "Knoten zuweisen",
    "Assigning...": "Zuweisung läuft…",
    "Attention strength": "Attention-Stärke",
    "Attention tuner": "Attention-Anpassung",
    "Audio branch multiplier, 0 to 2": "Audiozweig-Multiplikator, 0 bis 2",
    "Audio length (frames)": "Audiolänge (Frames)",
    "Audio Multiplier": "Audio-Multiplikator",
    "Audio only": "Nur Audio",
    "Audio start (frames)": "Audiostart (Frames)",
    "Audio trim-in (frames)": "Audio-Schnittbeginn (Frames)",
    "Audio VAE": "Audio-VAE",
    "Auto (reference)": "Automatisch (Referenz)",
    "Auto cutout · CPU": "Automatisch freistellen · CPU",
    "Automatic detection": "Automatische Erkennung",
    "Autosave failed": "Automatisches Speichern fehlgeschlagen",
    "Autosave ready": "Automatisches Speichern bereit",
    "Autosaving": "Automatisches Speichern läuft",
    "Backup on": "Sicherung aktiviert",
    "Bake LoRAs": "LoRAs ins Modell einbacken",
    "Base CFG": "Basis-CFG",
    "Base Sampler": "Basis-Sampler",
    "Base Video CFG": "Basis-Video-CFG",
    "Base video required": "Basisvideo erforderlich",
    "Batch finished": "Stapel abgeschlossen",
    "BBox Dilation": "Begrenzungsrahmen erweitern",
    "BBox Expansion": "Begrenzungsrahmen vergrößern",
    "BBox Threshold": "Begrenzungsrahmen-Schwellenwert",
    "Before mask editor": "Maskeneditor davor",
    "Blend ratio": "Mischverhältnis",
    "Block randomizer": "Block-Zufallsgenerator",
    "AI-Toolkit uses a different dataset folder": "AI-Toolkit verwendet einen anderen Datensatzordner",
    "Capture from ComfyUI": "Aus ComfyUI übernehmen",
    "Choose output folders from the host PC": "Ausgabeordner auf dem Host-PC auswählen",
    "Choose Workflow JSON and API JSON exported from the same configured workflow in ComfyUI. Maximum 16 MiB per file.": "Wählen Sie Workflow JSON und API JSON aus demselben konfigurierten ComfyUI-Workflow. Maximal 16 MiB pro Datei.",
    "ComfyUI controls": "ComfyUI-Steuerung",
    "ComfyUI interface is still loading": "Die ComfyUI-Oberfläche wird noch geladen",
    "ComfyUI is missing": "ComfyUI fehlt",
    "ComfyUI is not connected.": "ComfyUI ist nicht verbunden.",
    "ComfyUI is not connected. Open its workspace to use the managed controls.": "ComfyUI ist nicht verbunden. Öffnen Sie den zugehörigen Arbeitsbereich, um die verwalteten Steuerelemente zu verwenden.",
    "ComfyUI Ready": "ComfyUI bereit",
    "ComfyUI server ready": "ComfyUI-Server bereit",
    "ComfyUI VRAM Mode": "ComfyUI-VRAM-Modus",
    "ComfyUI Workflow": "ComfyUI-Workflow",
    "ComfyUI workspace": "ComfyUI-Arbeitsbereich",
    "Configure local server apps from the host PC. Saved apps remain available here.": "Konfigurieren Sie lokale Server-Apps auf dem Host-PC. Gespeicherte Apps bleiben hier verfügbar.",
    "Copy to ComfyUI": "Nach ComfyUI kopieren",
    "CPU encoding saves VRAM but takes longer. Encoder retention is configured in Settings > ComfyUI.": "CPU-Kodierung spart VRAM, dauert jedoch länger. Die Encoder-Aufbewahrung wird unter Einstellungen > ComfyUI konfiguriert.",
    "CPU encoding takes longer. Encoder retention is configured in Settings > ComfyUI.": "CPU-Kodierung dauert länger. Die Encoder-Aufbewahrung wird unter Einstellungen > ComfyUI konfiguriert.",
    "DaSiWa nodes are missing. Install or update managed Custom Nodes, then restart ComfyUI.": "DaSiWa-Knoten fehlen. Installieren oder aktualisieren Sie die verwalteten benutzerdefinierten Knoten und starten Sie ComfyUI neu.",
    "DaSiWa nodes changed upstream. Check Umbra Director compatibility before updating in ComfyUI Manager. Umbra workflow changes are reviewed separately.": "Die DaSiWa-Knoten wurden upstream geändert. Prüfen Sie vor einem Update im ComfyUI Manager die Kompatibilität mit Umbra Director. Änderungen an Umbra-Workflows werden separat geprüft.",
    "Emergency Shutdown And Restart ComfyUI?": "ComfyUI notfallmäßig beenden und neu starten?",
    "Import native ComfyUI exports": "Native ComfyUI-Exporte importieren",
    "Install AI-Toolkit": "AI-Toolkit installieren",
    "Install Node.js 20 or newer on the host before installing or launching AI-Toolkit.": "Installieren Sie auf dem Host Node.js 20 oder neuer, bevor Sie AI-Toolkit installieren oder starten.",
    "Install NVIDIA RTX Nodes in the managed ComfyUI runtime": "NVIDIA RTX Nodes in der verwalteten ComfyUI-Laufzeit installieren",
    "Install, update, CUDA/PyTorch and SageAttention are in Setup > Tools on the host PC.": "Installation, Updates, CUDA/PyTorch und SageAttention finden Sie auf dem Host-PC unter Setup > Werkzeuge.",
    "Install, update, versions, CUDA/PyTorch and SageAttention are in Setup > Tools on the host PC.": "Installation, Updates, Versionen, CUDA/PyTorch und SageAttention finden Sie auf dem Host-PC unter Setup > Werkzeuge.",
    "Launch ComfyUI with the background-removal node installed to use character cutout": "Starten Sie ComfyUI mit installiertem Hintergrundentfernungs-Knoten, um Figuren freizustellen",
    "Load official workflow in ComfyUI": "Offiziellen Workflow in ComfyUI laden",
    "Open API workflow in ComfyUI": "API-Workflow in ComfyUI öffnen"
  }
};

type TranslationCache = Partial<Record<RecentUiLanguage, Record<string, string>>>;

function isStandaloneTechnicalName(value: string): boolean {
  return /^(?:AI-Toolkit|Anima(?:\s+\d+(?:\.\d+)?B?)?|CivitAI|CLIP|ComfyUI|Danbooru|Data Forge|Flux(?:\s+\d+(?:\.\d+)?)?|LTX(?:\s+\d+(?:\.\d+)?)?|LoRA|MiniMax(?:\s+H\d+)?|NoobAI|Power Prompter|SDXL|Umbra(?:\s+(?:Remote|Studio|Setup|UI))?|VAE|VID2VID|IMG2VID|IMG2IMG|TXT2IMG)$/i.test(value.trim());
}

function addCandidate(values: Set<string>, value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (
    !normalized
    || !/[A-Za-z]/.test(normalized)
    || normalized.length > 2_000
    || isTechnicalUiLiteral(normalized)
  ) return;
  values.add(normalized);
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

// Translation requests contain checked-in display literals only. Keep product names,
// placeholders and paths byte-for-byte stable while translating their surrounding text.
const PRESERVED_UI_TOKENS = /(?:\$?\{[A-Za-z_][\w.]*\}|(?:Tools|User|Runtime)\/[A-Za-z0-9_./-]+|[A-Za-z][\w-]*\.(?:bat|sh|exe|py|json)|\b(?:Umbra Setup|Umbra Studio|Umbra UI|Umbra Remote|Power Prompter|Data Forge|AI[- ]Toolkit|ComfyUI|SageAttention|PyTorch|FFmpeg|ffprobe|CUDA|StringZilla|CivitAI|Danbooru|Anima(?:\s+\d+(?:\.\d+)?[Bb]?)?|SDXL|LoRA|GPU|CPU|VAE|CLIP|LTX(?:\s+\d+(?:\.\d+)?)?|FLUX(?:\s+\d+(?:\.\d+)?)?)\b)/gi;

function preserveUiTokens(values: string[]) {
  const tokens: string[] = [];
  const protectedValues = values.map(value => value.replace(PRESERVED_UI_TOKENS, token => {
    const index = tokens.push(token) - 1;
    return `__UMBRA_UI_TOKEN_${index}__`;
  }));
  return { protectedValues, restore(value: string) {
    const restored = value.replace(/__UMBRA_UI_TOKEN_(\d+)__/g, (_, index) => tokens[Number(index)] || '');
    if (/__UMBRA_UI_TOKEN_/.test(restored)) throw new Error('A protected UI token was not restored.');
    return restored;
  }, tokens };
}

async function translateBatch(batch: string[], target: string, attempt = 0): Promise<string[]> {
  const separators = batch.slice(1).map((_, index) => `__UMBRA_I18N_SPLIT_${index}__`);
  const { protectedValues, restore, tokens } = preserveUiTokens(batch);
  const input = protectedValues
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
    for (let index = 0; index < tokens.length; index += 1) {
      if (!translated.includes(`__UMBRA_UI_TOKEN_${index}__`)) throw new Error('Translation changed a protected UI token.');
    }
    return translatedValues.map((value: string) => normalizeBrandNames(restore(value.trim())));
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

const phrases = collectUiLocalizationPhrases(COMPONENT_ROOT);
for (const phrase of [
  'Umbra Setup could not be launched.',
  'Unable to open Umbra Setup.',
  'Allow popups to open Umbra Setup, or run UmbraSetup.bat / umbra-setup.sh from your Umbra folder.',
]) addCandidate(phrases, phrase);
const sources = [...phrases].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
const missingByLanguage = Object.fromEntries((Object.keys(LANGUAGE_CONFIG) as RecentUiLanguage[]).map(language => [language, sources.filter(source => translateLegacyUiText(language, source) === source && !isStandaloneTechnicalName(source) && !RECENT_UI_TEXT[language].has(source.toLocaleLowerCase('en-US')))])) as Record<RecentUiLanguage, string[]>;
const exportIndex = Bun.argv.indexOf('--export-missing');
if (exportIndex >= 0 && Bun.argv[exportIndex + 1]) {
  const payloadPath = path.resolve(Bun.argv[exportIndex + 1]);
  fs.mkdirSync(path.dirname(payloadPath), { recursive: true });
  fs.writeFileSync(payloadPath, JSON.stringify({ source: 'Checked-in UI labels and instructions only; no runtime user data', phrasesByLanguage: missingByLanguage }, null, 2) + '\n');
}
if (Bun.argv.includes('--inspect-only')) {
  console.log(JSON.stringify({ sourceUiPhrases: sources.length, missing: Object.fromEntries(Object.entries(missingByLanguage).map(([language, phrases]) => [language, phrases.length])) }));
  process.exit(0);
}
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
  const batches = OFFLINE_MODE ? [] : splitIntoBatches(uncached);
  if (OFFLINE_MODE) console.log(`[i18n:${language}] Offline: ${uncached.length} untranslated source UI phrases retained; no external requests.`);
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
    if (!languageCache[source]) continue;
    entriesByLanguage[language].set(
      source.toLocaleLowerCase('en-US'),
      languageCache[source] || source,
    );
  }
  for (const [source, localized] of Object.entries({ ...MANUAL_OVERRIDES[language], ...MAINTENANCE_UI_OVERRIDES[language], ...REVIEWED_FEATURE_UI_ADDITIONS[language] })) {
    entriesByLanguage[language].set(source.toLocaleLowerCase('en-US'), localized);
  }
}

renderCatalog(entriesByLanguage);
console.log(`[i18n] Wrote refreshed feature translations to ${path.relative(process.cwd(), OUTPUT_FILE)}.`);
