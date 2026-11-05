import { ArmchairIcon, CalendarIcon, CalendarPlusIcon, CheckIcon, ClockIcon, CopyIcon, ExternalLinkIcon, MapPinIcon, RouteIcon, UsersIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type BookingResult, managePath, type PublicRestaurant } from '../../api/publicBooking.ts'
import { formatLongDate, formatTime } from '../../i18n/format.ts'
import { Button } from '../../ui/button.tsx'
import { SuccessMark } from '../../ui/motion/success-mark.tsx'
import { Photo } from '../../ui/photo.tsx'
import { calendarFile, downloadCalendarFile } from './calendarFile.ts'
import { formatAddress, mapSearchUrl } from './format.ts'

type BookingConfirmationProps = {
  result: BookingResult
  slug: string
  restaurant: PublicRestaurant
  timeZoneId: string
  /** A narrow band with a photo of the restaurant on top of the ticket; not in the embed, whose page shows its own photos. */
  photoBand?: boolean
}

/**
 * The end of the booking: a clear success state (a check that draws itself with a few particles in the accent colour,
 * SuccessMark, unless the guest asked for less motion; for a request, which the restaurant still has to confirm, a clock and
 * "Request sent" with what happens next), then a card like a ticket that slides up, with the reference code and what was booked (date, time, people, table and area, address), and the actions: "Add to
 * calendar" (.ics), "Copy link" (the link to view and cancel the reservation, with the hint to save it), "Manage
 * reservation" and "Directions". On top of the ticket, outside the embed, a narrow band with the cover image, otherwise the
 * first photo of the gallery, otherwise the accent colour. The heading (`title`) is the dialog's.
 */
export function BookingConfirmation({ result, slug, restaurant, timeZoneId, photoBand = false, title }: BookingConfirmationProps & { title: ReactNode }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const requested = result.status === 'Requested'
  const manageUrl = `${window.location.origin}${managePath(slug, result.referenceCode, result.manageToken)}`
  const address = formatAddress(restaurant)
  const bandPhoto = restaurant.branding.coverUrl ?? restaurant.gallery[0]?.url ?? null
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timeout = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeout)
  }, [copied])

  const rows = [
    { icon: <CalendarIcon />, label: t('booking.confirmation.date'), value: formatLongDate(result.date, language) },
    { icon: <ClockIcon />, label: t('booking.confirmation.time'), value: formatTime(result.time, language) },
    { icon: <UsersIcon />, label: t('booking.confirmation.guests'), value: t('booking.guestsCount', { count: result.guests }) },
    {
      icon: <ArmchairIcon />,
      label: t('booking.confirmation.table'),
      value: t('booking.confirmation.tableInArea', { number: result.tableNumber, area: result.area }),
    },
    ...(address !== '' ? [{ icon: <MapPinIcon />, label: t('booking.confirmation.address'), value: address }] : []),
  ]

  const addToCalendar = () =>
    downloadCalendarFile(
      `${t('booking.calendarEvent.fileName')}-${result.referenceCode}.ics`,
      calendarFile({
        uid: `${result.referenceCode}@cbplayground`,
        title: t('booking.calendarEvent.title', { restaurant: restaurant.name }),
        date: result.date,
        time: result.time,
        durationMinutes: result.durationMinutes,
        timeZoneId,
        location: [restaurant.name, address].filter((part) => part !== '').join(', '),
        description: t('booking.calendarEvent.description', {
          guests: t('booking.guestsCount', { count: result.guests }),
          code: result.referenceCode,
          link: manageUrl,
        }),
        url: manageUrl,
      }),
    )

  const copyLink = () =>
    void navigator.clipboard
      ?.writeText(manageUrl)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 pt-2 pb-6 text-center md:pb-2">
      <div className="flex flex-col items-center gap-4">
        {requested ? (
          <span aria-hidden="true" className="flex size-16 animate-check-circle items-center justify-center rounded-full bg-warning/15 text-warning motion-reduce:animate-none">
            <ClockIcon className="size-8" />
          </span>
        ) : (
          <SuccessMark />
        )}
        <div className="flex flex-col gap-2">
          {title}
          <p className="text-muted-foreground">{requested ? t('booking.confirmation.requestText') : t('booking.confirmation.confirmedText')}</p>
        </div>
      </div>

      {/* Like a ticket: the code at the top, a perforation with two notches, what was booked below it. */}
      <div className="w-full animate-rise rounded-2xl border border-border bg-card text-left shadow-card [animation-delay:200ms]">
        {photoBand && (
          // Only a picture of the place; on the accent colour (almost black in the dark mode) without photo or while it loads.
          // Its corners follow the card's inside its border; the card itself does not clip, so the notches below cut its border.
          <div className="h-20 overflow-hidden rounded-t-[calc(var(--radius-2xl)-1px)] bg-primary sm:h-24 dark:bg-stone-900">
            {bandPhoto !== null && <Photo src={bandPhoto} alt="" fallback={null} className="bg-transparent" />}
          </div>
        )}
        <div className="flex flex-col gap-1 px-6 pt-5 pb-4">
          <p className="font-display text-lg">{restaurant.name}</p>
          <p className="text-sm text-muted-foreground">{t('booking.confirmation.referenceCode')}</p>
          <p className="font-mono text-3xl font-bold tracking-[0.15em] text-primary-text">{result.referenceCode}</p>
        </div>
        <div aria-hidden="true" className="relative h-0 border-t-2 border-dashed border-border">
          <span className="absolute top-0 -left-px size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card [clip-path:inset(0_0_0_50%)]" />
          <span className="absolute top-0 -right-px size-5 translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-card [clip-path:inset(0_50%_0_0)]" />
        </div>
        <ul className="flex flex-col gap-3 px-6 pt-4 pb-5">
          {rows.map((row) => (
            <li key={row.label} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 text-muted-foreground [&_svg]:size-4.5">
                {row.icon}
              </span>
              <span>
                {/* The icon says it on screen. */}
                <span className="sr-only">{`${row.label}: `}</span>
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex w-full flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={addToCalendar}>
            <CalendarPlusIcon aria-hidden="true" />
            {t('booking.confirmation.addToCalendar')}
          </Button>
          <Button size="lg" variant="outline" onClick={copyLink}>
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? t('booking.confirmation.copied') : t('booking.confirmation.copyLink')}
          </Button>
          {/* A new tab, so the link also works from the booking embedded in the restaurant's website. */}
          <Button size="lg" variant="outline" asChild>
            <a href={manageUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon aria-hidden="true" />
              {t('booking.confirmation.manageLink')}
            </a>
          </Button>
          {address !== '' && (
            <Button size="lg" variant="outline" asChild>
              <a href={mapSearchUrl(address)} target="_blank" rel="noopener noreferrer">
                <RouteIcon aria-hidden="true" />
                {t('booking.restaurant.route')}
              </a>
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t('booking.confirmation.manageLinkHint')}</p>
        {/* Tells screen reader users that the link was copied. */}
        <p role="status" className="sr-only">
          {copied ? t('booking.confirmation.copied') : ''}
        </p>
      </div>
    </div>
  )
}
