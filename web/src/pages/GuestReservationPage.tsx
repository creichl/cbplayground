import { Alert, Button, Card, Group, Modal, Skeleton, Stack, Table, Text, Title } from '@mantine/core'
import type { TFunction } from 'i18next'
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
import { RestaurantContact } from '../components/booking/RestaurantContact.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { StatusBadge } from '../components/reservations/StatusBadge.tsx'
import { formatLongDate, formatTime } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'

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
 * The guest's page of a reservation, opened through the link from the booking (/r/:slug/reservation/:code?t=token):
 * status, what was booked, the restaurant's contact, and cancelling until the start.
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
      <Stack gap="lg">
        <Skeleton h={40} w="60%" />
        <Skeleton h={240} radius="md" />
      </Stack>
    )
  }

  if (isNotFound(restaurant.error) || isNotFound(reservation.error)) {
    return (
      <Stack gap="md" align="flex-start" py="xl">
        <Title order={1}>{t('guestReservation.notFoundTitle')}</Title>
        <Text c="dimmed">{t('guestReservation.notFoundText')}</Text>
        <Button component={Link} to="/" size="md">
          {t('common.backToStart')}
        </Button>
      </Stack>
    )
  }

  if (restaurant.isError || reservation.isError) {
    const error = restaurant.error ?? reservation.error
    return (
      <ErrorAlert
        error={error!}
        onRetry={() => {
          void restaurant.refetch()
          void reservation.refetch()
        }}
      />
    )
  }

  return <ReservationDetails slug={slug} code={code} token={token} restaurant={restaurant.data} reservation={reservation.data} />
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

  const rows = [
    { label: t('booking.confirmation.restaurant'), value: restaurant.name },
    { label: t('booking.confirmation.date'), value: formatLongDate(reservation.date, language) },
    {
      label: t('booking.confirmation.time'),
      value: t('common.timeRange', { start: formatTime(reservation.time, language), end: formatTime(reservation.endTime, language) }),
    },
    { label: t('booking.confirmation.guests'), value: t('booking.guestsCount', { count: reservation.guests }) },
    { label: t('booking.confirmation.area'), value: reservation.area },
    { label: t('booking.confirmation.table'), value: reservation.tableNumber },
    { label: t('guestReservation.name'), value: reservation.name },
    { label: t('guestReservation.referenceCode'), value: reservation.referenceCode },
  ]

  return (
    <Stack gap="xl">
      <Stack gap={4}>
        <Group justify="space-between" align="center" gap="sm">
          <Title order={1}>{t('guestReservation.title')}</Title>
          <StatusBadge status={reservation.status} />
        </Group>
        <Text c="dimmed">{restaurant.name}</Text>
      </Stack>

      {cancel.isSuccess && (
        <Alert color="green" variant="light" title={t('guestReservation.cancelledTitle')}>
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{t('guestReservation.cancelledText')}</Text>
            <Button component={Link} to={`/r/${encodeURIComponent(slug)}`}>
              {t('guestReservation.bookAgain')}
            </Button>
          </Stack>
        </Alert>
      )}

      <Card>
        <Stack gap="lg">
          <Table withRowBorders={false} verticalSpacing={4}>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.label}>
                  <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {row.label}
                  </Table.Td>
                  <Table.Td fw={500} td={closed ? 'line-through' : undefined}>
                    {row.value}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {reservation.canCancel ? (
            <Group>
              <Button color="red" variant="light" onClick={() => setConfirming(true)}>
                {t('guestReservation.cancel')}
              </Button>
            </Group>
          ) : (
            !cancel.isSuccess &&
            (closed ? (
              <Stack gap="sm" align="flex-start">
                <Text size="sm" c="dimmed">
                  {cancelled
                    ? t(reservation.cancelledByGuest ? 'guestReservation.cancelledByGuest' : 'guestReservation.cancelledByRestaurant')
                    : t('guestReservation.declined')}
                </Text>
                <Button component={Link} to={`/r/${encodeURIComponent(slug)}`} variant="light">
                  {t('guestReservation.bookAgain')}
                </Button>
              </Stack>
            ) : (
              reservation.status !== 'Arrived' && (
                <Text size="sm" c="dimmed">
                  {t('guestReservation.cannotCancel')}
                </Text>
              )
            ))
          )}

          {cancel.isError && (
            <Alert color="red" variant="light">
              {cancelErrorMessage(cancel.error, t)}
            </Alert>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="sm">
          <Title order={2} size="h5">
            {t('guestReservation.contact')}
          </Title>
          <RestaurantContact restaurant={restaurant} />
        </Stack>
      </Card>

      <Modal opened={confirming} onClose={() => setConfirming(false)} title={t('guestReservation.confirm.title')}>
        <Stack gap="md">
          <Text size="sm">
            {t('guestReservation.confirm.text', {
              date: formatLongDate(reservation.date, language),
              time: formatTime(reservation.time, language),
              guests: t('booking.guestsCount', { count: reservation.guests }),
            })}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(false)}>
              {t('guestReservation.confirm.back')}
            </Button>
            <Button
              color="red"
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
