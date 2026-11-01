// Layout constants and helpers of a restaurant's guest pages and its booking.

import { createContext } from 'react'

/**
 * Lets the cover image of a restaurant's page (RestaurantHeader) tell the restaurant's layout where it is, so the header
 * lies transparently on it while it is in view. Without a cover image registered, the header is solid.
 */
export const HeroContext = createContext<(element: HTMLElement | null) => void>(() => {})

/** The id of the booking on the restaurant's page, the target of the header's "Reserve a table" on phones. */
export const bookingSectionId = 'booking'

/** Brings the booking into view and moves the focus to its step heading. */
export function scrollToBooking() {
  const section = document.getElementById(bookingSectionId)
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  section?.querySelector<HTMLElement>('[data-step-heading]')?.focus({ preventScroll: true })
}

/** Height of the restaurant's header in pixels. */
export const headerHeight = 64

/** The widest the content of a restaurant's pages gets, header and footer alike. */
export const contentWidth = 1200

/** The fields of the booking bar: 48 px high (8 px grid, at least 44 px to tap), the label above in the text colour. */
export const barInputStyles = {
  input: { height: 48 },
  label: { fontWeight: 600, marginBottom: 4 },
} as const
