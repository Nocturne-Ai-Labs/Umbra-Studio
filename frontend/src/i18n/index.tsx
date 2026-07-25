'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { useStore } from '@/store/useStore';
import {
  APP_LANGUAGES,
  type AppLanguage,
} from '@/lib/appSettings';

const ENGLISH_TRANSLATIONS = {
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.retry': 'Retry',
  'common.save': 'Save',
  'common.settings': 'Settings',
  'common.loading': 'Loading',
  'language.english': 'English',
  'language.japanese': 'Japanese',
  'language.current': 'Language',
  'language.description': 'Choose the language used throughout Umbra Studio.',
  'nav.umbraUi': 'Umbra UI',
  'nav.powerPrompter': 'Power Prompter',
  'nav.comfyUi': 'ComfyUI',
  'nav.gallery': 'Gallery',
  'nav.modelManager': 'Model Manager',
  'nav.imageInspector': 'Image Inspector',
  'nav.dataForge': 'Data Forge',
  'nav.localServers': 'Local Servers',
  'nav.umbraRemote': 'Umbra Remote',
  'nav.neuralHub': 'Neural Hub',
  'nav.neuralHubTools': 'Neural Hub Tools',
  'nav.desktop': 'Desktop',
  'nav.tablet': 'Tablet',
  'nav.mobile': 'Mobile',
  'nav.generate': 'Generate',
  'nav.prompter': 'Prompter',
  'nav.more': 'More',
  'settings.title': 'Umbra Studio Settings',
  'settings.general': 'General',
  'settings.storage': 'Storage',
  'settings.theme': 'Theme Studio',
  'settings.comfyUi': 'ComfyUI',
  'settings.system': 'System Monitor',
  'settings.advanced': 'Advanced',
  'settings.generalTitle': 'General Settings',
  'settings.preferences': 'Preferences',
  'settings.showToasts': 'Show toast notifications',
  'settings.reset': 'Reset to Defaults',
  'settings.save': 'Save Settings',
  'onboarding.brand': 'UMBRA STUDIO',
  'onboarding.eyebrow': 'FIRST-TIME SETUP',
  'onboarding.welcomeTitle': 'Make Umbra yours.',
  'onboarding.welcomeBody': 'Choose the interface language, then begin fresh or move your work and installed tools forward from a previous portable build.',
  'onboarding.chooseLanguage': 'Choose your language',
  'onboarding.languageHint': 'You can change this later in Global Settings.',
  'onboarding.setupTitle': 'How would you like to begin?',
  'onboarding.freshTitle': 'Start fresh',
  'onboarding.freshBody': 'Use this build with its clean User and Tools folders.',
  'onboarding.migrateTitle': 'Migrate a previous build',
  'onboarding.migrateBody': 'Move your User data and installed Tools into this build, then restart Umbra automatically.',
  'onboarding.migrationSafety': 'Migration moves User and Tools out of the previous build to avoid duplicating large models. The previous build will no longer be complete. Umbra-Nodes stays behind and the latest version is downloaded fresh.',
  'onboarding.choosePrevious': 'Choose previous build',
  'onboarding.previousBuild': 'Previous Umbra Studio build',
  'onboarding.version': 'Version {version}',
  'onboarding.userDataFound': 'User data found',
  'onboarding.toolsFound': 'Tools found',
  'onboarding.comfyFound': 'ComfyUI found',
  'onboarding.aiToolkitFound': 'AI-Toolkit found',
  'onboarding.startFresh': 'Start Umbra',
  'onboarding.startMigration': 'Migrate and restart',
  'onboarding.migratingTitle': 'Migrating your studio',
  'onboarding.migratingBody': 'The external migration service is moving your data while Umbra is offline. This page will reload automatically when the new build is ready.',
  'onboarding.copyingUser': 'Moving User data',
  'onboarding.copyingTools': 'User data moved. Moving Tools',
  'onboarding.finalizingMigration': 'Finalizing paths and managed nodes',
  'onboarding.migrationOfflineStage': 'Umbra is offline while the migration worker moves your data',
  'onboarding.largeCopyNotice': 'Same-drive files move without duplicating their contents. Cross-drive migration may take longer. Keep this page open; Umbra will reconnect after the move completes.',
  'onboarding.reconnectNow': 'Check connection now',
  'onboarding.failedTitle': 'Migration needs attention',
  'onboarding.failedBody': 'Your previous build is untouched. Review the message below, then choose the folder and try again.',
  'onboarding.hostOnlyTitle': 'Finish setup on the host PC',
  'onboarding.hostOnlyBody': 'Language selection and migration use local folders, so first-time setup must be completed from the computer running Umbra.',
  'onboarding.connectionTitle': 'Waiting for Umbra',
  'onboarding.connectionBody': 'The server is not responding yet. Retry after Umbra finishes starting.',
  'onboarding.invalidSource': 'Choose a valid previous Umbra Studio folder.',
  'onboarding.restartNotice': 'Umbra will close, migrate outside the app, and restart automatically.',
  'boot.checkingServices': 'CHECKING SERVICES',
  'boot.warmingFilesystem': 'WARMING FILESYSTEM',
  'boot.waitingStartup': 'WAITING FOR STARTUP SERVICES',
  'boot.loadingInterfaces': 'LOADING INTERFACES',
} as const;

type TranslationKey = keyof typeof ENGLISH_TRANSLATIONS;
type TranslationDictionary = Record<TranslationKey, string>;

const JAPANESE_TRANSLATIONS: TranslationDictionary = {
  'common.back': '戻る',
  'common.cancel': 'キャンセル',
  'common.continue': '続ける',
  'common.retry': '再試行',
  'common.save': '保存',
  'common.settings': '設定',
  'common.loading': '読み込み中',
  'language.english': '英語',
  'language.japanese': '日本語',
  'language.current': '言語',
  'language.description': 'Umbra Studio 全体で使用する言語を選択します。',
  'nav.umbraUi': 'Umbra UI',
  'nav.powerPrompter': 'Power Prompter',
  'nav.comfyUi': 'ComfyUI',
  'nav.gallery': 'ギャラリー',
  'nav.modelManager': 'モデル管理',
  'nav.imageInspector': '画像インスペクター',
  'nav.dataForge': 'Data Forge',
  'nav.localServers': 'ローカルサーバー',
  'nav.umbraRemote': 'Umbra Remote',
  'nav.neuralHub': 'Neural Hub',
  'nav.neuralHubTools': 'Neural Hub ツール',
  'nav.desktop': 'デスクトップ',
  'nav.tablet': 'タブレット',
  'nav.mobile': 'モバイル',
  'nav.generate': '生成',
  'nav.prompter': 'プロンプター',
  'nav.more': 'その他',
  'settings.title': 'Umbra Studio 設定',
  'settings.general': '一般',
  'settings.storage': 'ストレージ',
  'settings.theme': 'テーマスタジオ',
  'settings.comfyUi': 'ComfyUI',
  'settings.system': 'システムモニター',
  'settings.advanced': '詳細設定',
  'settings.generalTitle': '一般設定',
  'settings.preferences': '環境設定',
  'settings.showToasts': 'トースト通知を表示',
  'settings.reset': '既定値に戻す',
  'settings.save': '設定を保存',
  'onboarding.brand': 'UMBRA STUDIO',
  'onboarding.eyebrow': '初回セットアップ',
  'onboarding.welcomeTitle': 'Umbra をあなた仕様に。',
  'onboarding.welcomeBody': '表示言語を選び、新しく始めるか、以前のポータブル版から作業データとインストール済みツールを移動します。',
  'onboarding.chooseLanguage': '言語を選択',
  'onboarding.languageHint': '言語は後からグローバル設定で変更できます。',
  'onboarding.setupTitle': 'どのように始めますか？',
  'onboarding.freshTitle': '新しく始める',
  'onboarding.freshBody': 'このビルドの新しい User と Tools フォルダーを使用します。',
  'onboarding.migrateTitle': '以前のビルドから移行',
  'onboarding.migrateBody': 'User データとインストール済み Tools をこのビルドへ移動し、Umbra を自動的に再起動します。',
  'onboarding.migrationSafety': '大容量モデルの重複を避けるため、User と Tools は以前のビルドから移動されます。以前のビルドは完全な状態ではなくなります。Umbra-Nodes は移動せず、最新版を新たに取得します。',
  'onboarding.choosePrevious': '以前のビルドを選択',
  'onboarding.previousBuild': '以前の Umbra Studio ビルド',
  'onboarding.version': 'バージョン {version}',
  'onboarding.userDataFound': 'User データを検出',
  'onboarding.toolsFound': 'Tools を検出',
  'onboarding.comfyFound': 'ComfyUI を検出',
  'onboarding.aiToolkitFound': 'AI-Toolkit を検出',
  'onboarding.startFresh': 'Umbra を開始',
  'onboarding.startMigration': '移行して再起動',
  'onboarding.migratingTitle': 'スタジオを移行中',
  'onboarding.migratingBody': 'Umbra の停止中に外部移行サービスがデータを移動しています。新しいビルドの準備ができると、このページは自動的に再読み込みされます。',
  'onboarding.copyingUser': 'User データを移動中',
  'onboarding.copyingTools': 'User データの移動完了。Tools を移動中',
  'onboarding.finalizingMigration': 'パスと管理ノードを最終処理中',
  'onboarding.migrationOfflineStage': '移行ワーカーがデータを移動している間、Umbra はオフラインになります',
  'onboarding.largeCopyNotice': '同じドライブ内のファイルは内容を複製せずに移動します。別ドライブへの移行には時間がかかる場合があります。このページを開いたままお待ちください。移動完了後、Umbra は再接続します。',
  'onboarding.reconnectNow': '今すぐ接続を確認',
  'onboarding.failedTitle': '移行を完了できませんでした',
  'onboarding.failedBody': '以前のビルドは変更されていません。下のメッセージを確認し、フォルダーを選び直して再試行してください。',
  'onboarding.hostOnlyTitle': 'ホスト PC でセットアップを完了してください',
  'onboarding.hostOnlyBody': '言語選択と移行ではローカルフォルダーを使用するため、Umbra を実行している PC で初回セットアップを完了する必要があります。',
  'onboarding.connectionTitle': 'Umbra を待機中',
  'onboarding.connectionBody': 'サーバーがまだ応答していません。Umbra の起動完了後に再試行してください。',
  'onboarding.invalidSource': '有効な以前の Umbra Studio フォルダーを選択してください。',
  'onboarding.restartNotice': 'Umbra を終了し、アプリ外で移行してから自動的に再起動します。',
  'boot.checkingServices': 'サービスを確認中',
  'boot.warmingFilesystem': 'ファイルシステムを準備中',
  'boot.waitingStartup': '起動サービスを待機中',
  'boot.loadingInterfaces': 'インターフェースを読み込み中',
};

const DICTIONARIES: Record<AppLanguage, TranslationDictionary> = {
  en: ENGLISH_TRANSLATIONS,
  ja: JAPANESE_TRANSLATIONS,
};

function normalizeLanguage(value: unknown): AppLanguage {
  const normalized = String(value || '').trim().toLowerCase();
  return (APP_LANGUAGES as readonly string[]).includes(normalized)
    ? normalized as AppLanguage
    : 'en';
}

export function translate(
  languageValue: unknown,
  key: TranslationKey,
  variables: Record<string, string | number> = {},
): string {
  const language = normalizeLanguage(languageValue);
  const template = DICTIONARIES[language][key] || ENGLISH_TRANSLATIONS[key] || key;
  return Object.entries(variables).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

interface I18nContextValue {
  language: AppLanguage;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: (key, variables) => translate('en', key, variables),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const language = useStore((state) => normalizeLanguage(state.appSettings['ui.language']));
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const t = useCallback(
    (key: TranslationKey, variables?: Record<string, string | number>) => translate(language, key, variables),
    [language],
  );
  const value = useMemo(() => ({ language, t }), [language, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export type { TranslationKey };
