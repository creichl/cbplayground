import { useTranslation } from 'react-i18next'
import type { ReservationStatus } from '../../api/reservations.ts'
import { cn } from '../../lib/utils.ts'
import { Badge } from '../../ui/badge.tsx'
import { statusColors, statusLabels } from './status.ts'

/** The status of a reservation as a badge in its colour (status.ts), with a dot so it is not told by the text colour alone. */
export function StatusBadge({ status, className }: { status: ReservationStatus; className?: string }) {
  const { t } = useTranslation()
  const { color, surface, text } = statusColors[status]
  return (
    <Badge variant="outline" className={cn('border-transparent font-semibold', className)} style={{ backgroundColor: surface, color: text }}>
      <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {t(statusLabels[status])}
    </Badge>
  )
}
