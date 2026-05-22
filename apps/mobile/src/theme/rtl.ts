import { applyLanguageDirection, type Language } from '@/i18n/locale';

let ensuredLanguage: Language | null = null;

export async function ensureLanguageDirection(language: Language): Promise<void> {
  if (ensuredLanguage === language) return;
  ensuredLanguage = language;
  await applyLanguageDirection(language);
}

export async function ensureRtl(): Promise<void> {
  await ensureLanguageDirection('he');
}
