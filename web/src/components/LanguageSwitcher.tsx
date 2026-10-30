import { Select } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { changeLanguage, languages, type Language } from '../i18n/index.ts'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  return (
    <Select
      aria-label={t('language.label')}
      data={languages.map((language) => ({ value: language, label: t(`language.names.${language}`) }))}
      value={i18n.resolvedLanguage}
      onChange={(value) => {
        if (value !== null) {
          void changeLanguage(value as Language)
        }
      }}
      allowDeselect={false}
      w={192}
      miw={0}
    />
  )
}
