import { type ReactNode, useId } from 'react'
import type { RoomElement, RoomStyle } from '../../api/areas.ts'
import { roomBoundary, roomColors, type RoomColors } from './layout.ts'
import { planUnits, RoomElementShape } from './RoomElementShape.tsx'

const width = planUnits
const height = (planUnits * 2) / 3
const boundary = roomBoundary * planUnits

/** Width of the lawn along the hedge of a garden, in drawing units. */
const lawnWidth = 7

type RoomProps = {
  roomStyle: RoomStyle
  elements: Pick<RoomElement, 'id' | 'kind' | 'posX' | 'posY' | 'width' | 'height' | 'rotation' | 'label'>[]
  dark: boolean
  /** The part of the drawing to show, in its units (the room is 300 × 200); by default the room with its boundary. */
  viewBox?: string
}

/**
 * The drawn room of an area without floor plan image, in plan view like a rendered plan: the floor of its style as a
 * texture (planks with grain, stone slabs, a deck, gravel with a lawn), the boundary around it (walls, railing, glass parapet
 * or hedge, outside the plan, so the positions refer to the whole room) with the shadow it casts, and the room elements in
 * their order. The textures are SVG patterns of plain shapes, without filters, so zooming stays smooth. It is decorative and
 * the background of the tables: it ignores the pointer and is hidden from assistive technology.
 */
export function Room({ roomStyle, elements, dark, viewBox }: RoomProps) {
  // Patterns need ids that are unique on the page; useId may contain characters that do not work in url().
  const prefix = `room-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const ids = { floor: `${prefix}-floor`, lawn: `${prefix}-lawn`, hedge: `${prefix}-hedge`, shade: `${prefix}-shade` }
  const colors = roomColors[dark ? 'dark' : 'light']
  const floor = colors.floor[roomStyle]
  // Railing and parapet stand on the floor, which runs on below them; walls and hedge stand at its edge.
  const open = roomStyle === 'Terrace' || roomStyle === 'Rooftop'
  return (
    <svg
      viewBox={viewBox ?? `${-boundary} ${-boundary} ${width + 2 * boundary} ${height + 2 * boundary}`}
      aria-hidden="true"
      focusable="false"
      style={
        viewBox === undefined
          ? {
              position: 'absolute',
              // The boundary lies outside the plan.
              left: `${-roomBoundary * 100}%`,
              top: `${-roomBoundary * 150}%`,
              width: `${(1 + 2 * roomBoundary) * 100}%`,
              height: `${(1 + 3 * roomBoundary) * 100}%`,
              pointerEvents: 'none',
              display: 'block',
            }
          : { display: 'block', width: '100%', height: '100%' }
      }
    >
      <defs>
        <FloorPattern id={ids.floor} roomStyle={roomStyle} colors={colors} />
        {roomStyle === 'Garden' && <LawnPattern id={ids.lawn} colors={colors} />}
        {roomStyle === 'Garden' && <HedgePattern id={ids.hedge} colors={colors} />}
        <ShadeGradients prefix={ids.shade} color={colors.shadow} />
      </defs>
      {open ? (
        <rect x={-boundary} y={-boundary} width={width + 2 * boundary} height={height + 2 * boundary} fill={`url(#${ids.floor})`} />
      ) : (
        <rect x={0} y={0} width={width} height={height} fill={`url(#${ids.floor})`} />
      )}
      {roomStyle === 'Garden' && (
        <path
          d={`${rectPath(0, 0, width, height)} ${rectPath(lawnWidth, lawnWidth, width - 2 * lawnWidth, height - 2 * lawnWidth, 4)}`}
          fillRule="evenodd"
          fill={`url(#${ids.lawn})`}
          stroke={colors.lawn.tones[1]}
          strokeWidth={0.4}
        />
      )}
      <InnerShadow roomStyle={roomStyle} colors={colors} prefix={ids.shade} />
      <Boundary roomStyle={roomStyle} colors={colors} hedgeFill={`url(#${ids.hedge})`} />
      {elements.map((element) => (
        <RoomElementShape
          key={element.id}
          element={element}
          roomStyle={roomStyle}
          colors={colors}
          floor={floor.base}
          floorFill={`url(#${ids.floor})`}
        />
      ))}
    </svg>
  )
}

/** A small symbol of a room style for the editor: a corner of the room with its floor and boundary. */
export function RoomStylePreview({ roomStyle, size = 36 }: { roomStyle: RoomStyle; size?: number }) {
  return (
    <span style={{ display: 'block', width: size, height: (size * 2) / 3, flexShrink: 0, borderRadius: 2, overflow: 'hidden' }}>
      <Room roomStyle={roomStyle} elements={[]} dark={false} viewBox={`${-boundary * 1.5} ${-boundary * 1.5} 60 40`} />
    </span>
  )
}

/** The outline of a rectangle as path data, with rounded corners of `radius`; drawn clockwise. */
function rectPath(x: number, y: number, w: number, h: number, radius = 0) {
  const r = radius
  if (r === 0) {
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
  }
  return (
    `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} ` +
    `H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
  )
}

/** A small deterministic random generator (mulberry32), so a texture looks the same on every render and in every browser. */
function random(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * The places at which to draw a shape that reaches `reach` around its point: the point itself and, where the shape reaches
 * over the tile's edge, the same point on the opposite side, so the pattern repeats without seams.
 */
function tiled(x: number, y: number, reach: number, tileWidth: number, tileHeight: number) {
  const xs = [x, ...(x < reach ? [x + tileWidth] : []), ...(x > tileWidth - reach ? [x - tileWidth] : [])]
  const ys = [y, ...(y < reach ? [y + tileHeight] : []), ...(y > tileHeight - reach ? [y - tileHeight] : [])]
  return xs.flatMap((px) => ys.map((py) => ({ x: round(px), y: round(py) })))
}

/** An ellipse turned by `angle` degrees as path data, so many of them make up one path. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number, angle: number) {
  const dx = round(rx * Math.cos((angle * Math.PI) / 180))
  const dy = round(rx * Math.sin((angle * Math.PI) / 180))
  return `M ${round(cx - dx)} ${round(cy - dy)} A ${rx} ${ry} ${angle} 0 1 ${round(cx + dx)} ${round(cy + dy)} A ${rx} ${ry} ${angle} 0 1 ${round(cx - dx)} ${round(cy - dy)} Z`
}

/**
 * Small shapes in a few tones, drawn as one path per tone: hundreds of single elements would make every zoom step slower.
 * `shapes` gives each shape's tone (an index into `tones`) and its path data.
 */
function TonePaths({ tones, shapes, stroke }: { tones: string[]; shapes: { tone: number; d: string }[]; stroke?: number }) {
  return (
    <>
      {tones.map((tone, i) => {
        const d = shapes
          .filter((shape) => shape.tone === i)
          .map((shape) => shape.d)
          .join(' ')
        return stroke === undefined ? (
          <path key={i} d={d} fill={tone} />
        ) : (
          <path key={i} d={d} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" />
        )
      })}
    </>
  )
}

type PatternProps = { id: string; colors: RoomColors }

/** The floor of a room style as a texture. */
function FloorPattern({ id, roomStyle, colors }: PatternProps & { roomStyle: RoomStyle }) {
  const floor = colors.floor[roomStyle]
  switch (roomStyle) {
    case 'Indoor':
      return <Planks id={id} floor={floor} />
    case 'Terrace':
      return <Slabs id={id} floor={floor} />
    case 'Rooftop':
      return <Deck id={id} floor={floor} />
    case 'Garden':
      return <Gravel id={id} floor={floor} />
  }
}

type Floor = RoomColors['floor']['Indoor']

/**
 * Oak planks in rows with staggered joints: every plank in its own tone with a light grain and now and then a knot. The
 * last plank of a row reaches over the tile's edge and is drawn once more at its start, so the rows run on seamlessly.
 */
function Planks({ id, floor }: { id: string; floor: Floor }) {
  const plankLength = 44
  const plankWidth = 4.4
  const rows = 8
  const perRow = 3
  const tileWidth = plankLength * perRow
  const tileHeight = plankWidth * rows
  const next = random(11)
  const planks: ReactNode[] = []
  for (let row = 0; row < rows; row++) {
    const y = row * plankWidth
    const offset = round(next() * plankLength)
    for (let k = 0; k < perRow; k++) {
      const x = offset + k * plankLength
      const tone = floor.tones[Math.floor(next() * floor.tones.length)]
      const grain = [0.3, 0.55, 0.8].map((at) => {
        const gy = round(y + plankWidth * (at + (next() - 0.5) * 0.15))
        const bend = round((next() - 0.5) * 1.2)
        return `M ${x + 1} ${gy} Q ${x + plankLength / 2} ${round(gy + bend)} ${x + plankLength - 1} ${gy}`
      })
      const knot = next() < 0.1 ? { x: round(x + 6 + next() * (plankLength - 12)), y: round(y + plankWidth * (0.35 + next() * 0.3)) } : null
      const plank = (key: string, shift: number) => (
        <g key={key} transform={shift === 0 ? undefined : `translate(${shift} 0)`}>
          <rect x={x} y={y} width={plankLength} height={plankWidth} fill={tone} />
          <path d={grain.join(' ')} fill="none" stroke={floor.grain} strokeWidth={0.2} strokeOpacity={0.45} />
          {knot !== null && <ellipse cx={knot.x} cy={knot.y} rx={0.9} ry={0.35} fill="none" stroke={floor.grain} strokeWidth={0.2} strokeOpacity={0.6} />}
          <line x1={x} y1={y} x2={x} y2={y + plankWidth} stroke={floor.joint} strokeWidth={0.35} />
        </g>
      )
      planks.push(plank(`${row}-${k}`, 0))
      if (k === perRow - 1) {
        planks.push(plank(`${row}-${k}-start`, -tileWidth))
      }
    }
  }
  return (
    <pattern id={id} width={tileWidth} height={tileHeight} patternUnits="userSpaceOnUse">
      <rect width={tileWidth} height={tileHeight} fill={floor.base} />
      {planks}
      <path
        d={Array.from({ length: rows }, (_, row) => `M 0 ${row * plankWidth} H ${tileWidth}`).join(' ')}
        stroke={floor.joint}
        strokeWidth={0.3}
      />
    </pattern>
  )
}

/** Rectangular stone slabs in a running bond with joints, each in its own tone and with a fine grain of speckles. */
function Slabs({ id, floor }: { id: string; floor: Floor }) {
  const slabWidth = 30
  const slabHeight = 20
  const joint = 0.6
  const rows = 4
  const perRow = 3
  const tileWidth = slabWidth * perRow
  const tileHeight = slabHeight * rows
  const next = random(23)
  const slabs: ReactNode[] = []
  for (let row = 0; row < rows; row++) {
    const y = row * slabHeight
    const offset = row % 2 === 0 ? 0 : slabWidth / 2
    for (let k = 0; k < perRow; k++) {
      const x = offset + k * slabWidth
      const tone = floor.tones[Math.floor(next() * floor.tones.length)]
      const speckles = Array.from({ length: 9 }, () => ({
        x: round(x + 1.5 + next() * (slabWidth - 3)),
        y: round(y + 1.5 + next() * (slabHeight - 3)),
        r: round(0.18 + next() * 0.3),
      }))
      const slab = (key: string, shift: number) => (
        <g key={key} transform={shift === 0 ? undefined : `translate(${shift} 0)`}>
          <rect x={x + joint / 2} y={y + joint / 2} width={slabWidth - joint} height={slabHeight - joint} rx={0.4} fill={tone} />
          <path
            d={speckles.map((speckle) => ellipsePath(speckle.x, speckle.y, speckle.r, speckle.r, 0)).join(' ')}
            fill={floor.grain}
            fillOpacity={0.7}
          />
          <path
            d={`M ${x + joint} ${y + slabHeight - joint} V ${y + joint} H ${x + slabWidth - joint}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.18}
            strokeWidth={0.4}
          />
        </g>
      )
      slabs.push(slab(`${row}-${k}`, 0))
      if (offset > 0 && k === perRow - 1) {
        slabs.push(slab(`${row}-${k}-start`, -tileWidth))
      }
    }
  }
  return (
    <pattern id={id} width={tileWidth} height={tileHeight} patternUnits="userSpaceOnUse">
      <rect width={tileWidth} height={tileHeight} fill={floor.joint} />
      {slabs}
    </pattern>
  )
}

/** A wooden deck: long boards with open joints between them, staggered butt joints, grain and the screws on the joists. */
function Deck({ id, floor }: { id: string; floor: Floor }) {
  const boardLength = 90
  const boardWidth = 3.8
  const gap = 0.55
  const rows = 10
  const perRow = 2
  const joist = 30
  const tileWidth = boardLength * perRow
  const tileHeight = boardWidth * rows
  const next = random(37)
  const boards: ReactNode[] = []
  for (let row = 0; row < rows; row++) {
    const y = row * boardWidth
    // The butt joints lie on a joist.
    const offset = Math.floor(next() * 3) * joist
    for (let k = 0; k < perRow; k++) {
      const x = offset + k * boardLength
      const tone = floor.tones[Math.floor(next() * floor.tones.length)]
      const grain = [0.35, 0.65].map((at) => {
        const gy = round(y + (boardWidth - gap) * at)
        const bend = round((next() - 0.5) * 0.9)
        return `M ${x + 1} ${gy} Q ${x + boardLength / 2} ${round(gy + bend)} ${x + boardLength - 1} ${gy}`
      })
      const board = (key: string, shift: number) => (
        <g key={key} transform={shift === 0 ? undefined : `translate(${shift} 0)`}>
          <rect x={x + 0.15} y={y} width={boardLength - 0.3} height={boardWidth - gap} fill={tone} />
          <path d={grain.join(' ')} fill="none" stroke={floor.grain} strokeWidth={0.22} strokeOpacity={0.6} />
        </g>
      )
      boards.push(board(`${row}-${k}`, 0))
      if (offset > 0 && k === perRow - 1) {
        boards.push(board(`${row}-${k}-start`, -tileWidth))
      }
    }
  }
  const screws: string[] = []
  for (let row = 0; row < rows; row++) {
    for (let x = joist / 2; x < tileWidth; x += joist) {
      const y = round(row * boardWidth + (boardWidth - gap) / 2)
      screws.push(ellipsePath(x - 0.9, y, 0.2, 0.2, 0), ellipsePath(x + 0.9, y, 0.2, 0.2, 0))
    }
  }
  return (
    <pattern id={id} width={tileWidth} height={tileHeight} patternUnits="userSpaceOnUse">
      <rect width={tileWidth} height={tileHeight} fill={floor.joint} />
      {boards}
      <path d={screws.join(' ')} fill={floor.joint} />
    </pattern>
  )
}

/** Gravel: a fine grain of pebbles of different size and tone. */
function Gravel({ id, floor }: { id: string; floor: Floor }) {
  const tile = 36
  const next = random(41)
  const pebbles = Array.from({ length: 260 }, () => {
    const x = next() * tile
    const y = next() * tile
    const rx = round(0.35 + next() * 0.55)
    const ry = round(rx * (0.6 + next() * 0.35))
    const angle = Math.round(next() * 180)
    const tone = Math.floor(next() * floor.tones.length)
    return tiled(x, y, rx, tile, tile).map((at) => ({ tone, d: ellipsePath(at.x, at.y, rx, ry, angle) }))
  }).flat()
  return (
    <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse">
      <rect width={tile} height={tile} fill={floor.base} />
      <TonePaths tones={floor.tones} shapes={pebbles} />
    </pattern>
  )
}

/** Lawn: short blades of grass in a few greens on a green ground. */
function LawnPattern({ id, colors }: PatternProps) {
  const tile = 24
  const next = random(53)
  const blades = Array.from({ length: 170 }, () => {
    const x = next() * tile
    const y = next() * tile
    const length = 0.7 + next() * 0.9
    const angle = ((next() - 0.5) * 70 * Math.PI) / 180
    const dx = round(Math.sin(angle) * length)
    const dy = round(-Math.cos(angle) * length)
    const tone = Math.floor(next() * colors.lawn.tones.length)
    return tiled(x, y, length, tile, tile).map((at) => ({ tone, d: `M ${at.x} ${at.y} l ${dx} ${dy}` }))
  }).flat()
  return (
    <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse">
      <rect width={tile} height={tile} fill={colors.lawn.base} />
      <TonePaths tones={colors.lawn.tones} shapes={blades} stroke={0.35} />
    </pattern>
  )
}

/** The leaves of a hedge: small overlapping leaves in a few greens. */
function HedgePattern({ id, colors }: PatternProps) {
  const tile = 14
  const next = random(67)
  const leaves = Array.from({ length: 70 }, () => {
    const x = next() * tile
    const y = next() * tile
    const rx = round(0.8 + next() * 0.7)
    const ry = round(rx * 0.55)
    const angle = Math.round(next() * 180)
    const tone = Math.floor(next() * colors.hedge.leaves.length)
    return tiled(x, y, rx, tile, tile).map((at) => ({ tone, d: ellipsePath(at.x, at.y, rx, ry, angle) }))
  }).flat()
  return (
    <pattern id={id} width={tile} height={tile} patternUnits="userSpaceOnUse">
      <rect width={tile} height={tile} fill={colors.hedge.base} />
      <TonePaths tones={colors.hedge.leaves} shapes={leaves} />
    </pattern>
  )
}

/** Gradients from the shadow's colour to nothing, one per direction: `-down` fades downwards, `-up`, `-right`, `-left` likewise. */
function ShadeGradients({ prefix, color }: { prefix: string; color: string }) {
  const directions = { down: [0, 0, 0, 1], up: [0, 1, 0, 0], right: [0, 0, 1, 0], left: [1, 0, 0, 0] }
  return (
    <>
      {Object.entries(directions).map(([name, [x1, y1, x2, y2]]) => (
        <linearGradient key={name} id={`${prefix}-${name}`} x1={x1} y1={y1} x2={x2} y2={y2}>
          <stop offset={0} stopColor={color} stopOpacity={1} />
          <stop offset={1} stopColor={color} stopOpacity={0} />
        </linearGradient>
      ))}
    </>
  )
}

/**
 * The shadow the boundary casts onto the floor along its inner edge; the light comes from the top left, so it is deeper below
 * the top and beside the left boundary. Walls and the hedge cast more than a railing or a glass parapet.
 */
function InnerShadow({ roomStyle, colors, prefix }: { roomStyle: RoomStyle; colors: RoomColors; prefix: string }) {
  const depth = roomStyle === 'Indoor' ? 6 : roomStyle === 'Garden' ? 7 : 3
  const strength = (roomStyle === 'Indoor' || roomStyle === 'Garden' ? 0.2 : 0.1) * colors.shadowStrength
  return (
    <g>
      <rect x={0} y={0} width={width} height={depth} fill={`url(#${prefix}-down)`} fillOpacity={strength} />
      <rect x={0} y={0} width={depth} height={height} fill={`url(#${prefix}-right)`} fillOpacity={strength} />
      <rect x={0} y={height - depth / 2} width={width} height={depth / 2} fill={`url(#${prefix}-up)`} fillOpacity={strength / 2} />
      <rect x={width - depth / 2} y={0} width={depth / 2} height={height} fill={`url(#${prefix}-left)`} fillOpacity={strength / 2} />
    </g>
  )
}

/**
 * Points spread evenly along the boundary's middle line, about `spacing` apart, the corners included, each with the
 * direction of its side (clockwise).
 */
function posts(spacing: number) {
  const inset = boundary / 2
  const corners = [
    [-inset, -inset],
    [width + inset, -inset],
    [width + inset, height + inset],
    [-inset, height + inset],
  ]
  return corners.flatMap(([x1, y1], i) => {
    const [x2, y2] = corners[(i + 1) % 4]
    const length = Math.hypot(x2 - x1, y2 - y1)
    const count = Math.max(1, Math.round(length / spacing))
    const direction = { x: (x2 - x1) / length, y: (y2 - y1) / length }
    return Array.from({ length: count }, (_, j) => ({ x: x1 + ((x2 - x1) * j) / count, y: y1 + ((y2 - y1) * j) / count, direction }))
  })
}

/** The boundary around the room: massive walls, a hedge, a railing on the stone floor or a glass parapet on the deck. */
function Boundary({ roomStyle, colors: c, hedgeFill }: { roomStyle: RoomStyle; colors: RoomColors; hedgeFill: string }) {
  const outer = rectPath(-boundary, -boundary, width + 2 * boundary, height + 2 * boundary)
  const inner = rectPath(0, 0, width, height)
  const middle = { x: -boundary / 2, y: -boundary / 2, width: width + boundary, height: height + boundary, fill: 'none' }
  switch (roomStyle) {
    case 'Indoor':
      // Solid walls with their outer and inner face; the corners show in the band.
      return (
        <g>
          <path d={`${outer} ${inner}`} fillRule="evenodd" fill={c.wall} />
          <path d={`${outer} ${inner}`} fill="none" stroke={c.wallEdge} strokeWidth={0.5} />
        </g>
      )
    case 'Garden': {
      // A hedge: the band of leaves, its edge, and its uneven inner side that grows a little into the garden.
      // The bumps are one path each (circles with the same direction fill as their union), not hundreds of circles.
      const radius = boundary * 0.5
      const bumps = posts(boundary * 0.75).map((point) => ({
        x: round(Math.min(width, Math.max(0, point.x))),
        y: round(Math.min(height, Math.max(0, point.y))),
      }))
      const circles = (r: number) => bumps.map((bump) => ellipsePath(bump.x, bump.y, r, r, 0)).join(' ')
      return (
        <g>
          <path d={circles(radius + 0.35)} fill={c.hedge.edge} />
          <path d={`${outer} ${inner}`} fillRule="evenodd" fill={hedgeFill} />
          <path d={circles(radius)} fill={hedgeFill} />
          <path d={outer} fill="none" stroke={c.hedge.edge} strokeWidth={0.6} />
        </g>
      )
    }
    case 'Terrace':
      // A railing on the slabs: its shadow, the handrail with its light top and the posts.
      return (
        <g>
          <rect {...middle} transform={`translate(0.7 1)`} stroke={c.shadow} strokeOpacity={0.16 * c.shadowStrength} strokeWidth={1.6} />
          <rect {...middle} stroke={c.railing} strokeWidth={1.5} />
          <rect {...middle} stroke={c.railingLight} strokeWidth={0.35} />
          {posts(24).map((post, i) => (
            <rect key={i} x={post.x - 1.3} y={post.y - 1.3} width={2.6} height={2.6} fill={c.post} />
          ))}
        </g>
      )
    case 'Rooftop': {
      // A glass parapet on the deck: the glass between its two faces, the light on it, and the clamps of its panes.
      const glints = posts(22)
      return (
        <g>
          <rect {...middle} stroke={c.glass} strokeOpacity={0.85} strokeWidth={boundary * 0.5} />
          <rect
            x={-boundary * 0.75}
            y={-boundary * 0.75}
            width={width + boundary * 1.5}
            height={height + boundary * 1.5}
            fill="none"
            stroke={c.glassLine}
            strokeWidth={0.3}
          />
          <rect
            x={-boundary * 0.25}
            y={-boundary * 0.25}
            width={width + boundary * 0.5}
            height={height + boundary * 0.5}
            fill="none"
            stroke={c.glassLine}
            strokeWidth={0.3}
          />
          {glints.map(({ x, y, direction: { x: dx, y: dy } }, i) => {
            // Halfway between two points, a short glint across the glass.
            const cx = x + dx * 11
            const cy = y + dy * 11
            return (
              <line
                key={`glint-${i}`}
                x1={cx - dx * 1.2 + dy * 0.8}
                y1={cy - dy * 1.2 - dx * 0.8}
                x2={cx + dx * 1.2 - dy * 0.8}
                y2={cy + dy * 1.2 + dx * 0.8}
                stroke={c.glassGlint}
                strokeOpacity={0.7}
                strokeWidth={0.35}
              />
            )
          })}
          {posts(33).map((post, i) => (
            <rect key={i} x={post.x - 1} y={post.y - 1} width={2} height={2} fill={c.post} />
          ))}
        </g>
      )
    }
  }
}
