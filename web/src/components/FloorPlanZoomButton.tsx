import { ActionIcon } from '@mantine/core'
import type { ZoomButtonProps } from './floor-plan/FloorPlan.tsx'

/** A zoom button of the floor plan in the admin area and the table overview (Mantine). */
export function FloorPlanZoomButton({ label, icon, disabled, onClick, placement }: ZoomButtonProps) {
  return (
    <ActionIcon variant="default" size={placement === 'inside' ? 44 : 'lg'} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
    </ActionIcon>
  )
}
