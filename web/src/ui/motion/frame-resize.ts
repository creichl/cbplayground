import { type RefObject, useLayoutEffect, useRef } from 'react'

/** The points of the damped spring --ease-spring (app.css), for the animation made in script. */
const spring = [0, 0.084, 0.266, 0.471, 0.657, 0.805, 0.911, 0.979, 1.017, 1.035, 1.038, 1.034, 1.027, 1.019, 1.012, 1.007, 1.003, 1.001, 0.999, 1]

/** The layout box of an element, without the transforms of an animation running on it. */
type Box = { left: number; top: number; width: number; height: number }

function boxOf(element: HTMLElement): Box {
  return { left: element.offsetLeft, top: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight }
}

function reducedMotion(element: HTMLElement) {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || element.closest('[data-reduce-motion]') !== null
}

/**
 * Lets a frame (a dialog, a card) change its size smoothly when `trigger` changes, e.g. from the large dialog of the table step
 * to the compact one of the contact details, or to the height of the next step. The frame is the closest element with
 * `data-motion-frame` around `ref`; it takes its new size at once (so the layout, and an embed's height, is final right away)
 * and is drawn from its old box to the new one with the spring, by transform only: it moves and scales, and its element with
 * `data-motion-frame-content` scales back by the same amount, so the content is never stretched. Nothing moves with less motion.
 */
export function useFrameResize(ref: RefObject<HTMLElement | null>, trigger: unknown) {
  // The frame's box as last laid out; a ResizeObserver keeps it current while the content grows or shrinks.
  const last = useRef<Box | null>(null)

  useLayoutEffect(() => {
    const frame = ref.current?.closest<HTMLElement>('[data-motion-frame]')
    if (frame === null || frame === undefined) {
      return
    }
    const observer = new ResizeObserver(() => {
      last.current = boxOf(frame)
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [ref])

  useLayoutEffect(() => {
    const frame = ref.current?.closest<HTMLElement>('[data-motion-frame]')
    const content = frame?.querySelector<HTMLElement>('[data-motion-frame-content]')
    if (frame === null || frame === undefined || content === null || content === undefined) {
      return
    }
    const before = last.current
    const after = boxOf(frame)
    last.current = after
    if (before === null || after.width === 0 || after.height === 0 || reducedMotion(frame)) {
      return
    }
    const scaleX = before.width / after.width
    const scaleY = before.height / after.height
    const x = before.left - after.left
    const y = before.top - after.top
    if (Math.abs(scaleX - 1) < 0.005 && Math.abs(scaleY - 1) < 0.005 && Math.abs(x) < 1 && Math.abs(y) < 1) {
      return
    }
    // The duration of what opens and changes size (--motion-slow), in milliseconds.
    const duration = Number.parseFloat(getComputedStyle(frame).getPropertyValue('--motion-slow')) || 300
    const at = spring.map((progress) => ({
      scaleX: scaleX + (1 - scaleX) * progress,
      scaleY: scaleY + (1 - scaleY) * progress,
      x: x * (1 - progress),
      y: y * (1 - progress),
    }))
    const options = { duration, easing: 'linear' }
    const frameAnimation = frame.animate(
      at.map((step) => ({ transformOrigin: '0 0', transform: `translate(${step.x}px, ${step.y}px) scale(${step.scaleX}, ${step.scaleY})` })),
      options,
    )
    const contentAnimation = content.animate(
      at.map((step) => ({ transformOrigin: '0 0', transform: `scale(${1 / step.scaleX}, ${1 / step.scaleY})` })),
      options,
    )
    return () => {
      frameAnimation.cancel()
      contentAnimation.cancel()
    }
  }, [ref, trigger])
}
