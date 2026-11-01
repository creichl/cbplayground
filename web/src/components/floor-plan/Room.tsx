import { useId } from 'react'
import type { RoomElement, RoomStyle } from '../../api/areas.ts'
import { roomBoundary, roomColors, type RoomColors } from './layout.ts'
import { planUnits, RoomElementShape } from './RoomElementShape.tsx'

const width = planUnits
const height = (planUnits * 2) / 3
const boundary = roomBoundary * planUnits

type RoomProps = {
  roomStyle: RoomStyle
  elements: Pick<RoomElement, 'id' | 'kind' | 'posX' | 'posY' | 'width' | 'height' | 'rotation' | 'label'>[]
  dark: boolean
  /** The part of the drawing to show, in its units (the room is 300 × 200); by default the room with its boundary. */
  viewBox?: string
}

/**
 * The drawn room of an area without floor plan image, in plan view like an architect's plan: the floor of its style as a
 * muted pattern, the boundary around it (walls, railing, glass parapet or hedge, outside the plan, so the positions refer to
 * the whole room) and the room elements in their order. It is decorative and the background of the tables: it ignores the
 * pointer and is hidden from assistive technology.
 */
export function Room({ roomStyle, elements, dark, viewBox }: RoomProps) {
  // Patterns need an id that is unique on the page; useId may contain characters that do not work in url().
  const patternId = `room-floor-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const colors = roomColors[dark ? 'dark' : 'light']
  const floor = colors.floor[roomStyle]
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
        <FloorPattern id={patternId} roomStyle={roomStyle} base={floor.base} line={floor.line} />
      </defs>
      <Boundary roomStyle={roomStyle} colors={colors} />
      <rect x={0} y={0} width={width} height={height} fill={`url(#${patternId})`} />
      {(roomStyle === 'Terrace' || roomStyle === 'Rooftop') && <BoundaryLine roomStyle={roomStyle} colors={colors} />}
      {elements.map((element) => (
        <RoomElementShape key={element.id} element={element} colors={colors} floor={floor.base} />
      ))}
    </svg>
  )
}

/** A small symbol of a room style for the editor: a corner of the room with its floor and boundary. */
export function RoomStylePreview({ roomStyle, size = 36 }: { roomStyle: RoomStyle; size?: number }) {
  return (
    <span style={{ display: 'block', width: size, height: (size * 2) / 3, flexShrink: 0, borderRadius: 2, overflow: 'hidden' }}>
      <Room roomStyle={roomStyle} elements={[]} dark={false} viewBox={`${-boundary * 2} ${-boundary * 2} 60 40`} />
    </span>
  )
}

type FloorPatternProps = { id: string; roomStyle: RoomStyle; base: string; line: string }

/** The floor as a quiet pattern: parquet, stone slabs, a wooden deck or lawn. */
function FloorPattern({ id, roomStyle, base, line }: FloorPatternProps) {
  switch (roomStyle) {
    case 'Indoor':
      // Parquet: rows of planks with staggered joints.
      return (
        <pattern id={id} width={40} height={12} patternUnits="userSpaceOnUse">
          <rect width={40} height={12} fill={base} />
          <path d="M 0 0 H 40 M 0 6 H 40 M 0 0 V 6 M 20 6 V 12" stroke={line} strokeWidth={0.5} fill="none" />
        </pattern>
      )
    case 'Terrace':
      // Square stone slabs.
      return (
        <pattern id={id} width={25} height={25} patternUnits="userSpaceOnUse">
          <rect width={25} height={25} fill={base} />
          <path d="M 0 0 H 25 M 0 0 V 25" stroke={line} strokeWidth={0.6} fill="none" />
        </pattern>
      )
    case 'Rooftop':
      // Long deck boards.
      return (
        <pattern id={id} width={60} height={10} patternUnits="userSpaceOnUse">
          <rect width={60} height={10} fill={base} />
          <path d="M 0 0 H 60 M 0 5 H 60 M 0 0 V 5 M 30 5 V 10" stroke={line} strokeWidth={0.45} fill="none" />
        </pattern>
      )
    case 'Garden':
      // Lawn with a fine grain.
      return (
        <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse">
          <rect width={10} height={10} fill={base} />
          <circle cx={2} cy={3} r={0.6} fill={line} />
          <circle cx={7} cy={8} r={0.6} fill={line} />
          <circle cx={8} cy={2} r={0.4} fill={line} />
        </pattern>
      )
  }
}

/** The band around the room, drawn below the floor: walls, a hedge, or the light ground of a railing or parapet. */
function Boundary({ roomStyle, colors }: { roomStyle: RoomStyle; colors: RoomColors }) {
  const outer = { x: -boundary, y: -boundary, width: width + 2 * boundary, height: height + 2 * boundary }
  switch (roomStyle) {
    case 'Indoor':
      return <rect {...outer} fill={colors.wall} />
    case 'Garden':
      return <rect {...outer} rx={boundary} fill={colors.hedge} stroke={colors.hedgeLine} strokeWidth={0.6} />
    case 'Rooftop':
      return <rect {...outer} fill={colors.glass} />
    case 'Terrace':
      return null
  }
}

/** The thin line of a railing with its posts, or the edges of a glass parapet, drawn on the band around the floor. */
function BoundaryLine({ roomStyle, colors }: { roomStyle: 'Terrace' | 'Rooftop'; colors: RoomColors }) {
  const middle = { x: -boundary / 2, y: -boundary / 2, width: width + boundary, height: height + boundary, fill: 'none' }
  if (roomStyle === 'Terrace') {
    return (
      <g>
        <rect {...middle} stroke={colors.railing} strokeWidth={0.8} />
        <rect {...middle} stroke={colors.railing} strokeWidth={2.2} strokeDasharray="1.6 18.4" />
      </g>
    )
  }
  return (
    <g>
      <rect x={-boundary} y={-boundary} width={width + 2 * boundary} height={height + 2 * boundary} fill="none" stroke={colors.glassLine} strokeWidth={0.6} />
      <rect x={0} y={0} width={width} height={height} fill="none" stroke={colors.glassLine} strokeWidth={0.4} />
    </g>
  )
}
