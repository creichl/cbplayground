import { ArmchairIcon, CalendarIcon, ClockIcon, ExternalLinkIcon, MapPinIcon, RouteIcon, UsersIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type BookingResult, managePath, type PublicRestaurant } from '../../api/publicBooking.ts'
import { formatLongDate, formatTime } from '../../i18n/format.ts'
import { Button } from '../../ui/button.tsx'
import { SuccessMark } from '../../ui/motion/success-mark.tsx'
import { Photo } from '../../ui/photo.tsx'
import { formatAddress, mapSearchUrl } from './format.ts'
import { CalendarMenu, ShareMenu } from './ReservationShare.tsx'
import { RequestTimeline } from './RequestTimeline.tsx'

type BookingConfirmationProps = {
  result: BookingResult
  slug: string
  restaurant: PublicRestaurant
  timeZoneId: string
  /** A narrow band with a photo of the restaurant on top of the ticket; not in the embed, whose page shows its own photos. */
  photoBand?: boolean
  /** "Done": closes the dialog, or in the embed returns to the reservation card. */
  onDone: () => void
}

/**
 * When the parts of the success moment begin, in milliseconds after it appears (README, "The confirmation"): the icon at once,
 * then the title, a request's timeline, the ticket, the reference code character by character and the actions one after
 * another (Stagger, 40 ms apart). Title, timeline, ticket and actions rise for --motion-slow with the spring (`rise`), so all of
 * it is over within about 0.85 s and everything stands still one second after the confirmation appeared; with less motion
 * everything is there at once.
 */
const sequence = { title: 60, timeline: 140, ticket: { confirmed: 140, requested: 220 }, code: 120, codeCharacter: 40, actions: 300 }

/** The entrance of one part of the sequence: `animate-rise`, shortened to --motion-slow with the spring, after `delay` ms. */
function riseAfter(delay: number): CSSProperties {
  return { animationDelay: `${delay}ms`, animationDuration: 'var(--motion-slow)', animationTimingFunction: 'var(--ease-spring)' }
}

/** The quiet links among the actions: in the text colour, so they keep the contrast in every branding, and 44 px high to tap. */
const quietLinkClassName =
  'inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium underline underline-offset-4 hover:decoration-2 focus-ring [&_svg]:size-4 [&_svg]:text-muted-foreground'

/** The clock of a request: it pops in like the success mark, and its long hand turns once. Only decoration. */
function RequestClock() {
  return (
    <span aria-hidden="true" className="flex size-16 animate-success-pop items-center justify-center rounded-full bg-warning/15 text-warning">
      <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 12V6" className="origin-center animate-clock-hand [transform-box:view-box]" />
        <path d="M12 12l4 2" />
      </svg>
    </span>
  )
}

/**
 * The end of the booking, unfolding in sequence (`sequence`): a clear success state (a check that draws itself with a few
 * particles in the accent colour, SuccessMark; for a request, which the restaurant still has to confirm, a clock whose hand turns
 * once, "Request sent" and a timeline of what happens next), then a card like a ticket that rises, with the reference code
 * (typed in character by character, read out at once) and what was booked (date, time, people, table and area, address), and
 * the actions with one primary: confirmed "Add to calendar" (a menu: Google Calendar, Outlook.com, .ics), for a request "View
 * reservation" (the guest's page in a new tab, so it also works from an embedded booking; no calendar before it is confirmed);
 * "Share" (a menu: without or with the link, and "Copy link"), the quiet links "Directions" and, confirmed, "Manage
 * reservation", the hint to save the link and a ghost "Done". On top of the ticket, outside the embed, a narrow band with the
 * cover image, otherwise the first photo of the gallery, otherwise the accent colour. The heading (`title`) is the dialog's.
 */
export function BookingConfirmation({ result, slug, restaurant, timeZoneId, photoBand = false, onDone, title }: BookingConfirmationProps & { title: ReactNode }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const requested = result.status === 'Requested'
  const manageUrl = `${window.location.origin}${managePath(slug, result.referenceCode, result.manageToken)}`
  const address = formatAddress(restaurant)
  const bandPhoto = restaurant.branding.coverUrl ?? restaurant.gallery[0]?.url ?? null
  const ticketDelay = requested ? sequence.ticket.requested : sequence.ticket.confirmed

  const rows = [
    { icon: <CalendarIcon />, label: t('booking.confirmation.date'), value: formatLongDate(result.date, language) },
    { icon: <ClockIcon />, label: t('booking.confirmation.time'), value: formatTime(result.time, language) },
    { icon: <UsersIcon />, label: t('booking.confirmation.guests'), value: t('booking.guestsCount', { count: result.guests }) },
    {
      icon: <ArmchairIcon />,
      label: t(result.tableNumbers.length > 1 ? 'booking.confirmation.tables' : 'booking.confirmation.table'),
      value: t(result.tableNumbers.length > 1 ? 'booking.confirmation.tablesInArea' : 'booking.confirmation.tableInArea', {
        number: result.tableNumber,
        area: result.area,
      }),
    },
    ...(address !== '' ? [{ icon: <MapPinIcon />, label: t('booking.confirmation.address'), value: address }] : []),
  ]

  const share = { reservation: result, restaurant, timeZoneId, manageUrl }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 pt-2 pb-6 text-center md:pb-2">
      <div className="flex flex-col items-center gap-4">
        {requested ? <RequestClock /> : <SuccessMark />}
        <div className="flex animate-rise flex-col gap-2" style={riseAfter(sequence.title)}>
          {title}
          <p className="text-muted-foreground">{requested ? t('booking.confirmation.requestText') : t('booking.confirmation.confirmedText')}</p>
        </div>
        {requested && (
          <div className="mt-2 animate-rise" style={riseAfter(sequence.timeline)}>
            <RequestTimeline />
          </div>
        )}
      </div>

      {/* Like a ticket: the code at the top, a perforation with two notches, what was booked below it. */}
      <div className="w-full animate-rise rounded-2xl border border-border bg-card text-left shadow-card" style={riseAfter(ticketDelay)}>
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
          <p data-reference-code="" className="font-mono text-3xl font-bold tracking-[0.15em] text-primary-text">
            {/* Read out whole at once; on screen the characters appear one after another. */}
            <span className="sr-only">{result.referenceCode}</span>
            <span aria-hidden="true">
              {[...result.referenceCode].map((character, index) => (
                <span
                  key={index}
                  data-code-character=""
                  className="inline-block animate-code-char"
                  style={{ animationDelay: `${ticketDelay + sequence.code + index * sequence.codeCharacter}ms` }}
                >
                  {character}
                </span>
              ))}
            </span>
          </p>
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

      {/*
        One primary action, then the others ever quieter, rising one after another as in Stagger, but right away, as part of the
        sequence: not only once scrolled into view, so the moment is over within 0.85 s and the embed shows them at once too.
        Each in a wrapper: an entrance on a control would replay after its focus ring.
      */}
      <div data-stagger="" className="flex w-full flex-col gap-3" style={{ '--stagger-start': `${sequence.actions}ms`, '--stagger-duration': 'var(--motion-slow)' } as CSSProperties}>
        <div>
          {requested ? (
            // A new tab, so the link also works from the booking embedded in the restaurant's website.
            <Button size="lg" asChild className="w-full">
              <a href={manageUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon aria-hidden="true" />
                {t('booking.confirmation.viewReservation')}
              </a>
            </Button>
          ) : (
            <CalendarMenu {...share} className="w-full" />
          )}
        </div>
        <div>
          <ShareMenu {...share} className="w-full" />
        </div>
        {(address !== '' || !requested) && (
          <div className="flex flex-wrap items-center justify-center gap-x-6">
            {address !== '' && (
              <a href={mapSearchUrl(address)} target="_blank" rel="noopener noreferrer" className={quietLinkClassName}>
                <RouteIcon aria-hidden="true" />
                {t('booking.restaurant.route')}
              </a>
            )}
            {!requested && (
              <a href={manageUrl} target="_blank" rel="noopener noreferrer" className={quietLinkClassName}>
                <ExternalLinkIcon aria-hidden="true" />
                {t('booking.confirmation.manageLink')}
              </a>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">{t('booking.confirmation.manageLinkHint')}</p>
        <div>
          <Button size="lg" variant="ghost" onClick={onDone} className="w-full">
            {t('booking.confirmation.done')}
          </Button>
        </div>
      </div>
    </div>
  )
}
