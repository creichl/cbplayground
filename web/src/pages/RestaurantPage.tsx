import { Button, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { isNotFound, usePublicRestaurant } from '../api/publicBooking.ts'
import { BookingFlow } from '../components/booking/BookingFlow.tsx'
import { RestaurantHeader } from '../components/booking/RestaurantHeader.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

/** The booking page of a restaurant: the restaurant at the top, then the guest books a table in a few steps. */
export function RestaurantPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
  const restaurant = usePublicRestaurant(slug)
  useDocumentTitle(
    restaurant.isError && isNotFound(restaurant.error) ? t('restaurant.notFoundTitle') : t('home.reserve'),
    restaurant.data?.name ?? null,
  )

  if (restaurant.isPending) {
    return (
      <Stack gap="lg">
        <Skeleton h={40} w="60%" />
        <Skeleton h={200} radius="md" />
        <Skeleton h={160} radius="md" />
      </Stack>
    )
  }

  if (restaurant.isError) {
    if (isNotFound(restaurant.error)) {
      return (
        <Stack gap="md" align="flex-start" py="xl">
          <Title order={1}>{t('restaurant.notFoundTitle')}</Title>
          <Text c="dimmed">{t('restaurant.notFoundText')}</Text>
          <Button component={Link} to="/" size="md">
            {t('common.backToStart')}
          </Button>
        </Stack>
      )
    }
    return <ErrorAlert error={restaurant.error} onRetry={() => void restaurant.refetch()} />
  }

  return (
    <Stack gap="xl">
      <RestaurantHeader restaurant={restaurant.data} />
      {/* A new restaurant starts a new booking. */}
      <BookingFlow key={slug} slug={slug} restaurant={restaurant.data} />
    </Stack>
  )
}
