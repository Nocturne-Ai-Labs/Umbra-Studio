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

let modelCatalog = null;
let modelBusy = false;
let modelPack = new URLSearchParams(location.search).get('pack') === 'support' ? 'support' : 'requirements';
const modelSelections = {
  requirements: new Set((new URLSearchParams(location.search).get('profiles') || '').split(',').filter(id => /^[a-z0-9-]{1,64}$/.test(id))),
  support: new Set(['core']),
};
let completedModelJob = '';
const modelElement = id => document.getElementById(id);
document.querySelector('main').insertBefore(progress, modelElement('general-panel'));
const modelBytes = value => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
function modelError(error) { status.textContent = error.message; status.classList.add('error'); }

function showSetupTab(tab) {
  ['general', 'models', 'tools'].forEach(id => {
    modelElement(`${id}-panel`).hidden = tab !== id;
    modelElement(`tab-${id}`).setAttribute('aria-selected', String(tab === id));
    modelElement(`tab-${id}`).tabIndex = tab === id ? 0 : -1;
  });
}
const setupTabs = ['general', 'tools', 'models'];
setupTabs.forEach(tab => {
  modelElement(`tab-${tab}`).addEventListener('click', () => showSetupTab(tab));
  modelElement(`tab-${tab}`).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? setupTabs[0] : event.key === 'End' ? setupTabs.at(-1)
      : setupTabs[(setupTabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : setupTabs.length - 1)) % setupTabs.length];
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
    link.textContent = `${model.purpose} — ${new URL(model.reference).hostname === 'civitai.com' ? 'Download on Civitai' : 'Manual download'}`;
    const detail = document.createElement('small');
    detail.textContent = model.destinations.map(destination => {
      const separator = destination.lastIndexOf('/');
      return `Place ${destination.slice(separator + 1)} in Tools/ComfyUI/models/${destination.slice(0, separator + 1)} inside your Umbra Studio folder.`;
    }).join(' ') + ' Not installed by Setup.';
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
  list.querySelectorAll('input').forEach(checkbox => { checkbox.checked = modelSelections.requirements.has(checkbox.dataset.profile); });
}
function renderModelFamilies() {
  const list = modelElement('model-families'); list.replaceChildren();
  const query = modelElement('model-search').value.toLowerCase();
  for (const profile of currentModelPack()?.profiles || []) {
    if (!`${profile.label} ${profile.description}`.toLowerCase().includes(query)) continue;
    const label = document.createElement('label'); label.className = 'model-family';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = modelSelections[modelPack].has(profile.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) modelSelections[modelPack].add(profile.id); else modelSelections[modelPack].delete(profile.id);
      renderModelReview();
    });
    const text = document.createElement('div'); const title = document.createElement('strong'); title.textContent = profile.label;
    const description = document.createElement('p'); description.textContent = profile.description;
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
    modelElement('model-transfer').textContent = `${event.stage || ''}: ${event.file || ''} | ${modelBytes(event.bytes || 0)} / ${modelBytes(event.totalBytes || 0)} | ${event.completedFiles || 0}/${event.totalFiles || 0} ${tr('filesLabel')}`;
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
  modelElement('tools-list').querySelectorAll('button').forEach(button => { button.disabled = busy; });
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
}
async function reviewAndInstallManagedPlan(plan, review = true) {
  const helpers = plan.featureId === 'all-managed-dependencies' ? ['Python Helpers (including pandas), WD/PixAI taggers, natural-language tagging/captioning (Qwen2-VL), detailers, SAM, upscaling/interpolation, and CLIP/SigLIP vision support', `Shared model downloads: ${((plan.sharedSupport?.bytes || 0) / 1024 ** 3).toFixed(2)} GiB plus Python packages; valid existing files are kept. Generation checkpoints and model-family downloads are separate.`] : [];
  if (review && !window.confirm([plan.label, ...helpers, ...plan.steps.map(step => `${step.target}: ${step.pins.join(', ')}`), ...plan.holds,
    'Install / verify this bundle? Generation model-family downloads are separate. Local changes are preserved. Restart and runtime preflight follow tool repairs.'].join('\n\n'))) return false;
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
    if (!plan) throw new Error('This build has no declared dependency plan. Refresh Tools and review the setup log.');
    if (!await reviewAndInstallManagedPlan(plan, false)) setBusy(false);
  } catch (error) { modelError(error); setBusy(false); }
});
document.querySelectorAll('[data-setup-tab]').forEach(button => button.addEventListener('click', () => showSetupTab(button.dataset.setupTab)));

async function loadManagedTools() {
  const dependencies = await api('/api/dependencies');
  modelElement('shared-support-size').textContent = `Shared support models: ${(dependencies.sharedSupport.bytes / 1024 ** 3).toFixed(2)} GiB, plus Python packages. Existing valid files are verified and kept.`;
  modelElement('tools-list').replaceChildren();
  modelElement('tools-summary').textContent = tr(dependencies.features.length ? 'toolsHint' : 'noManagedTools');
  const media = dependencies.mediaTools;
  const helpers = dependencies.pythonHelpers;
  if (helpers) {
    toolsRow('CPU Python helpers', `${helpers.ready ? 'Verified' : 'Unavailable'} | Python ${helpers.pythonVersion} | ${helpers.packages.map(item => `${item.name} ${item.version}`).join(', ')}. ${helpers.detail}`);
  }
  if (media) {
    toolsRow('FFmpeg / ffprobe', `${media.tools.map(tool => `${tool.tool}: ${tool.ready ? tool.version : 'Missing or unavailable'}`).join(' | ')}. ${media.detail} Repair download: ${Math.round(media.downloadBytes / 1024 / 1024)} MiB (${media.license}).`,
      media.supported ? 'media' : '', 'FFmpeg', null, media.ready ? 'Verify media tools' : 'Install / repair media tools');
  }
  const core = dependencies.comfyui;
  const isOutdated = (version, minimum) => {
    if (!minimum) return false;
    const installed = String(version || '0').split('.').map(Number), required = minimum.split('.').map(Number);
    return required.some((part, index) => installed.slice(0, index).every((value, i) => value === required[i]) && (installed[index] || 0) < part);
  };
  const outdated = isOutdated(core.version, core.minimumRequired) || isOutdated(core.frontendVersion, core.minimumFrontendRequired);
  toolsRow('ComfyUI', `${core.version || 'Missing'}${core.minimumRequired ? ` | Required ${core.minimumRequired}+` : ''} | Frontend ${core.frontendVersion || 'unverified'}${core.minimumFrontendRequired ? ` | Required ${core.minimumFrontendRequired}+` : ''}`,
    !core.installed || outdated ? 'comfyui' : '', 'ComfyUI');
  const suites = new Map();
  const background = dependencies.backgroundCompatibility;
  if (background && (background.status !== 'not-needed' || background.versions['transparent-background'])) {
    toolsRow('Background removal compatibility', `${background.versions['transparent-background'] || 'Unverified'} | ${background.detail}`);
  }
  for (const plan of dependencies.repairPlans || []) {
    if (plan.featureId === 'all-managed-dependencies') plan.sharedSupport = dependencies.sharedSupport;
    const saved = dependencies.repairState?.featureId === plan.featureId ? dependencies.repairState : null;
    toolsRow(plan.label, saved ? `${saved.phase} | ${saved.completedTargets.length} steps completed | ${saved.error || ''}` : `${plan.steps.length} managed repair steps | Review suites and pins`, '', '',
      () => reviewAndInstallManagedPlan(plan), saved && ['held', 'failed'].includes(saved.phase) ? 'Review / Resume' : 'Review repair');
    if (saved && ['restart-required', 'preflight-held', 'preflight-passed'].includes(saved.phase)) {
      toolsRow('Runtime readiness', 'Start managed ComfyUI normally and refresh its frontend; native hooks and GPU remain unqualified.', '', '', async () => {
        try {
          const result = await api('/api/dependencies/preflight', { method: 'POST', body: JSON.stringify({ featureId: plan.featureId }) });
          await loadManagedTools(); modelElement('tools-message').textContent = result.ready ? result.qualification : result.issues.join(' ');
        } catch (error) { modelError(error); }
      }, 'Recheck');
    }
  }
  for (const feature of dependencies.features) {
    const requiredClasses = feature.requiredBuiltinClasses || [];
    const workflows = feature.workflowIds || [];
    toolsRow(feature.label, `${workflows.length ? `${workflows.length} declared workflows | ` : ''}ComfyUI ${feature.minimumComfyVersion}+${requiredClasses.length ? ` | Runtime classes: ${requiredClasses.join(', ')}` : ''}`);
    for (const dependency of feature.runtimePackages || []) {
      toolsRow(`${dependency.distribution} | ${dependency.status === 'missing' ? 'Workflow held' : 'Runtime unqualified'}`,
        `${dependency.detail} ${dependency.reason}`);
    }
    for (const node of feature.customNodes) {
      const existing = suites.get(node.name);
      if (!existing || existing.status === 'ready' && node.status !== 'ready') suites.set(node.name, node);
    }
  }
  for (const node of suites.values()) {
    const assets = node.frontendAssets || [];
    toolsRow(node.name, `${node.status === 'ready' ? 'Installed files verified; runtime unchecked' : node.status} | Reviewed ${node.minimumCommit.slice(0, 12)}${node.reason ? ` | ${node.reason}` : ''}${assets.length ? ` | Frontend: ${assets.join(', ')}` : ''}`,
      node.status === 'ready' ? '' : 'node', node.name);
  }
  setToolsBusy(toolsBusy);
}
function renderToolsProgress(job) {
  if (!['managed-tools', 'media-tools'].includes(job.kind)) return;
  modelElement('tools-message').textContent = job.error || (job.phase === 'complete' && job.kind === 'managed-tools'
    ? 'Managed files verified. Restart managed ComfyUI and refresh its frontend; runtime registration remains to be checked.' : job.step);
  if (job.phase !== 'running' && completedToolsJob !== job.id) {
    completedToolsJob = job.id; void loadManagedTools().catch(modelError);
  }
}
modelElement('tools-refresh').addEventListener('click', () => { void loadManagedTools().catch(modelError); });
void loadManagedTools().catch(modelError);
