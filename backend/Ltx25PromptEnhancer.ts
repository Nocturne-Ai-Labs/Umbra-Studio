export interface Ltx25PromptEnhancerOptions {
  prompt: string;
  seed: number;
  sampling: boolean;
  maxLength: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  repetitionPenalty: number;
  presencePenalty: number;
  thinking: boolean;
}

const LEGACY_SAMPLING_INPUTS = [
  'temperature',
  'top_k',
  'top_p',
  'min_p',
  'repetition_penalty',
  'seed',
  'presence_penalty',
] as const;

const DYNAMIC_SAMPLING_INPUTS = LEGACY_SAMPLING_INPUTS.map((name) => `sampling_mode.${name}`);

export function applyLtx25PromptEnhancerInputs(
  inputs: Record<string, unknown>,
  options: Ltx25PromptEnhancerOptions,
): Record<string, unknown> {
  inputs.prompt = options.prompt;
  inputs.max_length = options.maxLength;
  inputs.sampling_mode = options.sampling ? 'on' : 'off';
  inputs.thinking = options.thinking;
  // TextGenerateLTX2Prompt selects the official T2V/I2V system prompt from connected media.
  inputs.use_default_template = true;

  for (const name of LEGACY_SAMPLING_INPUTS) delete inputs[name];
  for (const name of DYNAMIC_SAMPLING_INPUTS) delete inputs[name];
  if (!options.sampling) return inputs;

  inputs['sampling_mode.temperature'] = options.temperature;
  inputs['sampling_mode.top_k'] = options.topK;
  inputs['sampling_mode.top_p'] = options.topP;
  inputs['sampling_mode.min_p'] = options.minP;
  inputs['sampling_mode.repetition_penalty'] = options.repetitionPenalty;
  inputs['sampling_mode.seed'] = options.seed;
  inputs['sampling_mode.presence_penalty'] = options.presencePenalty;
  return inputs;
}
