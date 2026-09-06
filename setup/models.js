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
  'Installing selected models': 'Ausgewählte Modelle werden installiert', 'Verifying selected models': 'Ausgewählte Modelle werden geprüft',
  'Installation cancelled': 'Installation abgebrochen',
});

let modelCatalog = null;
let modelBusy = false;
let modelPack = new URLSearchParams(location.search).get('pack') === 'support' ? 'support' : 'requirements';
const modelSelections = { requirements: new Set(), support: new Set(['core']) };
let completedModelJob = '';
const modelElement = id => document.getElementById(id);
document.querySelector('main').insertBefore(progress, modelElement('general-panel'));
const modelBytes = value => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
function modelError(error) { status.textContent = error.message; status.classList.add('error'); }

function showSetupTab(tab) {
  ['general', 'models'].forEach(id => {
    modelElement(`${id}-panel`).hidden = tab !== id;
    modelElement(`tab-${id}`).setAttribute('aria-selected', String(tab === id));
    modelElement(`tab-${id}`).tabIndex = tab === id ? 0 : -1;
  });
}
['general', 'models'].forEach(tab => {
  modelElement(`tab-${tab}`).addEventListener('click', () => showSetupTab(tab));
  modelElement(`tab-${tab}`).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'general' : event.key === 'End' ? 'models' : tab === 'general' ? 'models' : 'general';
    showSetupTab(next); modelElement(`tab-${next}`).focus();
  });
});
function currentModelPack() { return modelCatalog?.packs.find(pack => pack.id === modelPack); }
function selectedModelFiles() {
  return (currentModelPack()?.files || []).filter(file => file.profiles.some(id => modelSelections[modelPack].has(id)));
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
    detail.textContent = `${modelBytes(file.bytes)} | ${tr(file.present ? 'presentFile' : 'missingFile')}${file.licenses.length ? ` | ${file.licenses.join(', ')}` : ''}`;
    row.append(detail); list.append(row);
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
    text.append(title, description); label.append(checkbox, text); list.append(label);
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
showSetupTab(new URLSearchParams(location.search).get('tab') === 'models' ? 'models' : 'general');
modelElement(`pack-${modelPack}`).click();
if (new URLSearchParams(location.search).get('pack') === 'data-forge') modelElement('data-forge-pack').scrollIntoView();
void loadModelCatalog().catch(modelError);
