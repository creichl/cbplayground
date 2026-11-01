import { Anchor, Box, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { LinkIcon, MailIcon, MapPinIcon, PhoneIcon } from '../icons.tsx'
import { formatAddress, mapSearchUrl } from './format.ts'

/** The website without "https://" and "www.", e.g. "zur-linde.at"; the address itself if it is not a valid URL. */
function websiteLabel(website: string) {
  try {
    return new URL(website).hostname.replace(/^www\./, '')
  } catch {
    return website
  }
}

/**
 * The restaurant's address with "Route" (a map search, new tab), its phone, email and website, one row each with an icon;
 * nothing when all are empty. The links are in the text colour, so they keep the contrast in every branding.
 */
export function RestaurantContact({ restaurant }: { restaurant: PublicRestaurant }) {
  const { t } = useTranslation()
  const address = formatAddress(restaurant)

  if (address === '' && restaurant.phone === null && restaurant.email === null && restaurant.website === null) {
    return null
  }

  return (
    <Stack gap={0} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
      {address !== '' && (
        <Row icon={<MapPinIcon />}>
          <Group gap={8} justify="space-between" wrap="nowrap" w="100%">
            <Text style={{ overflowWrap: 'anywhere' }}>{address}</Text>
            <Anchor
              href={mapSearchUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              fw={600}
              c="var(--mantine-color-text)"
              underline="always"
              lh="44px"
              aria-label={t('booking.restaurant.routeTo', { address })}
              style={{ flexShrink: 0 }}
            >
              {t('booking.restaurant.route')}
            </Anchor>
          </Group>
        </Row>
      )}
      {restaurant.phone !== null && (
        <Row icon={<PhoneIcon />}>
          <ContactLink href={`tel:${restaurant.phone.replace(/[^0-9+]/g, '')}`}>{restaurant.phone}</ContactLink>
        </Row>
      )}
      {restaurant.email !== null && (
        <Row icon={<MailIcon />}>
          <ContactLink href={`mailto:${restaurant.email}`}>{restaurant.email}</ContactLink>
        </Row>
      )}
      {restaurant.website !== null && (
        <Row icon={<LinkIcon />}>
          <ContactLink href={restaurant.website} external label={`${t('booking.restaurant.website')}: ${websiteLabel(restaurant.website)}`}>
            {websiteLabel(restaurant.website)}
          </ContactLink>
        </Row>
      )}
    </Stack>
  )
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Group component="li" gap={16} wrap="nowrap" mih={44}>
      <Box c="dimmed" style={{ display: 'flex', flexShrink: 0 }} aria-hidden="true">
        {icon}
      </Box>
      {children}
    </Group>
  )
}

function ContactLink({ href, external, label, children }: { href: string; external?: boolean; label?: string; children: ReactNode }) {
  return (
    <Anchor
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-label={label}
      c="var(--mantine-color-text)"
      // 44 px high to tap, also when the line wraps.
      display="block"
      py={10}
      miw={0}
      style={{ overflowWrap: 'anywhere' }}
    >
      {children}
    </Anchor>
  )
}
