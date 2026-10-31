import { AppShell, Button, Group } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, matchPath, Outlet, useLocation } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'
import { UserMenu } from '../components/UserMenu.tsx'

const navItems = [
  { to: '/frontdesk', label: 'frontdesk.today', end: true },
  { to: '/frontdesk/tables', label: 'tableOverview.title', end: false },
] as const

/** Simplified staff layout without sidebar: the front desk works on a single screen, with its few pages in the header. */
export function FrontdeskLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  return (
    <AppShell header={{ height: 64 }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="md" wrap="nowrap" miw={0}>
            <Brand to="/frontdesk" area={t('frontdesk.label')} />
            <Group gap={4} wrap="nowrap" miw={0}>
              {navItems.map((item) => (
                <Button
                  key={item.to}
                  component={Link}
                  to={item.to}
                  variant={matchPath({ path: item.to, end: item.end }, pathname) !== null ? 'light' : 'subtle'}
                  px="xs"
                >
                  {t(item.label)}
                </Button>
              ))}
            </Group>
          </Group>
          <Group gap="xs" wrap="nowrap" miw={0}>
            <LanguageSwitcher />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
