import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeftIcon, ChevronRightIcon, ImageOffIcon, XIcon } from 'lucide-react'
import { type KeyboardEvent, type PointerEvent, useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ThemeRootContext } from '../brandTheme.ts'
import { cn } from '../lib/utils.ts'
import { Dialog, DialogClose, DialogTitle } from './dialog.tsx'
import { Photo } from './photo.tsx'

type LightboxPhoto = { id: string; url: string; caption: string | null }

type LightboxProps = {
  photos: LightboxPhoto[]
  /** The photo shown; null while the lightbox is closed. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
  /** Whose photos they are, e.g. the restaurant's name: the dialog's title, with the photo's caption. */
  title: string
  /** Where the focus goes once the lightbox has closed, e.g. the photo that opened it. */
  returnFocus?: () => HTMLElement | null
}

/** How far a swipe has to go to change the photo, and a pull down to close (px). */
const swipeDistance = 60
const pullDistance = 120

type Drag = { pointerId: number; x: number; y: number; axis: 'x' | 'y' | null; dx: number; dy: number }

/**
 * Photos in full screen on a dark background, each as large as fits (object-contain), with its caption and "3 / 8" below
 * it. The arrows (on the screen and on the keyboard) go to the previous and the next photo, Escape closes it; on touch
 * screens a swipe to the side changes the photo and a pull down closes it. From 768 px on a row of thumbnails at the
 * bottom. A new photo slides in from the side it comes from, one chosen from the thumbnails fades in; with less motion it
 * changes at once. The previous and the next photo are loaded ahead. A Radix dialog: the focus stays inside and goes to
 * `returnFocus` once it has closed.
 */
function Lightbox({ photos, index, onIndexChange, onClose, title, returnFocus }: LightboxProps) {
  const { t } = useTranslation()
  const container = useContext(ThemeRootContext)
  // The photo shown, kept while the lightbox closes, so it does not empty before it is gone.
  const [shown, setShown] = useState(index)
  // How the photo came: from the right (next), from the left (previous) or chosen (fades in); null for the first one.
  const [entrance, setEntrance] = useState<'next' | 'previous' | 'jump' | null>(null)
  const [previous, setPrevious] = useState(index)
  if (index !== previous) {
    setPrevious(index)
    if (index !== null) {
      setEntrance(previous === null ? null : index === previous + 1 ? 'next' : index === previous - 1 ? 'previous' : 'jump')
      setShown(index)
    }
  }
  const current = shown !== null && shown < photos.length ? shown : null
  const photo = current !== null ? photos[current] : null

  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const thumbnails = useRef<HTMLDivElement>(null)

  // The neighbours are loaded ahead, so the next swipe shows its photo right away.
  useEffect(() => {
    if (index === null) {
      return
    }
    for (const neighbour of [photos[index - 1], photos[index + 1]]) {
      if (neighbour !== undefined) {
        const image = new Image()
        image.decoding = 'async'
        image.src = neighbour.url
      }
    }
  }, [index, photos])

  // The current thumbnail stays in view.
  useEffect(() => {
    if (index !== null) {
      thumbnails.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [index])

  const go = (target: number) => {
    if (target >= 0 && target < photos.length) {
      onIndexChange(target)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (current === null) {
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(current - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(current + 1)
    }
  }

  // Swiping and pulling down: only touch and pen; the mouse has the arrows.
  const onPointerDown = (event: PointerEvent) => {
    // The arrows keep their own taps.
    if (event.pointerType === 'mouse' || drag.current !== null || (event.target as Element).closest('button') !== null) {
      return
    }
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis: null, dx: 0, dy: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current
    const element = stage.current
    if (state === null || state.pointerId !== event.pointerId || element === null) {
      return
    }
    state.dx = event.clientX - state.x
    state.dy = event.clientY - state.y
    if (state.axis === null && Math.hypot(state.dx, state.dy) > 10) {
      state.axis = Math.abs(state.dx) > Math.abs(state.dy) ? 'x' : 'y'
    }
    // The photo follows the finger directly, without transition.
    element.style.transition = 'none'
    if (state.axis === 'x') {
      element.style.translate = `${state.dx}px 0`
    } else if (state.axis === 'y') {
      const pull = Math.max(0, state.dy)
      element.style.translate = `0 ${pull}px`
      element.style.opacity = String(Math.max(0.3, 1 - pull / 400))
    }
  }

  const onPointerEnd = (event: PointerEvent) => {
    const state = drag.current
    if (state === null || state.pointerId !== event.pointerId) {
      return
    }
    drag.current = null
    const released = event.type === 'pointerup'
    if (released && state.axis === 'y' && state.dy >= pullDistance) {
      // Fades out from where it was pulled to.
      onClose()
      return
    }
    const element = stage.current
    if (element !== null) {
      // Back into place with the transition of its classes (none with less motion).
      element.style.transition = ''
      element.style.translate = ''
      element.style.opacity = ''
    }
    if (!released || current === null || state.axis !== 'x') {
      return
    }
    if (state.dx <= -swipeDistance) {
      go(current + 1)
    } else if (state.dx >= swipeDistance) {
      go(current - 1)
    }
  }

  const label = (position: number) =>
    photos[position]?.caption ?? t('lightbox.photo', { index: position + 1, total: photos.length })
  // At the first and the last photo the arrow is only marked as unavailable (aria-disabled), never disabled: a disabled
  // button loses the focus to the page, outside the dialog, where the arrow keys no longer work.
  const arrowClassName =
    'absolute top-1/2 z-10 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-stone-950/60 text-white transition-colors hover:bg-stone-800 focus-ring aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:bg-stone-950/60 sm:size-12'

  return (
    <Dialog open={index !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-stone-950 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(event) => {
            const target = returnFocus?.()
            if (target) {
              event.preventDefault()
              target.focus({ preventScroll: true })
            }
          }}
          className="fixed inset-0 z-50 flex flex-col text-stone-100 outline-hidden data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 py-2 pr-2 pl-4 sm:pr-4 sm:pl-6">
            <DialogTitle className="min-w-0 truncate text-base font-medium">
              {title}
              {photo !== null && photo.caption !== null && <span className="sr-only">{` – ${photo.caption}`}</span>}
            </DialogTitle>
            <DialogClose className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 focus-ring">
              <XIcon aria-hidden="true" className="size-5" />
              <span className="sr-only">{t('common.close')}</span>
            </DialogClose>
          </div>

          <div
            className="relative min-h-0 flex-1 touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            {photo !== null && current !== null && (
              <div
                // A new element per photo, so its entrance starts over.
                key={photo.id}
                ref={stage}
                className={cn(
                  'absolute inset-0 px-2 transition-[translate,opacity] duration-(--motion-medium) ease-(--ease-out) sm:px-20',
                  entrance === 'next' && 'animate-slide-in [--slide-from:3rem]',
                  entrance === 'previous' && 'animate-slide-in [--slide-from:-3rem]',
                  entrance === 'jump' && 'animate-fade-in',
                )}
              >
                <Photo
                  src={photo.url}
                  alt={label(current)}
                  priority
                  className="bg-transparent"
                  imageClassName="object-contain"
                  fallback={
                    <span className="flex items-center justify-center text-stone-400">
                      <ImageOffIcon aria-hidden="true" className="size-10" strokeWidth={1.5} />
                    </span>
                  }
                />
              </div>
            )}
            <button
              type="button"
              className={cn(arrowClassName, 'left-2 sm:left-4')}
              aria-disabled={current === null || current === 0}
              onClick={() => current !== null && go(current - 1)}
            >
              <ChevronLeftIcon aria-hidden="true" className="size-6" />
              <span className="sr-only">{t('lightbox.previous')}</span>
            </button>
            <button
              type="button"
              className={cn(arrowClassName, 'right-2 sm:right-4')}
              aria-disabled={current === null || current === photos.length - 1}
              onClick={() => current !== null && go(current + 1)}
            >
              <ChevronRightIcon aria-hidden="true" className="size-6" />
              <span className="sr-only">{t('lightbox.next')}</span>
            </button>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-3 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {/* Caption and position: a fixed height, so the photo above does not jump between photos with and without one. */}
            <div className="flex min-h-12 max-w-3xl flex-col items-center gap-1 text-center">
              {photo !== null && photo.caption !== null && <p className="line-clamp-2">{photo.caption}</p>}
              {current !== null && (
                <p className="text-sm text-stone-400 tabular-nums">
                  <span aria-hidden="true">{t('lightbox.position', { index: current + 1, total: photos.length })}</span>
                  <span className="sr-only">{t('lightbox.photo', { index: current + 1, total: photos.length })}</span>
                </p>
              )}
            </div>
            <div ref={thumbnails} className="hidden max-w-full gap-2 overflow-x-auto p-1 [scrollbar-width:thin] md:flex">
              {photos.map((thumbnail, position) => (
                <button
                  key={thumbnail.id}
                  type="button"
                  aria-current={position === current ? 'true' : undefined}
                  onClick={() => go(position)}
                  className={cn(
                    'relative h-14 w-20 shrink-0 cursor-pointer overflow-hidden rounded-md opacity-50 transition-opacity hover:opacity-90 focus-ring',
                    position === current && 'opacity-100 ring-2 ring-white',
                  )}
                >
                  <Photo src={thumbnail.url} alt={label(position)} className="bg-stone-800" fallback={null} />
                </button>
              ))}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  )
}

export { Lightbox, type LightboxPhoto }
