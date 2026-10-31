import type { TableRotation, TableShape } from '../../api/areas.ts'

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
