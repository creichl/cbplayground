// Layout constants and helpers of a restaurant's guest pages and its booking.

import { createContext } from 'react'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { formatAddress } from './format.ts'

/**
 * Lets the cover image of a restaurant's page (RestaurantHeader) tell the restaurant's layout where it is, so the header
 * lies transparently on it while it is in view. Without a cover image registered, the header is solid.
 */
export const HeroContext = createContext<(element: HTMLElement | null) => void>(() => {})

/**
 * Whether a page with a cover image has scrolled past it, so the restaurant's header is opaque (RestaurantFrame); false on
 * pages without one. The booking page then shows its section navigation below the header.
 */
export const PastHeroContext = createContext(false)

/**
 * The ids of the sections of the restaurant's page, in page order: the targets of its section navigation and of links such
 * as `/r/<slug>#menu`.
 */
export const sectionIds = {
  /** The card "Hours & location". */
  openingHours: 'opening-hours',
  photos: 'photos',
  about: 'about',
  menu: 'menu',
  areas: 'areas',
  goodToKnow: 'good-to-know',
  /** "Contact"; the id of the former "Directions & contact", so links to it still lead there. */
  contact: 'directions',
} as const

/** Whether the card "Hours & location" has its opening hours part: the restaurant has a location (and so a live status) and opening hours. */
export function hasHours(restaurant: PublicRestaurant) {
  return restaurant.timeZoneId !== null && restaurant.openingHours.length > 0
}

/** Whether the card "Hours & location" is shown at all: with opening hours, an address or a phone. */
export function hasHoursOrLocation(restaurant: PublicRestaurant) {
  return hasHours(restaurant) || formatAddress(restaurant) !== '' || restaurant.phone !== null
}

/** Whether the restaurant has anything for "Contact" at the end of its page: a phone, an email address or a website. */
export function hasContact(restaurant: PublicRestaurant) {
  return restaurant.phone !== null || restaurant.email !== null || restaurant.website !== null
}

/** Brings a section of the restaurant's page into view below the header and the section navigation (scroll-mt-36) and moves the focus to its heading. */
export function scrollToSection(id: string) {
  const section = document.getElementById(id)
  section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
}

/** The id of the reservation card on the restaurant's page, the target of "Reserve a table" in the header and the bar on phones. */
export const bookingSectionId = 'booking'

/** Brings the reservation card into view and moves the focus to its heading. */
export function scrollToBooking() {
  const section = document.getElementById(bookingSectionId)
  section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  section?.querySelector<HTMLElement>('[data-booking-heading]')?.focus({ preventScroll: true })
}

/** Height of the restaurant's header in pixels (h-16). */
export const headerHeight = 64

/**
 * Height of the section navigation below the header on the restaurant's page in pixels (h-14). Header and navigation
 * together are 120 px: the sections keep 144 px above them when brought into view (scroll-mt-36), and the reservation card
 * stays 24 px below the navigation (lg:top-36).
 */
export const sectionNavHeight = 56

/** The widest the content of a restaurant's pages gets, header and footer alike (max-w-page). */
export const contentWidth = 1200
