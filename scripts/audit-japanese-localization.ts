import { collectUiLocalizationPhrases } from './ui-localization-phrases';
import path from 'node:path';
import { hasLegacyUiTranslation, translateLegacyUiText } from '../frontend/src/i18n/legacyUiLocalization';

const COMPONENT_ROOT = path.resolve('frontend/src/components');
const MINIMUM_STATIC_COVERAGE = 75;
const values = collectUiLocalizationPhrases(COMPONENT_ROOT);


const untranslated = [...values]
  .filter((value) => !hasLegacyUiTranslation('ja', value) && translateLegacyUiText('ja', value) === value)
  .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
const translatedCount = values.size - untranslated.length;
const coverage = values.size > 0 ? Math.round((translatedCount / values.size) * 100) : 100;

console.log(`[i18n:ja] ${translatedCount}/${values.size} UI phrases localized (${coverage}%).`);
if (coverage < MINIMUM_STATIC_COVERAGE) {
  console.error(`[i18n:ja] Coverage fell below the ${MINIMUM_STATIC_COVERAGE}% regression floor.`);
  console.error(untranslated.slice(0, 40).map((value) => `  - ${value}`).join('\n'));
  process.exit(1);
}
