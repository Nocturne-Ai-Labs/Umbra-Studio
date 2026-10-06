Object.assign(SETUP_TRANSLATIONS.en, {
  modelsTab: 'Models', modelsTitle: 'Model setup', familyModels: 'Model families', supportModels: 'Pipeline support',
  selectedFiles: 'Selected files', hfAccess: 'Hugging Face access (optional)',
  hfHint: 'Session only. Accept any gated model licenses on Hugging Face before downloading.',
  installSelected: 'Install selected', verifySelected: 'Verify selected', clearSelection: 'Clear selection',
  modelHint: 'Most families need a separate checkpoint from Model Manager. Some packs include generation weights; review the file list and licenses.',
  cancelDownload: 'Cancel download', cancelling: 'Cancelling...', cancelled: 'Cancelled',
  chooseFamily: 'Select a family', noFiles: 'No separate files required for this selection.',
  presentFile: 'Present, not yet checksum-verified', missingFile: 'Missing or size mismatch',
  fullSize: 'full size', missingSize: 'missing / size mismatch', filesLabel: 'files',
  installerLog: 'Installer log',
  recommendedModels: 'Recommended',
  includesRequired: 'Includes required prerequisites',
  modelLicenseDisclaimer: 'Model licenses are separate from Umbra Studio’s license. You are responsible for reviewing and complying with each model’s terms, including any commercial-use restrictions. Supporting a model in Umbra does not grant additional rights.',
  'Installing selected models': 'Installing selected models', 'Verifying selected models': 'Verifying selected models',
  'Installation cancelled': 'Installation cancelled',
});
Object.assign(SETUP_TRANSLATIONS.de, {
  modelsTab: 'Modelle', modelsTitle: 'Modelleinrichtung', familyModels: 'Modellfamilien', supportModels: 'Pipeline-Zusatzmodelle',
  selectedFiles: 'Ausgewählte Dateien', hfAccess: 'Hugging-Face-Zugang (optional)',
  hfHint: 'Nur für diese Sitzung. Vor dem Download die Modelllizenzen auf Hugging Face akzeptieren.',
  installSelected: 'Auswahl installieren', verifySelected: 'Auswahl prüfen', clearSelection: 'Auswahl leeren',
  modelHint: 'Die meisten Familien benötigen einen separaten Checkpoint aus dem Model Manager. Einige Pakete enthalten Modellgewichte; Dateiliste und Lizenzen prüfen.',
  cancelDownload: 'Download abbrechen', cancelling: 'Wird abgebrochen...', cancelled: 'Abgebrochen',
  chooseFamily: 'Familie auswählen', noFiles: 'Für diese Auswahl sind keine separaten Dateien erforderlich.',
  presentFile: 'Vorhanden, Prüfsumme noch nicht geprüft', missingFile: 'Fehlend oder abweichende Größe',
  fullSize: 'Gesamtgröße', missingSize: 'fehlend / abweichende Größe', filesLabel: 'Dateien',
  installerLog: 'Installationsprotokoll',
  recommendedModels: 'Empfohlen',
  includesRequired: 'Enthält erforderliche Voraussetzungen',
  modelLicenseDisclaimer: 'Modelllizenzen sind von der Lizenz von Umbra Studio getrennt. Sie sind selbst dafür verantwortlich, die Bedingungen jedes Modells, einschließlich etwaiger Einschränkungen der kommerziellen Nutzung, zu prüfen und einzuhalten. Die Unterstützung eines Modells in Umbra gewährt keine zusätzlichen Rechte.',
  'Installing selected models': 'Ausgewählte Modelle werden installiert', 'Verifying selected models': 'Ausgewählte Modelle werden geprüft',
  'Installation cancelled': 'Installation abgebrochen',
});

// Reviewed UI copy only. Product names, model licenses, paths and installer logs stay verbatim.
const setupCopyRows = `
standaloneService¦Standalone service¦独立サービス¦独立服务¦독립 서비스¦Eigenständiger Dienst
setupGuide¦Set up Umbra Studio¦Umbra Studio を設定¦设置 Umbra Studio¦Umbra Studio 설정¦Umbra Studio einrichten
installAllDependencies¦Install all dependencies and support models¦すべての依存関係と補助モデルをインストール¦安装全部依赖和辅助模型¦모든 의존성과 보조 모델 설치¦Alle Abhängigkeiten und Hilfsmodelle installieren
openTools¦Open Tools¦ツールを開く¦打开工具¦도구 열기¦Tools öffnen
openModels¦Open Models¦モデルを開く¦打开模型¦모델 열기¦Modelle öffnen
pythonHelpers¦Python Helpers¦Python 補助ツール¦Python 辅助工具¦Python 보조 도구¦Python-Hilfsprogramme
pythonHelpersDescription¦Install or repair shared Python dependencies for Waifu tagging and captioning.¦Waifu タグ付けと画像説明の共通 Python 依存関係をインストールまたは修復します。¦安装或修复 Waifu 标签和图像描述所需的共享 Python 依赖。¦Waifu 태그 및 이미지 설명용 공통 Python 의존성을 설치하거나 복구합니다.¦Gemeinsame Python-Abhängigkeiten für Waifu-Tags und Bildbeschreibungen installieren oder reparieren.
installPythonHelpers¦Install / repair Python Helpers¦Python 補助ツールをインストール／修復¦安装／修复 Python 辅助工具¦Python 보조 도구 설치 / 복구¦Python-Hilfsprogramme installieren / reparieren
installingPythonHelpers¦Installing Python Helpers¦Python 補助ツールをインストール中¦正在安装 Python 辅助工具¦Python 보조 도구 설치 중¦Python-Hilfsprogramme werden installiert
optionalModelPacks¦Optional model packs¦任意のモデルパック¦可选模型包¦선택 모델 팩¦Optionale Modellpakete
installFeatureSupport¦Install feature support¦機能の補助ファイルをインストール¦安装功能支持文件¦기능 지원 파일 설치¦Funktionsunterstützung installieren
installFeatureDescription¦Install only what you plan to use. Existing valid files are verified and kept.¦使用するものだけをインストールしてください。既存の有効なファイルは検証して保持します。¦只安装计划使用的内容。现有有效文件会被验证并保留。¦사용할 항목만 설치하세요. 유효한 기존 파일은 확인 후 유지됩니다.¦Nur benötigte Funktionen installieren. Gültige vorhandene Dateien werden geprüft und behalten.
dataForgeModels¦Data Forge models¦Data Forge モデル¦Data Forge 模型¦Data Forge 모델¦Data-Forge-Modelle
dataForgeModelsDescription¦WD taggers and the caption model used by datasets and Image Inspector.¦データセットと Image Inspector 用の WD タグ付けモデルと画像説明モデルです。¦数据集和 Image Inspector 使用的 WD 标签模型及图像描述模型。¦데이터셋과 Image Inspector용 WD 태그 모델 및 이미지 설명 모델입니다.¦WD-Tagger und das Beschreibungsmodell für Datensätze und Image Inspector.
installDataForgeModels¦Install Data Forge models¦Data Forge モデルをインストール¦安装 Data Forge 模型¦Data Forge 모델 설치¦Data-Forge-Modelle installieren
pixaiTaggerDescription¦Optional PixAI Tagger v1.0 for anime metadata and dataset tags. About 1.95 GB plus Python dependencies. Install the main tools first.¦アニメのメタデータとデータセットのタグ用の任意の PixAI Tagger v1.0。約 1.95 GB と Python 依存関係が必要です。最初に主要ツールをインストールしてください。¦可选的 PixAI Tagger v1.0，用于动漫元数据和数据集标签。约 1.95 GB，另需 Python 依赖。请先安装主要工具。¦애니메이션 메타데이터와 데이터셋 태그용 선택 PixAI Tagger v1.0입니다. 약 1.95 GB 및 Python 의존성이 필요합니다. 먼저 기본 도구를 설치하세요.¦Optionaler PixAI Tagger v1.0 für Anime-Metadaten und Datensatz-Tags. Etwa 1,95 GB plus Python-Abhängigkeiten. Zuerst die Haupttools installieren.
installPixaiTagger¦Install PixAI Tagger¦PixAI Tagger をインストール¦安装 PixAI Tagger¦PixAI Tagger 설치¦PixAI Tagger installieren
installingPixaiDependencies¦Installing PixAI Python dependencies¦PixAI の Python 依存関係をインストール中¦正在安装 PixAI Python 依赖¦PixAI Python 의존성 설치 중¦PixAI-Python-Abhängigkeiten werden installiert
installingPixaiTagger¦Installing optional PixAI tagger¦任意の PixAI タグ付けモデルをインストール中¦正在安装可选 PixAI 标签模型¦선택 PixAI 태그 모델 설치 중¦Optionaler PixAI-Tagger wird installiert
umbraUiSupportModels¦Umbra UI support models¦Umbra UI 補助モデル¦Umbra UI 辅助模型¦Umbra UI 보조 모델¦Umbra-UI-Hilfsmodelle
umbraUiSupportDescription¦Person, face and hand detailers, SAM refinement and upscale resources. Install ComfyUI first.¦人物、顔、手のディテーラー、SAM 補正、アップスケール用モデルです。先に ComfyUI をインストールしてください。¦人物、脸部和手部细化、SAM 优化及放大模型。请先安装 ComfyUI。¦사람, 얼굴, 손 디테일러, SAM 보정 및 업스케일 모델입니다. 먼저 ComfyUI를 설치하세요.¦Detailer für Personen, Gesichter und Hände, SAM und Upscaling. Zuerst ComfyUI installieren.
installUmbraUiModels¦Install Umbra UI models¦Umbra UI モデルをインストール¦安装 Umbra UI 模型¦Umbra UI 모델 설치¦Umbra-UI-Modelle installieren
preparingInstaller¦Preparing installer¦インストーラーを準備中¦正在准备安装程序¦설치 프로그램 준비 중¦Installer wird vorbereitet
running¦Running¦実行中¦运行中¦실행 중¦Wird ausgeführt
complete¦Complete¦完了¦完成¦완료¦Abgeschlossen
failed¦Failed¦失敗¦失败¦실패¦Fehlgeschlagen
waitingForInstallerOutput¦Waiting for installer output…¦インストーラーの出力を待っています…¦等待安装程序输出…¦설치 프로그램 출력 대기 중…¦Warten auf Installer-Ausgabe…
noMigration¦This utility does not migrate personal installations.¦このツールは個人のインストールを移行しません。¦此工具不会迁移个人安装。¦이 도구는 개인 설치를 이전하지 않습니다.¦Dieses Programm migriert keine persönlichen Installationen.
launchingUmbra¦Launching Umbra Studio¦Umbra Studio を起動中¦正在启动 Umbra Studio¦Umbra Studio 시작 중¦Umbra Studio wird gestartet
setupClosed¦Setup closed¦セットアップを終了しました¦设置已关闭¦설정 종료됨¦Einrichtung geschlossen
installingModels¦Installing models¦モデルをインストール中¦正在安装模型¦모델 설치 중¦Modelle werden installiert
installationComplete¦Installation complete¦インストール完了¦安装完成¦설치 완료¦Installation abgeschlossen
installationFailed¦Installation failed¦インストール失敗¦安装失败¦설치 실패¦Installation fehlgeschlagen
installingWdTaggers¦Installing WD tagger models¦WD タグ付けモデルをインストール中¦正在安装 WD 标签模型¦WD 태그 모델 설치 중¦WD-Tagger-Modelle werden installiert
installingCaptionModels¦Installing caption models¦画像説明モデルをインストール中¦正在安装图像描述模型¦이미지 설명 모델 설치 중¦Beschreibungsmodelle werden installiert
installingUmbraUiModels¦Installing Umbra UI support models¦Umbra UI 補助モデルをインストール中¦正在安装 Umbra UI 辅助模型¦Umbra UI 보조 모델 설치 중¦Umbra-UI-Hilfsmodelle werden installiert
modelsTab¦Models¦モデル¦模型¦모델¦Modelle
modelsTitle¦Model setup¦モデルの設定¦模型设置¦모델 설정¦Modelleinrichtung
familyModels¦Model families¦モデル系列¦模型系列¦모델 계열¦Modellfamilien
supportModels¦Pipeline support¦パイプライン補助¦流程辅助¦파이프라인 지원¦Pipeline-Hilfsmodelle
selectedFiles¦Selected files¦選択したファイル¦所选文件¦선택한 파일¦Ausgewählte Dateien
hfAccess¦Hugging Face access (optional)¦Hugging Face アクセス（任意）¦Hugging Face 访问（可选）¦Hugging Face 액세스 (선택)¦Hugging-Face-Zugang (optional)
hfHint¦Session only. Accept gated model licenses on Hugging Face before downloading.¦このセッションのみ。ダウンロード前に Hugging Face で制限付きモデルのライセンスに同意してください。¦仅本次会话。下载前请在 Hugging Face 接受受限模型许可证。¦현재 세션만 사용됩니다. 다운로드 전에 Hugging Face에서 제한 모델 라이선스에 동의하세요.¦Nur diese Sitzung. Vor dem Download die Lizenzen zugangsbeschränkter Modelle auf Hugging Face akzeptieren.
installSelected¦Install selected¦選択項目をインストール¦安装所选项¦선택 항목 설치¦Auswahl installieren
verifySelected¦Verify selected¦選択項目を検証¦验证所选项¦선택 항목 검증¦Auswahl prüfen
clearSelection¦Clear selection¦選択を解除¦清除选择¦선택 해제¦Auswahl leeren
modelHint¦Most families need a separate checkpoint from Model Manager. Some packs include generation weights; review the files and licenses.¦多くの系列には Model Manager から別途チェックポイントが必要です。生成モデルを含むパックもあります。ファイルとライセンスを確認してください。¦多数系列需要从 Model Manager 单独添加检查点。部分包包含生成权重，请查看文件和许可证。¦대부분의 계열은 Model Manager에서 별도 체크포인트가 필요합니다. 일부 팩은 생성 가중치를 포함합니다. 파일과 라이선스를 확인하세요.¦Die meisten Familien brauchen einen zusätzlichen Checkpoint aus Model Manager. Manche Pakete enthalten Generierungsgewichte; Dateien und Lizenzen prüfen.
cancelDownload¦Cancel download¦ダウンロードを中止¦取消下载¦다운로드 취소¦Download abbrechen
cancelling¦Cancelling…¦中止しています…¦正在取消…¦취소 중…¦Wird abgebrochen…
cancelled¦Cancelled¦中止済み¦已取消¦취소됨¦Abgebrochen
chooseFamily¦Select a family¦系列を選択¦选择系列¦계열 선택¦Familie auswählen
noFiles¦No separate files required for this selection.¦この選択には別途ファイルは不要です。¦此选择不需要额外文件。¦이 선택에는 별도 파일이 필요하지 않습니다.¦Für diese Auswahl sind keine zusätzlichen Dateien nötig.
presentFile¦Present; checksum not verified yet¦存在します。チェックサムは未検証です¦已存在，校验和尚未验证¦파일 있음; 체크섬 미검증¦Vorhanden; Prüfsumme noch nicht geprüft
missingFile¦Missing or size mismatch¦不足またはサイズ不一致¦缺失或大小不符¦누락 또는 크기 불일치¦Fehlend oder abweichende Größe
fullSize¦total size¦合計サイズ¦总大小¦전체 크기¦Gesamtgröße
missingSize¦missing / size mismatch¦不足／サイズ不一致¦缺失／大小不符¦누락 / 크기 불일치¦fehlend / abweichende Größe
filesLabel¦files¦ファイル¦个文件¦파일¦Dateien
installerLog¦Installer log¦インストールログ¦安装日志¦설치 로그¦Installationsprotokoll
recommendedModels¦Recommended¦推奨¦推荐¦권장¦Empfohlen
includesRequired¦Includes required prerequisites¦必要な前提ファイルを含みます¦包含所需前置文件¦필수 준비 파일 포함¦Enthält erforderliche Voraussetzungen
modelLicenseDisclaimer¦Model licenses are separate from Umbra’s license. Review each model’s terms, including commercial-use restrictions. Umbra support does not grant additional rights.¦モデルのライセンスは Umbra のライセンスとは別です。商用利用の制限を含め、各モデルの条件を確認してください。Umbra の対応は追加の権利を付与しません。¦模型许可证与 Umbra 许可证独立。请查看每个模型的条款，包括商业使用限制。Umbra 支持不授予额外权利。¦모델 라이선스는 Umbra 라이선스와 별개입니다. 상업적 사용 제한을 포함한 각 모델의 조건을 확인하세요. Umbra 지원은 추가 권리를 부여하지 않습니다.¦Modelllizenzen sind von Umbras Lizenz getrennt. Bedingungen jedes Modells einschließlich kommerzieller Einschränkungen prüfen. Umbra-Unterstützung gewährt keine zusätzlichen Rechte.
Installing selected models¦Installing selected models¦選択したモデルをインストール中¦正在安装所选模型¦선택 모델 설치 중¦Ausgewählte Modelle werden installiert
Verifying selected models¦Verifying selected models¦選択したモデルを検証中¦正在验证所选模型¦선택 모델 검증 중¦Ausgewählte Modelle werden geprüft
Installation cancelled¦Installation cancelled¦インストールを中止しました¦安装已取消¦설치 취소됨¦Installation abgebrochen
toolsTab¦Tools¦ツール¦工具¦도구¦Tools
managedTools¦Managed tools¦管理ツール¦托管工具¦관리 도구¦Verwaltete Tools
refreshTools¦Refresh¦更新¦刷新¦새로 고침¦Aktualisieren
repairTool¦Install / repair¦インストール／修復¦安装／修复¦설치 / 복구¦Installieren / reparieren
toolsHint¦Checks reviewed versions, compatibility patches and frontend files. Restart managed ComfyUI and refresh its frontend after repairs. Runtime registration is checked separately.¦確認済みバージョン、互換パッチ、画面用ファイルを確認します。修復後は管理対象の ComfyUI を再起動して画面を更新してください。実行時の登録は別途確認します。¦检查审核过的版本、兼容补丁和前端文件。修复后请重启托管 ComfyUI 并刷新前端。运行时注册需单独检查。¦검토된 버전, 호환 패치와 프런트엔드 파일을 확인합니다. 복구 후 관리 ComfyUI를 재시작하고 화면을 새로 고치세요. 실행 시 등록은 별도로 확인합니다.¦Geprüfte Versionen, Kompatibilitätspatches und Frontend-Dateien prüfen. Nach Reparaturen ComfyUI neu starten und dessen Frontend aktualisieren. Laufzeitregistrierung wird separat geprüft.
noManagedTools¦This build declares no managed tool requirements.¦このビルドには管理ツールの要件がありません。¦此版本未声明托管工具要求。¦이 빌드에는 관리 도구 요구 사항이 없습니다.¦Dieser Build deklariert keine Anforderungen an verwaltete Tools.
downloadCivitai¦Download on Civitai¦Civitai でダウンロード¦在 Civitai 下载¦Civitai에서 다운로드¦Bei Civitai herunterladen
manualDownload¦Manual download¦手動ダウンロード¦手动下载¦수동 다운로드¦Manueller Download
manualDestination¦Place {file} in {folder} inside your Umbra Studio folder. Setup does not download this model.¦Umbra Studio フォルダー内の {folder} に {file} を配置してください。Setup はこのモデルをダウンロードしません。¦将 {file} 放入 Umbra Studio 文件夹中的 {folder}。Setup 不会下载此模型。¦Umbra Studio 폴더 안의 {folder}에 {file}을 넣으세요. Setup은 이 모델을 다운로드하지 않습니다.¦{file} in {folder} innerhalb des Umbra-Studio-Ordners ablegen. Setup lädt dieses Modell nicht herunter.
installed¦Installed¦インストール済み¦已安装¦설치됨¦Installiert
missing¦Missing¦不足¦缺失¦누락¦Fehlend
verified¦Verified¦検証済み¦已验证¦검증됨¦Geprüft
unavailable¦Unavailable¦利用不可¦不可用¦사용 불가¦Nicht verfügbar
unverified¦Unverified¦未検証¦未验证¦미검증¦Ungeprüft
stopBeforeMaintenance¦Stop {tool} in Umbra before maintenance.¦メンテナンス前に Umbra で {tool} を停止してください。¦维护前请在 Umbra 中停止 {tool}。¦유지보수 전에 Umbra에서 {tool}을 중지하세요.¦Vor Wartungsarbeiten {tool} in Umbra stoppen.
reinstallTool¦Repair / reinstall¦修復／再インストール¦修复／重新安装¦복구 / 재설치¦Reparieren / neu installieren
installTool¦Install¦インストール¦安装¦설치¦Installieren
updateTool¦Update¦更新¦更新¦업데이트¦Aktualisieren
updateCuda¦Update CUDA / PyTorch¦CUDA / PyTorch を更新¦更新 CUDA / PyTorch¦CUDA / PyTorch 업데이트¦CUDA / PyTorch aktualisieren
updateCustomNodes¦Install / update custom nodes¦カスタムノードをインストール／更新¦安装／更新自定义节点¦사용자 노드 설치 / 업데이트¦Zusatz-Nodes installieren / aktualisieren
updateH3Nodes¦Install / update H3 nodes¦H3 ノードをインストール／更新¦安装／更新 H3 节点¦H3 노드 설치 / 업데이트¦H3-Nodes installieren / aktualisieren
repairSage¦Install / repair SageAttention¦SageAttention をインストール／修復¦安装／修复 SageAttention¦SageAttention 설치 / 복구¦SageAttention installieren / reparieren
updatePython¦Update Python 3.13¦Python 3.13 に更新¦升级到 Python 3.13¦Python 3.13 업데이트¦Python auf 3.13 aktualisieren
updateTrainingPython¦Update Python 3.12¦Python 3.12 に更新¦升级到 Python 3.12¦Python 3.12 업데이트¦Python auf 3.12 aktualisieren
trainingPythonWarning¦Rebuild AI Toolkit with Python 3.12? Dependencies will be downloaded again. Datasets, configurations and checkpoints stay in place. The previous environment is kept for rollback.¦AI Toolkit を Python 3.12 で再構築しますか？依存関係を再ダウンロードします。データセット、設定、チェックポイントは維持され、以前の環境は復元用に保存されます。¦使用 Python 3.12 重建 AI Toolkit？将重新下载依赖。数据集、配置和检查点保留，旧环境将保留用于回退。¦Python 3.12로 AI Toolkit을 다시 구성할까요? 의존성을 다시 다운로드합니다. 데이터셋, 설정과 체크포인트는 유지하며 이전 환경은 복구용으로 보관합니다.¦AI Toolkit mit Python 3.12 neu erstellen? Abhängigkeiten werden erneut heruntergeladen. Datensätze, Konfigurationen und Checkpoints bleiben erhalten. Die bisherige Umgebung wird für die Wiederherstellung aufbewahrt.
pythonUpgradeWarning¦Rebuild ComfyUI with Python 3.13? Dependencies will be downloaded again. Models and custom-node code stay in place. The previous environment is kept for rollback.¦ComfyUI を Python 3.13 で再構築しますか？依存関係を再ダウンロードします。モデルとカスタムノードのコードは維持され、以前の環境は復元用に保存されます。¦使用 Python 3.13 重建 ComfyUI？将重新下载依赖。模型和自定义节点代码保留在原位置，旧环境将保留用于回退。¦Python 3.13으로 ComfyUI를 다시 구성할까요? 의존성을 다시 다운로드합니다. 모델과 사용자 노드 코드는 유지하며 이전 환경은 복구용으로 보관합니다.¦ComfyUI mit Python 3.13 neu erstellen? Abhängigkeiten werden erneut heruntergeladen. Modelle und Custom-Node-Code bleiben erhalten. Die bisherige Umgebung wird für die Wiederherstellung aufbewahrt.
comfyVersion¦ComfyUI version tag / branch / commit¦ComfyUI のタグ／ブランチ／コミット¦ComfyUI 版本标签／分支／提交¦ComfyUI 버전 태그 / 브랜치 / 커밋¦ComfyUI-Versionstag / Branch / Commit
switchVersion¦Install / switch version¦インストール／バージョン切替¦安装／切换版本¦설치 / 버전 전환¦Version installieren / wechseln
switchWarning¦Switch ComfyUI to {ref}? This rebuild can remove nodes not preinstalled by Umbra. Use Update to preserve custom nodes.¦ComfyUI を {ref} に切り替えますか？再構築で Umbra に同梱されていないノードが削除される場合があります。カスタムノードを保持するには「更新」を使用してください。¦将 ComfyUI 切换到 {ref}？重建可能删除 Umbra 未预装的节点。请使用“更新”保留自定义节点。¦ComfyUI를 {ref}(으)로 전환할까요? 재구축 시 Umbra가 사전 설치하지 않은 노드가 제거될 수 있습니다. 사용자 노드를 유지하려면 업데이트를 사용하세요.¦ComfyUI auf {ref} wechseln? Der Neuaufbau kann nicht von Umbra vorinstallierte Nodes entfernen. Zum Behalten eigener Nodes Aktualisieren verwenden.
sharedSize¦Shared support models: {size} GiB, plus Python packages. Valid existing files are checked and kept.¦共通補助モデル：{size} GiB と Python パッケージ。既存の有効なファイルは確認して保持します。¦共享辅助模型：{size} GiB，另含 Python 包。现有有效文件会被检查并保留。¦공통 보조 모델: {size} GiB 및 Python 패키지. 유효한 기존 파일은 확인 후 유지합니다.¦Gemeinsame Hilfsmodelle: {size} GiB plus Python-Pakete. Gültige vorhandene Dateien werden geprüft und behalten.
cpuHelpers¦CPU Python helpers¦CPU 用 Python 補助ツール¦CPU Python 辅助工具¦CPU Python 보조 도구¦CPU-Python-Hilfsprogramme
repairDownload¦Repair download: {size} MiB¦修復用ダウンロード：{size} MiB¦修复下载：{size} MiB¦복구 다운로드: {size} MiB¦Reparaturdownload: {size} MiB
verifyMedia¦Verify media tools¦メディアツールを検証¦验证媒体工具¦미디어 도구 검증¦Medientools prüfen
repairMedia¦Install / repair media tools¦メディアツールをインストール／修復¦安装／修复媒体工具¦미디어 도구 설치 / 복구¦Medientools installieren / reparieren
reviewedCore¦Reviewed ComfyUI requirements¦確認済み ComfyUI 要件¦审核过的 ComfyUI 要求¦검토된 ComfyUI 요구 사항¦Geprüfte ComfyUI-Anforderungen
required¦Required¦必要¦要求¦필수¦Erforderlich
frontend¦Frontend¦フロントエンド¦前端¦프런트엔드¦Frontend
backgroundCompatibility¦Background removal compatibility¦背景除去の互換性¦背景移除兼容性¦배경 제거 호환성¦Kompatibilität der Hintergrundentfernung
stepsComplete¦{count} steps completed¦{count} 手順完了¦已完成 {count} 步¦{count}개 단계 완료¦{count} Schritte abgeschlossen
reviewSteps¦{count} managed repair steps; review tools and pinned versions.¦{count} 手順の管理修復。ツールと固定バージョンを確認してください。¦{count} 个托管修复步骤，请查看工具和固定版本。¦관리 복구 {count}개 단계; 도구와 고정 버전을 확인하세요.¦{count} verwaltete Reparaturschritte; Tools und festgelegte Versionen prüfen.
resumeRepair¦Review / resume¦確認／再開¦查看／继续¦검토 / 재개¦Prüfen / fortsetzen
reviewRepair¦Review repair¦修復内容を確認¦查看修复¦복구 검토¦Reparatur prüfen
runtimeReadiness¦Runtime readiness¦実行準備状況¦运行就绪状态¦실행 준비 상태¦Laufzeitbereitschaft
runtimeHint¦Start managed ComfyUI from Umbra and refresh its frontend. Native hooks and GPU have not been qualified by file checks.¦Umbra から管理対象の ComfyUI を起動して画面を更新してください。ファイル確認だけではネイティブ機能と GPU は検証されません。¦从 Umbra 启动托管 ComfyUI 并刷新前端。文件检查未验证原生功能及 GPU。¦Umbra에서 관리 ComfyUI를 시작하고 화면을 새로 고치세요. 파일 확인만으로 네이티브 기능과 GPU는 검증되지 않습니다.¦Verwaltetes ComfyUI aus Umbra starten und Frontend aktualisieren. Dateiprüfungen qualifizieren native Funktionen und GPU nicht.
recheck¦Recheck¦再確認¦重新检查¦다시 확인¦Erneut prüfen
declaredWorkflows¦{count} declared workflows¦{count} 個の宣言済みワークフロー¦{count} 个已声明工作流¦선언된 워크플로 {count}개¦{count} deklarierte Workflows
runtimeClasses¦Runtime classes¦実行時クラス¦运行时类¦실행 클래스¦Laufzeitklassen
workflowHeld¦Workflow held¦ワークフロー保留¦工作流暂停¦워크플로 보류¦Workflow angehalten
runtimeUnchecked¦Runtime unchecked¦実行時未検証¦运行时未验证¦실행 미검증¦Laufzeit ungeprüft
filesVerified¦Installed files verified; runtime unchecked¦インストール済みファイルを検証済み。実行時は未検証¦已验证安装文件；运行时未验证¦설치 파일 검증됨; 실행 미검증¦Installierte Dateien geprüft; Laufzeit ungeprüft
reviewed¦Reviewed¦確認済み¦已审核¦검토됨¦Geprüft
afterRepair¦Managed files verified. Restart managed ComfyUI and refresh its frontend; runtime registration still needs checking.¦管理ファイルを検証しました。管理対象の ComfyUI を再起動して画面を更新してください。実行時登録は引き続き確認が必要です。¦托管文件已验证。请重启托管 ComfyUI 并刷新前端；运行时注册仍需检查。¦관리 파일 검증 완료. 관리 ComfyUI를 재시작하고 화면을 새로 고치세요. 실행 등록은 추가 확인이 필요합니다.¦Verwaltete Dateien geprüft. ComfyUI neu starten und Frontend aktualisieren; Laufzeitregistrierung muss noch geprüft werden.
bundleContents¦Python helpers (including pandas), WD/PixAI taggers, Qwen2-VL captions, detailers, SAM, upscaling/interpolation and CLIP/SigLIP vision support.¦Python 補助ツール（pandas を含む）、WD/PixAI タグ付け、Qwen2-VL 画像説明、ディテーラー、SAM、アップスケール／補間、CLIP/SigLIP 視覚モデル。¦Python 辅助工具（含 pandas）、WD/PixAI 标签、Qwen2-VL 描述、细化、SAM、放大／插帧和 CLIP/SigLIP 视觉支持。¦Python 보조 도구(pandas 포함), WD/PixAI 태그, Qwen2-VL 설명, 디테일러, SAM, 업스케일/보간 및 CLIP/SigLIP 시각 지원.¦Python-Hilfsprogramme (mit pandas), WD/PixAI-Tagger, Qwen2-VL-Beschreibungen, Detailer, SAM, Upscaling/Interpolation und CLIP/SigLIP.
bundleConfirm¦Install / verify this bundle? Model-family downloads are separate. Local changes are preserved. Restart and runtime checks follow tool repairs.¦このパックをインストール／検証しますか？モデル系列のダウンロードは別です。ローカル変更は保持します。ツール修復後は再起動と実行時確認が必要です。¦安装／验证此包？模型系列需单独下载。本地更改会被保留。工具修复后需重启并检查运行状态。¦이 번들을 설치 / 검증할까요? 모델 계열 다운로드는 별도입니다. 로컬 변경은 유지됩니다. 도구 복구 후 재시작과 실행 확인이 필요합니다.¦Dieses Paket installieren / prüfen? Modellfamilien werden separat geladen. Lokale Änderungen bleiben erhalten. Nach Reparaturen folgen Neustart und Laufzeitprüfung.
noRepairPlan¦This build has no dependency plan. Refresh Tools and review the setup log.¦このビルドには依存関係プランがありません。ツールを更新してセットアップログを確認してください。¦此版本没有依赖计划。请刷新工具并查看设置日志。¦이 빌드에는 의존성 계획이 없습니다. 도구를 새로 고치고 설정 로그를 확인하세요.¦Dieser Build hat keinen Abhängigkeitsplan. Tools aktualisieren und Einrichtungsprotokoll prüfen.
searchModels¦Search model families¦モデル系列を検索¦搜索模型系列¦모델 계열 검색¦Modellfamilien suchen
checking¦Checking¦確認中¦检查中¦확인 중¦Wird geprüft
downloading¦Downloading¦ダウンロード中¦下载中¦다운로드 중¦Wird heruntergeladen
profileGeneration¦Generation model files and required components for {family}. Review the file list and original license notices below.¦{family} の生成モデルと必要な構成ファイルです。以下のファイル一覧と原文のライセンス通知を確認してください。¦{family} 的生成模型文件及必需组件。请查看下方文件列表和原始许可证声明。¦{family}용 생성 모델 파일과 필수 구성 요소입니다. 아래 파일 목록과 원문 라이선스 안내를 확인하세요.¦Generierungsmodell und benötigte Komponenten für {family}. Dateiliste und originale Lizenzhinweise unten prüfen.
profilePrerequisites¦Required components for {family}; a separate compatible generation checkpoint is needed. Review the files and original licenses below.¦{family} の必要な構成ファイルです。別途互換性のある生成チェックポイントが必要です。以下のファイルと原文のライセンスを確認してください。¦{family} 的必需组件；还需要单独的兼容生成检查点。请查看下方文件和原始许可证。¦{family}용 필수 구성 요소입니다. 별도의 호환 생성 체크포인트가 필요합니다. 아래 파일과 원문 라이선스를 확인하세요.¦Benötigte Komponenten für {family}; ein zusätzlicher kompatibler Generierungs-Checkpoint ist nötig. Dateien und originale Lizenzen unten prüfen.
profileSupport¦Optional workflow support for {family}. Review files, sizes and original model licenses before downloading.¦{family} の任意のワークフロー補助ファイルです。ダウンロード前にファイル、サイズ、原文のモデルライセンスを確認してください。¦{family} 的可选工作流支持。下载前请查看文件、大小和原始模型许可证。¦{family}용 선택 워크플로 지원입니다. 다운로드 전에 파일, 크기 및 원문 모델 라이선스를 확인하세요.¦Optionale Workflow-Unterstützung für {family}. Vor dem Download Dateien, Größen und originale Modelllizenzen prüfen.
held¦Held¦保留¦暂停¦보류¦Angehalten
restart-required¦Restart required¦再起動が必要¦需要重启¦재시작 필요¦Neustart nötig
preflight-held¦Runtime checks held¦実行時確認を保留¦运行检查暂停¦실행 확인 보류¦Laufzeitprüfung angehalten
preflight-passed¦Runtime checks passed¦実行時確認に合格¦运行检查通过¦실행 확인 통과¦Laufzeitprüfung bestanden
ready¦Ready¦準備完了¦就绪¦준비 완료¦Bereit
outdated¦Outdated¦旧バージョン¦版本过旧¦구버전¦Veraltet
patched¦Patched¦パッチ済み¦已修补¦패치됨¦Gepatcht
requestFailed¦Request failed ({status})¦リクエスト失敗（{status}）¦请求失败（{status}）¦요청 실패 ({status})¦Anfrage fehlgeschlagen ({status})
maintenanceComplete¦Tool maintenance complete¦ツールのメンテナンス完了¦工具维护完成¦도구 유지보수 완료¦Tool-Wartung abgeschlossen
maintenanceRunning¦Installing or updating managed tools¦管理ツールをインストール／更新中¦正在安装或更新托管工具¦관리 도구 설치 / 업데이트 중¦Verwaltete Tools werden installiert / aktualisiert
verifyRunning¦Verifying setup readiness¦セットアップ準備状況を検証中¦正在验证设置就绪状态¦설정 준비 상태 검증 중¦Einrichtungsbereitschaft wird geprüft
technicalDetails¦Technical details (original output)¦技術詳細（元の出力）¦技术详情（原始输出）¦기술 세부 정보 (원본 출력)¦Technische Details (Originalausgabe)
verifyCheckpoint¦Verifying generation checkpoint¦生成チェックポイントを検証中¦正在验证生成检查点¦생성 체크포인트 검증 중¦Generierungs-Checkpoint wird geprüft
installationVerified¦Installation verified¦インストールを検証済み¦安装已验证¦설치 검증 완료¦Installation geprüft
verificationHeld¦Verification held; check the log¦検証を保留。ログを確認してください¦验证暂停，请查看日志¦검증 보류; 로그를 확인하세요¦Prüfung angehalten; Protokoll prüfen
mediaVerified¦FFmpeg and ffprobe verified¦FFmpeg と ffprobe を検証済み¦FFmpeg 和 ffprobe 已验证¦FFmpeg 및 ffprobe 검증됨¦FFmpeg und ffprobe geprüft
repairFailed¦Managed tool repair failed¦管理ツールの修復失敗¦托管工具修复失败¦관리 도구 복구 실패¦Reparatur verwalteter Tools fehlgeschlagen
restartPending¦Restart required; runtime checks pending¦再起動が必要。実行時確認は未完了¦需要重启；运行检查待完成¦재시작 필요; 실행 확인 대기¦Neustart nötig; Laufzeitprüfung ausstehend
preparingTool¦Preparing {tool}¦{tool} を準備中¦正在准备 {tool}¦{tool} 준비 중¦{tool} wird vorbereitet
installingTool¦Installing {tool}¦{tool} をインストール中¦正在安装 {tool}¦{tool} 설치 중¦{tool} wird installiert
coreSupport¦Core pipeline support¦基本パイプライン補助¦核心流程辅助¦기본 파이프라인 지원¦Grundlegende Pipeline-Unterstützung
coreSupportDescription¦Person, face and hand detailers, SAM masks, upscaling and frame interpolation.¦人物、顔、手のディテーラー、SAM マスク、アップスケール、フレーム補間です。¦人物、脸部及手部细化、SAM 遮罩、放大和插帧。¦사람, 얼굴, 손 디테일러, SAM 마스크, 업스케일 및 프레임 보간입니다.¦Detailer für Personen, Gesichter und Hände, SAM-Masken, Upscaling und Frame-Interpolation.
anima-38-lora¦Anima 3.8B LoRA support¦Anima 3.8B LoRA 対応¦Anima 3.8B LoRA 支持¦Anima 3.8B LoRA 지원¦Anima 3.8B LoRA-Unterstützung
minimax-h3¦MiniMax H3 video¦MiniMax H3 動画¦MiniMax H3 视频¦MiniMax H3 비디오¦MiniMax H3 Video
ltx23-omniforge¦LTX-2.3 OmniForge video tools¦LTX-2.3 OmniForge 動画ツール¦LTX-2.3 OmniForge 视频工具¦LTX-2.3 OmniForge 비디오 도구¦LTX-2.3 OmniForge Videotools
ltx23-omniforge-tiled-decode¦LTX-2.3 tiled video VAE decode¦LTX-2.3 タイル式動画 VAE デコード¦LTX-2.3 分块视频 VAE 解码¦LTX-2.3 타일 비디오 VAE 디코딩¦LTX-2.3 gekachelte Video-VAE-Decodierung
ltx23-omniforge-pixel-upscale¦LTX-2.3 advanced pixel upscale¦LTX-2.3 高度なピクセルアップスケール¦LTX-2.3 高级像素放大¦LTX-2.3 고급 픽셀 업스케일¦LTX-2.3 erweitertes Pixel-Upscaling
declared-umbra-workflows¦Declared Umbra workflows¦宣言済み Umbra ワークフロー¦已声明的 Umbra 工作流¦선언된 Umbra 워크플로¦Deklarierte Umbra-Workflows
all-managed-dependencies¦All managed dependencies¦すべての管理依存関係¦全部托管依赖¦모든 관리 의존성¦Alle verwalteten Abhängigkeiten
`;
for (const row of setupCopyRows.trim().split('\n')) {
  const [key, ...values] = row.split('¦');
  ['en', 'ja', 'zh-CN', 'ko', 'de'].forEach((locale, index) => { SETUP_TRANSLATIONS[locale][key] = values[index]; });
}
// These descriptions belonged to the replaced four-step guide and have no UI consumers.
for (const dictionary of Object.values(SETUP_TRANSLATIONS)) {
  for (const key of ['allDependenciesHint', 'setupStep1', 'setupStep2', 'setupStep3', 'setupStep4', 'featureSetupTitle', 'featureGeneration', 'featureSupport', 'featureTagging', 'featureGallery', 'featureRemote']) delete dictionary[key];
}
function setupFormat(key, values = {}) {
  return tr(key).replace(/\{([a-zA-Z]+)\}/g, (match, name) => values[name] ?? match);
}
function setupProfileDescription(profile, pack) {
  if (pack?.id === 'support' && profile.id === 'core') return tr('coreSupportDescription');
  if (currentLanguage === 'en') return profile.description;
  const files = (pack?.files || []).filter(file => file.profiles.includes(profile.id));
  const generation = files.some(file => /^(diffusion_models|checkpoints)\//.test(file.destination));
  return setupFormat(pack?.id === 'support' ? 'profileSupport' : generation ? 'profileGeneration' : 'profilePrerequisites', { family: setupProfileLabel(profile, pack) });
}
function setupProfileLabel(profile, pack) { return pack?.id === 'support' && profile.id === 'core' ? tr('coreSupport') : profile.label; }
function setupFeatureLabel(feature) { return SETUP_TRANSLATIONS.en[feature.featureId || feature.id] ? tr(feature.featureId || feature.id) : feature.label; }
let modelCatalog = null;
let modelBusy = false;
let modelPack = new URLSearchParams(location.search).get('pack') === 'support' ? 'support' : 'requirements';
const modelSelections = {
  requirements: new Set((new URLSearchParams(location.search).get('profiles') || '').split(',').filter(id => /^[a-z0-9-]{1,64}$/.test(id))),
  support: new Set(['core']),
};
let completedModelJob = '';
const modelElement = id => document.getElementById(id);

const modelBytes = value => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
function modelError(error) { status.textContent = error.message; status.classList.add('error'); }

function showSetupTab(tab) {
  if (tab === 'tools' || tab === 'models') modelElement('setup-advanced').open = true;
  modelElement('setup-steps').hidden = tab !== 'general';
  modelElement('setup-step-summary').hidden = tab !== 'general';
  ['general', 'models', 'tools', 'updates'].forEach(id => {
    modelElement(`${id}-panel`).hidden = tab !== id;
    modelElement(`tab-${id}`).setAttribute('aria-selected', String(tab === id));
    modelElement(`tab-${id}`).tabIndex = 0;
  });
}
const setupTabs = ['general', 'tools', 'models', 'updates'];
setupTabs.forEach(tab => {
  modelElement(`tab-${tab}`).addEventListener('click', () => showSetupTab(tab));
  modelElement(`tab-${tab}`).addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? setupTabs[0] : event.key === 'End' ? setupTabs.at(-1)
      : setupTabs[(setupTabs.indexOf(tab) + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : setupTabs.length - 1)) % setupTabs.length];
    showSetupTab(next); modelElement(`tab-${next}`).focus();
  });
});
function currentModelPack() { return modelCatalog?.packs.find(pack => pack.id === modelPack); }
function selectedModelFiles() {
  const pack = currentModelPack();
  const selected = new Set(modelSelections[modelPack]);
  for (const id of selected) {
    for (const required of pack?.profiles.find(profile => profile.id === id)?.requiresProfiles || []) {
      selected.add(required);
    }
  }
  return (pack?.files || []).filter(file => file.profiles.some(id => selected.has(id)));
}
function setModelBusy(busy) {
  modelBusy = busy;
  for (const id of ['model-install', 'model-check']) modelElement(id).disabled = busy || !selectedModelFiles().length;
}
function renderModelReview() {
  renderRecommendedModels();
  const files = selectedModelFiles();
  const allBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const missingBytes = files.filter(file => !file.present).reduce((sum, file) => sum + file.bytes, 0);
  modelElement('model-summary').textContent = files.length
    ? `${files.length} ${tr('filesLabel')} | ${modelBytes(allBytes)} ${tr('fullSize')} | ${modelBytes(missingBytes)} ${tr('missingSize')}`
    : tr(modelSelections[modelPack].size ? 'noFiles' : 'chooseFamily');
  const list = modelElement('model-files'); list.replaceChildren();
  for (const file of files) {
    const row = document.createElement('div'); row.className = 'model-file'; row.textContent = file.destination;
    const detail = document.createElement('small');
    detail.textContent = `${modelBytes(file.bytes)} | ${tr(file.present ? 'presentFile' : 'missingFile')}`;
    if (file.licenses.length) {
      const licenses = document.createElement('span'); licenses.className = 'model-licenses'; licenses.append(' | ');
      file.licenses.forEach((license, index) => {
        if (index) licenses.append(', ');
        if (license.url) {
          const link = document.createElement('a'); link.href = license.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = license.label;
          licenses.append(link);
        } else licenses.append(license.label);
        if (license.notice) {
          const notice = document.createElement('small'); notice.className = 'model-license-notice'; notice.textContent = ` ${license.notice}`;
          licenses.append(notice);
        }
      });
      detail.append(licenses);
    }
    row.append(detail); list.append(row);
  }
  for (const model of currentModelPack()?.manualModels || []) {
    const row = document.createElement('div'); row.className = 'model-file';
    const link = document.createElement('a'); link.href = model.reference; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = `${model.purpose} — ${tr(new URL(model.reference).hostname === 'civitai.com' ? 'downloadCivitai' : 'manualDownload')}`;
    const detail = document.createElement('small');
    detail.textContent = model.destinations.map(destination => {
      const separator = destination.lastIndexOf('/');
      return setupFormat('manualDestination', { file: destination.slice(separator + 1), folder: `Tools/ComfyUI/models/${destination.slice(0, separator + 1)}` });
    }).join(' ');
    row.append(link, detail); list.append(row);
  }
  setModelBusy(modelBusy);
}
const recommendedModels = [
  ['anima', 'Anima'], ['krea-2', 'Krea 2'], ['flux-2', 'FLUX.2'],
  ['ltx-2.3', 'LTX-2.3'], ['minimax-h3', 'MiniMax H3 Video'],
];
function renderRecommendedModels() {
  const list = modelElement('model-recommended');
  const pack = modelCatalog?.packs.find(item => item.id === 'requirements');
  if (!pack) return;
  // Preserve keyboard focus while the regular selection list changes.
  if (!list.children.length) for (const [id, name] of recommendedModels) {
    if (!pack.profiles.some(profile => profile.id === id)) continue;
    const label = document.createElement('label'); label.className = 'recommended-option';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.profile = id;
    checkbox.setAttribute('aria-label', `${name} (${tr('recommendedModels')})`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) modelSelections.requirements.add(id); else modelSelections.requirements.delete(id);
      modelElement('pack-requirements').click();
    });
    const text = document.createElement('div'); const title = document.createElement('strong'); title.textContent = name;
    const size = document.createElement('small');
    size.textContent = modelBytes(pack.files.filter(file => file.profiles.includes(id)).reduce((sum, file) => sum + file.bytes, 0));
    text.append(title, size); label.append(checkbox, text); list.append(label);
  }
  list.querySelectorAll('input').forEach(checkbox => {
    checkbox.checked = modelSelections.requirements.has(checkbox.dataset.profile);
    const name = recommendedModels.find(([id]) => id === checkbox.dataset.profile)?.[1] || checkbox.dataset.profile;
    checkbox.setAttribute('aria-label', `${name} (${tr('recommendedModels')})`);
  });
}
function renderModelFamilies() {
  const list = modelElement('model-families'); list.replaceChildren();
  const query = modelElement('model-search').value.toLowerCase();
  for (const profile of currentModelPack()?.profiles || []) {
    if (!`${profile.label} ${profile.description} ${setupProfileDescription(profile, currentModelPack())}`.toLowerCase().includes(query)) continue;
    const label = document.createElement('label'); label.className = 'model-family';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = modelSelections[modelPack].has(profile.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) modelSelections[modelPack].add(profile.id); else modelSelections[modelPack].delete(profile.id);
      renderModelReview();
    });
    const text = document.createElement('div'); const title = document.createElement('strong'); title.textContent = setupProfileLabel(profile, currentModelPack());
    const description = document.createElement('p'); description.textContent = setupProfileDescription(profile, currentModelPack());
    text.append(title, description);
    if (profile.requiresProfiles?.length) {
      const required = document.createElement('small'); required.className = 'model-requirements';
      required.textContent = `${tr('includesRequired')}: ${profile.requiresProfiles.map(id => currentModelPack().profiles.find(item => item.id === id)?.label || id).join(', ')}`;
      text.append(required);
    }
    label.append(checkbox, text); list.append(label);
  }
  renderModelReview();
}
async function loadModelCatalog() {
  modelCatalog = await api('/api/models');
  modelElement('model-root').textContent = modelCatalog.modelsRoot;
  renderModelFamilies();
}
function renderModelProgress(job) {
  const event = job.progress;
  const meter = modelElement('model-meter'); meter.hidden = !event;
  document.querySelector('#progress .track').hidden = !!event;
  if (event) {
    if (event.stage === 'checking') meter.removeAttribute('value');
    else meter.value = Math.max(0, Math.min(100, (event.bytes || 0) / Math.max(1, event.totalBytes || 1) * 100));
    modelElement('model-transfer').textContent = `${tr(event.stage || '')}: ${event.file || ''} | ${modelBytes(event.bytes || 0)} / ${modelBytes(event.totalBytes || 0)} | ${event.completedFiles || 0}/${event.totalFiles || 0} ${tr('filesLabel')}`;
  } else modelElement('model-transfer').textContent = '';
  const cancel = modelElement('model-cancel');
  cancel.hidden = job.phase !== 'running' || !job.cancellable;
  cancel.disabled = !!job.cancelRequested; cancel.textContent = tr(job.cancelRequested ? 'cancelling' : 'cancelDownload');
  if (job.phase !== 'running' && completedModelJob !== job.id) {
    completedModelJob = job.id; void loadModelCatalog().catch(modelError);
  }
}
for (const pack of ['requirements', 'support']) {
  modelElement(`pack-${pack}`).addEventListener('click', () => {
    modelPack = pack;
    for (const id of ['requirements', 'support']) {
      modelElement(`pack-${id}`).classList.toggle('primary', id === pack);
      modelElement(`pack-${id}`).setAttribute('aria-pressed', String(id === pack));
    }
    modelElement('model-search').value = ''; renderModelFamilies();
  });
}
modelElement('model-search').addEventListener('input', renderModelFamilies);
modelElement('model-clear').addEventListener('click', () => { modelSelections[modelPack].clear(); renderModelFamilies(); });
for (const [id, check] of [['model-install', false], ['model-check', true]]) {
  modelElement(id).addEventListener('click', async () => {
    setModelBusy(true);
    try {
      const result = await api('/api/install', { method: 'POST', body: JSON.stringify({ kind: modelPack, profiles: [...modelSelections[modelPack]], check, hfToken: modelElement('model-token').value }) });
      modelElement('model-token').value = ''; renderJob(result.job); void poll();
    } catch (error) { modelError(error); setModelBusy(false); }
  });
}
modelElement('model-cancel').addEventListener('click', async () => {
  try { await api('/api/cancel', { method: 'POST', body: '{}' }); modelElement('model-cancel').disabled = true; }
  catch (error) { modelError(error); }
});
language.addEventListener('change', renderModelFamilies);
showSetupTab(setupTabs.includes(new URLSearchParams(location.search).get('tab')) ? new URLSearchParams(location.search).get('tab') : 'general');
modelElement(`pack-${modelPack}`).click();
if (new URLSearchParams(location.search).get('pack') === 'data-forge') modelElement('data-forge-pack').scrollIntoView();
void loadModelCatalog().catch(modelError);

Object.assign(SETUP_TRANSLATIONS.en, {
  toolsTab: 'Tools', managedTools: 'Managed tools', refreshTools: 'Refresh', repairTool: 'Install / repair',
  toolsHint: 'Checks reviewed suite versions, compatibility patches and frontend registration files. Restart managed ComfyUI and refresh its frontend after repairs. Runtime registration is verified when the workflow runs.',
  noManagedTools: 'This build does not declare managed tool requirements.',
});
let toolsBusy = false;
let completedToolsJob = '';
function setToolsBusy(busy) {
  toolsBusy = busy;
  modelElement('tools-list').querySelectorAll('button').forEach(button => { button.disabled = busy || button.dataset.requiresInstall === 'true'; });
  modelElement('tools-refresh').disabled = busy;
}
function toolsRow(label, detail, kind = '', target = '', action = null, actionLabel = '') {
  const row = document.createElement('div'); row.className = 'model-file';
  const name = document.createElement('strong'); name.textContent = label; row.append(name);
  const text = document.createElement('small'); text.textContent = detail; row.append(text);
  if (kind || action) {
    const button = document.createElement('button'); button.className = 'button'; button.type = 'button';
    button.textContent = actionLabel || tr('repairTool'); button.disabled = toolsBusy;
    button.addEventListener('click', async () => {
      if (action) { await action(); return; }
      setBusy(true);
      try {
        const result = await api('/api/dependencies/action', { method: 'POST', body: JSON.stringify({ kind, target }) });
        renderJob(result.job); void poll();
      } catch (error) { modelError(error); setBusy(false); }
    });
    row.append(button);
  }
  modelElement('tools-list').append(row);
  return row;
}
function toolDiagnostic(row, message) {
  if (!message) return;
  const detail = document.createElement('details'); const summary = document.createElement('summary');
  summary.textContent = tr('technicalDetails'); const text = document.createElement('small'); text.textContent = message;
  detail.append(summary, text); row.append(detail);
}
async function reviewAndInstallManagedPlan(plan, review = true) {
  const helpers = plan.featureId === 'all-managed-dependencies' ? [tr('bundleContents'), setupFormat('sharedSize', { size: ((plan.sharedSupport?.bytes || 0) / 1024 ** 3).toFixed(2) })] : [];
  if (review && !window.confirm([setupFeatureLabel(plan), ...helpers, ...plan.steps.map(step => `${step.target}: ${step.pins.join(', ')}`), ...plan.holds,
    tr('bundleConfirm')].join('\n\n'))) return false;
  setBusy(true);
  try {
    const result = await api('/api/dependencies/repair', { method: 'POST', body: JSON.stringify({ featureId: plan.featureId, planId: plan.id }) });
    renderJob(result.job); void poll(); return true;
  } catch (error) { modelError(error); setBusy(false); return false; }
}

modelElement('install-all-dependencies').addEventListener('click', async () => {
  setBusy(true);
  try {
    const result = await api('/api/dependencies');
    const plan = result.repairPlans?.find(plan => plan.featureId === 'all-managed-dependencies');
    if (plan) plan.sharedSupport = result.sharedSupport;
    if (!plan) throw new Error(tr('noRepairPlan'));
    if (!await reviewAndInstallManagedPlan(plan, false)) setBusy(false);
  } catch (error) { modelError(error); setBusy(false); }
});
document.querySelectorAll('[data-setup-tab]').forEach(button => button.addEventListener('click', () => showSetupTab(button.dataset.setupTab)));

async function loadManagedTools() {
  const dependencies = await api('/api/dependencies');
  modelElement('shared-support-size').textContent = setupFormat('sharedSize', { size: (dependencies.sharedSupport.bytes / 1024 ** 3).toFixed(2) });
  modelElement('tools-list').replaceChildren();
  modelElement('tools-summary').textContent = tr(dependencies.features.length ? 'toolsHint' : 'noManagedTools');
  for (const tool of dependencies.maintenanceTools || []) {
    const row = document.createElement('div'); row.className = 'model-file';
    const title = document.createElement('strong'); title.textContent = tool.name;
    const detail = document.createElement('small'); detail.textContent = `${tr(tool.installed ? 'installed' : 'missing')}${tool.commit ? ` | ${tool.commit}` : ''}. ${setupFormat('stopBeforeMaintenance', { tool: tool.name })}`;
    if (tool.python) detail.textContent += ` Python ${tool.python.version || tr('unavailable')} → ${tool.python.targetVersion || tool.python.target}.`;
    row.append(title, detail);
    row.dataset.maintenanceTool = tool.id;
    const controls = document.createElement('div'); controls.className = 'tool-maintenance-actions'; row.append(controls);
    const actions = [['install', tr(tool.installed ? 'reinstallTool' : 'installTool')], ['update', tr('updateTool')], ['update_pytorch', tr('updateCuda')]];
    if (tool.id === 'aitoolkit') actions.push(['update_python', tr('updateTrainingPython')]);
    if (tool.id === 'comfyui') actions.push(['update_python', tr('updatePython')], ['custom_nodes', tr('updateCustomNodes')], ['h3_nodes', tr('updateH3Nodes')], ['install_sageattention', tr('repairSage')]);
    const runAction = async (action, ref = '') => {
      if (action === 'update_python' && !window.confirm(tr(tool.id === 'aitoolkit' ? 'trainingPythonWarning' : 'pythonUpgradeWarning'))) return;
      setBusy(true);
      try {
        const result = await api('/api/tools/action', { method: 'POST', body: JSON.stringify({ tool: tool.id, action, ref }) });
        renderJob(result.job); void poll();
      } catch (error) { modelError(error); setBusy(false); }
    };
    for (const [action, label] of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button'; button.textContent = label;
      button.disabled = toolsBusy || (action !== 'install' && !tool.installed);
      button.dataset.requiresInstall = String(action !== 'install' && !tool.installed);
      button.addEventListener('click', () => { void runAction(action); }); controls.append(button);
    }
    if (tool.id === 'comfyui') {
      const label = document.createElement('label'); label.textContent = tr('comfyVersion');
      const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'v0.38.0'; label.append(input); row.append(label);
      const switchButton = document.createElement('button'); switchButton.type = 'button'; switchButton.className = 'button'; switchButton.textContent = tr('switchVersion');
      switchButton.addEventListener('click', () => {
        const ref = input.value.trim();
        if (!ref) { input.focus(); return; }
        if (!window.confirm(setupFormat('switchWarning', { ref }))) return;
        void runAction('set_comfyui_version', ref);
      }); row.append(switchButton);
    }
    modelElement('tools-list').append(row);
  }
  const media = dependencies.mediaTools;
  const helpers = dependencies.pythonHelpers;
  if (helpers) {
    toolDiagnostic(toolsRow(tr('cpuHelpers'), `${tr(helpers.ready ? 'verified' : 'unavailable')} | Python ${helpers.pythonVersion} | ${helpers.packages.map(item => `${item.name} ${item.version}`).join(', ')}.`), helpers.detail);
  }
  if (media) {
    toolDiagnostic(toolsRow('FFmpeg / ffprobe', `${media.tools.map(tool => `${tool.tool}: ${tool.ready ? tool.version : tr('unavailable')}`).join(' | ')}. ${setupFormat('repairDownload', { size: Math.round(media.downloadBytes / 1024 / 1024) })} (${media.license}).`,
      media.supported ? 'media' : '', 'FFmpeg', null, tr(media.ready ? 'verifyMedia' : 'repairMedia')), media.detail);
  }
  const core = dependencies.comfyui;
  const isOutdated = (version, minimum) => {
    if (!minimum) return false;
    const installed = String(version || '0').split('.').map(Number), required = minimum.split('.').map(Number);
    return required.some((part, index) => installed.slice(0, index).every((value, i) => value === required[i]) && (installed[index] || 0) < part);
  };
  const outdated = isOutdated(core.version, core.minimumRequired) || isOutdated(core.frontendVersion, core.minimumFrontendRequired);
  toolsRow(tr('reviewedCore'), `${core.version || tr('missing')}${core.minimumRequired ? ` | ${tr('required')} ${core.minimumRequired}+` : ''} | ${tr('frontend')} ${core.frontendVersion || tr('unverified')}${core.minimumFrontendRequired ? ` | ${tr('required')} ${core.minimumFrontendRequired}+` : ''}`,
    !core.installed || outdated ? 'comfyui' : '', 'ComfyUI');
  const suites = new Map();
  const background = dependencies.backgroundCompatibility;
  if (background && (background.status !== 'not-needed' || background.versions['transparent-background'])) {
    toolDiagnostic(toolsRow(tr('backgroundCompatibility'), `${background.versions['transparent-background'] || tr('unverified')} | ${tr(background.status)}`), background.detail);
  }
  for (const plan of dependencies.repairPlans || []) {
    if (plan.featureId === 'all-managed-dependencies') plan.sharedSupport = dependencies.sharedSupport;
    const saved = dependencies.repairState?.featureId === plan.featureId ? dependencies.repairState : null;
    toolsRow(setupFeatureLabel(plan), saved ? `${tr(saved.phase)} | ${setupFormat('stepsComplete', { count: saved.completedTargets.length })} | ${saved.error || ''}` : setupFormat('reviewSteps', { count: plan.steps.length }), '', '',
      () => reviewAndInstallManagedPlan(plan), tr(saved && ['held', 'failed'].includes(saved.phase) ? 'resumeRepair' : 'reviewRepair'));
    if (saved && ['restart-required', 'preflight-held', 'preflight-passed'].includes(saved.phase)) {
      toolsRow(tr('runtimeReadiness'), tr('runtimeHint'), '', '', async () => {
        try {
          const result = await api('/api/dependencies/preflight', { method: 'POST', body: JSON.stringify({ featureId: plan.featureId }) });
          await loadManagedTools(); modelElement('tools-message').textContent = result.ready ? result.qualification : result.issues.join(' ');
        } catch (error) { modelError(error); }
      }, tr('recheck'));
    }
  }
  for (const feature of dependencies.features) {
    const requiredClasses = feature.requiredBuiltinClasses || [];
    const workflows = feature.workflowIds || [];
    toolsRow(setupFeatureLabel(feature), `${workflows.length ? `${setupFormat('declaredWorkflows', { count: workflows.length })} | ` : ''}ComfyUI ${feature.minimumComfyVersion}+${requiredClasses.length ? ` | ${tr('runtimeClasses')}: ${requiredClasses.join(', ')}` : ''}`);
    for (const dependency of feature.runtimePackages || []) {
      toolsRow(`${dependency.distribution} | ${tr(dependency.status === 'missing' ? 'workflowHeld' : 'runtimeUnchecked')}`,
        `${dependency.detail} ${dependency.reason}`);
    }
    for (const node of feature.customNodes) {
      const existing = suites.get(node.name);
      if (!existing || existing.status === 'ready' && node.status !== 'ready') suites.set(node.name, node);
    }
  }
  for (const node of suites.values()) {
    const assets = node.frontendAssets || [];
    toolsRow(node.name, `${tr(node.status === 'ready' ? 'filesVerified' : node.status)} | ${tr('reviewed')} ${node.minimumCommit.slice(0, 12)}${node.reason ? ` | ${node.reason}` : ''}${assets.length ? ` | ${tr('frontend')}: ${assets.join(', ')}` : ''}`,
      node.status === 'ready' ? '' : 'node', node.name);
  }
  setToolsBusy(toolsBusy);
}
function renderToolsProgress(job) {
  if (!['managed-tools', 'media-tools'].includes(job.kind)) return;
  modelElement('tools-message').textContent = job.error || (job.phase === 'complete' && job.kind === 'managed-tools' && !job.step.includes('maintenance complete')
    ? tr('afterRepair') : localizeJobStep(job.step));
  if (job.phase !== 'running' && completedToolsJob !== job.id) {
    completedToolsJob = job.id; void loadManagedTools().catch(modelError);
  }
}
modelElement('tools-refresh').addEventListener('click', () => { void loadManagedTools().catch(modelError); });
void loadManagedTools().catch(modelError);
let renderedSetupLocale = '';
document.addEventListener('umbra-setup-language', () => {
  if (renderedSetupLocale === currentLanguage) return;
  renderedSetupLocale = currentLanguage;
  modelElement('model-search').placeholder = tr('searchModels');
  modelElement('model-search').setAttribute('aria-label', tr('searchModels'));
  renderModelFamilies();
  void loadManagedTools().catch(modelError);
});
