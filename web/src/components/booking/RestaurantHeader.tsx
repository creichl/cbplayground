import { Fragment, use, useState } from 'react'
import type { PriceLevel as Level } from '../../api/restaurantDetails.ts'
import { cn } from '../../lib/utils.ts'
import { ParallaxImage } from '../../ui/motion/parallax-image.tsx'
import { Stagger } from '../../ui/motion/reveal.tsx'
import { Photo } from '../../ui/photo.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { HeroContext } from './layout.ts'
import type { StatusTone } from './openingStatus.ts'
import { PriceLevel } from './PriceLevel.tsx'

type RestaurantHeaderProps = {
  name: string
  city: string | null
  coverUrl: string | null
  /** One or two short facts after the city, e.g. the cuisines. */
  facts?: string[]
  /** The price level after the facts, as € to €€€€ (PriceLevel); null when not set. */
  priceLevel?: Level | null
  /** The live status, short ("Open now · until 10:00 PM"), as a chip below the city (openingStatus.ts); only on the booking page. */
  status?: { tone: StatusTone; text: string } | null
  /** "page": the booking page, about 60 % of the screen high (45 % on phones); "preview": a fixed height (/admin/design). */
  size?: 'page' | 'preview'
}

/**
 * The heights of the cover image and of the band without one. In the small viewport height (svh), which does not change
 * while the browser's address bar comes and goes, so nothing below it moves.
 */
const heights = {
  page: { cover: 'h-[45svh] min-h-72 max-h-160 lg:h-[60svh]', band: 'h-56 lg:h-72' },
  preview: { cover: 'h-50', band: 'h-34' },
} as const

/**
 * The top of the restaurant's guest pages, in the full width and behind the transparent header: the cover image (cropped to
 * fit, loaded first, fading in) with a gradient towards the bottom, on it at the bottom left the name large in the display
 * font, a line with the city, the facts (on the booking page the cuisines) and the price level, e.g. "München · Bavarian · €€",
 * and, on the booking page, a chip with the live status (open now and until when, when it opens, closing soon), updated every
 * minute. Without cover image a calm band in the accent
 * colour; a cover image that cannot be loaded shows the band in the cover image's height, so nothing jumps. The logo is not
 * repeated here: it is in the header.
 *
 * On the booking page the cover image zooms in once when it has loaded and moves slower than the content while the page
 * scrolls, darkening (ParallaxImage); name, city and chip rise in one after another (Stagger). In page transitions it is
 * the element the photo of the start page's card moves into (view-transition-name restaurant-cover, app.css).
 */
export function RestaurantHeader({ name, city, coverUrl, facts = [], priceLevel = null, status = null, size = 'page' }: RestaurantHeaderProps) {
  const registerHero = use(HeroContext)
  const details = [
    ...[city, ...facts].filter((part) => part !== null && part !== ''),
    ...(priceLevel !== null ? [<PriceLevel key="price" level={priceLevel} />] : []),
  ]
  const [failedCover, setFailedCover] = useState<string | null>(null)
  const withCover = coverUrl !== null && failedCover !== coverUrl
  const page = size === 'page'

  const text = (
    <div className={cn('relative mx-auto w-full max-w-page px-4 sm:px-6', size === 'preview' ? 'pb-4' : 'pb-6 lg:pb-10')}>
      <h1 className={cn('font-display text-balance wrap-anywhere', page ? 'text-4xl sm:text-5xl xl:text-6xl' : 'text-2xl')}>{name}</h1>
      {details.length > 0 && (
        <p className={cn('mt-2 font-medium', size === 'preview' ? 'text-base' : 'text-lg')}>
          {details.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && ' · '}
              {part}
            </Fragment>
          ))}
        </p>
      )}
      {status !== null && (
        <p
          data-testid="opening-chip"
          className={cn(
            'mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium backdrop-blur-sm',
            withCover ? 'bg-black/35 text-white ring-1 ring-white/25' : 'bg-primary-foreground/15 ring-1 ring-primary-foreground/25',
            // Closing soon in the warning colour, light enough on the darkened photo.
            withCover && status.tone === 'soon' && 'text-amber-300',
          )}
        >
          {/* The text says it; the dot only repeats it. */}
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', status.tone === 'open' ? 'bg-green-400' : status.tone === 'soon' ? 'bg-amber-400' : 'bg-red-400')}
          />
          {status.text}
        </p>
      )}
    </div>
  )

  return (
    <div
      ref={page ? registerHero : undefined}
      className={cn(
        // overflow-clip, not hidden: the parallax of the cover image needs the page as its scroller.
        'relative flex items-end overflow-clip',
        coverUrl !== null ? heights[size].cover : heights[size].band,
        withCover ? 'bg-primary-900 text-white' : 'bg-primary text-primary-foreground',
        page && '[view-transition-name:restaurant-cover]',
      )}
    >
      {withCover && (
        <>
          {/* Only a picture of the place: the name below says what it is. The first thing on the page, so not lazy. */}
          {page ? (
            <ParallaxImage src={coverUrl} alt="" onError={() => setFailedCover(coverUrl)} className="bg-primary-900" />
          ) : (
            <Photo src={coverUrl} alt="" fallback={null} priority onError={() => setFailedCover(coverUrl)} className="absolute inset-0 bg-primary-900" />
          )}
          {/* Darkens the bottom for the name and the top for the header. */}
          <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/80 via-black/35 via-45% to-transparent to-75%" />
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/40 to-transparent" />
        </>
      )}
      {page ? <Stagger>{text}</Stagger> : text}
    </div>
  )
}

/** The cover image while the restaurant loads, in the height of the page's cover image, so nothing jumps. */
export function RestaurantHeaderSkeleton({ size = 'page' }: Pick<RestaurantHeaderProps, 'size'>) {
  const registerHero = use(HeroContext)
  return <Skeleton ref={registerHero} className={cn('rounded-none', heights[size].cover, size === 'page' && '[view-transition-name:restaurant-cover]')} />
}
