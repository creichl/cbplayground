import { AppShell, Container, Group } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'
import { UserMenu } from '../components/UserMenu.tsx'

/** Layout of the platform operator's restaurant management: header with language and user menu, no sidebar. */
export function SuperadminLayout() {
  const { t } = useTranslation()

  return (
    <AppShell header={{ height: 64 }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="sm" justify="space-between" wrap="nowrap" gap="xs">
          <Brand to="/superadmin" area={t('superadmin.label')} />
          <Group gap="xs" wrap="nowrap" miw={0}>
            <LanguageSwitcher />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg" px={0}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
