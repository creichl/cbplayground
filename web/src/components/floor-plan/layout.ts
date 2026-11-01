import type { RoomElement, RoomElementKind, RoomRotation, TableRotation, TableShape } from '../../api/areas.ts'

// The sizes of the drawn tables, with the same constants as the API (api/Cbplayground.Api/FloorPlans/TableLayout.cs),
// so the API's arrangement appears without overlaps. Sizes are fractions of the plan width at a table scale of 100 %.

/** Width : height of the schematic plan of an area without floor plan image. */
export const aspectRatio = 3 / 2

/** Length of a table per seat: a table for 4 is 7 % of the plan width. */
const sizePerSeat = 0.0175

/** The smallest round or square table (diameter or side). */
const minTableSize = 0.05

/** The short side of a rectangular table. */
const rectangleDepth = 0.06

/** The shortest long side of a rectangular table. */
const rectangleMinLength = 0.08

/** Room for the chairs on every side of a table. */
export const chairSpace = 0.02

/** The drawn chair, within the chair space: its width along the table, its depth and its distance to the table. */
export const chairWidth = 0.022
export const chairDepth = 0.013
export const chairGap = 0.003

/** Below this distance between their centres, the chairs on a side of a rectangular table do not fit any more. */
const chairPitch = 0.028

/** Width and height of the table in plan widths, without the chairs; at 90° a rectangular table stands upright. */
export function tableSize(shape: TableShape, seats: number, rotation: TableRotation, tableScale: number) {
  const scale = tableScale / 100
  if (shape !== 'Rectangle') {
    const size = Math.max(minTableSize, sizePerSeat * seats) * scale
    return { width: size, height: size }
  }
  const length = Math.max(rectangleMinLength, sizePerSeat * seats) * scale
  const depth = rectangleDepth * scale
  return rotation === 90 ? { width: depth, height: length } : { width: length, height: depth }
}

/** A chair: its centre relative to the table's centre and its turn in degrees (0: above or below the table). */
export type Chair = { x: number; y: number; angle: number }

/**
 * The chairs around a table of `width` × `height` (at a table scale of 100 %), one per seat. Round tables have them evenly
 * in a circle; square tables on all four sides in turn; rectangular ones on the long sides first, on the short sides only
 * when the long sides are full.
 */
export function chairs(shape: TableShape, seats: number, width: number, height: number): Chair[] {
  const offset = chairGap + chairDepth / 2
  if (shape === 'Round') {
    const radius = width / 2 + offset
    return Array.from({ length: seats }, (_, i) => {
      const angle = (360 * i) / seats
      const radians = ((angle - 90) * Math.PI) / 180
      return { x: radius * Math.cos(radians), y: radius * Math.sin(radians), angle }
    })
  }

  // The four sides: along the width (top, bottom) and along the height (left, right).
  const top = { length: width, place: (along: number) => ({ x: along, y: -height / 2 - offset, angle: 0 }) }
  const bottom = { length: width, place: (along: number) => ({ x: along, y: height / 2 + offset, angle: 0 }) }
  const left = { length: height, place: (along: number) => ({ x: -width / 2 - offset, y: along, angle: 90 }) }
  const right = { length: height, place: (along: number) => ({ x: width / 2 + offset, y: along, angle: 90 }) }
  const sides = width >= height ? [top, bottom, left, right] : [left, right, top, bottom]
  const counts = [0, 0, 0, 0]

  if (shape === 'Square') {
    for (let i = 0; i < seats; i++) {
      counts[i % 4]++
    }
  } else {
    const perLongSide = Math.max(1, Math.floor(sides[0].length / chairPitch))
    for (let i = 0; i < seats; i++) {
      if (counts[0] + counts[1] < 2 * perLongSide) {
        counts[counts[0] <= counts[1] ? 0 : 1]++
      } else {
        counts[counts[2] <= counts[3] ? 2 : 3]++
      }
    }
  }

  return sides.flatMap((side, s) =>
    Array.from({ length: counts[s] }, (_, j) => side.place(-side.length / 2 + (side.length * (j + 0.5)) / counts[s])),
  )
}

// The room of an area without floor plan image, with the same constants as the API (api/Cbplayground.Api/Data/RoomElement.cs).

/** The kinds of room elements in the order of the editor's palette. */
export const roomElementKinds: RoomElementKind[] = ['Entrance', 'Window', 'Bar', 'Plant', 'Pillar', 'Sofa', 'Stage', 'Service', 'Stairs', 'Label']

/** The size of a new element: its length along the wall and its depth into the room, both in plan widths. */
export const roomElementDimensions: Record<RoomElementKind, { length: number; depth: number }> = {
  Entrance: { length: 0.1, depth: 0.03 },
  Window: { length: 0.16, depth: 0.02 },
  Bar: { length: 0.3, depth: 0.1 },
  Plant: { length: 0.05, depth: 0.05 },
  Pillar: { length: 0.04, depth: 0.04 },
  Sofa: { length: 0.16, depth: 0.06 },
  Stage: { length: 0.3, depth: 0.15 },
  Service: { length: 0.14, depth: 0.08 },
  Stairs: { length: 0.1, depth: 0.16 },
  Label: { length: 0.24, depth: 0.04 },
}

/** The most room elements an area can have. */
export const maxRoomElements = 60

/** The longest label of a room element. */
export const maxRoomElementLabelLength = 40

/** Thickness of the wall, railing or hedge around the room, in plan widths; it lies outside the room, around the plan. */
export const roomBoundary = 0.012

/**
 * `width` and `height` of an element of `length` along the wall and `depth` (in plan widths) at this rotation, as the API
 * stores them: fractions of the plan width and height. At 0° and 180° the length lies horizontal, at 90° and 270° vertical.
 */
export function roomElementSize(length: number, depth: number, rotation: RoomRotation) {
  return rotation === 90 || rotation === 270
    ? { width: depth, height: length * aspectRatio }
    : { width: length, height: depth * aspectRatio }
}

/** Length along the wall and depth into the room of an element, in plan widths; the reverse of roomElementSize. */
export function roomElementDimensionsOf(element: Pick<RoomElement, 'width' | 'height' | 'rotation'>) {
  return element.rotation === 90 || element.rotation === 270
    ? { length: element.height / aspectRatio, depth: element.width }
    : { length: element.width, depth: element.height / aspectRatio }
}

/** Keeps an element's centre so that the whole element lies in the room. */
export function clampToRoom(position: number, size: number) {
  return Math.min(1 - size / 2, Math.max(size / 2, position))
}

/**
 * The colours of the drawn room in the light and the dark mode. The room is the background: muted, so the tables and their
 * state keep the strongest contrasts; the restaurant's accent colour belongs to the tables, not to the room.
 */
export const roomColors = {
  light: {
    floor: {
      Indoor: { base: '#f2ece3', line: '#e3d9cb' },
      Terrace: { base: '#ebe8e2', line: '#d9d5cd' },
      Rooftop: { base: '#ece2d3', line: '#dacbb6' },
      Garden: { base: '#e5ecdb', line: '#d1dcc3' },
    },
    wall: '#4b565d',
    railing: '#8e979d',
    glass: '#d6e4ea',
    glassLine: '#8a98a0',
    hedge: '#a3bd90',
    hedgeLine: '#8aa676',
    window: '#f4f8fa',
    windowLine: '#98b2c0',
    door: '#8a9399',
    wood: '#b99a80',
    woodLight: '#cdb39c',
    woodLine: '#9a7c64',
    plant: '#a5c092',
    plantLight: '#bcd2ab',
    pot: '#8f7764',
    pillar: '#7b858b',
    sofa: '#d3c8bb',
    sofaBack: '#bfb2a2',
    sofaLine: '#ab9d8c',
    stage: '#e4dccf',
    stageEdge: '#d2c6b5',
    stageLine: '#b8aa97',
    service: '#e6e3de',
    servicePass: '#cfc9c0',
    serviceLine: '#b3ada4',
    stairs: '#e3dcd1',
    stairsLine: '#a99f92',
    text: '#6b665f',
  },
  dark: {
    floor: {
      Indoor: { base: '#2c2a27', line: '#37342f' },
      Terrace: { base: '#2b2c2d', line: '#393b3d' },
      Rooftop: { base: '#302b26', line: '#3e3730' },
      Garden: { base: '#262c25', line: '#323b30' },
    },
    wall: '#737c82',
    railing: '#7d868c',
    glass: '#3b4a52',
    glassLine: '#7a8a93',
    hedge: '#4f6546',
    hedgeLine: '#627b57',
    window: '#b7c9d3',
    windowLine: '#6c8693',
    door: '#8a9399',
    wood: '#6c5545',
    woodLight: '#7e6553',
    woodLine: '#8c705b',
    plant: '#4f6646',
    plantLight: '#5f7a55',
    pot: '#7a6655',
    pillar: '#737c82',
    sofa: '#4b453e',
    sofaBack: '#5a5249',
    sofaLine: '#6d6359',
    stage: '#3a352f',
    stageEdge: '#454039',
    stageLine: '#5d554b',
    service: '#35383b',
    servicePass: '#44484c',
    serviceLine: '#5d6266',
    stairs: '#3b3732',
    stairsLine: '#706960',
    text: '#b4ada3',
  },
}

export type RoomColors = (typeof roomColors)['light']
