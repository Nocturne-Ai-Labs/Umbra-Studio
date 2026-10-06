import { collectUiLocalizationPhrases } from './ui-localization-phrases';
import path from 'node:path';
import { hasLegacyUiTranslation, translateLegacyUiText } from '../frontend/src/i18n/legacyUiLocalization';

const COMPONENT_ROOT = path.resolve('frontend/src/components');
const MINIMUM_STATIC_COVERAGE = 90;
const values = collectUiLocalizationPhrases(COMPONENT_ROOT);


const untranslated = [...values]
  .filter((value) => !hasLegacyUiTranslation('ko', value) && translateLegacyUiText('ko', value) === value)
  .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
const translatedCount = values.size - untranslated.length;
const coverage = values.size > 0 ? Math.round((translatedCount / values.size) * 100) : 100;

console.log(`[i18n:ko] ${translatedCount}/${values.size} UI phrases localized (${coverage}%).`);
if (process.env.I18N_AUDIT_VERBOSE === '1' && untranslated.length > 0) {
  console.log(untranslated.map((value) => `  - ${value}`).join('\n'));
}
if (coverage < MINIMUM_STATIC_COVERAGE) {
  console.error(`[i18n:ko] Coverage fell below the ${MINIMUM_STATIC_COVERAGE}% regression floor.`);
  console.error(untranslated.slice(0, 40).map((value) => `  - ${value}`).join('\n'));
  process.exit(1);
}
