import { Anchor, AppShell, Box, Container, Group, Image, Skeleton, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useParams } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { usePublicRestaurant } from '../api/publicBooking.ts'
import { Brand } from '../components/Brand.tsx'
import { BrandTheme } from '../components/BrandTheme.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'

/**
 * Layout for guests. The start page and "not found" keep the platform: product name, staff sign-in and language at the top,
 * content in a narrow column. A restaurant's pages (/r/:slug/…) belong to the restaurant: see RestaurantLayout.
 */
export function GuestLayout() {
  const { slug } = useParams()

  if (slug !== undefined) {
    return <RestaurantLayout slug={slug} />
  }

  return (
    <AppShell header={{ height: 64 }}>
      <AppShell.Header>
        <Container size="sm" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap" gap="xs">
            <Brand to="/" />
            <Group gap="sm" wrap="nowrap" miw={0}>
              <StaffLink />
              <LanguageSwitcher />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="sm" py="xl">
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
function StaffLink() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()

  if (currentUser.data === undefined) {
    return null
  }

  const user = currentUser.data
  return (
    <Anchor component={Link} to={user !== null ? homePath(user.role) : '/login'} size="sm" c="dimmed" truncate>
      {user !== null ? t('guest.toManagement') : t('guest.staffLogin')}
    </Anchor>
  )
}
