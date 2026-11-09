import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useMatch, useParams } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { usePublicRestaurant } from '../api/publicBooking.ts'
import { BrandLogo } from '../components/BrandLogo.tsx'
import { BrandTheme } from '../components/BrandTheme.tsx'
import { HeroContext, headerHeight, PastHeroContext, scrollToBooking } from '../components/booking/layout.ts'
import { cn } from '../lib/utils.ts'
import { Button } from '../ui/button.tsx'
import { LanguageMenu } from '../ui/language-menu.tsx'
import { SiteFooter } from '../ui/site-footer.tsx'
import { SiteHeader } from '../ui/site-header.tsx'
import { Skeleton } from '../ui/skeleton.tsx'

/**
 * Layout for guests. "Not found" keeps the platform's look of the start page (design system, src/ui): its header with the
 * product name, the staff sign-in and the language, and its plain footer. A restaurant's pages (/r/:slug/…) belong to the
 * restaurant: see RestaurantLayout.
 */
export function GuestLayout() {
  const { slug } = useParams()

  if (slug !== undefined) {
    return <RestaurantLayout slug={slug} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}

/**
 * A restaurant's guest pages in its branding (BrandTheme), built with the design system (src/ui). The header has the
 * restaurant's logo on the left (without box, 40 px high, see BrandLogo; without logo the name) and the language as a
 * compact menu on the right. While a page's cover image (RestaurantHeader, through HeroContext) is behind it, the header is
 * transparent with white text and the logo has a soft shadow; once the restaurant's name on the image reaches the header
 * (so the logo never lies over it) it is fixed, opaque with a blur (a layer that fades in, so the change is smooth), and on the booking page it adds "Reserve a table", which brings
 * the reservation card into view; the page learns of it through PastHeroContext (the booking page then shows its section
 * navigation below the header). Links between the guest pages change the page with a view transition. The platform
 * steps back into a plain footer with the staff sign-in and "powered by". An unknown restaurant gets the platform's look.
 */
function RestaurantLayout({ slug }: { slug: string }) {
  // The same query as the pages below, so the restaurant is loaded once.
  const restaurant = usePublicRestaurant(slug)
  const branding = restaurant.data?.branding ?? null

  return (
    <BrandTheme brandStyle={restaurant.isError ? null : branding} fullHeight>
      <RestaurantFrame slug={slug} />
    </BrandTheme>
  )
}

function RestaurantFrame({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const restaurant = usePublicRestaurant(slug)
  const bookingPage = useMatch('/r/:slug') !== null
  const [hero, setHero] = useState<HTMLElement | null>(null)
  const [heroInView, setHeroInView] = useState(false)
  const overHero = hero !== null && heroInView

  // Set before the first paint, so the header does not flicker from solid to transparent.
  useLayoutEffect(() => {
    if (hero === null) {
      return
    }
    // Transparent only while the restaurant's name (the h1 at the bottom of the image) is below the header, so the logo never
    // lies over it; the skeleton, without a name, until its bottom reaches the header.
    const update = () => {
      const name = hero.querySelector('h1')
      setHeroInView(name !== null ? name.getBoundingClientRect().top > headerHeight : hero.getBoundingClientRect().bottom > headerHeight)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [hero])

  const logoUrl = restaurant.data?.branding.logoUrl ?? null
  const showReserve = bookingPage && !overHero && restaurant.data?.bookable === true

  return (
    <HeroContext value={setHero}>
      <PastHeroContext value={hero !== null && !heroInView}>
      <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
        <header
          className={cn(
            'fixed inset-x-0 top-0 z-40 h-16 transition-colors duration-(--motion-slow)',
            overHero ? 'text-white' : 'text-foreground',
          )}
        >
          {/*
            The opaque surface with its blur fades in and out as a whole: a blur itself does not change smoothly in every browser.
            Neither it nor the header carries a view-transition-name: that makes an element a backdrop root, and a blur inside
            it would only see the header instead of the page behind it.
          */}
          <div
            aria-hidden="true"
            className={cn(
              'absolute inset-0 border-b border-border bg-background/85 backdrop-blur-md transition-opacity duration-(--motion-slow)',
              overHero ? 'opacity-0' : 'opacity-100',
            )}
          />
          {/*
            Logo and language: their own layer in page transitions, on top of the cover image moving below them (app.css). As
            large as the row of the start page's header (SiteHeader), so neither is scaled while one becomes the other.
          */}
          <div data-page-part="site-header" className="relative mx-auto flex h-full max-w-page items-center justify-between gap-2 px-4 sm:px-6">
            {restaurant.isPending ? (
              <Skeleton className="h-10 w-30" />
            ) : restaurant.isError ? (
              <Link to="/" viewTransition className="shrink-0 rounded-lg font-display text-lg text-primary-text focus-ring">
                {t('app.name')}
              </Link>
            ) : (
              <Link
                to={`/r/${encodeURIComponent(slug)}`}
                viewTransition
                aria-label={restaurant.data.name}
                // Over the cover image without logo, the name stands large in the image itself.
                className={cn('flex min-w-0 items-center rounded-lg focus-ring', overHero && logoUrl === null && 'invisible')}
              >
                {logoUrl !== null ? (
                  <BrandLogo src={logoUrl} height={40} maxWidth={180} accent="var(--primary)" onPhoto={overHero} fallback={<RestaurantName name={restaurant.data.name} />} />
                ) : (
                  <RestaurantName name={restaurant.data.name} />
                )}
              </Link>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {showReserve && (
                // It fades in on a wrapper: on the button the focus ring's animation would replace it while focused, and it would play again on blur.
                <span className="flex animate-fade-in">
                  <Button onClick={scrollToBooking}>{t('booking.reserveTable')}</Button>
                </span>
              )}
              <LanguageMenu className={overHero ? 'text-white hover:bg-white/15 hover:text-white' : undefined} />
            </div>
          </div>
        </header>

        {/* A page with a cover image starts behind the header, the others below it. */}
        <main className={cn('flex-1', hero === null && 'pt-16')}>
          <Outlet />
        </main>

        <footer className="mt-16 border-t border-border">
          <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-muted-foreground sm:px-6">
            <StaffLink />
            <Link to="/" viewTransition className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-ring">
              {t('embed.poweredBy')}
            </Link>
          </div>
        </footer>
      </div>
      </PastHeroContext>
    </HeroContext>
  )
}

function RestaurantName({ name }: { name: string }) {
  return <span className="block truncate font-display text-lg">{name}</span>
}

/** Discreet entry for staff on a restaurant's pages: the sign-in, or the own area (also the Superadmin's) when already signed in. */
function StaffLink() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()

  if (currentUser.data === undefined) {
    return null
  }

  const user = currentUser.data
  return (
    <Link
      to={user !== null ? homePath(user.role) : '/login'}
      className="inline-flex min-h-11 min-w-0 items-center truncate rounded-sm underline-offset-4 hover:underline focus-ring"
    >
      {user !== null ? t('guest.toManagement') : t('guest.staffLogin')}
    </Link>
  )
}
