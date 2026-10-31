import { Box, Text } from '@mantine/core'
import { type PointerEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Table } from '../api/areas.ts'
import { TableMarker } from './TableMarker.tsx'

type FloorPlanCanvasProps = {
  imageUrl: string
  /** The tables of the area, with their current (possibly not yet saved) positions. */
  tables: Table[]
  selectedTableId: string | null
  onSelect: (tableId: string | null) => void
  /** Called once when a table is dropped at a new position (0–1, relative to the image). */
  onMove: (tableId: string, posX: number, posY: number) => void
}

type Drag = {
  tableId: string
  pointerId: number
  startClientX: number
  startClientY: number
  startPosX: number
  startPosY: number
  posX: number
  posY: number
  moved: boolean
}

/** Below this distance in pixels, a press on a table counts as a click, not as a drag. */
const dragThreshold = 4

const clamp = (value: number) => Math.min(1, Math.max(0, value))

/**
 * The floor plan with the tables as labelled markers ("12 · 4"). Tables are moved with pointer events,
 * so mouse, pen and touch work alike. Positions are fractions of the image size, so they fit at every window size.
 */
export function FloorPlanCanvas({ imageUrl, tables, selectedTableId, onSelect, onMove }: FloorPlanCanvasProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  function handlePointerDown(event: PointerEvent<HTMLDivElement>, table: Table) {
    if (event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      tableId: table.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosX: table.posX,
      startPosY: table.posY,
      posX: table.posX,
      posY: table.posY,
      moved: false,
    })
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const container = containerRef.current
    if (drag === null || event.pointerId !== drag.pointerId || container === null) {
      return
    }
    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY
    if (!drag.moved && Math.hypot(dx, dy) < dragThreshold) {
      return
    }
    const rect = container.getBoundingClientRect()
    setDrag({
      ...drag,
      posX: clamp(drag.startPosX + dx / rect.width),
      posY: clamp(drag.startPosY + dy / rect.height),
      moved: true,
    })
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return
    }
    if (drag.moved) {
      onMove(drag.tableId, drag.posX, drag.posY)
    }
    onSelect(drag.tableId)
    setDrag(null)
  }

  return (
    <Box
      ref={containerRef}
      pos="relative"
      style={{ userSelect: 'none', borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden' }}
      onClick={(event) => {
        // A click on the plan itself, not on a table, closes the table's properties.
        if (event.target === event.currentTarget || event.target instanceof HTMLImageElement) {
          onSelect(null)
        }
      }}
    >
      <img src={imageUrl} alt={t('areas.floorPlanAlt')} draggable={false} style={{ display: 'block', width: '100%' }} />
      {tables.map((table) => {
        const isDragged = drag?.tableId === table.id
        const posX = isDragged ? drag.posX : table.posX
        const posY = isDragged ? drag.posY : table.posY
        const selected = table.id === selectedTableId
        return (
          <TableMarker
            key={table.id}
            posX={posX}
            posY={posY}
            role="button"
            tabIndex={0}
            aria-label={t('areas.tableMarker', { number: table.number, seats: table.seats })}
            aria-pressed={selected}
            shadow={isDragged ? 'md' : 'xs'}
            bg={selected ? 'brand.8' : 'white'}
            c={selected ? 'white' : 'dark'}
            style={{
              cursor: isDragged ? 'grabbing' : 'grab',
              // Lets touch moves drag the table instead of scrolling the page.
              touchAction: 'none',
              zIndex: isDragged || selected ? 2 : 1,
              borderColor: 'var(--mantine-color-brand-8)',
            }}
            onPointerDown={(event) => handlePointerDown(event, table)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(table.id)
              }
            }}
          >
            <Text size="sm" fw={600} inherit>
              {table.number} · {table.seats}
            </Text>
          </TableMarker>
        )
      })}
    </Box>
  )
}
