import { ArmchairIcon, CircleAlertIcon, StoreIcon } from 'lucide-react'
import { type ReactNode, use, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useParams } from 'react-router'
import { requestErrorMessage } from '../api/client.ts'
import { usePublicMenu } from '../api/menu.ts'
import { isNotFound, type PublicRestaurant, usePublicRestaurant } from '../api/publicBooking.ts'
import { AboutUs } from '../components/booking/AboutUs.tsx'
import { BookingFlow } from '../components/booking/BookingFlow.tsx'
import { Gallery } from '../components/booking/Gallery.tsx'
import { GoodToKnow } from '../components/booking/GoodToKnow.tsx'
import { MenuSection } from '../components/booking/MenuSection.tsx'
import { bookingSectionId, hasContact, hasHours, hasHoursOrLocation, PastHeroContext, scrollToBooking, sectionIds } from '../components/booking/layout.ts'
import { HoursAndLocation, HoursAndLocationSkeleton } from '../components/booking/HoursAndLocation.tsx'
import { useOpeningStatus } from '../components/booking/openingStatus.ts'
import { ReservationCardSkeleton } from '../components/booking/ReservationCard.tsx'
import { RestaurantContact } from '../components/booking/RestaurantContact.tsx'
import { RestaurantHeader, RestaurantHeaderSkeleton } from '../components/booking/RestaurantHeader.tsx'
import { type PageSection, SectionNav, sectionsEndId } from '../components/booking/SectionNav.tsx'
import { useDocumentTitle } from '../i18n/title.ts'
import { cn } from '../lib/utils.ts'
import { Button } from '../ui/button.tsx'
import { Reveal, Stagger } from '../ui/motion/reveal.tsx'
import { Photo } from '../ui/photo.tsx'
import { NotFound } from './NotFoundPage.tsx'

/** What the guest does to move on their own: it ends keeping a section from the address in place. */
const guestInput = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/** The content: 12 columns, at most 1200 px; from 1024 px on the information in 7 of them, the reservation card in 5. */
const gridClassName = 'mx-auto max-w-page px-4 sm:px-6 lg:grid lg:grid-cols-12 lg:gap-x-12'
const cardColumnClassName = 'pt-4 sm:pt-6 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:pt-12'
const infoColumnClassName = 'flex flex-col gap-12 pt-12 lg:col-span-7 lg:row-start-1'

/**
 * The booking page of a restaurant, like the restaurant pages of Resy, OpenTable or Tock. At the top its cover image (about
 * 60 % of the screen, at most 640 px; about 45 % on phones) with name, city, cuisines, price level and whether it is open
 * now (the live status, openingStatus.ts). Below it, from 1024 px on, the information on the left (7 of 12 columns: the card
 * "Hours & location" with the live status, today's hours, the week, the coming closing days and special hours, the address and
 * the phone; then the photo gallery, about us with the features, the menu, the areas, "Good to know", the least important,
 * and contact) and the reservation card on the right, which stays in view below the header. On phones the reservation card
 * comes right below the cover image, the information after it, starting with "Hours & location", and a bar "Reserve a table" appears at the bottom of the screen once the card is
 * scrolled out of view. Once the page has scrolled past the cover image, a section navigation below the header lists the
 * sections the page has (SectionNav); every section has a stable id (sectionIds), so `/r/<slug>#menu` opens at the menu.
 * The sections below the first screen rise in once as they are scrolled into view (Reveal), the
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
            <HoursAndLocationSkeleton />
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
  const status = useOpeningStatus(restaurant)
  const { name, city, description, branding, cuisines, features, houseRules, faq } = restaurant
  const pastHero = use(PastHeroContext)
  const { hash } = useLocation()
  const target = decodeURIComponent(hash.slice(1))
  const wantsSection = Object.values<string>(sectionIds).includes(target)
  // Whether the page has a menu is known once it is loaded: for the navigation, and before going to a section from the
  // address, so the menu above it does not push it away. Otherwise the menu loads when it comes near (MenuSection).
  const menu = usePublicMenu(slug, pastHero || wantsSection)

  // In page order, the same on every layout: "Hours & location" is the first block of the information.
  const sections: PageSection[] = [
    ...(hasHoursOrLocation(restaurant)
      ? [{ id: sectionIds.openingHours, title: hasHours(restaurant) ? t('booking.restaurant.openingHours') : t('booking.restaurant.hoursAndLocation') }]
      : []),
    ...(restaurant.gallery.length > 0 ? [{ id: sectionIds.photos, title: t('booking.gallery.title') }] : []),
    ...(description !== null || features.length > 0 ? [{ id: sectionIds.about, title: t('booking.restaurant.about') }] : []),
    ...(menu.data !== undefined && menu.data.sections.length > 0 ? [{ id: sectionIds.menu, title: t('booking.menu.title') }] : []),
    ...(restaurant.areas.length > 0 ? [{ id: sectionIds.areas, title: t('booking.restaurant.areas') }] : []),
    ...(houseRules !== null || faq.length > 0 ? [{ id: sectionIds.goodToKnow, title: t('restaurantDetails.guest.goodToKnow') }] : []),
    ...(hasContact(restaurant) ? [{ id: sectionIds.contact, title: t('booking.restaurant.contact') }] : []),
  ]

  // A section in the address (`#menu`) is brought into view once, as soon as the menu above it has loaded (or failed). Two
  // frames later, so the sections that rise in when they come into view (Reveal) have started watching for it and the jump
  // is a scroll like any other. Content above it may still grow (on phones the reservation card's times), and the browser's
  // scroll anchoring pauses while the section rises in: so the section is kept in place whenever the page changes its size,
  // until the guest scrolls, taps or types.
  const scrolledTo = useRef<string | null>(null)
  const menuPending = menu.isPending
  useEffect(() => {
    if (!wantsSection || menuPending || scrolledTo.current === target) {
      return
    }
    let observer: ResizeObserver | undefined
    const release = () => {
      observer?.disconnect()
      for (const type of guestInput) window.removeEventListener(type, release)
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const section = document.getElementById(target)
        if (section === null) {
          return
        }
        scrolledTo.current = target
        section.scrollIntoView({ block: 'start' })
        observer = new ResizeObserver(() => section.scrollIntoView({ block: 'start' }))
        observer.observe(document.body)
        for (const type of guestInput) window.addEventListener(type, release, { passive: true })
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      release()
    }
  }, [target, wantsSection, menuPending])

  return (
    <>
      <RestaurantHeader
        name={name}
        city={city}
        coverUrl={branding.coverUrl}
        facts={cuisines.length > 0 ? [cuisines.map((cuisine) => t(`restaurantDetails.cuisines.${cuisine}`)).join(', ')] : []}
        priceLevel={restaurant.priceLevel}
        status={status !== null ? { tone: status.tone, text: status.shortText } : null}
      />
      <div className={gridClassName}>
        <div className={cardColumnClassName}>
          {/* Below the fixed header and the section navigation when it stays in view (sticky) or is brought into view. */}
          <div id={bookingSectionId} className="scroll-mt-36 lg:sticky lg:top-36">
            {/* A new restaurant starts a new booking. */}
            <BookingFlow key={slug} slug={slug} restaurant={restaurant} />
          </div>
        </div>

        <div className={infoColumnClassName}>
          <HoursAndLocation restaurant={restaurant} status={status} />
          <Gallery photos={restaurant.gallery} restaurantName={name} />
          {(description !== null || features.length > 0) && (
            <Section id={sectionIds.about} title={t('booking.restaurant.about')}>
              <AboutUs description={description} features={features} />
            </Section>
          )}
          <MenuSection slug={slug} restaurantName={name} />
          {restaurant.areas.length > 0 && (
            <Section id={sectionIds.areas} title={t('booking.restaurant.areas')}>
              <AreaCards areas={restaurant.areas} />
            </Section>
          )}
          {(houseRules !== null || faq.length > 0) && (
            <Section id={sectionIds.goodToKnow} title={t('restaurantDetails.guest.goodToKnow')} className="gap-3">
              <GoodToKnow houseRules={houseRules} faq={faq} />
            </Section>
          )}
          {hasContact(restaurant) && (
            <Section id={sectionIds.contact} title={t('booking.restaurant.contact')}>
              <RestaurantContact restaurant={restaurant} />
            </Section>
          )}
        </div>
      </div>
      <div id={sectionsEndId} aria-hidden="true" />
      {restaurant.bookable && <ReserveBar />}
      <SectionNav sections={sections} visible={pastHero} />
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

/**
 * A section of the page, with its id for the section navigation; its heading takes the focus when the navigation brings it
 * into view. `className`, e.g. less spacing for a quieter section.
 */
function Section({ id, title, className, children }: { id: string; title: string; className?: string; children: ReactNode }) {
  return (
    <Reveal>
      <section id={id} aria-labelledby={`${id}-heading`} className={cn('flex scroll-mt-36 flex-col gap-4', className)}>
        <h2 id={`${id}-heading`} tabIndex={-1} className="font-display text-2xl outline-none sm:text-3xl">
          {title}
        </h2>
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
