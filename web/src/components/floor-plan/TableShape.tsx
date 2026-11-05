import { type CSSProperties, type HTMLAttributes, type ReactNode, type Ref, type SVGProps, useId } from 'react'
import type { TableRotation, TableShape as Shape } from '../../api/areas.ts'
import type { TableStyle } from '../../api/branding.ts'
import { UserIcon } from '../icons.tsx'
import { chairDepth, chairs, chairSpace, chairWidth, naturalColors, tableRim, tableSize } from './layout.ts'

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
  /**
   * How the furniture is drawn, the restaurant's table style (see the component's description); Classic by default, as on
   * the staff's plans.
   */
  look?: TableStyle
  /** Natural and Glow: the table cannot be chosen, its furniture fades to grey. */
  muted?: boolean
  /** Glow: the colour of the light around the table; none without. */
  glow?: string
  /** Glow: the light breathes softly (not with less motion). */
  breathe?: boolean
  /**
   * The number as a badge in these colours, in a readable size however small the table is drawn (on a plan to scale a table
   * for 2 is small), with the seats when the table is drawn at least 5.5rem wide; without, the label follows the table's
   * size and lies on its top.
   */
  badge?: { background: string; color: string; border: string }
  style?: CSSProperties
  ref?: Ref<HTMLDivElement>
}

/**
 * A table on a floor plan as a piece of furniture in plan view, with a chair per seat (seat and backrest, the backrest away
 * from the table, radial around round tables), its number and its seats. The size follows the seats and the area's table
 * scale relative to the plan width (see layout.ts). The parent is the plan (see FloorPlan). Around a small table an invisible
 * area of at least 40 pixels takes the clicks and taps. `look` sets how it is drawn; `fill`, `stroke` and `color` carry the
 * table's state in all of them:
 * - Classic: the table top in its shape with a light sheen, its edge and its shadow; the top and the seats in `fill`, the
 *   edge and the backrests in `stroke`.
 * - Natural: real furniture, a wooden top with its grain and linen seats on wooden frames, with its shadow; the state is a
 *   halo on the floor around table and chairs, filled with `fill` and outlined in `stroke` (`none` for none).
 * - Minimal: flat like a seat map, without shadow or sheen: the top in `fill` with its edge in `stroke`, the seats as dots.
 * - Glow: a dark glass top and chairs outlined in light lines (`stroke`), with light (`glow`) around them.
 * A thin rim outside the edge (`tableRim`) keeps the table apart from any floor in every look but Natural, whose wood is.
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
  look = 'Classic',
  muted = false,
  glow,
  breathe = false,
  badge,
  style,
  ...others
}: TableShapeProps) {
  // Gradients need an id that is unique on the page; useId may contain characters that do not work in url().
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const sheenId = `table-sheen-${id}`
  const woodId = `table-wood-${id}`
  const clipId = `table-clip-${id}`
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
  const viewBox = `${-boxWidth / 2} ${-boxHeight / 2} ${boxWidth} ${boxHeight}`
  const svgStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }
  const wood = naturalColors[dark ? 'dark' : 'light']
  // The dark glass of the Glow look's furniture.
  const glass = dark ? 'rgba(12, 10, 9, 0.82)' : 'rgba(28, 25, 23, 0.86)'
  // The grain: thin lines along the long side of the top, a little irregular.
  const long = width >= height
  const grain = [0.18, 0.31, 0.47, 0.6, 0.76, 0.88].map((at, i) => {
    const wave = (i % 2 === 0 ? 1 : -1) * 0.004
    return long
      ? `M ${-width / 2} ${-height / 2 + height * at} Q 0 ${-height / 2 + height * at + wave} ${width / 2} ${-height / 2 + height * at}`
      : `M ${-width / 2 + width * at} ${-height / 2} Q ${-width / 2 + width * at + wave} 0 ${-width / 2 + width * at} ${height / 2}`
  })

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
      {glow !== undefined && (
        // The light around the table, behind it: its outlines blurred in the glow colour, so it follows table and chairs.
        <svg
          viewBox={viewBox}
          aria-hidden="true"
          focusable="false"
          className={breathe ? 'table-glow-breathe' : undefined}
          style={{ ...svgStyle, filter: `drop-shadow(0 0 3px ${glow}) drop-shadow(0 0 9px ${glow})` }}
        >
          <g fill="none" stroke={glow} strokeWidth={3} vectorEffect="non-scaling-stroke">
            {seatsAround.map((chair, i) => (
              <rect
                key={i}
                x={-chairWidth * 0.45}
                y={-chairDepth / 2}
                width={chairWidth * 0.9}
                height={chairDepth}
                rx={chairDepth * 0.3}
                transform={`translate(${chair.x} ${chair.y}) rotate(${chair.angle})`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {top({ vectorEffect: 'non-scaling-stroke' })}
          </g>
        </svg>
      )}
      <svg
        viewBox={viewBox}
        aria-hidden="true"
        focusable="false"
        style={{
          ...svgStyle,
          // A table that cannot be chosen fades to grey, so its look stays but it steps back.
          ...(muted ? { filter: 'grayscale(1)', opacity: dark ? 0.5 : 0.55 } : {}),
        }}
      >
        {look === 'Classic' && (
          <>
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
          </>
        )}
        {look === 'Natural' && (
          <>
            <defs>
              <linearGradient id={woodId} x1={0} y1={0} x2={1} y2={1}>
                <stop offset={0} stopColor={wood.light} />
                <stop offset={1} stopColor={wood.dark} />
              </linearGradient>
              <linearGradient id={sheenId} x1={0} y1={0} x2={1} y2={1}>
                <stop offset={0} stopColor="#ffffff" stopOpacity={0.22} />
                <stop offset={0.5} stopColor="#ffffff" stopOpacity={0} />
              </linearGradient>
              <clipPath id={clipId}>{top({})}</clipPath>
            </defs>
            {/* The halo on the floor around table and chairs carries the state. */}
            {shape === 'Round' ? (
              <circle r={width / 2 + chairSpace * 0.92} fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
            ) : (
              <rect
                x={-width / 2 - chairSpace * 0.92}
                y={-height / 2 - chairSpace * 0.92}
                width={width + chairSpace * 1.84}
                height={height + chairSpace * 1.84}
                rx={chairSpace * 0.8}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {shadow(0.005, 0.007, 0.08)}
            {shadow(0.0025, 0.0035, 0.14)}
            {seatsAround.map((chair, i) => (
              <g key={i} transform={`translate(${chair.x} ${chair.y}) rotate(${chair.angle})`}>
                {/* The frame and backrest in wood, the seat in linen on it. */}
                <rect x={-chairWidth / 2} y={-chairDepth / 2} width={chairWidth} height={chairDepth} rx={chairDepth * 0.22} fill={wood.frame} />
                <rect
                  x={-chairWidth * 0.4}
                  y={-chairDepth * 0.18}
                  width={chairWidth * 0.8}
                  height={chairDepth * 0.6}
                  rx={chairDepth * 0.18}
                  fill={wood.seat}
                />
              </g>
            ))}
            {top({ fill: `url(#${woodId})`, stroke: wood.edge, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' })}
            {/* The grain of the planks of the top, along its long side. */}
            <g clipPath={`url(#${clipId})`} stroke={wood.grain} strokeWidth={0.6} vectorEffect="non-scaling-stroke" fill="none">
              {grain.map((line, i) => (
                <path key={i} d={line} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
            {top({ fill: `url(#${sheenId})` })}
          </>
        )}
        {look === 'Minimal' && (
          <>
            {seatsAround.map((chair, i) => (
              <circle
                key={i}
                cx={chair.x}
                cy={chair.y}
                r={chairDepth * 0.5}
                fill={stroke}
                stroke={tableRim[dark ? 'dark' : 'light']}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {top({ fill: 'none', stroke: tableRim[dark ? 'dark' : 'light'], strokeWidth: strokeWidth + 2, vectorEffect: 'non-scaling-stroke' })}
            {top({ fill, stroke, strokeWidth, vectorEffect: 'non-scaling-stroke' })}
          </>
        )}
        {look === 'Glow' && (
          <>
            {seatsAround.map((chair, i) => (
              <g key={i} transform={`translate(${chair.x} ${chair.y}) rotate(${chair.angle})`}>
                <rect
                  x={-chairWidth * 0.45}
                  y={-chairDepth / 2}
                  width={chairWidth * 0.9}
                  height={chairDepth}
                  rx={chairDepth * 0.3}
                  fill={glass}
                  stroke={stroke}
                  strokeWidth={1.25}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
            {top({ fill: glass, stroke: tableRim[dark ? 'dark' : 'light'], strokeWidth: strokeWidth + 2, vectorEffect: 'non-scaling-stroke' })}
            {top({ fill, stroke, strokeWidth, vectorEffect: 'non-scaling-stroke' })}
          </>
        )}
      </svg>
      {badge === undefined ? (
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
      ) : (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          {/* Readable however small the table is: at least 12 pixels, larger on a large table. */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3em',
              padding: '0.05em 0.4em',
              borderRadius: 999,
              fontSize: 'clamp(12px, 20cqmin, 15px)',
              fontWeight: 700,
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              color: badge.color,
              backgroundColor: badge.background,
              boxShadow: `0 0 0 1px ${badge.border}, 0 1px 3px rgba(0, 0, 0, 0.25)`,
            }}
          >
            {number}
            {/* The seats only where the table is large enough, so the badge does not cover a small table; its chairs show them. */}
            <span
              className="inline-flex items-center @max-[5.5rem]:hidden"
              style={{ gap: 1, fontSize: '0.85em', fontWeight: 600, opacity: 0.85 }}
            >
              <UserIcon width="1em" height="1em" strokeWidth={2.5} />
              {seats}
            </span>
          </span>
        </span>
      )}
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
