import { expect, type Page, test } from '@playwright/test'
import { screenshot } from './screenshot.ts'

/** Signs in with a demo user of the development seed (appsettings.Development.json). */
async function signIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Demo1234!')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('Sign-in', () => {
  test('shows the sign-in page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible()
    await screenshot(page, 'sign-in', 'sign-in-page')
  })

  test('shows an error for a wrong password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('admin@zur-linde.local')
    await page.getByLabel('Password', { exact: true }).fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('The email address or password is incorrect.')).toBeVisible()
    await screenshot(page, 'sign-in', 'wrong-password')
  })

  test('sends staff without sign-in to the sign-in page', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible()
  })
})

test.describe('Admin', () => {
  test('shows the overview and the reservations of the restaurant', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByText('Welcome, Anna Admin!', { exact: false })).toBeVisible()
    await screenshot(page, 'admin', 'overview')

    await page.goto('/admin/reservations')
    await expect(page.getByRole('heading', { name: 'Reservations' })).toBeVisible()
    await screenshot(page, 'admin', 'reservations')
  })
})

test.describe('Table style and real size', () => {
  test('lets the admin choose the table style with a preview', async ({ page }) => {
    await signIn(page, 'admin@rooftop-belvedere.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/design')
    await expect(page.getByText('Tables on the plan')).toBeVisible()
    // The cards of the table styles, named by their style and description (the font pairs have a "Classic" too).
    const styles = { Classic: /^Classic Tables/, Natural: /^Natural Real/, Minimal: /^Minimal Flat/, Glow: /^Glow Dark/ }
    for (const name of Object.values(styles)) {
      await expect(page.getByRole('radio', { name })).toBeVisible()
    }
    await expect(page.getByRole('radio', { name: styles.Classic })).toBeChecked()
    await page.getByRole('radio', { name: styles.Natural }).click()
    await expect(page.getByRole('radio', { name: styles.Natural })).toBeChecked()
    await screenshot(page, 'table-style', 'branding-natural')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('The appearance has been saved.')).toBeVisible()
    const branding = await page.request.get('/api/admin/branding')
    expect(await branding.json()).toMatchObject({ tableStyle: 'Natural' })
    // Back to the demo's look for the other tests.
    await page.getByRole('radio', { name: styles.Classic }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('The appearance has been saved.').first()).toBeVisible()
  })

  test('shows the real width of an area and the tables at their real size', async ({ page }) => {
    await signIn(page, 'admin@rooftop-belvedere.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/areas')
    await expect(page.getByLabel('Real width of the plan')).toHaveValue('18 m')
    await expect(page.getByText('The tables are drawn at their real size (67 %).')).toBeVisible()
    await expect(page.locator('[data-scale-bar]')).toHaveText('2 m')
    await screenshot(page, 'table-style', 'area-real-width')

    // Without a width, the table size is set with the slider again.
    await page.getByLabel('Real width of the plan').fill('')
    await expect(page.getByText('Table size', { exact: true })).toBeVisible()
    await expect(page.locator('[data-scale-bar]')).toHaveCount(0)
  })

  test('shows from how many people a table is offered online', async ({ page }) => {
    await signIn(page, 'admin@rooftop-belvedere.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/areas')
    await page.getByRole('button', { name: /^Table R6/ }).press('Enter')
    await expect(page.getByRole('heading', { name: 'Table R6' })).toBeVisible()
    await expect(page.getByLabel('Online from (people)')).toHaveValue('3')
    await expect(page.getByText('Staff can still give it to smaller ones.', { exact: false })).toBeVisible()
    await screenshot(page, 'tables', 'min-guests')
  })

  test('saves a hall wider than 25 metres again and again', async ({ page }) => {
    await signIn(page, 'admin@kafana-dunav.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/areas')
    await page.getByRole('tab', { name: 'Bašta' }).click()
    const width = page.getByLabel('Real width of the plan')
    await expect(width).toHaveValue('12 m')

    // 30 m give a table scale of 40 %, below the slider's 50 %.
    await width.fill('30')
    await expect(page.getByText('The tables are drawn at their real size (40 %).')).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('The area has been saved.').first()).toBeVisible()
    // Saved a second time with another quota, after reloading: the panel starts from the saved area.
    await page.reload()
    await page.getByRole('tab', { name: 'Bašta' }).click()
    await expect(width).toHaveValue('30 m')
    await page.getByLabel('Online quota').fill('80')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('The area has been saved.').first()).toBeVisible()
    await expect(page.getByText('The table scale', { exact: false })).toHaveCount(0)
    await screenshot(page, 'table-style', 'area-30-metres')
    let areas = (await (await page.request.get('/api/admin/areas')).json()) as { name: string; widthMeters: number | null; tableScale: number; onlineCapacityPercent: number }[]
    expect(areas.find((area) => area.name === 'Bašta')).toMatchObject({ widthMeters: 30, tableScale: 40, onlineCapacityPercent: 80 })

    // Without the width the slider starts at 50 %, the derived 40 % brought into its range, and the area saves.
    await width.fill('')
    await expect(page.getByRole('slider', { name: 'Table size' })).toHaveAttribute('aria-valuenow', '50')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('The area has been saved.').first()).toBeVisible()
    areas = (await (await page.request.get('/api/admin/areas')).json()) as typeof areas
    expect(areas.find((area) => area.name === 'Bašta')).toMatchObject({ widthMeters: null, tableScale: 50 })

    // Back to the demo's 12 m for the other tests.
    await width.fill('12')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('The area has been saved.').first()).toBeVisible()
  })
})

test.describe('Front desk', () => {
  test('shows today', async ({ page }) => {
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('heading', { name: 'Today' }).first()).toBeVisible()
    await screenshot(page, 'front-desk', 'today')
  })
})

test.describe('Superadmin', () => {
  test('lists all restaurants', async ({ page }) => {
    await signIn(page, 'superadmin@cbplayground.local')
    await expect(page).toHaveURL(/\/superadmin$/)
    await expect(page.getByRole('heading', { name: 'Restaurants' })).toBeVisible()
    await expect(page.getByText('Gasthaus zur Linde').first()).toBeVisible()
    await screenshot(page, 'superadmin', 'restaurants')
  })
})

/** The date `days` from today, "YYYY-MM-DD" (the device's today; the restaurants are in its time zone or close to it). */
function dateFromToday(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Books an online request at Kafana Dunav (request mode, the guest chooses the table) on the first day from ten days ahead
 * with a free time and table, after the demo reservations, so the test does not depend on them.
 */
async function bookRequest(page: Page, name: string) {
  const restaurant = '/api/public/restaurants/kafana-dunav'
  for (let days = 10; days < 40; days++) {
    const date = dateFromToday(days)
    const availability = (await (await page.request.get(`${restaurant}/availability?date=${date}&guests=2`)).json()) as {
      periods: { times: { time: string; available: boolean }[] }[]
    }
    const time = availability.periods.flatMap((period) => period.times).find((slot) => slot.available)?.time
    if (time === undefined) continue
    const areas = (await (await page.request.get(`${restaurant}/tables?date=${date}&time=${time}&guests=2`)).json()) as {
      tables: { id: string; available: boolean }[]
    }[]
    const table = areas.flatMap((area) => area.tables).find((candidate) => candidate.available)
    if (table === undefined) continue
    const booking = await page.request.post(`${restaurant}/reservations`, {
      data: { date, time, guests: 2, tableId: table.id, name, phone: '+381 64 1234567', language: 'en' },
    })
    expect(booking.status()).toBe(201)
    expect(await booking.json()).toMatchObject({ status: 'Requested' })
    return { date, time }
  }
  throw new Error('No free time at Kafana Dunav in the next 40 days.')
}

test.describe('Front desk: declining a request', () => {
  test('asks first, and "Back" leaves the request open', async ({ page }) => {
    const name = 'Mila Petrović'
    await bookRequest(page, name)
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    // The open requests list the request; its row holds the button that opens it and the status actions.
    const row = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) }).locator('..')
    await row.getByRole('button', { name: 'Decline', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Decline the request?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(`The request of ${name} at`, { exact: false })).toBeVisible()
    await screenshot(page, 'front-desk', 'decline-asks-first', { fullPage: false })

    await dialog.getByRole('button', { name: 'Back' }).click()
    await expect(dialog).toBeHidden()
    await expect(row.getByText('Requested', { exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Decline', exact: true })).toBeVisible()
    await screenshot(page, 'front-desk', 'decline-back-request-open')

    // Declining for real removes it from the open requests, so the demo data stays as it was.
    await row.getByRole('button', { name: 'Decline', exact: true }).click()
    await dialog.getByRole('button', { name: 'Decline request' }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })).toHaveCount(0)
  })
})

test.describe('Front desk: tabs', () => {
  test('keep the chosen day from Reservations to Table overview', async ({ page }) => {
    const date = dateFromToday(3)
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await page.goto(`/frontdesk/reservations?date=${date}`)

    await page.getByRole('tab', { name: 'Table overview' }).click()
    await expect(page).toHaveURL(new RegExp(`/frontdesk/tables\\?date=${date}$`))
    await expect(page.getByRole('heading', { name: 'Table overview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeEnabled()
    await screenshot(page, 'front-desk', 'tabs-keep-date')

    await page.getByRole('tab', { name: 'Reservations' }).click()
    await expect(page).toHaveURL(new RegExp(`/frontdesk/reservations\\?date=${date}$`))
    // "Today" has no chosen day.
    await page.getByRole('tab', { name: 'Today' }).click()
    await expect(page).toHaveURL(/\/frontdesk$/)
  })
})

test.describe('Front desk: walk-in on the floor plans', () => {
  test('offers "Seat walk-in here" only on the tables the server lists as free now', async ({ page }) => {
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const walkInTables = await page.request.get('/api/staff/walk-in-tables?guests=2')
    test.skip(walkInTables.status() === 400, 'Kafana Dunav is closed at the time of the run, so the server offers no table for a walk-in now.')
    expect(walkInTables.status()).toBe(200)
    const free = new Set(((await walkInTables.json()) as { tables: { id: string }[] }).tables.map((table) => table.id))
    const floor = (await (await page.request.get('/api/staff/floor')).json()) as { tables: { id: string; number: string; seats: number }[] }[]
    const tables = floor.flatMap((area) => area.tables)
    const marker = (table: { number: string; seats: number }) => page.getByLabel(`Table ${table.number}, seats: ${table.seats},`).first()
    const walkInHere = page.getByRole('button', { name: 'Seat walk-in here' })

    await page.goto('/frontdesk/tables?view=floor')
    // "Now" is only there on today, once the plans are shown.
    await expect(page.getByRole('button', { name: 'Now' })).toBeVisible()

    // Every table of the plans: the offer appears exactly on the tables of the server's answer.
    for (const table of tables) {
      await marker(table).click()
      await expect(walkInHere, `table ${table.number}`).toHaveCount(free.has(table.id) ? 1 : 0)
      // A second tap closes the popover again.
      await marker(table).click()
      await expect(walkInHere).toHaveCount(0)
    }

    const freeTable = tables.find((table) => free.has(table.id))
    test.skip(freeTable === undefined, 'No table of Kafana Dunav is free for a walk-in now.')
    await marker(freeTable!).click()
    await expect(walkInHere).toBeVisible()
    await screenshot(page, 'front-desk', 'floor-walk-in-free-table', { fullPage: false })
    await walkInHere.click()
    // The drawer starts with the table from the floor plan, which the server accepts.
    const drawer = page.getByRole('dialog', { name: 'Seat a walk-in' })
    await expect(drawer.getByRole('button', { name: 'Seat walk-in', exact: true })).toBeEnabled()
    await expect(drawer.getByText('The chosen table is not free', { exact: false })).toHaveCount(0)
    await drawer.getByRole('button', { name: 'Cancel' }).click()
  })
})

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
    const name = 'Nikola Marković'
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
