import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMinutes } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'

type TimeAxisProps = {
  /** The range in minutes since midnight. */
  start: number
  end: number
  className?: string
}

/** The steps between two labels, in minutes; the smallest one that leaves enough room is taken. */
const steps = [60, 120, 180, 240, 360, 720]

/** About the width of the longest label ("10:00 PM" in the small type), in pixels. */
const labelWidth = 52

/** Distance between two labels, in pixels: a label, a gap, and room for the first and last to move in from the edge. */
const labelSpacing = 92

/**
 * The full hours of a time range as small labels below a slider or a bar chart. How many it shows follows its own width (the
 * pane, the window), so the labels never run into each other: every hour on a wide pane, every few hours on a narrow one, only
 * start and end on a phone if nothing more fits.
 */
export function TimeAxis({ start, end, className }: TimeAxisProps) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const span = end - start
  const fits = (step: number) => span > 0 && (width * step) / span >= labelSpacing
  const step = steps.find(fits)
  const marks: number[] = []
  if (step !== undefined) {
    for (let minutes = Math.ceil(start / step) * step; minutes <= end; minutes += step) {
      marks.push(minutes)
    }
  } else if (width >= 2 * labelSpacing) {
    marks.push(start, end)
  }

  return (
    <div ref={ref} data-time-axis="" aria-hidden="true" className={cn('relative h-4 text-[0.6875rem] text-muted-foreground tabular-nums', className)}>
      {marks.map((minutes) => (
        // A box of the label's width centred below its time, moved in at the edges so it stays within the axis.
        <span
          key={minutes}
          className="absolute text-center whitespace-nowrap"
          style={{ width: labelWidth, left: Math.min(Math.max(((minutes - start) / span) * width - labelWidth / 2, 0), width - labelWidth) }}
        >
          {formatTime(formatMinutes(minutes), language)}
        </span>
      ))}
    </div>
  )
}
