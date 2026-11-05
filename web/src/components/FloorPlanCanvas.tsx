import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomElement, RoomStyle, Table } from '../api/areas.ts'
import { FloorPlan } from './floor-plan/FloorPlan.tsx'
import { FloorPlanZoomButton } from './FloorPlanZoomButton.tsx'
import { clampToRoom } from './floor-plan/layout.ts'
import { TableShape } from './floor-plan/TableShape.tsx'

type FloorPlanCanvasProps = {
  /** The floor plan image; without one the tables lie in the drawn room. */
  imageUrl: string | null
  /** The area's table scale in percent. */
  tableScale: number
  /** The real width of the plan in metres, for its scale bar; null when unknown. */
  widthMeters: number | null
  /** The tables of the area, with their current (possibly not yet saved) positions. */
  tables: Table[]
  selectedTableId: string | null
  onSelect: (tableId: string | null) => void
  /** Called once when a table is dropped at a new position (0–1, relative to the plan). */
  onMove: (tableId: string, posX: number, posY: number) => void
  /** The room as edited (possibly not yet saved); its elements can be selected and moved only without image. */
  roomStyle: RoomStyle
  roomElements: RoomElement[]
  selectedElementId: string | null
  onSelectElement: (elementId: string) => void
  /** Called when an element is dropped at a new position, or moved with the arrow keys. */
  onMoveElement: (elementId: string, posX: number, posY: number) => void
}

type Drag = {
  target: 'table' | 'element'
  id: string
  pointerId: number
  startClientX: number
  startClientY: number
  startPosX: number
  startPosY: number
  posX: number
  posY: number
  /** The extent of a room element, which stays within the room; 0 for a table, whose centre stays on the plan. */
  width: number
  height: number
  moved: boolean
}

/** Below this distance in pixels, a press on a table counts as a click, not as a drag. */
const dragThreshold = 4

/** An arrow key moves a room element by this share of the plan. */
const keyStep = 0.01

/** The smallest area in pixels that reacts to a tap, also on a small element. */
const minHitSize = 40

const arrowSteps: Record<string, [number, number]> = {
  ArrowLeft: [-keyStep, 0],
  ArrowRight: [keyStep, 0],
  ArrowUp: [0, -keyStep],
  ArrowDown: [0, keyStep],
}

/**
 * The area's plan (image or drawn room) with the tables drawn in their shapes and, without image, the room elements below
 * them. Tables and elements are moved with pointer events, so mouse, pen and touch work alike; elements also with the
 * arrow keys. Tables lie on top, so a click on both selects the table. Positions are fractions of the plan's size, so they
 * fit at every window size and zoom.
 */
export function FloorPlanCanvas({
  imageUrl,
  tableScale,
  widthMeters,
  tables,
  selectedTableId,
  onSelect,
  onMove,
  roomStyle,
  roomElements,
  selectedElementId,
  onSelectElement,
  onMoveElement,
}: FloorPlanCanvasProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  function startDrag(event: PointerEvent<HTMLDivElement>, target: Drag['target'], id: string, posX: number, posY: number, size = { width: 0, height: 0 }) {
    if (event.button !== 0) {
      return
    }
    // The table or element moves, not the plan.
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      target,
      id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosX: posX,
      startPosY: posY,
      posX,
      posY,
      width: size.width,
      height: size.height,
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
      posX: clampToRoom(drag.startPosX + dx / rect.width, drag.width),
      posY: clampToRoom(drag.startPosY + dy / rect.height, drag.height),
      moved: true,
    })
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return
    }
    if (drag.target === 'table') {
      if (drag.moved) {
        onMove(drag.id, drag.posX, drag.posY)
      }
      onSelect(drag.id)
    } else {
      if (drag.moved) {
        onMoveElement(drag.id, drag.posX, drag.posY)
      }
      onSelectElement(drag.id)
    }
    setDrag(null)
  }

  function handleElementKeyDown(event: KeyboardEvent<HTMLDivElement>, element: RoomElement) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelectElement(element.id)
      return
    }
    const step = arrowSteps[event.key]
    if (step !== undefined) {
      event.preventDefault()
      onSelectElement(element.id)
      onMoveElement(
        element.id,
        clampToRoom(element.posX + step[0], element.width),
        clampToRoom(element.posY + step[1], element.height),
      )
    }
  }

  const draggedElement = (element: RoomElement) =>
    drag?.target === 'element' && drag.id === element.id ? { ...element, posX: drag.posX, posY: drag.posY } : element
  const elements = roomElements.map(draggedElement)

  return (
    <FloorPlan
      imageUrl={imageUrl}
      imageAlt={t('areas.floorPlanAlt')}
      roomStyle={roomStyle}
      roomElements={elements}
      tables={tables}
      tableScale={tableScale}
      widthMeters={widthMeters}
      planRef={containerRef}
      onPlanClick={() => onSelect(null)}
      zoomButton={FloorPlanZoomButton}
    >
      {imageUrl === null &&
        elements.map((element) => {
          const selected = element.id === selectedElementId
          const isDragged = drag?.target === 'element' && drag.id === element.id
          return (
            <div
              key={element.id}
              data-room-element=""
              role="button"
              tabIndex={0}
              aria-label={
                element.label === null
                  ? t(`areas.room.kinds.${element.kind}`)
                  : t('areas.room.elementMarker', { kind: t(`areas.room.kinds.${element.kind}`), label: element.label })
              }
              aria-pressed={selected}
              style={{
                position: 'absolute',
                left: `${(element.posX - element.width / 2) * 100}%`,
                top: `${(element.posY - element.height / 2) * 100}%`,
                width: `${element.width * 100}%`,
                height: `${element.height * 100}%`,
                cursor: isDragged ? 'grabbing' : 'grab',
                // Lets touch moves drag the element instead of scrolling the page or moving the plan.
                touchAction: 'none',
                outline: selected ? '2px dashed var(--mantine-color-brand-7)' : undefined,
                outlineOffset: 2,
                borderRadius: 2,
                zIndex: 0,
              }}
              onPointerDown={(event) =>
                startDrag(event, 'element', element.id, element.posX, element.posY, { width: element.width, height: element.height })
              }
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(event) => handleElementKeyDown(event, element)}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `max(100%, ${minHitSize}px)`,
                  height: `max(100%, ${minHitSize}px)`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
          )
        })}
      {tables.map((table) => {
        const isDragged = drag?.target === 'table' && drag.id === table.id
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
            onPointerDown={(event) => startDrag(event, 'table', table.id, table.posX, table.posY)}
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
