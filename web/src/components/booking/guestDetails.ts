import type { Occasion } from '../../api/reservations.ts'

// The guest's contact details of the booking form (GuestDetailsForm): the calling codes of the phone, the number in
// international form, and the details the guest asked this device to remember.

/**
 * The form's values. `phoneCode` is the region of the calling code chosen for the phone (e.g. "AT" for +43) or "other",
 * `phone` the number as typed; `remember`: store name, phone and email on this device after booking.
 */
export type GuestDetailsValues = {
  name: string
  phoneCode: string
  phone: string
  email: string
  notes: string
  occasion: Occasion
  remember: boolean
}

/** The choice without a calling code: the guest types the number with its own ("+…" or "00…"). */
export const otherPhoneCode = 'other'

/** The calling codes of the select: the restaurants' countries first, then a short list of common European ones. */
export const phoneCodes: readonly { region: string; code: string }[] = [
  { region: 'DE', code: '+49' },
  { region: 'AT', code: '+43' },
  { region: 'RS', code: '+381' },
  { region: 'CH', code: '+41' },
  { region: 'IT', code: '+39' },
  { region: 'FR', code: '+33' },
  { region: 'NL', code: '+31' },
  { region: 'BE', code: '+32' },
  { region: 'GB', code: '+44' },
  { region: 'ES', code: '+34' },
  { region: 'PL', code: '+48' },
  { region: 'CZ', code: '+420' },
  { region: 'SK', code: '+421' },
  { region: 'HU', code: '+36' },
  { region: 'SI', code: '+386' },
  { region: 'HR', code: '+385' },
  { region: 'BA', code: '+387' },
  { region: 'ME', code: '+382' },
  { region: 'MK', code: '+389' },
  { region: 'RO', code: '+40' },
  { region: 'BG', code: '+359' },
  { region: 'GR', code: '+30' },
  { region: 'DK', code: '+45' },
  { region: 'SE', code: '+46' },
]

/** The calling code the form starts with: the restaurant's country, otherwise Germany's. */
export function defaultPhoneCode(countryCode: string | null) {
  return phoneCodes.some((option) => option.region === countryCode) ? countryCode! : 'DE'
}

/**
 * The phone number as it is stored: with the chosen calling code in place of the national "0" (Italy keeps it), e.g. "0660 1234567"
 * with Austria is "+43 660 1234567". A number that starts with "+" or "00" keeps its own code, as does any with "Other". Empty
 * when nothing is typed.
 */
export function internationalPhone(phoneCode: string, phone: string) {
  const number = phone.trim()
  const option = phoneCodes.find((candidate) => candidate.region === phoneCode)
  if (number === '' || option === undefined || number.startsWith('+') || number.startsWith('00')) {
    return number
  }
  return `${option.code} ${option.code === '+39' ? number : number.replace(/^0/, '')}`
}

/** The details remembered on this device, the same for every restaurant. */
type RememberedDetails = Pick<GuestDetailsValues, 'name' | 'phoneCode' | 'phone' | 'email'>

const storageKey = 'cbplayground.guestDetails'

/** The remembered details, or null without them; also null where the storage is blocked (e.g. in an embed of another site). */
export function rememberedDetails(): RememberedDetails | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (typeof stored !== 'object' || stored === null) {
      return null
    }
    const text = (key: keyof RememberedDetails) => (key in stored && typeof (stored as Record<string, unknown>)[key] === 'string' ? (stored as Record<string, string>)[key] : '')
    return { name: text('name'), phoneCode: text('phoneCode') || 'DE', phone: text('phone'), email: text('email') }
  } catch {
    return null
  }
}

/** Remembers name, phone and email on this device; fails silently where the storage is blocked. */
export function rememberDetails(values: GuestDetailsValues) {
  try {
    const details: RememberedDetails = { name: values.name.trim(), phoneCode: values.phoneCode, phone: values.phone.trim(), email: values.email.trim() }
    localStorage.setItem(storageKey, JSON.stringify(details))
  } catch {
    // Blocked storage: the form simply does not remember.
  }
}

/** Forgets the remembered details ("Not you? Clear", or booking without the box ticked). */
export function forgetDetails() {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Blocked storage: there is nothing to forget.
  }
}

/** The values a booking's form starts with: the remembered details, if any, otherwise empty with the restaurant's calling code. */
export function initialDetails(countryCode: string | null): GuestDetailsValues {
  const remembered = rememberedDetails()
  return {
    name: remembered?.name ?? '',
    phoneCode: remembered?.phoneCode ?? defaultPhoneCode(countryCode),
    phone: remembered?.phone ?? '',
    email: remembered?.email ?? '',
    notes: '',
    occasion: 'None',
    remember: remembered !== null,
  }
}
