import { Alert, Anchor, Badge, Button, Group, Modal, Select, Skeleton, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { countryCodes, regionCodes, type CountryCode, type RegionCode } from '../api/openingHours.ts'
import { useCreateTenant, useSuperadminTenants } from '../api/superadmin.ts'
import { superadminErrorMessage } from '../api/superadminErrors.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'

/** The longest slug the API accepts. */
const maxSlugLength = 50

/** Letters the browser cannot split into a base letter and an accent: German and Serbian Latin, and Serbian Cyrillic. */
const transliterations: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', đ: 'dj',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm',
  н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
}

/** A slug suggested from the restaurant's name, e.g. "Gasthaus zur Mühle" → "gasthaus-zur-muehle". */
function suggestSlug(name: string) {
  return [...name.toLowerCase()]
    .map((letter) => transliterations[letter] ?? letter)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxSlugLength)
    .replace(/^-+|-+$/g, '')
}

function CreateTenantModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createTenant = useCreateTenant()
  // The slug follows the name until the user changes it themselves.
  const [slugEdited, setSlugEdited] = useState(false)

  const form = useForm({
    initialValues: { name: '', slug: '', countryCode: null as CountryCode | null, regionCode: null as RegionCode | null },
    validate: {
      name: (value) => (value.trim().length > 0 ? null : t('superadmin.validation.name')),
      slug: (value) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.trim()) ? null : t('superadmin.errors.invalidSlug')),
      regionCode: (value, values) => (values.countryCode === 'DE' && value === null ? t('openingHours.location.regionRequired') : null),
    },
  })

  const countries = countryCodes.map((code) => ({ value: code, label: t(`openingHours.countries.${code}`) }))
  const regions = regionCodes
    .map((code) => ({ value: code, label: t(`openingHours.regions.${code}`) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const submit = form.onSubmit((values) =>
    createTenant.mutate(
      {
        name: values.name.trim(),
        slug: values.slug.trim(),
        countryCode: values.countryCode,
        regionCode: values.countryCode === 'DE' ? values.regionCode : null,
      },
      {
        onSuccess: (tenant) => {
          notifications.show({ color: 'green', message: t('superadmin.notifications.created', { name: tenant.name }) })
          onClose()
          void navigate(`/superadmin/tenants/${tenant.id}`)
        },
      },
    ),
  )

  const errorMessage = createTenant.error !== null ? superadminErrorMessage(createTenant.error, t) : null

  return (
    <Modal opened onClose={onClose} title={t('superadmin.create.title')}>
      <form onSubmit={submit}>
        <Stack gap="md">
          {createTenant.error !== null &&
            (errorMessage !== null ? (
              <Alert color="red" variant="light">
                {errorMessage}
              </Alert>
            ) : (
              <ErrorAlert error={createTenant.error} />
            ))}
          <TextInput
            label={t('superadmin.fields.name')}
            data-autofocus
            {...form.getInputProps('name')}
            onChange={(event) => {
              form.setFieldValue('name', event.currentTarget.value)
              if (!slugEdited) {
                form.setFieldValue('slug', suggestSlug(event.currentTarget.value))
              }
            }}
          />
          <TextInput
            label={t('superadmin.fields.slug')}
            description={t('superadmin.slugRules', { example: `/r/${form.values.slug || 'zur-linde'}` })}
            maxLength={maxSlugLength}
            {...form.getInputProps('slug')}
            onChange={(event) => {
              setSlugEdited(true)
              form.setFieldValue('slug', event.currentTarget.value)
            }}
          />
          <Select
            label={t('openingHours.location.country')}
            description={t('superadmin.create.locationHint')}
            data={countries}
            clearable
            value={form.values.countryCode}
            onChange={(value) => {
              form.setFieldValue('countryCode', value as CountryCode | null)
              if (value !== 'DE') form.setFieldValue('regionCode', null)
            }}
          />
          {form.values.countryCode === 'DE' && (
            <Select label={t('openingHours.location.region')} data={regions} searchable {...form.getInputProps('regionCode')} />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={createTenant.isPending}>
              {t('superadmin.create.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/** The Superadmin's start page: all restaurants with their status and key figures, a search and "Create restaurant". */
export function SuperadminTenantsPage() {
  const { t } = useTranslation()
  const tenants = useSuperadminTenants()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const query = search.trim().toLowerCase()
  const visible = (tenants.data ?? []).filter(
    (tenant) => query === '' || tenant.name.toLowerCase().includes(query) || tenant.slug.includes(query),
  )

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>{t('superadmin.title')}</Title>
          <Text c="dimmed">{t('superadmin.subtitle')}</Text>
        </Stack>
        <Button onClick={() => setCreating(true)}>{t('superadmin.create.button')}</Button>
      </Group>

      <TextInput
        aria-label={t('superadmin.search')}
        placeholder={t('superadmin.searchPlaceholder')}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        maw={360}
      />

      {tenants.isPending ? (
        <Stack gap="sm">
          <Skeleton h={44} radius="md" />
          <Skeleton h={44} radius="md" />
          <Skeleton h={44} radius="md" />
        </Stack>
      ) : tenants.isError ? (
        <ErrorAlert error={tenants.error} onRetry={() => void tenants.refetch()} />
      ) : visible.length === 0 ? (
        <Text c="dimmed">{t(tenants.data.length === 0 ? 'superadmin.empty' : 'superadmin.noMatch')}</Text>
      ) : (
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" highlightOnHover bg="white" withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('superadmin.fields.name')}</Table.Th>
                <Table.Th>{t('superadmin.fields.slug')}</Table.Th>
                <Table.Th>{t('superadmin.fields.status')}</Table.Th>
                <Table.Th ta="right">{t('superadmin.fields.admins')}</Table.Th>
                <Table.Th ta="right">{t('superadmin.fields.tables')}</Table.Th>
                <Table.Th ta="right">{t('superadmin.fields.upcomingReservations')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((tenant) => (
                <Table.Tr key={tenant.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/superadmin/tenants/${tenant.id}`} fw={500} size="sm" c={tenant.isActive ? undefined : 'dimmed'}>
                      {tenant.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace" c="dimmed">
                      {tenant.slug}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={tenant.isActive ? 'green' : 'gray'}>
                      {t(tenant.isActive ? 'superadmin.status.active' : 'superadmin.status.inactive')}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right">{tenant.adminCount}</Table.Td>
                  <Table.Td ta="right">{tenant.tableCount}</Table.Td>
                  <Table.Td ta="right">{tenant.upcomingReservationCount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {creating && <CreateTenantModal onClose={() => setCreating(false)} />}
    </Stack>
  )
}
