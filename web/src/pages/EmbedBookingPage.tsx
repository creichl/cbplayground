import { Alert, Skeleton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { isNotFound, usePublicRestaurant } from '../api/publicBooking.ts'
import { BookingFlow } from '../components/booking/BookingFlow.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'

/**
 * The booking of a restaurant for its own website (/embed/:slug): the same steps as on the booking page, without cover image
 * and info card. Its main buttons stay below the steps: a bar fixed to the bottom of the screen does not work in an iframe
 * that grows with its content.
 */
export function EmbedBookingPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
  const restaurant = usePublicRestaurant(slug)

  if (restaurant.isPending) {
    return (
      // In the shape of the booking's card, so nothing jumps when it arrives.
      <Skeleton h={320} radius="md" />
    )
  }

  if (restaurant.isError) {
    if (isNotFound(restaurant.error)) {
      return (
        <Alert color="gray" variant="light">
          {t('embed.notFound')}
        </Alert>
      )
    }
    return <ErrorAlert error={restaurant.error} onRetry={() => void restaurant.refetch()} />
  }

  // A new restaurant starts a new booking.
  return <BookingFlow key={slug} slug={slug} restaurant={restaurant.data} />
}
