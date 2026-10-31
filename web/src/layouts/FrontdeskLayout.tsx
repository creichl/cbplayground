import { AppShell, Group, Tabs } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'
import { UserMenu } from '../components/UserMenu.tsx'

const tabs = [
  { to: '/frontdesk', label: 'frontdesk.nav.today', end: true },
  { to: '/frontdesk/reservations', label: 'frontdesk.nav.reservations', end: false },
  { to: '/frontdesk/tables', label: 'frontdesk.nav.tables', end: false },
] as const

/** Simplified staff layout without sidebar: the front desk works on a single screen, with slim tabs at the top. */
export function FrontdeskLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const active = tabs.find((tab) => matchPath({ path: tab.to, end: tab.end }, pathname) !== null)?.to ?? null

  return (
    <AppShell header={{ height: 64 }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="xs">
          <Brand to="/frontdesk" area={t('frontdesk.label')} />
          <Group gap="xs" wrap="nowrap" miw={0}>
            <LanguageSwitcher />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Tabs value={active} onChange={(to) => to !== null && void navigate(to)} mb="lg">
          <Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Tab key={tab.to} value={tab.to} fz="md">
                {t(tab.label)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
