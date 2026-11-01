import { Alert, Button, Group, Select, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { type Availability, useAvailability, useNextFreeDays } from '../../api/publicBooking.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { barInputStyles } from './layout.ts'

type TimeSlotGridProps = {
  slug: string
  date: string
  guests: number
  value: string | null
  /** The last day that can be booked online, "YYYY-MM-DD", for the next free days. */
  maxDate: string
  /** A hint above the times, e.g. that the chosen time has just been taken. */
  notice: ParseKeys | null
  onChange: (time: string) => void
  onChangeDate: (date: string) => void
}

/** Name of an opening window after the time it starts. */
function periodLabel(start: string): ParseKeys {
  const hour = Number(start.slice(0, 2))
  return hour < 11 ? 'booking.time.morning' : hour < 16 ? 'booking.time.midday' : 'booking.time.evening'
}

/** The opening windows of a day with only their free start times; windows without one are left out. */
function freePeriods(availability: Availability | undefined) {
  return (availability?.periods ?? [])
    .map((period) => ({ ...period, times: period.times.filter((time) => time.available) }))
    .filter((period) => period.times.length > 0)
}

/**
 * The free start times of a day as chips below the booking bar, grouped by opening window; times that are not available
 * are left out. A click on a time leads on. A fully booked day offers the next free days instead.
 */
export function TimeSlotGrid({ slug, date, guests, value, maxDate, notice, onChange, onChangeDate }: TimeSlotGridProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const availability = useAvailability(slug, date, guests)
  const periods = freePeriods(availability.data)
  const full = availability.isSuccess && periods.length === 0
  const nextFreeDays = useNextFreeDays(slug, date, maxDate, guests, full)

  return (
    <Stack gap={16}>
      {notice !== null && (
        <Alert color="yellow" variant="light" role="alert">
          {t(notice)}
        </Alert>
      )}

      {availability.isPending ? (
        // In the shape of the times, so nothing jumps when they arrive.
        <Stack gap={8} aria-hidden="true">
          <Skeleton h={24} w={160} />
          <SimpleGrid cols={{ base: 3, xs: 4, sm: 5 }} spacing={8} verticalSpacing={8}>
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} h={44} radius="xl" />
            ))}
          </SimpleGrid>
        </Stack>
      ) : availability.isError ? (
        <ErrorAlert error={availability.error} onRetry={() => void availability.refetch()} />
      ) : full ? (
        <Stack gap={8}>
          <Text fw={600}>{t('booking.time.noTables')}</Text>
          {nextFreeDays.isPending ? (
            <Group gap={8} aria-hidden="true">
              <Skeleton h={44} w={120} radius="xl" />
              <Skeleton h={44} w={120} radius="xl" />
              <Skeleton h={44} w={120} radius="xl" />
            </Group>
          ) : nextFreeDays.days.length === 0 ? (
            <Text size="sm">{t('booking.time.noFreeDays')}</Text>
          ) : (
            <Group gap={8}>
              {nextFreeDays.days.map((day) => (
                <Button key={day} variant="default" radius="xl" h={44} onClick={() => onChangeDate(day)}>
                  {formatShortDate(day, language)}
                </Button>
              ))}
            </Group>
          )}
        </Stack>
      ) : (
        periods.map((period) => (
          <Stack key={period.start} gap={8}>
            <Group gap={8} align="baseline">
              <Title order={3} ff="text" fz="md" fw={700}>
                {periods.length > 1 ? t(periodLabel(period.start)) : t('booking.time.freeTimes')}
              </Title>
              <Text size="sm" c="dimmed">
                {t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) })}
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 3, xs: 4, sm: 5 }} spacing={8} verticalSpacing={8}>
              {period.times.map(({ time }) => (
                <Button
                  key={time}
                  radius="xl"
                  h={44}
                  px={0}
                  variant={value === time ? 'filled' : 'default'}
                  aria-pressed={value === time}
                  onClick={() => onChange(time)}
                >
                  {formatTime(time, language)}
                </Button>
              ))}
            </SimpleGrid>
          </Stack>
        ))
      )}
    </Stack>
  )
}

type TimeSelectProps = { slug: string; date: string | null; guests: number; value: string | null; onChange: (time: string) => void }

/** The time in the booking bar: the same free times as the chips below it, as a list grouped by opening window. */
export function TimeSelect({ slug, date, guests, value, onChange }: TimeSelectProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const availability = useAvailability(slug, date ?? '', guests, date !== null)
  const periods = freePeriods(availability.data)
  const data = periods.map((period) => ({
    group: `${t(periodLabel(period.start))} · ${t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) })}`,
    items: period.times.map(({ time }) => ({ value: time, label: formatTime(time, language) })),
  }))

  return (
    <Select
      label={t('booking.bar.time')}
      placeholder={t('booking.bar.timePlaceholder')}
      data={data}
      value={periods.some((period) => period.times.some((option) => option.time === value)) ? value : null}
      onChange={(selected) => {
        if (selected !== null) {
          onChange(selected)
        }
      }}
      disabled={periods.length === 0}
      allowDeselect={false}
      size="md"
      styles={barInputStyles}
      comboboxProps={{ shadow: 'md' }}
      maxDropdownHeight={320}
    />
  )
}
