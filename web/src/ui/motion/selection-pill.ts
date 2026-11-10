import { type RefObject, useLayoutEffect, useRef } from 'react'

/** The place of the chosen chip within its row, as laid out (offsets, so the row's scrolling is not in it). */
type Box = { x: number; y: number; width: number; height: number }

/**
 * The one selection pill of a row of chips (the party sizes, the days of the date strip): an absolutely positioned element in
 * the row (`pillRef`), below the chip that carries `data-chosen`, which glides to the next chosen chip with the spring
 * (--ease-spring, --motion-slow), by transform only: translate to its place and scaleX from the old chip's width. The row
 * (`rowRef`) is the pill's containing block (relative), so the pill scrolls with the row's chips. Without a chosen chip the pill
 * is hidden; with less motion it jumps. It is placed after every render and follows a change of the row's size (e.g. chips that
 * wrap) at once.
 */
export function useSelectionPill(rowRef: RefObject<HTMLElement | null>, pillRef: RefObject<HTMLElement | null>) {
  const last = useRef<Box | null>(null)

  // After every render, before it is painted, so the pill never shows in a wrong place.
  useLayoutEffect(() => place(rowRef.current, pillRef.current, last, true))

  useLayoutEffect(() => {
    const row = rowRef.current
    if (row === null) {
      return
    }
    const observer = new ResizeObserver(() => place(row, pillRef.current, last, false))
    observer.observe(row)
    return () => observer.disconnect()
  }, [rowRef, pillRef])
}

/** Puts the pill below the row's chosen chip; with `glide` it glides there from where it was, unless there is less motion. */
function place(row: HTMLElement | null, pill: HTMLElement | null, last: RefObject<Box | null>, glide: boolean) {
  if (row === null || pill === null) {
    return
  }
  const target = row.querySelector<HTMLElement>(':scope > [data-chosen]')
  if (target === null) {
    pill.style.opacity = '0'
    last.current = null
    return
  }
  const box = { x: target.offsetLeft, y: target.offsetTop, width: target.offsetWidth, height: target.offsetHeight }
  const before = last.current
  if (before !== null && before.x === box.x && before.y === box.y && before.width === box.width && before.height === box.height) {
    return
  }
  last.current = box
  // Where the pill is drawn now, also halfway through a glide, which the new one continues from.
  const from = pill.getAnimations().length > 0 ? getComputedStyle(pill).transform : null
  for (const animation of pill.getAnimations()) {
    animation.cancel()
  }
  pill.style.width = `${box.width}px`
  pill.style.height = `${box.height}px`
  pill.style.transform = `translate(${box.x}px, ${box.y}px)`
  pill.style.opacity = '1'
  const style = getComputedStyle(pill)
  // --motion-slow is 0s with less motion.
  const duration = Number.parseFloat(style.getPropertyValue('--motion-slow'))
  if (!glide || before === null || !(duration > 0)) {
    return
  }
  pill.animate(
    [
      { transformOrigin: '0 0', transform: from ?? `translate(${before.x}px, ${before.y}px) scaleX(${before.width / box.width})` },
      { transformOrigin: '0 0', transform: `translate(${box.x}px, ${box.y}px)` },
    ],
    { duration, easing: style.getPropertyValue('--ease-spring').trim() || 'ease-out' },
  )
}
