import { InfoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { isNotFound, usePublicRestaurant } from '../api/publicBooking.ts'
import { BookingFlow } from '../components/booking/BookingFlow.tsx'
import { ReservationCardSkeleton } from '../components/booking/ReservationCard.tsx'
import { RequestError } from '../components/booking/RequestError.tsx'
import { Alert, AlertDescription } from '../ui/alert.tsx'

/**
 * The booking of a restaurant for its own website (/embed/:slug): only the reservation card, in the full width, without
 * cover image and information. The steps after the time follow below the card instead of in a dialog: an overlay does not
 * fit an iframe that grows with its content.
 */
export function EmbedBookingPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
  const restaurant = usePublicRestaurant(slug)

  if (restaurant.isPending) {
    // In the shape of the card, so nothing jumps when it arrives.
    return <ReservationCardSkeleton />
  }

  if (restaurant.isError) {
    if (isNotFound(restaurant.error)) {
      return (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{t('embed.notFound')}</AlertDescription>
        </Alert>
      )
    }
    return <RequestError error={restaurant.error} onRetry={() => void restaurant.refetch()} />
  }

  // A new restaurant starts a new booking.
  return <BookingFlow key={slug} slug={slug} restaurant={restaurant.data} inline />
}
