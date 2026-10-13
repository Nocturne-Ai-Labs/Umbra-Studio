import fs from 'node:fs';
import path from 'node:path';
import { collectSourceUiLocalizationPhrases, collectUiLocalizationPhrases } from './ui-localization-phrases';
import { hasLegacyUiTranslation, translateLegacyUiText } from '../frontend/src/i18n/legacyUiLocalization';
import type { AppLanguage } from '../frontend/src/lib/appSettings';

export function auditUiLocalization(language: AppLanguage, minimumCoverage: number) {
  const sourceRoot = path.resolve('frontend/src');
  const untranslated = (values: Set<string>) => [...values]
    .filter(value => !hasLegacyUiTranslation(language, value) && translateLegacyUiText(language, value) === value)
    .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
  const print = (surface: string, values: Set<string>) => {
    const missing = untranslated(values);
    const translated = values.size - missing.length;
    const coverage = values.size ? translated / values.size * 100 : 100;
    // Keep the unrounded ratio for the regression floor. Two decimal places
    // expose small remaining gaps instead of reporting a rounded 100%.
    console.log(`[i18n:${language}] ${surface}: ${translated}/${values.size} UI phrases localized (${coverage.toFixed(2)}%); ${missing.length} untranslated.`);
    return { missing, coverage };
  };
  const overall = print('frontend/src (all TSX)', collectSourceUiLocalizationPhrases(sourceRoot));
  print('components', collectUiLocalizationPhrases(path.join(sourceRoot, 'components')));
  const featuresRoot = path.join(sourceRoot, 'features');
  if (fs.existsSync(featuresRoot)) {
    for (const feature of fs.readdirSync(featuresRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      print(`features/${feature.name}`, collectUiLocalizationPhrases(path.join(featuresRoot, feature.name)));
    }
  }
  if (process.env.I18N_AUDIT_VERBOSE === '1') console.log(overall.missing.map(value => `  - ${value}`).join('\n'));
  if (overall.coverage < minimumCoverage) {
    console.error(`[i18n:${language}] Coverage fell below the ${minimumCoverage}% regression floor.`);
    console.error(overall.missing.slice(0, 40).map(value => `  - ${value}`).join('\n'));
    process.exitCode = 1;
  }
}
