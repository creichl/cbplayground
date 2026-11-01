import { Box } from '@mantine/core'
import { type CSSProperties, type ReactNode, useState } from 'react'

type PhotoProps = {
  src: string | null
  /** What the photo shows, e.g. "Area Rooftop"; empty for a photo that only decorates. */
  alt: string
  /** Shown without photo and when it cannot be loaded (404, error), so there is never a broken image. Fills the frame. */
  fallback: ReactNode
  /** The calm colour of the frame while the photo loads. */
  placeholder: string
  /** The first image of the page (a cover image): loaded right away with high priority. All others load lazily. */
  priority?: boolean
  /** Called once the photo has failed to load, e.g. to leave out what is drawn on it. */
  onError?: () => void
  /** For the image itself, e.g. a grayscale filter. */
  imageStyle?: CSSProperties
}

/**
 * A photo cropped to fill its frame, which sets the size (e.g. an AspectRatio), so nothing moves while it loads: the frame
 * shows a calm placeholder colour, the photo fades in once loaded, and a photo that cannot be loaded gives way to the
 * fallback.
 */
export function Photo({ src, alt, fallback, placeholder, priority = false, onError, imageStyle }: PhotoProps) {
  // Per source, so a new photo starts over.
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  return (
    // A grid, so the fallback fills the frame.
    <Box pos="relative" w="100%" h="100%" bg={placeholder} style={{ display: 'grid', overflow: 'hidden' }}>
      {src === null || failed === src ? (
        fallback
      ) : (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          onLoad={() => setLoaded(src)}
          onError={() => {
            setFailed(src)
            onError?.()
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded === src ? 1 : 0,
            transition: 'opacity 300ms ease',
            ...imageStyle,
          }}
        />
      )}
    </Box>
  )
}
