import { ArmchairIcon, CircleAlertIcon, StoreIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { requestErrorMessage } from '../api/client.ts'
import { isNotFound, type PublicRestaurant, usePublicRestaurant } from '../api/publicBooking.ts'
import { BookingFlow } from '../components/booking/BookingFlow.tsx'
import { bookingSectionId, scrollToBooking } from '../components/booking/layout.ts'
import { OpeningHoursList } from '../components/booking/OpeningHoursList.tsx'
import { useOpeningStatus } from '../components/booking/openingStatus.ts'
import { ReservationCardSkeleton } from '../components/booking/ReservationCard.tsx'
import { RestaurantContact } from '../components/booking/RestaurantContact.tsx'
import { RestaurantHeader, RestaurantHeaderSkeleton } from '../components/booking/RestaurantHeader.tsx'
import { useDocumentTitle } from '../i18n/title.ts'
import { Button } from '../ui/button.tsx'
import { Reveal, Stagger } from '../ui/motion/reveal.tsx'
import { Photo } from '../ui/photo.tsx'
import { Skeleton } from '../ui/skeleton.tsx'
import { NotFound } from './NotFoundPage.tsx'

/** The content: 12 columns, at most 1200 px; from 1024 px on the information in 7 of them, the reservation card in 5. */
const gridClassName = 'mx-auto max-w-page px-4 sm:px-6 lg:grid lg:grid-cols-12 lg:gap-x-12'
const cardColumnClassName = 'pt-4 sm:pt-6 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:pt-12'
const infoColumnClassName = 'flex flex-col gap-12 pt-12 lg:col-span-7 lg:row-start-1'

/**
 * The booking page of a restaurant, like the restaurant pages of Resy, OpenTable or Tock. At the top its cover image (about
 * 60 % of the screen, at most 640 px; about 45 % on phones) with name, city and whether it is open today. Below it, from
 * 1024 px on, the information on the left (7 of 12 columns: about us, areas, opening hours, directions and contact) and the
 * reservation card on the right, which stays in view below the header. On phones the card comes right below the cover
 * image, the information after it, and a bar "Reserve a table" appears at the bottom of the screen once the card is
 * scrolled out of view. The sections below the first screen rise in once as they are scrolled into view (Reveal), the
 * area cards one after another (Stagger).
 */
export function RestaurantPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
  const restaurant = usePublicRestaurant(slug)
  useDocumentTitle(
    restaurant.isError && isNotFound(restaurant.error) ? t('restaurant.notFoundTitle') : t('home.reserve'),
    restaurant.data?.name ?? null,
  )

  if (restaurant.isPending) {
    return (
      <>
        <RestaurantHeaderSkeleton />
        <div className={gridClassName} aria-hidden="true">
          <div className={cardColumnClassName}>
            <ReservationCardSkeleton />
          </div>
          <div className={infoColumnClassName}>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          </div>
        </div>
      </>
    )
  }

  if (isNotFound(restaurant.error)) {
    return <NotFound icon={<StoreIcon />} title={t('restaurant.notFoundTitle')} text={t('restaurant.notFoundText')} />
  }

  if (restaurant.isError) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-6">
          <CircleAlertIcon />
        </span>
        <h1 className="font-display text-3xl">{t('errors.title')}</h1>
        <p className="text-muted-foreground">{requestErrorMessage(restaurant.error, t)}</p>
        <Button size="lg" variant="outline" onClick={() => void restaurant.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  return <RestaurantContent slug={slug} restaurant={restaurant.data} />
}

function RestaurantContent({ slug, restaurant }: { slug: string; restaurant: PublicRestaurant }) {
  const { t } = useTranslation()
  const status = useOpeningStatus(slug, restaurant)
  const { name, city, description, branding } = restaurant
  const contact = restaurant.street !== null || restaurant.city !== null || restaurant.phone !== null || restaurant.email !== null || restaurant.website !== null

  return (
    <>
      <RestaurantHeader name={name} city={city} coverUrl={branding.coverUrl} status={status} />
      <div className={gridClassName}>
        <div className={cardColumnClassName}>
          {/* Below the fixed header when it stays in view (sticky) or is brought into view. */}
          <div id={bookingSectionId} className="scroll-mt-20 lg:sticky lg:top-22">
            {/* A new restaurant starts a new booking. */}
            <BookingFlow key={slug} slug={slug} restaurant={restaurant} />
          </div>
        </div>

        <div className={infoColumnClassName}>
          {description !== null && (
            <Section title={t('booking.restaurant.about')}>
              <p className="max-w-prose text-lg leading-relaxed whitespace-pre-line">{description}</p>
            </Section>
          )}
          {restaurant.areas.length > 0 && (
            <Section title={t('booking.restaurant.areas')}>
              <AreaCards areas={restaurant.areas} />
            </Section>
          )}
          {restaurant.openingHours.length > 0 && (
            <Section title={t('booking.restaurant.openingHours')}>
              <OpeningHoursList restaurant={restaurant} today={status?.periods ?? null} />
            </Section>
          )}
          {contact && (
            <Section title={t('booking.restaurant.directions')}>
              <RestaurantContact restaurant={restaurant} />
            </Section>
          )}
        </div>
      </div>
      {restaurant.bookable && <ReserveBar />}
    </>
  )
}

/**
 * The restaurant's areas as photo cards with name and description, only to show the place: where the guest chooses the
 * table, the choice comes in the booking dialog. Without photo, or when it cannot be loaded, a calm surface with a chair.
 * Under the pointer a card lifts a little and its photo zooms softly in its frame.
 */
function AreaCards({ areas }: { areas: PublicRestaurant['areas'] }) {
  const { t } = useTranslation()

  return (
    <Stagger>
      <ul className="grid gap-6 sm:grid-cols-2">
        {areas.map((area) => (
          <li key={area.name} className="group flex flex-col gap-3 lift">
            <Photo
              src={area.photoUrl}
              alt={t('booking.table.areaPhoto', { area: area.name })}
              ratio="4/3"
              className="rounded-xl"
              imageClassName="transition-[opacity,scale] duration-(--motion-long) group-hover:scale-105"
              fallback={
                <span className="flex items-center justify-center text-muted-foreground">
                  <ArmchairIcon aria-hidden="true" className="size-10" strokeWidth={1.5} />
                </span>
              }
            />
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-xl">{area.name}</h3>
              {area.description !== null && <p className="text-muted-foreground">{area.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Stagger>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Reveal>
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl sm:text-3xl">{title}</h2>
        {children}
      </section>
    </Reveal>
  )
}

/**
 * Below 1024 px, where the reservation card does not stay in view: a bar at the bottom of the screen with "Reserve a table",
 * once the card is scrolled out of view; it brings the card back. Room below the page keeps the bar off its end.
 */
function ReserveBar() {
  const { t } = useTranslation()
  const [cardOutOfView, setCardOutOfView] = useState(false)

  useEffect(() => {
    const card = document.getElementById(bookingSectionId)
    if (card === null) {
      return
    }
    const observer = new IntersectionObserver(([entry]) => setCardOutOfView(!entry.isIntersecting))
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div aria-hidden="true" className="h-24 lg:hidden" />
      <div
        // Hidden from everyone while the card is in view; it then only repeats what is on the screen.
        inert={!cardOutOfView}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md transition-[translate,opacity] duration-(--motion-medium) lg:hidden ${
          cardOutOfView ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
        }`}
      >
        <Button size="lg" className="w-full" onClick={scrollToBooking}>
          {t('booking.reserveTable')}
        </Button>
      </div>
    </>
  )
}
