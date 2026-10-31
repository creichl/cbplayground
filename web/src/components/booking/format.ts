/** A local date "YYYY-MM-DD" in the user's language, e.g. "Sa., 14. Nov." for { weekday: 'short', day: 'numeric', month: 'short' }. */
export function formatDate(date: string, language: string, options: Intl.DateTimeFormatOptions) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(language, options).format(new Date(year, month - 1, day))
}

/** A time "HH:mm" in the user's language, e.g. "19:00" or "7:00 PM". The closing time "24:00" stays 24:00 on a 24-hour clock. */
export function formatTime(time: string, language: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const format = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' })
  if (hours === 24 && format.resolvedOptions().hourCycle === 'h23') {
    return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h24' }).format(new Date(2000, 0, 1, 0, 0))
  }
  return format.format(new Date(2000, 0, 1, hours, minutes))
}

/** The restaurant's address in one line, e.g. "Hauptplatz 1, 1010 Wien"; empty without street, postal code and city. */
export function formatAddress(restaurant: { street: string | null; postalCode: string | null; city: string | null }) {
  const cityLine = [restaurant.postalCode, restaurant.city].filter((part) => part !== null).join(' ')
  return [restaurant.street, cityLine].filter((part) => part !== null && part !== '').join(', ')
}

/** A map search for an address; opens in the guest's map app or browser. */
export function mapSearchUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
