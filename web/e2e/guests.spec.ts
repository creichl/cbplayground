import { expect, type Page, test } from '@playwright/test'
import { dateFromToday, settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The guest profiles: returning guests and their figures in the reservation drawer, tags and the markers in the list, the guest
// directory with its search, deleting a guest's data, and the occasion of an online booking at the front desk.

/** A reservation as the staff API returns it, as far as the tests need it. */
type StaffReservation = {
  id: string
  date: string
  time: string
  name: string
  status: string
  guestId: string | null
  guest: { visits: number; tags: string[]; hasAllergies: boolean } | null
}

/** A guest of the directory, as far as the tests need it. */
type GuestItem = { id: string; name: string; visits: number; hasAllergies: boolean }

/** The row of a reservation in the lists of the service screen, by its id. */
function rowOf(page: Page, id: string) {
  return page.locator(`[data-reservation-id="${id}"]`)
}

/** Opens a reservation of the service screen in its drawer. */
async function openReservation(page: Page, id: string) {
  await rowOf(page, id).getByRole('button', { name: /^Open the reservation of / }).click()
  const drawer = page.getByRole('dialog', { name: 'Edit reservation' })
  await expect(drawer).toBeVisible()
  return drawer
}

/**
 * Enters a reservation for 2 at the signed-in user's restaurant on the first day from tomorrow with a free time, through the staff
 * API, with a phone number of its own, so it gets a guest profile of its own.
 */
async function createReservation(page: Page, name: string, phone: string) {
  for (let days = 1; days < 14; days++) {
    const date = dateFromToday(days)
    const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=2`)).json()) as {
      periods: { times: { time: string; tables: unknown[] }[] }[]
    }
    const time = availability.periods.flatMap((period) => period.times).find((slot) => slot.tables.length > 0)?.time
    if (time === undefined) continue
    const response = await page.request.post('/api/staff/reservations', {
      data: { date, time, guests: 2, tableIds: null, durationMinutes: null, name, phone, email: null, notes: null, occasion: 'None' },
    })
    expect(response.status()).toBe(201)
    return (await response.json()) as StaffReservation
  }
  throw new Error('No free time in the next two weeks.')
}

/** The first guest of the directory that matches, going through its pages. */
async function findGuest(page: Page, matches: (guest: GuestItem) => boolean) {
  for (let number = 1; number < 20; number++) {
    const result = (await (await page.request.get(`/api/staff/guests?page=${number}`)).json()) as { items: GuestItem[] }
    const guest = result.items.find(matches)
    if (guest !== undefined) return guest
    if (result.items.length === 0) break
  }
  throw new Error('No such guest in the directory.')
}

test.describe('Guests: returning guest', () => {
  test('shows the visits of a returning demo guest in the drawer', async ({ page }) => {
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    // A demo reservation still to come whose guest has come before (the seed reuses some guests, DevelopmentSeed).
    let returning: StaffReservation | undefined
    for (let days = 1; days <= 7 && returning === undefined; days++) {
      const date = dateFromToday(days)
      const reservations = (await (await page.request.get(`/api/staff/reservations?from=${date}&to=${date}`)).json()) as StaffReservation[]
      returning = reservations.find((reservation) => reservation.status === 'Confirmed' && (reservation.guest?.visits ?? 0) >= 2)
    }
    expect(returning, 'a demo reservation of a returning guest').toBeDefined()

    await page.goto(`/frontdesk?date=${returning!.date}`)
    // A returning guest has no "first visit" marker.
    await expect(rowOf(page, returning!.id)).toBeVisible()
    await expect(rowOf(page, returning!.id).getByRole('img', { name: 'First visit' })).toHaveCount(0)
    const drawer = await openReservation(page, returning!.id)
    const card = drawer.getByRole('region', { name: 'Guest profile' })
    await expect(card).toContainText(new RegExp(`Visits\\s*${returning!.guest!.visits}`))
    await expect(card).toContainText('No-shows')
    await expect(card).toContainText('Last visit')
    await expect(card.getByRole('link', { name: /in the guest directory$/ })).toBeVisible()
    await settle(page)
    await screenshot(page, 'guests', 'drawer-returning-guest', { fullPage: false })
  })
})

test.describe('Guests: tags', () => {
  test('tags a guest as VIP in the drawer and shows the icon in the list', async ({ page }) => {
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const reservation = await createReservation(page, 'Vida Važna', '+381 64 5550101')
    await page.goto(`/frontdesk?date=${reservation.date}`)
    const row = rowOf(page, reservation.id)
    await expect(row.getByRole('img', { name: 'First visit' })).toBeVisible()
    await expect(row.getByRole('img', { name: 'VIP' })).toHaveCount(0)

    const drawer = await openReservation(page, reservation.id)
    const card = drawer.getByRole('region', { name: 'Guest profile' })
    await card.getByRole('button', { name: 'Edit profile' }).click()
    await card.getByRole('group', { name: 'Tags' }).getByText('VIP', { exact: true }).click()
    await card.getByLabel('Allergies').fill('Gluten')
    await settle(page)
    await screenshot(page, 'guests', 'drawer-edit-profile', { fullPage: false })
    await card.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('The profile of Vida Važna has been saved.')).toBeVisible()
    await expect(card.getByText('VIP', { exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(drawer).toBeHidden()

    await expect(row.getByRole('img', { name: 'VIP' })).toBeVisible()
    await expect(row.getByRole('img', { name: 'Allergies' })).toBeVisible()
    await screenshot(page, 'guests', 'list-vip-marker', { fullPage: false })
  })
})

test.describe('Guests: directory', () => {
  test('opens the directory from the service screen, searches a guest and shows the visits', async ({ page }) => {
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    // The demo guest with the allergy note (DevelopmentSeed): a regular with several reservations.
    const guest = await findGuest(page, (candidate) => candidate.hasAllergies)

    await page.getByRole('link', { name: 'Guests', exact: true }).click()
    await expect(page).toHaveURL(/\/frontdesk\/guests$/)
    await expect(page.getByRole('heading', { name: 'Guests', level: 1 })).toBeVisible()
    await expect(page.getByText(/^\d+ guests$/)).toBeVisible()

    await page.getByRole('searchbox', { name: 'Search guests' }).fill(guest.name)
    const result = page.locator(`a[href="/frontdesk/guests/${guest.id}"]`)
    await expect(result).toBeVisible()
    await expect(result.getByRole('img', { name: 'Allergies' })).toBeVisible()
    // Only guests whose name, email address or phone number matches.
    for (const name of await page.getByRole('complementary', { name: 'Guest list' }).locator('a[href^="/frontdesk/guests/"] .font-semibold').allTextContents()) {
      expect(name.toLowerCase()).toContain(guest.name.toLowerCase())
    }
    await screenshot(page, 'guests', 'directory-search')

    await result.click()
    await expect(page).toHaveURL(new RegExp(`/frontdesk/guests/${guest.id}$`))
    await expect(page.getByRole('heading', { name: guest.name, level: 2 })).toBeVisible()
    await expect(page.getByText('Alergija na orašaste plodove')).toBeVisible()
    const visits = page.getByRole('region', { name: 'Reservations' })
    await expect(visits.getByRole('listitem').first()).toBeVisible()
    expect(await visits.getByRole('listitem').count()).toBeGreaterThanOrEqual(guest.visits)
    await screenshot(page, 'guests', 'directory-guest')
  })

  test('deletes the data of a guest for a Tenant Admin after asking first', async ({ page }) => {
    await signIn(page, 'admin@kafana-dunav.local')
    await expect(page).toHaveURL(/\/admin$/)
    const reservation = await createReservation(page, 'Brisa Podatke', '+381 64 5550202')
    await page.goto(`/frontdesk/guests/${reservation.guestId}`)
    await expect(page.getByRole('heading', { name: 'Brisa Podatke', level: 2 })).toBeVisible()

    await page.getByRole('button', { name: 'Delete guest data' }).click()
    const dialog = page.getByRole('dialog', { name: "Delete the guest's data?" })
    await expect(dialog).toContainText('Its 1 reservation keeps only the date, time, party size, table and status')
    await settle(page)
    await screenshot(page, 'guests', 'delete-asks-first', { fullPage: false })
    await dialog.getByRole('button', { name: 'Delete data' }).click()
    await expect(page).toHaveURL(/\/frontdesk\/guests$/)
    await expect(page.getByText('The data of Brisa Podatke has been deleted.')).toBeVisible()

    // The reservation stays, without the guest's name.
    await page.goto(`/frontdesk?date=${reservation.date}`)
    await expect(rowOf(page, reservation.id).getByText('Deleted guest', { exact: true })).toBeVisible()
  })

  test('offers no deletion to the front desk', async ({ page }) => {
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const reservation = await createReservation(page, 'Ostaje Ovde', '+381 64 5550303')
    await page.goto(`/frontdesk/guests/${reservation.guestId}`)
    await expect(page.getByRole('heading', { name: 'Ostaje Ovde', level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete guest data' })).toHaveCount(0)
  })
})

test.describe('Guests: occasion', () => {
  test('an online booking with the occasion "Birthday" shows it at the front desk', async ({ page }) => {
    const name = 'Greta Geburtstag'
    await page.goto('/r/zur-linde')
    await page.locator('[data-time-chip]').first().click()
    const dialog = page.getByRole('dialog', { name: 'Your contact details' })
    await expect(dialog).toBeVisible()
    const params = new URL(page.url()).searchParams
    const date = params.get('date')!
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByLabel('Email').fill('greta.geburtstag@example.com')
    await dialog.getByLabel('Occasion (optional)').click()
    await page.getByRole('option', { name: 'Birthday' }).click()
    await expect(dialog.getByLabel('Occasion (optional)')).toHaveText('Birthday')
    await settle(page)
    await screenshot(page, 'guests', 'booking-occasion', { fullPage: false })
    await dialog.getByRole('button', { name: 'Book now' }).click()
    await expect(page.getByRole('dialog', { name: 'Your table is reserved' })).toBeVisible()

    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const reservations = (await (await page.request.get(`/api/staff/reservations?from=${date}&to=${date}`)).json()) as (StaffReservation & {
      occasion: string
    })[]
    const booked = reservations.find((reservation) => reservation.name === name)
    expect(booked?.occasion).toBe('Birthday')
    await page.goto(`/frontdesk?date=${date}`)
    const row = rowOf(page, booked!.id)
    await expect(row.getByRole('img', { name: 'Birthday' })).toBeVisible()
    await screenshot(page, 'guests', 'list-birthday', { fullPage: false })

    const drawer = await openReservation(page, booked!.id)
    await expect(drawer.getByRole('combobox', { name: 'Occasion', exact: true })).toHaveValue('Birthday')
    await settle(page)
    await screenshot(page, 'guests', 'drawer-birthday', { fullPage: false })
  })
})
