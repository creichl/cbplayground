import { Box } from '@mantine/core'
import { type ReactNode, useState } from 'react'

/**
 * Whether a loaded image has an opaque background (a logo on white, a JPEG), found by its four corners: "light" or "dark" by
 * their average brightness; null when they are transparent. Null as well when the image cannot be read: an image from
 * another origin taints the canvas. The logos come from the API, so from the same origin.
 */
function opaqueBackground(image: HTMLImageElement) {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) {
    return null
  }
  try {
    context.drawImage(image, 0, 0, size, size)
    const corners = [
      [0, 0],
      [size - 1, 0],
      [0, size - 1],
      [size - 1, size - 1],
    ].map(([x, y]) => context.getImageData(x, y, 1, 1).data)
    if (corners.some((pixel) => pixel[3] < 250)) {
      return null
    }
    // Relative brightness after ITU-R BT.601, 0–255.
    const brightness = corners.reduce((sum, [r, g, b]) => sum + 0.299 * r + 0.587 * g + 0.114 * b, 0) / corners.length
    return brightness >= 128 ? 'light' : 'dark'
  } catch {
    return null
  }
}

/**
 * The surface of a logo with an opaque background: a calm tint of the accent colour, light for a light background, dark for
 * a dark one. The logo is blended into it (multiply on light, screen on dark), so its own background takes the surface's
 * colour and no rectangle shows inside the surface.
 */
const surfaces = {
  light: { background: (accent: string) => `color-mix(in srgb, ${accent} 14%, white)`, blend: 'multiply' },
  dark: { background: (accent: string) => `color-mix(in srgb, ${accent} 18%, #141414)`, blend: 'screen' },
} as const

type BrandLogoProps = {
  src: string
  /** The height the logo takes, with or without surface; its width follows the aspect ratio up to `maxWidth`. */
  height: number
  maxWidth: number
  /** The colour the surface of a logo with an opaque background is tinted with; the theme's accent colour by default. */
  accent?: string
  /** On a photo: a transparent logo gets a soft shadow so it stands out from the picture. */
  onPhoto?: boolean
  /** Shown instead when the logo cannot be loaded, e.g. the restaurant's name. */
  fallback?: ReactNode
  loading?: 'eager' | 'lazy'
}

/**
 * A restaurant's logo without box: in a fixed height, the width by its aspect ratio. A logo with an opaque background (found
 * by its corners once it has loaded) stands on a calm surface tinted with the accent colour, with generous padding, its own
 * background blended into it, so on a dark page it looks like a badge rather than a white rectangle. It fades in once loaded
 * and known; a logo that cannot be loaded shows `fallback`, never a broken image.
 */
export function BrandLogo({
  src,
  height,
  maxWidth,
  accent = 'var(--mantine-primary-color-filled)',
  onPhoto = false,
  fallback = null,
  loading = 'eager',
}: BrandLogoProps) {
  // Per source, so a new logo is measured anew.
  const [result, setResult] = useState<{ src: string; background: 'light' | 'dark' | null; failed: boolean } | null>(null)
  const current = result?.src === src ? result : null

  if (current?.failed === true) {
    return fallback
  }

  const background = current?.background ?? null
  const surface = background !== null ? surfaces[background] : null
  const paddingY = surface !== null ? Math.round(height * 0.15) : 0
  const paddingX = paddingY * 2

  return (
    <Box
      component="span"
      h={height}
      maw={maxWidth}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        padding: `${paddingY}px ${paddingX}px`,
        backgroundColor: surface?.background(accent),
        // The logo blends with the surface only, not with the page behind it.
        isolation: 'isolate',
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: surface !== null && onPhoto ? 'var(--mantine-shadow-sm)' : undefined,
      }}
    >
      <img
        src={src}
        alt=""
        loading={loading}
        decoding="async"
        onLoad={(event) => setResult({ src, background: opaqueBackground(event.currentTarget), failed: false })}
        onError={() => setResult({ src, background: null, failed: true })}
        style={{
          display: 'block',
          height: height - 2 * paddingY,
          width: 'auto',
          maxWidth: '100%',
          objectFit: 'contain',
          opacity: current !== null ? 1 : 0,
          transition: 'opacity 200ms ease',
          mixBlendMode: surface?.blend,
          filter: onPhoto && surface === null ? 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5))' : undefined,
        }}
      />
    </Box>
  )
}
