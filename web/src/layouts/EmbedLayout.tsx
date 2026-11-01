import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useParams, useSearchParams } from 'react-router'
import { usePublicRestaurant } from '../api/publicBooking.ts'
import { BrandTheme } from '../components/BrandTheme.tsx'
import { LanguageMenu } from '../ui/language-menu.tsx'

/** The message with which the embed tells the page around it its height, e.g. { type: 'cbplayground:height', height: 812 }. */
export const heightMessageType = 'cbplayground:height'

/**
 * Layout of the booking embedded in a restaurant's website, built with the design system (src/ui): no header and no outer
 * spacing, the language as a small menu at the top right and a discreet "Powered by" link at the bottom. It carries the restaurant's colour, fonts and light or dark mode (BrandTheme), but no
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
      <div ref={contentRef} className="flex flex-col gap-2 bg-background font-sans text-foreground">
        <div className="flex justify-end">
          <LanguageMenu
            className="h-8 text-xs"
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
        </div>
        <Outlet />
        <div className="flex justify-center">
          <a href="/" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-sm text-sm text-muted-foreground underline-offset-4 hover:underline focus-ring">
            {t('embed.poweredBy')}
          </a>
        </div>
      </div>
    </BrandTheme>
  )
}
