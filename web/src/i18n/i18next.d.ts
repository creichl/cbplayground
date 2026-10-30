import 'i18next'
import type en from './locales/en.json'

// Types the translation keys after en.json, so t() rejects unknown keys.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof en
    }
  }
}
