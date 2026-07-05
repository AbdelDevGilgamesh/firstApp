import { APP_LANGUAGES, translations } from '../src/i18n';

const englishKeys = new Set(Object.keys(translations.en));
let hasIssues = false;

for (const { code, label } of APP_LANGUAGES) {
  if (code === 'en') {
    continue;
  }

  const languageKeys = new Set(Object.keys(translations[code]));
  const missingKeys = [...englishKeys].filter((key) => !languageKeys.has(key));
  const extraKeys = [...languageKeys].filter((key) => !englishKeys.has(key));

  if (missingKeys.length || extraKeys.length) {
    hasIssues = true;
  }

  console.log(`\n${label} (${code})`);
  console.log(`  Missing keys: ${missingKeys.length}`);
  for (const key of missingKeys) {
    console.log(`    - ${key}`);
  }

  console.log(`  Extra keys: ${extraKeys.length}`);
  for (const key of extraKeys) {
    console.log(`    - ${key}`);
  }
}

if (!hasIssues) {
  console.log('\nAll translation keys match English.');
}
