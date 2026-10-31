import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react'
import type { TableRotation, TableShape as Shape } from '../../api/areas.ts'
import { UserIcon } from '../icons.tsx'
import { chairDepth, chairs, chairSpace, chairWidth, tableSize } from './layout.ts'

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
  style?: CSSProperties
  ref?: Ref<HTMLDivElement>
}

/**
 * A table on a floor plan, drawn in its shape and size with a chair per seat, its number and its seats. The size follows
 * the seats and the area's table scale relative to the plan width (see layout.ts). The parent is the plan (see FloorPlan).
 * Around a small table an invisible area of at least 40 pixels takes the clicks and taps.
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
  style,
  ...others
}: TableShapeProps) {
  // Drawn at 100 %; the box around it carries the table scale.
  const { width, height } = tableSize(shape, seats, rotation, 100)
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
        {chairs(shape, seats, width, height).map((chair, i) => (
          <rect
            key={i}
            x={-chairWidth / 2}
            y={-chairDepth / 2}
            width={chairWidth}
            height={chairDepth}
            rx={chairDepth / 3}
            transform={`translate(${chair.x} ${chair.y}) rotate(${chair.angle})`}
            fill={fill}
            stroke={stroke}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {shape === 'Round' ? (
          <circle r={width / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        ) : (
          <rect
            x={-width / 2}
            y={-height / 2}
            width={width}
            height={height}
            rx={Math.min(width, height) / 10}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        )}
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
            color: 'var(--mantine-color-dark-7)',
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
