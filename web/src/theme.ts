import { AppShell, Card, createTheme, type MantineColorsTuple } from '@mantine/core'

// Calm, deep teal as the primary colour, from light (0) to dark (9).
const brand: MantineColorsTuple = [
  '#e9f7f5',
  '#d8ece9',
  '#acd8d1',
  '#7dc3b8',
  '#57b1a3',
  '#3fa697',
  '#30a090',
  '#218b7c',
  '#127c6e',
  '#006b5e',
]

const fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export const theme = createTheme({
  colors: { brand },
  primaryColor: 'brand',
  primaryShade: 8,
  defaultRadius: 'md',
  fontFamily,
  headings: {
    fontFamily,
    fontWeight: '650',
  },
  components: {
    AppShell: AppShell.extend({
      styles: {
        main: { backgroundColor: 'var(--mantine-color-gray-0)' },
      },
    }),
    Card: Card.extend({
      defaultProps: {
        withBorder: true,
        shadow: 'xs',
        padding: 'lg',
      },
    }),
  },
})
