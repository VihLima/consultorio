import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './es.json';
import ptBR from './pt-BR.json';

export const LANGUAGES = ['es', 'pt-BR'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'lang';
const DEFAULT_LANGUAGE: Language = 'es';

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function applyLanguage(lng: string) {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Storage unavailable (private mode): the choice just isn't remembered.
  }
  document.documentElement.lang = lng;
  document.title = i18n.t('common.appName');
}

i18n.on('languageChanged', applyLanguage);

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    'pt-BR': { translation: ptBR },
  },
  lng: storedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
});

export default i18n;
