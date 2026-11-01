import {
  Anchor,
  type AnchorProps,
  AppShell,
  Box,
  Button,
  Container,
  Group,
  Skeleton,
  Text,
  useMantineColorScheme,
} from '@mantine/core'
import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useMatch, useParams } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { usePublicRestaurant } from '../api/publicBooking.ts'
import { Brand } from '../components/Brand.tsx'
import { BrandLogo } from '../components/BrandLogo.tsx'
import { BrandTheme } from '../components/BrandTheme.tsx'
import { contentWidth, HeroContext, headerHeight, scrollToBooking } from '../components/booking/layout.ts'
import { LanguageMenu } from '../components/LanguageSwitcher.tsx'

/** The width of the start page and "not found", header and content alike. */
const platformWidth = 1120

/**
 * Layout for guests. The start page and "not found" keep the platform: product name on the left, staff sign-in and the
 * language as a compact menu on the right, content up to about 1120 px wide. A restaurant's pages (/r/:slug/…) belong to the
 * restaurant: see RestaurantLayout.
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
              <StaffLink c="gray.7" lh="44px" display="block" />
              <LanguageMenu />
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
 * A restaurant's guest pages in its branding (BrandTheme). The header has the restaurant's logo on the left (without box,
 * 40 px high, see BrandLogo) and the language as a compact menu on the right. While a page's cover image (RestaurantHeader,
 * through HeroContext) is behind it, the header is transparent, the logo has a soft shadow and the menu sits on a white plate;
 * further down it is solid, with the logo or the name, and on the
 * booking page on phones a "Reserve a table" button. The platform steps back into a plain footer with the staff sign-in
 * and "powered by". An unknown restaurant gets the platform's look.
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
  const dark = useMantineColorScheme().colorScheme === 'dark'
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
      <Box bg={dark ? 'var(--mantine-color-body)' : 'var(--mantine-color-gray-0)'} mih="100dvh" style={{ display: 'flex', flexDirection: 'column' }}>
        <Box
          component="header"
          pos="fixed"
          top={0}
          left={0}
          right={0}
          h={headerHeight}
          style={{
            zIndex: 200,
            backgroundColor: overHero ? 'transparent' : 'var(--mantine-color-body)',
            borderBottom: `1px solid ${overHero ? 'transparent' : 'var(--mantine-color-default-border)'}`,
            transition: 'background-color 150ms ease, border-color 150ms ease',
          }}
        >
          <Container size={contentWidth} h="100%">
            <Group h="100%" justify="space-between" wrap="nowrap" gap={8}>
              {restaurant.isPending ? (
                <Skeleton h={40} w={120} />
              ) : restaurant.isError ? (
                <Brand to="/" />
              ) : (
                <Anchor
                  component={Link}
                  to={`/r/${encodeURIComponent(slug)}`}
                  underline="never"
                  c="inherit"
                  miw={0}
                  // Over the cover image without logo, the name stands large in the image itself.
                  aria-label={restaurant.data.name}
                  style={{ visibility: overHero && logoUrl === null ? 'hidden' : undefined }}
                >
                  {logoUrl !== null ? (
                    <BrandLogo src={logoUrl} height={40} maxWidth={180} onPhoto={overHero} fallback={<RestaurantName name={restaurant.data.name} />} />
                  ) : (
                    <RestaurantName name={restaurant.data.name} />
                  )}
                </Anchor>
              )}
              <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                {showReserve && (
                  <Button hiddenFrom="md" h={44} onClick={scrollToBooking}>
                    {t('booking.reserveTable')}
                  </Button>
                )}
                <LanguageMenu onPhoto={overHero} />
              </Group>
            </Group>
          </Container>
        </Box>

        {/* A page with a cover image starts behind the header, the others below it. */}
        <Box component="main" pt={hero === null ? headerHeight : 0} style={{ flex: 1 }}>
          <Outlet />
        </Box>

        <Box component="footer" py={8} mt={48} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Container size={contentWidth}>
            <Group justify="space-between" gap={8}>
              <StaffLink lh="44px" display="block" />
              <Anchor component={Link} to="/" size="sm" c="dimmed" lh="44px" display="block">
                {t('embed.poweredBy')}
              </Anchor>
            </Group>
          </Container>
        </Box>
      </Box>
    </HeroContext>
  )
}

function RestaurantName({ name }: { name: string }) {
  return (
    <Text component="span" ff="heading" fw={700} size="lg" truncate display="block">
      {name}
    </Text>
  )
}

/** Discreet entry for staff: the sign-in, or the own area (also the Superadmin's) when already signed in. */
function StaffLink(props: AnchorProps) {
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
