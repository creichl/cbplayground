import { Badge } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ReservationStatus } from '../../api/reservations.ts'
import { statusColors, statusLabels } from './status.ts'

export function StatusBadge({ status }: { status: ReservationStatus }) {
  const { t } = useTranslation()
  return (
    <Badge color={statusColors[status]} variant="light" size="lg" style={{ flexShrink: 0 }}>
      {t(statusLabels[status])}
    </Badge>
  )
}
