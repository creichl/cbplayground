import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import { PrinterIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useCurrentUser } from '../api/auth.ts'
import { type Reservation, toMinutes, useOpenPeriods, useReservations, useRestaurantToday } from '../api/reservations.ts'
import { RequestError } from '../components/booking/RequestError.tsx'
import { occasionLabels, tagLabels } from '../components/guests/labels.ts'
import { guestName, isActive, statusLabels } from '../components/reservations/status.ts'
import { formatLongDate, formatTime, periodLabel } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'
import { Button } from '../ui/button.tsx'
import { Skeleton } from '../ui/skeleton.tsx'

const dateFormat = 'YYYY-MM-DD'

const covers = (reservations: Reservation[]) => reservations.reduce((total, reservation) => total + reservation.guests, 0)

/** The occasion, the guest's tags and whether their profile notes allergies, in the user's language. */
const guestDetails = (reservation: Reservation, t: TFunction) => [
  ...(reservation.occasion === 'None' ? [] : [t(occasionLabels[reservation.occasion])]),
  ...(reservation.guest?.tags ?? []).map((tag) => t(tagLabels[tag])),
  ...(reservation.guest?.hasAllergies === true ? [t('guests.markers.allergies')] : []),
]

/**
 * The day sheet of the front desk (`/frontdesk/print?date=YYYY-MM-DD&service=HH:mm`) for the service briefing, laid out for A4
 * portrait and without navigation: the totals per service on top, then the expected reservations (without cancelled, declined
 * and no-show ones) grouped by their start time. Without `date` it is today in the restaurant's time zone, without `service` the
 * whole day. Once the reservations are loaded, the browser's print dialog opens on its own; on screen the page shows the sheet
 * with a button to print it again.
 */
export function FrontdeskPrintPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  useDocumentTitle(t('frontdesk.print.title'))
  const currentUser = useCurrentUser()
  const today = useRestaurantToday()
  const [searchParams] = useSearchParams()
  const requested = searchParams.get('date')
  const date = requested !== null && dayjs(requested).format(dateFormat) === requested ? requested : today
  const reservations = useReservations(date)
  const openPeriods = useOpenPeriods(date)

  const services = (openPeriods.data ?? []).map((period) => ({
    start: period.start,
    label: t('frontdesk.service.option', {
      name: t(periodLabel(period.start)),
      time: t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) }),
    }),
    range: { start: toMinutes(period.start), end: toMinutes(period.end) },
  }))
  const service = services.find((candidate) => candidate.start === searchParams.get('service')) ?? null
  const inRange = (reservation: Reservation, range: { start: number; end: number }) =>
    toMinutes(reservation.time) >= range.start && toMinutes(reservation.time) < range.end
  const expected = reservations.data?.filter(isActive).filter((reservation) => service === null || inRange(reservation, service.range))
  const ready = expected !== undefined && openPeriods.data !== undefined

  // The print dialog opens once, when the sheet is complete.
  const printed = useRef(false)
  useEffect(() => {
    if (ready && !printed.current) {
      printed.current = true
      window.print()
    }
  }, [ready])

  const groups: { time: string; reservations: Reservation[] }[] = []
  for (const reservation of expected ?? []) {
    const last = groups.at(-1)
    if (last !== undefined && last.time === reservation.time) {
      last.reservations.push(reservation)
    } else {
      groups.push({ time: reservation.time, reservations: [reservation] })
    }
  }
  const totals = [
    ...(service === null ? services : [service]).map((shown) => ({
      key: shown.start,
      label: shown.label,
      reservations: (expected ?? []).filter((reservation) => inRange(reservation, shown.range)),
    })),
    ...(service === null ? [{ key: 'day', label: t('frontdesk.service.wholeDay'), reservations: expected ?? [] }] : []),
  ]
  const error = reservations.error ?? openPeriods.error

  return (
    <div className="min-h-dvh bg-secondary font-sans text-foreground print:min-h-0 print:bg-transparent">
      <div className="mx-auto flex max-w-[210mm] justify-end px-4 pt-4 print:hidden">
        <Button onClick={() => window.print()} disabled={!ready}>
          <PrinterIcon aria-hidden="true" />
          {t('frontdesk.print.print')}
        </Button>
      </div>

      <main className="mx-auto my-4 flex max-w-[210mm] flex-col gap-5 bg-card p-[12mm] shadow-card print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-foreground pb-2">
          <div className="flex flex-col">
            <h1 className="font-display text-2xl font-semibold">{t('frontdesk.print.title')}</h1>
            <p className="text-sm">{currentUser.data?.tenant?.name ?? t('app.name')}</p>
          </div>
          <div className="flex flex-col text-right text-sm">
            <span className="font-semibold">{date === null ? '' : formatLongDate(date, language)}</span>
            <span>{service?.label ?? t('frontdesk.service.wholeDay')}</span>
          </div>
        </header>

        {error !== null ? (
          <RequestError
            error={error}
            onRetry={() => {
              void reservations.refetch()
              void openPeriods.refetch()
            }}
          />
        ) : !ready ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : (
          <>
            <section aria-label={t('frontdesk.print.totals')} className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2">
              {totals.map((total) => (
                <div key={total.key} className="rounded-lg border border-border px-3 py-2 break-inside-avoid">
                  <p className="text-xs text-muted-foreground">{total.label}</p>
                  <p className="text-sm">
                    <span className="text-lg font-semibold tabular-nums">{t('frontdesk.print.reservations', { count: total.reservations.length })}</span>
                    {' · '}
                    <span className="tabular-nums">{t('reservations.stats.covers', { count: covers(total.reservations) })}</span>
                  </p>
                </div>
              ))}
            </section>

            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t(service === null ? 'frontdesk.print.empty' : 'frontdesk.empty.service')}</p>
            ) : (
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-foreground text-xs text-muted-foreground">
                    <th scope="col" className="py-1 pr-2 font-medium">{t('frontdesk.print.columns.time')}</th>
                    <th scope="col" className="py-1 pr-2 font-medium">{t('frontdesk.print.columns.name')}</th>
                    <th scope="col" className="py-1 pr-2 text-right font-medium">{t('frontdesk.print.columns.party')}</th>
                    <th scope="col" className="py-1 pr-2 font-medium">{t('frontdesk.print.columns.table')}</th>
                    <th scope="col" className="py-1 pr-2 font-medium">{t('frontdesk.print.columns.phone')}</th>
                    <th scope="col" className="py-1 pr-2 font-medium">{t('frontdesk.print.columns.status')}</th>
                    <th scope="col" className="py-1 font-medium">{t('frontdesk.print.columns.notes')}</th>
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.time} className="break-inside-avoid border-b border-border">
                    {group.reservations.map((reservation, index) => (
                      <tr key={reservation.id} className="align-top">
                        {index === 0 && (
                          <th scope="rowgroup" rowSpan={group.reservations.length} className="py-1.5 pr-2 font-semibold whitespace-nowrap tabular-nums">
                            {formatTime(group.time, language)}
                          </th>
                        )}
                        <td className="py-1.5 pr-2 font-medium">{guestName(reservation, t)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{reservation.guests}</td>
                        <td className="py-1.5 pr-2">{t('frontdesk.print.tableValue', { table: reservation.tableNumber, area: reservation.areaName })}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{reservation.phone ?? ''}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{t(statusLabels[reservation.status])}</td>
                        <td className="py-1.5 whitespace-pre-line">
                          {/* What the guest profile and the reservation say about the guest: occasion, tags, allergies. */}
                          {guestDetails(reservation, t).length > 0 && <span className="block font-medium">{guestDetails(reservation, t).join(' · ')}</span>}
                          {reservation.notes ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </>
        )}
      </main>
    </div>
  )
}
