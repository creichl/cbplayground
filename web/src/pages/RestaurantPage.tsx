import { CircleAlertIcon, SearchXIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
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
import { Skeleton } from '../ui/skeleton.tsx'

/** The content: 12 columns, at most 1200 px; from 1024 px on the information in 7 of them, the reservation card in 5. */
const gridClassName = 'mx-auto max-w-page px-4 sm:px-6 lg:grid lg:grid-cols-12 lg:gap-x-12'
const cardColumnClassName = 'pt-4 sm:pt-6 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:pt-12'
const infoColumnClassName = 'flex flex-col gap-12 pt-12 lg:col-span-7 lg:row-start-1'

/**
 * The booking page of a restaurant, like the restaurant pages of Resy, OpenTable or Tock. At the top its cover image (about
 * 60 % of the screen, at most 640 px; about 45 % on phones) with name, city and whether it is open today. Below it, from
 * 1024 px on, the information on the left (7 of 12 columns: about us, opening hours, directions and contact) and the
 * reservation card on the right, which stays in view below the header. On phones the card comes right below the cover
 * image, the information after it, and a bar "Reserve a table" appears at the bottom of the screen once the card is
 * scrolled out of view.
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

  if (restaurant.isError) {
    const notFound = isNotFound(restaurant.error)
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <span
          aria-hidden="true"
          className={
            notFound
              ? 'flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-text dark:bg-accent [&_svg]:size-6'
              : 'flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-6'
          }
        >
          {notFound ? <SearchXIcon /> : <CircleAlertIcon />}
        </span>
        <h1 className="font-display text-3xl">{notFound ? t('restaurant.notFoundTitle') : t('errors.title')}</h1>
        <p className="text-muted-foreground">{notFound ? t('restaurant.notFoundText') : requestErrorMessage(restaurant.error, t)}</p>
        {notFound ? (
          <Button asChild size="lg">
            <Link to="/">{t('common.backToStart')}</Link>
          </Button>
        ) : (
          <Button size="lg" variant="outline" onClick={() => void restaurant.refetch()}>
            {t('common.retry')}
          </Button>
        )}
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl sm:text-3xl">{title}</h2>
      {children}
    </section>
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
