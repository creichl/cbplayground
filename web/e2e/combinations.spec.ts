import { expect, type Page, test } from '@playwright/test'
import { settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

/**
 * A day of Gasthaus zur Linde at least `daysAhead` days ahead, beyond the demo reservations (today and the next 7 days), on
 * which a party of `guests` can book online, and its first free evening time.
 */
async function freeLindeEvening(page: Page, daysAhead: number, guests: number) {
  const slug = '/api/public/restaurants/zur-linde'
  const today = new Date()
  for (let offset = daysAhead; offset < daysAhead + 30; offset++) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset)).toISOString().slice(0, 10)
    const availability = (await (await page.request.get(`${slug}/availability?date=${day}&guests=${guests}`)).json()) as {
      periods: { start: string; times: { time: string; available: boolean }[] }[]
    }
    const time = availability.periods
      .filter((period) => period.start >= '17:00')
      .flatMap((period) => period.times)
      .find((option) => option.available)?.time
    if (time !== undefined) {
      return { day, time }
    }
  }
  throw new Error('Gasthaus zur Linde has no free evening for this party.')
}

test.describe('Table combinations', () => {
  test('books 8 people online at Gasthaus zur Linde on two combined tables', async ({ page }) => {
    const { day, time } = await freeLindeEvening(page, 12, 8)
    // An earlier booking takes the table for 8, so only the combination of tables 2 and 3 seats the next group of 8.
    const first = await page.request.post('/api/public/restaurants/zur-linde/reservations', {
      data: { date: day, time, guests: 8, name: 'Erste Gruppe', phone: '+49 89 1234567', language: 'en' },
    })
    expect(first.status()).toBe(201)
    expect(await first.json()).toMatchObject({ tableNumber: '8' })

    await page.goto(`/r/zur-linde?guests=8&date=${day}&time=${time}&step=details`)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Zweite Gruppe')
    await dialog.getByLabel('Phone').fill('+49 89 7654321')
    await dialog.getByRole('button', { name: 'Book now' }).click()

    await expect(dialog.getByRole('heading', { name: 'Your table is reserved' })).toBeVisible()
    await expect(dialog.getByText('Tables 2 + 3 · Gaststube')).toBeVisible()
    await settle(page)
    await screenshot(page, 'combinations', 'online-confirmation', { fullPage: false })
  })

  test('skips the table step where the guest chooses, when only a combination seats the group', async ({ page }) => {
    const slug = '/api/public/restaurants/kafana-dunav'
    const time = '19:00'
    // A day beyond the demo reservations; the two tables for 8 are taken by earlier groups.
    const today = new Date()
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 16)).toISOString().slice(0, 10)
    const areas = (await (await page.request.get(`${slug}/tables?date=${day}&time=${time}&guests=8`)).json()) as {
      tables: { id: string; seats: number; available: boolean }[]
    }[]
    const largeTables = areas.flatMap((area) => area.tables).filter((table) => table.available && table.seats >= 8)
    expect(largeTables.length).toBeGreaterThan(0)
    for (const table of largeTables) {
      const response = await page.request.post(`${slug}/reservations`, {
        data: { date: day, time, guests: 8, tableId: table.id, name: 'Velika grupa', phone: '+381 21 123456', language: 'en' },
      })
      expect(response.status()).toBe(201)
    }

    await page.goto(`/r/kafana-dunav?guests=8&date=${day}`)
    await page.locator(`[data-time-chip="${time}"]`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Your contact details' })).toBeVisible()
    await expect(page).toHaveURL(/step=details/)
    await expect(dialog.getByText('Table', { exact: true })).toHaveCount(0)
    await dialog.getByLabel('Name').fill('Druga grupa')
    await dialog.getByLabel('Phone').fill('+381 21 654321')
    await dialog.getByRole('button', { name: 'Send request' }).click()

    await expect(dialog.getByRole('heading', { name: 'Request sent' })).toBeVisible()
    await expect(dialog.getByText('Tables 2 + 3 · Sala')).toBeVisible()
    await settle(page)
    await screenshot(page, 'combinations', 'guest-chooses-combined', { fullPage: false })
  })

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
