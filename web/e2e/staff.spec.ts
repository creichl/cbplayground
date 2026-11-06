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

test.describe('Front desk', () => {
  test('shows today', async ({ page }) => {
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('heading', { name: 'Today' }).first()).toBeVisible()
    await screenshot(page, 'front-desk', 'today')
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
    await page.goto(`/admin/reservations?date=${date}`)
    const open = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })
    await open.click()
    const drawer = page.getByRole('dialog', { name: 'Edit reservation' })
    // The chip's radio is hidden; its label is what a user taps.
    await drawer.getByText(englishTime(to)).click()
    await expect(drawer.getByRole('radio', { name: englishTime(to) })).toBeChecked()
    await drawer.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`The changes to the reservation of ${name} have been saved.`)).toBeVisible()
    await expect(drawer).toBeHidden()

    // The status is changed in the list.
    await open.locator('..').getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('dialog', { name: 'Cancel the reservation?' }).getByRole('button', { name: 'Cancel reservation' }).click()
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

test.describe('Table combinations', () => {
  test('combines two tables in the area editor and outlines them on the plan', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/areas')
    // The demo combination of the dining room.
    await expect(page.getByText('Tables 2 + 3', { exact: true })).toBeVisible()
    await expect(page.getByText('8 seats · online from 5 people')).toBeVisible()

    await page.getByRole('tab', { name: 'Terrasse' }).click()
    await expect(page.getByText('No combinations yet.')).toBeVisible()
    await page.getByRole('button', { name: 'Select tables to combine' }).click()
    await page.getByRole('button', { name: 'Table T1, seats: 4' }).click()
    await page.getByRole('button', { name: 'Table T2, seats: 4' }).click()
    await expect(page.getByText('Selected tables: T1, T2')).toBeVisible()
    await page.getByRole('button', { name: 'Combine', exact: true }).click()

    await expect(page.getByText('Tables T1 + T2 have been combined.')).toBeVisible()
    await expect(page.getByLabel('Seats', { exact: true })).toHaveValue('8')
    await expect(page.getByLabel('Online from (people)')).toHaveValue('5')
    await expect(page.getByRole('switch', { name: 'Bookable online' })).toBeChecked()
    await expect(page.locator('[data-floor-table][data-outlined]')).toHaveCount(2)
    await page.getByLabel('Seats', { exact: true }).fill('7')
    await page.getByRole('button', { name: 'Save' }).first().click()
    await expect(page.getByText('The combination has been saved.')).toBeVisible()
    await expect(page.getByText('7 seats · online from 5 people')).toBeVisible()
    await page.getByRole('button', { name: 'Edit tables T1 + T2' }).click()
    await expect(page.locator('[data-floor-table][data-outlined]')).toHaveCount(2)
    await screenshot(page, 'combinations', 'area-editor')

    // The demo's terrace stays without combination.
    await page.locator('[data-combinations]').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('No combinations yet.')).toBeVisible()
  })

  test('enters a phone reservation for 8 people on a combination of tables', async ({ page }) => {
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    // A day beyond the demo reservations on which the table for 8 and the combination are free in the evening.
    const today = new Date()
    let day = ''
    for (let offset = 14; day === '' && offset < 44; offset++) {
      const candidate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset)).toISOString().slice(0, 10)
      const availability = (await (await page.request.get(`/api/staff/availability?date=${candidate}&guests=8`)).json()) as {
        periods: { times: { time: string; tables: { kind: string }[] }[] }[]
      }
      const sevenPm = availability.periods.flatMap((period) => period.times).find((option) => option.time === '19:00')
      if (sevenPm !== undefined && sevenPm.tables.some((table) => table.kind === 'table') && sevenPm.tables.some((table) => table.kind === 'combination')) {
        day = candidate
      }
    }
    expect(day).not.toBe('')

    await page.goto(`/frontdesk/reservations?date=${day}`)
    await page.getByRole('button', { name: 'New reservation' }).click()
    const drawer = page.getByRole('dialog', { name: 'New reservation' })
    await drawer.getByLabel('Guests').fill('8')
    await drawer.getByText('7:00 PM', { exact: true }).click()
    // The system suggests the table for 8; the front desk takes the combination instead.
    await expect(drawer.getByRole('combobox', { name: 'Table' })).toHaveValue('Table 8 · Gaststube · 8 seats (suggested)')
    await drawer.getByRole('combobox', { name: 'Table' }).click()
    await page.getByRole('option', { name: 'Tables 2 + 3 · Gaststube · 8 seats' }).click()
    await expect(drawer.getByRole('combobox', { name: 'Table' })).toHaveValue('Tables 2 + 3 · Gaststube · 8 seats')
    await drawer.getByLabel('Name').fill('Stammtisch Huber')
    await drawer.getByLabel('Phone').fill('+49 89 5551234')
    await screenshot(page, 'combinations', 'phone-reservation-drawer', { fullPage: false })
    await drawer.getByRole('button', { name: 'Create reservation' }).click()

    await expect(drawer).toHaveCount(0)
    const reservations = (await (await page.request.get(`/api/staff/reservations?from=${day}`)).json()) as { name: string; tableNumbers: string[] }[]
    expect(reservations.find((reservation) => reservation.name === 'Stammtisch Huber')?.tableNumbers).toEqual(['2', '3'])
    await expect(page.getByText('Stammtisch Huber', { exact: true })).toBeVisible()
    await screenshot(page, 'combinations', 'phone-reservation-list')
  })
})
