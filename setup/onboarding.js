// Guided Setup uses the same authenticated jobs as the maintenance tabs.
const ONBOARDING_COPY = {
  en: ['Guided setup', 'Set up Umbra Studio in order. Your progress is saved; completed steps can be checked again.', 'Language', 'ComfyUI', 'Training (optional)', 'Custom nodes', 'Support models', 'Generation models', 'Ready', 'Choose and save your language before continuing.', 'Install the generation engine and its managed Python environment.', 'AI Toolkit is needed only for training models. You can install it later.', 'Install the nodes used by Umbra workflows.', 'Choose support models for the workflows you want to use.', 'Choose a model family and review its files and licenses. Some families also need a separate checkpoint.', 'Check the installed files and nodes. This does not generate an image.', 'Back', 'Continue', 'Install ComfyUI', 'Install AI Toolkit', 'Skip training', 'Install custom nodes', 'Install selected files', 'Verify installed files', 'Check readiness', 'Open Umbra Studio', 'Complete', 'Pending', 'Working…', 'Selected download', 'Hugging Face token (optional, session only)', 'Accept gated model licenses on Hugging Face before downloading.', 'Manual download', 'Place {file} in {folder} inside your Umbra Studio folder. Setup does not download this model.', 'Review each model’s license before downloading; Umbra’s license does not grant model usage rights.', 'Umbra is ready for the selected configuration.', 'Resolve these items to finish setup:', 'Refresh status', 'Optional models can be added later in Models.', 'Check the current step before continuing.'],
  ja: ['セットアップガイド', '順番に Umbra Studio を設定します。進行状況は保存され、完了した手順も再確認できます。', '言語', 'ComfyUI', '学習（任意）', 'カスタムノード', '補助モデル', '生成モデル', '準備完了', '最初に言語を選択して保存してください。', '生成エンジンと専用 Python 環境をインストールします。', 'AI Toolkit はモデル学習にのみ必要です。後でインストールできます。', 'Umbra のワークフローで使用するノードをインストールします。', '使用するワークフローの補助モデルを選びます。', 'モデル系列を選び、ファイルとライセンスを確認してください。別途チェックポイントが必要な系列もあります。', 'ファイルとノードを確認します。画像は生成しません。', '戻る', '次へ', 'ComfyUI をインストール', 'AI Toolkit をインストール', '学習をスキップ', 'カスタムノードをインストール', '選択ファイルをインストール', 'ファイルを検証', '準備状況を確認', 'Umbra Studio を開く', '完了', '未完了', '処理中…', '選択したダウンロード', 'Hugging Face トークン（任意、このセッションのみ）', 'ダウンロード前に Hugging Face で制限付きモデルのライセンスに同意してください。', '手動ダウンロード', 'Umbra Studio フォルダー内の {folder} に {file} を配置してください。Setup はこのモデルをダウンロードしません。', 'ダウンロード前に各モデルのライセンスを確認してください。Umbra のライセンスはモデルの使用権を付与しません。', '選択した構成の準備が完了しました。', 'セットアップを完了するには以下を解決してください：', '状態を更新', '任意のモデルは後で Models から追加できます。', '次へ進む前に現在の手順を確認してください。'],
  'zh-CN': ['引导设置', '按顺序设置 Umbra Studio。进度会保存，已完成的步骤可以重新检查。', '语言', 'ComfyUI', '训练（可选）', '自定义节点', '辅助模型', '生成模型', '就绪', '请先选择并保存语言，然后继续。', '安装生成引擎及其专用 Python 环境。', 'AI Toolkit 仅在训练模型时需要，可稍后安装。', '安装 Umbra 工作流使用的节点。', '选择所需工作流的辅助模型。', '选择模型系列并查看文件和许可证。部分系列还需要单独的检查点。', '检查已安装的文件和节点，不会生成图像。', '返回', '继续', '安装 ComfyUI', '安装 AI Toolkit', '跳过训练', '安装自定义节点', '安装所选文件', '验证已安装文件', '检查就绪状态', '打开 Umbra Studio', '已完成', '待完成', '处理中…', '所选下载', 'Hugging Face 令牌（可选，仅本次会话）', '下载前请在 Hugging Face 接受受限模型的许可证。', '手动下载', '请将 {file} 放入 Umbra Studio 文件夹中的 {folder}。Setup 不会下载此模型。', '下载前请查看每个模型的许可证；Umbra 的许可证不授予模型使用权。', '所选配置已就绪。', '请解决以下事项以完成设置：', '刷新状态', '可选模型可稍后在 Models 中添加。', '继续前请检查当前步骤。'],
  ko: ['단계별 설정', 'Umbra Studio를 순서대로 설정합니다. 진행 상황은 저장되며 완료한 단계도 다시 확인할 수 있습니다.', '언어', 'ComfyUI', '학습 (선택 사항)', '사용자 노드', '보조 모델', '생성 모델', '준비 완료', '계속하기 전에 언어를 선택하고 저장하세요.', '생성 엔진과 전용 Python 환경을 설치합니다.', 'AI Toolkit은 모델 학습에만 필요합니다. 나중에 설치할 수 있습니다.', 'Umbra 워크플로에 필요한 노드를 설치합니다.', '사용할 워크플로의 보조 모델을 선택하세요.', '모델 계열을 선택하고 파일 및 라이선스를 확인하세요. 일부 계열은 별도 체크포인트가 필요합니다.', '설치한 파일과 노드를 확인합니다. 이미지를 생성하지 않습니다.', '뒤로', '계속', 'ComfyUI 설치', 'AI Toolkit 설치', '학습 건너뛰기', '사용자 노드 설치', '선택 파일 설치', '설치 파일 검증', '준비 상태 확인', 'Umbra Studio 열기', '완료', '대기', '작업 중…', '선택한 다운로드', 'Hugging Face 토큰 (선택 사항, 현재 세션만)', '다운로드 전에 Hugging Face에서 제한 모델의 라이선스에 동의하세요.', '수동 다운로드', 'Umbra Studio 폴더 안의 {folder}에 {file}을 넣으세요. Setup은 이 모델을 다운로드하지 않습니다.', '다운로드 전에 각 모델의 라이선스를 확인하세요. Umbra 라이선스는 모델 사용 권한을 부여하지 않습니다.', '선택한 구성의 준비가 완료되었습니다.', '설정을 완료하려면 다음 항목을 해결하세요:', '상태 새로고침', '선택 모델은 나중에 Models에서 추가할 수 있습니다.', '계속하기 전에 현재 단계를 확인하세요.'],
  de: ['Geführte Einrichtung', 'Umbra Studio Schritt für Schritt einrichten. Der Fortschritt wird gespeichert; abgeschlossene Schritte können erneut geprüft werden.', 'Sprache', 'ComfyUI', 'Training (optional)', 'Zusatz-Nodes', 'Hilfsmodelle', 'Generierungsmodelle', 'Bereit', 'Zuerst die Sprache auswählen und speichern.', 'Die Generierungs-Engine und ihre verwaltete Python-Umgebung installieren.', 'AI Toolkit wird nur zum Trainieren von Modellen benötigt und kann später installiert werden.', 'Die Nodes für Umbra-Workflows installieren.', 'Hilfsmodelle für die gewünschten Workflows auswählen.', 'Modellfamilie auswählen und Dateien sowie Lizenzen prüfen. Manche Familien benötigen einen zusätzlichen Checkpoint.', 'Installierte Dateien und Nodes prüfen. Dabei wird kein Bild generiert.', 'Zurück', 'Weiter', 'ComfyUI installieren', 'AI Toolkit installieren', 'Training überspringen', 'Zusatz-Nodes installieren', 'Ausgewählte Dateien installieren', 'Installierte Dateien prüfen', 'Bereitschaft prüfen', 'Umbra Studio öffnen', 'Abgeschlossen', 'Ausstehend', 'In Arbeit…', 'Ausgewählter Download', 'Hugging-Face-Token (optional, nur diese Sitzung)', 'Vor dem Download die Lizenzen zugangsbeschränkter Modelle auf Hugging Face akzeptieren.', 'Manueller Download', '{file} im Ordner {folder} innerhalb des Umbra-Studio-Ordners ablegen. Setup lädt dieses Modell nicht herunter.', 'Vor dem Download jede Modelllizenz prüfen; Umbras Lizenz gewährt keine Nutzungsrechte an Modellen.', 'Umbra ist für die gewählte Konfiguration bereit.', 'Diese Punkte müssen noch erledigt werden:', 'Status aktualisieren', 'Optionale Modelle können später unter Models ergänzt werden.', 'Vor dem Fortfahren den aktuellen Schritt prüfen.'],
};
const onboardingIds = ['language', 'comfyui', 'training', 'nodes', 'support', 'generation', 'ready'];
const onboardingMediaCopy = {
  en: ['Media tools', 'FFmpeg and ffprobe are ready.', 'FFmpeg or ffprobe is unavailable. Install the verified portable tools to finish setup.', 'Install / repair media tools', 'The download is verified against its published checksum before installation.'],
  ja: ['メディアツール', 'FFmpeg と ffprobe の準備が完了しました。', 'FFmpeg または ffprobe が利用できません。検証済みのポータブルツールをインストールして設定を完了してください。', 'メディアツールをインストール／修復', 'インストール前に公開チェックサムでダウンロードを検証します。'],
  'zh-CN': ['媒体工具', 'FFmpeg 和 ffprobe 已就绪。', 'FFmpeg 或 ffprobe 不可用。请安装经过验证的便携工具以完成设置。', '安装／修复媒体工具', '安装前会根据公布的校验和验证下载文件。'],
  ko: ['미디어 도구', 'FFmpeg 및 ffprobe가 준비되었습니다.', 'FFmpeg 또는 ffprobe를 사용할 수 없습니다. 검증된 휴대용 도구를 설치하여 설정을 완료하세요.', '미디어 도구 설치 / 복구', '설치 전에 공개된 체크섬으로 다운로드를 검증합니다.'],
  de: ['Medientools', 'FFmpeg und ffprobe sind bereit.', 'FFmpeg oder ffprobe ist nicht verfügbar. Die geprüften portablen Tools installieren, um die Einrichtung abzuschließen.', 'Medientools installieren / reparieren', 'Der Download wird vor der Installation anhand der veröffentlichten Prüfsumme geprüft.'],
};
for (const [locale, text] of Object.entries({ en: 'Installation verified. Launch managed ComfyUI from Umbra Studio.', ja: 'インストールを検証しました。Umbra Studio から管理対象の ComfyUI を起動してください。', 'zh-CN': '安装已验证。请从 Umbra Studio 启动托管的 ComfyUI。', ko: '설치가 검증되었습니다. Umbra Studio에서 관리되는 ComfyUI를 실행하세요.', de: 'Installation geprüft. Das verwaltete ComfyUI über Umbra Studio starten.' })) ONBOARDING_COPY[locale][35] = text;
const onboardingDownloadCopy = {
  en: 'Download or import a compatible generation checkpoint in Umbra Studio’s Model Manager, then reopen Setup. Checkpoint folder: Tools/ComfyUI/models/checkpoints/. Separate diffusion models: Tools/ComfyUI/models/diffusion_models/.',
  ja: 'Umbra Studio の Model Manager で互換性のある生成チェックポイントをダウンロードまたはインポートし、Setup を開き直してください。チェックポイント: Tools/ComfyUI/models/checkpoints/。単独の拡散モデル: Tools/ComfyUI/models/diffusion_models/。',
  'zh-CN': '请在 Umbra Studio 的 Model Manager 中下载或导入兼容的生成检查点，然后重新打开 Setup。检查点目录：Tools/ComfyUI/models/checkpoints/。独立扩散模型目录：Tools/ComfyUI/models/diffusion_models/。',
  ko: 'Umbra Studio의 Model Manager에서 호환 생성 체크포인트를 다운로드하거나 가져온 뒤 Setup을 다시 여세요. 체크포인트: Tools/ComfyUI/models/checkpoints/. 별도 확산 모델: Tools/ComfyUI/models/diffusion_models/.',
  de: 'Einen kompatiblen Generierungs-Checkpoint im Model Manager von Umbra Studio herunterladen oder importieren, danach Setup erneut öffnen. Checkpoints: Tools/ComfyUI/models/checkpoints/. Separate Diffusionsmodelle: Tools/ComfyUI/models/diffusion_models/.',
};
const onboardingCheckpointCopy = {
  en: 'Select a compatible generation checkpoint already installed in this Umbra folder. Only choose a checkpoint made for the selected model family.',
  ja: 'この Umbra フォルダーにインストール済みの互換性がある生成チェックポイントを選択してください。選択したモデル系列用のチェックポイントのみを選んでください。',
  'zh-CN': '选择此 Umbra 文件夹中已安装的兼容生成检查点。仅选择适用于所选模型系列的检查点。',
  ko: '이 Umbra 폴더에 설치된 호환 생성 체크포인트를 선택하세요. 선택한 모델 계열용 체크포인트만 선택하세요.',
  de: 'Einen kompatiblen Generierungs-Checkpoint aus diesem Umbra-Ordner auswählen. Nur einen zur gewählten Modellfamilie passenden Checkpoint verwenden.',
};
const ONBOARDING_UX = {
  en: ['{done} of 7 steps complete', 'Step {step} of 7', 'Already set up', 'This step is complete. Continue when you are ready.', 'Python repair required', 'ComfyUI still uses an older or unavailable Python environment. Stop ComfyUI in Umbra, then repair it here. Your models stay in place.', 'Repair ComfyUI', 'Selected files', 'File list and licenses', 'Download access (optional)', 'Installation details', 'Advanced', 'Individual repairs and additional models.', 'Setup progress is saved automatically.', 'Save and continue', 'Training is optional', 'Generate images without AI Toolkit. Install it only if you want to train models on this computer.', 'Check this step', 'Ready to verify', 'Verify your installation before launching. No test image will be generated.', 'Choose what to install', 'Select a model family', 'No download selected', 'Completed installation', 'Setup is in progress'],
  ja: ['7 ステップ中 {done} 完了', 'ステップ {step} / 7', '設定済み', 'このステップは完了しています。準備ができたら次へ進んでください。', 'Python の修復が必要です', 'ComfyUI の Python が古いか利用できません。Umbra で ComfyUI を停止してから修復してください。モデルは保持されます。', 'ComfyUI を修復', '選択したファイル', 'ファイルとライセンス', 'ダウンロード認証（任意）', 'インストールの詳細', '詳細設定', '個別の修復と追加モデル。', '進行状況は自動保存されます。', '保存して次へ', '学習機能は任意です', 'AI Toolkit がなくても画像を生成できます。この PC でモデルを学習する場合だけインストールしてください。', 'このステップを確認', '検証の準備ができました', '起動前にインストールを検証してください。テスト画像は生成しません。', 'インストール対象を選択', 'モデル系列を選択', 'ダウンロード未選択', 'インストール完了', 'セットアップ中'],
  'zh-CN': ['7 个步骤已完成 {done} 个', '第 {step} 步，共 7 步', '已设置', '此步骤已完成，准备好后可继续。', '需要修复 Python', 'ComfyUI 的 Python 环境过旧或不可用。请在 Umbra 中停止 ComfyUI 后修复。模型将保留。', '修复 ComfyUI', '所选文件', '文件列表和许可证', '下载凭据（可选）', '安装详情', '高级', '单独修复和其他模型。', '设置进度会自动保存。', '保存并继续', '训练为可选功能', '无需 AI Toolkit 即可生成图像。仅在此电脑上训练模型时才需安装。', '检查此步骤', '可以开始验证', '启动前请验证安装。不会生成测试图像。', '选择安装内容', '选择模型系列', '未选择下载', '安装完成', '正在设置'],
  ko: ['7단계 중 {done}단계 완료', '7단계 중 {step}단계', '설정 완료', '이 단계가 완료되었습니다. 준비되면 계속하세요.', 'Python 복구 필요', 'ComfyUI의 Python 환경이 오래되었거나 사용할 수 없습니다. Umbra에서 ComfyUI를 중지한 후 복구하세요. 모델은 보존됩니다.', 'ComfyUI 복구', '선택한 파일', '파일 목록 및 라이선스', '다운로드 인증 (선택)', '설치 세부 정보', '고급', '개별 복구 및 추가 모델.', '설정 진행 상황은 자동 저장됩니다.', '저장하고 계속', '학습은 선택 사항입니다', 'AI Toolkit 없이도 이미지를 생성할 수 있습니다. 이 컴퓨터에서 모델을 학습하려는 경우에만 설치하세요.', '이 단계 확인', '검증 준비 완료', '실행 전에 설치를 검증하세요. 테스트 이미지는 생성하지 않습니다.', '설치할 항목 선택', '모델 계열 선택', '다운로드 미선택', '설치 완료', '설정 진행 중'],
  de: ['{done} von 7 Schritten abgeschlossen', 'Schritt {step} von 7', 'Bereits eingerichtet', 'Dieser Schritt ist abgeschlossen. Fahren Sie fort, wenn Sie bereit sind.', 'Python-Reparatur erforderlich', 'ComfyUI verwendet eine alte oder nicht verfügbare Python-Umgebung. ComfyUI in Umbra stoppen und hier reparieren. Ihre Modelle bleiben erhalten.', 'ComfyUI reparieren', 'Ausgewählte Dateien', 'Dateiliste und Lizenzen', 'Download-Zugang (optional)', 'Installationsdetails', 'Erweitert', 'Einzelne Reparaturen und zusätzliche Modelle.', 'Der Einrichtungsfortschritt wird automatisch gespeichert.', 'Speichern und weiter', 'Training ist optional', 'Bilder lassen sich ohne AI Toolkit generieren. Nur installieren, wenn Sie auf diesem Computer Modelle trainieren möchten.', 'Diesen Schritt prüfen', 'Bereit zur Prüfung', 'Installation vor dem Start prüfen. Es wird kein Testbild erzeugt.', 'Installationsumfang wählen', 'Modellfamilie wählen', 'Kein Download ausgewählt', 'Installation abgeschlossen', 'Einrichtung läuft'],
};
const onboardingUx = (index, values = {}) => (ONBOARDING_UX[currentLanguage] || ONBOARDING_UX.en)[index].replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
for (const [locale, copy] of Object.entries(ONBOARDING_UX)) Object.assign(SETUP_TRANSLATIONS[locale], { advancedSetup: copy[11], advancedSetupHint: copy[12], setupProgressSaved: copy[13], saveLanguageContinue: copy[14] });
let onboardingFocusedStage = null;
let onboardingData = null;
let onboardingBusy = false;
let onboardingCompletedJob = '';
let onboardingLoading = null;
let onboardingToken = '';
const onboardingText = index => (ONBOARDING_COPY[document.getElementById('language')?.value] || ONBOARDING_COPY.en)[index];
const onboardingElement = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function onboardingButton(text, callback, disabled = false) {
  const node = onboardingElement('button', text, 'button'); node.type = 'button'; node.disabled = onboardingBusy || disabled;
  node.addEventListener('click', () => Promise.resolve().then(callback).catch(modelError)); return node;
}
async function saveOnboarding(patch) {
  await api('/api/onboarding', { method: 'POST', body: JSON.stringify(patch) });
  if (patch.stage !== undefined) onboardingFocusedStage = patch.stage;
  await loadOnboarding();
}
async function runOnboardingJob(path, body) {
  setBusy(true);
  try {
    const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
    if (body.hfToken) { onboardingToken = ''; const input = document.getElementById('onboarding-token'); if (input) input.value = ''; }
    renderJob(result.job); void poll();
  } catch (error) { setBusy(false); throw error; }
}
function onboardingPackSelection(packId, container, primary) {
  const pack = onboardingData.catalog?.packs?.find(item => item.id === packId);
  if (!pack) return;
  const key = packId === 'support' ? 'supportProfiles' : 'profiles';
  const selected = new Set(onboardingData.state[key] || []);
  const options = onboardingElement('div', undefined, 'model-families');
  for (const profile of pack.profiles) {
    if (packId === 'requirements' && !onboardingData.catalog.generationProfiles.includes(profile.id)) continue;
    const label = onboardingElement('label', undefined, 'model-family');
    const checkbox = document.createElement('input'); checkbox.type = packId === 'requirements' ? 'radio' : 'checkbox'; checkbox.name = `onboarding-${packId}`; checkbox.checked = selected.has(profile.id); checkbox.disabled = onboardingBusy;
    checkbox.addEventListener('change', () => {
      if (packId === 'requirements') selected.clear();
      checkbox.checked ? selected.add(profile.id) : selected.delete(profile.id);
      void saveOnboarding({ [key]: [...selected], ...(packId === 'requirements' ? { checkpoint: '' } : {}) }).catch(modelError);
    });
    const description = onboardingElement('div'); description.append(onboardingElement('strong', setupProfileLabel(profile, pack)), onboardingElement('p', setupProfileDescription(profile, pack)));
    label.append(checkbox, description); options.append(label);
  }
  const layout = onboardingElement('div', undefined, 'wizard-model-layout');
  const chooser = onboardingElement('div'); chooser.append(onboardingElement('h3', onboardingUx(packId === 'support' ? 20 : 21)), options);
  const review = onboardingElement('div', undefined, 'wizard-model-review'); review.append(onboardingElement('h3', onboardingUx(7))); layout.append(chooser, review); container.append(layout);
  const required = new Set(selected);
  const include = id => {
    for (const dependency of pack.profiles.find(profile => profile.id === id)?.requiresProfiles || []) {
      if (!required.has(dependency)) { required.add(dependency); include(dependency); }
    }
  };
  [...required].forEach(include);
  const files = pack.files.filter(file => file.profiles.some(id => required.has(id)));
  review.append(onboardingElement('p', `${onboardingText(29)}: ${files.length} · ${modelBytes(files.reduce((sum, file) => sum + file.bytes, 0))}`));
  const fileList = onboardingElement('div', undefined, 'model-files');
  for (const file of files) {
    const row = onboardingElement('div', file.destination, 'model-file');
    row.append(onboardingElement('small', `${modelBytes(file.bytes)} · ${tr(file.present ? 'presentFile' : 'missingFile')}`));
    for (const license of file.licenses || []) {
      const entry = onboardingElement(license.url ? 'a' : 'span', license.label);
      if (license.url) { entry.href = license.url; entry.target = '_blank'; entry.rel = 'noopener noreferrer'; }
      row.append(entry);
      if (license.notice) row.append(onboardingElement('small', license.notice));
    }
    fileList.append(row);
  }
  const filesDetail = onboardingElement('details'); filesDetail.append(onboardingElement('summary', onboardingUx(8)), fileList); review.append(onboardingElement('p', onboardingText(34)), filesDetail);
  for (const model of pack.manualModels || []) {
    const row = onboardingElement('div', undefined, 'model-file');
    const link = onboardingElement('a', `${model.purpose} · ${onboardingText(32)}`); link.href = model.reference; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link);
    for (const destination of model.destinations) {
      const separator = destination.lastIndexOf('/');
      row.append(onboardingElement('small', onboardingText(33).replace('{file}', destination.slice(separator + 1)).replace('{folder}', `Tools/ComfyUI/models/${destination.slice(0, separator + 1)}`)));
    }
    const manual = onboardingElement('details'); manual.append(onboardingElement('summary', `${model.purpose} · ${onboardingText(32)}`), row); review.append(manual);
  }
  if (packId === 'requirements') {
    const checkpoints = onboardingData.catalog?.checkpoints || [];
    if (!checkpoints.length) review.append(onboardingElement('p', onboardingDownloadCopy[document.getElementById('language')?.value] || onboardingDownloadCopy.en));
    if (checkpoints.length) {
      review.append(onboardingElement('p', onboardingCheckpointCopy[document.getElementById('language')?.value] || onboardingCheckpointCopy.en));
      const list = onboardingElement('div', undefined, 'model-families');
      for (const checkpoint of checkpoints) {
        const label = onboardingElement('label', undefined, 'model-family');
        const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'onboarding-checkpoint'; radio.checked = onboardingData.state.checkpoint === checkpoint.path; radio.disabled = onboardingBusy;
        radio.addEventListener('change', () => { if (radio.checked) void saveOnboarding({ checkpoint: checkpoint.path }).catch(modelError); });
        label.append(radio, onboardingElement('span', checkpoint.path)); list.append(label);
      }
      review.append(list);
    }
    const label = onboardingElement('label', onboardingText(30)); label.htmlFor = 'onboarding-token';
    const input = document.createElement('input'); input.id = 'onboarding-token'; input.type = 'password'; input.autocomplete = 'off'; input.value = onboardingToken;
    input.addEventListener('input', () => { onboardingToken = input.value; });
    const access = onboardingElement('details'); access.append(onboardingElement('summary', onboardingUx(9)), label, input, onboardingElement('p', onboardingText(31))); review.append(access);
  }
  const allPresent = files.length > 0 && files.every(file => file.present);
  primary(onboardingText(allPresent ? 23 : 22), () => runOnboardingJob('/api/install', { kind: packId, profiles: [...selected], check: allPresent, ...(packId === 'requirements' && onboardingToken ? { hfToken: onboardingToken } : {}) }), !selected.size);
  const checks = onboardingElement('details'); checks.append(onboardingElement('summary', onboardingUx(17)), onboardingButton(onboardingText(23), () => runOnboardingJob('/api/install', { kind: packId, profiles: [...selected], check: true }), !selected.size)); review.append(checks);
}
function renderOnboarding() {
  const host = document.getElementById('onboarding'); if (!host || !onboardingData) return;
  const languagePanel = document.getElementById('onboarding-language');
  const saveLanguage = document.getElementById('save-language');
  // Keep the original controls and listeners alive across wizard rerenders.
  if (languagePanel && host.contains(languagePanel)) host.before(languagePanel);
  if (saveLanguage && host.contains(saveLanguage)) languagePanel.append(saveLanguage);
  host.replaceChildren();
  const stage = onboardingFocusedStage ?? Math.max(0, Math.min(6, onboardingData.state.stage || 0));
  const detail = onboardingData.stages.find(entry => entry.id === onboardingIds[stage]);
  const complete = !!detail?.complete;
  const list = document.getElementById('setup-steps'); list.replaceChildren(); list.setAttribute('aria-label', onboardingText(0));
  document.getElementById('language-options').setAttribute('aria-label', onboardingText(2));
  document.getElementById('setup-step-summary').textContent = onboardingUx(0, { done: onboardingData.stages.filter(entry => entry.complete).length });
  onboardingIds.forEach((id, index) => {
    const done = !!onboardingData.stages.find(entry => entry.id === id)?.complete;
    const blocked = index > stage && onboardingIds.slice(0, index).some(prior => !onboardingData.stages.find(entry => entry.id === prior)?.complete);
    const item = onboardingElement('li');
    const button = onboardingButton('', () => { showSetupTab('general'); return saveOnboarding({ stage: index }); }, blocked);
    button.className = 'setup-step'; button.dataset.complete = String(done); button.dataset.stage = String(index);
    button.setAttribute('aria-current', index === stage ? 'step' : 'false');
    button.append(onboardingElement('span', done ? '✓' : String(index + 1), 'step-number'));
    const label = onboardingElement('span'); label.append(onboardingElement('strong', onboardingText(index + 2)), onboardingElement('small', onboardingText(done ? 26 : 27)));
    button.append(label); item.append(button); list.append(item);
  });
  const heading = onboardingElement('div', undefined, 'wizard-heading');
  heading.append(onboardingElement('div', onboardingUx(1, { step: stage + 1 }), 'eyebrow'), onboardingElement('h2', onboardingText(stage + 2)), onboardingElement('p', onboardingText(stage + 9)));
  host.append(heading);
  const content = onboardingElement('section'); content.id = 'onboarding-stage'; content.setAttribute('aria-label', onboardingText(stage + 2));
  const actions = onboardingElement('div', undefined, 'wizard-actions');
  const secondary = onboardingElement('div', undefined, 'secondary-actions');
  if (stage > 0) secondary.append(onboardingButton(onboardingText(16), () => saveOnboarding({ stage: stage - 1 })));
  actions.append(secondary);
  const primary = (label, callback, disabled = false) => { const button = onboardingButton(label, callback, disabled); button.classList.add('primary'); button.dataset.wizardPrimary = 'true'; actions.append(button); return button; };
  if (languagePanel) { languagePanel.hidden = stage !== 0; if (stage === 0) content.append(languagePanel); }
  if (stage === 0) {
    saveLanguage.dataset.i18n = 'saveLanguageContinue'; saveLanguage.textContent = onboardingUx(14); saveLanguage.disabled = onboardingBusy; saveLanguage.dataset.wizardPrimary = 'true'; actions.append(saveLanguage);
  } else if (complete && stage < 6) {
    const notice = onboardingElement('div', undefined, 'wizard-state'); notice.append(onboardingElement('div', onboardingUx(2)), onboardingElement('p', onboardingUx(3))); content.append(notice);
    primary(onboardingText(17), () => saveOnboarding({ stage: stage + 1 }));
  } else if (stage === 1) {
    const repair = onboardingData.python?.installed && onboardingData.python.upgradeAvailable;
    const card = onboardingElement('div', undefined, repair ? 'wizard-state pending' : 'wizard-card');
    card.append(onboardingElement('strong', repair ? onboardingUx(4) : onboardingText(3)), onboardingElement('p', repair ? onboardingUx(5) : onboardingText(10)));
    const technical = onboardingElement('details'); technical.append(onboardingElement('summary', onboardingUx(10)), onboardingElement('p', `Python ${onboardingData.python?.version || tr('unavailable')} → ${onboardingData.python?.target || '3.13'}`)); card.append(technical); content.append(card);
    primary(repair ? tr('updatePython') : onboardingData.python?.installed ? onboardingUx(6) : onboardingText(18), async () => {
      if (repair && !window.confirm(tr('pythonUpgradeWarning'))) return;
      await runOnboardingJob('/api/tools/action', { tool: 'comfyui', action: repair ? 'update_python' : 'install_core' });
    });
  } else if (stage === 2) {
    const card = onboardingElement('div', undefined, 'wizard-card'); card.append(onboardingElement('h3', onboardingUx(15)), onboardingElement('p', onboardingUx(16))); content.append(card);
    const repair = onboardingData.trainingPython?.installed && onboardingData.trainingPython.upgradeAvailable;
    secondary.append(onboardingButton(onboardingText(20), async () => { await saveOnboarding({ training: 'skip', stage: 3 }); }));
    primary(repair ? tr('updateTrainingPython') : onboardingText(19), async () => {
      if (repair && !window.confirm(tr('trainingPythonWarning'))) return;
      await saveOnboarding({ training: 'install' });
      await runOnboardingJob('/api/tools/action', { tool: 'aitoolkit', action: repair ? 'update_python' : 'install' });
    });
  } else if (stage === 3) {
    const card = onboardingElement('div', undefined, 'wizard-card'); card.append(onboardingElement('h3', onboardingText(5)), onboardingElement('p', onboardingText(12))); content.append(card);
    primary(onboardingText(21), () => runOnboardingJob('/api/tools/action', { tool: 'comfyui', action: 'nodes_only' }));
  } else if (stage === 4 || stage === 5) onboardingPackSelection(stage === 4 ? 'support' : 'requirements', content, primary);
  else if (stage === 6) {
    const checks = onboardingElement('ul', undefined, 'wizard-checks');
    onboardingData.stages.slice(0, 6).forEach((entry, index) => { const item = onboardingElement('li', `${entry.complete ? '✓' : '○'} ${onboardingText(index + 2)}`); item.append(onboardingElement('small', onboardingText(entry.complete ? 26 : 27))); checks.append(item); });
    const media = onboardingData.media; const mediaCopy = onboardingMediaCopy[currentLanguage] || onboardingMediaCopy.en;
    const item = onboardingElement('li', `${media?.ready ? '✓' : '○'} ${mediaCopy[0]}`); item.append(onboardingElement('small', mediaCopy[media?.ready ? 1 : 2])); checks.append(item); content.append(checks);
    if (!media?.ready && media?.supported) primary(mediaCopy[3], () => runOnboardingJob('/api/dependencies/action', { kind: 'media', target: 'FFmpeg' }));
    else if (onboardingData.ready) { content.append(onboardingElement('p', onboardingText(35))); primary(onboardingText(25), () => document.getElementById('launch').click()); }
    else { content.append(onboardingElement('p', onboardingUx(19))); primary(onboardingText(24), () => runOnboardingJob('/api/onboarding/verify', {})); }
    const diagnostics = onboardingElement('details'); diagnostics.append(onboardingElement('summary', onboardingUx(10)));
    const issues = onboardingElement('ul'); for (const issue of onboardingData.issues || []) issues.append(onboardingElement('li', issue)); diagnostics.append(issues); content.append(diagnostics);
  }
  host.append(content, actions);
  host.setAttribute('aria-busy', String(onboardingBusy));
  document.getElementById('setup-footer-status').textContent = onboardingBusy ? onboardingText(28) : onboardingData.ready ? onboardingUx(23) : onboardingUx(13);
}
function setOnboardingBusy(busy) { if (onboardingBusy !== busy) { onboardingBusy = busy; renderOnboarding(); } }
function loadOnboarding() {
  if (onboardingLoading) return onboardingLoading;
  onboardingLoading = api('/api/onboarding').then(result => { onboardingData = result;
    if (onboardingFocusedStage === null) {
      const firstPending = result.stages.findIndex(entry => !entry.complete);
      onboardingFocusedStage = !result.state.languageSaved ? 0 : firstPending < 0 ? 6 : firstPending;
    }
    renderOnboarding(); }).finally(() => { onboardingLoading = null; });
  return onboardingLoading;
}
function renderOnboardingProgress(job) {
  if (job && job.phase !== 'running' && onboardingCompletedJob !== job.id) {
    onboardingCompletedJob = job.id; void loadOnboarding().catch(modelError);
  }
}
document.getElementById('language')?.addEventListener('change', renderOnboarding);
void loadOnboarding().catch(modelError);
