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

/**
 * Creates a restaurant without any setup and deactivates it, so the Superadmin's filters have one of each and the start
 * page, which lists only active restaurants, stays as it is. Does nothing when an earlier test of the run created it.
 * The page has to be signed in as the Superadmin.
 */
async function addDeactivatedRestaurant(page: Page) {
  const created = await page.request.post('/api/superadmin/tenants', { data: { name: 'Bistro Morgenrot', slug: 'bistro-morgenrot' } })
  if (created.status() === 409) return
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: string }
  expect((await page.request.post(`/api/superadmin/tenants/${id}/deactivate`)).status()).toBe(200)
}

test.describe('Superadmin', () => {
  test('lists all restaurants with setup and activity, filters and sorts them', async ({ page }) => {
    // A sign-in of Gasthaus zur Linde's staff, for its last sign-in.
    expect((await page.request.post('/api/auth/login', { data: { email: 'frontdesk@zur-linde.local', password: 'Demo1234!' } })).status()).toBe(200)
    expect((await page.request.post('/api/auth/logout')).status()).toBe(204)
    await signIn(page, 'superadmin@cbplayground.local')
    await expect(page).toHaveURL(/\/superadmin$/)
    await addDeactivatedRestaurant(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Restaurants' })).toBeVisible()
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(4)
    // The figures on top: three of four restaurants active, one setup incomplete.
    await expect(page.getByText('Active restaurants')).toBeVisible()
    await expect(page.getByText('3 / 4')).toBeVisible()
    await expect(page.getByText('Bookings in the last 7 days')).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Setup' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Last staff sign-in' })).toBeVisible()
    const linde = rows.filter({ hasText: 'Gasthaus zur Linde' })
    await expect(linde).toContainText('6 / 6')
    await expect(linde.getByRole('cell').last()).not.toHaveText('Never')
    await expect(rows.filter({ hasText: 'Bistro Morgenrot' })).toContainText('0 / 6')
    await screenshot(page, 'superadmin', 'restaurants')

    const filter = page.getByRole('radiogroup', { name: 'Show' })
    await filter.getByText('Setup incomplete').click()
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Bistro Morgenrot')
    await screenshot(page, 'superadmin', 'restaurants-setup-incomplete')

    await filter.getByText('Deactivated').click()
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Bistro Morgenrot')
    await filter.getByText('Active', { exact: true }).click()
    await expect(rows).toHaveCount(3)
    await expect(rows.filter({ hasText: 'Bistro Morgenrot' })).toHaveCount(0)

    // By name the new restaurant comes first; by activity last, as it has none.
    await filter.getByText('All').click()
    await expect(rows.first()).toContainText('Bistro Morgenrot')
    await page.getByRole('combobox', { name: 'Sort by' }).click()
    await page.getByRole('option', { name: 'Latest activity' }).click()
    await expect(rows.last()).toContainText('Bistro Morgenrot')
    await screenshot(page, 'superadmin', 'restaurants-by-activity')
  })

  test('shows a restaurant with its activity, staff and setup checklist', async ({ page }) => {
    await signIn(page, 'superadmin@cbplayground.local')
    await expect(page).toHaveURL(/\/superadmin$/)
    await addDeactivatedRestaurant(page)
    await page.getByRole('link', { name: 'Gasthaus zur Linde' }).click()
    await expect(page.getByRole('heading', { name: 'Gasthaus zur Linde', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
    await expect(page.getByText('Bookings next 7 days')).toBeVisible()
    await expect(page.getByText('Staff', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Setup', exact: true })).toBeVisible()
    await expect(page.getByText('Every step of the setup is done.')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Restaurant profile' })).toContainText('Done')
    await screenshot(page, 'superadmin', 'restaurant')

    // A restaurant without setup: every step is open, and nothing links into its admin area.
    await page.getByRole('link', { name: 'All restaurants' }).click()
    await page.getByRole('link', { name: 'Bistro Morgenrot' }).click()
    await expect(page.getByRole('heading', { name: 'Bistro Morgenrot', level: 2 })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Opening hours' })).toContainText('Open')
    await expect(page.getByRole('listitem').filter({ hasText: 'Done' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Set up' })).toHaveCount(0)
    await screenshot(page, 'superadmin', 'restaurant-setup-open')
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
    return
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
