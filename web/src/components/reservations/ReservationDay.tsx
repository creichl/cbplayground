import { Button, Group, Select, Skeleton, Stack, TextInput } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Reservation, type ReservationStatus, useOpenRequests, useReservations } from '../../api/reservations.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { DayStats } from './DayStats.tsx'
import { PendingRequests } from './PendingRequests.tsx'
import { ReservationFormDrawer } from './ReservationFormDrawer.tsx'
import { ReservationList } from './ReservationList.tsx'
import { WalkInDrawer } from './WalkInDrawer.tsx'
import { statusLabels, statuses } from './status.ts'

type ReservationDayProps = {
  /** The day shown, "YYYY-MM-DD". */
  date: string
  /** Today in the restaurant's time zone. */
  today: string
}

/** Whether the reservation matches the search: part of the name or reference code, or of the phone number's digits. */
function matches(reservation: Reservation, search: string) {
  const text = search.trim().toLowerCase()
  if (text.length === 0) {
    return true
  }
  const digits = text.replace(/\D/g, '')
  return (
    reservation.name.toLowerCase().includes(text) ||
    reservation.referenceCode.toLowerCase().includes(text) ||
    (digits.length > 0 && (reservation.phone ?? '').replace(/\D/g, '').includes(digits))
  )
}

/**
 * The work view of a day for the staff: open requests, key figures, search and status filter,
 * the reservations by time with their quick actions, and the drawer to enter or change a reservation.
 */
export function ReservationDay({ date, today }: ReservationDayProps) {
  const { t } = useTranslation()
  const reservations = useReservations(date)
  const openRequests = useOpenRequests(today)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ReservationStatus | null>(null)
  // undefined: drawer closed, null: new reservation.
  const [editing, setEditing] = useState<Reservation | null | undefined>(undefined)
  const [seatingWalkIn, setSeatingWalkIn] = useState(false)

  const filtered = (reservations.data ?? []).filter(
    (reservation) => (status === null || reservation.status === status) && matches(reservation, search),
  )

  return (
    <Stack gap="lg">
      <PendingRequests today={today} onOpen={setEditing} />

      {reservations.isPending ? (
        <Skeleton h={76} radius="md" />
      ) : (
        reservations.data !== undefined && <DayStats reservations={reservations.data} openRequests={openRequests.data?.length ?? 0} />
      )}

      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          type="search"
          aria-label={t('reservations.search')}
          placeholder={t('reservations.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          size="md"
          style={{ flex: '1 1 220px' }}
        />
        <Select
          aria-label={t('reservations.filter')}
          placeholder={t('reservations.filterAll')}
          data={statuses.map((value) => ({ value, label: t(statusLabels[value]) }))}
          value={status}
          onChange={(value) => setStatus(value as ReservationStatus | null)}
          clearable
          size="md"
          style={{ flex: '0 1 200px' }}
        />
        {/* A walk-in is seated now, so only on today's page. */}
        {date === today && (
          <Button size="md" variant="light" onClick={() => setSeatingWalkIn(true)}>
            {t('reservations.walkIn.button')}
          </Button>
        )}
        <Button size="md" onClick={() => setEditing(null)}>
          {t('reservations.new')}
        </Button>
      </Group>

      {reservations.isPending ? (
        <Stack gap="sm">
          <Skeleton h={72} radius="md" />
          <Skeleton h={72} radius="md" />
          <Skeleton h={72} radius="md" />
        </Stack>
      ) : reservations.data === undefined ? (
        // Only when nothing was loaded: a failed reload in the background keeps the last list.
        <ErrorAlert error={reservations.error ?? new Error()} onRetry={() => void reservations.refetch()} />
      ) : (
        <ReservationList
          reservations={filtered}
          onOpen={setEditing}
          emptyText={t(reservations.data.length === 0 ? 'reservations.list.empty' : 'reservations.list.noMatches')}
        />
      )}

      {editing !== undefined && (
        <ReservationFormDrawer
          reservation={editing}
          defaultDate={date < today ? today : date}
          today={today}
          onClose={() => setEditing(undefined)}
        />
      )}
      {seatingWalkIn && <WalkInDrawer onClose={() => setSeatingWalkIn(false)} />}
    </Stack>
  )
}
