import { Anchor, Paper, SimpleGrid, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { Reservation } from '../../api/reservations.ts'
import { isActive } from './status.ts'

type DayStatsProps = {
  /** The reservations of the day, all statuses. */
  reservations: Reservation[]
  /** The number of open requests from today on. */
  openRequests: number
  /** Shows how many guests have arrived; the admin overview leaves it out. */
  withArrived?: boolean
  /** Where the open requests are answered; without it the number is not a link. */
  requestsTo?: string
}

/** The key figures of a day: reservations and guests without cancelled and declined ones, arrived, open requests. */
export function DayStats({ reservations, openRequests, withArrived = true, requestsTo }: DayStatsProps) {
  const { t } = useTranslation()
  const active = reservations.filter(isActive)
  const arrived = reservations.filter((reservation) => reservation.status === 'Arrived')

  return (
    <SimpleGrid cols={{ base: 2, sm: withArrived ? 4 : 3 }} spacing="sm">
      <Stat label={t('reservations.stats.reservations')} value={active.length} />
      <Stat label={t('reservations.stats.guests')} value={active.reduce((sum, reservation) => sum + reservation.guests, 0)} />
      {withArrived && <Stat label={t('reservations.stats.arrived')} value={arrived.length} />}
      <Stat
        label={t('reservations.stats.openRequests')}
        value={
          requestsTo !== undefined ? (
            <Anchor component={Link} to={requestsTo} inherit>
              {openRequests}
            </Anchor>
          ) : (
            openRequests
          )
        }
        highlight={openRequests > 0}
      />
    </SimpleGrid>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <Paper withBorder p="sm" radius="md" bg={highlight ? 'yellow.0' : 'white'}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} fz={28} lh={1.2}>
        {value}
      </Text>
    </Paper>
  )
}
