import { type CSSVariablesResolver, MantineProvider } from '@mantine/core'
import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { type BrandStyle, colorSchemeOf, createBrandTheme, defaultBrandStyle, filledHover, loadFonts } from '../brandTheme.ts'

/**
 * Mantine's secondary ("dimmed") text and its error text fall short of the AA contrast of 4.5:1 (gray.6 and red.6 on white,
 * dark.2 and red.8 on dark.7). On the guest pages they are darker or lighter: gray.7 and red.9 on white and gray.0, dark.1
 * and red.4 on dark.7 and dark.6. Filled buttons in the accent colour keep their text's contrast under the pointer
 * (filledHover).
 */
function cssVariablesResolver(brandColor: string | null): CSSVariablesResolver {
  const hover: Record<string, string> = brandColor !== null ? { '--mantine-color-brand-filled-hover': filledHover(brandColor) } : {}
  return () => ({
    variables: hover,
    light: { '--mantine-color-dimmed': 'var(--mantine-color-gray-7)', '--mantine-color-error': 'var(--mantine-color-red-9)', ...hover },
    dark: { '--mantine-color-dimmed': 'var(--mantine-color-dark-1)', '--mantine-color-error': 'var(--mantine-color-red-4)', ...hover },
  })
}

type BrandThemeProps = {
  /** The restaurant's branding; null while it is not known yet. */
  brandStyle: BrandStyle | null
  /** The themed area covers at least the window's height, for whole pages. */
  fullHeight?: boolean
  style?: CSSProperties
  children: ReactNode
}

/**
 * Applies a restaurant's theme (brandTheme.ts) to its children only: a nested MantineProvider whose CSS variables and
 * light or dark mode are bound to this element instead of the whole document, so the platform's pages around and after it
 * stay as they are. Dropdowns and dialogs open inside it, so they carry the theme too.
 */
export function BrandTheme({ brandStyle, fullHeight, style, children }: BrandThemeProps) {
  const id = useId()
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const { brandColor, themeMode, fontStyle } = brandStyle ?? defaultBrandStyle
  const colorScheme = colorSchemeOf(themeMode)
  const theme = useMemo(() => createBrandTheme({ brandColor, themeMode, fontStyle }, root), [brandColor, themeMode, fontStyle, root])

  useEffect(() => {
    if (brandStyle !== null) {
      void loadFonts(fontStyle)
    }
  }, [brandStyle, fontStyle])

  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={colorScheme}
      cssVariablesSelector={`[data-brand-theme="${id}"]`}
      getRootElement={() => root ?? undefined}
      withGlobalClasses={false}
      cssVariablesResolver={cssVariablesResolver(brandColor)}
    >
      <div
        ref={setRoot}
        data-brand-theme={id}
        data-mantine-color-scheme={colorScheme}
        style={{
          // What Mantine sets on the body, here for the themed area.
          colorScheme,
          backgroundColor: 'var(--mantine-color-body)',
          color: 'var(--mantine-color-text)',
          fontFamily: 'var(--mantine-font-family)',
          fontSize: 'var(--mantine-font-size-md)',
          lineHeight: 'var(--mantine-line-height)',
          minHeight: fullHeight ? '100dvh' : undefined,
          ...style,
        }}
      >
        {children}
      </div>
    </MantineProvider>
  )
}
