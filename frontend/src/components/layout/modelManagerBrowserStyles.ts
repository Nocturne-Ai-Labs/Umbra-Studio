// The frontend builder ignores component CSS imports, so keep these rules inside the workspace.
export const MODEL_MANAGER_BROWSER_STYLES = `
[data-umbra-model-manager] { container: model-manager / inline-size; min-width: 0; overflow: hidden; --model-manager-line: color-mix(in srgb, var(--umbra-text) 12%, transparent); }
[data-umbra-model-manager] :where(button, input, a):focus-visible {
  outline: 2px solid var(--umbra-accent); outline-offset: 2px;
}
[data-umbra-model-manager] .model-manager-local-shell { position: relative; min-width: 0; }
[data-umbra-model-manager] .model-manager-folder-sidebar { width: 248px; border-right: 1px solid var(--model-manager-line); }
[data-umbra-model-manager] .model-manager-tool.model-manager-folder-toggle { display: none; }
[data-umbra-model-manager] .model-manager-browse-toolbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: .5rem;
  padding: .5rem .75rem; border-bottom: 1px solid var(--model-manager-line);
  background: color-mix(in srgb, var(--umbra-panel) 72%, transparent);
}
[data-umbra-model-manager] .model-manager-tool {
  display: inline-flex; align-items: center; justify-content: center; gap: .375rem;
  min-height: 2rem; padding: .25rem .5rem; border: 1px solid var(--model-manager-line);
  border-radius: 4px; color: color-mix(in srgb, var(--umbra-text) 72%, transparent);
  background: color-mix(in srgb, var(--umbra-panel) 72%, transparent); font-size: 12px;
}
[data-umbra-model-manager] .model-manager-tool:hover { color: var(--umbra-text); background: var(--umbra-panel); }
[data-umbra-model-manager] .model-manager-tool:disabled { opacity: .4; cursor: not-allowed; }
[data-umbra-model-manager] .model-manager-tool[aria-pressed="true"] {
  color: var(--umbra-text); border-color: var(--umbra-accent); background: var(--umbra-accent-glow);
}
[data-umbra-model-manager] .model-manager-tool-danger { color: #fca5a5; border-color: #ef44444d; }
[data-umbra-model-manager] .model-manager-breadcrumbs { min-width: 0; flex: 1 1 180px; }
[data-umbra-model-manager] .model-manager-search {
  display: flex; align-items: center; gap: .375rem; flex: 1 1 160px; min-width: 120px;
  border: 1px solid var(--model-manager-line); border-radius: 4px; padding: 0 .5rem;
  background: color-mix(in srgb, var(--umbra-bg) 85%, transparent);
}
[data-umbra-model-manager] .model-manager-search:focus-within { border-color: var(--umbra-accent); }
[data-umbra-model-manager] .model-manager-search input {
  width: 100%; min-width: 0; height: 2rem; background: transparent; color: var(--umbra-text); outline: none; font-size: 12px;
}
[data-umbra-model-manager] .model-manager-action-strip {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: .5rem; padding: .375rem .75rem; border-bottom: 1px solid var(--model-manager-line);
}
[data-umbra-model-manager] .model-manager-action-strip .model-manager-tool { min-height: 1.75rem; }
[data-umbra-model-manager] .model-manager-items { padding: .75rem; }
[data-umbra-model-manager] .model-manager-items[data-view="grid"] {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 175px), 1fr)); gap: .625rem;
}
[data-umbra-model-manager] .model-manager-items[data-view="list"] { display: flex; flex-direction: column; gap: .375rem; }
[data-umbra-model-manager] .model-manager-item { position: relative; min-width: 0; }
[data-umbra-model-manager] .model-manager-entry {
  display: flex; width: 100%; height: 100%; min-width: 0; gap: .5rem; padding: .375rem;
  text-align: left; border: 1px solid var(--model-manager-line); border-radius: 6px;
  background: color-mix(in srgb, var(--umbra-panel) 55%, var(--umbra-bg)); transition: border-color 120ms, background 120ms;
}
[data-umbra-model-manager] .model-manager-entry:hover { border-color: color-mix(in srgb, var(--umbra-text) 24%, transparent); }
[data-umbra-model-manager] .model-manager-entry[aria-pressed="true"] {
  border-color: var(--umbra-accent); box-shadow: 0 0 0 1px var(--umbra-accent);
  background: color-mix(in srgb, var(--umbra-accent) 9%, var(--umbra-bg));
}
[data-umbra-model-manager] .model-manager-entry[data-drop-target="true"] { outline: 2px solid var(--umbra-accent); }
[data-umbra-model-manager] .model-manager-preview {
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  border-radius: 4px; background: var(--umbra-bg); border: 1px solid var(--model-manager-line);
}
[data-umbra-model-manager] .model-manager-preview img { width: 100%; height: 100%; object-fit: cover; }
[data-umbra-model-manager] .model-manager-items[data-view="grid"] .model-manager-entry { flex-direction: column; }
[data-umbra-model-manager] .model-manager-items[data-view="grid"] .model-manager-preview {
  width: 100%; height: auto; flex: none; aspect-ratio: 1;
}
[data-umbra-model-manager] .model-manager-items[data-view="list"] .model-manager-entry { align-items: center; padding-right: 4.5rem; }
[data-umbra-model-manager] .model-manager-items[data-view="list"] .model-manager-preview { width: 3.5rem; height: 3.5rem; flex: 0 0 3.5rem; }
[data-umbra-model-manager] .model-manager-entry-info { flex: 1; min-width: 0; padding: 0 .125rem .125rem; }
[data-umbra-model-manager] .model-manager-entry-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
[data-umbra-model-manager] .model-manager-entry-meta { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .5rem; margin-top: .25rem; font-size: 11px; color: color-mix(in srgb, var(--umbra-text) 50%, transparent); }
[data-umbra-model-manager] .model-manager-entry-type { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
[data-umbra-model-manager] .model-manager-entry-extra { display: none; font-size: 11px; color: color-mix(in srgb, var(--umbra-text) 50%, transparent); }
[data-umbra-model-manager] .model-manager-items[data-view="list"] .model-manager-entry-extra { display: block; width: 150px; flex-shrink: 0; }
[data-umbra-model-manager] .model-manager-check {
  position: absolute; top: .75rem; right: .75rem; display: flex; align-items: center; justify-content: center;
  width: 1.5rem; height: 1.5rem; border-radius: 4px; background: color-mix(in srgb, var(--umbra-bg) 90%, transparent);
}
[data-umbra-model-manager] .model-manager-check input { width: 1rem; height: 1rem; color-scheme: dark; accent-color: var(--umbra-accent); cursor: pointer; }
[data-umbra-model-manager] .model-manager-items[data-view="list"] .model-manager-check { top: 50%; transform: translateY(-50%); }
[data-umbra-model-manager] .model-manager-items[data-view="grid"] .model-manager-entry-info { padding-right: 1.75rem; }
[data-umbra-model-manager] .model-manager-item-menu {
  position: absolute; bottom: .375rem; right: .375rem; width: 1.75rem; height: 1.75rem; padding: 0;
}
[data-umbra-model-manager] .model-manager-items[data-view="list"] .model-manager-item-menu { right: 2.5rem; bottom: .5rem; }
[data-umbra-model-manager] .model-manager-state { display: flex; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; gap: .625rem; padding: 1.5rem; color: color-mix(in srgb, var(--umbra-text) 50%, transparent); font-size: 12px; text-align: center; }
[data-umbra-model-manager] .model-manager-saved-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 175px), 1fr)); gap: .625rem; }
[data-umbra-model-manager] .model-manager-saved-card { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: .5rem; min-width: 0; padding: .375rem; border: 1px solid var(--model-manager-line); border-radius: 6px; }
[data-umbra-model-manager] .model-manager-saved-open { grid-column: 1 / -1; display: flex; flex-direction: column; min-width: 0; width: 100%; gap: .5rem; text-align: left; }
[data-umbra-model-manager] .model-manager-saved-preview { width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 4px; background: var(--umbra-bg); }
[data-umbra-model-manager] .model-manager-saved-card > button:nth-child(2) { grid-column: 2; }
[data-umbra-model-manager] .model-manager-info-panel { width: 350px; min-height: 0; border-left: 1px solid var(--model-manager-line); }
@container model-manager (max-width: 1150px) {
  [data-umbra-model-manager] .model-manager-folder-sidebar { width: 210px; }
  [data-umbra-model-manager] .model-manager-info-panel { position: absolute; inset: 0 0 0 auto; z-index: 30; width: min(420px, 100%); background: var(--umbra-panel-bg); backdrop-filter: blur(var(--umbra-blur)); box-shadow: var(--umbra-shadow); }
}
@container model-manager (max-width: 800px) {
  [data-umbra-model-manager] .model-manager-tool.model-manager-folder-toggle { display: inline-flex; }
  [data-umbra-model-manager] .model-manager-folder-sidebar { display: none; }
  [data-umbra-model-manager] .model-manager-items[data-view="list"] .model-manager-entry-extra { display: none; }
}
@container model-manager (max-width: 480px) {
  [data-umbra-model-manager] .model-manager-tool { min-height: 2.5rem; }
  [data-umbra-model-manager] .model-manager-action-strip .model-manager-tool { min-height: 2.5rem; }
  [data-umbra-model-manager] .model-manager-items { padding: .5rem; }
  [data-umbra-model-manager] .model-manager-items[data-view="grid"] { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
  [data-umbra-model-manager] .model-manager-saved-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
  [data-umbra-model-manager] .model-manager-check { width: 1.75rem; height: 1.75rem; top: .5rem; right: .5rem; }
}
html:is([data-umbra-remote-mode="phone"], [data-umbra-remote-mode="tablet"]) [data-umbra-model-manager] .model-manager-browse-toolbar .model-manager-tool,
html:is([data-umbra-remote-mode="phone"], [data-umbra-remote-mode="tablet"]) [data-umbra-model-manager] .model-manager-action-strip .model-manager-tool { min-height: 2.75rem; }
html:is([data-umbra-remote-mode="phone"], [data-umbra-remote-mode="tablet"]) [data-umbra-model-manager] .model-manager-check { width: 2.25rem; height: 2.25rem; }
html:is([data-umbra-remote-mode="phone"], [data-umbra-remote-mode="tablet"]) [data-umbra-model-manager] .model-manager-items[data-view="grid"] .model-manager-preview { width: 100%; height: auto; flex: none; }
[data-umbra-model-manager-phone="1"] [data-umbra-model-manager-desktop-local-toolbar] { display: none; }
html:is([data-umbra-remote-mode="phone"], [data-umbra-remote-mode="tablet"]) [data-umbra-model-manager] .model-manager-info-panel { position: fixed; inset: 0; width: 100%; z-index: 1500; background: var(--umbra-bg); }
`;
