import { type PointerEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Table } from '../api/areas.ts'
import { FloorPlan } from './floor-plan/FloorPlan.tsx'
import { TableShape } from './floor-plan/TableShape.tsx'

type FloorPlanCanvasProps = {
  /** The floor plan image; without one the tables lie on the schematic plan. */
  imageUrl: string | null
  /** The area's table scale, 50–200 %. */
  tableScale: number
  /** The tables of the area, with their current (possibly not yet saved) positions. */
  tables: Table[]
  selectedTableId: string | null
  onSelect: (tableId: string | null) => void
  /** Called once when a table is dropped at a new position (0–1, relative to the plan). */
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
 * The area's plan (image or schematic plan) with the tables drawn in their shapes. Tables are moved with pointer events,
 * so mouse, pen and touch work alike. Positions are fractions of the plan's size, so they fit at every window size and zoom.
 */
export function FloorPlanCanvas({ imageUrl, tableScale, tables, selectedTableId, onSelect, onMove }: FloorPlanCanvasProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  function handlePointerDown(event: PointerEvent<HTMLDivElement>, table: Table) {
    if (event.button !== 0) {
      return
    }
    // The table moves, not the plan.
    event.stopPropagation()
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
    <FloorPlan
      imageUrl={imageUrl}
      imageAlt={t('areas.floorPlanAlt')}
      tables={tables}
      tableScale={tableScale}
      planRef={containerRef}
      onPlanClick={() => onSelect(null)}
    >
      {tables.map((table) => {
        const isDragged = drag?.tableId === table.id
        const posX = isDragged ? drag.posX : table.posX
        const posY = isDragged ? drag.posY : table.posY
        const selected = table.id === selectedTableId
        return (
          <TableShape
            key={table.id}
            number={table.number}
            seats={table.seats}
            shape={table.shape}
            rotation={table.rotation}
            posX={posX}
            posY={posY}
            tableScale={tableScale}
            fill={selected ? 'var(--mantine-color-brand-8)' : 'white'}
            stroke={selected ? 'var(--mantine-color-brand-9)' : 'var(--mantine-color-brand-8)'}
            color={selected ? 'white' : 'var(--mantine-color-dark-7)'}
            strokeWidth={2}
            role="button"
            tabIndex={0}
            aria-label={t('areas.tableMarker', { number: table.number, seats: table.seats })}
            aria-pressed={selected}
            style={{
              cursor: isDragged ? 'grabbing' : 'grab',
              // Lets touch moves drag the table instead of scrolling the page or moving the plan.
              touchAction: 'none',
              zIndex: isDragged || selected ? 2 : 1,
              filter: isDragged ? 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.25))' : undefined,
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
          />
        )
      })}
    </FloorPlan>
  )
}
