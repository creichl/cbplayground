import { Anchor, type AnchorProps, AppShell, Container, Group } from '@mantine/core'
import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useMatch, useParams } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { usePublicRestaurant } from '../api/publicBooking.ts'
import { Brand } from '../components/Brand.tsx'
import { BrandLogo } from '../components/BrandLogo.tsx'
import { BrandTheme } from '../components/BrandTheme.tsx'
import { HeroContext, headerHeight, scrollToBooking } from '../components/booking/layout.ts'
import { LanguageMenu as PlatformLanguageMenu } from '../components/LanguageSwitcher.tsx'
import { cn } from '../lib/utils.ts'
import { Button } from '../ui/button.tsx'
import { LanguageMenu } from '../ui/language-menu.tsx'
import { Skeleton } from '../ui/skeleton.tsx'

/** The width of "not found", header and content alike. */
const platformWidth = 1120

/**
 * Layout for guests. "Not found" keeps the platform: product name on the left, staff sign-in and the language as a compact
 * menu on the right, content up to about 1120 px wide (the start page has its own header and footer, src/ui). A restaurant's
 * pages (/r/:slug/…) belong to the restaurant: see RestaurantLayout.
 */
export function GuestLayout() {
  const { slug } = useParams()

  if (slug !== undefined) {
    return <RestaurantLayout slug={slug} />
  }

  return (
    <AppShell header={{ height: 64 }}>
      <AppShell.Header>
        <Container size={platformWidth} h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap" gap={8}>
            <Brand to="/" />
            <Group gap={8} wrap="nowrap" miw={0}>
              {/* Not the dimmed grey here: on white it falls short of the AA contrast. 44 px high, so it is easy to tap. */}
              <PlatformStaffLink c="gray.7" lh="44px" display="block" />
              <PlatformLanguageMenu />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size={platformWidth} py={{ base: 32, sm: 48 }}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}

/**
 * A restaurant's guest pages in its branding (BrandTheme), built with the design system (src/ui). The header has the
 * restaurant's logo on the left (without box, 40 px high, see BrandLogo; without logo the name) and the language as a
 * compact menu on the right. While a page's cover image (RestaurantHeader, through HeroContext) is behind it, the header is
 * transparent with white text and the logo has a soft shadow; once the page scrolls past the image it is fixed, opaque with
 * a blur, and on the booking page it adds "Reserve a table", which brings the reservation card into view. The platform
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
    const update = () => setHeroInView(hero.getBoundingClientRect().bottom > headerHeight)
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
      <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
        <header
          className={cn(
            'fixed inset-x-0 top-0 z-40 h-16 border-b transition-[background-color,border-color,backdrop-filter] duration-(--motion-fast)',
            overHero ? 'border-transparent bg-transparent text-white' : 'border-border bg-background/85 backdrop-blur-md',
          )}
        >
          <div className="mx-auto flex h-full max-w-page items-center justify-between gap-2 px-4 sm:px-6">
            {restaurant.isPending ? (
              <Skeleton className="h-10 w-30" />
            ) : restaurant.isError ? (
              <Link to="/" className="shrink-0 rounded-lg font-display text-lg text-primary-text focus-ring">
                {t('app.name')}
              </Link>
            ) : (
              <Link
                to={`/r/${encodeURIComponent(slug)}`}
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
              {showReserve && <Button onClick={scrollToBooking}>{t('booking.reserveTable')}</Button>}
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
            <Link to="/" className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-ring">
              {t('embed.poweredBy')}
            </Link>
          </div>
        </footer>
      </div>
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

/** Discreet entry for staff on the platform's "not found": the sign-in, or the own area when already signed in. */
function PlatformStaffLink(props: AnchorProps) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()

  if (currentUser.data === undefined) {
    return null
  }

  const user = currentUser.data
  return (
    <Anchor
      component={Link}
      to={user !== null ? homePath(user.role) : '/login'}
      size="sm"
      c="dimmed"
      truncate
      {...props}
    >
      {user !== null ? t('guest.toManagement') : t('guest.staffLogin')}
    </Anchor>
  )
}
