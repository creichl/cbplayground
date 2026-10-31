import { Anchor, AppShell, Container, Group } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'

/** Slim, mobile-first layout for guests: product name, staff sign-in and language at the top, content in a narrow column. */
export function GuestLayout() {
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
