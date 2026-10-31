import { ActionIcon, Button, Group, Skeleton, Stack, Title } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useRestaurantToday } from '../api/reservations.ts'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons.tsx'
import { ReservationDay } from '../components/reservations/ReservationDay.tsx'
import { datePickerFormatter } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'

/** The reservations of any day, with date navigation. Used by the front desk and the admin. */
export function ReservationsPage() {
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('reservations.title'))
  const today = useRestaurantToday()
  const [searchParams, setSearchParams] = useSearchParams()
  // The day is kept in the address, so a reload or a shared link shows the same day.
  const requested = searchParams.get('date')
  const date = requested !== null && dayjs(requested).format('YYYY-MM-DD') === requested ? requested : today

  const show = (day: string) => setSearchParams(day === today ? {} : { date: day })
  const shift = (days: number) => date !== null && show(dayjs(date).add(days, 'day').format('YYYY-MM-DD'))

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" gap="sm">
        <Title order={2}>{t('reservations.title')}</Title>
        <Group gap="xs" wrap="nowrap" style={{ flex: '1 1 auto', maxWidth: 460 }}>
          <ActionIcon variant="default" size={42} onClick={() => shift(-1)} aria-label={t('reservations.previousDay')} disabled={date === null}>
            <ChevronLeftIcon />
          </ActionIcon>
          <DatePickerInput
            aria-label={t('reservations.date')}
            value={date}
            onChange={(value) => value !== null && show(value)}
            valueFormatter={datePickerFormatter(i18n.resolvedLanguage ?? 'en')}
            size="md"
            miw={0}
            style={{ flex: 1 }}
          />
          <ActionIcon variant="default" size={42} onClick={() => shift(1)} aria-label={t('reservations.nextDay')} disabled={date === null}>
            <ChevronRightIcon />
          </ActionIcon>
          <Button variant="light" size="md" onClick={() => today !== null && show(today)} disabled={date === today}>
            {t('reservations.today')}
          </Button>
        </Group>
      </Group>
      {today === null || date === null ? <Skeleton h={320} radius="md" /> : <ReservationDay date={date} today={today} />}
    </Stack>
  )
}
