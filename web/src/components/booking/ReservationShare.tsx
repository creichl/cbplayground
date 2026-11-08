import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CalendarPlusIcon, CheckIcon, ChevronDownIcon, DownloadIcon, LinkIcon, Share2Icon, TextIcon } from 'lucide-react'
import { type ReactNode, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { ThemeRootContext } from '../../brandTheme.ts'
import { formatLongDate, formatTime } from '../../i18n/format.ts'
import { Button } from '../../ui/button.tsx'
import { type CalendarEvent, calendarFile, downloadCalendarFile, googleCalendarUrl, outlookCalendarUrl } from './calendarFile.ts'
import { formatAddress } from './format.ts'

/** What the calendar and the share menus need of a reservation: the booking's result or the guest's reservation. */
type SharedReservation = { referenceCode: string; date: string; time: string; durationMinutes: number; guests: number }

type ReservationShareProps = {
  reservation: SharedReservation
  restaurant: PublicRestaurant
  timeZoneId: string
  /** The guest's link to view, change and cancel the reservation. */
  manageUrl: string
  /** The look of the menu's button. */
  variant?: 'primary' | 'outline'
  className?: string
}

const contentClassName =
  'z-50 min-w-64 origin-(--radix-dropdown-menu-content-transform-origin) rounded-xl border border-border bg-popover p-1 font-sans text-popover-foreground shadow-float data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out'

const itemClassName =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'

/** An entry of a menu with a second line, e.g. what it shares. */
function ItemText({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium">{label}</span>
      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
    </span>
  )
}

/** The reservation as a calendar event: start and end, the restaurant and its address, and the guest's link in the text. */
function useCalendarEvent({ reservation, restaurant, timeZoneId, manageUrl }: ReservationShareProps): CalendarEvent {
  const { t } = useTranslation()
  return {
    uid: `${reservation.referenceCode}@cbplayground`,
    title: t('booking.calendarEvent.title', { restaurant: restaurant.name }),
    date: reservation.date,
    time: reservation.time,
    durationMinutes: reservation.durationMinutes,
    timeZoneId,
    location: [restaurant.name, formatAddress(restaurant)].filter((part) => part !== '').join(', '),
    description: t('booking.calendarEvent.description', {
      guests: t('booking.guestsCount', { count: reservation.guests }),
      code: reservation.referenceCode,
      link: manageUrl,
    }),
    url: manageUrl,
  }
}

/** The menu's button with the menu below it, in the restaurant's theme. */
function Menu({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={useContext(ThemeRootContext)}>
        <DropdownMenu.Content align="start" sideOffset={4} className={contentClassName}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/**
 * "Add to calendar" as a menu: Google Calendar and Outlook.com open their page to add the event (new tab), "Apple Calendar or
 * other" saves the .ics file as before, with a reminder 2 hours before. In-app browsers that do not open files still open the links.
 */
export function CalendarMenu(props: ReservationShareProps) {
  const { t } = useTranslation()
  const event = useCalendarEvent(props)
  const link = (href: string, label: string) => (
    <DropdownMenu.Item asChild className={itemClassName}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <CalendarPlusIcon aria-hidden="true" />
        <ItemText label={label} />
      </a>
    </DropdownMenu.Item>
  )

  return (
    <Menu
      trigger={
        <Button size="lg" variant={props.variant ?? 'primary'} className={props.className}>
          <CalendarPlusIcon aria-hidden="true" />
          {t('booking.confirmation.addToCalendar')}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      }
    >
      {link(googleCalendarUrl(event), t('booking.share.google'))}
      {link(outlookCalendarUrl(event), t('booking.share.outlook'))}
      <DropdownMenu.Item
        className={itemClassName}
        onSelect={() => downloadCalendarFile(`${t('booking.calendarEvent.fileName')}-${props.reservation.referenceCode}.ics`, calendarFile(event))}
      >
        <DownloadIcon aria-hidden="true" />
        <ItemText label={t('booking.share.ics')} hint={t('booking.share.icsHint')} />
      </DropdownMenu.Item>
    </Menu>
  )
}

/**
 * "Share" as a menu: the reservation's day, time, party and restaurant, and only on the explicit choice "Share with link" also
 * the guest's link (with which anyone can change or cancel it). Through the device's share sheet where the browser has one,
 * otherwise copied; the button then says "Copied" for a moment, and screen readers hear it.
 */
export function ShareMenu(props: ReservationShareProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const { reservation, restaurant, manageUrl } = props
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timeout = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeout)
  }, [copied])

  const title = t('booking.calendarEvent.title', { restaurant: restaurant.name })
  const text = t('booking.share.text', {
    restaurant: restaurant.name,
    date: formatLongDate(reservation.date, language),
    time: formatTime(reservation.time, language),
    guests: t('booking.guestsCount', { count: reservation.guests }),
  })

  const copy = (value: string) =>
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setCopied(true))
      // Without access to the clipboard nothing happens; the details stay on the page.
      .catch(() => setCopied(false))

  const share = (withLink: boolean) => {
    const data: ShareData = withLink ? { title, text, url: manageUrl } : { title, text }
    if (typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data))) {
      // Closing the share sheet is no error; a refused one falls back to copying.
      navigator.share(data).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          copy(withLink ? `${text}\n${manageUrl}` : text)
        }
      })
      return
    }
    copy(withLink ? `${text}\n${manageUrl}` : text)
  }

  return (
    <>
      <Menu
        trigger={
          <Button size="lg" variant={props.variant ?? 'outline'} className={props.className}>
            {copied ? <CheckIcon aria-hidden="true" /> : <Share2Icon aria-hidden="true" />}
            {copied ? t('booking.confirmation.copied') : t('booking.share.share')}
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        }
      >
        <DropdownMenu.Item className={itemClassName} onSelect={() => share(false)}>
          <TextIcon aria-hidden="true" />
          <ItemText label={t('booking.share.withoutLink')} hint={t('booking.share.withoutLinkHint')} />
        </DropdownMenu.Item>
        <DropdownMenu.Item className={itemClassName} onSelect={() => share(true)}>
          <LinkIcon aria-hidden="true" />
          <ItemText label={t('booking.share.withLink')} hint={t('booking.share.withLinkHint')} />
        </DropdownMenu.Item>
      </Menu>
      <span role="status" className="sr-only">
        {copied ? t('booking.confirmation.copied') : ''}
      </span>
    </>
  )
}
