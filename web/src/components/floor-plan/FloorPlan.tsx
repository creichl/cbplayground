import { type ComponentType, type PointerEvent, type ReactNode, type Ref, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomElement, RoomStyle, TableRotation, TableShape } from '../../api/areas.ts'
import { MinusIcon, PlusIcon, ZoomResetIcon } from '../icons.tsx'
import { aspectRatio, chairSpace, roomBoundary, tableSize } from './layout.ts'
import { Room } from './Room.tsx'

/**
 * What a zoom button of the plan gets. The caller draws it with the building blocks of its page: the admin area and the
 * table overview with Mantine, the guest pages with the design system (src/ui), so the plan itself depends on neither.
 */
export type ZoomButtonProps = {
  label: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
  /** Inside the plan the buttons are larger (44 px), below it compact. */
  placement: 'below' | 'inside'
}

type PlannedTable = { posX: number; posY: number; seats: number; shape: TableShape; rotation: TableRotation }

type FloorPlanProps = {
  /** The uploaded floor plan image; without one the plan is the drawn room in the ratio 3:2. */
  imageUrl: string | null
  /** Floor and boundary of the drawn room, and its elements; ignored on an image, which shows the room itself. */
  roomStyle: RoomStyle
  roomElements: Pick<RoomElement, 'id' | 'kind' | 'posX' | 'posY' | 'width' | 'height' | 'rotation' | 'label'>[]
  /** Text alternative of the image; empty when the plan only repeats an accessible list. */
  imageAlt: string
  /** The tables drawn on the plan (as children), so tables that stick out over its edge are not cut off. */
  tables: PlannedTable[]
  tableScale: number
  /** Hides the plan from assistive technology when an accessible list next to it offers the same. */
  ariaHidden?: boolean
  /** Called on a click on the plan itself, not on a table or on a room element of the editor. */
  onPlanClick?: () => void
  /** The plan's element, to which the positions of the tables are relative. */
  planRef?: Ref<HTMLDivElement>
  /** Where the zoom buttons are: below the plan (default) or inside it, in its lower right corner. */
  zoomControls?: 'below' | 'inside'
  /** The zoom buttons + / − / reset, drawn by the caller (see ZoomButtonProps). */
  zoomButton: ComponentType<ZoomButtonProps>
  /** A dark page (the restaurant's dark mode): the drawn room is dark too. */
  dark?: boolean
  /** The tables, as TableShape, and in the editor the room elements' handles. */
  children: ReactNode
}

type View = { scale: number; x: number; y: number }

type Point = { x: number; y: number }

/** A gesture starts with the pointers down and the view at that moment. */
type Gesture = { view: View; points: Point[]; moved: boolean }

const maxScale = 4
const zoomStep = 1.5

/** Below this distance in pixels, a press counts as a tap, not as a move. */
const moveThreshold = 4

const initialView: View = { scale: 1, x: 0, y: 0 }

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * The area's plan with its tables: the floor plan image, or without one the drawn room in the ratio 3:2 (as in the API's
 * arrangement, see Room) below the tables. It fits the width and keeps its aspect ratio. It zooms and pans with pinch and
 * drag (pointer events) and with the buttons + / − / reset below it or in its corner, which the caller draws (`zoomButton`). Tables that stick out over the plan's
 * edge, and the room's boundary, get room around it.
 */
export function FloorPlan({
  imageUrl,
  imageAlt,
  roomStyle,
  roomElements,
  tables,
  tableScale,
  ariaHidden,
  onPlanClick,
  planRef,
  zoomControls = 'below',
  zoomButton: ZoomButton,
  dark = false,
  children,
}: FloorPlanProps) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState(initialView)
  // Height : width of the image, known once it is loaded.
  const [imageHeight, setImageHeight] = useState<number | null>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  // A click right after moving the plan is not a click on a table or on the plan.
  const suppressClick = useRef(false)

  const planHeight = imageUrl === null ? 1 / aspectRatio : imageHeight
  const margin = overhang(tables, tableScale, planHeight, imageUrl === null ? roomBoundary + 0.003 : 0.005)
  // Padding in percent refers to the width around the plan: margin × plan width = padding × (plan width + 2 × padding).
  const padding = margin / (1 + 2 * margin)

  /** Keeps the zoomed plan covering the viewport. */
  function clamp(next: View): View {
    const viewport = viewportRef.current
    if (viewport === null) {
      return next
    }
    const scale = Math.min(maxScale, Math.max(1, next.scale))
    return {
      scale,
      x: Math.min(0, Math.max(viewport.clientWidth * (1 - scale), next.x)),
      y: Math.min(0, Math.max(viewport.clientHeight * (1 - scale), next.y)),
    }
  }

  function point(event: PointerEvent<HTMLDivElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /** Starts the gesture anew whenever a pointer is added or lifted, so the view does not jump. */
  function restart(current: View) {
    gesture.current = pointers.current.size === 0 ? null : { view: current, points: [...pointers.current.values()], moved: false }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    pointers.current.set(event.pointerId, point(event))
    restart(view)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (current === null || !pointers.current.has(event.pointerId)) {
      return
    }
    pointers.current.set(event.pointerId, point(event))
    const points = [...pointers.current.values()]
    if (points.length === 1) {
      const dx = points[0].x - current.points[0].x
      const dy = points[0].y - current.points[0].y
      if (!current.moved && (Math.hypot(dx, dy) < moveThreshold || current.view.scale === 1)) {
        return
      }
      setView(clamp({ ...current.view, x: current.view.x + dx, y: current.view.y + dy }))
    } else {
      const [startA, startB] = current.points
      const [a, b] = points
      const scale = Math.min(maxScale, Math.max(1, (current.view.scale * distance(a, b)) / Math.max(1, distance(startA, startB))))
      // The point of the plan under the fingers at the start stays under them.
      const start = middle(startA, startB)
      const now = middle(a, b)
      const planX = (start.x - current.view.x) / current.view.scale
      const planY = (start.y - current.view.y) / current.view.scale
      setView(clamp({ scale, x: now.x - planX * scale, y: now.y - planY * scale }))
    }
    if (!current.moved) {
      current.moved = true
      suppressClick.current = true
      for (const id of pointers.current.keys()) {
        event.currentTarget.setPointerCapture(id)
      }
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) {
      return
    }
    restart(view)
  }

  function zoomBy(factor: number) {
    const viewport = viewportRef.current
    if (viewport === null) {
      return
    }
    // Zooms around the middle of the viewport.
    const centerX = viewport.clientWidth / 2
    const centerY = viewport.clientHeight / 2
    const scale = Math.min(maxScale, Math.max(1, view.scale * factor))
    setView(
      clamp({
        scale,
        x: centerX - ((centerX - view.x) / view.scale) * scale,
        y: centerY - ((centerY - view.y) / view.scale) * scale,
      }),
    )
  }

  const controls = (
    <>
      <ZoomButton
        placement={zoomControls}
        label={t('floorPlan.zoomOut')}
        icon={<MinusIcon />}
        disabled={view.scale <= 1}
        onClick={() => zoomBy(1 / zoomStep)}
      />
      <ZoomButton
        placement={zoomControls}
        label={t('floorPlan.zoomIn')}
        icon={<PlusIcon />}
        disabled={view.scale >= maxScale}
        onClick={() => zoomBy(zoomStep)}
      />
      <ZoomButton
        placement={zoomControls}
        label={t('floorPlan.zoomReset')}
        icon={<ZoomResetIcon />}
        disabled={view.scale === 1}
        onClick={() => setView(initialView)}
      />
    </>
  )

  return (
    <div className="flex flex-col gap-2.5">
      <div
        ref={viewportRef}
        // Unzoomed, a vertical swipe still scrolls the page; zoomed, every move pans the plan. A sheet (vaul) around the plan
        // is not dragged by it (data-vaul-no-drag).
        className={`relative overflow-hidden rounded-sm select-none ${view.scale === 1 ? 'touch-pan-y' : 'touch-none'}`}
        data-vaul-no-drag=""
        onPointerDownCapture={() => {
          if (pointers.current.size === 0) {
            suppressClick.current = false
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            suppressClick.current = false
            event.stopPropagation()
          }
        }}
        onClick={(event) => {
          if (
            onPlanClick !== undefined &&
            !(event.target instanceof Element && event.target.closest('[data-floor-table], [data-room-element]'))
          ) {
            onPlanClick()
          }
        }}
      >
        <div
          aria-hidden={ariaHidden || undefined}
          style={{
            padding: `${padding * 100}%`,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <div
            ref={planRef}
            style={imageUrl === null ? { position: 'relative', aspectRatio: `${aspectRatio}` } : { position: 'relative' }}
          >
            {imageUrl === null && <Room roomStyle={roomStyle} elements={roomElements} dark={dark} />}
            {imageUrl !== null && (
              <img
                src={imageUrl}
                alt={imageAlt}
                draggable={false}
                style={{ display: 'block', width: '100%' }}
                onLoad={(event) => setImageHeight(event.currentTarget.naturalHeight / event.currentTarget.naturalWidth)}
              />
            )}
            {children}
          </div>
        </div>
        {zoomControls === 'inside' && (
          // Not part of the plan's gestures: a press on a button neither pans the plan nor counts as a click on it.
          <div
            className="absolute right-2 bottom-2 flex flex-nowrap items-center gap-1"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {controls}
          </div>
        )}
      </div>
      {zoomControls === 'below' && <div className="flex flex-wrap items-center justify-end gap-1.5">{controls}</div>}
    </div>
  )
}

/**
 * How far the tables with their chairs stick out over the plan's edge, in plan widths, at least `minimum` (room for the
 * outline or the room's boundary). `planHeight` is the plan's height in plan widths; while it is unknown, only the sides count.
 */
function overhang(tables: PlannedTable[], tableScale: number, planHeight: number | null, minimum: number) {
  const chairs = (chairSpace * tableScale) / 100
  let margin = minimum
  for (const table of tables) {
    const { width, height } = tableSize(table.shape, table.seats, table.rotation, tableScale)
    const halfWidth = width / 2 + chairs
    const halfHeight = height / 2 + chairs
    margin = Math.max(margin, halfWidth - table.posX, table.posX + halfWidth - 1)
    if (planHeight !== null) {
      margin = Math.max(margin, halfHeight - table.posY * planHeight, table.posY * planHeight + halfHeight - planHeight)
    }
  }
  return margin
}
