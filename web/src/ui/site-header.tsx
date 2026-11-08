import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { headerHeight } from '../components/booking/layout.ts'
import { cn } from '../lib/utils.ts'
import { Button } from './button.tsx'
import { LanguageMenu } from './language-menu.tsx'

type SiteHeaderProps = {
  /**
   * The large photo at the top of the page (the start page's), if there is one: the header then lies fixed and transparent
   * with white text on it, and becomes opaque with a blur, as on a restaurant's pages, once the page has scrolled by the
   * header's height. Not only past the photo: the heading and the search on it would otherwise run through the header's text.
   */
  hero?: HTMLElement | null
}

/**
 * The platform's header: the product name on the left; on the right the discreet entry for staff (the sign-in, or the own
 * area when signed in, the Superadmin's too) and the language.
 */
function SiteHeader({ hero = null }: SiteHeaderProps) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const user = currentUser.data
  const [atHeroTop, setAtHeroTop] = useState(false)
  const overHero = hero !== null && atHeroTop

  // Set before the first paint, so the header does not flicker from solid to transparent.
  useLayoutEffect(() => {
    if (hero === null) {
      return
    }
    const update = () => setAtHeroTop(hero.getBoundingClientRect().top > -headerHeight)
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [hero])

  return (
    <header
      className={cn(
        hero !== null ? 'fixed inset-x-0 top-0 z-40 transition-colors duration-(--motion-slow)' : 'border-b border-border bg-background',
        overHero ? 'text-white' : 'text-foreground',
      )}
    >
      {hero !== null && (
        // The opaque surface with its blur fades in and out as a whole, as on a restaurant's pages (GuestLayout).
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 border-b border-border bg-background/85 backdrop-blur-md transition-opacity duration-(--motion-slow)',
            overHero ? 'opacity-0' : 'opacity-100',
          )}
        />
      )}
      {/*
        Its own layer in page transitions, so it stays on top of the cover image moving below it (app.css). The row, not the
        header: it is as large as the row of a restaurant's header (GuestLayout), so neither is scaled while one becomes
        the other; the surface and the border cross-fade with the page.
      */}
      <div data-page-part="site-header" className="relative mx-auto flex h-16 max-w-page items-center justify-between gap-2 px-4 sm:px-6">
        <Link to="/" className={cn('shrink-0 rounded-lg font-display text-lg focus-ring', overHero ? 'text-white' : 'text-primary-text')}>
          {t('app.name')}
        </Link>
        <div className="flex min-w-0 items-center gap-1">
          {/* Shown once it is known whether someone is signed in. */}
          {user !== undefined && (
            <Button
              asChild
              variant="ghost"
              className={cn(
                'min-w-0 shrink px-2 font-normal',
                overHero ? 'text-white hover:bg-white/15 hover:text-white' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Link to={user !== null ? homePath(user.role) : '/login'}>
                <span className="truncate">{user !== null ? t('guest.toManagement') : t('guest.staffLogin')}</span>
              </Link>
            </Button>
          )}
          <LanguageMenu className={overHero ? 'text-white hover:bg-white/15 hover:text-white' : undefined} />
        </div>
      </div>
    </header>
  )
}

export { SiteHeader }
