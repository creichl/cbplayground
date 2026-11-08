import type { ParseKeys, TFunction } from 'i18next'
import {
  ArmchairIcon,
  ArrowRightIcon,
  BanIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarX2Icon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  CopyIcon,
  GlobeIcon,
  HistoryIcon,
  HourglassIcon,
  LayoutGridIcon,
  LoaderCircleIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  RefreshCwIcon,
  RouteIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError, httpErrorMessage, requestErrorMessage } from '../api/client.ts'
import {
  type GuestReservation,
  isNotFound,
  managePath,
  type PublicRestaurant,
  useCancelGuestReservation,
  useGuestReservation,
  usePublicRestaurant,
} from '../api/publicBooking.ts'
import { restaurantTimeToUtc } from '../components/booking/calendarFile.ts'
import { ChangeReservation } from '../components/booking/ChangeReservation.tsx'
import { addressLines, formatAddress, mapSearchUrl } from '../components/booking/format.ts'
import { forgetBooking } from '../components/booking/rememberedBookings.ts'
import { CalendarMenu, ShareMenu } from '../components/booking/ReservationShare.tsx'
import { formatLongDate, formatTime } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'
import { cn } from '../lib/utils.ts'
import { Alert, AlertDescription } from '../ui/alert.tsx'
import { Button } from '../ui/button.tsx'
import { Card } from '../ui/card.tsx'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog.tsx'
import { Reveal } from '../ui/motion/reveal.tsx'
import { SuccessMark } from '../ui/motion/success-mark.tsx'
import { Photo } from '../ui/photo.tsx'
import { Skeleton } from '../ui/skeleton.tsx'
import { NotFound } from './NotFoundPage.tsx'

/**
 * The page in the design system (src/ui) inside the restaurant's layout (GuestLayout), whose header and footer it shares with
 * the booking page. That layout's background is Mantine's; the page lays the design system's background over it, down to
 * the footer (whose top margin it takes up), so the cards stand out in the light and the dark mode alike.
 */
const pageClassName = '-mb-12 min-h-[calc(100dvh-4rem)] bg-background pb-16 font-sans text-foreground'

/**
 * The narrow band of the cover image below the header, and the column of the cards, which overlaps it a little. In page
 * transitions the band is the element the cover image of the booking page moves into, and back (app.css).
 */
const bandClassName = 'h-28 sm:h-44'
const columnClassName = 'relative mx-auto -mt-12 flex max-w-3xl flex-col gap-6 px-4 sm:-mt-20 sm:px-6'

/** The colours of a state: the surface of its symbol and the line on top of its card. Never by colour alone: each has its icon and title. */
const tones = {
  success: { icon: 'bg-success/10 text-success', card: 'border-t-success' },
  warning: { icon: 'bg-warning/10 text-warning', card: 'border-t-warning' },
  danger: { icon: 'bg-destructive/10 text-destructive', card: 'border-t-destructive' },
  neutral: { icon: 'bg-muted text-muted-foreground', card: 'border-t-muted-foreground' },
} as const

type StatusLook = { icon: ReactNode; tone: keyof typeof tones; title: ParseKeys; text: ParseKeys | null }

/** How each status looks to the guest. */
const statusLooks: Record<GuestReservation['status'], StatusLook> = {
  Requested: { icon: <HourglassIcon />, tone: 'warning', title: 'guestReservation.status.requested', text: 'guestReservation.status.requestedText' },
  Confirmed: { icon: <CircleCheckIcon />, tone: 'success', title: 'guestReservation.status.confirmed', text: 'guestReservation.status.confirmedText' },
  Arrived: { icon: <CircleCheckIcon />, tone: 'success', title: 'guestReservation.status.arrived', text: null },
  Late: { icon: <ClockIcon />, tone: 'warning', title: 'guestReservation.status.late', text: null },
  Cancelled: { icon: <CircleXIcon />, tone: 'neutral', title: 'guestReservation.status.cancelled', text: null },
  Declined: { icon: <BanIcon />, tone: 'danger', title: 'guestReservation.status.declined', text: 'guestReservation.declined' },
}

/** A reservation whose end has passed, in the restaurant's time zone; it shows as over, whatever its status. */
const pastLook: StatusLook = { icon: <HistoryIcon />, tone: 'neutral', title: 'guestReservation.status.past', text: 'guestReservation.status.pastText' }

/** Right after the guest cancelled: the cancellation succeeded. */
const justCancelledLook: StatusLook = {
  icon: <CircleCheckIcon />,
  tone: 'success',
  title: 'guestReservation.cancelledTitle',
  text: 'guestReservation.cancelledText',
}

/** Right after the guest changed it: the change succeeded; in the request mode the restaurant still confirms it. */
const justChangedLook: StatusLook = {
  icon: <CircleCheckIcon />,
  tone: 'success',
  title: 'guestReservation.changedTitle',
  text: 'guestReservation.changedText',
}

const justChangedRequestLook: StatusLook = {
  icon: <CircleCheckIcon />,
  tone: 'success',
  title: 'guestReservation.changeRequestedTitle',
  text: 'guestReservation.changeRequestedText',
}

/** Whether the reservation is over: its start in the restaurant's time zone plus its duration lies in the past. */
function hasEnded(reservation: GuestReservation, timeZoneId: string | null) {
  if (timeZoneId === null) {
    return false
  }
  const start = restaurantTimeToUtc(reservation.date, reservation.time, timeZoneId)
  return start.getTime() + reservation.durationMinutes * 60_000 <= Date.now()
}

/** A failed cancellation in the guest's language. */
function cancelErrorMessage(error: Error, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code === 'cancellation_not_possible') {
      return t('guestReservation.errors.notPossible')
    }
    if (error.status === 429) {
      return t('guestReservation.errors.tooManyRequests')
    }
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.kind === 'http') {
      return httpErrorMessage(error, t)
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}

/** A phone number as a link target: digits and a leading "+" only. */
function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`
}

/**
 * The guest's page of a reservation, opened through the link from the booking (/r/:slug/reservation/:code?t=token), branded
 * like the booking page: below the header a narrow band of the cover image (otherwise the first photo of the gallery), on it a large status card (symbol, colour and
 * title per status), below it the details card as in the confirmation (reference code to copy, what was booked, the
 * restaurant's address with directions and its contact) and the actions: "Add to calendar" (a menu: Google Calendar,
 * Outlook.com, .ics), "Share", while possible "Change reservation" (ChangeReservation: inline below the details card, a sheet on
 * phones) and, until the start, a quiet "Cancel" that asks first; afterwards the hint to call. After a change the status card
 * says so with a small success mark, after cancelling it confirms it and offers "Book again"; the heading takes the focus.
 * A cancelled reservation is forgotten by the browser (rememberedBookings). A wrong restaurant, code or token all show the same "not found".
 */
export function GuestReservationPage() {
  const { t } = useTranslation()
  const { slug = '', code = '' } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t') ?? ''
  const restaurant = usePublicRestaurant(slug)
  const reservation = useGuestReservation(slug, code, token)
  useDocumentTitle(
    isNotFound(restaurant.error) || isNotFound(reservation.error) ? t('guestReservation.notFoundTitle') : t('guestReservation.title'),
    restaurant.data?.name ?? null,
  )

  if (restaurant.isPending || reservation.isPending) {
    return (
      <div className={pageClassName} aria-hidden="true">
        <Skeleton data-page-part="restaurant-cover" className={cn(bandClassName, 'rounded-none')} />
        <div className={columnClassName}>
          <Skeleton className="h-44 rounded-xl border border-border bg-card" />
          <Skeleton className="h-96 rounded-xl border border-border bg-card" />
        </div>
      </div>
    )
  }

  if (isNotFound(restaurant.error) || isNotFound(reservation.error)) {
    return <NotFound icon={<CalendarX2Icon />} title={t('guestReservation.notFoundTitle')} text={t('guestReservation.notFoundText')} />
  }

  if (restaurant.isError || reservation.isError) {
    const error = (restaurant.error ?? reservation.error)!
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center font-sans text-foreground">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-6">
          <CircleAlertIcon />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl">{t('errors.title')}</h1>
          <p role="alert" className="text-muted-foreground">
            {requestErrorMessage(error, t)}
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            void restaurant.refetch()
            void reservation.refetch()
          }}
        >
          <RefreshCwIcon aria-hidden="true" />
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  const bandPhoto = restaurant.data.branding.coverUrl ?? restaurant.data.gallery[0]?.url ?? null

  return (
    <div className={pageClassName}>
      <div data-page-part="restaurant-cover" className={cn(bandClassName, 'bg-primary dark:bg-stone-900')}>
        {/*
          Only a picture of the place: the cover image, otherwise the first photo of the gallery. The first thing on the page,
          so not lazy; on the band's colour while it loads or when it fails.
        */}
        {bandPhoto !== null && <Photo src={bandPhoto} alt="" priority fallback={null} className="bg-transparent" />}
      </div>
      <div className={columnClassName}>
        <ReservationView slug={slug} code={code} token={token} restaurant={restaurant.data} reservation={reservation.data} />
      </div>
    </div>
  )
}

type ReservationViewProps = {
  slug: string
  code: string
  token: string
  restaurant: PublicRestaurant
  reservation: GuestReservation
}

function ReservationView({ slug, code, token, restaurant, reservation }: ReservationViewProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const cancel = useCancelGuestReservation(slug, code, token)
  const [confirming, setConfirming] = useState(false)
  const [changing, setChanging] = useState(false)
  // How many changes the guest made on this page: each one moves the focus to the result, also a second one.
  const [changes, setChanges] = useState(0)
  const changed = changes > 0
  const statusHeading = useRef<HTMLHeadingElement>(null)
  const changeButton = useRef<HTMLButtonElement>(null)

  // A cancelled reservation is no longer one to find again on the restaurant's page.
  useEffect(() => {
    if (reservation.status === 'Cancelled') {
      forgetBooking(slug, reservation.referenceCode)
    }
  }, [slug, reservation.status, reservation.referenceCode])

  // After a change the result takes the focus, so screen reader and keyboard users hear it.
  useEffect(() => {
    if (changes > 0) {
      statusHeading.current?.focus()
    }
  }, [changes])

  const cancelled = reservation.status === 'Cancelled'
  const closed = cancelled || reservation.status === 'Declined'
  const past = !closed && hasEnded(reservation, restaurant.timeZoneId)
  const upcoming = !closed && !past
  const justChanged = changed && !cancel.isSuccess && !closed
  const look = cancel.isSuccess
    ? justCancelledLook
    : justChanged
      ? reservation.status === 'Requested'
        ? justChangedRequestLook
        : justChangedLook
      : past
        ? pastLook
        : statusLooks[reservation.status]
  const statusText = cancelled && !cancel.isSuccess
    ? t(reservation.cancelledByGuest ? 'guestReservation.cancelledByGuest' : 'guestReservation.cancelledByRestaurant')
    : look.text !== null
      ? t(look.text)
      : null

  const date = formatLongDate(reservation.date, language)
  const time = t('common.timeRange', { start: formatTime(reservation.time, language), end: formatTime(reservation.endTime, language) })
  const guests = t('booking.guestsCount', { count: reservation.guests })
  const combined = reservation.tableNumbers.length > 1
  const tableInArea = t(combined ? 'booking.confirmation.tablesInArea' : 'booking.confirmation.tableInArea', {
    number: reservation.tableNumber,
    area: reservation.area,
  })
  const timeZoneId = restaurant.timeZoneId
  const manageUrl = `${window.location.origin}${managePath(slug, reservation.referenceCode, token)}`

  const details = [
    { icon: <CalendarIcon />, label: t('booking.confirmation.date'), value: date },
    { icon: <ClockIcon />, label: t('booking.confirmation.time'), value: time },
    { icon: <UsersIcon />, label: t('booking.confirmation.guests'), value: guests },
    { icon: <LayoutGridIcon />, label: t('booking.confirmation.area'), value: reservation.area },
    { icon: <ArmchairIcon />, label: t(combined ? 'booking.confirmation.tables' : 'booking.confirmation.table'), value: reservation.tableNumber },
    { icon: <UserIcon />, label: t('guestReservation.name'), value: reservation.name },
  ]

  // The dialog's root holds the whole view: its trigger, the cancel button, is gone after cancelling, while the dialog closes.
  return (
    <Dialog open={confirming} onOpenChange={(open) => !cancel.isPending && setConfirming(open)}>
      <Card className={cn('gap-0 border-t-4 px-6 py-6 sm:px-8 sm:py-8', tones[look.tone].card)}>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-6">
          {justChanged ? (
            // The success mark of the booking's confirmation, in the size of the status symbols.
            <SuccessMark key={`${reservation.date} ${reservation.time} ${reservation.guests}`} className="size-14 shrink-0 scale-[0.875] sm:size-16 sm:scale-100" />
          ) : (
            <span
              aria-hidden="true"
              className={cn('flex size-14 shrink-0 items-center justify-center rounded-full sm:size-16 [&_svg]:size-7 sm:[&_svg]:size-8', tones[look.tone].icon)}
            >
              {look.icon}
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">{t('guestReservation.title')}</p>
            {/* Focused after cancelling, so screen reader and keyboard users hear the result. */}
            <h1 ref={statusHeading} tabIndex={-1} className="font-display text-3xl text-balance outline-hidden sm:text-4xl">
              {t(look.title)}
            </h1>
            {statusText !== null && <p className="max-w-[60ch] text-lg text-muted-foreground">{statusText}</p>}
            {closed && (
              <Button asChild size="lg" className="mt-2 self-start">
                <Link to={`/r/${encodeURIComponent(slug)}`} viewTransition>
                  {t('guestReservation.bookAgain')}
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Below the first screen (on phones) the cards rise in as they are scrolled into view. */}
      <Reveal>
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5 sm:px-8">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">{t('guestReservation.referenceCode')}</span>
              <span className="font-mono text-2xl font-semibold tracking-[0.15em]">{reservation.referenceCode}</span>
            </div>
            <CopyButton value={reservation.referenceCode} />
          </div>

          <div className="flex flex-col gap-4 px-6 py-6 sm:px-8">
            <h2 className="font-display text-xl wrap-anywhere">{restaurant.name}</h2>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {details.map((row) => (
                <div key={row.label} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
                    <span aria-hidden="true" className="flex">
                      {row.icon}
                    </span>
                    {row.label}
                  </dt>
                  <dd className={cn('pl-6 font-medium wrap-anywhere', closed && 'text-muted-foreground line-through')}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <RestaurantContact restaurant={restaurant} />
        </Card>
      </Reveal>

      {upcoming && reservation.canChange && timeZoneId !== null && (
        <ChangeReservation
          slug={slug}
          token={token}
          restaurant={restaurant}
          timeZoneId={timeZoneId}
          reservation={reservation}
          open={changing}
          onClose={() => {
            setChanging(false)
            changeButton.current?.focus()
          }}
          onChanged={() => {
            setChanging(false)
            setChanges((count) => count + 1)
          }}
          onCloseAutoFocus={(event) => {
            // After a change the result takes the focus instead of the button.
            if (changed) {
              event.preventDefault()
              statusHeading.current?.focus()
            }
          }}
        />
      )}

      {upcoming && (
        <Reveal>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {timeZoneId !== null && (
                <>
                  <CalendarMenu reservation={reservation} restaurant={restaurant} timeZoneId={timeZoneId} manageUrl={manageUrl} />
                  <ShareMenu reservation={reservation} restaurant={restaurant} timeZoneId={timeZoneId} manageUrl={manageUrl} />
                </>
              )}
              {reservation.canChange && timeZoneId !== null && (
                <Button ref={changeButton} variant="outline" size="lg" aria-expanded={changing} onClick={() => setChanging(!changing)}>
                  <CalendarClockIcon aria-hidden="true" />
                  {t('guestReservation.change.open')}
                </Button>
              )}
              {reservation.canCancel && (
                <DialogTrigger asChild>
                  <Button variant="ghost" size="lg" className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-auto">
                    <XIcon aria-hidden="true" />
                    {t('guestReservation.cancel')}
                  </Button>
                </DialogTrigger>
              )}
            </div>

            {!reservation.canCancel && reservation.status !== 'Arrived' && (
              <Alert role="note" className="items-center">
                <PhoneIcon aria-hidden="true" />
                <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>{t('guestReservation.cannotCancel')}</span>
                  {restaurant.phone !== null && (
                    <Button asChild variant="outline">
                      <a href={phoneHref(restaurant.phone)} className="whitespace-nowrap">
                        {restaurant.phone}
                      </a>
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </Reveal>
      )}

      {cancel.isError && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{cancelErrorMessage(cancel.error, t)}</AlertDescription>
        </Alert>
      )}

      <DialogContent
        onCloseAutoFocus={(event) => {
          // The cancel button is gone after a cancellation: the result gets the focus instead.
          if (cancel.isSuccess) {
            event.preventDefault()
            statusHeading.current?.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('guestReservation.confirm.title')}</DialogTitle>
          <DialogDescription>{t('guestReservation.confirm.text')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 rounded-lg bg-muted px-4 py-3 text-sm">
          <span className="font-semibold wrap-anywhere">{restaurant.name}</span>
          <span>{date}</span>
          <span>{time}</span>
          <span>
            {guests} · {tableInArea}
          </span>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="lg" disabled={cancel.isPending}>
              {t('guestReservation.confirm.back')}
            </Button>
          </DialogClose>
          <Button
            size="lg"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(undefined, { onSettled: () => setConfirming(false) })}
            className="bg-destructive text-background hover:bg-destructive/90"
          >
            {cancel.isPending && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {t('guestReservation.confirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Copies the reference code; the button says "Copied" for a moment, and screen readers hear it. */
function CopyButton({ value }: { value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timeout = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeout)
  }, [copied])

  return (
    <>
      <Button
        variant="outline"
        onClick={() =>
          navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            // Without access to the clipboard the code stays readable and selectable.
            () => {},
          )
        }
      >
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        {copied ? t('booking.confirmation.copied') : t('booking.confirmation.copy')}
      </Button>
      <span role="status" className="sr-only">
        {copied ? t('booking.confirmation.copied') : ''}
      </span>
    </>
  )
}

/**
 * The restaurant's address with "Directions" (a map search, new tab), its phone, email and website, one row each with the
 * icon in the same column; nothing when all are empty. The links are in the text colour, so they keep the contrast in every
 * branding, and at least 44 px high to tap.
 */
function RestaurantContact({ restaurant }: { restaurant: PublicRestaurant }) {
  const { t } = useTranslation()
  const lines = addressLines(restaurant)
  const address = formatAddress(restaurant)
  const { phone, email, website } = restaurant

  if (address === '' && phone === null && email === null && website === null) {
    return null
  }

  const linkClassName = 'inline-flex min-h-11 items-center rounded-sm underline underline-offset-4 wrap-anywhere hover:decoration-2 focus-ring'

  return (
    <div className="flex flex-col gap-2 border-t border-border px-6 py-6 sm:px-8">
      <h3 className="font-display text-lg">{t('guestReservation.contact')}</h3>
      <ul className="flex flex-col">
        {address !== '' && (
          <ContactRow icon={<MapPinIcon />}>
            <address className="py-2.5 not-italic">
              {lines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <a
              href={mapSearchUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('booking.restaurant.routeTo', { address })}
              className={cn(linkClassName, 'gap-2 font-semibold')}
            >
              <RouteIcon aria-hidden="true" className="size-4" />
              {t('booking.restaurant.route')}
            </a>
          </ContactRow>
        )}
        {phone !== null && (
          <ContactRow icon={<PhoneIcon />}>
            <a href={phoneHref(phone)} className={cn(linkClassName, 'whitespace-nowrap')}>
              {phone}
            </a>
          </ContactRow>
        )}
        {email !== null && (
          <ContactRow icon={<MailIcon />}>
            <a href={`mailto:${email}`} className={linkClassName}>
              {email}
            </a>
          </ContactRow>
        )}
        {website !== null && (
          <ContactRow icon={<GlobeIcon />}>
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t('booking.restaurant.website')}: ${websiteLabel(website)}`}
              className={linkClassName}
            >
              {websiteLabel(website)}
            </a>
          </ContactRow>
        )}
      </ul>
    </div>
  )
}

/** A row of the contact: the icon centred on the first line, which is 44 px high. */
function ContactRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3">
      <span aria-hidden="true" className="flex h-11 items-center text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col items-start">{children}</div>
    </li>
  )
}

/** The website without "https://" and "www.", e.g. "zur-linde.at"; the address itself if it is not a valid URL. */
function websiteLabel(website: string) {
  try {
    return new URL(website).hostname.replace(/^www\./, '')
  } catch {
    return website
  }
}
