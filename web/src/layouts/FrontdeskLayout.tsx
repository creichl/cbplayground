import { AppShell, Group } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'

/** Simplified staff layout without sidebar: the front desk works on a single screen. */
export function FrontdeskLayout() {
  const { t } = useTranslation()

  return (
    <AppShell header={{ height: 64 }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="xs">
          <Brand to="/frontdesk" area={t('frontdesk.label')} />
          <LanguageSwitcher />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
