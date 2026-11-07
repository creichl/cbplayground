import { expect, test } from '@playwright/test'
import { signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

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
