import { use, useState } from 'react'
import { cn } from '../../lib/utils.ts'
import { Photo } from '../../ui/photo.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { HeroContext } from './layout.ts'

type RestaurantHeaderProps = {
  name: string
  city: string | null
  coverUrl: string | null
  /** One or two short facts after the city. */
  facts?: string[]
  /** Whether the restaurant is open today, as a chip below the city (openingStatus.ts); only on the booking page. */
  status?: { open: boolean; text: string } | null
  /** "page": the booking page, about 60 % of the screen high (45 % on phones); "compact": the guest's reservation; "preview": a fixed height. */
  size?: 'page' | 'compact' | 'preview'
}

/**
 * The heights of the cover image and of the band without one. In the small viewport height (svh), which does not change
 * while the browser's address bar comes and goes, so nothing below it moves.
 */
const heights = {
  page: { cover: 'h-[45svh] min-h-72 max-h-160 lg:h-[60svh]', band: 'h-56 lg:h-72' },
  compact: { cover: 'h-50 md:h-70', band: 'h-40 md:h-50' },
  preview: { cover: 'h-50', band: 'h-34' },
} as const

/**
 * The top of the restaurant's guest pages, in the full width and behind the transparent header: the cover image (cropped to
 * fit, loaded first, fading in) with a gradient towards the bottom, on it at the bottom left the name large in the display
 * font, the city and, on the booking page, a chip whether it is open today. Without cover image a calm band in the accent
 * colour; a cover image that cannot be loaded shows the band in the cover image's height, so nothing jumps. The logo is not
 * repeated here: it is in the header.
 */
export function RestaurantHeader({ name, city, coverUrl, facts = [], status = null, size = 'page' }: RestaurantHeaderProps) {
  const registerHero = use(HeroContext)
  const details = [city, ...facts].filter((part) => part !== null && part !== '')
  const [failedCover, setFailedCover] = useState<string | null>(null)
  const withCover = coverUrl !== null && failedCover !== coverUrl

  return (
    <div
      ref={size === 'preview' ? undefined : registerHero}
      className={cn(
        'relative flex items-end overflow-hidden',
        coverUrl !== null ? heights[size].cover : heights[size].band,
        withCover ? 'bg-primary-900 text-white' : 'bg-primary text-primary-foreground',
      )}
    >
      {withCover && (
        <>
          {/* Only a picture of the place: the name below says what it is. The first thing on the page, so not lazy. */}
          <Photo src={coverUrl} alt="" fallback={null} priority onError={() => setFailedCover(coverUrl)} className="absolute inset-0 bg-primary-900" />
          {/* Darkens the bottom for the name and the top for the header. */}
          <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/80 via-black/35 via-45% to-transparent to-75%" />
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/40 to-transparent" />
        </>
      )}
      <div className={cn('relative mx-auto w-full max-w-page px-4 sm:px-6', size === 'preview' ? 'pb-4' : 'pb-6 lg:pb-10')}>
        <h1
          className={cn(
            'font-display text-balance wrap-anywhere',
            size === 'page' ? 'text-4xl sm:text-5xl xl:text-6xl' : size === 'compact' ? 'text-3xl md:text-4xl' : 'text-2xl',
          )}
        >
          {name}
        </h1>
        {details.length > 0 && <p className={cn('mt-2 font-medium', size === 'preview' ? 'text-base' : 'text-lg')}>{details.join(' · ')}</p>}
        {status !== null && (
          <p
            className={cn(
              'mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium backdrop-blur-sm',
              withCover ? 'bg-black/35 text-white ring-1 ring-white/25' : 'bg-primary-foreground/15 ring-1 ring-primary-foreground/25',
            )}
          >
            {/* The text says it; the dot only repeats it. */}
            <span aria-hidden="true" className={cn('size-2 rounded-full', status.open ? 'bg-green-400' : 'bg-red-400')} />
            {status.text}
          </p>
        )}
      </div>
    </div>
  )
}

/** The cover image while the restaurant loads, in the height of the page's cover image, so nothing jumps. */
export function RestaurantHeaderSkeleton({ size = 'page' }: Pick<RestaurantHeaderProps, 'size'>) {
  const registerHero = use(HeroContext)
  return <Skeleton ref={registerHero} className={cn('rounded-none', heights[size].cover)} />
}
