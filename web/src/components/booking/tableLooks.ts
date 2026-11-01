/** The id of the hatching of the tables the guest cannot choose; TablePicker defines it once per colour scheme. */
export const unavailableHatchId = { light: 'booking-table-hatch-light', dark: 'booking-table-hatch-dark' } as const

/**
 * How a table the guest can choose, has chosen or cannot choose (taken or too small) looks, in the light and the dark mode,
 * so the three never differ by colour alone:
 * - free: outlined boldly in the accent colour (the primary colour of the restaurant's theme) and lightly filled with it;
 * - chosen: filled with the accent colour, the number in the text colour that contrasts with it, and a check below it;
 * - not available: muted and hatched (`hatch`, a pattern TablePicker draws), with a thin grey outline.
 * The outlines keep at least 3:1 against the plan's background, the numbers 4.5:1 against the table's fill.
 */
export const tableLooks = {
  light: {
    free: {
      fill: 'color-mix(in srgb, var(--mantine-primary-color-filled) 14%, white)',
      stroke: 'var(--mantine-primary-color-filled)',
      color: 'var(--mantine-color-dark-9)',
      strokeWidth: 3,
    },
    selected: {
      fill: 'var(--mantine-primary-color-filled)',
      stroke: 'var(--mantine-color-dark-9)',
      color: 'var(--mantine-primary-color-contrast)',
      strokeWidth: 3,
    },
    unavailable: {
      fill: `url(#${unavailableHatchId.light})`,
      stroke: 'var(--mantine-color-gray-6)',
      color: 'var(--mantine-color-gray-8)',
      strokeWidth: 1.5,
    },
    hatch: { background: 'var(--mantine-color-gray-1)', stripes: 'var(--mantine-color-gray-4)' },
  },
  dark: {
    free: {
      fill: 'color-mix(in srgb, var(--mantine-primary-color-filled) 22%, var(--mantine-color-dark-7))',
      stroke: 'var(--mantine-primary-color-filled)',
      color: 'var(--mantine-color-white)',
      strokeWidth: 3,
    },
    selected: {
      fill: 'var(--mantine-primary-color-filled)',
      stroke: 'var(--mantine-color-white)',
      color: 'var(--mantine-primary-color-contrast)',
      strokeWidth: 3,
    },
    unavailable: {
      fill: `url(#${unavailableHatchId.dark})`,
      stroke: 'var(--mantine-color-dark-2)',
      color: 'var(--mantine-color-dark-0)',
      strokeWidth: 1.5,
    },
    hatch: { background: 'var(--mantine-color-dark-6)', stripes: 'var(--mantine-color-dark-4)' },
  },
}
