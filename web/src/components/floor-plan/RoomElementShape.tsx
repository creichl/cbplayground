import { useTranslation } from 'react-i18next'
import type { RoomElement, RoomElementKind, RoomRotation, RoomStyle } from '../../api/areas.ts'
import { roomBoundary, roomColors, roomElementDimensions, roomElementDimensionsOf, type RoomColors } from './layout.ts'

/** Plan width in the units of the room's drawing; the plan is 300 × 200 units (3:2). */
export const planUnits = 300

/** Thickness of the boundary in drawing units. */
const boundary = roomBoundary * planUnits

/** The light comes from the top left: a shadow falls this far to the right and down, in drawing units, for a low object. */
const shadowOffset = { x: 0.9, y: 1.3 }

type RoomElementShapeProps = {
  element: Pick<RoomElement, 'kind' | 'posX' | 'posY' | 'width' | 'height' | 'rotation' | 'label'>
  roomStyle: RoomStyle
  colors: RoomColors
  /** The floor's colour: the halo around texts and the opening of a door in a railing or parapet. */
  floor: string
  /** The floor's pattern as a fill (`url(#…)`), for the path through the lawn and the hedge at a garden's entrance. */
  floorFill: string
}

/**
 * A room element in the drawing of the room (an SVG of 300 × 200 units), in plan view like a rendered plan, with its
 * shadow. It is drawn with its length along the wall and its depth into the room, its back to the wall and its front facing
 * up, then turned by its rotation (0: at the bottom wall, 90: left, 180: top, 270: right). An element with a label shows
 * it, kept readable.
 */
export function RoomElementShape({ element, roomStyle, colors, floor, floorFill }: RoomElementShapeProps) {
  const { t } = useTranslation()
  const { length, depth } = roomElementDimensionsOf(element)
  const x = element.posX * planUnits
  const y = (element.posY * planUnits * 2) / 3
  const label = element.label ?? (element.kind === 'Service' ? t('floorPlan.service') : null)
  return (
    <g transform={`translate(${x} ${y}) rotate(${element.rotation})`}>
      <ElementDrawing
        kind={element.kind}
        length={length * planUnits}
        depth={depth * planUnits}
        roomStyle={roomStyle}
        colors={colors}
        floor={floor}
        floorFill={floorFill}
        shadow={localShadow(element.rotation)}
      />
      {label !== null && (
        <ElementLabel text={label} kind={element.kind} rotation={element.rotation} colors={colors} floor={floor} />
      )}
    </g>
  )
}

/** The shadow's offset in the element's own, turned coordinates, so every shadow falls the same way in the room. */
function localShadow(rotation: RoomRotation) {
  const radians = (rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: shadowOffset.x * cos + shadowOffset.y * sin, y: -shadowOffset.x * sin + shadowOffset.y * cos }
}

type DrawingProps = {
  kind: RoomElementKind
  length: number
  depth: number
  roomStyle: RoomStyle
  colors: RoomColors
  floor: string
  floorFill: string
  /** The shadow's offset for a low object, in the element's coordinates; higher objects cast it further. */
  shadow: { x: number; y: number }
}

/** The element without its label, around its centre: length `l` along x, depth `d` along y, the back at +d/2. */
function ElementDrawing({ kind, length: l, depth: d, roomStyle, colors: c, floor, floorFill, shadow }: DrawingProps) {
  const back = d / 2
  const front = -d / 2
  // The shadow of an object `height` times as high as a low one.
  const cast = (height: number) => ({
    transform: `translate(${shadow.x * height} ${shadow.y * height})`,
    fill: c.shadow,
    fillOpacity: 0.16 * c.shadowStrength,
  })
  switch (kind) {
    case 'Entrance': {
      // An opening in the boundary between its two ends, the door leaf standing open into the room and its swing.
      const leaf = 1.1
      return (
        <g>
          {roomStyle === 'Garden' ? (
            // A gap in the hedge with the gravel path through the lawn.
            <rect x={-l / 2} y={back - 8} width={l} height={boundary + 8.4} fill={floorFill} />
          ) : (
            <rect
              x={-l / 2}
              y={back - 0.3}
              width={l}
              height={boundary + 0.6}
              fill={roomStyle === 'Indoor' ? c.threshold : floor}
            />
          )}
          {roomStyle === 'Indoor' ? (
            <path
              d={`M ${-l / 2} ${back} V ${back + boundary} M ${l / 2} ${back} V ${back + boundary}`}
              stroke={c.wallEdge}
              strokeWidth={0.8}
            />
          ) : (
            <>
              <rect x={-l / 2 - 1.2} y={back + boundary / 2 - 1.2} width={2.4} height={2.4} fill={c.post} />
              <rect x={l / 2 - 1.2} y={back + boundary / 2 - 1.2} width={2.4} height={2.4} fill={c.post} />
            </>
          )}
          <path d={`M ${-l / 2} ${back - l} A ${l} ${l} 0 0 1 ${l / 2} ${back} L ${-l / 2} ${back} Z`} fill={c.doorSwing} fillOpacity={0.08} />
          <path
            d={`M ${-l / 2} ${back - l} A ${l} ${l} 0 0 1 ${l / 2} ${back}`}
            fill="none"
            stroke={c.doorSwing}
            strokeWidth={0.4}
            strokeDasharray="1.4 1"
          />
          <rect x={-l / 2} y={back - l} width={leaf} height={l} {...cast(0.6)} />
          <rect x={-l / 2} y={back - l} width={leaf} height={l} fill={c.door} stroke={c.woodLine} strokeWidth={0.25} />
        </g>
      )
    }
    case 'Window': {
      // An opening in the wall behind the element: the reveals at both ends, the frame and the glass in the middle.
      const panes = Math.max(1, Math.round(l / 18))
      return (
        <g>
          <rect x={-l / 2} y={back} width={l} height={boundary} fill={c.window} />
          <path
            d={`M ${-l / 2} ${back + 0.3} H ${l / 2} M ${-l / 2} ${back + boundary - 0.3} H ${l / 2}`}
            stroke={c.windowLine}
            strokeWidth={0.3}
          />
          <path
            d={`M ${-l / 2} ${back + boundary * 0.43} H ${l / 2} M ${-l / 2} ${back + boundary * 0.57} H ${l / 2}`}
            stroke={c.windowLine}
            strokeWidth={0.35}
          />
          {Array.from({ length: panes - 1 }, (_, i) => {
            const px = -l / 2 + (l * (i + 1)) / panes
            return (
              <line key={i} x1={px} y1={back + 0.3} x2={px} y2={back + boundary - 0.3} stroke={c.windowLine} strokeWidth={0.5} />
            )
          })}
          <rect x={-l / 2 - 0.4} y={back} width={0.8} height={boundary} fill={c.wallEdge} />
          <rect x={l / 2 - 0.4} y={back} width={0.8} height={boundary} fill={c.wallEdge} />
        </g>
      )
    }
    case 'Bar': {
      // From the wall into the room: the back bar with its bottles, the aisle behind the counter, the counter top with its
      // edge, and the round stools in front of it.
      const backBar = d * 0.17
      const aisle = d * 0.16
      const counter = d * 0.27
      const counterBack = back - backBar - aisle
      const counterFront = counterBack - counter
      const radius = Math.min(d * 0.12, 3.4)
      const stools = Math.max(1, Math.floor((l - 4) / (2 * radius + 3.5)))
      const stoolY = counterFront - 1.4 - radius
      const bottles = Math.max(0, Math.floor((l - 6) / 3.2))
      return (
        <g>
          <rect x={-l / 2} y={back - backBar} width={l} height={backBar} {...cast(1.2)} />
          <rect x={-l / 2} y={back - backBar} width={l} height={backBar} fill={c.woodDark} stroke={c.woodLine} strokeWidth={0.35} />
          {Array.from({ length: bottles }, (_, i) => (
            <circle
              key={i}
              cx={-l / 2 + 3 + 3.2 * i + 1.6}
              cy={back - backBar / 2}
              r={Math.min(0.9, backBar / 3)}
              fill={c.bottles[i % c.bottles.length]}
              fillOpacity={0.9}
            />
          ))}
          <rect x={-l / 2} y={counterFront} width={l} height={counter} rx={1} {...cast(1.2)} />
          <rect x={-l / 2} y={counterFront} width={l} height={counter} rx={1} fill={c.wood} stroke={c.woodLine} strokeWidth={0.45} />
          <rect
            x={-l / 2 + 1}
            y={counterFront + 0.9}
            width={Math.max(0, l - 2)}
            height={Math.max(0, counter * 0.45)}
            rx={0.6}
            fill={c.woodLight}
          />
          <line x1={-l / 2 + 0.6} y1={counterFront + 0.5} x2={l / 2 - 0.6} y2={counterFront + 0.5} stroke={c.woodLine} strokeWidth={0.3} />
          {Array.from({ length: stools }, (_, i) => {
            const cx = -l / 2 + (l * (i + 0.5)) / stools
            return (
              <g key={i}>
                <circle cx={cx} cy={stoolY} r={radius} {...cast(0.8)} />
                <circle cx={cx} cy={stoolY} r={radius} fill={c.stool} />
                <circle cx={cx} cy={stoolY} r={radius * 0.72} fill={c.stoolTop} />
                <circle cx={cx - radius * 0.22} cy={stoolY - radius * 0.22} r={radius * 0.28} fill="#ffffff" fillOpacity={0.12} />
              </g>
            )
          })}
        </g>
      )
    }
    case 'Plant':
      return roomStyle === 'Garden' ? <Tree l={l} d={d} c={c} cast={cast} /> : <PottedPlant l={l} d={d} c={c} cast={cast} />
    case 'Pillar':
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} {...cast(2)} />
          <rect x={-l / 2} y={front} width={l} height={d} fill={c.pillar} stroke={c.wallEdge} strokeWidth={0.4} />
          <path d={`M ${-l / 2 + 0.6} ${back - 0.6} V ${front + 0.6} H ${l / 2 - 0.6}`} fill="none" stroke={c.pillarLight} strokeWidth={0.6} />
        </g>
      )
    case 'Sofa': {
      // The frame with the backrest at the back and an armrest at each end, the seat cushions and two throw pillows.
      const arm = Math.min(d * 0.22, l / 5)
      const rest = d * 0.28
      const cushions = Math.max(1, Math.round((l - 2 * arm) / (d * 0.9)))
      const seat = (l - 2 * arm) / cushions
      const pillow = Math.min(d * 0.3, seat * 0.4)
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} rx={1.8} {...cast(1)} />
          <rect x={-l / 2} y={front} width={l} height={d} rx={1.8} fill={c.sofaBack} stroke={c.sofaLine} strokeWidth={0.45} />
          {Array.from({ length: cushions }, (_, i) => (
            <g key={i}>
              <rect
                x={-l / 2 + arm + seat * i + 0.35}
                y={front + 0.8}
                width={Math.max(0, seat - 0.7)}
                height={Math.max(0, d - rest - 1.1)}
                rx={1.2}
                fill={c.cushion}
                stroke={c.sofaLine}
                strokeWidth={0.3}
              />
              <line
                x1={-l / 2 + arm + seat * i + 1.4}
                y1={front + 1.6}
                x2={-l / 2 + arm + seat * (i + 1) - 1.4}
                y2={front + 1.6}
                stroke="#ffffff"
                strokeOpacity={0.25}
                strokeWidth={0.5}
                strokeLinecap="round"
              />
            </g>
          ))}
          <rect x={-l / 2 + 0.4} y={front + 0.4} width={arm - 0.4} height={d - 0.8} rx={1.3} fill={c.sofa} stroke={c.sofaLine} strokeWidth={0.3} />
          <rect x={l / 2 - arm} y={front + 0.4} width={arm - 0.4} height={d - 0.8} rx={1.3} fill={c.sofa} stroke={c.sofaLine} strokeWidth={0.3} />
          <rect x={-l / 2 + 0.4} y={back - rest} width={l - 0.8} height={rest - 0.4} rx={1.3} fill={c.sofa} stroke={c.sofaLine} strokeWidth={0.3} />
          {[-1, 1].map((side) => (
            <rect
              key={side}
              x={side * (l / 2 - arm - 1 - pillow / 2) - pillow / 2}
              y={back - rest - pillow * 0.75}
              width={pillow}
              height={pillow}
              rx={pillow * 0.3}
              transform={`rotate(${side * 12} ${side * (l / 2 - arm - 1 - pillow / 2)} ${back - rest - pillow * 0.25})`}
              fill={c.pillow}
              stroke={c.sofaLine}
              strokeWidth={0.25}
            />
          ))}
        </g>
      )
    }
    case 'Stage': {
      // A raised platform of boards with staggered joints, its edge and the step along its front.
      const step = Math.min(d * 0.14, 4)
      const boardWidth = 3.4
      const rows = Math.max(0, Math.floor((d - step) / boardWidth))
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} {...cast(2.2)} />
          <rect x={-l / 2} y={front} width={l} height={d} fill={c.stage} stroke={c.stageLine} strokeWidth={0.6} />
          {Array.from({ length: rows }, (_, i) => {
            const by = back - boardWidth * (i + 1)
            if (by <= front + step) {
              return null
            }
            const offset = ((i * 37) % 60) - 30
            return (
              <g key={i}>
                <line x1={-l / 2} y1={by} x2={l / 2} y2={by} stroke={c.stageBoard} strokeWidth={0.35} />
                {[-60, 0, 60].map((joint) =>
                  Math.abs(joint + offset) < l / 2 ? (
                    <line
                      key={joint}
                      x1={joint + offset}
                      y1={by}
                      x2={joint + offset}
                      y2={by + boardWidth}
                      stroke={c.stageBoard}
                      strokeWidth={0.3}
                    />
                  ) : null,
                )}
              </g>
            )
          })}
          <rect x={-l / 2} y={front} width={l} height={step} fill={c.stageEdge} stroke={c.stageLine} strokeWidth={0.45} />
          <line x1={-l / 2} y1={front + step} x2={l / 2} y2={front + step} stroke={c.stageLine} strokeWidth={0.6} />
        </g>
      )
    }
    case 'Service': {
      // A working counter: the pass at the back, the worktop with a sink at one end; its label ("Service" or e.g. "Küche") in front.
      const pass = d * 0.3
      const sink = Math.min(l * 0.18, d * 0.4)
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} {...cast(1.2)} />
          <rect x={-l / 2} y={front} width={l} height={d} fill={c.service} stroke={c.serviceLine} strokeWidth={0.5} />
          <rect x={-l / 2 + 0.8} y={front + 0.8} width={l - 1.6} height={d - pass - 1.2} rx={0.5} fill={c.serviceTop} />
          <rect x={-l / 2} y={back - pass} width={l} height={pass} fill={c.servicePass} stroke={c.serviceLine} strokeWidth={0.35} />
          <rect
            x={l / 2 - sink - 1.8}
            y={front + 1.6}
            width={sink}
            height={sink * 0.7}
            rx={sink * 0.15}
            fill={c.sink}
            stroke={c.serviceLine}
            strokeWidth={0.3}
          />
        </g>
      )
    }
    case 'Stairs': {
      // The steps across, a handrail along both sides, and the walking direction from the start (a dot) to the arrow.
      const steps = Math.max(3, Math.round(d / 4))
      const rail = Math.min(1.2, l * 0.06)
      return (
        <g>
          <rect x={-l / 2} y={front} width={l} height={d} {...cast(0.8)} />
          <rect x={-l / 2} y={front} width={l} height={d} fill={c.stairs} stroke={c.stairsLine} strokeWidth={0.55} />
          {Array.from({ length: steps }, (_, i) =>
            i % 2 === 1 ? (
              <rect key={i} x={-l / 2} y={front + (d * i) / steps} width={l} height={d / steps} fill={c.stairsAlt} />
            ) : null,
          )}
          {Array.from({ length: steps - 1 }, (_, i) => {
            const sy = front + (d * (i + 1)) / steps
            return <line key={i} x1={-l / 2} y1={sy} x2={l / 2} y2={sy} stroke={c.stairsLine} strokeWidth={0.35} />
          })}
          <rect x={-l / 2} y={front} width={rail} height={d} fill={c.stairsLine} fillOpacity={0.55} />
          <rect x={l / 2 - rail} y={front} width={rail} height={d} fill={c.stairsLine} fillOpacity={0.55} />
          <circle cx={0} cy={back - 2.4} r={0.9} fill={c.stairsLine} />
          <path
            d={`M 0 ${back - 2.4} V ${front + 2.5} M -1.8 ${front + 4.5} L 0 ${front + 2.5} L 1.8 ${front + 4.5}`}
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

type FoliageProps = { l: number; d: number; c: RoomColors; cast: (height: number) => { transform: string; fill: string; fillOpacity: number } }

/** A plant in a round planter: the pot with its rim and soil, and a crown of leaves around the middle. */
function PottedPlant({ l, d, c, cast }: FoliageProps) {
  const rx = l / 2
  const ry = d / 2
  const leaves = 9
  return (
    <g>
      <ellipse rx={rx} ry={ry} {...cast(1.4)} />
      <ellipse rx={rx * 0.8} ry={ry * 0.8} fill={c.pot} />
      <ellipse rx={rx * 0.8} ry={ry * 0.8} fill="none" stroke={c.potRim} strokeWidth={0.7} />
      <ellipse rx={rx * 0.62} ry={ry * 0.62} fill={c.soil} />
      {Array.from({ length: leaves }, (_, i) => {
        const angle = (360 * i) / leaves + (i % 2) * 14
        const reach = i % 2 === 0 ? 0.98 : 0.8
        return (
          <ellipse
            key={i}
            cx={0}
            cy={(-ry * reach) / 2}
            rx={rx * 0.2}
            ry={(ry * reach) / 2}
            transform={`rotate(${angle})`}
            fill={i % 3 === 0 ? c.leafDark : i % 3 === 1 ? c.leaf : c.leafLight}
          />
        )
      })}
      {Array.from({ length: 5 }, (_, i) => (
        <ellipse
          key={i}
          cx={0}
          cy={-ry * 0.25}
          rx={rx * 0.13}
          ry={ry * 0.26}
          transform={`rotate(${36 + 72 * i})`}
          fill={c.leafLight}
        />
      ))}
    </g>
  )
}

/** A tree seen from above: a crown of leafy lobes, lit from the top left, a bit wider than its trunk's place, with its shadow. */
function Tree({ l, d, c, cast }: FoliageProps) {
  const r = (Math.min(l, d) / 2) * 1.2
  const lobes = 9
  const lobe = r * 0.42
  return (
    <g>
      <circle r={r} {...cast(2.6)} />
      <circle r={r * 0.92} fill={c.leafDark} />
      {Array.from({ length: lobes }, (_, i) => {
        const angle = (2 * Math.PI * i) / lobes
        return <circle key={i} cx={Math.cos(angle) * (r - lobe)} cy={Math.sin(angle) * (r - lobe)} r={lobe} fill={c.leafDark} />
      })}
      {Array.from({ length: lobes }, (_, i) => {
        const angle = (2 * Math.PI * i) / lobes + 0.3
        return (
          <circle
            key={i}
            cx={Math.cos(angle) * (r - lobe) * 0.8 - r * 0.08}
            cy={Math.sin(angle) * (r - lobe) * 0.8 - r * 0.08}
            r={lobe * 0.85}
            fill={c.leaf}
          />
        )
      })}
      {[0, 1, 2, 3].map((i) => {
        const angle = -2.4 + i * 0.55
        return (
          <circle
            key={i}
            cx={Math.cos(angle) * r * 0.42 - r * 0.1}
            cy={Math.sin(angle) * r * 0.42 - r * 0.1}
            r={lobe * 0.55}
            fill={c.leafLight}
          />
        )
      })}
    </g>
  )
}

type ElementLabelProps = { text: string; kind: RoomElementKind; rotation: RoomRotation; colors: RoomColors; floor: string }

/** The label in the element's middle in calm small capitals, horizontal or, at the side walls, from bottom to top; never upside down. */
function ElementLabel({ text, kind, rotation, colors, floor }: ElementLabelProps) {
  const angle = (rotation === 90 || rotation === 270 ? -90 : 0) - rotation
  return (
    <text
      transform={`rotate(${angle})`}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={kind === 'Label' ? 8 : 5.4}
      fontWeight={kind === 'Label' ? 600 : 500}
      letterSpacing={kind === 'Label' ? 1 : 0.4}
      fill={colors.text}
      stroke={floor}
      strokeWidth={kind === 'Label' ? 1.8 : 1.3}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={{ fontVariantCaps: 'all-small-caps' }}
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
      <ElementDrawing
        kind={kind}
        length={l}
        depth={d}
        roomStyle="Indoor"
        colors={colors}
        floor={floor}
        floorFill={floor}
        shadow={shadowOffset}
      />
      {kind === 'Label' && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={side * 0.45}
          fontWeight={600}
          fill={colors.text}
        >
          Aa
        </text>
      )}
    </svg>
  )
}
