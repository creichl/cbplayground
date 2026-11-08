import { ChevronDownIcon, MapPinIcon, NavigationIcon, PhoneIcon, PhoneCallIcon } from 'lucide-react'
import { Fragment, type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant, UpcomingChange } from '../../api/publicBooking.ts'
import { formatDateRange, formatShortDate } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Card } from '../../ui/card.tsx'
import { Expand } from '../../ui/motion/expand.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { addressLines, formatAddress, mapSearchUrl } from './format.ts'
import { hasHours, hasHoursOrLocation, sectionIds } from './layout.ts'
import { OpeningHoursList, PeriodsText } from './OpeningHoursList.tsx'
import { addDays, type StatusTone, type useOpeningStatus } from './openingStatus.ts'

/** The colour of the status dot. */
const toneDotClassName: Record<StatusTone, string> = { open: 'bg-success', soon: 'bg-warning', closed: 'bg-destructive' }

/** A row of "Coming up": a closed public holiday, closed days in a row, or a day with special hours. */
type ComingUpRow = { from: string; to: string; kind: UpcomingChange['kind']; periods: UpcomingChange['periods']; holidayKey: string | null }

/** The days that differ from today on, consecutive closed days (other than public holidays) as one row. */
function comingUpRows(changes: UpcomingChange[], today: string) {
  const rows: ComingUpRow[] = []
  for (const change of changes.filter((entry) => entry.date >= today).sort((a, b) => a.date.localeCompare(b.date))) {
    const last = rows.at(-1)
    if (change.kind === 'closed' && change.holidayKey === null && last?.kind === 'closed' && last.holidayKey === null && addDays(last.to, 1) === change.date) {
      last.to = change.date
    } else {
      rows.push({ from: change.date, to: change.date, kind: change.kind, periods: change.periods, holidayKey: change.holidayKey })
    }
  }
  return rows
}

const actionClassName =
  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm font-semibold text-primary-text underline-offset-4 hover:underline focus-ring'

/**
 * The card "Hours & location", the first block of the restaurant page's information, as Resy, OpenTable or Google Maps show
 * it near the top: the live status large (open now and until when, when it opens, closing soon; a dot and the text), today's
 * hours, "All opening hours" unfolding the week in place (Monday first, today marked), "Coming up" with the closing days,
 * closed public holidays and special hours of the next 14 days (also while the week is folded, when one falls within the
 * next 7 days), and the address with "Directions" and the phone with "Call". Without location or opening hours the hours
 * part is left out, without address or phone its row; with neither the card is not shown. It carries the section id
 * `opening-hours`.
 */
export function HoursAndLocation({ restaurant, status }: { restaurant: PublicRestaurant; status: ReturnType<typeof useOpeningStatus> }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [weekOpen, setWeekOpen] = useState(false)
  const weekId = useId()
  const lines = addressLines(restaurant)
  const address = formatAddress(restaurant)
  const phone = restaurant.phone
  const id = sectionIds.openingHours

  if (!hasHoursOrLocation(restaurant)) {
    return null
  }

  const hours = status !== null && hasHours(restaurant) ? status : null
  const rows = hours !== null ? comingUpRows(restaurant.upcomingChanges, hours.today) : []
  const soon = hours !== null && rows.some((row) => row.from <= addDays(hours.today, 6))

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-36">
      <Card className="gap-0 py-0 shadow-none">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 id={`${id}-heading`} tabIndex={-1} className="text-sm font-semibold tracking-wide text-muted-foreground uppercase outline-none">
            {t('booking.restaurant.hoursAndLocation')}
          </h2>
          {hours !== null && (
            <>
              <p data-testid="opening-status" className={cn('flex items-center gap-3 font-display text-2xl', hours.tone === 'soon' && 'text-warning')}>
                {/* The text says it; the dot only repeats it. */}
                <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-full', toneDotClassName[hours.tone])} />
                {hours.text}
              </p>
              <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium">{t('booking.restaurant.todayBadge')}</span>
                <span className="text-right tabular-nums">
                  <PeriodsText periods={hours.todayPeriods} />
                </span>
              </p>
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={weekOpen}
                  aria-controls={weekId}
                  onClick={() => setWeekOpen(!weekOpen)}
                  className="-mx-1 inline-flex min-h-11 items-center gap-2 self-start rounded-sm px-1 font-semibold text-primary-text underline-offset-4 hover:underline focus-ring"
                >
                  {t('booking.restaurant.allOpeningHours')}
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={cn('size-4 transition-transform duration-(--motion-medium) motion-reduce:transition-none', weekOpen && 'rotate-180')}
                  />
                </button>
                <Expand open={weekOpen} id={weekId}>
                  <div className="pt-2">
                    <OpeningHoursList restaurant={restaurant} today={hours.today} todayPeriods={hours.todayPeriods} />
                  </div>
                </Expand>
                {rows.length > 0 && (
                  <Expand open={weekOpen || soon}>
                    <div className="flex flex-col gap-2 pt-4">
                      <h3 className="font-medium">{t('booking.restaurant.comingUp')}</h3>
                      <ul className="flex flex-col">
                        {rows.map((row) => (
                          <li key={row.from} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border px-3 py-2.5 first:border-t-0">
                            <span>
                              {row.holidayKey !== null
                                ? t(`openingHours.holidayNames.${row.holidayKey}` as 'openingHours.holidayNames.christmasDay')
                                : row.from === row.to
                                  ? formatShortDate(row.from, language)
                                  : formatDateRange(row.from, row.to, language)}
                            </span>
                            <span className="text-right font-medium tabular-nums">
                              <PeriodsText periods={row.periods} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Expand>
                )}
              </div>
            </>
          )}
        </div>
        {(address !== '' || phone !== null) && (
          // Address and phone side by side from 640 px on, so the whole card fits in the first screen on desktop.
          <ul className="grid divide-y divide-border border-t border-border px-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:gap-x-6 sm:divide-y-0 sm:px-6">
            {address !== '' && (
              <Row icon={<MapPinIcon />}>
                <address className="not-italic">
                  {lines.map((line, index) => (
                    <Fragment key={index}>
                      {index > 0 && <br />}
                      {line}
                    </Fragment>
                  ))}
                </address>
                <a href={mapSearchUrl(address)} target="_blank" rel="noopener noreferrer" aria-label={t('booking.restaurant.routeTo', { address })} className={actionClassName}>
                  <NavigationIcon aria-hidden="true" className="size-4" />
                  {t('booking.restaurant.route')}
                </a>
              </Row>
            )}
            {phone !== null && (
              <Row icon={<PhoneIcon />}>
                <span className="whitespace-nowrap tabular-nums">{phone}</span>
                <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} aria-label={t('booking.restaurant.callNumber', { phone })} className={actionClassName}>
                  <PhoneCallIcon aria-hidden="true" className="size-4" />
                  {t('booking.restaurant.call')}
                </a>
              </Row>
            )}
          </ul>
        )}
      </Card>
    </section>
  )
}

/** A row of the location: the icon, the text and its action ("Directions", "Call") at the end of the row. */
function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-4 py-3">
      <span aria-hidden="true" className="flex h-11 items-center text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4">{children}</div>
    </li>
  )
}

/** The card while the restaurant loads, in its shape (heading, status, today, the toggle, address and phone), so nothing jumps. */
export function HoursAndLocationSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6" />
        <Skeleton className="h-11 w-40" />
      </div>
      <div className="grid gap-6 border-t border-border px-5 py-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:px-6">
        <Skeleton className="h-12" />
        <Skeleton className="h-11" />
      </div>
    </div>
  )
}
