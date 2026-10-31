import { Anchor, Group, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { formatAddress, mapSearchUrl } from './format.ts'

/** The restaurant's address as a link to a map search, and its phone, email and website; nothing when all are empty. */
export function RestaurantContact({ restaurant }: { restaurant: PublicRestaurant }) {
  const { t } = useTranslation()
  const address = formatAddress(restaurant)

  if (address === '' && restaurant.phone === null && restaurant.email === null && restaurant.website === null) {
    return null
  }

  return (
    <Stack gap={4}>
      {address !== '' && (
        <Anchor
          size="sm"
          href={mapSearchUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('booking.restaurant.addressOnMap', { address })}
        >
          {address}
        </Anchor>
      )}
      <Group gap="md" wrap="wrap">
        {restaurant.phone !== null && (
          <Anchor size="sm" href={`tel:${restaurant.phone.replace(/[^0-9+]/g, '')}`}>
            {restaurant.phone}
          </Anchor>
        )}
        {restaurant.email !== null && (
          <Anchor size="sm" href={`mailto:${restaurant.email}`}>
            {restaurant.email}
          </Anchor>
        )}
        {restaurant.website !== null && (
          <Anchor size="sm" href={restaurant.website} target="_blank" rel="noopener noreferrer">
            {t('booking.restaurant.website')}
          </Anchor>
        )}
      </Group>
    </Stack>
  )
}
