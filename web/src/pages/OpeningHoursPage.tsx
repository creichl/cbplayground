import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  CloseButton,
  Group,
  Modal,
  Popover,
  Radio,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { DatePickerInput, TimeInput } from '@mantine/dates'
import { useForm, type FormErrors, type UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import type { ParseKeys, TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
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
import {
  maxNoteLength,
  maxSpecialDayDays,
  type SpecialDay,
  type SpecialDayError,
  type SpecialDayKind,
  type SpecialDaySaveResult,
  useDeleteSpecialDay,
  useSaveSpecialDay,
  useSpecialDays,
} from '../api/specialDays.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { StatusBadge } from '../components/reservations/StatusBadge.tsx'
import { datePickerFormatter, formatDate, formatShortDate, formatTime } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'

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

/**
 * The same rules as the API for the windows of one day (as entered, 00:00 as the end is midnight): every window needs
 * a start before its end, and the windows must not overlap. Adds the errors under `path` ("….periods").
 */
function validatePeriods(periods: { start: string; end: string }[], path: string, errors: FormErrors, t: TFunction) {
  const complete: { index: number; start: number; end: number }[] = []
  periods.forEach((period, i) => {
    const periodPath = `${path}.${i}`
    if (period.start === '') errors[`${periodPath}.start`] = t('openingHours.validation.required')
    if (period.end === '') errors[`${periodPath}.end`] = t('openingHours.validation.required')
    if (period.start === '' || period.end === '') return

    const start = minutes(period.start)
    const end = minutes(toApiEnd(period.end))
    if (start >= end) {
      errors[`${periodPath}.end`] = t('openingHours.validation.startBeforeEnd')
    } else {
      complete.push({ index: i, start, end })
    }
  })
  complete.sort((a, b) => a.start - b.start)
  for (let k = 1; k < complete.length; k++) {
    if (complete[k].start < complete[k - 1].end) {
      errors[`${path}.${complete[k].index}.start`] = t('openingHours.validation.overlap')
    }
  }
}

function validateWeek(values: WeekValues, t: TFunction): FormErrors {
  const errors: FormErrors = {}
  values.days.forEach((day, d) => validatePeriods(day.periods, `days.${d}.periods`, errors, t))
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

const specialDayErrors: Record<SpecialDayError, ParseKeys> = {
  invalid_date: 'openingHours.specialDays.validation.dateRequired',
  from_after_to: 'openingHours.specialDays.validation.dateRequired',
  range_too_long: 'openingHours.specialDays.validation.rangeTooLong',
  invalid_kind: 'openingHours.specialDays.validation.kindRequired',
  invalid_note: 'openingHours.specialDays.validation.noteTooLong',
  periods_required: 'openingHours.specialDays.validation.periodsRequired',
  invalid_time: 'openingHours.validation.invalidTime',
  start_not_before_end: 'openingHours.validation.startBeforeEnd',
  overlapping_periods: 'openingHours.validation.overlap',
  overlapping_special_days: 'openingHours.specialDays.validation.overlapping',
}

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

  return (
    <Stack gap="sm">
      {setOpen.error !== null && <ErrorAlert error={setOpen.error} />}
      <Table verticalSpacing="sm">
        <Table.Tbody>
          {holidays.data.map((holiday) => (
            <Table.Tr key={holiday.date}>
              <Table.Td w={220}>
                <Text size="sm" c="dimmed">
                  {formatDate(holiday.date, i18n.resolvedLanguage ?? 'en')}
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

type SpecialDayValues = {
  range: [string | null, string | null]
  kind: SpecialDayKind
  periods: { start: string; end: string }[]
  note: string
}

function toSpecialDayValues(specialDay: SpecialDay | null): SpecialDayValues {
  if (specialDay === null) {
    return { range: [null, null], kind: 'Closed', periods: [{ ...defaultPeriod }], note: '' }
  }
  return {
    range: [specialDay.from, specialDay.to],
    kind: specialDay.kind,
    periods:
      specialDay.periods.length > 0 ? specialDay.periods.map((p) => ({ start: p.start, end: toInputEnd(p.end) })) : [{ ...defaultPeriod }],
    note: specialDay.note ?? '',
  }
}

/** Creates or changes a closing period or a day with special hours. */
function SpecialDayModal({
  specialDay,
  onClose,
  onSaved,
}: {
  specialDay: SpecialDay | null
  onClose: () => void
  onSaved: (result: SpecialDaySaveResult) => void
}) {
  const { t, i18n } = useTranslation()
  const save = useSaveSpecialDay()
  const form = useForm<SpecialDayValues>({
    mode: 'controlled',
    initialValues: toSpecialDayValues(specialDay),
    validate: (values) => {
      const errors: FormErrors = {}
      const [from, to] = values.range
      if (from === null || to === null) {
        errors.range = t('openingHours.specialDays.validation.dateRequired')
      } else if (dayjs(to).diff(dayjs(from), 'day') + 1 > maxSpecialDayDays) {
        errors.range = t('openingHours.specialDays.validation.rangeTooLong')
      }
      if (values.note.trim().length > maxNoteLength) {
        errors.note = t('openingHours.specialDays.validation.noteTooLong')
      }
      if (values.kind === 'SpecialHours') {
        if (values.periods.length === 0) {
          errors.periods = t('openingHours.specialDays.validation.periodsRequired')
        }
        validatePeriods(values.periods, 'periods', errors, t)
      }
      return errors
    },
  })

  const errorCode = save.error instanceof ApiError ? save.error.code : null
  const saveError = errorCode !== null && errorCode in specialDayErrors ? specialDayErrors[errorCode as SpecialDayError] : null

  const submit = form.onSubmit((values) => {
    const [from, to] = values.range
    if (from === null || to === null) return
    save.mutate(
      {
        id: specialDay?.id ?? null,
        input: {
          from,
          to,
          kind: values.kind,
          note: values.note.trim() === '' ? null : values.note.trim(),
          periods: values.kind === 'SpecialHours' ? values.periods.map((p) => ({ start: p.start, end: toApiEnd(p.end) })) : [],
        },
      },
      {
        onSuccess: (result) => {
          notifications.show({ color: 'green', message: t('openingHours.saved') })
          onSaved(result)
        },
      },
    )
  })

  return (
    <Modal
      opened
      onClose={onClose}
      title={specialDay === null ? t('openingHours.specialDays.addTitle') : t('openingHours.specialDays.editTitle')}
      size="lg"
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <DatePickerInput
            type="range"
            allowSingleDateInRange
            label={t('openingHours.specialDays.dates')}
            description={t('openingHours.specialDays.datesDescription')}
            valueFormatter={datePickerFormatter(i18n.resolvedLanguage ?? 'en')}
            {...form.getInputProps('range')}
          />
          <Radio.Group label={t('openingHours.specialDays.kind')} {...form.getInputProps('kind')}>
            <Group mt="xs">
              <Radio value="Closed" label={t('openingHours.specialDays.kinds.Closed')} />
              <Radio value="SpecialHours" label={t('openingHours.specialDays.kinds.SpecialHours')} />
            </Group>
          </Radio.Group>
          {form.values.kind === 'SpecialHours' && (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                {t('openingHours.specialDays.periods')}
              </Text>
              {form.values.periods.map((_, i) => (
                <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
                  <TimeInput aria-label={t('openingHours.weekly.start')} {...form.getInputProps(`periods.${i}.start`)} />
                  <Text pt={6}>–</Text>
                  <TimeInput aria-label={t('openingHours.weekly.end')} {...form.getInputProps(`periods.${i}.end`)} />
                  <CloseButton
                    mt={4}
                    aria-label={t('openingHours.weekly.removePeriod')}
                    onClick={() => form.removeListItem('periods', i)}
                  />
                </Group>
              ))}
              {typeof form.errors.periods === 'string' && (
                <Text c="red" size="sm">
                  {form.errors.periods}
                </Text>
              )}
              <Group>
                <Button variant="subtle" size="xs" onClick={() => form.insertListItem('periods', { start: '', end: '' })}>
                  {t('openingHours.weekly.addPeriod')}
                </Button>
              </Group>
              <Text c="dimmed" size="xs">
                {t('openingHours.specialDays.periodsDescription')}
              </Text>
            </Stack>
          )}
          <TextInput
            label={t('openingHours.specialDays.note')}
            placeholder={t('openingHours.specialDays.notePlaceholder')}
            maxLength={maxNoteLength}
            {...form.getInputProps('note')}
          />

          {save.error !== null &&
            (saveError !== null ? (
              <Alert color="red" variant="light">
                {t(saveError)}
              </Alert>
            ) : (
              <ErrorAlert error={save.error} />
            ))}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('openingHours.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/** The reservations that lie in a saved closing period or outside its special hours; they stay as they are. */
function AffectedReservationsAlert({ result, onClose }: { result: SpecialDaySaveResult; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const closed = result.specialDay.kind === 'Closed'

  return (
    <Alert
      color="orange"
      variant="light"
      withCloseButton
      closeButtonLabel={t('common.close')}
      onClose={onClose}
      title={
        closed
          ? t('openingHours.specialDays.affected.titleClosed', { count: result.affectedCount })
          : t('openingHours.specialDays.affected.titleSpecialHours', { count: result.affectedCount })
      }
    >
      <Stack gap="sm">
        <Text size="sm">{t('openingHours.specialDays.affected.text')}</Text>
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {result.affectedReservations.map((reservation) => (
              <Table.Tr key={reservation.id}>
                <Table.Td>
                  <Text size="sm">
                    {formatShortDate(reservation.date, language)}, {formatTime(reservation.time, language)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {reservation.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {t('booking.guestsCount', { count: reservation.guests })} · {t('booking.tableNumber', { number: reservation.tableNumber })}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={reservation.status} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group>
          <Button component={Link} to={`/admin/reservations?date=${result.affectedReservations[0].date}`} size="xs" variant="white" color="orange">
            {t('openingHours.specialDays.affected.link')}
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}

/** The upcoming closing periods and days with special hours, with adding, changing and deleting. */
function SpecialDaysSection() {
  const { t, i18n } = useTranslation()
  const specialDays = useSpecialDays()
  const remove = useDeleteSpecialDay()
  // null: no modal; 'new': a new entry.
  const [editing, setEditing] = useState<SpecialDay | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SpecialDay | null>(null)
  const [affected, setAffected] = useState<SpecialDaySaveResult | null>(null)

  const language = i18n.resolvedLanguage ?? 'en'
  const formatRange = (specialDay: SpecialDay) =>
    specialDay.from === specialDay.to
      ? formatDate(specialDay.from, language)
      : `${formatDate(specialDay.from, language)} – ${formatDate(specialDay.to, language)}`

  return (
    <Stack gap="md">
      {affected !== null && <AffectedReservationsAlert result={affected} onClose={() => setAffected(null)} />}

      {specialDays.isPending ? (
        <Stack gap="xs">
          <Skeleton h={36} />
          <Skeleton h={36} />
        </Stack>
      ) : specialDays.isError ? (
        <ErrorAlert error={specialDays.error} onRetry={() => void specialDays.refetch()} />
      ) : specialDays.data.length === 0 ? (
        <Text c="dimmed">{t('openingHours.specialDays.empty')}</Text>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="sm">
            <Table.Tbody>
              {specialDays.data.map((specialDay) => (
                <Table.Tr key={specialDay.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {formatRange(specialDay)}
                    </Text>
                    {specialDay.note !== null && (
                      <Text size="sm" c="dimmed">
                        {specialDay.note}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Badge color={specialDay.kind === 'Closed' ? 'red' : 'blue'} variant="light">
                        {t(`openingHours.specialDays.kinds.${specialDay.kind}`)}
                      </Badge>
                      {specialDay.periods.length > 0 && (
                        <Text size="sm">{specialDay.periods
                            .map((p) => t('common.timeRange', { start: formatTime(p.start, language), end: formatTime(p.end, language) }))
                            .join(', ')}</Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Button variant="subtle" size="xs" onClick={() => setEditing(specialDay)}>
                        {t('openingHours.specialDays.edit')}
                      </Button>
                      <Button
                        variant="subtle"
                        size="xs"
                        color="red"
                        onClick={() => {
                          remove.reset()
                          setDeleting(specialDay)
                        }}
                      >
                        {t('openingHours.specialDays.delete')}
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Group>
        <Button variant="light" onClick={() => setEditing('new')}>
          {t('openingHours.specialDays.add')}
        </Button>
      </Group>

      {editing !== null && (
        <SpecialDayModal
          specialDay={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null)
            setAffected(result.affectedCount > 0 ? result : null)
          }}
        />
      )}

      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title={t('openingHours.specialDays.deleteTitle')}>
        <Stack gap="md">
          {deleting !== null && <Text size="sm">{t('openingHours.specialDays.deleteText', { dates: formatRange(deleting) })}</Text>}
          {remove.error !== null && <ErrorAlert error={remove.error} />}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() => deleting !== null && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
            >
              {t('openingHours.specialDays.deleteConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

/**
 * Admin page: regular opening hours per day of the week, closing days and special hours, location of the restaurant
 * and upcoming public holidays.
 */
export function OpeningHoursPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.nav.openingHours'))
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
            <Title order={3}>{t('openingHours.specialDays.title')}</Title>
            <Text c="dimmed" size="sm">
              {t('openingHours.specialDays.description')}
            </Text>
          </Stack>
          <SpecialDaysSection />
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
