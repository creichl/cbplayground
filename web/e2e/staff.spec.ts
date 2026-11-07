import { expect, type Page, test } from '@playwright/test'
import { bookRequest, dateFromToday, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

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

test.describe('Admin structure', () => {
  /** Waits until the save bar and the dialog have finished their entrance, so the screenshots show them as they stay. */
  async function settle(page: Page) {
    await page.waitForFunction("document.getAnimations().every((animation) => animation.playState !== 'running')")
  }

  /** The sidebar's groups with their entries, in their order. */
  const groups = {
    Service: ['Overview', 'Service screen'],
    Restaurant: ['Profile', 'Appearance', 'Areas & tables', 'Opening hours'],
    Bookings: ['Reservation settings', 'Website embed'],
    Team: ['Staff'],
  }

  async function expectGroupedSidebar(page: Page) {
    const navigation = page.getByRole('navigation', { name: 'Admin navigation' })
    for (const [group, entries] of Object.entries(groups)) {
      await expect(navigation.getByRole('group', { name: group }).getByRole('link')).toHaveText(entries)
    }
    await expect(navigation.getByRole('link', { name: 'Reservations' })).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Table overview' })).toHaveCount(0)
  }

  test('groups the sidebar by task on desktops', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await expectGroupedSidebar(page)
    await expect(page.getByRole('link', { name: 'Open service screen' })).toHaveAttribute('href', '/frontdesk')
    await screenshot(page, 'admin-structure', 'sidebar-desktop')
  })

  test('shows the same groups in the burger menu on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.getByRole('button', { name: 'Show or hide navigation' }).click()
    await expectGroupedSidebar(page)
    await screenshot(page, 'admin-structure', 'sidebar-phone', { fullPage: false })
  })

  test('shows the save bar on the profile after a change and hides it after saving', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/profile')
    const phone = page.getByLabel('Phone')
    await expect(phone).toHaveValue('+49 89 2345678')
    const saveBar = page.getByRole('region', { name: 'Unsaved changes' })
    await expect(saveBar).toHaveCount(0)

    await phone.fill('+49 89 7654321')
    await expect(saveBar).toBeVisible()
    await settle(page)
    await screenshot(page, 'admin-structure', 'profile-save-bar', { fullPage: false })

    await saveBar.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('The profile has been saved.')).toBeVisible()
    await expect(saveBar).toHaveCount(0)
    await screenshot(page, 'admin-structure', 'profile-saved', { fullPage: false })
    expect(await (await page.request.get('/api/admin/profile')).json()).toMatchObject({ phone: '+49 89 7654321' })

    // Back to the demo's phone number for the other tests.
    await phone.fill('+49 89 2345678')
    await saveBar.getByRole('button', { name: 'Save' }).click()
    await expect(saveBar).toHaveCount(0)
    expect(await (await page.request.get('/api/admin/profile')).json()).toMatchObject({ phone: '+49 89 2345678' })
  })

  test('discards the changes on the profile', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/profile')
    const phone = page.getByLabel('Phone')
    const email = page.getByLabel('Email')
    await expect(phone).toHaveValue('+49 89 2345678')
    const savedEmail = await email.inputValue()

    await phone.fill('+49 89 1111111')
    await email.fill('not an email')
    const saveBar = page.getByRole('region', { name: 'Unsaved changes' })
    await saveBar.getByRole('button', { name: 'Save' }).click()
    // Invalid input is shown at its field, and nothing is saved.
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible()
    await settle(page)
    await screenshot(page, 'admin-structure', 'profile-field-error', { fullPage: false })

    await saveBar.getByRole('button', { name: 'Discard' }).click()
    await expect(phone).toHaveValue('+49 89 2345678')
    await expect(email).toHaveValue(savedEmail)
    await expect(page.getByText('Please enter a valid email address.')).toHaveCount(0)
    await expect(saveBar).toHaveCount(0)
    await screenshot(page, 'admin-structure', 'profile-discarded')
  })

  test('asks before leaving a page with unsaved changes', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    // Within the app, so the back button stays in it.
    await page.getByRole('link', { name: 'Profile' }).click()
    const phone = page.getByLabel('Phone')
    await expect(phone).toHaveValue('+49 89 2345678')
    await phone.fill('+49 89 2222222')

    // "Stay" keeps the page and the input.
    await page.getByRole('link', { name: 'Staff' }).click()
    const dialog = page.getByRole('dialog', { name: 'Leave without saving?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS('opacity', '1')
    await settle(page)
    await screenshot(page, 'admin-structure', 'leave-dialog', { fullPage: false })
    await dialog.getByRole('button', { name: 'Stay' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/\/admin\/profile$/)
    await expect(phone).toHaveValue('+49 89 2222222')

    // The back button asks too; "Leave" drops the changes.
    await page.goBack()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Leave' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    expect(await (await page.request.get('/api/admin/profile')).json()).toMatchObject({ phone: '+49 89 2345678' })
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

/** The number of a key figure, by its label (the value is the element after it). */
async function figure(page: Page, label: string) {
  return Number(await page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]').textContent())
}

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
    // The demo data has bookings in the past 7 days.
    expect(await figure(page, 'Bookings in the last 7 days')).toBeGreaterThan(0)
    await expect(page.getByRole('columnheader', { name: 'Setup' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Last staff sign-in' })).toBeVisible()
    const linde = rows.filter({ hasText: 'Gasthaus zur Linde' })
    await expect(linde).toContainText('6 / 6')
    // Its bookings of the last 7 days (the sixth column).
    expect(Number(await linde.getByRole('cell').nth(5).textContent())).toBeGreaterThan(0)
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
    expect(await figure(page, 'Bookings last 7 days')).toBeGreaterThan(0)
    expect(await figure(page, 'Bookings next 7 days')).toBeGreaterThan(0)
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

/** A time "HH:mm" as the English UI shows it, e.g. "7:30 PM", as a pattern (the space before AM/PM may be a narrow one). */
function englishTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return new RegExp(`^${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, '0')}\\s?${hours < 12 ? 'AM' : 'PM'}$`)
}

test.describe('Reservation history', () => {
  test('shows who changed the time and the status', async ({ page }) => {
    const name = 'Lena Verlauf'
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)

    // A phone reservation far ahead of the demo reservations, on a day with two free times half an hour apart.
    let booked: { date: string; from: string; to: string } | undefined
    for (let days = 40; days < 70 && booked === undefined; days++) {
      const date = dateFromToday(days)
      const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=2`)).json()) as {
        periods: { times: { time: string; tables: unknown[] }[] }[]
      }
      const times = availability.periods.at(-1)?.times ?? []
      const index = times.findIndex((slot, i) => slot.tables.length > 0 && (times[i + 2]?.tables.length ?? 0) > 0)
      if (index >= 0) booked = { date, from: times[index].time, to: times[index + 2].time }
    }
    expect(booked).toBeDefined()
    const { date, from, to } = booked!
    const created = await page.request.post('/api/staff/reservations', { data: { date, time: from, guests: 2, name } })
    expect(created.status()).toBe(201)

    // The time is changed in the drawer.
    await page.goto(`/frontdesk?date=${date}`)
    const open = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })
    await open.click()
    const drawer = page.getByRole('dialog', { name: 'Edit reservation' })
    // The chip's radio is hidden; its label is what a user taps.
    await drawer.getByText(englishTime(to)).click()
    await expect(drawer.getByRole('radio', { name: englishTime(to) })).toBeChecked()
    await drawer.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`The changes to the reservation of ${name} have been saved.`)).toBeVisible()
    await expect(drawer).toBeHidden()

    // The status is changed in the list; the cancelled reservation moves to the tab "Finished".
    await open.locator('..').getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('dialog', { name: 'Cancel the reservation?' }).getByRole('button', { name: 'Cancel reservation' }).click()
    await page.getByRole('tab', { name: /^Finished/ }).click()
    await expect(open.locator('..').getByText('Cancelled', { exact: true })).toBeVisible()

    // The history is folded until it is opened, newest first.
    await open.click()
    const history = drawer.getByRole('button', { name: 'History' })
    await expect(history).toHaveAttribute('aria-expanded', 'false')
    await history.click()
    const entries = drawer.getByRole('listitem')
    await expect(entries).toHaveCount(3)
    await expect(entries.nth(0)).toContainText('Anna Admin: Confirmed → Cancelled')
    await expect(entries.nth(1)).toContainText(/Anna Admin: Time \d{1,2}:\d{2}\s?[AP]M → \d{1,2}:\d{2}\s?[AP]M/)
    await expect(entries.nth(2)).toContainText('Entered by Anna Admin')
    await drawer.getByText('Entered by Anna Admin').scrollIntoViewIfNeeded()
    await screenshot(page, 'reservation-history', 'drawer-history', { fullPage: false })
  })
})

/** The toast of a status change on the service screen (design system: a list item in the region "Notifications"). */
function statusToast(page: Page, text: string) {
  return page.getByRole('region', { name: /^Notifications/ }).getByRole('listitem').filter({ hasText: text })
}

test.describe('Front desk: undo of accepting a request', () => {
  test('offers "Undo" after accepting, which makes it an open request again', async ({ page }) => {
    const name = 'Nikola Vraćanje'
    await bookRequest(page, name)
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    await page.getByRole('tab', { name: /^Requests/ }).click()
    const open = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })
    await open.locator('..').getByRole('button', { name: 'Accept', exact: true }).click()
    // Accepted, it leaves the open requests (it lies days ahead, so it is not in today's list either).
    await expect(open).toHaveCount(0)
    const accepted = statusToast(page, `${name}: Confirmed`)
    await expect(accepted.getByRole('button', { name: 'Undo' })).toBeVisible()
    await screenshot(page, 'front-desk', 'accept-undo', { fullPage: false })

    await accepted.getByRole('button', { name: 'Undo' }).click()
    await expect(statusToast(page, `${name}: Requested`)).toBeVisible()
    await expect(open.locator('..').getByText('Requested', { exact: true })).toBeVisible()
    await screenshot(page, 'front-desk', 'accept-undone')

    // Declined again, so the demo data stays as it was; the declining can be undone as well.
    await open.locator('..').getByRole('button', { name: 'Decline', exact: true }).click()
    await page.getByRole('dialog', { name: 'Decline the request?' }).getByRole('button', { name: 'Decline request' }).click()
    await expect(open).toHaveCount(0)
    await expect(statusToast(page, `${name}: Declined`).getByRole('button', { name: 'Undo' })).toBeVisible()
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
    // An arrived walk-in is in the tab "Seated".
    await page.getByRole('tab', { name: /^Seated/ }).click()
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

    // A closed reservation is in the tab "Finished".
    await page.goto(`/frontdesk?date=${booked!.date}`)
    await page.getByRole('tab', { name: /^Finished/ }).click()
    await page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) }).click()
    const drawer = await expectClosedDrawer(page)
    await screenshot(page, 'reservations', 'cancelled-read-only', { fullPage: false })

    await drawer.getByLabel('Phone').fill('+43 660 1112233')
    await drawer.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`The changes to the reservation of ${name} have been saved.`)).toBeVisible()
  })

  test('shows the time and table of a no-show read-only', async ({ page }) => {
    const name = 'Nora Nichterschienen'
    type PastReservation = {
      id: string
      date: string
      time: string
      guests: number
      tableId: string
      durationMinutes: number
      phone: string | null
      email: string | null
      notes: string | null
    }
    // A no-show of the demo reservations of the past seven days, of the first demo restaurant that has one (their statuses are random).
    let noShow: PastReservation | undefined
    for (const frontDesk of ['frontdesk@rooftop-belvedere.local', 'frontdesk@zur-linde.local', 'frontdesk@kafana-dunav.local']) {
      await page.context().clearCookies()
      await signIn(page, frontDesk)
      await expect(page).toHaveURL(/\/frontdesk$/)
      const noShows = (await (
        await page.request.get(`/api/staff/reservations?from=${dateFromToday(-7)}&to=${dateFromToday(-1)}&status=NoShow`)
      ).json()) as PastReservation[]
      noShow = noShows.at(0)
      if (noShow !== undefined) break
    }
    expect(noShow, 'a no-show among the demo reservations of the past seven days').toBeDefined()
    // Renamed, so the row can be found; a closed reservation still takes the guest's details.
    const { id, date, time, guests, tableId, durationMinutes, phone, email, notes } = noShow!
    const renamed = await page.request.put(`/api/staff/reservations/${id}`, {
      data: { date, time, guests, tableId, durationMinutes, name, phone, email, notes },
    })
    expect(renamed.status()).toBe(200)

    await page.goto(`/frontdesk?date=${date}`)
    await page.getByRole('tab', { name: /^Finished/ }).click()
    await page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) }).click()
    await expectClosedDrawer(page)
    await screenshot(page, 'reservations', 'no-show-read-only', { fullPage: false })
  })
})
