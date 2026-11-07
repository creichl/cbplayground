import type { CSSProperties } from 'react'
import { toMinutes } from '../../api/reservations.ts'
import type { TableBlock } from '../../api/tableBlocks.ts'

/** The neutral colour of a blocked table, apart from every status colour; on the floor plans its fill. */
export const blockColor = 'color-mix(in oklab, var(--muted-foreground) 30%, var(--card))'

/** How a block is drawn on the timeline and in the legend: hatched in the neutral colour. */
export const blockHatch: CSSProperties = {
  backgroundColor: 'var(--muted)',
  backgroundImage: `repeating-linear-gradient(135deg, ${blockColor} 0 4px, transparent 4px 9px)`,
  borderColor: 'var(--muted-foreground)',
}

/** The block of the table at `minutes`, if any. */
export function blockAt(blocks: TableBlock[], tableId: string, minutes: number) {
  return blocks.find((block) => block.tableId === tableId && toMinutes(block.start) <= minutes && minutes < toMinutes(block.end))
}
