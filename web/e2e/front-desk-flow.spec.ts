import { expect, type Page, test } from '@playwright/test'
import { bookRequest, settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The front desk's flows end to end: open requests, status changes with undo, phone reservations, walk-ins, the table
// overview and the access to the admin area.

/** Today in Kafana Dunav's time zone (Europe/Belgrade), "YYYY-MM-DD": the day its front desk calls today. */
function todayInBelgrade() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date())
}

/** A time "HH:mm" as the front desk shows it in English, e.g. "7:00 PM". */
function timeOfDay(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hours, minutes))
}

/** A day "YYYY-MM-DD" as the date pickers show it in English, e.g. "Sat, Nov 7, 2026". */
function pickerDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day))
}

/** The row of a reservation in the lists of the front desk: the button that opens it, its status and its status actions. */
function reservationRow(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) }).locator('..')
}

/**
 * Enters a reservation for 2 at Kafana Dunav today, at the first time with a free table, through the staff API, signed in as
 * its front desk; null when no time is left today (e.g. late in the evening).
 */
async function createTodaysReservation(page: Page, name: string) {
  const date = todayInBelgrade()
  const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=2`)).json()) as {
    periods: { times: { time: string; tables: unknown[] }[] }[]
  }
  const time = availability.periods.flatMap((period) => period.times).find((slot) => slot.tables.length > 0)?.time
  if (time === undefined) {
    return null
  }
  const response = await page.request.post('/api/staff/reservations', {
    data: { date, time, guests: 2, tableId: null, durationMinutes: null, name, phone: '+381 64 1112223', email: null, notes: null },
  })
  expect(response.status()).toBe(201)
  return time
}

test.describe('Front desk: accepting a request', () => {
  test('lists the online request among the open requests and confirms it', async ({ page }) => {
    // A name the demo reservations never get (DevelopmentSeed), so the open requests list it once.
    const name = 'Branko Lazić'
    const { date } = await bookRequest(page, name)
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    await expect(page.getByRole('heading', { name: /^Open requests \(\d+\)$/ })).toBeVisible()
    const row = reservationRow(page, name)
    await expect(row.getByText('Requested', { exact: true })).toBeVisible()
    await row.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText(`${name}: Confirmed`)).toBeVisible()
    // Accepted, it leaves the open requests (it is not today's, so it is in no other list of the page).
    await expect(page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })).toHaveCount(0)
    await screenshot(page, 'front-desk', 'request-accepted', { fullPage: false })

    // On its day it is confirmed.
    await page.goto(`/frontdesk/reservations?date=${date}`)
    await expect(reservationRow(page, name).getByText('Confirmed', { exact: true })).toBeVisible()
  })
})

test.describe('Front desk: status with undo', () => {
  test('marks a reservation as arrived, undoes it and asks before cancelling', async ({ page }) => {
    const name = 'Vesna Stanković'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    // Its own reservation of today, so the demo reservations stay as they are.
    const time = await createTodaysReservation(page, name)
    test.skip(time === null, 'Kafana Dunav has no free time left today at the time of the run, so there is no reservation of today to mark.')
    await page.reload()

    const row = reservationRow(page, name)
    await expect(row.getByText('Confirmed', { exact: true })).toBeVisible()
    await row.getByRole('button', { name: 'Mark as arrived' }).click()
    await expect(row.getByText('Arrived', { exact: true })).toBeVisible()
    const toast = page.getByRole('alert').filter({ hasText: `${name}: Arrived` })
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
    // Once the notification or popover has finished coming in.
    await settle(page)
    await screenshot(page, 'front-desk', 'status-arrived-with-undo', { fullPage: false })

    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(row.getByText('Confirmed', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: `${name}: Confirmed` })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Mark as arrived' })).toBeVisible()
    await screenshot(page, 'front-desk', 'status-undone', { fullPage: false })

    // Cancelling asks first; "Back" keeps the reservation.
    await row.getByRole('button', { name: 'Cancel', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Cancel the reservation?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(`The reservation of ${name} at ${timeOfDay(time!)} (party of 2) will be cancelled`, { exact: false })).toBeVisible()
    await screenshot(page, 'front-desk', 'status-cancel-asks-first', { fullPage: false })
    await dialog.getByRole('button', { name: 'Back' }).click()
    await expect(dialog).toBeHidden()
    await expect(row.getByText('Confirmed', { exact: true })).toBeVisible()

    // Cancelled for real, it frees its table again.
    await row.getByRole('button', { name: 'Cancel', exact: true }).click()
    await dialog.getByRole('button', { name: 'Cancel reservation' }).click()
    await expect(row.getByText('Cancelled', { exact: true })).toBeVisible()
  })
})

test.describe('Front desk: phone reservation', () => {
  test('offers the free times as chips and saves the reservation on its day', async ({ page }) => {
    const name = 'Jovana Telefon'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await page.getByRole('tab', { name: 'Reservations' }).click()
    // Tomorrow: Kafana Dunav is open every day, and the whole day lies ahead.
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page).toHaveURL(/\/frontdesk\/reservations\?date=/)
    const date = new URL(page.url()).searchParams.get('date')!
    // The address changes first; the page shows the day right after.
    await expect(page.getByRole('button', { name: 'Date', exact: true })).toHaveText(pickerDate(date))

    await page.getByRole('button', { name: 'New reservation' }).click()
    const drawer = page.getByRole('dialog', { name: 'New reservation' })
    await expect(drawer.getByRole('button', { name: 'Date', exact: true })).toHaveText(pickerDate(date))
    const freeTime = drawer.getByRole('radio', { disabled: false }).first()
    await expect(freeTime).toBeAttached()
    const time = (await freeTime.getAttribute('value'))!
    await drawer.getByText(timeOfDay(time), { exact: true }).click()
    await expect(freeTime).toBeChecked()
    // The suggested table is chosen with the time.
    await expect(drawer.getByRole('combobox', { name: 'Table', exact: true })).toHaveValue(/\(suggested\)$/)
    await drawer.getByLabel('Name').fill(name)
    await drawer.getByLabel('Phone').fill('+381 63 555444')
    await screenshot(page, 'front-desk', 'phone-reservation-form', { fullPage: false })

    await drawer.getByRole('button', { name: 'Create reservation' }).click()
    await expect(drawer).toBeHidden()
    await expect(page.getByText(`The reservation for ${name} has been created`, { exact: false })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`date=${date}$`))
    const row = reservationRow(page, name)
    await expect(row).toContainText(timeOfDay(time))
    await expect(row.getByText('Phone', { exact: true })).toBeVisible()
    await expect(row.getByText('Confirmed', { exact: true })).toBeVisible()
    await screenshot(page, 'front-desk', 'phone-reservation-saved')
  })
})

test.describe('Front desk: walk-in', () => {
  test('seats a party at the suggested table as arrived', async ({ page }) => {
    const name = 'Milan Šetač'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const walkInTables = await page.request.get('/api/staff/walk-in-tables?guests=2')
    test.skip(walkInTables.status() === 400, 'Kafana Dunav is closed at the time of the run, so no walk-in can be seated now.')
    expect(walkInTables.status()).toBe(200)
    const suggested = ((await walkInTables.json()) as { tables: { number: string }[] }).tables[0]
    test.skip(suggested === undefined, 'No table of Kafana Dunav is free for a walk-in now.')

    await page.getByRole('button', { name: 'Walk-in', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Seat a walk-in' })
    const table = drawer.getByRole('combobox', { name: 'Table', exact: true })
    await expect(table).toHaveValue(new RegExp(`^Table ${suggested.number} · .*\\(suggested\\)$`))
    await drawer.getByLabel('Name').fill(name)
    await screenshot(page, 'front-desk', 'walk-in-drawer', { fullPage: false })

    await drawer.getByRole('button', { name: 'Seat walk-in', exact: true }).click()
    await expect(drawer).toBeHidden()
    await expect(page.getByText(`${name} seated at table ${suggested.number} since`, { exact: false })).toBeVisible()
    const row = reservationRow(page, name)
    await expect(row.getByText('Arrived', { exact: true })).toBeVisible()
    await expect(row).toContainText(`Table ${suggested.number}`)
    await expect(row.getByText('Walk-in', { exact: true })).toBeVisible()
    await screenshot(page, 'front-desk', 'walk-in-seated', { fullPage: false })
  })
})

test.describe('Front desk: table overview', () => {
  test('shows the timeline and the floor plans, and the details of a reservation on a click', async ({ page }) => {
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await page.getByRole('tab', { name: 'Table overview' }).click()
    await expect(page.getByRole('heading', { name: 'Table overview' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Timeline' })).toBeChecked()
    await expect(page.getByText('Table · seats')).toBeVisible()
    await screenshot(page, 'table-overview', 'timeline')

    // The reservations are blocks named by guest, party size, time and status; the demo data has some every day.
    const block = page.getByRole('button', { name: /^.+ \(\d+\), .+, [A-Za-z-]+$/ }).first()
    const label = (await block.getAttribute('aria-label'))!
    await block.click()
    const details = page.getByRole('dialog')
    await expect(details).toBeVisible()
    await expect(details).toContainText(label.slice(0, label.indexOf(' (')))
    await expect(details).toContainText(/Reference\s*[A-HJ-NP-Z2-9]{6}/)
    // Once the notification or popover has finished coming in.
    await settle(page)
    await screenshot(page, 'table-overview', 'timeline-details', { fullPage: false })

    await page.goto('/frontdesk/tables?view=floor')
    await expect(page.getByRole('radio', { name: 'Floor plan' })).toBeChecked()
    await expect(page.getByLabel(/^Table \S+, seats: \d+, /).first()).toBeVisible()
    await screenshot(page, 'table-overview', 'floor')
  })
})

test.describe('Front desk: access', () => {
  test('sends a front desk user from the admin area to the front desk', async ({ page }) => {
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('heading', { name: 'Today' }).first()).toBeVisible()
  })
})
