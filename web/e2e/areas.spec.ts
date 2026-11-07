import { expect, test } from '@playwright/test'
import { dateFromToday, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

test.describe('Table style and real size', () => {
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
    await page.getByRole('button', { name: 'Delete table', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Delete table ${number}?` })
    await expect(dialog.getByText('Its past and cancelled reservations are kept.', { exact: false })).toBeVisible()
    // After the dialog's entrance animation.
    await expect(dialog).toHaveCSS('opacity', '1')
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
    // A day with demo reservations, but none on archived tables, has no such row.
    const upcoming = (await (await page.request.get(`/api/staff/reservations?from=${dateFromToday(1)}&to=${dateFromToday(7)}`)).json()) as {
      date: string
    }[]
    expect(upcoming.length, 'demo reservations in the next days').toBeGreaterThan(0)
    await page.goto(`/admin/tables?date=${upcoming[0].date}`)
    await expect(page.getByRole('button', { name: /^.+ \(\d+\), / }).first()).toBeVisible()
    await expect(page.getByText('Archived tables', { exact: true })).toHaveCount(0)
  })
})
