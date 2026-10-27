export const FIZGIG_REPOSITORY = 'https://github.com/shootthesound/Fizgig.git';
export const FIZGIG_REVISION = '60ac0cae26d21d17e84bfc0b48fe2056e0636c77';
export const TRAINER_DESCRIPTIONS = {
  aitoolkit: 'AI Toolkit provides diffusion-model training jobs, dataset configuration, sample previews and training monitoring.',
  fizgig: 'Fizgig provides LoRA training and fine-tuning, with dataset preparation, previews and LoRA workbench tools. Model and hardware support vary by workflow.',
};
export function fizgigPort(value: unknown = process.env.UMBRA_FIZGIG_PORT): number {
  const port = value === undefined || value === '' ? 8680 : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid Fizgig port. Choose a free port from 1024 to 65535.');
  return port;
}
