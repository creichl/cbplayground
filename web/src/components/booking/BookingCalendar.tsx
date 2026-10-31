import { Box, LoadingOverlay, Stack, Text } from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBookingCalendar } from '../../api/publicBooking.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { formatDate } from './format.ts'

type BookingCalendarProps = {
  slug: string
  guests: number
  value: string | null
  /** The restaurant's today and the last day that can be booked online, "YYYY-MM-DD". */
  minDate: string
  maxDate: string
  onChange: (date: string) => void
}

/** The date picker: only available days can be chosen; closed days are disabled, fully booked ones also struck through. */
export function BookingCalendar({ slug, guests, value, minDate, maxDate, onChange }: BookingCalendarProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [displayed, setDisplayed] = useState(value ?? minDate)
  const month = displayed.slice(0, 7)
  const calendar = useBookingCalendar(slug, month, guests)
  const status = new Map(calendar.data?.map((day) => [day.date, day.status]))

  return (
    <Stack gap="xs">
      <Box pos="relative">
        <LoadingOverlay visible={calendar.isPending} />
        <DatePicker
          value={value}
          onChange={(date) => {
            if (date !== null) {
              onChange(date)
            }
          }}
          date={displayed}
          onDateChange={setDisplayed}
          minDate={minDate}
          maxDate={maxDate}
          maxLevel="month"
          highlightToday
          hideOutsideDates
          weekendDays={[]}
          fullWidth
          size="md"
          excludeDate={(date) => status.get(date) !== 'available'}
          getDayProps={(date) =>
            status.get(date) === 'full' ? { style: { textDecoration: 'line-through' }, title: t('booking.calendar.full') } : {}
          }
          getDayAriaLabel={(date) => {
            const label = formatDate(date, language, { dateStyle: 'full' })
            const day = status.get(date)
            return day === 'full'
              ? `${label}, ${t('booking.calendar.full')}`
              : day === 'closed'
                ? `${label}, ${t('booking.calendar.closed')}`
                : label
          }}
          previousLabel={t('booking.calendar.previousMonth')}
          nextLabel={t('booking.calendar.nextMonth')}
        />
      </Box>
      {calendar.isError && <ErrorAlert error={calendar.error} onRetry={() => void calendar.refetch()} />}
      <Text size="xs" c="dimmed">
        {t('booking.calendar.legend')}
      </Text>
    </Stack>
  )
}
