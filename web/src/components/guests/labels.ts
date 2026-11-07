import type { ParseKeys } from 'i18next'
import type { GuestTag, Occasion } from '../../api/reservations.ts'

/** The occasions in their order; the list is fixed, as on the server (Data/Reservation.cs). */
export const occasions: readonly Occasion[] = ['None', 'Birthday', 'Anniversary', 'Business', 'Date', 'Celebration', 'Other']

/** The tags in their order; the set is fixed, as on the server (Data/Guest.cs). */
export const guestTags: readonly GuestTag[] = ['Vip', 'Regular', 'Press', 'Staff', 'Difficult']

/** The occasions in the user's language, for the staff and for the guest's booking. */
export const occasionLabels: Record<Occasion, ParseKeys> = {
  None: 'guests.occasions.None',
  Birthday: 'guests.occasions.Birthday',
  Anniversary: 'guests.occasions.Anniversary',
  Business: 'guests.occasions.Business',
  Date: 'guests.occasions.Date',
  Celebration: 'guests.occasions.Celebration',
  Other: 'guests.occasions.Other',
}

export const tagLabels: Record<GuestTag, ParseKeys> = {
  Vip: 'guests.tags.Vip',
  Regular: 'guests.tags.Regular',
  Press: 'guests.tags.Press',
  Staff: 'guests.tags.Staff',
  Difficult: 'guests.tags.Difficult',
}
