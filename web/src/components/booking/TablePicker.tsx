import { ArmchairIcon, BanIcon, CheckIcon, ChevronDownIcon, TriangleAlertIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type PublicArea, type PublicTable, usePublicTables } from '../../api/publicBooking.ts'
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
import { tableLooks, unavailableHatchId } from './tableLooks.ts'

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

/**
 * The guest's choice of table in the booking dialog. From 768 px on the plan of the chosen area large on the left (its floor
 * plan image or its drawn room, with the zoom buttons in its corner) and a column on the right: the areas as small cards with
 * photo and "N free", the legend, the chosen table, "No preference" and "Continue". On phones the areas are chips above the
 * plan in the full width, and the choice with "Continue" stays at the bottom of the screen. Free tables that fit the party
 * are outlined in the accent colour, the chosen one filled with a check, the others muted and hatched; hovering a table
 * names it ("Table R6 · up to 6 people"). A table just chosen gets a short pulse of a ring, and its details slide in. The
 * list of the free tables, folded away below the plan, is the way to choose with the keyboard and screen readers.
 */
export function TablePicker({ slug, date, time, guests, value, onChange, onContinue, onChangeTime, dark }: TablePickerProps) {
  const { t } = useTranslation()
  const areas = usePublicTables(slug, date, time, guests)
  const [activeArea, setActiveArea] = useState<string | null>(null)

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
  const free = area.tables.filter((table) => table.available)
  const selection =
    chosen !== undefined
      ? t('booking.table.selection', { number: chosen.table.number, count: chosen.table.seats, area: chosen.area.name })
      : t('booking.table.hint')

  const choose = (table: PublicTable) => {
    setActiveArea(areas.data.find((option) => option.tables.includes(table))?.id ?? null)
    onChange(table.id)
  }
  const noPreference = () => {
    const table = smallestFreeTable(areas.data)
    if (table !== null) {
      choose(table)
    }
  }
  const freeCount = (option: PublicArea) => option.tables.filter((table) => table.available).length

  return (
    // A grid around the whole step, so the actions at its end stay at the bottom of the screen on phones (StepActions).
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-[minmax(0,1fr)_17rem] md:grid-rows-[auto_1fr]">
      <HatchPattern />

      <div className="flex min-w-0 flex-col gap-4 md:row-span-2">
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
                onClick={() => setActiveArea(option.id)}
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
          // The list below is the accessible way to choose; the plan repeats it for pointer and touch.
          <FloorPlan
            imageUrl={area.floorPlanUrl}
            imageAlt=""
            roomStyle={area.roomStyle}
            roomElements={area.roomElements}
            tables={area.tables}
            tableScale={area.tableScale}
            ariaHidden
            zoomControls="inside"
            zoomButton={ZoomButton}
            dark={dark}
          >
            {area.tables.map((table) => {
              const selected = table.id === value
              const look = selected ? tableLooks.selected : table.available ? tableLooks.free : tableLooks.unavailable
              return (
                <Tooltip key={table.id}>
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
                      onClick={table.available ? () => choose(table) : undefined}
                      className={cn(
                        table.available ? 'cursor-pointer' : 'cursor-not-allowed',
                        // The ring around the table and its chairs, once, when it is chosen.
                        selected && cn('pulse-ring', table.shape === 'Round' ? 'rounded-full' : 'rounded-[20%]'),
                      )}
                      // Above the other tables, so its check is never covered.
                      style={{ zIndex: selected ? 2 : 1 }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {table.available
                      ? t('booking.table.tooltip', { number: table.number, count: table.seats })
                      : t('booking.table.tooltipUnavailable', { number: table.number, count: table.seats })}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </FloorPlan>
        )}

        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-ring [&::-webkit-details-marker]:hidden">
            {t('booking.table.showList')}
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border px-4 py-3">
            {free.length === 0 ? (
              <p className="text-sm">{t('booking.table.noneFreeInArea')}</p>
            ) : (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">{t('booking.table.listLabel', { area: area.name })}</legend>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {free.map((table) => (
                    <label key={table.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name="booking-table"
                        value={table.id}
                        checked={table.id === value}
                        onChange={() => choose(table)}
                        className="size-4 accent-primary focus-ring"
                      />
                      {t('booking.table.option', { number: table.number, count: table.seats })}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </details>
      </div>

      <div className="flex flex-col gap-5">
        <div role="group" aria-label={t('booking.table.areasLabel')} className="hidden flex-col gap-2 md:flex">
          {areas.data.map((option) => (
            <AreaCard key={option.id} area={option} freeCount={freeCount(option)} selected={option.id === area.id} onSelect={() => setActiveArea(option.id)} />
          ))}
        </div>

        <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-2 text-sm md:flex-col">
          <LegendItem swatch="border-[3px] border-primary bg-[color-mix(in_srgb,var(--primary)_18%,var(--card))]" label={t('booking.table.legend.free')} />
          <LegendItem
            swatch="border-[3px] border-foreground bg-primary text-primary-foreground"
            label={t('booking.table.legend.selected')}
            icon={<CheckIcon className="size-3" strokeWidth={3} />}
          />
          <LegendItem
            swatch="border border-muted-foreground bg-[repeating-linear-gradient(45deg,var(--input)_0_2px,var(--muted)_2px_5px)]"
            label={t('booking.table.legend.unavailable')}
          />
        </ul>

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
 * in the accent colour. Under the pointer it lifts a little and its photo zooms in its frame.
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
        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-4" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

/** The hatching of the tables that are not available, in the tokens of the page; referred to by `tableLooks`. */
function HatchPattern() {
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
