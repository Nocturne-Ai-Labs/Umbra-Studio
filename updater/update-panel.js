import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { compareUmbraVersions } from '../shared/appUpdate.ts';

(() => {

  const panel = document.getElementById('umbra-updates');

  if (!panel) return;

  const el = id => document.getElementById(`updates-${id}`);

  const token = new URLSearchParams(location.search).get('token') || '';

  const activePhases = new Set(['checking', 'downloading', 'staged', 'stopping', 'extracting', 'applying', 'updating_nodes', 'restarting']);

  const translations = {"en":{"title":"Umbra Studio updates","check":"Check for updates","beta":"Include beta releases","install":"Install selected update","launch":"Launch Umbra Studio","notice":"Save your work before installing. Umbra Studio and its managed tools close during the update. Your models and user files are preserved.","reading":"Reading installed version…","installed":"Installed version: {version}","checking":"Checking for updates…","unknown":"Unknown","choose":"Select a newer release to install.","none":"No newer releases are available.","metadata":"The installed version could not be verified. Restore build metadata before updating.","complete":"Update installed. You can launch Umbra Studio.","failed":"Update failed. Review the progress details and retry.","working":"Working…","confirm":"Install {tag}? Umbra Studio and its managed tools will close. Save your work first.","contact":"Could not contact Umbra Setup.","launchFailed":"Umbra Studio could not launch.","idle":"Ready","downloading":"Downloading update","staged":"Download verified","stopping":"Closing Umbra Studio","extracting":"Extracting update","applying":"Installing update","updating_nodes":"Updating custom nodes","restarting":"Finishing update"},"ja":{"title":"Umbra Studio の更新","check":"更新を確認","beta":"ベータ版を含める","install":"選択した更新をインストール","launch":"Umbra Studio を起動","notice":"インストール前に作業を保存してください。更新中は Umbra Studio と管理ツールが終了します。モデルとユーザーファイルは保持されます。","reading":"インストール済みバージョンを確認中…","installed":"インストール済み: {version}","checking":"更新を確認中…","unknown":"不明","choose":"新しいリリースを選択してください。","none":"新しいリリースはありません。","metadata":"バージョンを確認できません。更新前にビルド情報を復元してください。","complete":"更新完了。Umbra Studio を起動できます。","failed":"更新に失敗しました。詳細を確認して再試行してください。","working":"処理中…","confirm":"{tag} をインストールしますか？Umbra Studio と管理ツールが終了します。先に作業を保存してください。","contact":"Umbra Setup に接続できません。","launchFailed":"Umbra Studio を起動できません。","idle":"準備完了","downloading":"更新をダウンロード中","staged":"ダウンロード検証済み","stopping":"Umbra Studio を終了中","extracting":"更新を展開中","applying":"更新をインストール中","updating_nodes":"カスタムノードを更新中","restarting":"更新を完了中"},"zh-CN":{"title":"Umbra Studio 更新","check":"检查更新","beta":"包括测试版","install":"安装所选更新","launch":"启动 Umbra Studio","notice":"安装前请保存工作。更新期间 Umbra Studio 及其托管工具将关闭。模型和用户文件会保留。","reading":"正在读取已安装版本…","installed":"已安装版本：{version}","checking":"正在检查更新…","unknown":"未知","choose":"请选择较新的版本进行安装。","none":"没有可用的新版本。","metadata":"无法验证已安装版本。请先恢复构建信息再更新。","complete":"更新已安装。现在可以启动 Umbra Studio。","failed":"更新失败。请检查进度详情并重试。","working":"正在处理…","confirm":"安装 {tag}？Umbra Studio 及其托管工具将关闭。请先保存工作。","contact":"无法连接 Umbra Setup。","launchFailed":"无法启动 Umbra Studio。","idle":"就绪","downloading":"正在下载更新","staged":"下载已验证","stopping":"正在关闭 Umbra Studio","extracting":"正在解压更新","applying":"正在安装更新","updating_nodes":"正在更新自定义节点","restarting":"正在完成更新"},"ko":{"title":"Umbra Studio 업데이트","check":"업데이트 확인","beta":"베타 버전 포함","install":"선택한 업데이트 설치","launch":"Umbra Studio 실행","notice":"설치 전에 작업을 저장하세요. 업데이트 중에는 Umbra Studio와 관리 도구가 종료됩니다. 모델과 사용자 파일은 유지됩니다.","reading":"설치된 버전 확인 중…","installed":"설치된 버전: {version}","checking":"업데이트 확인 중…","unknown":"알 수 없음","choose":"설치할 최신 릴리스를 선택하세요.","none":"새 릴리스가 없습니다.","metadata":"설치된 버전을 확인할 수 없습니다. 업데이트 전에 빌드 정보를 복원하세요.","complete":"업데이트가 설치되었습니다. Umbra Studio를 실행할 수 있습니다.","failed":"업데이트 실패. 진행 상세 정보를 확인하고 다시 시도하세요.","working":"처리 중…","confirm":"{tag}을 설치할까요? Umbra Studio와 관리 도구가 종료됩니다. 먼저 작업을 저장하세요.","contact":"Umbra Setup에 연결할 수 없습니다.","launchFailed":"Umbra Studio를 실행할 수 없습니다.","idle":"준비 완료","downloading":"업데이트 다운로드 중","staged":"다운로드 검증 완료","stopping":"Umbra Studio 종료 중","extracting":"업데이트 압축 해제 중","applying":"업데이트 설치 중","updating_nodes":"사용자 정의 노드 업데이트 중","restarting":"업데이트 마무리 중"},"de":{"title":"Umbra Studio aktualisieren","check":"Nach Updates suchen","beta":"Betaversionen einbeziehen","install":"Ausgewähltes Update installieren","launch":"Umbra Studio starten","notice":"Speichern Sie Ihre Arbeit vor der Installation. Umbra Studio und seine verwalteten Werkzeuge werden während des Updates geschlossen. Modelle und Benutzerdaten bleiben erhalten.","reading":"Installierte Version wird gelesen…","installed":"Installierte Version: {version}","checking":"Updates werden gesucht…","unknown":"Unbekannt","choose":"Wählen Sie eine neuere Version zur Installation.","none":"Keine neueren Versionen verfügbar.","metadata":"Die installierte Version konnte nicht geprüft werden. Stellen Sie vor dem Update die Buildinformationen wieder her.","complete":"Update installiert. Sie können Umbra Studio starten.","failed":"Update fehlgeschlagen. Prüfen Sie die Fortschrittsdetails und versuchen Sie es erneut.","working":"Wird bearbeitet…","confirm":"{tag} installieren? Umbra Studio und seine Werkzeuge werden geschlossen. Speichern Sie zuerst Ihre Arbeit.","contact":"Umbra Setup ist nicht erreichbar.","launchFailed":"Umbra Studio konnte nicht gestartet werden.","idle":"Bereit","downloading":"Update wird heruntergeladen","staged":"Download geprüft","stopping":"Umbra Studio wird geschlossen","extracting":"Update wird entpackt","applying":"Update wird installiert","updating_nodes":"Benutzerdefinierte Knoten werden aktualisiert","restarting":"Update wird abgeschlossen"}};
  const labels = {
    en: { versions:'Available versions', notes:'Release notes', installedLabel:'Installed', targetLabel:'Selected version', github:'View on GitHub', noNotes:'No patch notes were provided.', select:'Select a release', installedTag:'Installed', older:'Older release', newerOnly:'Select a newer version to install. You can read notes for any release.' },
    ja: { versions:'利用可能なバージョン', notes:'リリースノート', installedLabel:'インストール済み', targetLabel:'選択したバージョン', github:'GitHubで表示', noNotes:'リリースノートはありません。', select:'リリースを選択', installedTag:'インストール済み', older:'以前のリリース', newerOnly:'更新には新しいバージョンを選択してください。すべてのリリースのノートを確認できます。' },
    'zh-CN': { versions:'可用版本', notes:'发行说明', installedLabel:'已安装', targetLabel:'所选版本', github:'在 GitHub 上查看', noNotes:'未提供发行说明。', select:'选择发行版本', installedTag:'已安装', older:'较早版本', newerOnly:'请选择较新的版本进行安装。所有版本的说明均可阅读。' },
    ko: { versions:'사용 가능한 버전', notes:'릴리스 노트', installedLabel:'설치됨', targetLabel:'선택한 버전', github:'GitHub에서 보기', noNotes:'릴리스 노트가 없습니다.', select:'릴리스 선택', installedTag:'설치됨', older:'이전 릴리스', newerOnly:'설치하려면 새 버전을 선택하세요. 모든 릴리스 노트를 읽을 수 있습니다.' },
    de: { versions:'Verfügbare Versionen', notes:'Versionshinweise', installedLabel:'Installiert', targetLabel:'Ausgewählte Version', github:'Auf GitHub ansehen', noNotes:'Keine Versionshinweise vorhanden.', select:'Version auswählen', installedTag:'Installiert', older:'Ältere Version', newerOnly:'Wählen Sie eine neuere Version zur Installation. Hinweise aller Versionen sind lesbar.' },
  };
  for (const [locale, values] of Object.entries(labels)) Object.assign(translations[locale], values);
  let language = 'en';
  const t = (key, values = {}) => {
    let result = (translations[language] || translations.en)[key] || translations.en[key] || key;
    for (const [name, value] of Object.entries(values)) result = result.replace(`{${name}}`, String(value));
    return result;
  };
  function translate() {
    const requested = document.getElementById('language')?.value || document.documentElement.lang;
    language = translations[requested] ? requested : 'en';
    for (const [id, key] of Object.entries({title:'title',refresh:'check',beta:'beta',install:'install',launch:'launch',notice:'notice'})) el(id).textContent = t(key);
    for (const [id, key] of Object.entries({'list-title':'versions','notes-title':'notes','installed-label':'installedLabel','target-label':'targetLabel',github:'github'})) el(id).textContent = t(key);
    if (state.phase) el('phase').textContent = t(state.phase === 'complete' ? 'complete' : state.phase === 'failed' ? 'failed' : state.phase);
    updateReleaseLabels();
    if (!selected) el('selected-name').textContent = t('select');
  }
  let selected = null;

  let busy = false;
  let setupBusy = false;

  let launching = false;

  let releasesLoading = false;

  let state = { phase: 'idle' };

  let canInstall = false;
  let currentVersion = '0.0.0';
  let releases = [];
  let releasesLoaded = false;

  function updateReleaseLabels() {
    el('installed-version').textContent = `v${currentVersion}`;
    for (const button of el('releases').querySelectorAll('button')) {
      const release = releases.find(entry => entry.tag === button.dataset.tag);
      const comparison = compareUmbraVersions(release.version, currentVersion);
      button.querySelector('strong').textContent = `v${release.version}${comparison === 0 ? ` · ${t('installedTag')}` : ''}`;
      button.querySelector('small').textContent = [release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : '', comparison < 0 ? t('older') : release.channel === 'prerelease' ? t('beta') : ''].filter(Boolean).join(' · ');
    }
    el('selection-hint').textContent = selected && compareUmbraVersions(selected.version, currentVersion) <= 0 ? t('newerOnly') : '';
  }

  function selectRelease(release) {
    selected = release;
    el('selected-version').textContent = `Umbra Studio v${release.version}`;
    el('selected-name').textContent = release.name || release.tag;
    el('target-version').textContent = `v${release.version}`;
    el('selected-meta').textContent = [release.packageName, bytes(release.packageBytes), release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : ''].filter(Boolean).join(' · ');
    const url = /^https:\/\/github\.com\/Nocturne-Ai-Labs\/Umbra-Studio\/releases\//i.test(release.releaseUrl || '') ? release.releaseUrl : '';
    el('github').hidden = !url;
    if (url) el('github').href = url; else el('github').removeAttribute('href');
    const fragment = DOMPurify.sanitize(marked.parse(release.notes || t('noNotes'), { gfm: true, breaks: false }), {
      USE_PROFILES: { html: true }, RETURN_DOM_FRAGMENT: true,
      FORBID_TAGS: ['style', 'form', 'button', 'img', 'video', 'audio', 'link'], FORBID_ATTR: ['style', 'id', 'name'],
    });
    for (const link of fragment.querySelectorAll('a')) {
      try {
        const target = new URL(link.getAttribute('href') || '', url || 'https://github.com/Nocturne-Ai-Labs/Umbra-Studio/');
        if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported link');
        link.href = target.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      } catch { link.removeAttribute('href'); }
    }
    for (const input of fragment.querySelectorAll('input')) { if (input.type !== 'checkbox') input.remove(); else input.disabled = true; }
    el('notes').replaceChildren(fragment);
    for (const button of el('releases').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.tag === release.tag));
    updateReleaseLabels(); controls();
  }

  const bytes = value => {

    const amount = Number(value) || 0;

    if (amount >= 1024 ** 3) return `${(amount / 1024 ** 3).toFixed(2)} GB`;

    return `${(amount / 1024 ** 2).toFixed(1)} MB`;

  };

  const message = (text, error = false) => { el('message').textContent = text; el('message').dataset.error = String(error); };

  async function api(path, body) {

    const response = await fetch(`/api/updates/${path}`, {

      method: body === undefined ? 'GET' : 'POST',

      headers: { 'x-umbra-setup-token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },

      ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store',

    });

    const data = await response.json();

    if (!response.ok || data.success === false) throw new Error(data.error || t('contact'));

    return data;

  }

  function controls() {

    el('install').disabled = !selected || !canInstall || compareUmbraVersions(selected.version, currentVersion) <= 0 || busy || setupBusy || releasesLoading;

    el('refresh').disabled = busy || setupBusy || releasesLoading;

    el('prerelease').disabled = busy || setupBusy || releasesLoading;

    el('launch').hidden = state.phase !== 'complete';

    el('launch').disabled = busy || setupBusy;

    for (const button of el('releases').querySelectorAll('button')) button.disabled = busy || setupBusy;

  }

  async function loadReleases() {

    if (releasesLoading || busy) return;

    releasesLoading = true; controls(); message(t('checking'));

    try {

      const data = await api(`releases?refresh=true${el('prerelease').checked ? '&channel=prerelease' : ''}`);

      canInstall = data.installedVersionVerified === true;

      el('version').textContent = t('installed', { version: data.currentVersion || t('unknown') });

      currentVersion = data.currentVersion || currentVersion;
      const previousTag = selected?.tag;
      selected = null; el('releases').replaceChildren();

      releases = data.releases || [];

      for (const release of releases) {

        const button = document.createElement('button'); button.type = 'button'; button.dataset.tag = release.tag; button.setAttribute('aria-pressed', 'false');

        const label = document.createElement('strong'); label.textContent = `v${release.version}`;

        const notes = document.createElement('small');

        button.append(label, notes);

        button.addEventListener('click', () => {

          selectRelease(release);

        });

        el('releases').append(button);

      }

      const preferred = releases.find(entry => entry.tag === previousTag) || releases.find(entry => compareUmbraVersions(entry.version, currentVersion) > 0) || releases[0];
      if (preferred) selectRelease(preferred);
      else { el('notes').textContent = t('none'); el('selected-name').textContent = t('select'); el('selected-meta').textContent = ''; el('selected-version').textContent = 'Umbra Studio'; el('target-version').textContent = '—'; el('github').hidden = true; updateReleaseLabels(); }
      releasesLoaded = true;

      message(!canInstall ? t('metadata') : releases.length ? t('choose') : t('none'));

    } catch (error) { message(error.message, true); }

    finally { releasesLoading = false; controls(); }

  }

  function renderState(data) {

    state = data.state || { phase: 'idle' };
    currentVersion = data.currentVersion || state.currentVersion || currentVersion;
    updateReleaseLabels();

    busy = activePhases.has(state.phase) || launching;

    el('version').textContent = t('installed', { version: data.currentVersion || state.currentVersion || t('unknown') });

    el('progress').hidden = state.phase === 'idle';

    el('phase').textContent = t(state.phase === 'complete' ? 'complete' : state.phase === 'failed' ? 'failed' : state.phase);

    const total = Number(state.totalBytes) || 0;

    const done = Math.max(0, Number(state.processedBytes) || 0);

    const percentage = state.phase === 'complete' ? 100 : state.phase === 'downloading' && total > 0 ? Math.min(100, Math.round(done / total * 100)) : null;

    if (percentage === null) el('progress-bar').removeAttribute('value'); else el('progress-bar').value = percentage;

    el('percent').textContent = percentage === null ? t('working') : `${percentage}%`;

    el('bytes').textContent = state.phase === 'downloading' && total > 0 ? `${bytes(done)} / ${bytes(total)}` : '';

    el('item').textContent = state.currentItem || '';

    el('warning').textContent = [state.error, state.warning].filter(Boolean).join(' ');

    if (state.phase === 'complete') message(t('complete'));

    if (state.phase === 'failed') message(state.error || t('failed'), true);

    document.dispatchEvent(new CustomEvent('umbra-update-busy', { detail: { busy } }));

    controls();

  }

  let polling = false;

  async function poll() {

    if (polling) return; polling = true;

    try {

      renderState(await api('state'));

      if (launching) {

        const result = await api('relaunch-state');

        if (result.phase === 'ready') { await api('close', {}); location.assign(result.origin); }

        if (result.phase === 'failed') { launching = false; busy = false; message(result.error || t('launchFailed'), true); controls(); }

      }

    } catch (error) { message(error.message, true); }

    finally { polling = false; }

  }

  el('refresh').addEventListener('click', () => void loadReleases());

  el('prerelease').addEventListener('change', () => void loadReleases());

  el('install').addEventListener('click', async () => {

    if (!selected || busy) return;

    if (!confirm(t('confirm', { tag: selected.tag }))) return;

    busy = true; controls();

    try { await api('update', { tag: selected.tag, includePrerelease: el('prerelease').checked }); await poll(); }

    catch (error) { busy = false; message(error.message, true); controls(); }

  });

  el('launch').addEventListener('click', async () => {

    launching = true; busy = true; controls();

    try { await api('relaunch', {}); await poll(); }

    catch (error) { launching = false; busy = false; message(error.message, true); controls(); }

  });

  document.addEventListener('umbra-setup-busy', event => { setupBusy = event.detail.busy === true; controls(); });
  translate();
  document.getElementById('language')?.addEventListener('change', translate);
  document.addEventListener('umbra-setup-language', translate);
  void poll();
  el('prerelease').checked = true;
  document.getElementById('tab-updates')?.addEventListener('click', () => { if (!releasesLoaded) void loadReleases(); });
  if (new URLSearchParams(location.search).get('tab') === 'updates') void loadReleases();

  // Checking is explicit: opening Setup never starts a release download or installation.

  setInterval(() => void poll(), 1000);

})();
