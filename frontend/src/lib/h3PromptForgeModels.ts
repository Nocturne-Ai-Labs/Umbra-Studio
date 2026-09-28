export interface H3PromptForgeModel { id: string; label: string; disabled?: boolean }

export const H3_FORGE_MODEL_MISSING = 'Install Llama 3.2 3B Instruct from Umbra Setup > Models > DaSiWa H3 Prompt Forge, then refresh models.';

export function h3PromptForgeModels(models: H3PromptForgeModel[] = []): H3PromptForgeModel[] {
  return models.filter(({ id, disabled }) => {
    if (disabled || !id.startsWith('local:')) return false;
    const folder = id.slice(6).replace(/\\/g, '/').split('/').pop() || '';
    return /^(?:(?:unsloth|meta-llama)--)?Llama-3\.2-3B-Instruct$/i.test(folder);
  }).map((model) => ({ ...model, label: 'Llama 3.2 3B Instruct' }));
}
