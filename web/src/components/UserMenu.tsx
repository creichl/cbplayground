import { Avatar, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type Role, useCurrentUser, useLogout } from '../api/auth.ts'

const roleLabels: Record<Role, ParseKeys> = {
  Superadmin: 'auth.roles.superadmin',
  TenantAdmin: 'auth.roles.tenantAdmin',
  FrontDesk: 'auth.roles.frontDesk',
}

type UserMenuProps = {
  /** Offers a TenantAdmin the way to the admin area, e.g. from the front desk. */
  withAdminLink?: boolean
}

/** Restaurant name, user name and role, and sign-out in the header of the staff layouts. */
export function UserMenu({ withAdminLink = false }: UserMenuProps) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const logout = useLogout()

  if (!currentUser.data) {
    return null
  }
  const { displayName, email, role, tenant } = currentUser.data

  return (
    <Menu position="bottom-end" width={240}>
      <Menu.Target>
        <UnstyledButton aria-label={t('auth.userMenu')} style={{ flexShrink: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Stack gap={0} align="flex-end" visibleFrom="md">
              <Text size="sm" fw={600} lh={1.3}>
                {tenant?.name}
              </Text>
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
            {t(roleLabels[role])}
          </Text>
          <Text size="xs" c="dimmed">
            {email}
          </Text>
        </Stack>
        <Menu.Divider />
        {withAdminLink && role === 'TenantAdmin' && (
          <Menu.Item component={Link} to="/admin">
            {t('auth.toAdmin')}
          </Menu.Item>
        )}
        <Menu.Item color="red" disabled={logout.isPending} onClick={() => logout.mutate()}>
          {t('auth.logout')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
