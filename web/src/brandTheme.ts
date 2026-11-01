import { generateColors } from '@mantine/colors-generator'
import { AppShell, createTheme, DEFAULT_THEME, luminance, type MantineColorShade, Portal } from '@mantine/core'
import type { Branding, FontStyle, ThemeMode } from './api/branding.ts'

// The theme of a restaurant's guest pages (/r/<slug>, its reservations and /embed/<slug>), built from its branding on top of
// the platform theme (theme.ts). It only applies inside BrandTheme; admin, front desk, Superadmin, login and the start page
// keep the platform theme.

/** The branding the theme is made of; logo and cover image are not part of the theme. */
export type BrandStyle = Pick<Branding, 'brandColor' | 'themeMode' | 'fontStyle'>

/** The look of a restaurant without branding: the platform's colour, light, the default font style. */
export const defaultBrandStyle: BrandStyle = { brandColor: null, themeMode: 'Light', fontStyle: 'Modern' }

const fallbackFonts = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

/**
 * The fonts behind each font style: heading and text. All are self-hosted (@fontsource, OFL) and cover Latin, Latin
 * Extended and Cyrillic, so all four languages, Serbian Cyrillic included, appear in them.
 */
export const fontPairs: Record<FontStyle, { heading: string; body: string; headingWeight: string }> = {
  Modern: { heading: 'Inter', body: 'Inter', headingWeight: '700' },
  Classic: { heading: 'Playfair Display', body: 'Source Sans 3', headingWeight: '700' },
  Elegant: { heading: 'Cormorant Garamond', body: 'Montserrat', headingWeight: '600' },
  Rustic: { heading: 'Merriweather', body: 'Open Sans', headingWeight: '700' },
  Urban: { heading: 'Montserrat', body: 'Inter', headingWeight: '700' },
}

/**
 * Loads the fonts of a style, only when a restaurant uses it, so the main bundle does not carry them. The text fonts come
 * in the weights Mantine uses (400–700), the heading fonts in their heading weight. Each file holds all subsets; the browser
 * only downloads those of the characters on the page.
 */
const fontLoaders: Record<FontStyle, () => Promise<unknown>> = {
  Modern: () =>
    Promise.all([
      import('@fontsource/inter/400.css'),
      import('@fontsource/inter/500.css'),
      import('@fontsource/inter/600.css'),
      import('@fontsource/inter/700.css'),
    ]),
  Classic: () =>
    Promise.all([
      import('@fontsource/playfair-display/700.css'),
      import('@fontsource/source-sans-3/400.css'),
      import('@fontsource/source-sans-3/500.css'),
      import('@fontsource/source-sans-3/600.css'),
      import('@fontsource/source-sans-3/700.css'),
    ]),
  Elegant: () =>
    Promise.all([
      import('@fontsource/cormorant-garamond/600.css'),
      import('@fontsource/montserrat/400.css'),
      import('@fontsource/montserrat/500.css'),
      import('@fontsource/montserrat/600.css'),
      import('@fontsource/montserrat/700.css'),
    ]),
  Rustic: () =>
    Promise.all([
      import('@fontsource/merriweather/700.css'),
      import('@fontsource/open-sans/400.css'),
      import('@fontsource/open-sans/500.css'),
      import('@fontsource/open-sans/600.css'),
      import('@fontsource/open-sans/700.css'),
    ]),
  Urban: () =>
    Promise.all([
      import('@fontsource/montserrat/700.css'),
      import('@fontsource/inter/400.css'),
      import('@fontsource/inter/500.css'),
      import('@fontsource/inter/600.css'),
      import('@fontsource/inter/700.css'),
    ]),
}

const loadedFonts = new Map<FontStyle, Promise<unknown>>()

/** Loads the fonts of a style once; a failed load is tried again next time, the fallback fonts show meanwhile. */
export function loadFonts(fontStyle: FontStyle) {
  let loading = loadedFonts.get(fontStyle)
  if (loading === undefined) {
    loading = fontLoaders[fontStyle]().catch(() => loadedFonts.delete(fontStyle))
    loadedFonts.set(fontStyle, loading)
  }
  return loading
}

/** The CSS font stack of a font, with the platform's fonts as fallback while it loads. */
export function fontStack(font: string) {
  return `"${font}", ${fallbackFonts}`
}

export function colorSchemeOf(themeMode: ThemeMode) {
  return themeMode === 'Dark' ? 'dark' : 'light'
}

/** The page background of each mode, as Mantine draws it (white, dark.7), for the contrast check of the accent colour. */
export const backgrounds = { light: DEFAULT_THEME.white, dark: DEFAULT_THEME.colors.dark[7] } as const

/** The contrast ratio of two colours after WCAG, 1–21. */
export function contrastRatio(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * The theme of a restaurant: a palette made from the accent colour, whose own shade is the primary shade (so buttons and the
 * chosen table carry exactly that colour), the text on it chosen by contrast, and the fonts of its style. Without accent
 * colour the platform's colour stays. `portalTarget` is where dropdowns and dialogs open, inside the themed area.
 */
export function createBrandTheme(style: BrandStyle, portalTarget: HTMLElement | null) {
  const fonts = fontPairs[style.fontStyle]
  const dark = style.themeMode === 'Dark'
  let colors = {}
  if (style.brandColor !== null) {
    // The generator keeps the colour itself as one of the ten shades, the one closest to its lightness.
    const palette = generateColors(style.brandColor)
    const shade = Math.max(0, palette.indexOf(style.brandColor.toLowerCase())) as MantineColorShade
    // A number, like the platform's primary shade: Mantine cannot merge an object into a number.
    colors = { colors: { brand: palette }, primaryShade: shade, autoContrast: true }
  }

  return createTheme({
    ...colors,
    fontFamily: fontStack(fonts.body),
    headings: { fontFamily: fontStack(fonts.heading), fontWeight: fonts.headingWeight },
    components: {
      AppShell: AppShell.extend({
        styles: {
          // The platform's light grey behind the cards; in the dark mode the page's own background.
          main: { backgroundColor: dark ? 'var(--mantine-color-body)' : 'var(--mantine-color-gray-0)' },
        },
      }),
      Portal: Portal.extend({ defaultProps: { target: portalTarget ?? undefined } }),
    },
  })
}
