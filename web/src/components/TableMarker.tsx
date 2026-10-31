import { type ElementProps, Paper, type PaperProps } from '@mantine/core'
import type { CSSProperties, Ref } from 'react'

type TableMarkerProps = Omit<PaperProps, 'style'> &
  ElementProps<'div'> & {
    /** Position of the marker's centre, relative to the floor plan image, 0–1. */
    posX: number
    posY: number
    style?: CSSProperties
    ref?: Ref<HTMLDivElement>
  }

/**
 * A table on a floor plan: a small labelled card centred on the table's position. Used by the floor plan editor
 * and by the table overview; the parent is the floor plan's positioned container.
 */
export function TableMarker({ posX, posY, style, ...others }: TableMarkerProps) {
  return (
    <Paper
      radius="sm"
      px={8}
      py={2}
      withBorder
      {...others}
      style={{
        position: 'absolute',
        left: `${posX * 100}%`,
        top: `${posY * 100}%`,
        transform: 'translate(-50%, -50%)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    />
  )
}
