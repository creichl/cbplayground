/** The id of the hatching of the tables the guest cannot choose; TablePicker defines it once. */
export const unavailableHatchId = 'booking-table-hatch'

/**
 * How a table the guest can choose, has chosen or cannot choose (taken or too small) looks, in the tokens of the design
 * system (src/styles/app.css), so it follows the restaurant's accent colour and its light or dark mode by itself. The three
 * never differ by colour alone:
 * - free: outlined boldly in the accent colour (`primary`) and lightly filled with it;
 * - chosen: filled with the accent colour, the number in the text colour on it (`primary-foreground`), and a check below it;
 * - not available: hatched in `muted` and `input` (a pattern TablePicker draws), with a thin grey outline.
 * The outlines keep at least 3:1 against the plan's background, the numbers 4.5:1 against the table's fill.
 */
export const tableLooks = {
  free: {
    fill: 'color-mix(in srgb, var(--primary) 18%, var(--card))',
    stroke: 'var(--primary)',
    color: 'var(--foreground)',
    strokeWidth: 3,
  },
  selected: {
    fill: 'var(--primary)',
    stroke: 'var(--foreground)',
    color: 'var(--primary-foreground)',
    strokeWidth: 3,
  },
  unavailable: {
    fill: `url(#${unavailableHatchId})`,
    stroke: 'var(--muted-foreground)',
    color: 'var(--muted-foreground)',
    strokeWidth: 1.5,
  },
}
