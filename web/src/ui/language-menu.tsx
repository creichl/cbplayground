import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CheckIcon, GlobeIcon } from 'lucide-react'
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { ThemeRootContext } from '@/brandTheme'
import { changeLanguage, type Language, languages } from '@/i18n/index'
import { Button } from '@/ui/button'

/** The language as a compact menu: a globe and the language's short code; the choice is remembered for the next visit. */
function LanguageMenu() {
  const { t, i18n } = useTranslation()
  const current = (i18n.resolvedLanguage ?? 'en') as Language

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" className="px-2">
          <GlobeIcon aria-hidden="true" />
          {/* The name starts with the visible short code, so voice control finds the button by what it shows. */}
          {t(`language.short.${current}`)}
          <span className="sr-only">{` – ${t('language.label')}: ${t(`language.names.${current}`)}`}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={useContext(ThemeRootContext)}>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-56 origin-(--radix-dropdown-menu-content-transform-origin) rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-float data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
        >
          <DropdownMenu.RadioGroup value={current} onValueChange={(language) => void changeLanguage(language as Language)}>
            {languages.map((language) => (
              <DropdownMenu.RadioItem
                key={language}
                value={language}
                lang={language}
                className="relative flex min-h-11 cursor-pointer items-center rounded-lg pr-9 pl-3 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
              >
                {t(`language.names.${language}`)}
                <DropdownMenu.ItemIndicator className="absolute right-3 flex">
                  <CheckIcon aria-hidden="true" className="size-4" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export { LanguageMenu }
