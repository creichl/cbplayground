import { AppShell, Burger, Group, NavLink, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { Link, matchPath, Outlet, useLocation } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'
import { UserMenu } from '../components/UserMenu.tsx'

/** The sidebar, grouped by task. "Service screen" leads to the front desk. */
const navGroups = [
  {
    label: 'admin.groups.service',
    items: [
      { to: '/admin', label: 'admin.nav.overview', end: true },
      { to: '/frontdesk', label: 'admin.nav.serviceScreen', end: false },
    ],
  },
  {
    label: 'admin.groups.restaurant',
    items: [
      { to: '/admin/profile', label: 'admin.nav.profile', end: false },
      { to: '/admin/design', label: 'admin.nav.design', end: false },
      { to: '/admin/areas', label: 'admin.nav.areas', end: false },
      { to: '/admin/opening-hours', label: 'admin.nav.openingHours', end: false },
    ],
  },
  {
    label: 'admin.groups.bookings',
    items: [
      { to: '/admin/reservation-settings', label: 'admin.nav.reservationSettings', end: false },
      { to: '/admin/embed', label: 'admin.nav.embed', end: false },
    ],
  },
  {
    label: 'admin.groups.team',
    items: [{ to: '/admin/staff', label: 'admin.nav.staff', end: false }],
  },
] as const

/** Admin layout: the grouped sidebar on desktop, the same groups in the burger menu on small screens. */
export function AdminLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [opened, { toggle, close }] = useDisclosure()

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label={t('admin.toggleNavigation')} />
            <Brand to="/admin" area={t('admin.label')} />
          </Group>
          <Group gap="xs" wrap="nowrap" miw={0}>
            <LanguageSwitcher />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" aria-label={t('admin.navigation')}>
        <Stack gap="md">
          {navGroups.map((group, index) => (
            <Stack key={group.label} gap={2} role="group" aria-labelledby={`admin-nav-group-${index}`}>
              <Text id={`admin-nav-group-${index}`} size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" pb={4}>
                {t(group.label)}
              </Text>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  component={Link}
                  to={item.to}
                  label={t(item.label)}
                  active={matchPath({ path: item.to, end: item.end }, pathname) !== null}
                  onClick={close}
                  variant="light"
                />
              ))}
            </Stack>
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
