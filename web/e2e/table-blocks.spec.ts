import { expect, type Page, test } from '@playwright/test'
import { dateFromToday, settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// Blocking a table for a time from the service screen: blocked on the timeline, seen on the timeline and the floor plan, removed
// again on the floor plan.

type FloorArea = { tables: { id: string; number: string; seats: number }[] }

/**
 * A day from 50 days ahead (after the demo reservations and the online requests of the other tests) on which Kafana Dunav is
 * open, and a table without reservations or blocks on it.
 */
async function findFreeTable(page: Page) {
  const table = ((await (await page.request.get('/api/staff/floor')).json()) as FloorArea[]).flatMap((area) => area.tables)[0]
  for (let days = 50; days < 80; days++) {
    const date = dateFromToday(days)
    const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=1`)).json()) as { periods: unknown[] }
    const reservations = (await (await page.request.get(`/api/staff/reservations?from=${date}&to=${date}`)).json()) as { tableIds: string[] }[]
    const blocks = (await (await page.request.get(`/api/staff/table-blocks?date=${date}`)).json()) as { tableId: string }[]
    if (
      availability.periods.length > 0 &&
      !reservations.some((reservation) => reservation.tableIds.includes(table.id)) &&
      !blocks.some((block) => block.tableId === table.id)
    ) {
      return { date, table }
    }
  }
  throw new Error('No open day with a free table at Kafana Dunav from 50 to 80 days ahead.')
}

test.describe('Front desk: blocking a table', () => {
  test('blocks a table on the timeline, shows it on the timeline and the floor plan and removes it again', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const { date, table } = await findFreeTable(page)

    // The table's menu in its timeline row.
    await page.goto(`/frontdesk?date=${date}&view=timeline`)
    await page.getByRole('button', { name: `Table ${table.number}, seats: ${table.seats}`, exact: true }).click()
    await page.getByRole('button', { name: 'Block table…' }).click()
    const dialog = page.getByRole('dialog', { name: `Block table ${table.number}` })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('combobox', { name: 'From' }).click()
    await page.getByRole('option', { name: '6:00 PM', exact: true }).click()
    await dialog.getByRole('combobox', { name: 'To' }).click()
    await page.getByRole('option', { name: '8:00 PM', exact: true }).click()
    await dialog.getByLabel('Reason (optional)').fill('Wobbly, being repaired')
    await settle(page)
    await screenshot(page, 'table-blocks', 'dialog', { fullPage: false })
    await dialog.getByRole('button', { name: 'Block table', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(`Table ${table.number} is blocked from 6:00 PM to 8:00 PM.`)).toBeVisible()

    // Hatched on the timeline, with its reason.
    const timelineBlock = page.getByRole('button', { name: 'Blocked, 6:00 PM–8:00 PM, Wobbly, being repaired', exact: true })
    await expect(timelineBlock).toBeVisible()
    await expect(timelineBlock).toHaveText('Wobbly, being repaired')
    await timelineBlock.scrollIntoViewIfNeeded()
    await screenshot(page, 'table-blocks', 'timeline', { fullPage: false })

    // On the floor plan at 6:00 PM: blocked until 8:00 PM.
    await page.getByRole('tab', { name: 'Floor plan' }).click()
    const slider = page.getByLabel('Time', { exact: true })
    await slider.focus()
    for (let minutes = Number(await slider.inputValue()); minutes < 18 * 60; minutes += 15) {
      await page.keyboard.press('ArrowRight')
    }
    await expect(slider).toHaveValue(String(18 * 60))
    const marker = page.locator(`[data-table-id="${table.id}"]`)
    await expect(marker).toHaveAttribute('aria-label', `Table ${table.number}, seats: ${table.seats}, Blocked`)
    await expect(marker).toContainText('Blocked until 8:00 PM')
    await marker.scrollIntoViewIfNeeded()
    await screenshot(page, 'table-blocks', 'floor-plan', { fullPage: false })

    // A click offers to remove it, which frees the table.
    await marker.click()
    await expect(page.getByText(`Table ${table.number} blocked`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Remove block' }).click()
    await expect(page.getByText(`Table ${table.number} is no longer blocked.`)).toBeVisible()
    await expect(marker).toHaveAttribute('aria-label', `Table ${table.number}, seats: ${table.seats}, Free`)
    await expect(marker).not.toContainText('Blocked until')
    expect(await (await page.request.get(`/api/staff/table-blocks?date=${date}`)).json()).toEqual([])
    await screenshot(page, 'table-blocks', 'removed', { fullPage: false })
  })
})
