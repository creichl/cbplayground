import { CalendarIcon, ChevronDownIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBookingCalendar } from '../../api/publicBooking.ts'
import { formatLongDate, formatShortDate } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Calendar } from '../../ui/calendar.tsx'
import { Label } from '../../ui/label.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { RequestError } from './RequestError.tsx'

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

/** A local date "YYYY-MM-DD" as a Date at local midnight, as the calendar counts days. */
function toDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** A Date of the calendar as "YYYY-MM-DD". */
function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The field look of the date: as high as the party size beside it. */
const fieldClassName =
  'flex h-12 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-base text-foreground transition-colors focus-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50'

/**
 * The date on the reservation card: a field with the chosen day that opens the calendar in a popover. Only available days
 * can be chosen: closed days, past ones, those beyond the booking horizon and fully booked ones are disabled, fully booked
 * ones also struck through. Choosing a day closes the popover.
 */
export function BookingCalendar({ slug, guests, value, minDate, maxDate, onChange }: BookingCalendarProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [open, setOpen] = useState(false)
  const labelId = useId()
  const valueId = useId()

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label id={labelId} asChild>
        <span>{t('booking.bar.date')}</span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          // "Date" and the day it shows.
          aria-labelledby={`${labelId} ${valueId}`}
          disabled={value === null}
          className={fieldClassName}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground max-sm:hidden" />
            {value !== null ? (
              <span id={valueId} className="truncate">
                {formatShortDate(value, language)}
              </span>
            ) : (
              <Skeleton className="h-4 w-24" />
            )}
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" aria-labelledby={labelId} className="w-auto p-3">
          {value !== null && (
            <CalendarMonth
              slug={slug}
              guests={guests}
              value={value}
              minDate={minDate}
              maxDate={maxDate}
              onChange={(date) => {
                setOpen(false)
                onChange(date)
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function CalendarMonth({ slug, guests, value, minDate, maxDate, onChange }: BookingCalendarProps & { value: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [displayed, setDisplayed] = useState(() => toDate(value))
  const month = toIso(displayed).slice(0, 7)
  const calendar = useBookingCalendar(slug, month, guests)
  const status = new Map(calendar.data?.map((day) => [day.date, day.status]))

  return (
    <div className="flex max-w-80 flex-col gap-2">
      <div aria-busy={calendar.isPending} className={cn('transition-opacity', calendar.isPending && 'opacity-60')}>
        <Calendar
          mode="single"
          required
          selected={toDate(value)}
          onSelect={(date) => onChange(toIso(date))}
          month={displayed}
          onMonthChange={setDisplayed}
          startMonth={toDate(minDate)}
          endMonth={toDate(maxDate)}
          showOutsideDays={false}
          // While the month loads, no day can be chosen yet.
          disabled={(date) => status.get(toIso(date)) !== 'available'}
          modifiers={{ full: (date) => status.get(toIso(date)) === 'full' }}
          modifiersClassNames={{ full: 'line-through' }}
          labels={{
            labelDayButton: (date) => {
              const label = formatLongDate(toIso(date), language)
              const day = status.get(toIso(date))
              return day === 'full'
                ? `${label}, ${t('booking.calendar.full')}`
                : day === 'closed'
                  ? `${label}, ${t('booking.calendar.closed')}`
                  : label
            },
            labelPrevious: () => t('booking.calendar.previousMonth'),
            labelNext: () => t('booking.calendar.nextMonth'),
          }}
        />
      </div>
      {calendar.isError && <RequestError error={calendar.error} onRetry={() => void calendar.refetch()} />}
      <p className="text-xs text-muted-foreground">{t('booking.calendar.legend')}</p>
    </div>
  )
}
