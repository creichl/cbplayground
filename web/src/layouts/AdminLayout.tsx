import { AppShell, Burger, Divider, Group, NavLink } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { Link, matchPath, Outlet, useLocation } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'
import { UserMenu } from '../components/UserMenu.tsx'

const navItems = [
  { to: '/admin', label: 'admin.nav.overview', end: true },
  { to: '/admin/reservations', label: 'admin.nav.reservations', end: false },
  { to: '/admin/tables', label: 'admin.nav.tables', end: false },
  { to: '/admin/profile', label: 'admin.nav.profile', end: false },
  { to: '/admin/areas', label: 'admin.nav.areas', end: false },
  { to: '/admin/opening-hours', label: 'admin.nav.openingHours', end: false },
  { to: '/admin/reservation-settings', label: 'admin.nav.reservationSettings', end: false },
  { to: '/admin/staff', label: 'admin.nav.staff', end: false },
  { to: '/admin/embed', label: 'admin.nav.embed', end: false },
] as const

/** Admin layout: sidebar on desktop, burger menu on small screens. */
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

      <AppShell.Navbar p="sm">
        {navItems.map((item) => (
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
        <Divider my="sm" />
        <NavLink component={Link} to="/frontdesk" label={t('admin.nav.openFrontdesk')} onClick={close} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
