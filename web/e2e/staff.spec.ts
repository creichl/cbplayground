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

    // The key figure of the open requests opens them on the front desk.
    await page.getByRole('link', { name: /^Open requests: / }).click()
    await expect(page).toHaveURL(/\/frontdesk\?tab=requests$/)
    await expect(page.getByRole('tab', { name: /^Requests/ })).toHaveAttribute('aria-selected', 'true')

    // The reservations and the table overview of the admin are the front desk's service screen now.
    await page.goto('/admin/reservations')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('tab', { name: /^Upcoming/ })).toBeVisible()
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

    // The tab "Requests" lists the open requests; a row holds the button that opens it and the status actions.
    await page.getByRole('tab', { name: /^Requests/ }).click()
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

    // The service screen shows the floor plans unless the address asks for the timeline.
    await page.goto('/frontdesk')
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

type StaffReservation = { id: string; date: string; time: string; status: string; tableId: string; name: string }

/** The reservations of a day, as the staff list them. */
async function reservationsOf(page: Page, date: string) {
  return (await (await page.request.get(`/api/staff/reservations?from=${date}&to=${date}`)).json()) as StaffReservation[]
}

/** The opening windows of a day ("HH:mm"); empty when the restaurant is closed. */
async function openPeriodsOf(page: Page, date: string) {
  const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=1`)).json()) as {
    periods: { start: string; end: string }[]
  }
  return availability.periods
}

/** The first day from `from` days ahead on which `wanted` holds, "YYYY-MM-DD". */
async function findDay(from: number, wanted: (date: string) => Promise<boolean>) {
  for (let days = from; days < from + 60; days++) {
    const date = dateFromToday(days)
    if (await wanted(date)) return date
  }
  throw new Error(`No such day in the 60 days from ${from} days ahead.`)
}

/** The tabs of the list panel lie side by side within their row, none running into the next or out of the row. */
async function expectTabsInside(page: Page) {
  const list = (await page.getByRole('tablist').first().boundingBox())!
  const tabs = page.getByRole('tablist').first().getByRole('tab')
  let previousRight = list.x
  for (let i = 0; i < (await tabs.count()); i++) {
    const tab = tabs.nth(i)
    const box = (await tab.boundingBox())!
    expect(box.x, `tab ${i}`).toBeGreaterThanOrEqual(previousRight)
    expect(box.x + box.width, `tab ${i}`).toBeLessThanOrEqual(list.x + list.width + 0.5)
    // Its texts fit into it.
    expect(await tab.evaluate((element) => element.scrollWidth <= element.clientWidth), `tab ${i}`).toBe(true)
    previousRight = box.x + box.width - 0.5
  }
}

test.describe('Front desk: service screen', () => {
  test('shows list, key figures and floor plan on one screen at 1440 × 900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('link', { name: 'Kafana Dunav' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Walk-in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New reservation' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Key figures of the service' }).getByText('Seated now')).toBeVisible()
    await expect(page.getByRole('img', { name: /^Covers per quarter hour/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Floor plan' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByLabel('Time', { exact: true })).toBeVisible()
    await screenshot(page, 'front-desk', 'service-1440-upcoming')

    // The list tabs.
    for (const [tab, name] of [
      ['Seated', 'service-1440-seated'],
      ['Finished', 'service-1440-finished'],
      ['Requests', 'service-1440-requests'],
    ] as const) {
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-selected', 'true')
      await screenshot(page, 'front-desk', name)
    }
  })

  test('switches to the timeline, which survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await page.getByRole('tab', { name: 'Timeline' }).click()
    await expect(page).toHaveURL(/\/frontdesk\?view=timeline$/)
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Table · seats')).toBeVisible()
    await screenshot(page, 'front-desk', 'service-1440-timeline')
  })

  test('highlights the table and the block of the reservation selected in the list, and the other way round', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    // A coming day with reservations, so they are all upcoming whatever the time of the run.
    const date = await findDay(1, async (day) => (await reservationsOf(page, day)).some((reservation) => reservation.status === 'Confirmed'))
    const reservation = (await reservationsOf(page, date)).find((candidate) => candidate.status === 'Confirmed')!
    await page.goto(`/frontdesk?date=${date}`)

    const row = page.locator(`[data-reservation-id="${reservation.id}"]`)
    await row.getByRole('button', { name: new RegExp(`^Open the reservation of ${reservation.name} `) }).click()
    // The click opens the edit drawer; the selection stays after closing it.
    await expect(page.getByRole('dialog', { name: 'Edit reservation' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Edit reservation' })).toBeHidden()
    await expect(row).toHaveAttribute('data-selected', '')
    const table = page.locator(`[data-table-id="${reservation.tableId}"]`)
    await expect(table).toHaveAttribute('data-selected', '')
    await expect(page.locator('[data-table-id][data-selected]')).toHaveCount(1)
    await screenshot(page, 'front-desk', 'service-selected-table')

    await page.getByRole('tab', { name: 'Timeline' }).click()
    await expect(page.locator(`[data-reservation-block="${reservation.id}"]`)).toHaveAttribute('data-selected', '')
    await screenshot(page, 'front-desk', 'service-selected-block')

    // A block on the timeline selects its reservation in the list.
    const other = (await reservationsOf(page, date)).find((candidate) => candidate.status === 'Confirmed' && candidate.id !== reservation.id)
    test.skip(other === undefined, 'Only one reservation on that day.')
    await page.locator(`[data-reservation-block="${other!.id}"]`).click()
    await expect(page.locator(`[data-reservation-id="${other!.id}"]`)).toHaveAttribute('data-selected', '')
    await expect(page.locator(`[data-reservation-id="${reservation.id}"]`)).not.toHaveAttribute('data-selected', '')
  })

  test('chooses a service by its opening window and keeps day and service across a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    // Zur Linde opens for lunch and in the evening (closed on Mondays and public holidays).
    const date = await findDay(1, async (day) => (await openPeriodsOf(page, day)).length === 2 && (await reservationsOf(page, day)).length > 0)
    const [lunch] = await openPeriodsOf(page, date)
    await page.goto(`/frontdesk?date=${date}`)
    await page.getByRole('combobox', { name: 'Service' }).click()
    await page.getByRole('option', { name: /^Lunch / }).click()
    await expect(page).toHaveURL(new RegExp(`/frontdesk\\?date=${date}&service=${lunch.start.replace(':', '%3A')}$`))
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Service' })).toHaveText(/^Lunch /)
    // Only the reservations of the lunch service are listed.
    for (const time of await page.locator('[data-reservation-id] button[aria-label^="Open the reservation"] span.tabular-nums').allTextContents()) {
      const [hours] = time.split(':').map(Number)
      expect(hours).toBeLessThan(15)
    }
    await screenshot(page, 'front-desk', 'service-lunch')
  })

  test('shows an empty day and a closed day', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    // After the demo reservations (today + 7 days) and the requests booked by the tests.
    const empty = await findDay(20, async (day) => (await openPeriodsOf(page, day)).length > 0 && (await reservationsOf(page, day)).length === 0)
    await page.goto(`/frontdesk?date=${empty}`)
    await expect(page.getByText('There are no reservations on this day.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Walk-in' })).toHaveCount(0)
    await screenshot(page, 'front-desk', 'service-empty-day')

    const closed = await findDay(1, async (day) => (await openPeriodsOf(page, day)).length === 0 && (await reservationsOf(page, day)).length === 0)
    await page.goto(`/frontdesk?date=${closed}`)
    await expect(page.getByText('The restaurant is closed on this day.').first()).toBeVisible()
    await screenshot(page, 'front-desk', 'service-closed-day')
  })

  test('collapses the list panel on a tablet at 1024 × 768', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('tab', { name: /^Upcoming/ })).toBeVisible()
    await expectTabsInside(page)
    await screenshot(page, 'front-desk', 'service-1024')

    await page.getByRole('button', { name: 'Hide the list' }).click()
    await expect(page.getByRole('tab', { name: /^Upcoming/ })).toBeHidden()
    await screenshot(page, 'front-desk', 'service-1024-list-collapsed')
    await page.getByRole('button', { name: 'Show list' }).click()
    await expect(page.getByRole('tab', { name: /^Upcoming/ })).toBeVisible()

    // The longer Serbian labels fit as well.
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitemradio', { name: 'Srpski (latinica)' }).click()
    await expect(page.getByRole('tab', { name: /^Očekuju se/ })).toBeVisible()
    await expectTabsInside(page)
    await screenshot(page, 'front-desk', 'service-1024-sr-latn')
  })

  test('shows one pane at a time on a phone at 390 × 844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('tab', { name: /^Upcoming/ })).toBeVisible()
    // The main actions stay in the top bar.
    await expect(page.getByRole('button', { name: 'New reservation' })).toBeVisible()
    await screenshot(page, 'front-desk', 'service-390-list')

    const panes = page.getByRole('group', { name: 'Show' })
    await panes.getByRole('button', { name: 'Floor plan' }).click()
    await expect(page.getByRole('tab', { name: /^Upcoming/ })).toBeHidden()
    await expect(page.getByLabel('Time', { exact: true })).toBeVisible()
    // The hour labels below the slider do not run into each other.
    const axes = await page.locator('[data-time-axis]').evaluateAll((elements) =>
      elements.map((axis) =>
        [...axis.querySelectorAll('span')].map((span) => {
          const box = span.getBoundingClientRect()
          return { left: box.left, right: box.right, fits: span.scrollWidth <= span.clientWidth }
        }),
      ),
    )
    // The axis of the covers chart and the one of the slider.
    expect(axes).toHaveLength(2)
    for (const labels of axes) {
      expect(labels.length).toBeGreaterThan(0)
      for (const [i, label] of labels.entries()) {
        expect(label.fits, `label ${i} fits its box`).toBe(true)
        if (i > 0) expect(label.left, `label ${i}`).toBeGreaterThanOrEqual(labels[i - 1].right)
      }
    }
    await screenshot(page, 'front-desk', 'service-390-floor')

    await panes.getByRole('button', { name: 'Timeline' }).click()
    await expect(page).toHaveURL(/view=timeline/)
    await expect(page.getByText('Table · seats')).toBeVisible()
    await screenshot(page, 'front-desk', 'service-390-timeline')
  })

  test('leads the old addresses to the service screen with their day and view', async ({ page }) => {
    const date = dateFromToday(3)
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)

    await page.goto(`/frontdesk/reservations?date=${date}`)
    await expect(page).toHaveURL(new RegExp(`/frontdesk\\?date=${date}$`))
    await page.goto(`/frontdesk/tables?date=${date}`)
    await expect(page).toHaveURL(new RegExp(`/frontdesk\\?date=${date}&view=timeline$`))
    await page.goto(`/frontdesk/tables?date=${date}&view=floor`)
    await expect(page).toHaveURL(new RegExp(`/frontdesk\\?date=${date}$`))
    await page.goto(`/admin/tables?date=${date}`)
    await expect(page).toHaveURL(new RegExp(`/frontdesk\\?date=${date}&view=timeline$`))
    await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeEnabled()
  })
})

test.describe('Styleguide', () => {
  test('shows the status colours of the front desk', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dev/ui')
    const heading = page.getByRole('heading', { name: 'Reservation statuses' })
    await expect(page.getByText('--status-no-show(-surface, -text)')).toBeVisible()
    // The section at the top of the window, below the styleguide's sticky bar.
    await heading.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await page.evaluate('window.scrollBy(0, -120)')
    await screenshot(page, 'styleguide', 'status-colors', { fullPage: false })
  })
})
