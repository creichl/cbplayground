import { Alert, Box, Button, Card, Container, Group, Modal, Skeleton, Stack, Text, ThemeIcon, Title, VisuallyHidden } from '@mantine/core'
import type { ParseKeys, TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError, httpErrorMessage } from '../api/client.ts'
import {
  type GuestReservation,
  isNotFound,
  type PublicRestaurant,
  useCancelGuestReservation,
  useGuestReservation,
  usePublicRestaurant,
} from '../api/publicBooking.ts'
import { contentWidth } from '../components/booking/layout.ts'
import { RestaurantContact } from '../components/booking/RestaurantContact.tsx'
import { RestaurantHeader, RestaurantHeaderSkeleton } from '../components/booking/RestaurantHeader.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { ArmchairIcon, BanIcon, CalendarIcon, CheckIcon, ClockIcon, UserIcon, UsersIcon, XIcon } from '../components/icons.tsx'
import { formatLongDate, formatTime } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'

// Spacing follows an 8 px grid (8, 16, 24, 32, 48), text sizes Mantine's fixed scale.

/** The width of the reservation's cards, so lines stay short. */
const cardsWidth = 720

/** How each status looks to the guest: never by colour alone, always with an icon and a title. */
const statusLooks: Record<GuestReservation['status'], { icon: ReactNode; color: string; title: ParseKeys }> = {
  Requested: { icon: <ClockIcon size={28} />, color: 'yellow', title: 'guestReservation.status.requested' },
  Confirmed: { icon: <CheckIcon size={28} strokeWidth={3} />, color: 'green', title: 'guestReservation.status.confirmed' },
  Arrived: { icon: <CheckIcon size={28} strokeWidth={3} />, color: 'green', title: 'guestReservation.status.arrived' },
  Late: { icon: <ClockIcon size={28} />, color: 'orange', title: 'guestReservation.status.late' },
  Cancelled: { icon: <XIcon size={28} />, color: 'gray', title: 'guestReservation.status.cancelled' },
  Declined: { icon: <BanIcon size={28} />, color: 'gray', title: 'guestReservation.status.declined' },
}

/** A failed cancellation in the guest's language. */
function cancelErrorMessage(error: Error, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code === 'cancellation_not_possible') {
      return t('guestReservation.errors.notPossible')
    }
    if (error.status === 429) {
      return t('guestReservation.errors.tooManyRequests')
    }
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.kind === 'http') {
      return httpErrorMessage(error, t)
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}

/**
 * The guest's page of a reservation, opened through the link from the booking (/r/:slug/reservation/:code?t=token), in the
 * look of the booking page: the cover image, a status card at the top, below it what was booked and the restaurant's
 * contact. Cancelling until the start is a quiet button that asks first; afterwards "Book again" leads to the booking.
 * A wrong restaurant, code or token all show the same "not found".
 */
export function GuestReservationPage() {
  const { t } = useTranslation()
  const { slug = '', code = '' } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('t') ?? ''
  const restaurant = usePublicRestaurant(slug)
  const reservation = useGuestReservation(slug, code, token)
  useDocumentTitle(
    isNotFound(restaurant.error) || isNotFound(reservation.error) ? t('guestReservation.notFoundTitle') : t('guestReservation.title'),
    restaurant.data?.name ?? null,
  )

  if (restaurant.isPending || reservation.isPending) {
    return (
      <>
        <RestaurantHeaderSkeleton size="compact" />
        <Container size={cardsWidth} py={{ base: 16, md: 32 }}>
          <Stack gap={24}>
            <Skeleton h={160} radius="md" />
            <Skeleton h={240} radius="md" />
          </Stack>
        </Container>
      </>
    )
  }

  if (isNotFound(restaurant.error) || isNotFound(reservation.error)) {
    return (
      <Container size="sm" py={48}>
        <Stack gap={16} align="flex-start">
          <Title order={1}>{t('guestReservation.notFoundTitle')}</Title>
          <Text size="lg">{t('guestReservation.notFoundText')}</Text>
          <Button component={Link} to="/" size="md" h={48}>
            {t('common.backToStart')}
          </Button>
        </Stack>
      </Container>
    )
  }

  if (restaurant.isError || reservation.isError) {
    const error = restaurant.error ?? reservation.error
    return (
      <Container size="sm" py={48}>
        <ErrorAlert
          error={error!}
          onRetry={() => {
            void restaurant.refetch()
            void reservation.refetch()
          }}
        />
      </Container>
    )
  }

  const { name, city, branding } = restaurant.data
  return (
    <>
      <RestaurantHeader name={name} city={city} coverUrl={branding.coverUrl} size="compact" />
      <Container size={contentWidth} py={{ base: 16, md: 32 }}>
        <Box maw={cardsWidth} mx="auto">
          <ReservationDetails slug={slug} code={code} token={token} restaurant={restaurant.data} reservation={reservation.data} />
        </Box>
      </Container>
    </>
  )
}

type ReservationDetailsProps = {
  slug: string
  code: string
  token: string
  restaurant: PublicRestaurant
  reservation: GuestReservation
}

function ReservationDetails({ slug, code, token, restaurant, reservation }: ReservationDetailsProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const cancel = useCancelGuestReservation(slug, code, token)
  const [confirming, setConfirming] = useState(false)
  const cancelled = reservation.status === 'Cancelled'
  const closed = cancelled || reservation.status === 'Declined'
  const look = statusLooks[reservation.status]
  const bookingPath = `/r/${encodeURIComponent(slug)}`

  const statusText = cancel.isSuccess
    ? t('guestReservation.cancelledText')
    : cancelled
      ? t(reservation.cancelledByGuest ? 'guestReservation.cancelledByGuest' : 'guestReservation.cancelledByRestaurant')
      : reservation.status === 'Declined'
        ? t('guestReservation.declined')
        : reservation.status === 'Requested'
          ? t('guestReservation.status.requestedText')
          : reservation.status === 'Confirmed'
            ? t('guestReservation.status.confirmedText')
            : null

  const rows = [
    { icon: <CalendarIcon />, label: t('booking.confirmation.date'), value: formatLongDate(reservation.date, language) },
    {
      icon: <ClockIcon />,
      label: t('booking.confirmation.time'),
      value: t('common.timeRange', { start: formatTime(reservation.time, language), end: formatTime(reservation.endTime, language) }),
    },
    { icon: <UsersIcon />, label: t('booking.confirmation.guests'), value: t('booking.guestsCount', { count: reservation.guests }) },
    {
      icon: <ArmchairIcon />,
      label: t('booking.confirmation.table'),
      value: t('booking.confirmation.tableInArea', { number: reservation.tableNumber, area: reservation.area }),
    },
    { icon: <UserIcon />, label: t('guestReservation.name'), value: reservation.name },
  ]

  return (
    <Stack gap={24}>
      <Card p={{ base: 16, sm: 24 }}>
        <Group gap={16} wrap="nowrap" align="flex-start">
          <ThemeIcon size={56} radius="xl" variant="light" color={look.color} style={{ flexShrink: 0 }}>
            {look.icon}
          </ThemeIcon>
          <Stack gap={8} miw={0}>
            <Text size="sm" fw={600}>
              {t('guestReservation.title')}
            </Text>
            <Title order={2} size="h3">
              {cancel.isSuccess ? t('guestReservation.cancelledTitle') : t(look.title)}
            </Title>
            {statusText !== null && <Text maw="60ch">{statusText}</Text>}
            <Text size="sm">
              {t('guestReservation.referenceCode')}:{' '}
              <Text component="span" fw={700} ff="monospace" style={{ letterSpacing: '0.1em' }}>
                {reservation.referenceCode}
              </Text>
            </Text>
            {closed && (
              <Group pt={8}>
                <Button component={Link} to={bookingPath} h={48}>
                  {t('guestReservation.bookAgain')}
                </Button>
              </Group>
            )}
          </Stack>
        </Group>
      </Card>

      <Card p={{ base: 16, sm: 24 }}>
        <Stack gap={16}>
          <Title order={2} size="h4">
            {restaurant.name}
          </Title>
          <Stack gap={8} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
            {rows.map((row) => (
              <Group key={row.label} component="li" gap={16} wrap="nowrap" align="flex-start" td={closed ? 'line-through' : undefined}>
                <Box c="dimmed" style={{ display: 'flex', flexShrink: 0, paddingTop: 3 }} aria-hidden="true">
                  {row.icon}
                </Box>
                <Text>
                  {/* The icon says it on screen. */}
                  <VisuallyHidden>{`${row.label}: `}</VisuallyHidden>
                  {row.value}
                </Text>
              </Group>
            ))}
          </Stack>

          {reservation.canCancel ? (
            <Group pt={8}>
              <Button variant="default" h={44} leftSection={<XIcon />} onClick={() => setConfirming(true)}>
                {t('guestReservation.cancel')}
              </Button>
            </Group>
          ) : (
            !closed &&
            reservation.status !== 'Arrived' && <Text size="sm">{t('guestReservation.cannotCancel')}</Text>
          )}

          {cancel.isError && (
            <Alert color="red" variant="light" role="alert">
              {cancelErrorMessage(cancel.error, t)}
            </Alert>
          )}
        </Stack>
      </Card>

      <Card p={{ base: 16, sm: 24 }}>
        <Stack gap={8}>
          <Title order={2} ff="text" fz="lg" fw={700}>
            {t('guestReservation.contact')}
          </Title>
          <RestaurantContact restaurant={restaurant} />
        </Stack>
      </Card>

      <Modal opened={confirming} onClose={() => setConfirming(false)} title={t('guestReservation.confirm.title')}>
        <Stack gap={16}>
          <Text size="sm">
            {t('guestReservation.confirm.text', {
              date: formatLongDate(reservation.date, language),
              time: formatTime(reservation.time, language),
              guests: t('booking.guestsCount', { count: reservation.guests }),
            })}
          </Text>
          <Group justify="flex-end" gap={8}>
            <Button variant="default" h={44} onClick={() => setConfirming(false)}>
              {t('guestReservation.confirm.back')}
            </Button>
            <Button
              color="red"
              h={44}
              loading={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onSettled: () => setConfirming(false) })}
            >
              {t('guestReservation.confirm.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
