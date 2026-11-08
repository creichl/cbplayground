import { type ComponentType, type PointerEvent, type ReactNode, type Ref, useEffect, useRef, useState } from 'react'
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
  /** The real width of the plan in metres: the plan shows a scale bar. Null or missing: none. */
  widthMeters?: number | null
  /**
   * The plan fills its parent, a flex column of a given height: as large as fits in its width and the height left, at least
   * 18rem high. Without, it fits the width.
   */
  fill?: boolean
  /**
   * The guest's plan: it also zooms with the wheel while Ctrl is held and with a pinch on the trackpad, both around the
   * pointer, with a double tap or double click around that point (at the largest zoom back to the whole plan), and a pan
   * with the finger glides on after it is let go. Off by default (the area editor and the service screen).
   */
  fluid?: boolean
  /**
   * A point of the plan (0–1 of its width and height, as a table's position) to bring into view: while zoomed in, the plan
   * glides to centre it, at the zoom it has; unzoomed, the whole plan is in view anyway. A new object each time.
   */
  focus?: { x: number; y: number } | null
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

/** How long the zoom buttons, a double tap and bringing a point into view glide, in milliseconds. */
const glideDuration = 250
/** Two taps at most this far apart in time (ms) and space (px) are a double tap. */
const doubleTapTime = 300
const doubleTapDistance = 30
/** A pan let go faster than this (px per ms) glides on; it slows down by this factor every 16 ms until it rests. */
const momentumMinSpeed = 0.25
const momentumFriction = 0.94

const initialView: View = { scale: 1, x: 0, y: 0 }

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * The area's plan with its tables: the floor plan image, or without one the drawn room in the ratio 3:2 (as in the API's
 * arrangement, see Room) below the tables. It fits the width and keeps its aspect ratio. It zooms and pans with pinch and
 * drag (pointer events) and with the buttons + / − / reset below it or in its corner, which the caller draws (`zoomButton`);
 * the buttons glide to the new zoom (250 ms, eased out; at once with less motion). The guest's plan (`fluid`) zooms with the
 * wheel and a double tap too, and glides on after a pan; `focus` brings a point into view. Tables that stick out over the
 * plan's edge, and the room's boundary, get room around it.
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
  widthMeters = null,
  fill = false,
  fluid = false,
  focus = null,
  children,
}: FloorPlanProps) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState(initialView)
  // The view as last set, for the gestures and the glides between two renders, and where a running glide is heading.
  const viewRef = useRef(initialView)
  const goal = useRef<View | null>(null)
  const frame = useRef<number | null>(null)
  const plan = useRef<HTMLDivElement>(null)
  // Height : width of the image, known once it is loaded.
  const [imageHeight, setImageHeight] = useState<number | null>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  // The speed of the last pan (px per ms) and when it was measured, for the glide after it; the last tap, for a double tap;
  // whether more than one pointer took part since the first went down (a pinch is no tap).
  const velocity = useRef<{ x: number; y: number; time: number } | null>(null)
  const lastTap = useRef<{ point: Point; time: number } | null>(null)
  const multiTouch = useRef(false)
  // A click right after moving the plan is not a click on a table or on the plan.
  const suppressClick = useRef(false)

  const planHeight = imageUrl === null ? 1 / aspectRatio : imageHeight
  const margin = overhang(tables, tableScale, planHeight, imageUrl === null ? roomBoundary + 0.003 : 0.005)
  // Padding in percent refers to the width around the plan: margin × plan width = padding × (plan width + 2 × padding).
  const padding = margin / (1 + 2 * margin)
  // Height : width of the viewport with the padding around the plan; until the image is loaded, as for the 3:2 room.
  const viewportHeight = (1 - 2 * padding) * (planHeight ?? 1 / aspectRatio) + 2 * padding
  // With `fill`: the room the plan has, measured. Not with container query units: Chromium resolves them to 0 while the
  // room is held at its minimum height (e.g. with the list of tables open below the plan), and the plan disappears.
  const roomRef = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const element = roomRef.current
    if (!fill || element === null) {
      return
    }
    const observer = new ResizeObserver(() => setRoom({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [fill])

  function show(next: View) {
    viewRef.current = next
    setView(next)
  }

  /** Stops a running glide where it is. */
  function stop() {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    goal.current = null
  }

  /** Less motion asked for (the device's setting, or data-reduce-motion as in the styleguide): no glide. */
  function reduceMotion() {
    return (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || viewportRef.current?.closest('[data-reduce-motion]') != null
    )
  }

  /**
   * Glides to the view, eased out; only the plan's transform changes, frame by frame. Scale and offset change in step, so
   * the point zoomed around stays where it is.
   */
  function glideTo(target: View) {
    stop()
    if (reduceMotion()) {
      show(target)
      return
    }
    const from = viewRef.current
    const start = performance.now()
    goal.current = target
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / glideDuration)
      const eased = 1 - (1 - progress) ** 3
      show({
        scale: from.scale + (target.scale - from.scale) * eased,
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
      })
      if (progress < 1) {
        frame.current = requestAnimationFrame(step)
      } else {
        frame.current = null
        goal.current = null
      }
    }
    frame.current = requestAnimationFrame(step)
  }

  /** After a pan with the finger: the plan glides on at the speed it was let go, slowing down, within its bounds. */
  function glideOn(speed: { x: number; y: number }) {
    stop()
    let last = performance.now()
    let { x, y } = speed
    const step = (now: number) => {
      const elapsed = Math.min(64, now - last)
      last = now
      const current = viewRef.current
      const next = clamp({ ...current, x: current.x + x * elapsed, y: current.y + y * elapsed })
      show(next)
      const decay = momentumFriction ** (elapsed / 16)
      // Against an edge the plan stops in that direction.
      x = next.x === current.x ? 0 : x * decay
      y = next.y === current.y ? 0 : y * decay
      frame.current = Math.hypot(x, y) > 0.02 ? requestAnimationFrame(step) : null
    }
    frame.current = requestAnimationFrame(step)
  }

  /** The view zoomed to `scale` around a point of the viewport, which stays where it is. */
  function around(base: View, center: Point, scale: number): View {
    return {
      scale,
      x: center.x - ((center.x - base.x) / base.scale) * scale,
      y: center.y - ((center.y - base.y) / base.scale) * scale,
    }
  }

  // Stops a glide when the plan goes away.
  useEffect(() => stop, [])

  // Ctrl + wheel and the trackpad's pinch (a wheel event with ctrlKey) zoom around the pointer instead of the page. Not with
  // React's onWheel, which cannot keep the page from zooming.
  useEffect(() => {
    const element = viewportRef.current
    if (!fluid || element === null) {
      return
    }
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return
      }
      event.preventDefault()
      stop()
      const rect = element.getBoundingClientRect()
      // Lines (Firefox) count as 16 pixels.
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1)
      const current = viewRef.current
      const scale = Math.min(maxScale, Math.max(1, current.scale * Math.exp(-delta * 0.01)))
      show(clamp(around(current, { x: event.clientX - rect.left, y: event.clientY - rect.top }, scale)))
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [fluid])

  // A point to bring into view: centred at the current zoom, which it never raises.
  useEffect(() => {
    const viewport = viewportRef.current
    const element = plan.current
    if (focus === null || viewport === null || element === null) {
      return
    }
    const current = goal.current ?? viewRef.current
    if (current.scale === 1) {
      return
    }
    // The point in the unzoomed viewport (offsets ignore the transform); the plan's offset parent is the viewport.
    const x = element.offsetLeft + focus.x * element.offsetWidth
    const y = element.offsetTop + focus.y * element.offsetHeight
    glideTo(
      clamp({
        scale: current.scale,
        x: viewport.clientWidth / 2 - x * current.scale,
        y: viewport.clientHeight / 2 - y * current.scale,
      }),
    )
  }, [focus])

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
    // A finger on the plan catches it where it is.
    stop()
    pointers.current.set(event.pointerId, point(event))
    multiTouch.current = pointers.current.size > 1
    velocity.current = null
    restart(viewRef.current)
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
      const next = clamp({ ...current.view, x: current.view.x + dx, y: current.view.y + dy })
      const previous = viewRef.current
      const time = event.timeStamp
      const last = velocity.current
      if (last !== null && time > last.time) {
        // Smoothed over the last moves, so a single jerk at the end does not throw the plan.
        const elapsed = time - last.time
        velocity.current = {
          x: 0.8 * ((next.x - previous.x) / elapsed) + 0.2 * last.x,
          y: 0.8 * ((next.y - previous.y) / elapsed) + 0.2 * last.y,
          time,
        }
      } else {
        velocity.current = { x: 0, y: 0, time }
      }
      show(next)
    } else {
      const [startA, startB] = current.points
      const [a, b] = points
      const scale = Math.min(maxScale, Math.max(1, (current.view.scale * distance(a, b)) / Math.max(1, distance(startA, startB))))
      // The point of the plan under the fingers at the start stays under them.
      const start = middle(startA, startB)
      const now = middle(a, b)
      const planX = (start.x - current.view.x) / current.view.scale
      const planY = (start.y - current.view.y) / current.view.scale
      velocity.current = null
      show(clamp({ scale, x: now.x - planX * scale, y: now.y - planY * scale }))
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
    const ended = gesture.current
    if (!pointers.current.delete(event.pointerId)) {
      return
    }
    restart(viewRef.current)
    if (!fluid || pointers.current.size > 0 || ended === null || event.type === 'pointercancel') {
      return
    }
    if (ended.moved) {
      lastTap.current = null
      const speed = velocity.current
      // Only a pan with the finger glides on, and only when it was still moving as it was let go.
      if (event.pointerType === 'touch' && !multiTouch.current && speed !== null && event.timeStamp - speed.time < 50 &&
        Math.hypot(speed.x, speed.y) > momentumMinSpeed && !reduceMotion()) {
        glideOn(speed)
      }
      return
    }
    if (multiTouch.current) {
      return
    }
    const tap = { point: point(event), time: event.timeStamp }
    const previous = lastTap.current
    if (previous !== null && tap.time - previous.time < doubleTapTime && distance(tap.point, previous.point) < doubleTapDistance) {
      lastTap.current = null
      const current = viewRef.current
      glideTo(current.scale >= maxScale - 0.01 ? initialView : clamp(around(current, tap.point, Math.min(maxScale, current.scale * 2))))
    } else {
      lastTap.current = tap
    }
  }

  function zoomBy(factor: number) {
    const viewport = viewportRef.current
    if (viewport === null) {
      return
    }
    // Zooms around the middle of the viewport, from where a running glide is heading.
    const base = goal.current ?? viewRef.current
    const scale = Math.min(maxScale, Math.max(1, base.scale * factor))
    glideTo(clamp(around(base, { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }, scale)))
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
        onClick={() => glideTo(initialView)}
      />
    </>
  )

  const viewport = (
    <div
      ref={viewportRef}
      // Unzoomed, a vertical swipe still scrolls the page; zoomed, every move pans the plan. A sheet (vaul) around the plan
      // is not dragged by it (data-vaul-no-drag).
      // Clipped, not hidden: a focused table never scrolls the viewport, which would shift the plan against its transform.
      className={`relative overflow-clip rounded-sm select-none ${view.scale === 1 ? 'touch-pan-y' : 'touch-none'}`}
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
          ref={(element) => {
            plan.current = element
            if (typeof planRef === 'function') {
              planRef(element)
            } else if (planRef) {
              planRef.current = element
            }
          }}
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
          {widthMeters !== null && <ScaleBar widthMeters={widthMeters} dark={dark} />}
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
  )

  return (
    <div className={fill ? 'flex min-h-0 flex-1 flex-col gap-2.5' : 'flex flex-col gap-2.5'}>
      {fill ? (
        // The viewport as wide as the width and the height left allow, centred.
        // Its size does not depend on the plan inside (contain: size), so the plan can follow it.
        <div ref={roomRef} className="relative min-h-72 flex-1 [contain:size]">
          <div className="mx-auto" style={{ width: room === null ? '100%' : Math.min(room.width, room.height / viewportHeight) }}>
            {viewport}
          </div>
        </div>
      ) : (
        viewport
      )}
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

/**
 * The scale bar in the lower left corner of a plan whose real width is known: a bar of 1, 2, 5, 10 or 20 metres, about a
 * sixth of the plan wide at most, with its length. It is part of the plan, so it zooms with it.
 */
function ScaleBar({ widthMeters, dark }: { widthMeters: number; dark: boolean }) {
  const { i18n } = useTranslation()
  const length = [1, 2, 5, 10, 20].filter((meters) => meters <= widthMeters / 6).at(-1) ?? 1
  const label = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'unit', unit: 'meter', unitDisplay: 'short' }).format(length)
  const color = dark ? '#f4efe7' : '#292524'
  return (
    <div data-scale-bar="" style={{ position: 'absolute', left: 0, right: 0, bottom: '2.5%', pointerEvents: 'none' }}>
      <div
        style={{
          marginLeft: '2.5%',
          width: `calc(${(length / widthMeters) * 100}% + 12px)`,
          padding: '2px 6px 4px',
          borderRadius: 4,
          backgroundColor: dark ? 'rgba(28, 25, 23, 0.82)' : 'rgba(255, 255, 255, 0.85)',
          color,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {label}
        <div style={{ height: 5, border: `2px solid ${color}`, borderTop: 'none' }} />
      </div>
    </div>
  )
}
