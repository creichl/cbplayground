import { Anchor, Group, Select, Stack } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useSearchParams } from 'react-router'
import { languages } from '../i18n/index.ts'

/** The message with which the embed tells the page around it its height, e.g. { type: 'cbplayground:height', height: 812 }. */
export const heightMessageType = 'cbplayground:height'

/**
 * Layout of the booking embedded in a restaurant's website: no header and no outer spacing, a small language choice and
 * a discreet link to the platform. Every change of its height is sent to the page around it, so the snippet can fit the iframe.
 */
export function EmbedLayout() {
  const { t, i18n } = useTranslation()
  const [, setSearchParams] = useSearchParams()
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const content = contentRef.current
    if (content === null || window.parent === window) {
      return
    }
    let lastHeight = 0
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(content.getBoundingClientRect().height)
      if (height !== lastHeight) {
        lastHeight = height
        // The height is no secret, so any page may receive it.
        window.parent.postMessage({ type: heightMessageType, height }, '*')
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <Stack ref={contentRef} gap="sm">
      <Group justify="flex-end">
        <Select
          aria-label={t('language.label')}
          data={languages.map((language) => ({ value: language, label: t(`language.names.${language}`) }))}
          value={i18n.resolvedLanguage}
          onChange={(value) => {
            if (value !== null) {
              // The choice stays in the address and is not stored, so the language of the platform itself stays as it is.
              void i18n.changeLanguage(value)
              setSearchParams(
                (params) => {
                  params.set('lang', value)
                  return params
                },
                { replace: true },
              )
            }
          }}
          allowDeselect={false}
          size="xs"
          w={170}
        />
      </Group>
      <Outlet />
      <Group justify="center">
        <Anchor href="/" target="_blank" rel="noopener" size="xs" c="dimmed">
          {t('embed.poweredBy')}
        </Anchor>
      </Group>
    </Stack>
  )
}
