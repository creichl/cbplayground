import { Box, Input, LoadingOverlay, Popover, Skeleton, Stack, Text } from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBookingCalendar } from '../../api/publicBooking.ts'
import { formatLongDate, formatShortDate } from '../../i18n/format.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { ChevronDownIcon } from '../icons.tsx'
import { barInputStyles } from './layout.ts'

type BookingCalendarProps = {
  slug: string
  guests: number
  /** The chosen day, or the preset first free day; null while it is not known yet. */
  value: string | null
  /** The restaurant's today and the last day that can be booked online, "YYYY-MM-DD". */
  minDate: string
  maxDate: string
  onChange: (date: string) => void
}

/**
 * The date in the booking bar: a field with the chosen day that opens the calendar in a popover. Only available days can be
 * chosen; closed days (also past ones and those beyond the booking horizon) are disabled, fully booked ones also struck
 * through. Choosing a day closes the popover.
 */
export function BookingCalendar({ slug, guests, value, minDate, maxDate, onChange }: BookingCalendarProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [opened, setOpened] = useState(false)
  const labelId = useId()
  const valueId = useId()

  return (
    <Input.Wrapper label={t('booking.bar.date')} labelElement="div" labelProps={{ id: labelId }} styles={{ label: barInputStyles.label }} size="md">
      <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" trapFocus returnFocus width={336}>
        <Popover.Target>
          <Input
            component="button"
            type="button"
            pointer
            size="md"
            styles={{ input: { ...barInputStyles.input, textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }}
            rightSection={<ChevronDownIcon />}
            rightSectionPointerEvents="none"
            aria-haspopup="dialog"
            aria-expanded={opened}
            // "Date" and the day it shows.
            aria-labelledby={`${labelId} ${valueId}`}
            disabled={value === null}
            onClick={() => setOpened((open) => !open)}
          >
            {value !== null ? (
              <span id={valueId}>{formatShortDate(value, language)}</span>
            ) : (
              <Skeleton h={16} w={96} component="span" display="inline-block" />
            )}
          </Input>
        </Popover.Target>
        <Popover.Dropdown p={16} role="dialog" aria-labelledby={labelId}>
          {value !== null && (
            <CalendarMonth
              slug={slug}
              guests={guests}
              value={value}
              minDate={minDate}
              maxDate={maxDate}
              onChange={(date) => {
                setOpened(false)
                onChange(date)
              }}
            />
          )}
        </Popover.Dropdown>
      </Popover>
    </Input.Wrapper>
  )
}

function CalendarMonth({ slug, guests, value, minDate, maxDate, onChange }: BookingCalendarProps & { value: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [displayed, setDisplayed] = useState(value)
  const month = displayed.slice(0, 7)
  const calendar = useBookingCalendar(slug, month, guests)
  const status = new Map(calendar.data?.map((day) => [day.date, day.status]))

  return (
    <Stack gap={8}>
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
            const label = formatLongDate(date, language)
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
      <Text size="sm" c="dimmed">
        {t('booking.calendar.legend')}
      </Text>
    </Stack>
  )
}
