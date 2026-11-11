import { CalendarXIcon, FlameIcon, TriangleAlertIcon, UsersIcon } from 'lucide-react'
import type { ParseKeys } from 'i18next'
import { type MouseEvent, type ReactElement, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Availability, type AvailabilityTime, type ExcludedReservation, useAvailabilities, useAvailability, useNextFreeDays } from '../../api/publicBooking.ts'
import { formatLongDate, formatShortDate, formatTime, periodLabel } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { layoutTransition, layoutTransitions } from '../../ui/motion/layout-transition.ts'
import { Stagger } from '../../ui/motion/reveal.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { RequestError } from './RequestError.tsx'

type TimeSlotGridProps = {
  slug: string
  date: string
  guests: number
  value: string | null
  /** The day to show is being looked up: the times shown stay, dimmed and inert, as while new ones load. */
  waiting?: boolean
  /** The last day that can be booked online, "YYYY-MM-DD", for the next free days. */
  maxDate: string
  /** The earliest start that can be booked now, "YYYY-MM-DD HH:mm" (earliestStartIn); earlier times are left out. */
  earliestStart: string
  /** A hint above the times, e.g. that the chosen time has just been taken. */
  notice: ParseKeys | null
  onChange: (time: string) => void
  /** Another party size, from the hint of a fully booked day. */
  onChangeGuests: (guests: number) => void
  /** A time on another day, from the alternatives of a fully booked day; `combined` as the time's. */
  onChooseDayAndTime: (date: string, time: string, combined: boolean) => void
  /** The guest's own reservation, which a change leaves out of the free times. */
  exclude?: ExcludedReservation
}

/** The attribute of a time chip, by which the focus finds it again when the booking dialog closes. */
export const timeChipAttribute = 'data-time-chip'

/** Up to this many free tables a time says how many are left ("2 tables left"). */
const scarceRemaining = 2

/** From this many taken times in a row on, they are one quiet chip ("19:00–20:30 full") instead of one chip each. */
const takenRun = 3

/** How many next free days a fully booked day offers, and how many times of each. */
const alternativeDays = 3
const alternativeTimes = 3

/**
 * The opening windows of a day with the times that can still be booked from now on: free and taken ones, without those in
 * the past or within the lead time; windows without any are left out.
 */
function offeredPeriods(availability: Availability | undefined, earliestStart: string) {
  return (availability?.periods ?? [])
    .map((period) => ({ ...period, times: period.times.filter((slot) => `${availability?.date} ${slot.time}` > earliestStart) }))
    .filter((period) => period.times.length > 0)
}

/** The free times of a day that can still be booked from now on. */
function freeTimes(availability: Availability | undefined, earliestStart: string) {
  return offeredPeriods(availability, earliestStart).flatMap((period) => period.times.filter((slot) => slot.available))
}

/**
 * The chips of an opening window's times in their order: each free time one, and taken ones one each too, except runs of
 * takenRun or more taken times in a row, which are one chip together.
 */
function chipsOf(times: AvailabilityTime[]) {
  const runs: AvailabilityTime[][] = []
  for (const slot of times) {
    const run = runs.at(-1)
    if (run !== undefined && !slot.available && !run[0].available) {
      run.push(slot)
    } else {
      runs.push([slot])
    }
  }
  return runs.flatMap((run) => (run[0].available || run.length < takenRun ? run.map((slot) => [slot]) : [run]))
}

/** Chips of times: 44 px high, in a grid that keeps them the same width; they give way a little while pressed. */
const chipClassName =
  'relative inline-flex h-11 items-center justify-center rounded-full border px-1.5 text-sm font-medium tabular-nums press focus-ring'

/** The look of a chip that can be chosen, chosen (filled, with the pulse) or not. */
function chipLook(chosen: boolean) {
  return chosen
    ? 'cursor-pointer border-primary bg-primary text-primary-foreground pulse-ring hover:bg-primary-hover'
    : 'cursor-pointer border-input bg-background hover:border-primary hover:bg-primary-50 dark:hover:bg-accent'
}

/**
 * Delays a choice by the length of the short pulse of the chosen chip, so the guest sees which time was taken before the
 * booking dialog covers it; with less motion the choice is made at once. `picked` is the chip pulsing meanwhile.
 */
function usePulseThenChoose() {
  const [picked, setPicked] = useState<string | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const pick = (key: string, element: HTMLElement, choose: () => void) => {
    if (picked !== null) {
      return
    }
    // --motion-fast is 150 ms, and 0s with less motion.
    const delay = parseFloat(getComputedStyle(element).getPropertyValue('--motion-fast'))
    if (!(delay > 0)) {
      choose()
      return
    }
    setPicked(key)
    timer.current = window.setTimeout(() => {
      choose()
      setPicked(null)
    }, delay)
  }
  return { picked, pick }
}

/**
 * The start times of a day as chips, grouped by opening window ("Lunch 11:30–14:30"). Free times can be chosen; one with
 * only one or two tables left says so, with a flame; taken ones recede (muted, struck through in a lighter tone) and are
 * disabled, and three or more in a row are one quiet chip ("19:00–20:30 full"). Times in the past or within the lead time are
 * left out. On the very first load the skeleton fades out above the first chips, which rise in one after another (Stagger).
 * On another party size or day the previous chips stay, dimmed and inert, until the new ones arrive; then the new ones
 * cross-fade in and the card glides to its new height (layoutTransition, a view transition, so nothing is laid out per frame
 * and the embed reports only the end height). A click on a time pulses its chip and then opens the booking dialog. A fully
 * booked day offers alternatives instead (FullDay).
 */
export function TimeSlotGrid(props: TimeSlotGridProps) {
  const { slug, date, guests, value, waiting = false, earliestStart, notice, onChange, exclude } = props
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const availability = useAvailability(slug, date, guests, true, true, exclude)
  const { picked, pick } = usePulseThenChoose()
  const timesRef = useRef<HTMLDivElement>(null)
  // The times drawn: those of another day or party size take their place through a layout transition.
  const data = availability.data
  const [shown, setShown] = useState(data)
  const another = data !== undefined && shown !== undefined && (data.date !== shown.date || data.guests !== shown.guests)
  // The first times and fresher ones of the same day and party size are simply shown.
  if (data !== undefined && data !== shown && !another) {
    setShown(data)
  }
  useEffect(() => {
    if (another) {
      layoutTransition(timesRef.current, () => setShown(data))
    }
  }, [another, data])
  const stale = availability.isPlaceholderData || waiting || shown !== data
  // The first times shown (null before them, false once others have taken their place): they rise in where the skeleton was.
  const key = shown === undefined ? null : `${shown.date}/${shown.guests}`
  const [first, setFirst] = useState<string | null | false>(null)
  if (key !== null && first === null) {
    setFirst(key)
  } else if (key !== null && first !== null && first !== false && first !== key) {
    setFirst(false)
  }
  const entering = key !== null && first === key
  // The skeleton that fades out above them, until its fade has ended.
  const [skeletonFaded, setSkeletonFaded] = useState(false)
  const rise = (list: ReactElement) => (entering ? <Stagger>{list}</Stagger> : list)

  return (
    <div className="flex flex-col gap-5">
      {notice !== null && (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>{t(notice)}</AlertDescription>
        </Alert>
      )}

      {/* The part of the card that changes in a layout transition (app.css). */}
      <div ref={timesRef} data-layout-part="booking-times" className="relative">
        {availability.isError ? (
          <RequestError error={availability.error} onRetry={() => void availability.refetch()} />
        ) : shown === undefined ? (
          <TimeSlotsSkeleton />
        ) : (
          <div
            // Without layout transitions, a new day or party size fades in as a whole.
            key={`${shown.date}/${shown.guests}`}
            inert={stale}
            aria-busy={stale}
            className={cn('flex flex-col gap-5 transition-opacity', !layoutTransitions && 'motion-safe:animate-fade-in', stale && 'opacity-50')}
          >
            {freeTimes(shown, earliestStart).length === 0 ? (
              <FullDay {...props} availability={shown} picked={picked} pick={pick} />
            ) : (
              offeredPeriods(shown, earliestStart).map((period, _, periods) => (
                <section key={period.start} className="flex flex-col gap-2" aria-labelledby={`period-${period.start}`}>
                  <h3 id={`period-${period.start}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold">{periods.length > 1 ? t(periodLabel(period.start)) : t('booking.time.freeTimes')}</span>
                    <span className="text-muted-foreground">
                      {t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) })}
                    </span>
                  </h3>
                  {rise(
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {chipsOf(period.times).map(([slot, ...more]) => (
                        <li key={slot.time} className={cn(more.length > 0 && 'col-span-2')}>
                          {slot.available ? (
                            <TimeChip
                              slot={slot}
                              chosen={value === slot.time || picked === slot.time}
                              {...{ [timeChipAttribute]: slot.time }}
                              onClick={(event) => pick(slot.time, event.currentTarget, () => onChange(slot.time))}
                            />
                          ) : more.length > 0 ? (
                            <button
                              type="button"
                              disabled
                              data-taken-run=""
                              aria-label={t('booking.time.taken', { time: [slot, ...more].map((taken) => formatTime(taken.time, language)).join(', ') })}
                              className={cn(chipClassName, 'w-full cursor-not-allowed border-transparent bg-muted/60 font-normal text-muted-foreground')}
                            >
                              {t('booking.time.takenRun', { start: formatTime(slot.time, language), end: formatTime(more[more.length - 1].time, language) })}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              aria-label={t('booking.time.taken', { time: formatTime(slot.time, language) })}
                              className={cn(
                                chipClassName,
                                'w-full cursor-not-allowed border-transparent font-normal text-muted-foreground line-through decoration-muted-foreground/40',
                              )}
                            >
                              {formatTime(slot.time, language)}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>,
                  )}
                </section>
              ))
            )}
          </div>
        )}
        {entering && !skeletonFaded && (
          // Above the first times, in the place of the skeleton before them (also the card's, in its shape), fading out.
          <div
            className="pointer-events-none absolute inset-x-0 top-0 animate-fade-out [animation-fill-mode:forwards] motion-reduce:hidden"
            onAnimationEnd={(event) => event.target === event.currentTarget && setSkeletonFaded(true)}
          >
            <TimeSlotsSkeleton />
          </div>
        )}
      </div>
    </div>
  )
}

/** A free time to choose; with one or two tables left it says so below the time, with a flame, in the accent colour. */
function TimeChip({
  slot,
  chosen,
  label,
  onClick,
  ...attributes
}: {
  slot: AvailabilityTime
  chosen: boolean
  /** The accessible name of the time, when it needs more than the time, e.g. the day. */
  label?: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const time = formatTime(slot.time, language)
  const scarce = slot.remaining <= scarceRemaining ? t('booking.time.tablesLeft', { count: slot.remaining }) : null

  return (
    <button
      type="button"
      {...attributes}
      aria-pressed={chosen}
      aria-label={[label ?? time, scarce].filter((part) => part !== null).join(', ')}
      onClick={onClick}
      // As high as the highest chip of its row: a hint that does not fit beside the flame (long words) wraps instead of spilling.
      className={cn(chipClassName, 'h-full min-h-11 w-full flex-col gap-0 py-1 leading-tight', chipLook(chosen))}
    >
      {time}
      {scarce !== null && (
        // The chip's whole width (its padding too) before it wraps; where even that is too narrow (long words), it wraps in
        // balanced lines with the flame in front of the first.
        <span
          data-tables-left=""
          className={cn(
            '-mx-1.5 block text-center text-xs leading-none font-medium text-balance',
            chosen ? 'text-primary-foreground' : 'text-primary-text',
          )}
        >
          <FlameIcon aria-hidden="true" className="mr-0.5 inline-block size-3 align-[-0.15em]" />
          {scarce}
        </span>
      )}
    </button>
  )
}

/** The times while they load for the first time, in their shape. */
function TimeSlotsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-11 rounded-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * A fully booked day: the next days with free times for the party, each with its first times to book with one tap, and,
 * when a smaller party would find a time on this day, the hint with it ("For 4 people there are times at 19:00"), which
 * switches the party size. Loaded only for a fully booked day: the calendar (mostly loaded already), the times of the next
 * free days and those of one or two smaller parties on this day.
 */
function FullDay({
  slug,
  maxDate,
  earliestStart,
  availability,
  onChangeGuests,
  onChooseDayAndTime,
  exclude,
  picked,
  pick,
}: TimeSlotGridProps & { availability: Availability } & ReturnType<typeof usePulseThenChoose>) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const { date, guests } = availability
  const nextFreeDays = useNextFreeDays(slug, date, maxDate, guests, true, exclude)
  const days = nextFreeDays.days.slice(0, alternativeDays)
  const dayTimes = useAvailabilities(slug, days.map((day) => ({ date: day, guests })), exclude)
  const smallerSizes = [guests - 1, guests - 2].filter((size) => size >= 1)
  const smaller = useAvailabilities(slug, smallerSizes.map((size) => ({ date, guests: size })), exclude)
  // The largest smaller party with a free time on this day.
  const smallerIndex = smaller.findIndex((result) => freeTimes(result.data, earliestStart).length > 0)
  const smallerFree = smallerIndex === -1 ? [] : freeTimes(smaller[smallerIndex].data, earliestStart).slice(0, alternativeTimes)

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 font-semibold">
        <CalendarXIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        {t('booking.time.noTables')}
      </p>

      {smallerIndex !== -1 && (
        <button
          type="button"
          onClick={() => onChangeGuests(smallerSizes[smallerIndex])}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-lg text-left text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-ring"
        >
          <UsersIcon aria-hidden="true" className="size-4 shrink-0" />
          {t('booking.time.smallerParty', {
            count: smallerSizes[smallerIndex],
            times: smallerFree.map((slot) => formatTime(slot.time, language)).join(', '),
          })}
        </button>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">{t('booking.time.nextFreeDays')}</h3>
        {nextFreeDays.isPending ? (
          <AlternativesSkeleton />
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('booking.time.noFreeDays')}</p>
        ) : (
          days.map((day, index) => {
            const result = dayTimes[index]
            const times = freeTimes(result.data, earliestStart).slice(0, alternativeTimes)
            return (
              <section key={day} aria-labelledby={`alternative-${day}`} className="flex flex-col gap-1.5">
                <h4 id={`alternative-${day}`} className="text-sm text-muted-foreground">
                  {formatShortDate(day, language)}
                </h4>
                {result.isPending ? (
                  <div className="grid grid-cols-3 gap-2" aria-hidden="true">
                    {Array.from({ length: alternativeTimes }, (_, i) => (
                      <Skeleton key={i} className="h-11 rounded-full" />
                    ))}
                  </div>
                ) : result.isError ? (
                  <RequestError error={result.error} onRetry={() => void result.refetch()} />
                ) : (
                  <ul className="grid grid-cols-3 gap-2">
                    {times.map((slot) => (
                      <li key={slot.time}>
                        <TimeChip
                          slot={slot}
                          chosen={picked === `${day} ${slot.time}`}
                          label={`${formatLongDate(day, language)}, ${formatTime(slot.time, language)}`}
                          onClick={(event) =>
                            pick(`${day} ${slot.time}`, event.currentTarget, () => onChooseDayAndTime(day, slot.time, slot.combined))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}

/** The next free days while they load. */
function AlternativesSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: alternativeDays }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: alternativeTimes }, (_, j) => (
              <Skeleton key={j} className="h-11 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
