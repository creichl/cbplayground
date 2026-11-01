import { type ReactNode, useState } from 'react'
import { cn } from '../lib/utils.ts'

const ratios = { '4/3': 'aspect-4/3', '16/9': 'aspect-video' } as const

type PhotoProps = {
  src: string | null
  /** What the photo shows, e.g. "Area Rooftop"; empty for a photo that only decorates. */
  alt: string
  /** Shown without photo and when it cannot be loaded (404, error), so there is never a broken image. Fills the frame. */
  fallback: ReactNode
  /** The frame's aspect ratio; without one the frame fills its parent, which sets the size. */
  ratio?: keyof typeof ratios
  /** The first image of the page (e.g. the first card): loaded right away with high priority. All others load lazily. */
  priority?: boolean
  /** Called once the photo has failed to load, e.g. to leave out what is drawn on it. */
  onError?: () => void
  /** The frame, e.g. its corners and the calm placeholder colour while the photo loads (default the muted surface). */
  className?: string
  /** The image itself, e.g. a zoom on hover. */
  imageClassName?: string
}

/**
 * A photo cropped to fill its frame of fixed size, so nothing moves while it loads: the frame shows a calm placeholder
 * colour, the photo fades in once loaded, and a photo that cannot be loaded gives way to the fallback.
 */
function Photo({ src, alt, fallback, ratio, priority = false, onError, className, imageClassName }: PhotoProps) {
  // Per source, so a new photo starts over.
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  return (
    // A grid, so the fallback fills the frame.
    <div data-slot="photo" className={cn('relative grid overflow-hidden bg-muted', ratio !== undefined ? ratios[ratio] : 'size-full', className)}>
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
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-(--motion-slow)',
            loaded === src ? 'opacity-100' : 'opacity-0',
            imageClassName,
          )}
        />
      )}
    </div>
  )
}

export { Photo }
