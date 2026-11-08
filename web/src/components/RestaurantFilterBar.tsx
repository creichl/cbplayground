import { SlidersHorizontalIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cuisines as allCuisines, priceLevels, type RestaurantFeature, restaurantFeatures } from '../api/restaurantDetails.ts'
import type { Tenant } from '../api/tenants.ts'
import { useMediaQuery } from '../lib/use-media-query.ts'
import { cn } from '../lib/utils.ts'
import { Button } from '../ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet.tsx'
import { featureIcons } from './booking/featureIcons.ts'
import { hasFilters, noFilters, type RestaurantFilters } from './restaurantFilters.ts'

/**
 * What the bar offers, from all restaurants (not only the matching ones, so nothing disappears while filtering). A filter
 * is only offered when the restaurants differ in it: at least two cities, cuisines or price levels, some open today and some
 * not, and only the features some restaurants have and others not. A value set in the address is always offered, so it can
 * be taken back.
 */
function filterOptions(tenants: Tenant[], filters: RestaurantFilters, language: string) {
  const atLeastTwo = <T,>(values: T[], chosen: boolean) => (values.length >= 2 || chosen ? values : [])
  const cities = [...new Set([...tenants.flatMap((tenant) => (tenant.city !== null ? [tenant.city] : [])), ...(filters.city !== null ? [filters.city] : [])])].sort(
    (a, b) => a.localeCompare(b, language),
  )
  const cuisines = allCuisines.filter((cuisine) => filters.cuisines.includes(cuisine) || tenants.some((tenant) => tenant.cuisines.includes(cuisine)))
  const prices = priceLevels.filter((level) => filters.prices.includes(level) || tenants.some((tenant) => tenant.priceLevel === level))
  return {
    cities: atLeastTwo(cities, filters.city !== null),
    cuisines: atLeastTwo(cuisines, filters.cuisines.length > 0),
    prices: atLeastTwo(prices, filters.prices.length > 0),
    openToday: filters.openToday || (tenants.some((tenant) => tenant.openToday) && tenants.some((tenant) => !tenant.openToday)),
    features: restaurantFeatures.filter(
      (feature) =>
        filters.features.includes(feature) ||
        (tenants.some((tenant) => tenant.features.includes(feature)) && tenants.some((tenant) => !tenant.features.includes(feature))),
    ),
  }
}

/** A toggle of the bar: a rounded chip, filled in the accent colour while on. */
const chipClassName =
  'inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap press focus-ring touch:h-11 [&_svg]:size-4'
const chipOn = 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover'
const chipOff = 'border-input bg-background hover:border-primary hover:bg-primary-50 dark:hover:bg-accent'

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={cn(chipClassName, pressed ? chipOn : chipOff)}>
      {children}
    </button>
  )
}

/** A thin line between the groups of the bar. */
const divider = <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />

/** The value of "All cities" in the select: a city is stored trimmed, so it is never a single space. */
const allCities = ' '

function toggled<T>(values: readonly T[], value: T, all: readonly T[]) {
  return all.filter((candidate) => (candidate === value ? !values.includes(value) : values.includes(candidate)))
}

type FilterBarProps = {
  tenants: Tenant[]
  filters: RestaurantFilters
  onChange: (filters: RestaurantFilters) => void
  /** How many restaurants the search and the filters leave, for the button that closes the sheet on phones. */
  matchCount: number
}

/**
 * The filters of the start page as one bar in the design system, like OpenTable's: the city as a select, the cuisines and
 * the price levels as chips (several = any of them), "Open today" as a toggle, "More filters" with the features as checkboxes
 * (all chosen ones must be there) in a popover, on phones in a sheet, and "Reset filters" while any is set. On phones the bar
 * scrolls sideways, from 768 px on it wraps. Renders nothing when the restaurants do not differ in any filter.
 */
export function RestaurantFilterBar({ tenants, filters, onChange, matchCount }: FilterBarProps) {
  const { t, i18n } = useTranslation()
  const options = filterOptions(tenants, filters, i18n.resolvedLanguage ?? 'en')
  const active = hasFilters(filters)

  const groups = [
    options.cities.length > 0 && (
      <Select key="city" value={filters.city ?? allCities} onValueChange={(value) => onChange({ ...filters, city: value === allCities ? null : value })}>
        <SelectTrigger
          aria-label={t('home.filters.city')}
          className={cn('h-10 w-auto shrink-0 rounded-full px-4 text-sm font-medium', filters.city !== null && 'border-primary ring-1 ring-primary')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allCities}>{t('home.filters.allCities')}</SelectItem>
          {options.cities.map((city) => (
            <SelectItem key={city} value={city}>
              {city}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    options.cuisines.length > 0 && (
      <div key="cuisine" role="group" aria-label={t('home.filters.cuisine')} className="flex shrink-0 gap-2">
        {options.cuisines.map((cuisine) => (
          <Chip key={cuisine} pressed={filters.cuisines.includes(cuisine)} onClick={() => onChange({ ...filters, cuisines: toggled(filters.cuisines, cuisine, allCuisines) })}>
            {t(`restaurantDetails.cuisines.${cuisine}`)}
          </Chip>
        ))}
      </div>
    ),
    options.prices.length > 0 && (
      <div key="price" role="group" aria-label={t('home.filters.price')} className="flex shrink-0 gap-2">
        {options.prices.map((level) => (
          <Chip key={level} pressed={filters.prices.includes(level)} onClick={() => onChange({ ...filters, prices: toggled(filters.prices, level, priceLevels) })}>
            <span aria-hidden="true" className="tabular-nums">
              {'€'.repeat(level)}
            </span>
            <span className="sr-only">{t('restaurantDetails.priceLevel', { level })}</span>
          </Chip>
        ))}
      </div>
    ),
    options.openToday && (
      <Chip key="open" pressed={filters.openToday} onClick={() => onChange({ ...filters, openToday: !filters.openToday })}>
        {t('home.filters.openToday')}
      </Chip>
    ),
    options.features.length > 0 && <MoreFilters key="more" features={options.features} filters={filters} onChange={onChange} matchCount={matchCount} />,
  ].filter((group) => group !== false)

  if (groups.length === 0 && !active) {
    return null
  }

  return (
    <div
      role="group"
      aria-label={t('home.filters.label')}
      className="-mx-4 mb-8 flex items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {groups.map((group, index) => (
        <div key={index} className="contents">
          {index > 0 && divider}
          {group}
        </div>
      ))}
      {active && (
        <Button variant="link" size="sm" className="shrink-0" onClick={() => onChange(noFilters)}>
          {t('home.filters.reset')}
        </Button>
      )}
    </div>
  )
}

/**
 * "More filters": the features some restaurants have as checkboxes, with the number of chosen ones on the button. From 768 px
 * on in a popover below the button, on phones in a sheet from the bottom with a button that shows the matches.
 */
function MoreFilters({ features, filters, onChange, matchCount }: { features: RestaurantFeature[]; filters: RestaurantFilters; onChange: (filters: RestaurantFilters) => void; matchCount: number }) {
  const { t } = useTranslation()
  const wide = useMediaQuery('(min-width: 768px)')
  const id = useId()
  const count = filters.features.length

  const trigger = (
    <button type="button" className={cn(chipClassName, count > 0 ? chipOn : chipOff)}>
      <SlidersHorizontalIcon aria-hidden="true" />
      {t('home.filters.more')}
      {count > 0 && (
        <>
          <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full bg-primary-foreground text-xs text-primary tabular-nums">
            {count}
          </span>
          <span className="sr-only">{t('home.filters.selected', { count })}</span>
        </>
      )}
    </button>
  )

  const checklist = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('home.filters.moreHint')}</p>
      <ul className="flex flex-col">
        {features.map((feature) => {
          const Icon = featureIcons[feature]
          return (
            <li key={feature}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent">
                <input
                  type="checkbox"
                  checked={filters.features.includes(feature)}
                  onChange={() => onChange({ ...filters, features: toggled(filters.features, feature, restaurantFeatures) })}
                  className="size-4 shrink-0 accent-primary focus-ring"
                />
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm">{t(`restaurantDetails.features.${feature}`)}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )

  if (wide) {
    return (
      <Popover>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" aria-labelledby={id} className="flex w-80 flex-col gap-2">
          <h3 id={id} className="font-display text-lg">
            {t('home.filters.more')}
          </h3>
          {checklist}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{t('home.filters.more')}</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-6 pt-3">{checklist}</div>
        <SheetFooter className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetClose asChild>
            <Button size="lg">{t('home.filters.show', { count: matchCount })}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
