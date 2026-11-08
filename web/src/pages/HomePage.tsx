import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ConciergeBellIcon,
  PaletteIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  StoreIcon,
  UtensilsCrossedIcon,
} from 'lucide-react'
import { Fragment, type ReactNode, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams, useViewTransitionState } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { requestErrorMessage } from '../api/client.ts'
import { type Tenant, useTenants } from '../api/tenants.ts'
import { primaryVariables } from '../brandTheme.ts'
import { BrandLogo } from '../components/BrandLogo.tsx'
import { RestaurantFilterBar } from '../components/RestaurantFilterBar.tsx'
import { hasFilters, matchesFilters, noFilters, type RestaurantFilters, readFilters, writeFilters } from '../components/restaurantFilters.ts'
import { headerHeight } from '../components/booking/layout.ts'
import { PriceLevel } from '../components/booking/PriceLevel.tsx'
import { formatTime } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'
import { cn } from '../lib/utils.ts'
import { Button } from '../ui/button.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { ParallaxImage } from '../ui/motion/parallax-image.tsx'
import { Reveal, Stagger } from '../ui/motion/reveal.tsx'
import { Photo } from '../ui/photo.tsx'
import { SiteFooter } from '../ui/site-footer.tsx'
import { SiteHeader } from '../ui/site-header.tsx'
import { Skeleton } from '../ui/skeleton.tsx'

/** Text for the search: lower case, without accents, so "munchen" finds "München". */
function searchable(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
}

/** 1 column on phones, 2 on tablets, 3 on desktops. */
const gridClassName = 'grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3'

/** The photos of the start page, in `web/public/` (see CREDITS.md there). The large one comes in two widths. */
const heroPhoto = '/home-hero-1200.webp'
const heroPhotoSet = '/home-hero-1200.webp 1200w, /home-hero-2400.webp 2400w'

/** The three steps of "How it works", each with its picture and symbol. */
const steps = [
  { key: 'restaurant', photo: '/home-step-restaurant.webp', icon: <StoreIcon /> },
  { key: 'table', photo: '/home-step-table.webp', icon: <CalendarClockIcon /> },
  { key: 'confirmation', photo: '/home-step-confirmation.webp', icon: <CircleCheckIcon /> },
] as const

/** What the platform offers a restaurant, in "For restaurants". */
const benefits = [
  { key: 'booking', icon: <CalendarCheckIcon /> },
  { key: 'design', icon: <PaletteIcon /> },
  { key: 'frontDesk', icon: <ConciergeBellIcon /> },
] as const

/**
 * The start page, the platform's entrance, in its look (design system, src/ui), in five parts: a large photo of a laid table
 * in the evening (zooming in once, ParallaxImage) with the header lying transparently on it, the heading and a large search
 * by name or city that filters the restaurants as you type and scrolls softly down to them; the restaurants with a bar of
 * filters (RestaurantFilterBar, kept in the address, combined with the search) as photo cards that rise in one after another; "How it works" in three steps; "For restaurants" with the sign-in (or the way to the
 * own area); and the plain footer.
 */
export function HomePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('home.title'), null)
  const tenants = useTenants()
  const [query, setQuery] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const filtered = hasFilters(filters)
  const [hero, setHero] = useState<HTMLElement | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const id = useId()

  const search = searchable(query.trim())
  const matches =
    tenants.data?.filter(
      (tenant) =>
        (searchable(tenant.name).includes(search) || (tenant.city !== null && searchable(tenant.city).includes(search))) && matchesFilters(tenant, filters),
    ) ?? []
  // The search is offered while the restaurants load and when there are any.
  const withSearch = tenants.isPending || (tenants.isSuccess && tenants.data.length > 0)

  function changeQuery(value: string) {
    setQuery(value)
    // What is typed shows in the cards below, so they come into view: the page scrolls until the search field is just below
    // the header, with the cards below it. Not further, or the browser scrolls back to the field with the next letter.
    const input = searchInput.current
    if (value.trim() !== '' && input !== null) {
      const top = input.getBoundingClientRect().top + window.scrollY - headerHeight - 16
      if (window.scrollY < top) {
        window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
    }
  }

  function resetSearch() {
    setQuery('')
    searchInput.current?.focus()
  }

  // Every change is an entry in the history, so the back button takes it back; the page stays where it is.
  function changeFilters(next: RestaurantFilters) {
    setSearchParams(writeFilters(next), { preventScrollReset: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteHeader hero={hero} />

      <main className="flex-1">
        <section ref={setHero} className="relative flex h-[70svh] max-h-180 min-h-120 items-end overflow-clip bg-stone-900 text-white">
          {/* Only the mood of the page: the text on it says what it is about. The largest element of the page, loaded first. */}
          <ParallaxImage src={heroPhoto} srcSet={heroPhotoSet} sizes="100vw" alt="" className="bg-stone-900" />
          {/* Darkens the bottom for the text and the top for the header. */}
          <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/85 via-black/50 via-50% to-black/20" />
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/40 to-transparent" />
          <div className="relative mx-auto w-full max-w-page px-4 pt-24 pb-10 sm:px-6 sm:pb-16">
            <h1 className="max-w-3xl font-display text-4xl text-balance sm:text-5xl lg:text-6xl">{t('home.heading')}</h1>
            <p className="mt-4 max-w-2xl text-lg text-white/90 sm:text-xl">{t('home.subtitle')}</p>
            {withSearch && (
              <div role="search" className="relative mt-8 max-w-2xl">
                <Label htmlFor={`${id}-search`} className="sr-only">
                  {t('home.search')}
                </Label>
                <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInput}
                  id={`${id}-search`}
                  type="search"
                  placeholder={t('home.search')}
                  value={query}
                  onChange={(event) => changeQuery(event.currentTarget.value)}
                  autoComplete="off"
                  className="h-14 rounded-xl border-transparent pl-12 text-lg shadow-float touch:h-14"
                />
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby={`${id}-restaurants`} className="mx-auto max-w-page px-4 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
          <h2 id={`${id}-restaurants`} className="mb-8 font-display text-3xl">
            {tenants.isSuccess && tenants.data.length > 0 ? t('home.restaurantsCount', { count: matches.length }) : t('home.restaurants')}
          </h2>
          {/* Tells screen reader users how many restaurants the search leaves, as they type. */}
          <p role="status" className="sr-only">
            {tenants.isPending ? t('home.loading') : search !== '' || filtered ? t('home.results', { count: matches.length }) : ''}
          </p>
          {tenants.isSuccess && tenants.data.length > 0 && (
            <RestaurantFilterBar tenants={tenants.data} filters={filters} onChange={changeFilters} matchCount={matches.length} />
          )}

          {tenants.isPending ? (
            <div className={gridClassName} aria-hidden="true">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : tenants.isError ? (
            <PageState
              icon={<CircleAlertIcon />}
              tone="error"
              title={t('errors.title')}
              text={requestErrorMessage(tenants.error, t)}
              action={
                <Button variant="outline" size="lg" onClick={() => void tenants.refetch()}>
                  <RefreshCwIcon aria-hidden="true" />
                  {t('common.retry')}
                </Button>
              }
            />
          ) : tenants.data.length === 0 ? (
            <PageState icon={<UtensilsCrossedIcon />} title={t('home.emptyTitle')} text={t('home.empty')} />
          ) : matches.length === 0 ? (
            <PageState
              icon={<SearchXIcon />}
              title={search !== '' ? t('home.noMatchTitle', { query: query.trim() }) : t('home.filters.noMatchTitle')}
              text={filtered ? t('home.filters.noMatch') : t('home.noMatch')}
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  {filtered && (
                    <Button variant="outline" size="lg" onClick={() => changeFilters(noFilters)}>
                      {t('home.filters.reset')}
                    </Button>
                  )}
                  {search !== '' && (
                    <Button variant="outline" size="lg" onClick={resetSearch}>
                      {t('home.resetSearch')}
                    </Button>
                  )}
                </div>
              }
            />
          ) : (
            <Stagger>
              <ul className={gridClassName}>
                {matches.map((tenant) => (
                  <li key={tenant.id}>
                    <RestaurantCard tenant={tenant} />
                  </li>
                ))}
              </ul>
            </Stagger>
          )}
        </section>

        <HowItWorks />
        <ForRestaurants />
      </main>

      <SiteFooter />
    </div>
  )
}

/** "How it works": the three steps of a booking, each with a small picture, its symbol and one sentence. */
function HowItWorks() {
  const { t } = useTranslation()
  const id = useId()

  return (
    <section aria-labelledby={id} className="bg-muted">
      <div className="mx-auto max-w-page px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <h2 id={id} className="font-display text-3xl sm:text-4xl">
            {t('home.howItWorks.heading')}
          </h2>
        </Reveal>
        <Stagger>
          <ol className="mt-10 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.key} className="flex flex-col gap-4">
                <div className="relative">
                  {/* Only pictures of the step: its title says what it is. */}
                  <Photo src={step.photo} alt="" ratio="4/3" fallback={null} className="rounded-xl bg-stone-200" />
                  <span aria-hidden="true" className="absolute top-3 left-3 flex size-8 items-center justify-center rounded-full bg-background/90 text-sm font-semibold tabular-nums shadow-card">
                    {index + 1}
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-5 left-4 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-muted [&_svg]:size-5"
                  >
                    {step.icon}
                  </span>
                </div>
                <div className="flex flex-col gap-1 pt-4">
                  <h3 className="font-display text-xl">{t(`home.howItWorks.${step.key}Title`)}</h3>
                  <p className="text-muted-foreground">{t(`home.howItWorks.${step.key}Text`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Stagger>
      </div>
    </section>
  )
}

/**
 * "For restaurants": a photo from a restaurant's kitchen beside what the platform offers a restaurant in three points, and
 * the way in: "Sign in", or for a signed-in user the way to their own area, like the link in the header.
 */
function ForRestaurants() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const user = currentUser.data
  const id = useId()

  return (
    <Reveal>
      <section aria-labelledby={id} className="mx-auto max-w-page px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Only the mood: the text beside it says what it is about. */}
          <Photo src="/home-for-restaurants.webp" alt="" ratio="4/3" fallback={null} className="rounded-xl bg-stone-800" />
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold tracking-wide text-primary-text uppercase">{t('home.forRestaurants.eyebrow')}</p>
              <h2 id={id} className="font-display text-3xl text-balance sm:text-4xl">
                {t('home.forRestaurants.heading')}
              </h2>
              <p className="text-lg text-muted-foreground">{t('home.forRestaurants.text')}</p>
            </div>
            <ul className="flex flex-col gap-5">
              {benefits.map((benefit) => (
                <li key={benefit.key} className="flex gap-4">
                  <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-text [&_svg]:size-5">
                    {benefit.icon}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold">{t(`home.forRestaurants.${benefit.key}Title`)}</h3>
                    <p className="text-muted-foreground">{t(`home.forRestaurants.${benefit.key}Text`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div>
              {/* Until it is known whether someone is signed in, a placeholder of the button's size, so nothing moves. */}
              {user === undefined ? (
                <Skeleton className="h-12 w-40" />
              ) : (
                <Button asChild size="lg">
                  <Link to={user !== null ? homePath(user.role) : '/login'}>
                    {user !== null ? t('guest.toManagement') : t('home.forRestaurants.signIn')}
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  )
}

/** An empty, no-match or error state: a calm icon, a heading, a text and optionally what to do next. */
function PageState({ icon, tone = 'neutral', title, text, action }: { icon: ReactNode; tone?: 'neutral' | 'error'; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-12 text-center">
      <span
        aria-hidden="true"
        className={
          tone === 'error'
            ? 'flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-6'
            : 'flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-text [&_svg]:size-6'
        }
      >
        {icon}
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-2xl wrap-anywhere">{title}</h3>
        <p className="text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  )
}

/**
 * A restaurant as a card that is one link to its booking page, in the style of large marketplaces: the photo in 4:3 with
 * rounded corners, the card lifting a little and the photo zooming in softly under the pointer, with the logo as a badge on
 * a light surface in its lower left corner; below it the name, a line with the cuisines, the price level and the city
 * (e.g. "Bavarian · €€ · München"), the description cut to two lines and "Reserve a
 * table" with an arrow in the restaurant's accent colour. A small chip on the photo's upper left corner tells whether it is
 * open today, with today's hours ("Open today · 08:00–17:00" or "Closed today"). Without photo, or when it cannot be loaded, a calm surface in a
 * light tint of the accent colour (the platform's without one) with the logo or the name. Opening it, the photo moves into
 * the cover image of the booking page (view transition, app.css).
 */
function RestaurantCard({ tenant }: { tenant: Tenant }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  // The card's own accent colour, as on the restaurant's light pages; without one, the platform's stays.
  const variables = useMemo(() => (tenant.brandColor !== null ? primaryVariables(tenant.brandColor, 'light') : undefined), [tenant.brandColor])
  const [coverFailed, setCoverFailed] = useState(false)
  const withCover = tenant.coverUrl !== null && !coverFailed
  const to = `/r/${encodeURIComponent(tenant.slug)}`
  // Only the card being opened carries the name of the shared element: a name may only be on one element at a time.
  const opening = useViewTransitionState(to)
  // Below the name, e.g. "Bavarian · €€ · München".
  const facts = [
    ...(tenant.cuisines.length > 0 ? [tenant.cuisines.map((cuisine) => t(`restaurantDetails.cuisines.${cuisine}`)).join(', ')] : []),
    ...(tenant.priceLevel !== null ? [<PriceLevel key="price" level={tenant.priceLevel} />] : []),
    ...(tenant.city !== null ? [tenant.city] : []),
  ]
  const today = tenant.openToday
    ? t('booking.restaurant.openToday', {
        hours: tenant.todayHours
          .map((period) => t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) }))
          .join(', '),
      })
    : t('booking.restaurant.closedToday')

  const name = (
    <span aria-hidden="true" className="line-clamp-2 text-center font-display text-2xl wrap-anywhere">
      {tenant.name}
    </span>
  )

  return (
    <Link to={to} viewTransition style={variables} className="group relative flex h-full flex-col gap-4 rounded-xl lift focus-ring">
      {/* Photo and logo only accompany the name below, so they have no text alternative. */}
      <div className={cn('relative', opening && '[view-transition-name:restaurant-cover]')}>
        <Photo
          src={tenant.coverUrl}
          alt=""
          ratio="4/3"
          onError={() => setCoverFailed(true)}
          className="rounded-xl bg-primary-50"
          imageClassName="transition-[opacity,scale] duration-(--motion-medium) group-hover:scale-105 motion-reduce:group-hover:scale-100"
          fallback={
            <span className="flex items-center justify-center p-6 text-foreground">
              {tenant.logoUrl !== null ? (
                <BrandLogo src={tenant.logoUrl} height={64} maxWidth={240} accent="var(--primary)" loading="lazy" fallback={name} />
              ) : (
                name
              )}
            </span>
          }
        />
        {withCover && tenant.logoUrl !== null && (
          <span className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] rounded-lg bg-white/90 px-3 py-2 shadow-card backdrop-blur-sm">
            <BrandLogo src={tenant.logoUrl} height={36} maxWidth={160} accent="var(--primary)" loading="lazy" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <h2 className="font-display text-xl wrap-anywhere">{tenant.name}</h2>
        {facts.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {facts.map((fact, index) => (
              <Fragment key={index}>
                {index > 0 && ' · '}
                {fact}
              </Fragment>
            ))}
          </p>
        )}
        {tenant.description !== null && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tenant.description}</p>}
        <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-primary-text">
          {t('home.reserve')}
          <ArrowRightIcon aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" />
        </span>
      </div>
      {/* On the photo, but after the name, so the link is named by the restaurant first. */}
      <span className="absolute top-3 left-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-2xl bg-stone-950/75 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
        {/* The text says it; the dot only repeats it. */}
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', tenant.openToday ? 'bg-green-400' : 'bg-red-400')} />
        {today}
      </span>
    </Link>
  )
}

/** A card while the restaurants load, in the format of RestaurantCard. */
function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="aspect-4/3 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-3/5" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-2 h-5 w-36" />
      </div>
    </div>
  )
}
