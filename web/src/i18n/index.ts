import dayjs from 'dayjs'
import 'dayjs/locale/de'
import 'dayjs/locale/sr'
import 'dayjs/locale/sr-cyrl'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'
import srCyrl from './locales/sr-Cyrl.json'
import srLatn from './locales/sr-Latn.json'

export const languages = ['en', 'de', 'sr-Latn', 'sr-Cyrl'] as const
export type Language = (typeof languages)[number]

// dayjs names the Serbian locales differently: "sr" is Latin, "sr-cyrl" is Cyrillic.
// Used for dayjs itself and for Mantine Dates.
export const dayjsLocales: Record<Language, string> = {
  en: 'en',
  de: 'de',
  'sr-Latn': 'sr',
  'sr-Cyrl': 'sr-cyrl',
}

const storageKey = 'language'

function isLanguage(value: string | null | undefined): value is Language {
  return languages.includes(value as Language)
}

function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(storageKey)
    return isLanguage(value) ? value : null
  } catch {
    // Storage can be blocked, e.g. in an embedded iframe.
    return null
  }
}

// Picks the first supported language from the browser's preferred languages.
// Serbian without a script subtag gets its usual script for the region
// (Intl likely subtags: "sr" and "sr-RS" are Cyrillic, "sr-ME" is Latin).
function browserLanguage(): Language | null {
  for (const tag of navigator.languages) {
    let locale: Intl.Locale
    try {
      locale = new Intl.Locale(tag).maximize()
    } catch {
      continue
    }
    if (locale.language === 'sr') {
      return locale.script === 'Latn' ? 'sr-Latn' : 'sr-Cyrl'
    }
    if (locale.language === 'en' || locale.language === 'de') {
      return locale.language
    }
  }
  return null
}

/** Switches the UI language and remembers the choice for the next visit. */
export function changeLanguage(language: Language) {
  try {
    localStorage.setItem(storageKey, language)
  } catch {
    // Storage can be blocked, e.g. in an embedded iframe; the choice then lasts until reload.
  }
  return i18n.changeLanguage(language)
}

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
  dayjs.locale(isLanguage(language) ? dayjsLocales[language] : 'en')
})

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    'sr-Latn': { translation: srLatn },
    'sr-Cyrl': { translation: srCyrl },
  },
  lng: storedLanguage() ?? browserLanguage() ?? 'en',
  fallbackLng: 'en',
  supportedLngs: languages,
  initAsync: false,
  interpolation: {
    // React escapes values itself.
    escapeValue: false,
  },
})

export default i18n
