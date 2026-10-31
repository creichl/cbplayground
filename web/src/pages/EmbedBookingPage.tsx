import { Alert, Skeleton, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { isNotFound, usePublicRestaurant } from '../api/publicBooking.ts'
import { BookingFlow } from '../components/booking/BookingFlow.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'

/** The booking of a restaurant for its own website (/embed/:slug): only the booking steps, without the restaurant's details. */
export function EmbedBookingPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
  const restaurant = usePublicRestaurant(slug)

  if (restaurant.isPending) {
    return (
      <Stack gap="lg">
        <Skeleton h={32} w="50%" />
        <Skeleton h={200} radius="md" />
      </Stack>
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
