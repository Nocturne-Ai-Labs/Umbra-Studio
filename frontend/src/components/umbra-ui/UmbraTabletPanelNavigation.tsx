import React from 'react';
import { Maximize2, Minimize2, Notebook, SlidersHorizontal } from 'lucide-react';

export type TabletPanelVisibility = { generation: boolean; prompt: boolean };
export type TabletPanelState = TabletPanelVisibility & { restore: TabletPanelVisibility | null };
export type TabletPanelAction = 'generation' | 'prompt' | 'preview';
export const INITIAL_TABLET_PANELS: TabletPanelState = { generation: true, prompt: true, restore: null };

export function reduceTabletPanels(state: TabletPanelState, action: TabletPanelAction): TabletPanelState {
  if (action !== 'preview') return { ...state, [action]: !state[action], restore: null };
  if (state.generation || state.prompt) {
    return { generation: false, prompt: false, restore: { generation: state.generation, prompt: state.prompt } };
  }
  return { ...(state.restore || { generation: true, prompt: true }), restore: null };
}

export function UmbraTabletPanelNavigation({ panels, onToggle }: {
  panels: TabletPanelState;
  onToggle: (action: TabletPanelAction) => void;
}) {
  const previewOnly = !panels.generation && !panels.prompt;
  return (
    <nav data-umbra-tablet-panel-navigation="" aria-label="Image workspace panels">
      <button type="button" aria-expanded={panels.generation}
        title={panels.generation ? 'Collapse generation settings' : 'Show generation settings'}
        onClick={() => onToggle('generation')}>
        <SlidersHorizontal size={15} />Generation
      </button>
      <button type="button" aria-expanded={panels.prompt}
        title={panels.prompt ? 'Collapse prompt editor' : 'Show prompt editor'}
        onClick={() => onToggle('prompt')}>
        <Notebook size={15} />Prompt
      </button>
      <button type="button" aria-pressed={previewOnly}
        title={previewOnly ? 'Restore previous panels' : 'Expand preview to the full workspace'}
        onClick={() => onToggle('preview')}>
        {previewOnly ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        {previewOnly ? 'Restore panels' : 'Preview only'}
      </button>
    </nav>
  );
}
