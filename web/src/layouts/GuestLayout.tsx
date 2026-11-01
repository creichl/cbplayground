import { Anchor, type AnchorProps, AppShell, Box, Container, Group, Image, Skeleton, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useParams } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { usePublicRestaurant } from '../api/publicBooking.ts'
import { Brand } from '../components/Brand.tsx'
import { BrandTheme } from '../components/BrandTheme.tsx'
import { LanguageMenu, LanguageSwitcher } from '../components/LanguageSwitcher.tsx'

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
 * A restaurant's guest pages in its branding (BrandTheme): its logo or name on the left of the header, the language on the
 * right; the pages below lay out their own width. The platform steps back into a plain footer with the staff sign-in and
 * "powered by". An unknown restaurant gets the platform's look.
 */
function RestaurantLayout({ slug }: { slug: string }) {
  const { t } = useTranslation()
  // The same query as the pages below, so the restaurant is loaded once.
  const restaurant = usePublicRestaurant(slug)
  const branding = restaurant.data?.branding ?? null

  return (
    <BrandTheme brandStyle={restaurant.isError ? null : branding} fullHeight>
      <AppShell header={{ height: 64 }}>
        <AppShell.Header>
          <Container size="lg" h="100%">
            <Group h="100%" justify="space-between" wrap="nowrap" gap="xs">
              {restaurant.isPending ? (
                <Skeleton h={24} w={160} />
              ) : restaurant.isError ? (
                <Brand to="/" />
              ) : (
                <Anchor component={Link} to={`/r/${encodeURIComponent(slug)}`} underline="never" c="inherit" miw={0}>
                  {branding?.logoUrl != null ? (
                    <Image src={branding.logoUrl} alt={restaurant.data.name} h={40} w="auto" maw={160} fit="contain" />
                  ) : (
                    <Text component="span" ff="heading" fw={700} size="lg" truncate display="block">
                      {restaurant.data.name}
                    </Text>
                  )}
                </Anchor>
              )}
              <LanguageSwitcher />
            </Group>
          </Container>
        </AppShell.Header>

        <AppShell.Main>
          <Outlet />
          <Box component="footer" py="lg" mt="xl" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            <Container size="lg">
              <Group justify="space-between" gap="xs">
                <StaffLink />
                <Anchor component={Link} to="/" size="xs" c="dimmed">
                  {t('embed.poweredBy')}
                </Anchor>
              </Group>
            </Container>
          </Box>
        </AppShell.Main>
      </AppShell>
    </BrandTheme>
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
