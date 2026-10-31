import { Avatar, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useCurrentUser, useLogout } from '../api/auth.ts'

/** Restaurant name (none for the Superadmin), user name and sign-out in the header of the staff layouts. */
export function UserMenu() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const logout = useLogout()

  if (!currentUser.data) {
    return null
  }
  const { displayName, email, tenant } = currentUser.data

  return (
    <Menu position="bottom-end" width={240}>
      <Menu.Target>
        <UnstyledButton aria-label={t('auth.userMenu')} style={{ flexShrink: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Stack gap={0} align="flex-end" visibleFrom="md">
              {tenant !== null && (
                <Text size="sm" fw={600} lh={1.3}>
                  {tenant.name}
                </Text>
              )}
              <Text size="xs" c="dimmed" lh={1.3}>
                {displayName}
              </Text>
            </Stack>
            <Avatar name={displayName} color="initials" radius="xl" />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Stack gap={2} px="sm" py="xs">
          {tenant !== null && (
            <Text size="sm" fw={600}>
              {tenant.name}
            </Text>
          )}
          <Text size="sm">{displayName}</Text>
          <Text size="xs" c="dimmed">
            {email}
          </Text>
        </Stack>
        <Menu.Divider />
        <Menu.Item color="red" disabled={logout.isPending} onClick={() => logout.mutate()}>
          {t('auth.logout')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
