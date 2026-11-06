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

test.describe('Front desk: undo of accepting a request', () => {
  test('offers "Undo" after accepting, which makes it an open request again', async ({ page }) => {
    const name = 'Nikola Jovanović'
    await bookRequest(page, name)
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    const open = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })
    await open.locator('..').getByRole('button', { name: 'Accept', exact: true }).click()
    // Accepted, it leaves the open requests (it lies days ahead, so it is not in today's list either).
    await expect(open).toHaveCount(0)
    const accepted = page.getByRole('alert').filter({ hasText: `${name}: Confirmed` })
    await expect(accepted.getByRole('button', { name: 'Undo' })).toBeVisible()
    await screenshot(page, 'front-desk', 'accept-undo', { fullPage: false })

    await accepted.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('alert').filter({ hasText: `${name}: Requested` })).toBeVisible()
    await expect(open.locator('..').getByText('Requested', { exact: true })).toBeVisible()
    await screenshot(page, 'front-desk', 'accept-undone')

    // Declined again, so the demo data stays as it was; the declining can be undone as well.
    await open.locator('..').getByRole('button', { name: 'Decline', exact: true }).click()
    await page.getByRole('dialog', { name: 'Decline the request?' }).getByRole('button', { name: 'Decline request' }).click()
    await expect(open).toHaveCount(0)
    await expect(page.getByRole('alert').filter({ hasText: `${name}: Declined` }).getByRole('button', { name: 'Undo' })).toBeVisible()
  })
})

test.describe('Front desk: undo of a walk-in', () => {
  test('"Undo" after seating a walk-in removes it, after asking', async ({ page }) => {
    const name = 'Paul Spontan'
    await signIn(page, 'frontdesk@rooftop-belvedere.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const walkInTables = await page.request.get('/api/staff/walk-in-tables?guests=2')
    test.skip(walkInTables.status() === 400, 'Rooftop Belvedere is closed at the time of the run, so no walk-in can be seated now.')
    expect(walkInTables.status()).toBe(200)
    const { tables } = (await walkInTables.json()) as { tables: unknown[] }
    test.skip(tables.length === 0, 'No table of Rooftop Belvedere is free for a walk-in now.')

    await page.getByRole('button', { name: 'Walk-in', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Seat a walk-in' })
    await drawer.getByLabel('Name').fill(name)
    await drawer.getByRole('button', { name: 'Seat walk-in', exact: true }).click()
    const seated = page.getByRole('alert').filter({ hasText: `${name} seated at table` })
    await expect(seated).toBeVisible()
    const row = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })
    await expect(row).toHaveCount(1)

    await seated.getByRole('button', { name: 'Undo' }).click()
    const dialog = page.getByRole('dialog', { name: 'Remove the walk-in?' })
    await expect(dialog.getByText(`${name} (party of 2) at table`, { exact: false })).toBeVisible()
    await screenshot(page, 'front-desk', 'walk-in-undo-asks', { fullPage: false })

    await dialog.getByRole('button', { name: 'Remove walk-in' }).click()
    await expect(page.getByText(`${name} has been removed.`)).toBeVisible()
    await expect(row).toHaveCount(0)
    await screenshot(page, 'front-desk', 'walk-in-removed')
    let reservations = (await (await page.request.get('/api/staff/reservations')).json()) as { name: string }[]
    expect(reservations.map((reservation) => reservation.name)).not.toContain(name)

    // Seated again; the "Undo" of its row asks the same and removes it as well.
    await page.getByRole('button', { name: 'Walk-in', exact: true }).click()
    await drawer.getByLabel('Name').fill(name)
    await drawer.getByRole('button', { name: 'Seat walk-in', exact: true }).click()
    await expect(row).toHaveCount(1)
    await row.locator('..').getByRole('button', { name: 'Undo', exact: true }).click()
    await dialog.getByRole('button', { name: 'Remove walk-in' }).click()
    await expect(row).toHaveCount(0)
    reservations = (await (await page.request.get('/api/staff/reservations')).json()) as { name: string }[]
    expect(reservations.map((reservation) => reservation.name)).not.toContain(name)
  })
})

/** Checks the drawer of a closed reservation: date, time, party size, table and duration read-only, the contact editable. */
async function expectClosedDrawer(page: Page) {
  const drawer = page.getByRole('dialog', { name: 'Edit reservation' })
  await expect(drawer.getByText('This reservation is closed', { exact: false })).toBeVisible()
  for (const field of ['Guests', 'Date', 'Time', 'Table', 'Duration in minutes']) {
    await expect(drawer.getByLabel(field, { exact: true }), field).toHaveAttribute('readonly')
  }
  await expect(drawer.getByLabel('Phone')).toBeEditable()
  return drawer
}

test.describe('Front desk: closed reservations', () => {
  test('shows the booking of a cancelled reservation read-only and still saves the contact', async ({ page }) => {
    const name = 'Clara Storno'
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    // A phone reservation on the first day from ten days ahead with a free time, cancelled right away.
    let booked: { id: string; date: string } | undefined
    for (let days = 10; days < 40 && booked === undefined; days++) {
      const date = dateFromToday(days)
      const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=2`)).json()) as {
        periods: { times: { time: string; tables: unknown[] }[] }[]
      }
      const time = availability.periods.flatMap((period) => period.times).find((slot) => slot.tables.length > 0)?.time
      if (time === undefined) continue
      const created = await page.request.post('/api/staff/reservations', { data: { date, time, guests: 2, name } })
      expect(created.status()).toBe(201)
      booked = (await created.json()) as { id: string; date: string }
    }
    expect(booked).toBeDefined()
    expect((await page.request.post(`/api/staff/reservations/${booked!.id}/status`, { data: { status: 'Cancelled' } })).status()).toBe(200)

    await page.goto(`/frontdesk/reservations?date=${booked!.date}`)
    await page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) }).click()
    const drawer = await expectClosedDrawer(page)
    await screenshot(page, 'reservations', 'cancelled-read-only', { fullPage: false })

    await drawer.getByLabel('Phone').fill('+43 660 1112233')
    await drawer.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`The changes to the reservation of ${name} have been saved.`)).toBeVisible()
  })

  test('shows the time and table of a no-show read-only', async ({ page }) => {
    const name = 'Nora Nichterschienen'
    await signIn(page, 'frontdesk@rooftop-belvedere.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    type TodaysReservation = {
      id: string
      date: string
      time: string
      guests: number
      tableId: string
      durationMinutes: number
      phone: string | null
      email: string | null
      notes: string | null
      status: string
    }
    const today = (await (await page.request.get('/api/staff/reservations')).json()) as TodaysReservation[]
    // The first reservation of today that has started and is still expected; the server allows a no-show only from its start.
    let noShow: TodaysReservation | undefined
    for (const reservation of today.filter((candidate) => candidate.status === 'Confirmed' || candidate.status === 'Late')) {
      const marked = await page.request.post(`/api/staff/reservations/${reservation.id}/status`, { data: { status: 'NoShow' } })
      if (marked.status() === 200) {
        noShow = reservation
        break
      }
    }
    test.skip(noShow === undefined, 'No reservation of Rooftop Belvedere has started yet today at the time of the run, so none can be a no-show.')
    // Renamed, so the row can be found; a closed reservation still takes the guest's details.
    const { date, time, guests, tableId, durationMinutes, phone, email, notes } = noShow!
    const renamed = await page.request.put(`/api/staff/reservations/${noShow!.id}`, {
      data: { date, time, guests, tableId, durationMinutes, name, phone, email, notes },
    })
    expect(renamed.status()).toBe(200)

    await page.goto('/frontdesk')
    await page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) }).click()
    await expectClosedDrawer(page)
    await screenshot(page, 'reservations', 'no-show-read-only', { fullPage: false })
  })
})
