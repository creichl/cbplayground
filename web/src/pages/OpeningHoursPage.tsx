import {
  Alert,
  Button,
  Card,
  Checkbox,
  CloseButton,
  Group,
  Popover,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { TimeInput } from '@mantine/dates'
import { useForm, type FormErrors, type UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.ts'
import {
  countryCodes,
  regionCodes,
  useHolidays,
  useOpeningHours,
  useRestaurantLocation,
  useSaveOpeningHours,
  useSaveRestaurantLocation,
  useSetHolidayOpen,
  type CountryCode,
  type DayOfWeek,
  type OpeningPeriod,
  type RegionCode,
  type RestaurantLocation,
} from '../api/openingHours.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'

/** The week as shown, starting on Monday. */
const weekdays = [
  { dayOfWeek: 1, key: 'monday' },
  { dayOfWeek: 2, key: 'tuesday' },
  { dayOfWeek: 3, key: 'wednesday' },
  { dayOfWeek: 4, key: 'thursday' },
  { dayOfWeek: 5, key: 'friday' },
  { dayOfWeek: 6, key: 'saturday' },
  { dayOfWeek: 0, key: 'sunday' },
] as const satisfies readonly { dayOfWeek: DayOfWeek; key: string }[]

/** The window a day gets when it is switched to open. */
const defaultPeriod = { start: '09:00', end: '17:00' }

type WeekValues = { days: { periods: { start: string; end: string }[] }[] }

// The time input cannot show 24:00, so midnight as the closing time is entered as 00:00.
const toInputEnd = (end: string) => (end === '24:00' ? '00:00' : end)
const toApiEnd = (end: string) => (end === '00:00' ? '24:00' : end)

function minutes(time: string) {
  const [hours, mins] = time.split(':').map(Number)
  return hours * 60 + mins
}

function toWeekValues(periods: OpeningPeriod[]): WeekValues {
  return {
    days: weekdays.map(({ dayOfWeek }) => ({
      periods: periods
        .filter((p) => p.dayOfWeek === dayOfWeek)
        .map((p) => ({ start: p.start, end: toInputEnd(p.end) })),
    })),
  }
}

function toPeriods(values: WeekValues): OpeningPeriod[] {
  return values.days.flatMap((day, index) =>
    day.periods.map((p) => ({ dayOfWeek: weekdays[index].dayOfWeek, start: p.start, end: toApiEnd(p.end) })),
  )
}

/** The same rules as the API: every window needs a start before its end, and windows of a day must not overlap. */
function validateWeek(values: WeekValues, t: TFunction): FormErrors {
  const errors: FormErrors = {}
  values.days.forEach((day, d) => {
    const complete: { index: number; start: number; end: number }[] = []
    day.periods.forEach((period, i) => {
      const path = `days.${d}.periods.${i}`
      if (period.start === '') errors[`${path}.start`] = t('openingHours.validation.required')
      if (period.end === '') errors[`${path}.end`] = t('openingHours.validation.required')
      if (period.start === '' || period.end === '') return

      const start = minutes(period.start)
      const end = minutes(toApiEnd(period.end))
      if (start >= end) {
        errors[`${path}.end`] = t('openingHours.validation.startBeforeEnd')
      } else {
        complete.push({ index: i, start, end })
      }
    })
    complete.sort((a, b) => a.start - b.start)
    for (let k = 1; k < complete.length; k++) {
      if (complete[k].start < complete[k - 1].end) {
        errors[`days.${d}.periods.${complete[k].index}.start`] = t('openingHours.validation.overlap')
      }
    }
  })
  return errors
}

const openingHoursErrors = {
  invalid_time: 'openingHours.validation.invalidTime',
  start_not_before_end: 'openingHours.validation.startBeforeEnd',
  overlapping_periods: 'openingHours.validation.overlap',
} as const

const locationErrors = {
  region_required: 'openingHours.location.regionRequired',
  invalid_region: 'openingHours.location.invalid',
  region_not_allowed: 'openingHours.location.invalid',
  invalid_country: 'openingHours.location.invalid',
} as const

/** The translation key for an error code the API sent, or null for any other error. */
function errorKey<T extends Record<string, string>>(error: Error, keys: T): T[keyof T] | null {
  const code = error instanceof ApiError ? error.code : null
  return code !== null && code in keys ? keys[code as keyof T] : null
}

/** "Copy times to other days": copies the windows of one day to the chosen days. */
function CopyTimesButton({ form, source }: { form: UseFormReturnType<WeekValues>; source: number }) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  const [targets, setTargets] = useState<string[]>([])

  const apply = () => {
    const periods = form.getValues().days[source].periods
    for (const target of targets) {
      form.setFieldValue(
        `days.${target}.periods`,
        periods.map((p) => ({ ...p })),
      )
    }
    setTargets([])
    setOpened(false)
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" withArrow trapFocus>
      <Popover.Target>
        <Button variant="subtle" size="xs" onClick={() => setOpened((o) => !o)}>
          {t('openingHours.weekly.copy')}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Checkbox.Group
          label={t('openingHours.weekly.copyTo', { day: t(`openingHours.weekdays.${weekdays[source].key}`) })}
          value={targets}
          onChange={setTargets}
        >
          <Stack gap="xs" mt="xs">
            {weekdays.map(
              (weekday, index) =>
                index !== source && (
                  <Checkbox key={weekday.key} value={String(index)} label={t(`openingHours.weekdays.${weekday.key}`)} />
                ),
            )}
          </Stack>
        </Checkbox.Group>
        <Button size="xs" mt="md" disabled={targets.length === 0} onClick={apply}>
          {t('openingHours.weekly.copyApply')}
        </Button>
      </Popover.Dropdown>
    </Popover>
  )
}

function WeeklyHoursForm({ periods }: { periods: OpeningPeriod[] }) {
  const { t } = useTranslation()
  const save = useSaveOpeningHours()
  const form = useForm<WeekValues>({
    mode: 'controlled',
    initialValues: toWeekValues(periods),
    validate: (values) => validateWeek(values, t),
  })

  const saveError = save.error !== null ? errorKey(save.error, openingHoursErrors) : null

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        save.mutate(toPeriods(values), { onSuccess: () => notifications.show({ color: 'green', message: t('openingHours.saved') }) }),
      )}
    >
      <Stack gap="md">
        {weekdays.map((weekday, d) => {
          const dayPeriods = form.values.days[d].periods
          const open = dayPeriods.length > 0
          return (
            <Group key={weekday.key} align="flex-start" wrap="wrap" gap="md">
              <Switch
                w={180}
                pt={6}
                label={t(`openingHours.weekdays.${weekday.key}`)}
                checked={open}
                onChange={(event) =>
                  form.setFieldValue(`days.${d}.periods`, event.currentTarget.checked ? [{ ...defaultPeriod }] : [])
                }
              />
              {open ? (
                <Stack gap="xs" style={{ flex: 1 }} miw={260}>
                  {dayPeriods.map((_, i) => (
                    <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
                      <TimeInput
                        aria-label={t('openingHours.weekly.start')}
                        {...form.getInputProps(`days.${d}.periods.${i}.start`)}
                      />
                      <Text pt={6}>–</Text>
                      <TimeInput aria-label={t('openingHours.weekly.end')} {...form.getInputProps(`days.${d}.periods.${i}.end`)} />
                      <CloseButton
                        mt={4}
                        aria-label={t('openingHours.weekly.removePeriod')}
                        onClick={() => form.removeListItem(`days.${d}.periods`, i)}
                      />
                    </Group>
                  ))}
                  <Group gap="xs">
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => form.insertListItem(`days.${d}.periods`, { start: '', end: '' })}
                    >
                      {t('openingHours.weekly.addPeriod')}
                    </Button>
                    <CopyTimesButton form={form} source={d} />
                  </Group>
                </Stack>
              ) : (
                <Text c="dimmed" pt={4}>
                  {t('openingHours.closed')}
                </Text>
              )}
            </Group>
          )
        })}

        {save.error !== null &&
          (saveError !== null ? (
            <Alert color="red" variant="light">
              {t(saveError)}
            </Alert>
          ) : (
            <ErrorAlert error={save.error} />
          ))}

        <Group>
          <Button type="submit" loading={save.isPending}>
            {t('openingHours.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

type LocationValues = { countryCode: CountryCode | null; regionCode: RegionCode | null }

function LocationForm({ location }: { location: RestaurantLocation }) {
  const { t } = useTranslation()
  const save = useSaveRestaurantLocation()
  const form = useForm<LocationValues>({
    mode: 'controlled',
    initialValues: { countryCode: location.countryCode, regionCode: location.regionCode },
    validate: {
      countryCode: (value) => (value === null ? t('openingHours.location.countryRequired') : null),
      regionCode: (value, values) =>
        values.countryCode === 'DE' && value === null ? t('openingHours.location.regionRequired') : null,
    },
  })

  const countries = countryCodes.map((code) => ({ value: code, label: t(`openingHours.countries.${code}`) }))
  const regions = regionCodes
    .map((code) => ({ value: code, label: t(`openingHours.regions.${code}`) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const saveError = save.error !== null ? errorKey(save.error, locationErrors) : null

  return (
    <form
      onSubmit={form.onSubmit((values) => {
        if (values.countryCode === null) return
        save.mutate(
          { countryCode: values.countryCode, regionCode: values.countryCode === 'DE' ? values.regionCode : null },
          { onSuccess: () => notifications.show({ color: 'green', message: t('openingHours.saved') }) },
        )
      })}
    >
      <Stack gap="md">
        <Group align="flex-start" grow preventGrowOverflow={false} wrap="wrap">
          <Select
            label={t('openingHours.location.country')}
            data={countries}
            value={form.values.countryCode}
            error={form.errors.countryCode}
            onChange={(value) => {
              form.setFieldValue('countryCode', value as CountryCode | null)
              if (value !== 'DE') form.setFieldValue('regionCode', null)
            }}
            miw={220}
          />
          {form.values.countryCode === 'DE' && (
            <Select
              label={t('openingHours.location.region')}
              data={regions}
              searchable
              {...form.getInputProps('regionCode')}
              miw={220}
            />
          )}
        </Group>

        {save.error !== null &&
          (saveError !== null ? (
            <Alert color="red" variant="light">
              {t(saveError)}
            </Alert>
          ) : (
            <ErrorAlert error={save.error} />
          ))}

        <Group>
          <Button type="submit" loading={save.isPending}>
            {t('openingHours.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

function HolidayList() {
  const { t, i18n } = useTranslation()
  const holidays = useHolidays()
  const setOpen = useSetHolidayOpen()

  if (holidays.isPending) {
    return (
      <Stack gap="xs">
        <Skeleton h={36} />
        <Skeleton h={36} />
        <Skeleton h={36} />
      </Stack>
    )
  }
  if (holidays.isError) {
    return <ErrorAlert error={holidays.error} onRetry={() => void holidays.refetch()} />
  }
  if (holidays.data.length === 0) {
    return <Text c="dimmed">{t('openingHours.holidays.empty')}</Text>
  }

  const dateFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  // A holiday is a calendar date: build it in local time so the day does not shift.
  const formatDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number)
    return dateFormat.format(new Date(year, month - 1, day))
  }

  return (
    <Stack gap="sm">
      {setOpen.error !== null && <ErrorAlert error={setOpen.error} />}
      <Table verticalSpacing="sm">
        <Table.Tbody>
          {holidays.data.map((holiday) => (
            <Table.Tr key={holiday.date}>
              <Table.Td w={220}>
                <Text size="sm" c="dimmed">
                  {formatDate(holiday.date)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {holiday.keys.map((key) => t(`openingHours.holidayNames.${key}`)).join(' / ')}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Switch
                    labelPosition="left"
                    label={holiday.isOpen ? t('openingHours.open') : t('openingHours.closed')}
                    checked={holiday.isOpen}
                    disabled={setOpen.isPending && setOpen.variables.date === holiday.date}
                    onChange={(event) => setOpen.mutate({ date: holiday.date, isOpen: event.currentTarget.checked })}
                  />
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

/** Admin page: regular opening hours per day of the week, location of the restaurant and upcoming public holidays. */
export function OpeningHoursPage() {
  const { t } = useTranslation()
  const hours = useOpeningHours()
  const location = useRestaurantLocation()

  return (
    <Stack gap="lg">
      <Title order={2}>{t('admin.nav.openingHours')}</Title>

      <Card>
        <Stack gap="md">
          <Stack gap={4}>
            <Title order={3}>{t('openingHours.weekly.title')}</Title>
            <Text c="dimmed" size="sm">
              {t('openingHours.weekly.description')}
            </Text>
          </Stack>
          {hours.isPending ? (
            <Skeleton h={320} />
          ) : hours.isError ? (
            <ErrorAlert error={hours.error} onRetry={() => void hours.refetch()} />
          ) : (
            <WeeklyHoursForm periods={hours.data} />
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Stack gap={4}>
            <Title order={3}>{t('openingHours.location.title')}</Title>
            <Text c="dimmed" size="sm">
              {t('openingHours.location.description')}
            </Text>
          </Stack>
          {location.isPending ? (
            <Skeleton h={100} />
          ) : location.isError ? (
            <ErrorAlert error={location.error} onRetry={() => void location.refetch()} />
          ) : (
            <LocationForm location={location.data} />
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Stack gap={4}>
            <Title order={3}>{t('openingHours.holidays.title')}</Title>
            <Text c="dimmed" size="sm">
              {t('openingHours.holidays.description')}
            </Text>
          </Stack>
          {location.isSuccess &&
            (location.data.countryCode === null ? (
              <Text c="dimmed">{t('openingHours.holidays.noLocation')}</Text>
            ) : (
              <HolidayList />
            ))}
        </Stack>
      </Card>
    </Stack>
  )
}
