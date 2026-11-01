/**
 * The colours of a table the guest can choose, has chosen or cannot choose (taken or too small), in the light and the dark
 * mode. The chosen table carries the accent colour (the primary colour of the restaurant's theme) with the text colour that
 * contrasts with it; free tables are outlined in it, taken ones stay grey.
 */
export const tableLooks = {
  light: {
    free: { fill: 'white', stroke: 'var(--mantine-primary-color-filled)', color: 'var(--mantine-color-dark-7)', strokeWidth: 2.5 },
    selected: {
      fill: 'var(--mantine-primary-color-filled)',
      stroke: 'var(--mantine-color-brand-9)',
      color: 'var(--mantine-primary-color-contrast)',
      strokeWidth: 2.5,
    },
    unavailable: { fill: 'var(--mantine-color-gray-2)', stroke: 'var(--mantine-color-gray-4)', color: 'var(--mantine-color-gray-6)', strokeWidth: 1 },
  },
  dark: {
    free: { fill: 'var(--mantine-color-dark-6)', stroke: 'var(--mantine-primary-color-filled)', color: 'var(--mantine-color-white)', strokeWidth: 2.5 },
    selected: {
      fill: 'var(--mantine-primary-color-filled)',
      stroke: 'var(--mantine-color-white)',
      color: 'var(--mantine-primary-color-contrast)',
      strokeWidth: 2.5,
    },
    unavailable: { fill: 'var(--mantine-color-dark-5)', stroke: 'var(--mantine-color-dark-3)', color: 'var(--mantine-color-dark-1)', strokeWidth: 1 },
  },
}
