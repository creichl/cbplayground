import { MantineProvider } from '@mantine/core'
import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { type BrandStyle, colorSchemeOf, createBrandTheme, defaultBrandStyle, loadFonts } from '../brandTheme.ts'

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
