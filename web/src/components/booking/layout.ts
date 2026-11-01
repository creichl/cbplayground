// Layout constants and helpers of a restaurant's guest pages and its booking.

import { createContext } from 'react'

/**
 * Lets the cover image of a restaurant's page (RestaurantHeader) tell the restaurant's layout where it is, so the header
 * lies transparently on it while it is in view. Without a cover image registered, the header is solid.
 */
export const HeroContext = createContext<(element: HTMLElement | null) => void>(() => {})

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

/** The widest the content of a restaurant's pages gets, header and footer alike (max-w-page). */
export const contentWidth = 1200
