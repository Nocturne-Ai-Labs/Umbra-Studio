// Scoped styles are rendered by the workspace because the frontend bundler omits CSS imports.
export const modelMergeStyles = `
[data-model-merge] .merge-panel {
  border: 1px solid var(--umbra-border);
  border-image: none;
}
[data-model-merge] .merge-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
[data-model-merge] .merge-label,
[data-model-merge] .merge-field {
  color: var(--umbra-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .12em;
  line-height: 1.4;
  text-transform: uppercase;
}
[data-model-merge] .merge-badge {
  border: 1px solid var(--umbra-border);
  border-radius: 4px;
  color: var(--umbra-text-muted);
  padding: 2px 5px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: .05em;
  line-height: 1.4;
  text-transform: uppercase;
}
[data-model-merge] .merge-input,
[data-model-merge] .merge-select,
[data-model-merge] .merge-button {
  min-height: 34px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: normal;
  line-height: 1.4;
  text-transform: none;
  transition: border-color 120ms ease, background-color 120ms ease;
}
[data-model-merge] .merge-select {
  height: auto;
  min-height: 34px !important;
  background: color-mix(in srgb, var(--umbra-bg) 62%, transparent);
}
[data-model-merge] .merge-input:not(textarea) { height: 34px; }
[data-model-merge] .merge-input { font-weight: 400; }
[data-model-merge] .merge-field > :is(input, textarea, div) { margin-top: 6px; }
[data-model-merge] .merge-input:disabled { opacity: .5; }
[data-model-merge] .merge-button[aria-pressed="true"],
[data-model-merge] .merge-primary {
  border-color: color-mix(in srgb, var(--umbra-accent) 55%, var(--umbra-border));
  color: var(--umbra-accent);
  background: color-mix(in srgb, var(--umbra-accent) 8%, var(--umbra-panel));
}
[data-model-merge] .merge-primary:not(:disabled):hover {
  box-shadow: 0 0 12px color-mix(in srgb, var(--umbra-accent-glow) 35%, transparent);
}
[data-model-merge] :is(button, input, textarea, summary, a):focus-visible {
  outline: 2px solid var(--umbra-accent);
  outline-offset: 2px;
}
[data-model-merge] .merge-input:focus-visible { border-color: var(--umbra-accent); }
[data-model-merge] .merge-check,
[data-model-merge] .merge-disclosure { min-height: 34px; }
[data-model-merge] .merge-range { min-height: 34px; height: 34px; }
@container umbra-model-merge-editor (max-width: 700px) {
  [data-model-merge] .merge-swap { margin-top: 0; }
}
@media (pointer: coarse) {
  [data-model-merge] :is(.merge-button, .merge-input, .merge-check, .merge-disclosure, .merge-range) { min-height: 44px; }
  [data-model-merge] .merge-select { min-height: 44px !important; }
  [data-model-merge] .merge-input:not(textarea) { height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  [data-model-merge] :is(.merge-button, .merge-input, .merge-select) { transition: none; }
}
`;
