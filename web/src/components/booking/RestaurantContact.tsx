import { GlobeIcon, MailIcon, PhoneIcon } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { hasContact } from './layout.ts'

/** The website without "https://" and "www.", e.g. "zur-linde.at"; the address itself if it is not a valid URL. */
function websiteLabel(website: string) {
  try {
    return new URL(website).hostname.replace(/^www\./, '')
  } catch {
    return website
  }
}

/**
 * An email address or host name that may break before "@" and before each dot, e.g. "reservierung" / "@rooftop-belvedere.rs",
 * instead of in the middle of a word.
 */
function breakable(text: string) {
  return text.split(/(?=[@.])/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <wbr />}
      {part}
    </Fragment>
  ))
}

// On touch screens 44 px high, the margin taking back what it adds to the row.
const linkClassName = 'rounded-sm underline-offset-4 hover:underline focus-ring touch:-my-2.5 touch:inline-flex touch:min-h-11 touch:items-center'

/**
 * "Contact" at the end of the restaurant's page: its phone, email and website, one row each with its icon (lucide) in the
 * same column; nothing when all are empty. The address with "Directions" is in the card "Hours & location" at the top
 * (HoursAndLocation), and so is the phone, which stays here too for the guest who reaches the end. Email and website break
 * only before "@" and dots (anywhere only as the last resort) and carry the full value as title. The links are in the text
 * colour, so they keep the contrast in every branding; every row is at least 44 px high to tap.
 */
export function RestaurantContact({ restaurant }: { restaurant: PublicRestaurant }) {
  const { t } = useTranslation()

  if (!hasContact(restaurant)) {
    return null
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {restaurant.phone !== null && (
        <Row icon={<PhoneIcon />}>
          <a href={`tel:${restaurant.phone.replace(/[^0-9+]/g, '')}`} className={`whitespace-nowrap ${linkClassName}`}>
            {restaurant.phone}
          </a>
        </Row>
      )}
      {restaurant.email !== null && (
        <Row icon={<MailIcon />}>
          <a href={`mailto:${restaurant.email}`} title={restaurant.email} className={`wrap-anywhere ${linkClassName}`}>
            {breakable(restaurant.email)}
          </a>
        </Row>
      )}
      {restaurant.website !== null && (
        <Row icon={<GlobeIcon />}>
          <a
            href={restaurant.website}
            target="_blank"
            rel="noopener noreferrer"
            title={restaurant.website}
            aria-label={`${t('booking.restaurant.website')}: ${websiteLabel(restaurant.website)}`}
            className={`wrap-anywhere ${linkClassName}`}
          >
            {breakable(websiteLabel(restaurant.website))}
          </a>
        </Row>
      )}
    </ul>
  )
}

/** A row of the list: the icon in a column of its own on the first line of the text. */
function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4 py-3">
      <span aria-hidden="true" className="flex h-6 items-center text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>
      <div className="flex min-h-6 min-w-0 flex-col items-start justify-center">{children}</div>
    </li>
  )
}
