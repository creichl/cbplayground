import { Anchor, Box, Text } from '@mantine/core'
import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { LinkIcon, MailIcon, MapPinIcon, PhoneIcon, RouteIcon } from '../icons.tsx'
import { addressLines, formatAddress, mapSearchUrl } from './format.ts'

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

/**
 * The restaurant's address as a block with "Route" (a map search, new tab) in its own line below, its phone, email and
 * website, one row each with the icon in the same column; nothing when all are empty. Email and website break only before
 * "@" and dots (anywhere only as the last resort) and carry the full value as title. The links are in the text colour, so
 * they keep the contrast in every branding.
 */
export function RestaurantContact({ restaurant }: { restaurant: PublicRestaurant }) {
  const { t } = useTranslation()
  const lines = addressLines(restaurant)
  const address = formatAddress(restaurant)

  if (address === '' && restaurant.phone === null && restaurant.email === null && restaurant.website === null) {
    return null
  }

  return (
    <Box component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
      {address !== '' && (
        <Row icon={<MapPinIcon />}>
          <Text component="address" py={10} fs="normal">
            {lines.map((line, index) => (
              <Fragment key={index}>
                {index > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </Text>
          <Anchor
            href={mapSearchUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            fw={600}
            c="var(--mantine-color-text)"
            underline="always"
            mih={44}
            aria-label={t('booking.restaurant.routeTo', { address })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <RouteIcon size={16} />
            {t('booking.restaurant.route')}
          </Anchor>
        </Row>
      )}
      {restaurant.phone !== null && (
        <Row icon={<PhoneIcon />}>
          <ContactLink href={`tel:${restaurant.phone.replace(/[^0-9+]/g, '')}`} noWrap>
            {restaurant.phone}
          </ContactLink>
        </Row>
      )}
      {restaurant.email !== null && (
        <Row icon={<MailIcon />}>
          <ContactLink href={`mailto:${restaurant.email}`} title={restaurant.email}>
            {breakable(restaurant.email)}
          </ContactLink>
        </Row>
      )}
      {restaurant.website !== null && (
        <Row icon={<LinkIcon />}>
          <ContactLink
            href={restaurant.website}
            external
            title={restaurant.website}
            label={`${t('booking.restaurant.website')}: ${websiteLabel(restaurant.website)}`}
          >
            {breakable(websiteLabel(restaurant.website))}
          </ContactLink>
        </Row>
      )}
    </Box>
  )
}

/** A row of the list: the icon in a column of its own, centred on the first line of the text, which is 44 px high to tap. */
function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Box component="li" style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', columnGap: 16, alignItems: 'start' }}>
      <Box c="dimmed" h={44} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
        {icon}
      </Box>
      <Box miw={0} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {children}
      </Box>
    </Box>
  )
}

type ContactLinkProps = {
  href: string
  external?: boolean
  label?: string
  title?: string
  /** Kept in one line, e.g. a phone number. */
  noWrap?: boolean
  children: ReactNode
}

function ContactLink({ href, external, label, title, noWrap, children }: ContactLinkProps) {
  return (
    <Anchor
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-label={label}
      title={title}
      c="var(--mantine-color-text)"
      // 44 px high to tap, also when the line wraps.
      display="block"
      py={10}
      maw="100%"
      style={noWrap ? { whiteSpace: 'nowrap' } : { overflowWrap: 'anywhere' }}
    >
      {children}
    </Anchor>
  )
}
