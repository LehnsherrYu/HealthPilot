import i18n from 'i18next';
import healthpilotEn from './locales/healthpilot/en.json';
import healthpilotZh from './locales/healthpilot/zh.json';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';
import { getSupportedLanguages } from './utils/languageUtils';

i18n
  .use(HttpApi)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: getSupportedLanguages(),
    fallbackLng: 'en',
    partialBundledLanguages: true,
    ns: ['translation', 'healthpilot'],
    defaultNS: 'translation',
    resources: {
      en: { healthpilot: healthpilotEn },
      zh: { healthpilot: healthpilotZh },
      'zh-Hans': { healthpilot: healthpilotZh },
      'zh-Hant': { healthpilot: healthpilotZh },
    },
    detection: {
      order: [
        'localStorage',
        'querystring',
        'cookie',
        'sessionStorage',
        'navigator',
        'htmlTag',
      ],
      caches: ['localStorage', 'cookie'],
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
