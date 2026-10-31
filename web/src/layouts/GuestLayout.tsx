import { AppShell, Container, Group } from '@mantine/core'
import { Outlet } from 'react-router'
import { Brand } from '../components/Brand.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'

/** Slim, mobile-first layout for guests: product name and language at the top, content in a narrow column. */
export function GuestLayout() {
  return (
    <AppShell header={{ height: 64 }}>
      <AppShell.Header>
        <Container size="sm" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap" gap="xs">
            <Brand to="/" />
            <LanguageSwitcher />
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
