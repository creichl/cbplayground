import { Alert, Anchor, Badge, Button, Group, Modal, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { countryCodes, regionCodes, type CountryCode, type RegionCode } from '../api/openingHours.ts'
import { lastActivityAtUtc, setupDoneCount, setupSteps, type SuperadminTenant, useCreateTenant, useSuperadminTenants } from '../api/superadmin.ts'
import { superadminErrorMessage } from '../api/superadminErrors.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { ActivityTime, KeyFigure, SetupProgress } from '../components/superadmin/TenantFigures.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

/** Which restaurants the list shows. */
type Filter = 'all' | 'active' | 'inactive' | 'setupIncomplete'

const filters: Record<Filter, (tenant: SuperadminTenant) => boolean> = {
  all: () => true,
  active: (tenant) => tenant.isActive,
  inactive: (tenant) => !tenant.isActive,
  setupIncomplete: (tenant) => setupDoneCount(tenant) < setupSteps.length,
}

type Sort = 'name' | 'activity'

/** By name as the API sorts them, or the most recent activity first (online booking or staff sign-in), never active ones last. */
const sorts: Record<Sort, (a: SuperadminTenant, b: SuperadminTenant) => number> = {
  name: () => 0,
  activity: (a, b) => (Date.parse(lastActivityAtUtc(b) ?? '') || 0) - (Date.parse(lastActivityAtUtc(a) ?? '') || 0),
}

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

/**
 * The Superadmin's start page: the platform's key figures, all restaurants with their status, setup and activity,
 * a search, filters, the sorting and "Create restaurant".
 */
export function SuperadminTenantsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('superadmin.title'))
  const tenants = useSuperadminTenants()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [creating, setCreating] = useState(false)

  const all = tenants.data ?? []
  const query = search.trim().toLowerCase()
  // toSorted is stable, so restaurants with the same activity stay sorted by name.
  const visible = all
    .filter((tenant) => query === '' || tenant.name.toLowerCase().includes(query) || tenant.slug.includes(query))
    .filter(filters[filter])
    .toSorted(sorts[sort])

  const activeCount = all.filter(filters.active).length
  const setupIncompleteCount = all.filter(filters.setupIncomplete).length

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>{t('superadmin.title')}</Title>
          <Text c="dimmed">{t('superadmin.subtitle')}</Text>
        </Stack>
        <Button onClick={() => setCreating(true)}>{t('superadmin.create.button')}</Button>
      </Group>

      {tenants.data !== undefined && (
        <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
          <KeyFigure label={t('superadmin.stats.active')} value={`${activeCount} / ${all.length}`} />
          <KeyFigure label={t('superadmin.stats.setupIncomplete')} value={setupIncompleteCount} highlight={setupIncompleteCount > 0} />
          <KeyFigure
            label={t('superadmin.stats.bookingsLast7Days')}
            value={all.reduce((sum, tenant) => sum + tenant.reservationsLast7Days, 0)}
          />
        </SimpleGrid>
      )}

      <Group gap="sm" align="flex-end">
        <TextInput
          aria-label={t('superadmin.search')}
          placeholder={t('superadmin.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={280}
        />
        <SegmentedControl
          aria-label={t('superadmin.filter.label')}
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          data={(['all', 'active', 'inactive', 'setupIncomplete'] as const).map((value) => ({ value, label: t(`superadmin.filter.${value}`) }))}
        />
        <Select
          label={t('superadmin.sort.label')}
          value={sort}
          onChange={(value) => setSort((value as Sort | null) ?? 'name')}
          allowDeselect={false}
          data={(['name', 'activity'] as const).map((value) => ({ value, label: t(`superadmin.sort.${value}`) }))}
          w={200}
        />
      </Group>

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
        <Table.ScrollContainer minWidth={1040}>
          <Table verticalSpacing="sm" highlightOnHover bg="white" withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('superadmin.fields.name')}</Table.Th>
                <Table.Th>{t('superadmin.fields.status')}</Table.Th>
                <Table.Th>{t('superadmin.fields.setup')}</Table.Th>
                <Table.Th ta="right">{t('superadmin.fields.admins')}</Table.Th>
                <Table.Th ta="right">{t('superadmin.fields.tables')}</Table.Th>
                <Table.Th ta="right">{t('superadmin.fields.last7Days')}</Table.Th>
                <Table.Th ta="right">{t('superadmin.fields.next7Days')}</Table.Th>
                <Table.Th>{t('superadmin.fields.lastOnlineBooking')}</Table.Th>
                <Table.Th>{t('superadmin.fields.lastSignIn')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((tenant) => (
                <Table.Tr key={tenant.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/superadmin/tenants/${tenant.id}`} fw={500} size="sm" c={tenant.isActive ? undefined : 'dimmed'}>
                      {tenant.name}
                    </Anchor>
                    <Text size="xs" ff="monospace" c="dimmed">
                      {tenant.slug}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {/* The label keeps its width, so the table does not squeeze it to "Deact…". */}
                    <Badge variant="dot" color={tenant.isActive ? 'green' : 'gray'} styles={{ label: { overflow: 'visible' } }}>
                      {t(tenant.isActive ? 'superadmin.status.active' : 'superadmin.status.inactive')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <SetupProgress tenant={tenant} />
                  </Table.Td>
                  <Table.Td ta="right">{tenant.adminCount}</Table.Td>
                  <Table.Td ta="right">{tenant.tableCount}</Table.Td>
                  <Table.Td ta="right">{tenant.reservationsLast7Days}</Table.Td>
                  <Table.Td ta="right">{tenant.reservationsNext7Days}</Table.Td>
                  <Table.Td>
                    <ActivityTime moment={tenant.lastOnlineBookingAtUtc} />
                  </Table.Td>
                  <Table.Td>
                    <ActivityTime moment={tenant.lastStaffSignInAtUtc} />
                  </Table.Td>
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
