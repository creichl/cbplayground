import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type CalendarDay, monthsBetween, useBookingCalendar, useBookingCalendarMonths } from '../../api/publicBooking.ts'
import { formatLongDate, formatShortDate, formatWeekday } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Button } from '../../ui/button.tsx'
import { Calendar } from '../../ui/calendar.tsx'
import { Label } from '../../ui/label.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.tsx'
import { RequestError } from './RequestError.tsx'
import { addDays } from './useBookingFlow.ts'

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

/** How many days the strip shows, from today on. */
const stripDays = 14

/** A local date "YYYY-MM-DD" as a Date at local midnight, as the calendar counts days. */
function toDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** A Date of the calendar as "YYYY-MM-DD". */
function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The month "YYYY-MM" after the month of a date "YYYY-MM-DD" or a month "YYYY-MM". */
function nextMonth(date: string) {
  const [year, month] = date.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

/** Scrolls without the smooth motion when the device asks for less motion. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion')
    ? 'auto'
    : 'smooth'
}

/**
 * The date on the reservation card: a strip of the next 14 days (weekday and day number) in the card's full width to choose
 * with one tap, and "More dates" beside its label, which opens the calendar in a popover for the days after them. Available days have a dot; closed days (also those
 * beyond the booking horizon) and fully booked ones are struck through and cannot be chosen, and their names say why. The
 * chosen day is filled and scrolled into view. The strip scrolls sideways, snapping to the days, with arrows on desktops;
 * the arrow keys move between the days (one tab stop for the whole strip). The current and the next month are loaded
 * together.
 */
export function BookingCalendar({ slug, guests, value, minDate, maxDate, onChange }: BookingCalendarProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const labelId = useId()
  const [open, setOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const days = Array.from({ length: stripDays }, (_, i) => addDays(minDate, i)).filter((day) => day <= maxDate)
  const months = monthsBetween(minDate, nextMonth(minDate) + '-01').filter((month) => month <= maxDate.slice(0, 7))
  const calendar = useBookingCalendarMonths(slug, months, guests)
  const status = new Map<string, CalendarDay['status']>(calendar.days.map((day) => [day.date, day.status]))
  const valueInStrip = value !== null && days.includes(value)

  // The one day of the strip the Tab key reaches: the chosen one, else the first.
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const tabDay = focusDay !== null && days.includes(focusDay) ? focusDay : valueInStrip ? value : days[0]

  const dayButton = (day: string) => scrollerRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`) ?? null

  /** Brings a day into view inside the strip, without scrolling the page. */
  const reveal = (day: string, behavior: ScrollBehavior) => {
    const scroller = scrollerRef.current
    const button = dayButton(day)
    if (scroller === null || button === null) {
      return
    }
    const left = button.offsetLeft - scroller.offsetLeft
    const right = left + button.offsetWidth
    if (left < scroller.scrollLeft || right > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollTo({ left: left - (scroller.clientWidth - button.offsetWidth) / 2, behavior })
    }
  }

  // The chosen day comes into view: at once when the card appears, smoothly when it changes.
  const revealed = useRef(false)
  useLayoutEffect(() => {
    if (value !== null && valueInStrip) {
      reveal(value, revealed.current ? scrollBehavior() : 'auto')
      revealed.current = true
    }
  }, [value, valueInStrip])

  // Whether the strip can scroll further to either side, for the arrows.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller === null) {
      return
    }
    const update = () =>
      setEdges({ start: scroller.scrollLeft <= 1, end: scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1 })
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  const page = (direction: 1 | -1) => {
    const scroller = scrollerRef.current
    scroller?.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: scrollBehavior() })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = days.indexOf(tabDay)
    const target =
      event.key === 'ArrowRight' ? days[Math.min(index + 1, days.length - 1)]
        : event.key === 'ArrowLeft' ? days[Math.max(index - 1, 0)]
          : event.key === 'Home' ? days[0]
            : event.key === 'End' ? days[days.length - 1]
              : null
    if (target == null) {
      return
    }
    event.preventDefault()
    setFocusDay(target)
    dayButton(target)?.focus({ preventScroll: true })
    reveal(target, scrollBehavior())
  }

  const dayName = (day: string) => {
    const state = status.get(day)
    const label = formatLongDate(day, language)
    return state === undefined ? label : `${label}, ${t(state === 'available' ? 'booking.calendar.available' : state === 'full' ? 'booking.calendar.full' : 'booking.calendar.closed')}`
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col gap-1.5">
      {/* The label, and on the right the arrows (desktops) and "More dates", so the strip has the card's full width. */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Label id={labelId} asChild>
          <span>{t('booking.bar.date')}</span>
        </Label>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('booking.calendar.earlierDays')}
            disabled={edges.start}
            onClick={() => page(-1)}
            className="size-8 rounded-full max-sm:hidden touch:hidden"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('booking.calendar.laterDays')}
            disabled={edges.end}
            onClick={() => page(1)}
            className="size-8 rounded-full max-sm:hidden touch:hidden"
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              disabled={value === null}
              aria-label={value !== null && !valueInStrip ? `${t('booking.calendar.moreDates')}: ${formatLongDate(value, language)}` : t('booking.calendar.moreDates')}
              className={cn(
                'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap press focus-ring disabled:cursor-not-allowed disabled:opacity-50 touch:h-11',
                value !== null && !valueInStrip
                  ? 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover'
                  : 'border-input bg-background hover:border-primary hover:bg-primary-50 dark:hover:bg-accent',
              )}
            >
              <CalendarIcon aria-hidden="true" className="size-4" />
              {value !== null && !valueInStrip ? formatShortDate(value, language) : t('booking.calendar.moreDates')}
            </PopoverTrigger>
            <PopoverContent align="end" aria-label={t('booking.bar.date')} className="w-auto p-3">
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
      </div>
      {/* The padding keeps the focus rings inside the strip, which clips what is outside it. */}
      <div
        ref={scrollerRef}
        onKeyDown={onKeyDown}
        aria-busy={calendar.days.length === 0}
        className="relative -m-1 flex min-w-0 snap-x snap-mandatory scroll-px-1 gap-1 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((day) => {
          const state = status.get(day)
          const chosen = day === value
          // Until its month is loaded only the chosen day can be taken (it is known to be free or was chosen before).
          const selectable = chosen || state === 'available'
          // ISO weekdays: Monday is 1, Sunday 7.
          const weekday = formatWeekday(toDate(day).getDay() || 7, language)
          const number = toDate(day).getDate()
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              tabIndex={day === tabDay ? 0 : -1}
              aria-pressed={chosen}
              aria-disabled={!selectable}
              aria-label={dayName(day)}
              onFocus={() => setFocusDay(day)}
              onClick={() => selectable && onChange(day)}
              className={cn(
                'relative flex h-16 w-11 shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-xl border text-foreground press focus-ring',
                chosen
                  ? 'cursor-pointer border-primary bg-primary text-primary-foreground hover:bg-primary-hover'
                  : selectable
                    ? 'cursor-pointer border-input bg-background hover:border-primary hover:bg-primary-50 dark:hover:bg-accent'
                    : 'cursor-not-allowed border-transparent bg-transparent text-muted-foreground',
                state !== undefined && state !== 'available' && !chosen && 'line-through',
              )}
            >
              <span className={cn('text-xs', !chosen && 'text-muted-foreground')}>{weekday}</span>
              <span className="text-base leading-none font-semibold tabular-nums">{number}</span>
              {/* The mark of an available day. */}
              <span
                aria-hidden="true"
                className={cn('size-1 rounded-full', state === 'available' ? (chosen ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent')}
              />
            </button>
          )
        })}
      </div>
      {calendar.error !== null && <RequestError error={calendar.error} onRetry={calendar.refetch} />}
    </div>
  )
}

/**
 * The calendar of the popover: only available days can be chosen; closed days, past ones, those beyond the booking horizon
 * and fully booked ones are disabled, fully booked ones also struck through. The month after the shown one is loaded
 * ahead, so turning the page finds its days ready.
 */
function CalendarMonth({ slug, guests, value, minDate, maxDate, onChange }: BookingCalendarProps & { value: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [displayed, setDisplayed] = useState(() => toDate(value))
  const month = toIso(displayed).slice(0, 7)
  const calendar = useBookingCalendar(slug, month, guests)
  useBookingCalendar(slug, nextMonth(month), guests, nextMonth(month) <= maxDate.slice(0, 7))
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
