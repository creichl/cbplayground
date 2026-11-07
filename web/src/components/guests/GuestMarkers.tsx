import { BriefcaseIcon, CakeIcon, CrownIcon, GiftIcon, HeartIcon, type LucideIcon, PartyPopperIcon, SparklesIcon, TriangleAlertIcon, WineIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Occasion, Reservation } from '../../api/reservations.ts'
import { cn } from '../../lib/utils.ts'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip.tsx'
import { isFirstVisit } from './firstVisit.ts'
import { occasionLabels } from './labels.ts'

const occasionIcons: Record<Exclude<Occasion, 'None'>, LucideIcon> = {
  Birthday: CakeIcon,
  Anniversary: HeartIcon,
  Business: BriefcaseIcon,
  Date: WineIcon,
  Celebration: PartyPopperIcon,
  Other: GiftIcon,
}

type GuestMarkersProps = {
  reservation: Pick<Reservation, 'guest' | 'status' | 'occasion'>
  /** Whether a first visit is marked; the guest directory, which lists guests rather than reservations, leaves it out. */
  withFirstVisit?: boolean
  className?: string
}

/**
 * What the front desk should know about the guest at a glance, as small icons with their name as a tooltip: VIP, allergies, the
 * occasion and a first visit. Nothing for a reservation without these.
 */
export function GuestMarkers({ reservation, withFirstVisit = true, className }: GuestMarkersProps) {
  const { t } = useTranslation()
  const markers: { key: string; icon: LucideIcon; label: string; tone: string }[] = []
  if (reservation.guest?.tags.includes('Vip')) {
    markers.push({ key: 'vip', icon: CrownIcon, label: t('guests.markers.vip'), tone: 'text-warning' })
  }
  if (reservation.guest?.hasAllergies) {
    markers.push({ key: 'allergies', icon: TriangleAlertIcon, label: t('guests.markers.allergies'), tone: 'text-destructive' })
  }
  if (reservation.occasion !== 'None') {
    markers.push({ key: 'occasion', icon: occasionIcons[reservation.occasion], label: t(occasionLabels[reservation.occasion]), tone: 'text-primary-text' })
  }
  if (withFirstVisit && isFirstVisit(reservation)) {
    markers.push({ key: 'first-visit', icon: SparklesIcon, label: t('guests.markers.firstVisit'), tone: 'text-muted-foreground' })
  }
  if (markers.length === 0) {
    return null
  }

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)}>
      {markers.map(({ key, icon: Icon, label, tone }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <span role="img" aria-label={label} data-guest-marker={key} className={cn('inline-flex', tone)}>
              <Icon aria-hidden="true" className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  )
}
