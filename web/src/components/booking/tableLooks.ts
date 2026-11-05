import type { TableStyle } from '../../api/branding.ts'

/** The id of the hatching of the tables the guest cannot choose; TablePicker defines it once. */
export const unavailableHatchId = 'booking-table-hatch'

/** The state of a table in the guest's choice. */
export type TableStatus = 'free' | 'selected' | 'unavailable'

/** The badge of number and seats: on a free table on the card, on the chosen one in the accent colour, else muted. */
const badges = {
  free: { background: 'var(--card)', color: 'var(--foreground)', border: 'var(--primary)' },
  selected: { background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'var(--foreground)' },
  unavailable: { background: 'var(--muted)', color: 'var(--muted-foreground)', border: 'var(--border)' },
}

/**
 * How a table the guest can choose, has chosen or cannot choose (taken or too small) looks in each table style of the
 * restaurant (TableShape draws them), in the tokens of the design system (src/styles/app.css), so it follows the
 * restaurant's accent colour and its light or dark mode by itself. The three never differ by colour alone: the chosen table
 * has a check, the free ones an outline, halo or light in the accent colour, the others are hatched or fade to grey; the
 * badge with number and seats is readable on every table. `swatch` is the legend's sample (Tailwind classes).
 * - Classic: free outlined boldly in the accent colour and lightly filled with it; chosen filled with it; not available
 *   hatched in `muted` and `input` with a thin grey outline.
 * - Natural: wooden furniture; free with a halo in the accent colour on the floor, chosen with a filled halo, not available
 *   faded to grey without halo.
 * - Minimal: flat; free in the accent colour, chosen in the text colour, not available in `muted`.
 * - Glow: dark glass with light lines; free in the accent colour with a breathing light, chosen filled with a steady light,
 *   not available in grey lines without light.
 * The outlines keep at least 3:1 against the plan's background, the badges' text 4.5:1 against the badge.
 */
export const tableLooks: Record<
  TableStyle,
  Record<
    TableStatus,
    {
      fill: string
      stroke: string
      color: string
      strokeWidth: number
      muted?: boolean
      glow?: string
      breathe?: boolean
      swatch: string
    }
  >
> = {
  Classic: {
    free: {
      fill: 'color-mix(in srgb, var(--primary) 18%, var(--card))',
      stroke: 'var(--primary)',
      color: 'var(--foreground)',
      strokeWidth: 3,
      swatch: 'border-[3px] border-primary bg-[color-mix(in_srgb,var(--primary)_18%,var(--card))]',
    },
    selected: {
      fill: 'var(--primary)',
      stroke: 'var(--foreground)',
      color: 'var(--primary-foreground)',
      strokeWidth: 3,
      swatch: 'border-[3px] border-foreground bg-primary text-primary-foreground',
    },
    unavailable: {
      fill: `url(#${unavailableHatchId})`,
      stroke: 'var(--muted-foreground)',
      color: 'var(--muted-foreground)',
      strokeWidth: 1.5,
      swatch: 'border border-muted-foreground bg-[repeating-linear-gradient(45deg,var(--input)_0_2px,var(--muted)_2px_5px)]',
    },
  },
  Natural: {
    free: {
      fill: 'color-mix(in srgb, var(--primary) 22%, transparent)',
      stroke: 'var(--primary)',
      color: 'var(--foreground)',
      strokeWidth: 2.5,
      swatch: 'border-[3px] border-primary bg-[linear-gradient(135deg,#d6b088,#a97b51)]',
    },
    selected: {
      fill: 'color-mix(in srgb, var(--primary) 55%, transparent)',
      stroke: 'var(--foreground)',
      color: 'var(--primary-foreground)',
      strokeWidth: 3,
      swatch: 'border-[3px] border-foreground bg-primary text-primary-foreground',
    },
    unavailable: {
      fill: 'none',
      stroke: 'none',
      color: 'var(--muted-foreground)',
      strokeWidth: 0,
      muted: true,
      swatch: 'border border-muted-foreground bg-[linear-gradient(135deg,#bdbdbd,#8f8f8f)] opacity-70',
    },
  },
  Minimal: {
    free: {
      fill: 'var(--primary)',
      stroke: 'var(--primary)',
      color: 'var(--primary-foreground)',
      strokeWidth: 1.5,
      swatch: 'bg-primary',
    },
    selected: {
      fill: 'var(--foreground)',
      stroke: 'var(--foreground)',
      color: 'var(--background)',
      strokeWidth: 1.5,
      swatch: 'bg-foreground text-background',
    },
    unavailable: {
      fill: 'var(--muted)',
      stroke: 'var(--muted-foreground)',
      color: 'var(--muted-foreground)',
      strokeWidth: 1,
      swatch: 'border border-muted-foreground bg-muted',
    },
  },
  Glow: {
    free: {
      fill: 'color-mix(in srgb, var(--primary) 12%, transparent)',
      stroke: 'var(--primary)',
      color: 'var(--foreground)',
      strokeWidth: 2,
      glow: 'var(--primary)',
      breathe: true,
      swatch: 'border-2 border-primary bg-stone-900 shadow-[0_0_8px_var(--primary)]',
    },
    selected: {
      fill: 'var(--primary)',
      stroke: 'var(--primary)',
      color: 'var(--primary-foreground)',
      strokeWidth: 2.5,
      glow: 'var(--primary)',
      swatch: 'border-2 border-primary bg-primary text-primary-foreground shadow-[0_0_10px_var(--primary)]',
    },
    unavailable: {
      fill: 'none',
      stroke: 'var(--muted-foreground)',
      color: 'var(--muted-foreground)',
      strokeWidth: 1,
      muted: true,
      swatch: 'border border-muted-foreground bg-stone-900 opacity-60',
    },
  },
}

/** The props of TableShape for a table in this style and state: its look, colours, light and badge. */
export function tableLook(style: TableStyle, status: TableStatus) {
  const { swatch: _swatch, ...look } = tableLooks[style][status]
  return { look: style, ...look, badge: badges[status] }
}
