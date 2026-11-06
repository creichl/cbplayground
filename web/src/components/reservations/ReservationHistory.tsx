import { Accordion, Group, Skeleton, Stack, Text } from '@mantine/core'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ReservationChange, type ReservationEvent, type ReservationStatus, useReservationHistory } from '../../api/reservations.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { statusLabels } from './status.ts'

const fieldLabels = {
  Date: 'reservations.history.fields.date',
  Time: 'reservations.history.fields.time',
  PartySize: 'reservations.history.fields.partySize',
  Table: 'reservations.history.fields.table',
  Duration: 'reservations.history.fields.duration',
  Name: 'reservations.history.fields.name',
  Phone: 'reservations.history.fields.phone',
  Email: 'reservations.history.fields.email',
  Notes: 'reservations.history.fields.notes',
  Status: 'reservations.history.fields.status',
} as const

/** A value of a change in the user's language; an empty one as a dash. */
function formatValue(field: ReservationChange['field'], value: string | null, t: TFunction, language: string) {
  if (value === null) {
    return t('reservations.history.none')
  }
  switch (field) {
    case 'Date':
      return formatShortDate(value, language)
    case 'Time':
      return formatTime(value, language)
    case 'PartySize':
      return t('reservations.history.guests', { count: Number(value) })
    case 'Duration':
      return t('reservations.history.minutes', { count: Number(value) })
    case 'Status':
      return t(statusLabels[value as ReservationStatus])
    default:
      return value
  }
}

/** What happened, e.g. "Booked online by the guest" or "Anna Admin: Time 7:00 PM → 7:30 PM, Table 4 → 6". */
function describe(event: ReservationEvent, t: TFunction, language: string) {
  if (event.kind === 'CancelledByGuest') {
    return t('reservations.history.cancelledByGuest')
  }
  const name = event.userName ?? t('reservations.history.unknownStaff')
  if (event.kind === 'Created') {
    if (event.actor === 'Guest') return t('reservations.history.createdByGuest')
    if (event.actor === 'System') return t('reservations.history.createdBySystem')
    return t('reservations.history.createdByStaff', { name })
  }
  const changes = event.changes
    .map((change) => {
      const from = formatValue(change.field, change.from, t, language)
      const to = formatValue(change.field, change.to, t, language)
      // A status change reads "Confirmed → Arrived", without the field.
      return event.kind === 'StatusChanged' && change.field === 'Status'
        ? t('reservations.history.statusChange', { from, to })
        : t('reservations.history.change', { field: t(fieldLabels[change.field]), from, to })
    })
    .join(', ')
  return t('reservations.history.changedBy', { name, changes })
}

/** The history of a reservation in the drawer: folded at first, loaded once it is unfolded. */
export function ReservationHistory({ reservationId }: { reservationId: string }) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState<string | null>(null)

  return (
    <Accordion variant="contained" value={opened} onChange={setOpened}>
      <Accordion.Item value="history">
        <Accordion.Control>
          <Text fw={600}>{t('reservations.history.title')}</Text>
        </Accordion.Control>
        <Accordion.Panel>{opened !== null && <HistoryList reservationId={reservationId} />}</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}

function HistoryList({ reservationId }: { reservationId: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const history = useReservationHistory(reservationId)

  if (history.isPending) {
    return <Skeleton h={64} radius="md" />
  }
  if (history.isError) {
    return <ErrorAlert error={history.error} onRetry={() => void history.refetch()} />
  }
  if (history.data.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t('reservations.history.empty')}
      </Text>
    )
  }
  return (
    <Stack component="ol" gap="xs" m={0} p={0} style={{ listStyle: 'none' }}>
      {history.data.map((event, index) => (
        <Group component="li" key={index} gap="sm" wrap="nowrap" align="flex-start">
          <Text size="sm" c="dimmed" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {t('reservations.history.at', { date: formatShortDate(event.date, language), time: formatTime(event.time, language) })}
          </Text>
          <Text size="sm">{describe(event, t, language)}</Text>
        </Group>
      ))}
    </Stack>
  )
}
