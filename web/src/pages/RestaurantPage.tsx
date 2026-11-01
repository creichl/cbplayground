import { Button, Container, Grid, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { isNotFound, usePublicRestaurant } from '../api/publicBooking.ts'
import { BookingFlow } from '../components/booking/BookingFlow.tsx'
import { RestaurantHeader } from '../components/booking/RestaurantHeader.tsx'
import { RestaurantInfo } from '../components/booking/RestaurantInfo.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

/**
 * The booking page of a restaurant: its cover image with logo and name at the top, its description, then the booking as the
 * main content with contact and opening hours next to it (below it on phones).
 */
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
        <Skeleton h={{ base: 120, sm: 200 }} radius={0} />
        <Container size="lg" w="100%">
          <Stack gap="lg">
            <Skeleton h={20} w="60%" />
            <Skeleton h={240} radius="md" />
          </Stack>
        </Container>
      </Stack>
    )
  }

  if (restaurant.isError) {
    return (
      <Container size="sm" py="xl">
        {isNotFound(restaurant.error) ? (
          <Stack gap="md" align="flex-start" py="xl">
            <Title order={1}>{t('restaurant.notFoundTitle')}</Title>
            <Text c="dimmed">{t('restaurant.notFoundText')}</Text>
            <Button component={Link} to="/" size="md">
              {t('common.backToStart')}
            </Button>
          </Stack>
        ) : (
          <ErrorAlert error={restaurant.error} onRetry={() => void restaurant.refetch()} />
        )}
      </Container>
    )
  }

  const { name, city, description, branding } = restaurant.data
  return (
    <>
      <RestaurantHeader name={name} city={city} logoUrl={branding.logoUrl} coverUrl={branding.coverUrl} />
      <Container size="lg" py={{ base: 'md', sm: 'xl' }}>
        <Stack gap="lg">
          {description !== null && (
            <Text c="dimmed" maw={720}>
              {description}
            </Text>
          )}
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 8 }}>
              {/* A new restaurant starts a new booking. */}
              <BookingFlow key={slug} slug={slug} restaurant={restaurant.data} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <RestaurantInfo restaurant={restaurant.data} />
            </Grid.Col>
          </Grid>
        </Stack>
      </Container>
    </>
  )
}
