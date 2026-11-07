import { ArmchairIcon, BanIcon, CheckIcon, ChevronDownIcon, TriangleAlertIcon } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TableStyle } from '../../api/branding.ts'
import { type PublicArea, type PublicTable, usePublicTables } from '../../api/publicBooking.ts'
import { formatTime } from '../../i18n/format.ts'
import { useMediaQuery } from '../../lib/use-media-query.ts'
import { cn } from '../../lib/utils.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'
import { Photo } from '../../ui/photo.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip.tsx'
import { FloorPlan, type ZoomButtonProps } from '../floor-plan/FloorPlan.tsx'
import { TableShape } from '../floor-plan/TableShape.tsx'
import { RequestError } from './RequestError.tsx'
import { StepActions } from './StepActions.tsx'
import { tableLook, tableLooks, unavailableHatchId } from './tableLooks.ts'

type TablePickerProps = {
  slug: string
  date: string
  time: string
  guests: number
  /** The id of the chosen table. */
  value: string | null
  onChange: (tableId: string) => void
  onContinue: () => void
  onChangeTime: () => void
  /** The restaurant's dark mode: the drawn room and the tables suit it. */
  dark: boolean
  /** How the tables look, the restaurant's table style. */
  tableStyle: TableStyle
  /** In the large dialog: the step fills the dialog's height, and the plan takes all the room left. */
  fill: boolean
}

/**
 * The table the guest would pick if the system assigned it: the fewest seats; for equal sizes the order of the areas, then
 * the table number (the order in which the API lists them), as in the README's "Table assignment by the system".
 */
function smallestFreeTable(areas: PublicArea[]) {
  let best: PublicTable | null = null
  for (const table of areas.flatMap((area) => area.tables)) {
    if (table.available && (best === null || table.seats < best.seats)) {
      best = table
    }
  }
  return best
}

/** The tables in the order of their numbers (R2 before R10), the order in which the keyboard reaches them on the plan. */
function byNumber(tables: PublicTable[]) {
  return [...tables].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
}

/** How long the reason of a table that cannot be chosen shows after a tap, in milliseconds. */
const hintDuration = 2000

/**
 * The guest's choice of table in the booking dialog. From 768 px on the plan of the chosen area large on the left (its floor
 * plan image or its drawn room, with the zoom buttons in its corner, and a scale bar when its real width is known) and a
 * column on the right: the areas as small cards with photo and "N free", the legend, the chosen table, "No preference" and
 * "Continue"; in the large dialog (`fill`) the plan takes all the height left. On phones the areas are chips above the plan
 * in the full width, and the choice with "Continue" stays at the bottom of the screen. The tables are drawn in the
 * restaurant's table style (tableLooks): free tables that fit the party in the accent colour, the chosen one with a check,
 * the others muted; each has a badge with its number (and its seats on a large table) that stays readable however small
 * the table is. Hovering a free table lifts it a little and names it ("Table R6 · up to 6 people"); a table kept for larger
 * groups (its smallest party above the guests) says so ("Table R6 · too large for 2 people"), and the legend then notes that
 * larger tables stay free for larger groups. A table just chosen gives way a little and springs back, takes its new colours
 * with a short transition and gets a short pulse of a ring, and its details slide in. A tap on a table that cannot be chosen
 * dims it for a moment and says why at the table ("Taken at 19:30", "For 3 people or more") for about two seconds.
 * The plan zooms with the buttons, pinch, Ctrl + wheel and a double tap (FloorPlan's `fluid`); a table chosen from the list
 * or with the keyboard, or tapped on a phone, is brought into view at the current zoom. Another area crossfades the plans
 * (a view transition) and starts unzoomed. "No preference" chooses the table the system would and moves on to the contact
 * details. With the keyboard the free tables on the plan are buttons in the order of their numbers (Enter or Space
 * chooses), named like their tooltip; the others are announced but not focusable. The list of the free tables of all areas,
 * folded away below the plan, offers the same choice. With less motion everything changes at once.
 */
export function TablePicker({ slug, date, time, guests, value, onChange, onContinue, onChangeTime, dark, tableStyle, fill }: TablePickerProps) {
  const { t, i18n } = useTranslation()
  const areas = usePublicTables(slug, date, time, guests)
  const [activeArea, setActiveArea] = useState<string | null>(null)
  const phone = useMediaQuery('(max-width: 767px)')
  const rootRef = useRef<HTMLDivElement>(null)
  // The point of the plan to bring into view (a new object each time, see FloorPlan's `focus`).
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null)
  // The table whose tooltip is open (hover, keyboard focus), and the one whose reason shows after a tap.
  const [tip, setTip] = useState<string | null>(null)
  const [hint, setHint] = useState<{ id: string } | null>(null)
  // "No preference": the table chosen, to move on once the flow has it.
  const continueWith = useRef<string | null>(null)

  useEffect(() => {
    if (hint === null) {
      return
    }
    const timer = setTimeout(() => setHint(null), hintDuration)
    return () => clearTimeout(timer)
  }, [hint])

  // Moves on only once the chosen table is in the flow, so the next step carries it.
  useEffect(() => {
    if (continueWith.current !== null && value === continueWith.current) {
      continueWith.current = null
      onContinue()
    }
  }, [value, onContinue])

  if (areas.isPending) {
    return (
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]" aria-hidden="true">
        <Skeleton className="aspect-3/2 w-full" />
        <div className="hidden flex-col gap-3 md:flex">
          <Skeleton className="h-18" />
          <Skeleton className="h-18" />
          <Skeleton className="h-24" />
        </div>
      </div>
    )
  }
  if (areas.isError) {
    return <RequestError error={areas.error} onRetry={() => void areas.refetch()} />
  }

  const anyFree = areas.data.some((area) => area.tables.some((table) => table.available))
  if (!anyFree) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert variant="warning" role="note">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>{t('booking.table.noneFree')}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={onChangeTime}>
          {t('booking.table.otherTime')}
        </Button>
      </div>
    )
  }

  // Starts at the area of the chosen table, otherwise at the first area with a free table.
  const defaultArea =
    areas.data.find((area) => area.tables.some((table) => table.id === value)) ??
    areas.data.find((area) => area.tables.some((table) => table.available))!
  const area = areas.data.find((option) => option.id === activeArea) ?? defaultArea
  const chosen = areas.data.flatMap((option) => option.tables.map((table) => ({ table, area: option }))).find(({ table }) => table.id === value)
  const tooLarge = (table: PublicTable) => !table.available && guests < table.minGuests
  const selection =
    chosen !== undefined
      ? t('booking.table.selection', { number: chosen.table.number, count: chosen.table.seats, area: chosen.area.name })
      : t('booking.table.hint')

  const tooltip = (table: PublicTable) =>
    table.available
      ? t('booking.table.tooltip', { number: table.number, count: table.seats })
      : tooLarge(table)
        ? t('booking.table.tooltipTooLarge', { number: table.number, count: guests })
        : t('booking.table.tooltipUnavailable', { number: table.number, count: table.seats })
  const reason = (table: PublicTable) =>
    tooLarge(table)
      ? t('booking.table.reasonTooLarge', { count: table.minGuests })
      : t('booking.table.reasonTaken', { time: formatTime(time, i18n.resolvedLanguage ?? 'en') })

  /** Shows another area: the plans crossfade where the browser can (view transition), with less motion it simply changes. */
  const showArea = (id: string) => {
    if (id === area.id) {
      return
    }
    const reduce =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || rootRef.current?.closest('[data-reduce-motion]') != null
    if (reduce || !('startViewTransition' in document)) {
      setActiveArea(id)
      return
    }
    document.startViewTransition(() => flushSync(() => setActiveArea(id)))
  }

  /**
   * Chooses a table. From the list or the keyboard, and after a tap on a phone, the plan brings it into view; a tap with the
   * pointer on a larger screen leaves the plan where it is.
   */
  const choose = (table: PublicTable, from: 'plan' | 'list') => {
    const owner = areas.data.find((option) => option.tables.includes(table))
    onChange(table.id)
    if (owner !== undefined && owner.id !== area.id) {
      // The other area's plan starts unzoomed, with the whole plan in view.
      showArea(owner.id)
    } else if (from === 'list' || phone) {
      setFocus({ x: table.posX, y: table.posY })
    }
  }
  const noPreference = () => {
    const table = smallestFreeTable(areas.data)
    if (table === null) {
      return
    }
    if (table.id === value) {
      onContinue()
    } else {
      continueWith.current = table.id
      onChange(table.id)
    }
  }
  const handleTableKey = (event: KeyboardEvent, table: PublicTable) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(table, 'list')
    }
  }
  const freeCount = (option: PublicArea) => option.tables.filter((table) => table.available).length

  return (
    // A grid around the whole step, so the actions at its end stay at the bottom of the screen on phones (StepActions).
    <div
      ref={rootRef}
      className={cn(
        'grid gap-x-6 gap-y-5 md:grid-cols-[minmax(0,1fr)_17rem] md:grid-rows-[auto_1fr]',
        fill && 'md:min-h-0 md:flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]',
      )}
    >
      <HatchPattern />

      <div className={cn('flex min-w-0 flex-col gap-4 md:row-span-2', fill && 'md:min-h-0')}>
        {/* On phones the areas as chips that scroll sideways; the page itself never does. */}
        <div role="group" aria-label={t('booking.table.areasLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
          {areas.data.map((option) => {
            const count = freeCount(option)
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === area.id}
                disabled={count === 0}
                onClick={() => showArea(option.id)}
                className={cn(
                  'inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap press focus-ring disabled:cursor-not-allowed disabled:opacity-60',
                  option.id === area.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent',
                )}
              >
                {option.name}
                <span className={cn('text-xs', option.id === area.id ? 'opacity-90' : 'text-muted-foreground')}>
                  {count === 0 ? t('booking.table.fullyBooked') : t('booking.table.freeShort', { count })}
                </span>
              </button>
            )
          })}
        </div>

        {area.tables.length > 0 && (
          // The plan's own name for the view transition between the areas; the key starts every area unzoomed.
          <div className={cn('[view-transition-name:table-plan]', fill && 'md:flex md:min-h-0 md:flex-1 md:flex-col')}>
            <FloorPlan
              key={area.id}
              imageUrl={area.floorPlanUrl}
              imageAlt=""
              roomStyle={area.roomStyle}
              roomElements={area.roomElements}
              tables={area.tables}
              tableScale={area.tableScale}
              zoomControls="inside"
              zoomButton={ZoomButton}
              dark={dark}
              widthMeters={area.widthMeters}
              fill={fill}
              fluid
              focus={focus}
            >
              {byNumber(area.tables).map((table) => {
                const selected = table.id === value
                const look = tableLook(tableStyle, selected ? 'selected' : table.available ? 'free' : 'unavailable')
                const hinted = hint?.id === table.id
                return (
                  <Tooltip
                    key={table.id}
                    open={tip === table.id || hinted}
                    // The reason after a tap stays its two seconds, whatever the tooltip's hover and focus do meanwhile;
                    // another table's tooltip takes its place.
                    onOpenChange={(open) => {
                      setTip((current) => (open ? table.id : current === table.id ? null : current))
                      if (open) {
                        setHint((current) => (current?.id === table.id ? current : null))
                      }
                    }}
                  >
                    <TooltipTrigger asChild>
                      <TableShape
                        number={table.number}
                        seats={table.seats}
                        shape={table.shape}
                        rotation={table.rotation}
                        posX={table.posX}
                        posY={table.posY}
                        tableScale={area.tableScale}
                        dark={dark}
                        {...look}
                        note={selected ? <CheckIcon aria-hidden="true" className="my-px size-3" strokeWidth={3} /> : undefined}
                        // A free table is a button, named like its tooltip; one that cannot be chosen is only announced.
                        {...(table.available
                          ? {
                              role: 'button',
                              tabIndex: 0,
                              'aria-pressed': selected,
                              onClick: () => choose(table, 'plan'),
                              onKeyDown: (event: KeyboardEvent) => handleTableKey(event, table),
                              onFocus: (event) => {
                                if (event.currentTarget.matches(':focus-visible')) {
                                  setFocus({ x: table.posX, y: table.posY })
                                }
                              },
                            }
                          : {
                              role: 'img',
                              // The tooltip's own closing on a click is skipped (preventDefault): the reason shows instead.
                              onClick: (event) => {
                                event.preventDefault()
                                setHint({ id: table.id })
                              },
                            })}
                        aria-label={tooltip(table)}
                        className={cn(
                          // Above the other tables, so its check is never covered; under the pointer above all of them.
                          selected ? 'z-2' : 'z-1',
                          table.shape === 'Round' ? 'rounded-full' : 'rounded-[20%]',
                          // The colours of table, chairs and badge change with a short transition.
                          '[&_svg_*]:transition-[fill,stroke] [&_svg_*]:duration-(--motion-medium) [&>span_span]:transition-colors [&>span_span]:duration-(--motion-medium)',
                          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          table.available
                            ? 'cursor-pointer transition-[scale] duration-(--motion-fast) hover:z-3 motion-safe:hover:scale-110'
                            : 'cursor-not-allowed',
                          // Just chosen: it gives way and springs back, and the ring around it and its chairs pulses once.
                          selected && 'pulse-ring motion-safe:animate-table-settle',
                          hinted && 'motion-safe:animate-table-dip',
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">{hinted ? reason(table) : tooltip(table)}</TooltipContent>
                  </Tooltip>
                )
              })}
            </FloorPlan>
          </div>
        )}

        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-ring [&::-webkit-details-marker]:hidden">
            {t('booking.table.showList')}
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-4 border-t border-border px-4 py-3">
            {/* The free tables of every area, area by area. */}
            {areas.data.map((option) => {
              const free = byNumber(option.tables.filter((table) => table.available))
              return free.length === 0 ? (
                <div key={option.id}>
                  <p className="mb-1 text-sm font-semibold">{t('booking.table.listLabel', { area: option.name })}</p>
                  <p className="text-sm">{t('booking.table.noneFreeInArea')}</p>
                </div>
              ) : (
                <fieldset key={option.id}>
                  <legend className="mb-2 text-sm font-semibold">{t('booking.table.listLabel', { area: option.name })}</legend>
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    {free.map((table) => (
                      <label key={table.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="radio"
                          name="booking-table"
                          value={table.id}
                          checked={table.id === value}
                          onChange={() => choose(table, 'list')}
                          className="size-4 accent-primary focus-ring"
                        />
                        {t('booking.table.option', { number: table.number, count: table.seats })}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )
            })}
          </div>
        </details>
      </div>

      <div className="flex flex-col gap-5">
        <div role="group" aria-label={t('booking.table.areasLabel')} className="hidden flex-col gap-2 md:flex">
          {areas.data.map((option) => (
            <AreaCard key={option.id} area={option} freeCount={freeCount(option)} selected={option.id === area.id} onSelect={() => showArea(option.id)} />
          ))}
        </div>

        <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-2 text-sm md:flex-col">
          <LegendItem swatch={tableLooks[tableStyle].free.swatch} label={t('booking.table.legend.free')} />
          <LegendItem
            swatch={tableLooks[tableStyle].selected.swatch}
            label={t('booking.table.legend.selected')}
            icon={<CheckIcon className="size-3" strokeWidth={3} />}
          />
          <LegendItem swatch={tableLooks[tableStyle].unavailable.swatch} label={t('booking.table.legend.unavailable')} />
          {area.widthMeters !== null && <li className="text-muted-foreground">{t('booking.table.toScale')}</li>}
        </ul>
        {area.tables.some(tooLarge) && <p className="-mt-2 text-sm text-muted-foreground">{t('booking.table.largeTablesNote')}</p>}

        <div className="hidden flex-col gap-3 overflow-clip rounded-xl border border-border bg-muted/50 p-4 md:flex">
          <p aria-live="polite" className={cn('text-sm', chosen !== undefined && 'font-semibold')}>
            {/* A new element per table, so its details slide in; the live region itself stays, so it is announced. */}
            <span key={chosen?.table.id ?? ''} className="block animate-slide-in">
              {selection}
            </span>
          </p>
        </div>

        <Button variant="outline" className="self-start md:self-stretch" onClick={noPreference}>
          {t('booking.table.noPreference')}
        </Button>
      </div>

      <StepActions className="md:col-start-2 md:self-end">
        <p className="overflow-clip text-sm font-semibold md:hidden">
          <span key={chosen?.table.id ?? ''} className="block animate-slide-in">
            {selection}
          </span>
        </p>
        <Button size="lg" className="w-full" disabled={value === null} onClick={onContinue}>
          {t('booking.continue')}
        </Button>
      </StepActions>
    </div>
  )
}

/** A zoom button inside the plan, from the design system. */
function ZoomButton({ label, icon, disabled, onClick }: ZoomButtonProps) {
  return (
    <Button variant="outline" size="icon" aria-label={label} disabled={disabled} onClick={onClick} className="size-11 bg-card shadow-card">
      {icon}
    </Button>
  )
}

/**
 * An area as a small card: its photo (without one, or when it cannot be loaded, a calm surface with a chair), its name and
 * how many suitable tables are free. Without a free table it is disabled and says "Fully booked"; the chosen one has a ring
 * in the accent colour (crossfading with the plans, see showArea) and its check pops in. Under the pointer it lifts a little and its photo zooms in its frame.
 */
function AreaCard({ area, freeCount, selected, onSelect }: { area: PublicArea; freeCount: number; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  const full = freeCount === 0

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={full}
      aria-pressed={selected}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-2 text-left press focus-ring disabled:cursor-not-allowed',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-accent',
        !full && 'lift',
      )}
    >
      <Photo
        src={area.photoUrl}
        alt={t('booking.table.areaPhoto', { area: area.name })}
        className="size-14 shrink-0 rounded-lg"
        imageClassName={full ? 'grayscale' : 'transition-[opacity,scale] duration-(--motion-long) group-hover:scale-110'}
        fallback={
          <span className="flex items-center justify-center text-muted-foreground">
            <ArmchairIcon aria-hidden="true" className="size-6" />
          </span>
        }
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{area.name}</span>
        <span className={cn('flex items-center gap-1 text-sm', full ? 'text-muted-foreground' : 'text-primary-text')}>
          {full && <BanIcon aria-hidden="true" className="size-3.5" />}
          {full ? t('booking.table.fullyBooked') : t('booking.table.freeCount', { count: freeCount })}
        </span>
      </span>
      {selected && (
        <span aria-hidden="true" className="flex size-6 shrink-0 animate-pop-in items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-4" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

/** The hatching of the tables that are not available, in the tokens of the page; referred to by `tableLooks`. */
export function HatchPattern() {
  return (
    <svg width={0} height={0} aria-hidden="true" focusable="false" className="absolute">
      <defs>
        {/* In the plan's units (plan widths), so the stripes are as dense as the tables are large. */}
        <pattern id={unavailableHatchId} patternUnits="userSpaceOnUse" width={0.008} height={0.008} patternTransform="rotate(45)">
          <rect width={0.008} height={0.008} className="fill-(--muted)" />
          <rect width={0.003} height={0.008} className="fill-(--input)" />
        </pattern>
      </defs>
    </svg>
  )
}

function LegendItem({ swatch, label, icon }: { swatch: string; label: string; icon?: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded', swatch)}>{icon}</span>
      {label}
    </li>
  )
}
