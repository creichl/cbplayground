import { Button, Menu, Select, VisuallyHidden } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { changeLanguage, languages, type Language } from '../i18n/index.ts'
import { CheckIcon, GlobeIcon } from './icons.tsx'

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

/** The language as a compact menu, a globe and the language's short code, for the platform's header of the start page. */
export function LanguageMenu() {
  const { t, i18n } = useTranslation()
  const current = (i18n.resolvedLanguage ?? 'en') as Language

  return (
    <Menu position="bottom-end" width={224}>
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          h={44}
          px={8}
          leftSection={<GlobeIcon />}
          style={{ flexShrink: 0 }}
        >
          {/* The name starts with the visible short code, so voice control finds the button by what it shows. */}
          {t(`language.short.${current}`)}
          <VisuallyHidden>{` – ${t('language.label')}: ${t(`language.names.${current}`)}`}</VisuallyHidden>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {languages.map((language) => (
          <Menu.Item
            key={language}
            lang={language}
            mih={44}
            aria-current={language === current ? 'true' : undefined}
            rightSection={language === current ? <CheckIcon size={16} /> : null}
            onClick={() => void changeLanguage(language)}
          >
            {t(`language.names.${language}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
