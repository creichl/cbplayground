import { Box, Button, Container, Grid, Skeleton, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { isNotFound, type PublicRestaurant, usePublicRestaurant } from '../api/publicBooking.ts'
import { BookingFlow } from '../components/booking/BookingFlow.tsx'
import { bookingSectionId, contentWidth, headerHeight } from '../components/booking/layout.ts'
import { useOpeningStatus } from '../components/booking/openingStatus.ts'
import { RestaurantHeader, RestaurantHeaderSkeleton } from '../components/booking/RestaurantHeader.tsx'
import { RestaurantInfo } from '../components/booking/RestaurantInfo.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

// Spacing follows an 8 px grid (8, 16, 24, 32, 48), text sizes Mantine's fixed scale.

/**
 * The booking page of a restaurant. At the top its cover image, about half the screen high, with name, city and whether it
 * is open today. Below, from about 992 px on, the booking on the left (about 2/3, with the description above it, cut to
 * three lines) and the info card on the right, which stays in view. On phones the booking comes right below the cover
 * image, the info and the description after it.
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
      <>
        <RestaurantHeaderSkeleton />
        <Container size={contentWidth} py={{ base: 16, md: 32 }}>
          <Grid gap={32}>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Skeleton h={320} radius="md" />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }} visibleFrom="md">
              <Skeleton h={240} radius="md" />
            </Grid.Col>
          </Grid>
        </Container>
      </>
    )
  }

  if (restaurant.isError) {
    return (
      <Container size="sm" py={48}>
        {isNotFound(restaurant.error) ? (
          <Stack gap={16} align="flex-start">
            <Title order={1}>{t('restaurant.notFoundTitle')}</Title>
            <Text size="lg">{t('restaurant.notFoundText')}</Text>
            <Button component={Link} to="/" size="md" h={48}>
              {t('common.backToStart')}
            </Button>
          </Stack>
        ) : (
          <ErrorAlert error={restaurant.error} onRetry={() => void restaurant.refetch()} />
        )}
      </Container>
    )
  }

  return <RestaurantContent slug={slug} restaurant={restaurant.data} />
}

function RestaurantContent({ slug, restaurant }: { slug: string; restaurant: PublicRestaurant }) {
  const status = useOpeningStatus(slug, restaurant)
  const { name, city, description, branding } = restaurant

  return (
    <>
      <RestaurantHeader name={name} city={city} coverUrl={branding.coverUrl} facts={status !== null ? [status.text] : []} />
      <Container size={contentWidth} py={{ base: 16, md: 32 }}>
        <Grid gap={32}>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap={24}>
              {description !== null && (
                <Box visibleFrom="md">
                  <Description text={description} />
                </Box>
              )}
              <Box id={bookingSectionId} style={{ scrollMarginTop: headerHeight + 16 }}>
                {/* A new restaurant starts a new booking. */}
                <BookingFlow key={slug} slug={slug} restaurant={restaurant} stickyBar />
              </Box>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            {/* As high as the booking, so the info card can stay in view beside it. */}
            <Stack gap={24} h="100%">
              <RestaurantInfo slug={slug} restaurant={restaurant} />
              {description !== null && (
                <Box hiddenFrom="md">
                  <Description text={description} />
                </Box>
              )}
            </Stack>
          </Grid.Col>
        </Grid>
      </Container>
    </>
  )
}

/** The restaurant's description, at most about 65 characters wide, cut to three lines with "More" when it is longer. */
function Description({ text }: { text: string }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null || expanded) {
      return
    }
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [expanded, text])

  return (
    <Stack gap={4} align="flex-start" maw="65ch">
      <Text ref={ref} size="lg" lineClamp={expanded ? undefined : 3} style={{ whiteSpace: 'pre-line' }}>
        {text}
      </Text>
      {(overflowing || expanded) && (
        <UnstyledButton
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mantine-focus-auto"
          fw={600}
          td="underline"
          mih={44}
          style={{ borderRadius: 'var(--mantine-radius-sm)' }}
        >
          {expanded ? t('booking.restaurant.less') : t('booking.restaurant.more')}
        </UnstyledButton>
      )}
    </Stack>
  )
}
