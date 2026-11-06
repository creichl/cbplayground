import { AppShell, Group, Tabs } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { matchPath, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'
import { UserMenu } from '../components/UserMenu.tsx'

/** `keepsDate`: the tab has a chosen day (`?date`), which switching between such tabs keeps; "Today" has none. */
const tabs = [
  { to: '/frontdesk', label: 'frontdesk.nav.today', end: true, keepsDate: false },
  { to: '/frontdesk/reservations', label: 'frontdesk.nav.reservations', end: false, keepsDate: true },
  { to: '/frontdesk/tables', label: 'frontdesk.nav.tables', end: false, keepsDate: true },
] as const

/** Simplified staff layout without sidebar: the front desk works on a single screen, with slim tabs at the top. */
export function FrontdeskLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const active = tabs.find((tab) => matchPath({ path: tab.to, end: tab.end }, pathname) !== null) ?? null
  const date = active?.keepsDate ? searchParams.get('date') : null

  const open = (to: string) => {
    const tab = tabs.find((candidate) => candidate.to === to)
    void navigate(tab?.keepsDate && date !== null ? `${to}?${new URLSearchParams({ date })}` : to)
  }

  return (
    <AppShell header={{ height: 64 }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="xs">
          <Brand to="/frontdesk" area={t('frontdesk.label')} />
          <Group gap="xs" wrap="nowrap" miw={0}>
            <LanguageSwitcher />
            <UserMenu withAdminLink />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Tabs value={active?.to ?? null} onChange={(to) => to !== null && open(to)} mb="lg">
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
