import { ActionIcon, Alert, Badge, Button, Group, Menu, Modal, PasswordInput, Select, Skeleton, Stack, Table, Text, TextInput, Title, VisuallyHidden } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '../api/auth.ts'
import { ApiError } from '../api/client.ts'
import { type StaffRole, type StaffUser, useCreateStaff, useSetStaffActive, useSetStaffPassword, useStaff, useUpdateStaff } from '../api/staff.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'

const roleLabels = {
  TenantAdmin: 'staff.roles.tenantAdmin',
  FrontDesk: 'staff.roles.frontDesk',
} as const

/** The error codes of /api/admin/staff that the user can run into, and their texts. */
const staffErrors = {
  email_taken: 'staff.errors.emailTaken',
  invalid_email: 'staff.errors.invalidEmail',
  password_too_weak: 'staff.errors.passwordTooWeak',
  last_admin: 'staff.errors.lastAdmin',
  cannot_deactivate_self: 'staff.errors.cannotDeactivateSelf',
} as const

/** The translated text for a known error code of the staff API, otherwise null. */
function staffErrorMessage(error: Error, t: TFunction) {
  const code = error instanceof ApiError ? error.code : null
  return code !== null && code in staffErrors ? t(staffErrors[code as keyof typeof staffErrors]) : null
}

/** A failed save inside a modal: the specific message for a known error code, otherwise the general error. */
function MutationError({ error }: { error: Error | null }) {
  const { t } = useTranslation()
  if (error === null) {
    return null
  }
  const message = staffErrorMessage(error, t)
  return message !== null ? (
    <Alert color="red" variant="light">
      {message}
    </Alert>
  ) : (
    <ErrorAlert error={error} />
  )
}

function useRoleOptions() {
  const { t } = useTranslation()
  return (Object.keys(roleLabels) as StaffRole[]).map((role) => ({ value: role, label: t(roleLabels[role]) }))
}

function CreateStaffModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const createStaff = useCreateStaff()
  const roleOptions = useRoleOptions()

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { displayName: '', email: '', role: 'FrontDesk' as StaffRole, password: '' },
    validate: {
      displayName: (value) => (value.trim().length > 0 ? null : t('staff.validation.name')),
      email: (value) => (/^\S+@\S+$/.test(value.trim()) ? null : t('staff.validation.email')),
      password: (value) => (value.length > 0 ? null : t('staff.validation.password')),
    },
  })

  const submit = form.onSubmit((values) =>
    createStaff.mutate(
      { displayName: values.displayName.trim(), email: values.email.trim(), role: values.role, password: values.password },
      {
        onSuccess: (user) => {
          notifications.show({ color: 'green', message: t('staff.notifications.created', { name: user.displayName }) })
          onClose()
        },
      },
    ),
  )

  return (
    <Modal opened onClose={onClose} title={t('staff.create.title')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <MutationError error={createStaff.error} />
          <TextInput label={t('staff.fields.name')} data-autofocus key={form.key('displayName')} {...form.getInputProps('displayName')} />
          <TextInput label={t('staff.fields.email')} type="email" autoComplete="off" key={form.key('email')} {...form.getInputProps('email')} />
          <Select label={t('staff.fields.role')} data={roleOptions} allowDeselect={false} key={form.key('role')} {...form.getInputProps('role')} />
          <PasswordInput
            label={t('staff.fields.startPassword')}
            description={t('staff.passwordRules')}
            autoComplete="new-password"
            key={form.key('password')}
            {...form.getInputProps('password')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={createStaff.isPending}>
              {t('staff.create.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

function EditStaffModal({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const { t } = useTranslation()
  const updateStaff = useUpdateStaff()
  const roleOptions = useRoleOptions()

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { displayName: user.displayName, role: user.role },
    validate: {
      displayName: (value) => (value.trim().length > 0 ? null : t('staff.validation.name')),
    },
  })

  const submit = form.onSubmit((values) =>
    updateStaff.mutate(
      { id: user.id, displayName: values.displayName.trim(), role: values.role },
      {
        onSuccess: (updated) => {
          notifications.show({ color: 'green', message: t('staff.notifications.updated', { name: updated.displayName }) })
          onClose()
        },
      },
    ),
  )

  return (
    <Modal opened onClose={onClose} title={t('staff.edit.title')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <MutationError error={updateStaff.error} />
          <TextInput label={t('staff.fields.email')} value={user.email} disabled />
          <TextInput label={t('staff.fields.name')} data-autofocus key={form.key('displayName')} {...form.getInputProps('displayName')} />
          <Select label={t('staff.fields.role')} data={roleOptions} allowDeselect={false} key={form.key('role')} {...form.getInputProps('role')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={updateStaff.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

function PasswordModal({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const { t } = useTranslation()
  const setPassword = useSetStaffPassword()

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { password: '' },
    validate: {
      password: (value) => (value.length > 0 ? null : t('staff.validation.password')),
    },
  })

  const submit = form.onSubmit((values) =>
    setPassword.mutate(
      { id: user.id, password: values.password },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: t('staff.notifications.passwordSet', { name: user.displayName }) })
          onClose()
        },
      },
    ),
  )

  return (
    <Modal opened onClose={onClose} title={t('staff.password.title', { name: user.displayName })}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t('staff.password.text')}
          </Text>
          <MutationError error={setPassword.error} />
          <PasswordInput
            label={t('staff.fields.newPassword')}
            description={t('staff.passwordRules')}
            autoComplete="new-password"
            data-autofocus
            key={form.key('password')}
            {...form.getInputProps('password')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={setPassword.isPending}>
              {t('staff.password.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/** Staff management: the users of the admin's restaurant, with create, edit, password and (de)activation. */
export function StaffPage() {
  const { t } = useTranslation()
  const staff = useStaff()
  const currentUser = useCurrentUser()
  const setActive = useSetStaffActive()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<StaffUser | null>(null)
  const [settingPassword, setSettingPassword] = useState<StaffUser | null>(null)

  const changeActive = (user: StaffUser, active: boolean) =>
    setActive.mutate(
      { id: user.id, active },
      {
        onSuccess: () =>
          notifications.show({
            color: 'green',
            message: t(active ? 'staff.notifications.activated' : 'staff.notifications.deactivated', { name: user.displayName }),
          }),
        onError: (error) =>
          notifications.show({ color: 'red', title: t('errors.title'), message: staffErrorMessage(error, t) ?? t('staff.errors.actionFailed') }),
      },
    )

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>{t('staff.title')}</Title>
          <Text c="dimmed">{t('staff.subtitle')}</Text>
        </Stack>
        <Button onClick={() => setCreating(true)}>{t('staff.create.button')}</Button>
      </Group>

      {staff.isPending ? (
        <Stack gap="sm">
          <Skeleton h={44} radius="md" />
          <Skeleton h={44} radius="md" />
          <Skeleton h={44} radius="md" />
        </Stack>
      ) : staff.isError ? (
        <ErrorAlert error={staff.error} onRetry={() => void staff.refetch()} />
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm" highlightOnHover bg="white" withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('staff.fields.name')}</Table.Th>
                <Table.Th>{t('staff.fields.email')}</Table.Th>
                <Table.Th>{t('staff.fields.role')}</Table.Th>
                <Table.Th>{t('staff.fields.status')}</Table.Th>
                <Table.Th w={56}>
                  <VisuallyHidden>{t('staff.actions')}</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {staff.data.map((user) => {
                const isSelf = user.id === currentUser.data?.id
                return (
                  <Table.Tr key={user.id}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" fw={500} c={user.isActive ? undefined : 'dimmed'}>
                          {user.displayName}
                        </Text>
                        {isSelf && (
                          <Badge size="xs" variant="outline" color="gray">
                            {t('staff.you')}
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={user.isActive ? undefined : 'dimmed'}>
                        {user.email}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={user.role === 'TenantAdmin' ? 'brand' : 'gray'}>
                        {t(roleLabels[user.role])}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="dot" color={user.isActive ? 'green' : 'gray'}>
                        {t(user.isActive ? 'staff.status.active' : 'staff.status.inactive')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={t('staff.actionsFor', { name: user.displayName })}>
                            ⋮
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => setEditing(user)}>{t('staff.edit.button')}</Menu.Item>
                          <Menu.Item onClick={() => setSettingPassword(user)}>{t('staff.password.button')}</Menu.Item>
                          <Menu.Divider />
                          {user.isActive ? (
                            <Menu.Item color="red" disabled={isSelf || setActive.isPending} onClick={() => changeActive(user, false)}>
                              {t('staff.deactivate')}
                            </Menu.Item>
                          ) : (
                            <Menu.Item disabled={setActive.isPending} onClick={() => changeActive(user, true)}>
                              {t('staff.activate')}
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {creating && <CreateStaffModal onClose={() => setCreating(false)} />}
      {editing !== null && <EditStaffModal user={editing} onClose={() => setEditing(null)} />}
      {settingPassword !== null && <PasswordModal user={settingPassword} onClose={() => setSettingPassword(null)} />}
    </Stack>
  )
}
