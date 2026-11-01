import { Anchor, Group, Stack } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useParams, useSearchParams } from 'react-router'
import { usePublicRestaurant } from '../api/publicBooking.ts'
import { BrandTheme } from '../components/BrandTheme.tsx'
import { LanguageMenu } from '../components/LanguageSwitcher.tsx'

/** The message with which the embed tells the page around it its height, e.g. { type: 'cbplayground:height', height: 812 }. */
export const heightMessageType = 'cbplayground:height'

/**
 * Layout of the booking embedded in a restaurant's website: no header and no outer spacing, the language as a small menu
 * and a discreet link to the platform. It carries the restaurant's colour, fonts and light or dark mode (BrandTheme), but no
 * cover image or logo: the website around it already is the restaurant. Every change of its height is sent to the page
 * around it, so the snippet can fit the iframe.
 */
export function EmbedLayout() {
  const { t, i18n } = useTranslation()
  const { slug = '' } = useParams()
  // The same query as the page below, so the restaurant is loaded once.
  const restaurant = usePublicRestaurant(slug)
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
    <BrandTheme brandStyle={restaurant.data?.branding ?? null} fullHeight>
      <Stack ref={contentRef} gap={8}>
        <Group justify="flex-end">
          <LanguageMenu
            onChange={(language) => {
              // The choice stays in the address and is not stored, so the language of the platform itself stays as it is.
              void i18n.changeLanguage(language)
              setSearchParams(
                (params) => {
                  params.set('lang', language)
                  return params
                },
                { replace: true },
              )
            }}
          />
        </Group>
        <Outlet />
        <Group justify="center">
          <Anchor href="/" target="_blank" rel="noopener" size="sm" c="dimmed" lh="44px">
            {t('embed.poweredBy')}
          </Anchor>
        </Group>
      </Stack>
    </BrandTheme>
  )
}
