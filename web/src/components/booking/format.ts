// Dates and times are formatted in `i18n/format.ts`; this file only holds the address helpers of the guest pages.

/** The restaurant's address in one line, e.g. "Hauptplatz 1, 1010 Wien"; empty without street, postal code and city. */
export function formatAddress(restaurant: { street: string | null; postalCode: string | null; city: string | null }) {
  const cityLine = [restaurant.postalCode, restaurant.city].filter((part) => part !== null).join(' ')
  return [restaurant.street, cityLine].filter((part) => part !== null && part !== '').join(', ')
}

/** A map search for an address; opens in the guest's map app or browser. */
export function mapSearchUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
