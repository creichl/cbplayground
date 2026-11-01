import { useTranslation } from 'react-i18next'
import type { RoomElement, RoomElementKind, RoomRotation } from '../../api/areas.ts'
import { roomBoundary, roomColors, roomElementDimensions, roomElementDimensionsOf, type RoomColors } from './layout.ts'

/** Plan width in the units of the room's drawing; the plan is 300 × 200 units (3:2). */
export const planUnits = 300

/** Thickness of the boundary in drawing units. */
const boundary = roomBoundary * planUnits

type RoomElementShapeProps = {
  element: Pick<RoomElement, 'kind' | 'posX' | 'posY' | 'width' | 'height' | 'rotation' | 'label'>
  colors: RoomColors
  /** The floor's colour: the door's opening in the wall and the halo around texts. */
  floor: string
}

/**
 * A room element in the drawing of the room (an SVG of 300 × 200 units), in plan view. It is drawn with its length along
 * the wall and its depth into the room, its back to the wall and its front facing up, then turned by its rotation
 * (0: at the bottom wall, 90: left, 180: top, 270: right). An element with a label shows it, kept readable.
 */
export function RoomElementShape({ element, colors, floor }: RoomElementShapeProps) {
  const { t } = useTranslation()
  const { length, depth } = roomElementDimensionsOf(element)
  const x = element.posX * planUnits
  const y = (element.posY * planUnits * 2) / 3
  const label = element.label ?? (element.kind === 'Service' ? t('floorPlan.service') : null)
  return (
    <g transform={`translate(${x} ${y}) rotate(${element.rotation})`}>
      <ElementDrawing kind={element.kind} length={length * planUnits} depth={depth * planUnits} colors={colors} floor={floor} />
      {label !== null && (
        <ElementLabel text={label} kind={element.kind} rotation={element.rotation} colors={colors} floor={floor} />
      )}
    </g>
  )
}

type DrawingProps = { kind: RoomElementKind; length: number; depth: number; colors: RoomColors; floor: string }

/** The element without its label, around its centre: length `l` along x, depth `d` along y, the back at +d/2. */
function ElementDrawing({ kind, length: l, depth: d, colors: c, floor }: DrawingProps) {
  const back = d / 2
  const front = -d / 2
  switch (kind) {
    case 'Entrance':
      // An opening in the wall with the door leaf standing open into the room and its swing.
      return (
        <g>
          <rect x={-l / 2} y={back - 0.2} width={l} height={boundary + 0.4} fill={floor} />
          <path d={`M ${-l / 2} ${back - l} A ${l} ${l} 0 0 1 ${l / 2} ${back} L ${-l / 2} ${back} Z`} fill={c.door} fillOpacity={0.07} />
          <path d={`M ${-l / 2} ${back - l} A ${l} ${l} 0 0 1 ${l / 2} ${back}`} fill="none" stroke={c.door} strokeWidth={0.5} />
          <line x1={-l / 2} y1={back} x2={-l / 2} y2={back - l} stroke={c.door} strokeWidth={1.1} />
        </g>
      )
    case 'Window':
      // A light opening in the wall behind the element, with the glass in the middle.
      return (
        <g>
          <rect x={-l / 2} y={back} width={l} height={boundary} fill={c.window} />
          <line x1={-l / 2} y1={back + boundary / 2} x2={l / 2} y2={back + boundary / 2} stroke={c.windowLine} strokeWidth={0.5} />
          <line x1={-l / 2} y1={back + 0.2} x2={l / 2} y2={back + 0.2} stroke={c.windowLine} strokeWidth={0.3} />
          <line x1={-l / 2} y1={back + boundary - 0.2} x2={l / 2} y2={back + boundary - 0.2} stroke={c.windowLine} strokeWidth={0.3} />
        </g>
      )
    case 'Bar': {
      // The counter at the back, the stools in front of it.
      const counter = d * 0.55
      const radius = Math.min(d * 0.14, 3.2)
      const stools = Math.max(1, Math.floor((l - 4) / (2 * radius + 4)))
      const stoolY = back - counter - radius - 1.2
      return (
        <g>
          <rect x={-l / 2} y={back - counter} width={l} height={counter} rx={1} fill={c.wood} stroke={c.woodLine} strokeWidth={0.5} />
          <rect x={-l / 2 + 1.5} y={back - counter + 1.5} width={Math.max(0, l - 3)} height={counter * 0.35} rx={0.6} fill={c.woodLight} />
          {Array.from({ length: stools }, (_, i) => (
            <circle key={i} cx={-l / 2 + (l * (i + 0.5)) / stools} cy={stoolY} r={radius} fill={c.wood} stroke={c.woodLine} strokeWidth={0.5} />
          ))}
        </g>
      )
    }
    case 'Plant':
      return (
        <g>
          <ellipse rx={l / 2} ry={d / 2} fill={c.plant} stroke={c.pot} strokeWidth={0.6} />
          <ellipse cx={-l * 0.14} cy={-d * 0.14} rx={l * 0.2} ry={d * 0.2} fill={c.plantLight} />
        </g>
      )
    case 'Pillar':
      return <rect x={-l / 2} y={front} width={l} height={d} fill={c.pillar} />
    case 'Sofa': {
      // Seat with backrest at the back and armrests at both ends, divided into cushions.
      const arm = Math.min(d * 0.25, l / 4)
      const rest = d * 0.3
      const cushions = Math.max(1, Math.round((l - 2 * arm) / (d * 0.9)))
      const seat = (l - 2 * arm) / cushions
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} rx={1.5} fill={c.sofa} stroke={c.sofaLine} strokeWidth={0.5} />
          <rect x={-l / 2} y={back - rest} width={l} height={rest} rx={1.2} fill={c.sofaBack} />
          <rect x={-l / 2} y={front} width={arm} height={d} rx={1.2} fill={c.sofaBack} />
          <rect x={l / 2 - arm} y={front} width={arm} height={d} rx={1.2} fill={c.sofaBack} />
          {Array.from({ length: cushions - 1 }, (_, i) => {
            const cx = -l / 2 + arm + seat * (i + 1)
            return <line key={i} x1={cx} y1={front + 1} x2={cx} y2={back - rest} stroke={c.sofaLine} strokeWidth={0.4} />
          })}
        </g>
      )
    }
    case 'Stage': {
      // A platform with its boards and the step along its front.
      const step = Math.min(d * 0.15, 4)
      const boards = Math.max(0, Math.floor((d - step) / 5))
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} fill={c.stage} stroke={c.stageLine} strokeWidth={0.7} />
          {Array.from({ length: boards }, (_, i) => {
            const by = back - 5 * (i + 1)
            return by > front + step ? <line key={i} x1={-l / 2} y1={by} x2={l / 2} y2={by} stroke={c.stageEdge} strokeWidth={0.4} /> : null
          })}
          <rect x={-l / 2} y={front} width={l} height={step} fill={c.stageEdge} stroke={c.stageLine} strokeWidth={0.5} />
        </g>
      )
    }
    case 'Service': {
      // A working area with the pass at the back; its label ("Service" or e.g. "Küche") in front.
      const pass = d * 0.3
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} fill={c.service} stroke={c.serviceLine} strokeWidth={0.6} />
          <rect x={-l / 2} y={back - pass} width={l} height={pass} fill={c.servicePass} stroke={c.serviceLine} strokeWidth={0.4} />
        </g>
      )
    }
    case 'Stairs': {
      // The steps across, with the arrow of the walking direction towards the front.
      const steps = Math.max(3, Math.round(d / 4.5))
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} fill={c.stairs} stroke={c.stairsLine} strokeWidth={0.6} />
          {Array.from({ length: steps - 1 }, (_, i) => {
            const sy = front + (d * (i + 1)) / steps
            return <line key={i} x1={-l / 2} y1={sy} x2={l / 2} y2={sy} stroke={c.stairsLine} strokeWidth={0.4} />
          })}
          <path
            d={`M 0 ${back - 2} V ${front + 2.5} M -1.8 ${front + 4.5} L 0 ${front + 2.5} L 1.8 ${front + 4.5}`}
            fill="none"
            stroke={c.stairsLine}
            strokeWidth={0.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )
    }
    case 'Label':
      return null
  }
}

type ElementLabelProps = { text: string; kind: RoomElementKind; rotation: RoomRotation; colors: RoomColors; floor: string }

/** The label in the element's middle, horizontal or, at the side walls, from bottom to top; never upside down. */
function ElementLabel({ text, kind, rotation, colors, floor }: ElementLabelProps) {
  const angle = (rotation === 90 || rotation === 270 ? -90 : 0) - rotation
  return (
    <text
      transform={`rotate(${angle})`}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={kind === 'Label' ? 7.5 : 5}
      fontWeight={kind === 'Label' ? 500 : 400}
      letterSpacing={kind === 'Label' ? 0.3 : 0}
      fill={colors.text}
      stroke={floor}
      strokeWidth={kind === 'Label' ? 1.6 : 1.2}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {text}
    </text>
  )
}

/** A small symbol of an element kind for the editor's palette: the element in its default size, at a piece of wall where it belongs. */
export function RoomElementIcon({ kind, size = 28 }: { kind: RoomElementKind; size?: number }) {
  const colors = roomColors.light
  const floor = colors.floor.Indoor.base
  const dimensions = roomElementDimensions[kind]
  const l = dimensions.length * planUnits
  const d = dimensions.depth * planUnits
  const atWall = kind === 'Entrance' || kind === 'Window'
  // The drawn extent: a door's swing reaches its width into the room, a window lies in the wall.
  const top = kind === 'Entrance' ? d / 2 - l : -d / 2
  const bottom = atWall ? d / 2 + boundary : d / 2
  const side = Math.max(l, bottom - top) * 1.15
  const centreY = (top + bottom) / 2
  return (
    <svg width={size} height={size} viewBox={`${-side / 2} ${centreY - side / 2} ${side} ${side}`} aria-hidden="true" focusable="false">
      {atWall && <rect x={-side / 2} y={d / 2} width={side} height={boundary} fill={colors.wall} />}
      <ElementDrawing kind={kind} length={l} depth={d} colors={colors} floor={floor} />
      {kind === 'Label' && (
        <text textAnchor="middle" dominantBaseline="central" fontSize={side * 0.45} fontWeight={600} fill={colors.text}>
          Aa
        </text>
      )}
    </svg>
  )
}
