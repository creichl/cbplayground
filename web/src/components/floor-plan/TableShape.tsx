import { type CSSProperties, type HTMLAttributes, type ReactNode, type Ref, type SVGProps, useId } from 'react'
import type { TableRotation, TableShape as Shape } from '../../api/areas.ts'
import { UserIcon } from '../icons.tsx'
import { chairDepth, chairs, chairSpace, chairWidth, tableRim, tableSize } from './layout.ts'

/** The smallest area in pixels that reacts to a tap, also around a small table. */
const minHitSize = 40

type TableShapeProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  number: string
  seats: number
  shape: Shape
  rotation: TableRotation
  /** The table's centre relative to the plan, 0–1. */
  posX: number
  posY: number
  /** The area's table scale, 50–200 %. */
  tableScale: number
  /** Colours of the table and its chairs and of the number, as CSS colours. */
  fill: string
  stroke: string
  color: string
  /** Outline in pixels. */
  strokeWidth?: number
  /** A short text under the table, e.g. "until 20:00". */
  note?: ReactNode
  /** A dark plan (the restaurant's dark mode): the rim and the shadow suit it. */
  dark?: boolean
  style?: CSSProperties
  ref?: Ref<HTMLDivElement>
}

/**
 * A table on a floor plan as a piece of furniture in plan view: the table top in its shape and size with a light sheen, its
 * edge and its shadow, and a chair per seat (seat and backrest, the backrest away from the table, radial around round
 * tables), with its number and its seats. `fill`, `stroke` and `color` carry the table's state: the top and the seats in
 * `fill`, the edge and the backrests in `stroke`. A thin rim outside the edge (`tableRim`) keeps the edge apart from any
 * floor. The size follows the seats and the area's table scale relative to the plan width (see layout.ts). The parent is
 * the plan (see FloorPlan). Around a small table an invisible area of at least 40 pixels takes the clicks and taps.
 */
export function TableShape({
  number,
  seats,
  shape,
  rotation,
  posX,
  posY,
  tableScale,
  fill,
  stroke,
  color,
  strokeWidth = 1.5,
  note,
  dark = false,
  style,
  ...others
}: TableShapeProps) {
  // Gradients need an id that is unique on the page; useId may contain characters that do not work in url().
  const sheenId = `table-sheen-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  // Drawn at 100 %; the box around it carries the table scale.
  const { width, height } = tableSize(shape, seats, rotation, 100)
  const seatsAround = chairs(shape, seats, width, height)
  const top = (props: SVGProps<SVGCircleElement & SVGRectElement>) =>
    shape === 'Round' ? (
      <circle r={width / 2} {...props} />
    ) : (
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={Math.min(width, height) / 10} {...props} />
    )
  // The light comes from the top left; the shadow falls to the bottom right, in plan widths.
  const shadow = (x: number, y: number, opacity: number) => (
    // The opacity on every shape, not on the group: a group's opacity costs an extra layer when drawing.
    <g transform={`translate(${x} ${y})`} fill="#000000" fillOpacity={opacity * (dark ? 2.2 : 1)}>
      {seatsAround.map((chair, i) => (
        <rect
          key={i}
          x={-chairWidth / 2}
          y={-chairDepth / 2}
          width={chairWidth}
          height={chairDepth}
          rx={chairDepth / 4}
          transform={`translate(${chair.x} ${chair.y}) rotate(${chair.angle})`}
        />
      ))}
      {top({})}
    </g>
  )
  const boxWidth = width + 2 * chairSpace
  const boxHeight = height + 2 * chairSpace
  const scale = tableScale / 100

  return (
    <div
      data-floor-table=""
      {...others}
      style={{
        position: 'absolute',
        left: `${posX * 100}%`,
        top: `${posY * 100}%`,
        width: `${boxWidth * scale * 100}%`,
        aspectRatio: `${boxWidth} / ${boxHeight}`,
        transform: 'translate(-50%, -50%)',
        // The label's size follows the table's, so it fits small tables on narrow screens too.
        containerType: 'size',
        color,
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `max(100%, ${minHitSize}px)`,
          height: `max(100%, ${minHitSize}px)`,
          transform: 'translate(-50%, -50%)',
        }}
      />
      <svg
        viewBox={`${-boxWidth / 2} ${-boxHeight / 2} ${boxWidth} ${boxHeight}`}
        aria-hidden="true"
        focusable="false"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={sheenId} x1={0} y1={0} x2={1} y2={1}>
            <stop offset={0} stopColor="#ffffff" stopOpacity={0.3} />
            <stop offset={0.45} stopColor="#ffffff" stopOpacity={0} />
            <stop offset={0.55} stopColor="#000000" stopOpacity={0} />
            <stop offset={1} stopColor="#000000" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        {shadow(0.005, 0.007, 0.07)}
        {shadow(0.0025, 0.0035, 0.12)}
        {seatsAround.map((chair, i) => (
          // Turned so that the backrest (at the top at 0°) faces away from the table.
          <g key={i} transform={`translate(${chair.x} ${chair.y}) rotate(${chair.angle})`}>
            <rect
              x={-chairWidth * 0.44}
              y={-chairDepth * 0.28}
              width={chairWidth * 0.88}
              height={chairDepth * 0.78}
              rx={chairDepth * 0.22}
              fill={fill}
              stroke={stroke}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={-chairWidth / 2}
              y={-chairDepth / 2}
              width={chairWidth}
              height={chairDepth * 0.32}
              rx={chairDepth * 0.16}
              fill={stroke}
            />
          </g>
        ))}
        {top({ fill: 'none', stroke: tableRim[dark ? 'dark' : 'light'], strokeWidth: strokeWidth + 2, vectorEffect: 'non-scaling-stroke' })}
        {top({ fill, stroke, strokeWidth, vectorEffect: 'non-scaling-stroke' })}
        {top({ fill: `url(#${sheenId})` })}
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1.1,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 'clamp(7px, 30cqmin, 13px)', fontWeight: 700 }}>{number}</span>
        <span style={{ fontSize: 'clamp(6px, 20cqmin, 10px)', display: 'inline-flex', alignItems: 'center', gap: 1, opacity: 0.85 }}>
          <UserIcon width="1em" height="1em" strokeWidth={2.5} />
          {seats}
        </span>
      </span>
      {note !== undefined && (
        <span
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0 4px',
            borderRadius: 4,
            fontSize: 10,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            // Mantine's dark.7, on the white plate.
            color: '#242424',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            pointerEvents: 'none',
          }}
        >
          {note}
        </span>
      )}
    </div>
  )
}
