import { ImageIcon, ImagesIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import type { GalleryPhoto } from '../../api/publicBooking.ts'
import { cn } from '../../lib/utils.ts'
import { Lightbox } from '../../ui/lightbox.tsx'
import { Stagger } from '../../ui/motion/reveal.tsx'
import { Photo } from '../../ui/photo.tsx'
import { sectionIds } from './layout.ts'

/** The address parameter of the photo shown in the lightbox. */
const photoParam = 'photo'

/** The mosaic shows this many photos; with more, its last tile says how many more there are. */
const mosaicSize = 5

/** The history entry of an open lightbox carries this mark, so closing it goes back instead of adding an entry. */
type LightboxEntry = { lightbox: true }

function isLightboxEntry(state: unknown): state is LightboxEntry {
  return typeof state === 'object' && state !== null && 'lightbox' in state && state.lightbox === true
}

/**
 * The tiles of the mosaic in 4 columns and 2 rows: the first photo large (2 × 2), the next four small; with fewer photos the
 * others share the space, so there is never an empty tile.
 */
function tileClassName(count: number, index: number) {
  if (index === 0) {
    return count === 1 ? 'col-span-4 row-span-2' : 'col-span-2 row-span-2'
  }
  if (count === 2) {
    return 'col-span-2 row-span-2'
  }
  if (count === 3 || (count === 4 && index === 1)) {
    return 'col-span-2'
  }
  return ''
}

const zoomClassName = 'transition-[opacity,scale] duration-(--motion-long) group-hover:scale-105'

/**
 * The focus of a tile, drawn inside it: the list around the tiles cuts off what lies outside them. A ring in the focus
 * colour with a white one inside, so it shows on every photo.
 */
const focusMark = (
  <span
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 group-focus-visible:shadow-[inset_0_0_0_3px_var(--ring),inset_0_0_0_5px_white]"
  />
)

const fallback = (
  <span className="flex items-center justify-center text-muted-foreground">
    <ImageIcon aria-hidden="true" className="size-8" strokeWidth={1.5} />
  </span>
)

/**
 * The restaurant's photo gallery, like the restaurant pages of Resy or Tock. From 1024 px on a mosaic (one large photo and
 * four small ones in fixed proportions) with "All photos (n)" at the bottom right, or, from 6 photos on, "+n" on its last
 * tile; below 1024 px a strip to swipe through, one photo at a time (scroll-snap), with dots. Every photo opens the
 * lightbox at itself. The lightbox lives in the address (`?photo=<id>`), next to the booking, which it leaves as it is:
 * opening it adds a history entry, so the back button closes it, and a link with the parameter opens the photo. Renders
 * nothing without photos.
 */
export function Gallery({ photos, restaurantName }: { photos: GalleryPhoto[]; restaurantName: string }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  // The element that opened the lightbox, so the focus returns to it.
  const trigger = useRef<HTMLElement | null>(null)
  const strip = useRef<HTMLUListElement>(null)
  const [stripIndex, setStripIndex] = useState(0)

  const photoId = searchParams.get(photoParam)
  const found = photos.findIndex((photo) => photo.id === photoId)
  const index = found >= 0 ? found : null

  if (photos.length === 0) {
    return null
  }

  const withPhoto = (id: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (id === null) {
      next.delete(photoParam)
    } else {
      next.set(photoParam, id)
    }
    return `?${next}`
  }

  const open = (position: number, element: HTMLElement) => {
    trigger.current = element
    const state = typeof location.state === 'object' && location.state !== null ? location.state : {}
    void navigate({ search: withPhoto(photos[position].id) }, { state: { ...state, lightbox: true } satisfies LightboxEntry })
  }

  // Another photo replaces the entry, so the back button closes the lightbox instead of going through the photos.
  const show = (position: number) =>
    void navigate({ search: withPhoto(photos[position].id) }, { replace: true, state: location.state })

  // Back to the entry it was opened from; opened by a link, the parameter is removed in place.
  const close = () => {
    if (isLightboxEntry(location.state)) {
      void navigate(-1)
    } else {
      void navigate({ search: withPhoto(null) }, { replace: true, state: location.state })
    }
  }

  const label = (position: number) =>
    photos[position].caption ?? t('lightbox.photo', { index: position + 1, total: photos.length })
  const more = photos.length - mosaicSize

  const onStripScroll = () => {
    const list = strip.current
    if (list === null || list.clientWidth === 0) {
      return
    }
    setStripIndex(Math.min(photos.length - 1, Math.max(0, Math.round(list.scrollLeft / list.clientWidth))))
  }

  return (
    <section id={sectionIds.photos} aria-labelledby="gallery-heading" className="flex scroll-mt-36 flex-col gap-3">
      <h2 id="gallery-heading" tabIndex={-1} className="sr-only">
        {t('booking.gallery.title')}
      </h2>

      {/* From 1024 px on: the mosaic, in a fixed ratio, so nothing moves while the photos load. */}
      <div className="relative hidden lg:block">
        <Stagger>
          <ul className="grid aspect-2/1 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl">
            {photos.slice(0, mosaicSize).map((photo, position) => {
              const last = position === mosaicSize - 1 && more > 0
              return (
                <li key={photo.id} className={cn('min-h-0', tileClassName(Math.min(photos.length, mosaicSize), position))}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={last ? t('booking.gallery.showAll', { total: photos.length }) : undefined}
                    onClick={(event) => open(position, event.currentTarget)}
                    className="group relative size-full cursor-pointer overflow-hidden outline-none"
                  >
                    <Photo src={photo.url} alt={last ? '' : label(position)} fallback={fallback} imageClassName={zoomClassName} />
                    {focusMark}
                    {last && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-center bg-stone-950/55 font-display text-3xl text-white transition-colors group-hover:bg-stone-950/45"
                      >
                        {t('booking.gallery.more', { number: more })}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </Stagger>
        {more <= 0 && (
          <ShowAllButton count={photos.length} onClick={(element) => open(0, element)} />
        )}
      </div>

      {/* Below 1024 px: one photo at a time, swiped through and snapping into place, with dots below. */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="relative">
          <Stagger>
            <ul
              ref={strip}
              onScroll={onStripScroll}
              className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {photos.map((photo, position) => (
                <li key={photo.id} className="w-full shrink-0 snap-center snap-always">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={(event) => open(position, event.currentTarget)}
                    className="group relative block w-full cursor-pointer overflow-hidden outline-none"
                  >
                    <Photo src={photo.url} alt={label(position)} ratio="4/3" fallback={fallback} imageClassName={zoomClassName} />
                    {focusMark}
                  </button>
                </li>
              ))}
            </ul>
          </Stagger>
          <ShowAllButton count={photos.length} onClick={(element) => open(0, element)} />
        </div>
        {photos.length > 1 && (
          <div aria-hidden="true" className="flex justify-center gap-1.5">
            {photos.map((photo, position) => (
              <span
                key={photo.id}
                className={cn(
                  'size-1.5 rounded-full bg-foreground/25 transition-[background-color,scale] duration-(--motion-fast)',
                  position === stripIndex && 'scale-125 bg-foreground',
                )}
              />
            ))}
          </div>
        )}
      </div>

      <Lightbox
        photos={photos}
        index={index}
        onIndexChange={show}
        onClose={close}
        title={restaurantName}
        returnFocus={() => (trigger.current?.isConnected ? trigger.current : null)}
      />
    </section>
  )
}

/** "All photos (n)" at the bottom right of the mosaic or the strip. */
function ShowAllButton({ count, onClick }: { count: number; onClick: (element: HTMLElement) => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => onClick(event.currentTarget)}
      className="absolute right-3 bottom-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/90 px-3 text-sm font-medium text-foreground shadow-card backdrop-blur-sm press hover:bg-background focus-ring touch:h-11"
    >
      <ImagesIcon aria-hidden="true" className="size-4" />
      {t('booking.gallery.showAll', { total: count })}
    </button>
  )
}
