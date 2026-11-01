import { ArrowRightIcon, CircleAlertIcon, RefreshCwIcon, SearchIcon, SearchXIcon, UtensilsCrossedIcon } from 'lucide-react'
import { type ReactNode, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { requestErrorMessage } from '../api/client.ts'
import { type Tenant, useTenants } from '../api/tenants.ts'
import { primaryVariables } from '../brandTheme.ts'
import { BrandLogo } from '../components/BrandLogo.tsx'
import { useDocumentTitle } from '../i18n/title.ts'
import { Button } from '../ui/button.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
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

/**
 * The start page, in the platform's look (design system, src/ui): a short introduction with a large search by name or city
 * that filters the restaurants as you type, and the restaurants as a grid of cards with photo. Each card carries the
 * restaurant's accent colour.
 */
export function HomePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('home.title'), null)
  const tenants = useTenants()
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const searchId = useId()

  const search = searchable(query.trim())
  const matches =
    tenants.data?.filter(
      (tenant) => searchable(tenant.name).includes(search) || (tenant.city !== null && searchable(tenant.city).includes(search)),
    ) ?? []
  // The search is offered while the restaurants load and when there are any.
  const withSearch = tenants.isPending || (tenants.isSuccess && tenants.data.length > 0)

  function resetSearch() {
    setQuery('')
    searchInput.current?.focus()
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <SiteHeader />

      <main className="flex-1">
        <section className="bg-linear-to-b from-primary-50 to-background">
          <div className="mx-auto max-w-page px-4 pt-12 pb-10 sm:px-6 sm:pt-20 sm:pb-12">
            <h1 className="max-w-3xl font-display text-4xl text-balance sm:text-5xl">{t('home.heading')}</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{t('home.subtitle')}</p>
            {withSearch && (
              <div role="search" className="relative mt-8 max-w-2xl">
                <Label htmlFor={searchId} className="sr-only">
                  {t('home.search')}
                </Label>
                <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInput}
                  id={searchId}
                  type="search"
                  placeholder={t('home.search')}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  autoComplete="off"
                  className="h-14 rounded-xl pl-12 text-lg shadow-card touch:h-14"
                />
              </div>
            )}
          </div>
        </section>

        <div className="mx-auto max-w-page px-4 pt-6 pb-16 sm:px-6 sm:pb-24">
          {/* Tells screen reader users how many restaurants the search leaves, as they type. */}
          <p role="status" className="sr-only">
            {tenants.isPending ? t('home.loading') : search !== '' ? t('home.results', { count: matches.length }) : ''}
          </p>

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
              title={t('home.noMatchTitle', { query: query.trim() })}
              text={t('home.noMatch')}
              action={
                <Button variant="outline" size="lg" onClick={resetSearch}>
                  {t('home.resetSearch')}
                </Button>
              }
            />
          ) : (
            <ul className={gridClassName}>
              {matches.map((tenant, index) => (
                <li key={tenant.id}>
                  <RestaurantCard tenant={tenant} priority={index === 0} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
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
        <h2 className="font-display text-2xl wrap-anywhere">{title}</h2>
        <p className="text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  )
}

/**
 * A restaurant as a card that is one link to its booking page, in the style of large marketplaces: the photo in 4:3 with
 * rounded corners, zooming in softly under the pointer, with the logo on it; below it the name, the city, the description
 * cut to two lines and "Reserve a table" with an arrow in the restaurant's accent colour. Without photo, or when it cannot be
 * loaded, a calm surface in a light tint of the accent colour (the platform's without one) with the logo or the name.
 */
function RestaurantCard({ tenant, priority }: { tenant: Tenant; priority: boolean }) {
  const { t } = useTranslation()
  // The card's own accent colour, as on the restaurant's light pages; without one, the platform's stays.
  const variables = useMemo(() => (tenant.brandColor !== null ? primaryVariables(tenant.brandColor, 'light') : undefined), [tenant.brandColor])
  const [coverFailed, setCoverFailed] = useState(false)
  const withCover = tenant.coverUrl !== null && !coverFailed

  const name = (
    <span aria-hidden="true" className="line-clamp-2 text-center font-display text-2xl wrap-anywhere">
      {tenant.name}
    </span>
  )

  return (
    <Link to={`/r/${encodeURIComponent(tenant.slug)}`} style={variables} className="group flex h-full flex-col gap-4 rounded-xl focus-ring">
      {/* Photo and logo only accompany the name below, so they have no text alternative. */}
      <div className="relative">
        <Photo
          src={tenant.coverUrl}
          alt=""
          ratio="4/3"
          priority={priority}
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
          <>
            {/* Darkens the bottom of the photo a little, so a light logo stands out. */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl bg-linear-to-t from-black/45 to-transparent to-50%" />
            <span className="absolute right-4 bottom-4 left-4">
              <BrandLogo src={tenant.logoUrl} height={56} maxWidth={200} accent="var(--primary)" onPhoto loading="lazy" />
            </span>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <h2 className="font-display text-xl wrap-anywhere">{tenant.name}</h2>
        {tenant.city !== null && <p className="text-sm text-muted-foreground">{tenant.city}</p>}
        {tenant.description !== null && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tenant.description}</p>}
        <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-primary-text">
          {t('home.reserve')}
          <ArrowRightIcon aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" />
        </span>
      </div>
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
