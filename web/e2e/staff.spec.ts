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

test.describe('Archived tables', () => {
  test('deleting a table with a reservation in the area editor keeps the reservation on its day', async ({ page }) => {
    // The end-to-end run has no clock to go back to: the API refuses reservations in the past, so the table gets a cancelled
    // one, which blocks the deletion just as little and keeps the table as well.
    const number = 'E2E-A1'
    const name = 'Archiv Gast'
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    const areas = (await (await page.request.get('/api/admin/areas')).json()) as { id: string; name: string }[]
    const area = areas[0]
    const created = await page.request.post('/api/admin/tables', { data: { areaId: area.id, number, seats: 2 } })
    expect(created.status()).toBe(201)
    const table = (await created.json()) as { id: string }

    // A day from ten days ahead on which the new table is free, after the demo reservations.
    let reservation: { id: string; date: string } | undefined
    for (let days = 10; days < 40 && reservation === undefined; days++) {
      const date = dateFromToday(days)
      const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=2`)).json()) as {
        periods: { times: { time: string; tables: { id: string }[] }[] }[]
      }
      const time = availability.periods.flatMap((period) => period.times).find((slot) => slot.tables.some((free) => free.id === table.id))?.time
      if (time === undefined) continue
      const booked = await page.request.post('/api/staff/reservations', { data: { date, time, guests: 2, tableId: table.id, name } })
      expect(booked.status()).toBe(201)
      reservation = (await booked.json()) as { id: string; date: string }
    }
    expect(reservation, 'a free time for the new table').toBeDefined()
    expect((await page.request.post(`/api/staff/reservations/${reservation!.id}/status`, { data: { status: 'Cancelled' } })).status()).toBe(200)

    await page.goto('/admin/areas')
    await page.getByRole('tab', { name: area.name }).click()
    await page.getByRole('button', { name: new RegExp(`^Table ${number}`) }).press('Enter')
    await expect(page.getByRole('heading', { name: `Table ${number}` })).toBeVisible()
    await page.getByRole('button', { name: 'Delete table' }).click()
    const dialog = page.getByRole('dialog', { name: `Delete table ${number}?` })
    await expect(dialog.getByText('Its past and cancelled reservations are kept.', { exact: false })).toBeVisible()
    await screenshot(page, 'archived-tables', 'delete-table-confirmation', { fullPage: false })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: new RegExp(`^Table ${number}`) })).toHaveCount(0)
    const tables = (await (await page.request.get('/api/admin/tables')).json()) as { id: string }[]
    expect(tables.map((candidate) => candidate.id)).not.toContain(table.id)

    // On its day the reservation still shows, with its table and area, in the row of the archived tables.
    await page.goto(`/admin/tables?date=${reservation!.date}`)
    await expect(page.getByText('Archived tables', { exact: true })).toBeVisible()
    const row = page.getByLabel(`Archived table ${number} · ${area.name}`).locator('..')
    await expect(row.getByRole('button', { name: new RegExp(`^${name} \\(2\\)`) })).toBeVisible()
    await screenshot(page, 'archived-tables', 'timeline-archived-table')
    // A day without reservations on archived tables has no such row.
    await page.goto(`/admin/tables?date=${dateFromToday(3)}`)
    await expect(page.getByLabel(/^Table \S+, seats: \d+$/).first()).toBeVisible()
    await expect(page.getByText('Archived tables', { exact: true })).toHaveCount(0)
  })
})
