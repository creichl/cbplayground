import { ActionIcon, Alert, Anchor, Badge, Button, Card, Group, Menu, Modal, PasswordInput, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, Title, VisuallyHidden } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  type SuperadminTenant,
  type TenantAdminUser,
  useCreateTenantAdmin,
  useSetTenantActive,
  useSetTenantAdminPassword,
  useSuperadminTenants,
  useTenantAdmins,
  useUpdateTenant,
} from '../api/superadmin.ts'
import { superadminErrorMessage } from '../api/superadminErrors.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { ChevronLeftIcon, DotsVerticalIcon } from '../components/icons.tsx'
import { formatDate } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'
import { NotFoundPage } from './NotFoundPage.tsx'

/** A failed save inside a modal: the specific message for a known error code, otherwise the general error. */
function MutationError({ error }: { error: Error | null }) {
  const { t } = useTranslation()
  if (error === null) {
    return null
  }
  const message = superadminErrorMessage(error, t)
  return message !== null ? (
    <Alert color="red" variant="light">
      {message}
    </Alert>
  ) : (
    <ErrorAlert error={error} />
  )
}

function EditTenantModal({ tenant, onClose }: { tenant: SuperadminTenant; onClose: () => void }) {
  const { t } = useTranslation()
  const updateTenant = useUpdateTenant()

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { name: tenant.name, slug: tenant.slug },
    validate: {
      name: (value) => (value.trim().length > 0 ? null : t('superadmin.validation.name')),
      slug: (value) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.trim()) ? null : t('superadmin.errors.invalidSlug')),
    },
  })

  const submit = form.onSubmit((values) =>
    updateTenant.mutate(
      { id: tenant.id, name: values.name.trim(), slug: values.slug.trim() },
      {
        onSuccess: (updated) => {
          notifications.show({ color: 'green', message: t('superadmin.notifications.updated', { name: updated.name }) })
          onClose()
        },
      },
    ),
  )

  return (
    <Modal opened onClose={onClose} title={t('superadmin.edit.title')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <MutationError error={updateTenant.error} />
          <TextInput label={t('superadmin.fields.name')} data-autofocus key={form.key('name')} {...form.getInputProps('name')} />
          <TextInput
            label={t('superadmin.fields.slug')}
            description={t('superadmin.edit.slugHint')}
            maxLength={50}
            key={form.key('slug')}
            {...form.getInputProps('slug')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={updateTenant.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/** Asks before a restaurant is deactivated or activated, and says what happens. */
function ActiveConfirmModal({ tenant, onClose }: { tenant: SuperadminTenant; onClose: () => void }) {
  const { t } = useTranslation()
  const setActive = useSetTenantActive()
  const activate = !tenant.isActive

  const confirm = () =>
    setActive.mutate(
      { id: tenant.id, active: activate },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: t(activate ? 'superadmin.notifications.activated' : 'superadmin.notifications.deactivated', { name: tenant.name }),
          })
          onClose()
        },
      },
    )

  return (
    <Modal opened onClose={onClose} title={t(activate ? 'superadmin.activateConfirm.title' : 'superadmin.deactivateConfirm.title', { name: tenant.name })}>
      <Stack gap="md">
        {setActive.error !== null && <ErrorAlert error={setActive.error} />}
        <Text size="sm">{t(activate ? 'superadmin.activateConfirm.text' : 'superadmin.deactivateConfirm.text')}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button color={activate ? undefined : 'red'} loading={setActive.isPending} onClick={confirm}>
            {t(activate ? 'superadmin.activate' : 'superadmin.deactivate')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function CreateAdminModal({ tenant, onClose }: { tenant: SuperadminTenant; onClose: () => void }) {
  const { t } = useTranslation()
  const createAdmin = useCreateTenantAdmin(tenant.id)

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { displayName: '', email: '', password: '' },
    validate: {
      displayName: (value) => (value.trim().length > 0 ? null : t('staff.validation.name')),
      email: (value) => (/^\S+@\S+$/.test(value.trim()) ? null : t('staff.validation.email')),
      password: (value) => (value.length > 0 ? null : t('staff.validation.password')),
    },
  })

  const submit = form.onSubmit((values) =>
    createAdmin.mutate(
      { displayName: values.displayName.trim(), email: values.email.trim(), password: values.password },
      {
        onSuccess: (admin) => {
          notifications.show({ color: 'green', message: t('superadmin.notifications.adminCreated', { name: admin.displayName }) })
          onClose()
        },
      },
    ),
  )

  return (
    <Modal opened onClose={onClose} title={t('superadmin.admins.create.title', { name: tenant.name })}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <MutationError error={createAdmin.error} />
          <TextInput label={t('staff.fields.name')} data-autofocus key={form.key('displayName')} {...form.getInputProps('displayName')} />
          <TextInput label={t('staff.fields.email')} type="email" autoComplete="off" key={form.key('email')} {...form.getInputProps('email')} />
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
            <Button type="submit" loading={createAdmin.isPending}>
              {t('superadmin.admins.create.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

function PasswordModal({ tenantId, admin, onClose }: { tenantId: string; admin: TenantAdminUser; onClose: () => void }) {
  const { t } = useTranslation()
  const setPassword = useSetTenantAdminPassword(tenantId)

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { password: '' },
    validate: {
      password: (value) => (value.length > 0 ? null : t('staff.validation.password')),
    },
  })

  const submit = form.onSubmit((values) =>
    setPassword.mutate(
      { id: admin.id, password: values.password },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: t('staff.notifications.passwordSet', { name: admin.displayName }) })
          onClose()
        },
      },
    ),
  )

  return (
    <Modal opened onClose={onClose} title={t('staff.password.title', { name: admin.displayName })}>
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t('superadmin.admins.passwordText')}
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="sm" component="div">
        {children}
      </Text>
    </Stack>
  )
}

function AdminsCard({ tenant }: { tenant: SuperadminTenant }) {
  const { t } = useTranslation()
  const admins = useTenantAdmins(tenant.id)
  const [creating, setCreating] = useState(false)
  const [settingPassword, setSettingPassword] = useState<TenantAdminUser | null>(null)

  return (
    <Card withBorder padding="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>{t('superadmin.admins.title')}</Title>
          <Button variant="light" onClick={() => setCreating(true)}>
            {t('superadmin.admins.create.button')}
          </Button>
        </Group>

        {admins.isPending ? (
          <Skeleton h={88} radius="md" />
        ) : admins.isError ? (
          <ErrorAlert error={admins.error} onRetry={() => void admins.refetch()} />
        ) : admins.data.length === 0 ? (
          <Text c="dimmed" size="sm">
            {t('superadmin.admins.empty')}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('staff.fields.name')}</Table.Th>
                  <Table.Th>{t('staff.fields.email')}</Table.Th>
                  <Table.Th>{t('staff.fields.status')}</Table.Th>
                  <Table.Th w={56}>
                    <VisuallyHidden>{t('staff.actions')}</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {admins.data.map((admin) => (
                  <Table.Tr key={admin.id}>
                    <Table.Td>
                      <Text size="sm" fw={500} c={admin.isActive ? undefined : 'dimmed'}>
                        {admin.displayName}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={admin.isActive ? undefined : 'dimmed'}>
                        {admin.email}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="dot" color={admin.isActive ? 'green' : 'gray'}>
                        {t(admin.isActive ? 'staff.status.active' : 'staff.status.inactive')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={t('staff.actionsFor', { name: admin.displayName })}>
                            <DotsVerticalIcon />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => setSettingPassword(admin)}>{t('staff.password.button')}</Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>

      {creating && <CreateAdminModal tenant={tenant} onClose={() => setCreating(false)} />}
      {settingPassword !== null && <PasswordModal tenantId={tenant.id} admin={settingPassword} onClose={() => setSettingPassword(null)} />}
    </Card>
  )
}

/** One restaurant for the Superadmin: master data, status with (de)activation, booking page and its Tenant Admins. */
export function SuperadminTenantPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const tenants = useSuperadminTenants()
  useDocumentTitle(tenants.data?.find((candidate) => candidate.id === id)?.name ?? t('superadmin.title'))
  const [editing, setEditing] = useState(false)
  const [confirmingActive, setConfirmingActive] = useState(false)

  if (tenants.isPending) {
    return <Skeleton h={320} radius="md" />
  }
  if (tenants.isError) {
    return <ErrorAlert error={tenants.error} onRetry={() => void tenants.refetch()} />
  }
  const tenant = tenants.data.find((candidate) => candidate.id === id)
  if (tenant === undefined) {
    return <NotFoundPage />
  }

  const location =
    tenant.countryCode === null
      ? t('superadmin.noLocation')
      : [t(`openingHours.countries.${tenant.countryCode}`), tenant.regionCode !== null ? t(`openingHours.regions.${tenant.regionCode}`) : null]
          .filter((part) => part !== null)
          .join(', ')

  return (
    <Stack gap="lg">
      <Anchor component={Link} to="/superadmin" size="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ChevronLeftIcon size={16} />
        {t('superadmin.backToList')}
      </Anchor>

      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Group gap="sm">
            <Title order={2}>{tenant.name}</Title>
            <Badge variant="dot" color={tenant.isActive ? 'green' : 'gray'}>
              {t(tenant.isActive ? 'superadmin.status.active' : 'superadmin.status.inactive')}
            </Badge>
          </Group>
          <Text c="dimmed" ff="monospace" size="sm">
            /r/{tenant.slug}
          </Text>
        </Stack>
        <Group gap="xs">
          <Button component="a" href={`/r/${tenant.slug}`} target="_blank" rel="noopener" variant="light">
            {t('overview.viewBookingPage')}
          </Button>
          <Button variant="default" onClick={() => setEditing(true)}>
            {t('superadmin.edit.button')}
          </Button>
          <Button variant={tenant.isActive ? 'outline' : 'filled'} color={tenant.isActive ? 'red' : undefined} onClick={() => setConfirmingActive(true)}>
            {t(tenant.isActive ? 'superadmin.deactivate' : 'superadmin.activate')}
          </Button>
        </Group>
      </Group>

      {!tenant.isActive && (
        <Alert color="gray" variant="light">
          {t('superadmin.inactiveHint')}
        </Alert>
      )}

      <Card withBorder padding="lg">
        <Stack gap="md">
          <Title order={3}>{t('superadmin.masterData')}</Title>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
            <Fact label={t('superadmin.fields.name')}>{tenant.name}</Fact>
            <Fact label={t('superadmin.fields.slug')}>{tenant.slug}</Fact>
            <Fact label={t('superadmin.fields.location')}>{location}</Fact>
            <Fact label={t('superadmin.fields.createdAt')}>
              {formatDate(dayjs(tenant.createdAt).format('YYYY-MM-DD'), i18n.resolvedLanguage ?? 'en')}
            </Fact>
            <Fact label={t('superadmin.fields.tables')}>{tenant.tableCount}</Fact>
            <Fact label={t('superadmin.fields.upcomingReservations')}>{tenant.upcomingReservationCount}</Fact>
          </SimpleGrid>
        </Stack>
      </Card>

      <AdminsCard tenant={tenant} />

      {editing && <EditTenantModal tenant={tenant} onClose={() => setEditing(false)} />}
      {confirmingActive && <ActiveConfirmModal tenant={tenant} onClose={() => setConfirmingActive(false)} />}
    </Stack>
  )
}
