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

/**
 * The drawn chair, within the chair space: its width along the table, its depth (seat and backrest) and its distance to the
 * table. Only the web draws them; the API only keeps the chair space free.
 */
export const chairWidth = 0.024
export const chairDepth = 0.016
export const chairGap = 0.002

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

/**
 * A chair: its centre relative to the table's centre and its turn in degrees, clockwise: at 0 it stands above the table
 * with its backrest at the top, away from the table; 90 right of it, 180 below it, 270 left of it, round tables in between.
 */
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
  const bottom = { length: width, place: (along: number) => ({ x: along, y: height / 2 + offset, angle: 180 }) }
  const left = { length: height, place: (along: number) => ({ x: -width / 2 - offset, y: along, angle: 270 }) }
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
export const roomBoundary = 0.016

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
 * The colours of the drawn room in the light and the dark mode, like a rendered plan view: floors with their tones (one per
 * plank, slab or pebble), grain and joints, the boundaries, the furniture and the shadows. The room is the background: muted,
 * so the tables and their state keep the strongest contrasts; the restaurant's accent colour belongs to the tables, not to
 * the room. The light floors stay light, so dark table edges stand out on all of them, and the dark ones stay dark.
 */
export const roomColors = {
  light: {
    floor: {
      // Oak planks.
      Indoor: {
        base: '#e8dbc6',
        tones: ['#ebdfcc', '#e6d8c2', '#eee3d2', '#e3d4bc', '#e9dcc8', '#e5d6c0'],
        grain: '#c8b291',
        joint: '#c9b597',
      },
      // Stone slabs.
      Terrace: {
        base: '#e4e1da',
        tones: ['#e8e5df', '#dfdbd3', '#ebe8e3', '#dbd7ce', '#e4e0d8'],
        grain: '#ccc7bc',
        joint: '#c4beb3',
      },
      // A wooden deck.
      Rooftop: {
        base: '#d6c1a3',
        tones: ['#dbc7aa', '#d3bd9e', '#dfccb1', '#cfb897'],
        grain: '#bba17c',
        joint: '#ab9172',
      },
      // Gravel; the lawn runs along the hedge.
      Garden: {
        base: '#e2dccf',
        tones: ['#d6cdbb', '#cbc1ad', '#ece7dc', '#c2b7a2', '#ddd4c4'],
        grain: '#b9ad96',
        joint: '#cfc6b5',
      },
    },
    lawn: { base: '#c3d4a8', tones: ['#b3c897', '#a8bf8b', '#cfdeb8', '#bacd9f'] },
    hedge: { base: '#7d9c66', leaves: ['#8cab72', '#6d8c57', '#9fbc84', '#78985f'], edge: '#5c7a48' },
    wall: '#575e63',
    wallEdge: '#3c4246',
    railing: '#7f888e',
    railingLight: '#c3c9cc',
    post: '#5e676c',
    glass: '#bcd5df',
    glassLine: '#7a929d',
    glassGlint: '#ffffff',
    window: '#e9f2f6',
    windowLine: '#7f9cab',
    door: '#8a705b',
    doorSwing: '#8a9399',
    threshold: '#d6d0c6',
    wood: '#a78468',
    woodLight: '#c4a587',
    woodDark: '#7e604a',
    woodLine: '#6f5442',
    bottles: ['#7a9a6a', '#b88a4a', '#8e6a8c', '#6f8fa8'],
    stool: '#5f5148',
    stoolTop: '#857463',
    leaf: '#7fa266',
    leafLight: '#9dbd82',
    leafDark: '#5f804b',
    pot: '#a7856c',
    potRim: '#c19f86',
    soil: '#6c5646',
    pillar: '#62696e',
    pillarLight: '#7c8489',
    sofa: '#cdbfae',
    sofaBack: '#b6a690',
    sofaLine: '#9c8b76',
    cushion: '#d9cdbe',
    pillow: '#a9927a',
    stage: '#d9c8ad',
    stageBoard: '#cdb999',
    stageEdge: '#b39c7a',
    stageLine: '#9a8364',
    service: '#d9dcde',
    serviceTop: '#eceeef',
    servicePass: '#c3c8cb',
    serviceLine: '#9ea5aa',
    sink: '#b8c0c5',
    stairs: '#e1dbd1',
    stairsAlt: '#d7d0c4',
    stairsLine: '#9d9386',
    text: '#5f5a53',
    shadow: '#2a2016',
    /** Multiplies the opacity of all shadows. */
    shadowStrength: 1,
  },
  dark: {
    floor: {
      Indoor: {
        base: '#36302a',
        tones: ['#39322b', '#332d27', '#3d362e', '#302a24', '#37302a', '#342e28'],
        grain: '#463d34',
        joint: '#29241f',
      },
      Terrace: {
        base: '#33332f',
        tones: ['#363632', '#30302c', '#393935', '#2e2e2a', '#343430'],
        grain: '#42423d',
        joint: '#262623',
      },
      Rooftop: {
        base: '#3a3129',
        tones: ['#3d342b', '#372e26', '#41372e', '#342b23'],
        grain: '#4a3f34',
        joint: '#231d18',
      },
      Garden: {
        base: '#35322c',
        tones: ['#3e3a33', '#2f2c27', '#454039', '#2a2722', '#3a362f'],
        grain: '#4a453d',
        joint: '#2c2924',
      },
    },
    lawn: { base: '#2c3826', tones: ['#33402b', '#283322', '#3a4831', '#2f3b28'] },
    hedge: { base: '#34472c', leaves: ['#3c5233', '#2c3d25', '#46603b', '#33482b'], edge: '#24321e' },
    wall: '#4b5155',
    wallEdge: '#63696d',
    railing: '#6f787d',
    railingLight: '#8b9499',
    post: '#5a6267',
    glass: '#3c4d55',
    glassLine: '#6e828c',
    glassGlint: '#a9bcc5',
    window: '#4a5d66',
    windowLine: '#7d939e',
    door: '#7a6656',
    doorSwing: '#7f878c',
    threshold: '#4a4640',
    wood: '#5e4a3b',
    woodLight: '#715946',
    woodDark: '#47372b',
    woodLine: '#836a55',
    bottles: ['#5d7a52', '#8a6a3d', '#6e5470', '#506d82'],
    stool: '#2c2621',
    stoolTop: '#4d4238',
    leaf: '#4a6340',
    leafLight: '#5b784e',
    leafDark: '#384d30',
    pot: '#6a5545',
    potRim: '#7d6553',
    soil: '#2e2620',
    pillar: '#5b6266',
    pillarLight: '#6c7378',
    sofa: '#4a433b',
    sofaBack: '#3d3730',
    sofaLine: '#5f564c',
    cushion: '#554d44',
    pillow: '#6b5c4d',
    stage: '#433a31',
    stageBoard: '#4b4137',
    stageEdge: '#2f2822',
    stageLine: '#5c5045',
    service: '#383b3e',
    serviceTop: '#44484b',
    servicePass: '#2e3133',
    serviceLine: '#5a5f63',
    sink: '#2a2d30',
    stairs: '#3a3631',
    stairsAlt: '#34302b',
    stairsLine: '#6b645a',
    text: '#b9b2a8',
    shadow: '#000000',
    shadowStrength: 1.6,
  },
}

export type RoomColors = (typeof roomColors)['light']

/**
 * The thin edge around every table, outside its outline: dark on the light floors, light on the dark ones. It keeps the
 * table's edge at least 3:1 against every floor (and most plan images), whatever the accent or status colour of the table.
 */
export const tableRim = { light: 'rgba(28, 24, 20, 0.75)', dark: 'rgba(244, 239, 231, 0.72)' }
