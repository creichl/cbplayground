import { expect, type Locator, type Page, test } from '@playwright/test'
import { reservationRow, settle, signIn, statusToast, timeOfDay, todayInBelgrade } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// Working on the plan of the service screen: dragging reservations on the timeline (mouse and touch), tapping a free cell
// to book it, dragging a guest from the list onto a table of the floor plan, "Arrived at another table…" and a reservation
// of combined tables. Every test books its own reservations at Kafana Dunav, at times and tables it finds free.

type FreeTable = { kind: 'table' | 'combination'; id: string; tableIds: string[]; number: string }
type FloorTable = { id: string; number: string; seats: number }
type Booked = { id: string; time: string; tableIds: string[] }

/** The day `days` after today in Kafana Dunav's time zone, "YYYY-MM-DD". */
function dayInBelgrade(days: number) {
  const [year, month, day] = todayInBelgrade().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** The start times of `date` with their free tables and combinations for `guests`. */
async function freeTimes(page: Page, date: string, guests: number) {
  const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=${guests}`)).json()) as {
    periods: { times: { time: string; tables: FreeTable[] }[] }[]
  }
  return availability.periods.flatMap((period) => period.times)
}

/**
 * A day from `days` after today on (Kafana Dunav closes on some public holidays), a time on it and two tables whose rows lie next
 * to each other on the timeline (same area), both free for 2 at that time.
 */
async function neighbourTables(page: Page, days: number) {
  const floor = (await (await page.request.get('/api/staff/floor')).json()) as { tables: FloorTable[] }[]
  const pairs = floor.flatMap((area) => area.tables.slice(1).map((table, index) => [area.tables[index], table] as const))
  for (let day = days; day < days + 14; day++) {
    const date = dayInBelgrade(day)
    for (const slot of await freeTimes(page, date, 2)) {
      const free = new Set(slot.tables.filter((table) => table.kind === 'table').map((table) => table.id))
      const pair = pairs.find(([first, second]) => free.has(first.id) && free.has(second.id))
      if (pair !== undefined) {
        return { date, time: slot.time, first: pair[0], second: pair[1] }
      }
    }
  }
  throw new Error(`No two neighbouring tables of Kafana Dunav are free at the same time in the 14 days from ${dayInBelgrade(days)}.`)
}

/** Books a reservation through the staff API, signed in as Kafana Dunav's front desk. */
async function book(page: Page, date: string, time: string, guests: number, tableIds: string[], name: string) {
  const response = await page.request.post('/api/staff/reservations', {
    data: { date, time, guests, tableIds, durationMinutes: null, name, phone: '+381 64 7654321', email: null, notes: null },
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as Booked
}

/** A reservation for 2 today at the first time with a free table; null when no time is left today (e.g. late in the evening). */
async function bookToday(page: Page, name: string) {
  const date = todayInBelgrade()
  const slot = (await freeTimes(page, date, 2)).find((candidate) => candidate.tables.length > 0)
  return slot === undefined ? null : book(page, date, slot.time, 2, slot.tables[0].tableIds, name)
}

/** A table free for the whole reservation other than its own (GET /api/staff/reservations/{id}/free-tables). */
async function otherFreeTable(page: Page, reservation: Booked, floor: FloorTable[]) {
  const free = (await (await page.request.get(`/api/staff/reservations/${reservation.id}/free-tables`)).json()) as FreeTable[]
  const table = free.find((candidate) => candidate.kind === 'table' && !reservation.tableIds.includes(candidate.id))
  return table === undefined ? undefined : floor.find((candidate) => candidate.id === table.id)
}

async function floorTables(page: Page) {
  return ((await (await page.request.get('/api/staff/floor')).json()) as { tables: FloorTable[] }[]).flatMap((area) => area.tables)
}

/** The row of a table on the timeline. */
function timelineRow(page: Page, tableId: string) {
  return page.locator(`[data-timeline-row="${tableId}"]`)
}

/** The block of a reservation in the row of a table on the timeline. */
function blockIn(page: Page, tableId: string, reservationId: string) {
  return timelineRow(page, tableId).locator(`[data-reservation-block="${reservationId}"]`)
}

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  expect(found).not.toBeNull()
  return found!
}

/** Where a block is taken: a little inside its left edge, at half its height. */
async function grip(block: Locator) {
  const { x, y, width, height } = await box(block)
  return { x: x + Math.min(20, width / 2), y: y + height / 2 }
}

/** The vertical middle of a table's row on the timeline. */
async function middleOf(row: Locator) {
  const { y, height } = await box(row)
  return y + height / 2
}

test.describe('Front desk: moving reservations on the timeline', () => {
  test('moves a block to another free table and undoes it', async ({ page }) => {
    const name = 'Dragan Premeštaj'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const { date, time, first, second } = await neighbourTables(page, 3)
    const reservation = await book(page, date, time, 2, [first.id], name)

    await page.goto(`/frontdesk?date=${date}&view=timeline`)
    const block = blockIn(page, first.id, reservation.id)
    await block.scrollIntoViewIfNeeded()
    const from = await grip(block)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, await middleOf(timelineRow(page, second.id)), { steps: 12 })
    // While dragging, the row under the pointer is free for it, and so is the one it came from.
    await expect(timelineRow(page, second.id)).toHaveAttribute('data-drop', 'fits')
    await expect(timelineRow(page, first.id)).toHaveAttribute('data-drop', 'fits')
    await expect(page.locator('[data-drag-ghost]')).toHaveCount(1)
    await screenshot(page, 'front-desk-moves', 'timeline-dragging', { fullPage: false })
    await page.mouse.up()

    const moved = statusToast(page, `${name} moved to table ${second.number} at ${timeOfDay(time)}`)
    await expect(moved).toBeVisible()
    await expect(blockIn(page, second.id, reservation.id)).toBeVisible()
    await expect(blockIn(page, first.id, reservation.id)).toHaveCount(0)
    await settle(page)
    await screenshot(page, 'front-desk-moves', 'timeline-moved-with-undo', { fullPage: false })

    await moved.getByRole('button', { name: 'Undo' }).click()
    await expect(statusToast(page, `${name} is back at table ${first.number} at ${timeOfDay(time)}`)).toBeVisible()
    await expect(blockIn(page, first.id, reservation.id)).toBeVisible()
    await expect(blockIn(page, second.id, reservation.id)).toHaveCount(0)
  })

  test('springs back with the message when the block is dropped on a taken table', async ({ page }) => {
    const name = 'Zoran Vraćen'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const { date, time, first, second } = await neighbourTables(page, 4)
    const reservation = await book(page, date, time, 2, [first.id], name)
    await book(page, date, time, 2, [second.id], 'Ana Zauzeta')

    await page.goto(`/frontdesk?date=${date}&view=timeline`)
    const block = blockIn(page, first.id, reservation.id)
    await block.scrollIntoViewIfNeeded()
    const from = await grip(block)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, await middleOf(timelineRow(page, second.id)), { steps: 12 })
    // The taken row is hatched and says why.
    await expect(timelineRow(page, second.id)).toHaveAttribute('data-drop', 'unfit')
    await expect(timelineRow(page, second.id).getByText('Taken', { exact: true })).toBeVisible()
    await screenshot(page, 'front-desk-moves', 'timeline-drop-taken', { fullPage: false })
    await page.mouse.up()

    const refused = statusToast(page, 'The reservation could not be moved')
    await expect(refused).toBeVisible()
    await expect(refused).toContainText('This table is taken at this time or has too few seats.')
    await expect(page.locator('[data-drag-ghost]')).toHaveCount(0)
    await expect(blockIn(page, first.id, reservation.id)).toBeVisible()
    await expect(blockIn(page, second.id, reservation.id)).toHaveCount(0)
    await settle(page)
    await screenshot(page, 'front-desk-moves', 'timeline-drop-refused', { fullPage: false })
  })

  test('opens the new reservation pre-filled with the table and time of a tapped free cell', async ({ page }) => {
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const { date, time, first, second } = await neighbourTables(page, 5)
    // A block in the neighbouring row shows where the time lies.
    const reservation = await book(page, date, time, 2, [first.id], 'Petar Komšija')

    await page.goto(`/frontdesk?date=${date}&view=timeline`)
    const block = blockIn(page, first.id, reservation.id)
    await block.scrollIntoViewIfNeeded()
    const { x } = await box(block)
    await page.mouse.click(x + 10, await middleOf(timelineRow(page, second.id)))

    const drawer = page.getByRole('dialog', { name: 'New reservation' })
    await expect(drawer).toBeVisible()
    await expect(drawer.locator(`input[type="radio"][value="${time}"]`)).toBeChecked()
    await expect(drawer.getByRole('combobox', { name: 'Table', exact: true })).toHaveValue(new RegExp(`^Table ${second.number} · `))
    await settle(page)
    await screenshot(page, 'front-desk-moves', 'timeline-tap-new-reservation', { fullPage: false })
  })

  test('shows a reservation of combined tables as linked blocks in both rows and on both tables', async ({ page }) => {
    const name = 'Družina Spojena'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    // The demo combination of Kafana Dunav, tables 2 and 3 of the Sala, on the first open day from 6 days ahead on where it is free.
    let found: { date: string; time: string; combination: FreeTable } | undefined
    for (let day = 6; found === undefined && day < 20; day++) {
      const date = dayInBelgrade(day)
      for (const candidate of await freeTimes(page, date, 6)) {
        const combination = candidate.tables.find((table) => table.kind === 'combination')
        if (combination !== undefined) {
          found = { date, time: candidate.time, combination }
          break
        }
      }
    }
    expect(found).toBeDefined()
    const { date, time, combination } = found!
    const reservation = await book(page, date, time, 6, combination.tableIds, name)
    expect(reservation.tableIds).toHaveLength(2)

    await page.goto(`/frontdesk?date=${date}&view=timeline`)
    const [first, second] = reservation.tableIds
    await expect(page.locator(`[data-reservation-block="${reservation.id}"]`)).toHaveCount(2)
    await expect(blockIn(page, first, reservation.id)).toHaveAccessibleName(new RegExp(`^${name} \\(6\\), .*, tables ${combination.number.replace(/\+/g, '\\+')}, Confirmed$`))
    await expect(blockIn(page, second, reservation.id)).toBeVisible()
    await blockIn(page, first, reservation.id).scrollIntoViewIfNeeded()
    await blockIn(page, first, reservation.id).hover()
    await screenshot(page, 'front-desk-moves', 'timeline-combined', { fullPage: false })

    // On the floor plan both tables carry it at its time.
    await page.goto(`/frontdesk?date=${date}`)
    const [hours, minutes] = time.split(':').map(Number)
    await page.getByRole('slider', { name: 'Time' }).fill(String(hours * 60 + minutes))
    const floor = await floorTables(page)
    for (const id of reservation.tableIds) {
      const table = floor.find((candidate) => candidate.id === id)!
      await expect(page.getByLabel(`Table ${table.number}, seats: ${table.seats}, Confirmed`, { exact: true })).toBeVisible()
    }
    await screenshot(page, 'front-desk-moves', 'floor-combined', { fullPage: false })
  })
})

test.describe('Front desk: moving a reservation by touch', () => {
  test.use({ hasTouch: true })

  test('drags a block to another free table with a finger', async ({ page }) => {
    const name = 'Mira Dodir'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const { date, time, first, second } = await neighbourTables(page, 7)
    const reservation = await book(page, date, time, 2, [first.id], name)

    await page.goto(`/frontdesk?date=${date}&view=timeline`)
    const block = blockIn(page, first.id, reservation.id)
    await block.scrollIntoViewIfNeeded()
    const from = await grip(block)
    const to = await middleOf(timelineRow(page, second.id))
    // Real touch events (pointerType "touch"), which page.mouse does not send.
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
    for (let step = 1; step <= 12; step++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y + ((to - from.y) * step) / 12 }] })
    }
    await expect(timelineRow(page, second.id)).toHaveAttribute('data-drop', 'fits')
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    await expect(statusToast(page, `${name} moved to table ${second.number} at ${timeOfDay(time)}`)).toBeVisible()
    await expect(blockIn(page, second.id, reservation.id)).toBeVisible()
    await settle(page)
    await screenshot(page, 'front-desk-moves', 'timeline-touch-moved', { fullPage: false })
  })
})

test.describe('Front desk: seating at another table', () => {
  test('drags a guest from the list onto a free table of the floor plan and seats them there', async ({ page }) => {
    const name = 'Goran Dovučen'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const reservation = await bookToday(page, name)
    test.skip(reservation === null, 'Kafana Dunav has no free time left today at the time of the run, so there is no reservation of today to seat.')
    const target = await otherFreeTable(page, reservation!, await floorTables(page))
    test.skip(target === undefined, 'No other table of Kafana Dunav is free for the reservation of today.')
    await page.reload()

    const table = page.locator(`[data-table-id="${target!.id}"]`)
    await table.scrollIntoViewIfNeeded()
    const handle = reservationRow(page, name).locator('[data-drag-handle]')
    await handle.scrollIntoViewIfNeeded()
    const from = await box(handle)
    const to = await box(table)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
    await expect(table).toHaveAttribute('data-drop', 'target')
    await screenshot(page, 'front-desk-moves', 'floor-dragging-guest', { fullPage: false })
    await page.mouse.up()

    const seated = statusToast(page, `${name} arrived at table ${target!.number}`)
    await expect(seated).toBeVisible()
    await page.getByRole('tab', { name: /^Seated/ }).click()
    const row = reservationRow(page, name)
    await expect(row.getByText('Arrived', { exact: true })).toBeVisible()
    await expect(row).toContainText(`Table ${target!.number} `)
    await settle(page)
    await screenshot(page, 'front-desk-moves', 'floor-guest-seated', { fullPage: false })

    // One undo restores the status and the table.
    await seated.getByRole('button', { name: 'Undo' }).click()
    await page.getByRole('tab', { name: /^Upcoming/ }).click()
    await expect(row.getByText('Confirmed', { exact: true })).toBeVisible()
    await expect(row).not.toContainText(`Table ${target!.number} `)
  })

  test('marks a guest as arrived at another table from the quick action', async ({ page }) => {
    const name = 'Lidija Drugistol'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    const reservation = await bookToday(page, name)
    test.skip(reservation === null, 'Kafana Dunav has no free time left today at the time of the run, so there is no reservation of today to seat.')
    const target = await otherFreeTable(page, reservation!, await floorTables(page))
    test.skip(target === undefined, 'No other table of Kafana Dunav is free for the reservation of today.')
    await page.reload()

    const row = reservationRow(page, name)
    await row.getByRole('button', { name: 'Arrived at another table…' }).click()
    const choice = page.getByRole('dialog').filter({ hasText: 'Free until the end of the reservation' })
    const option = choice.getByRole('button', { name: new RegExp(`^Table ${target!.number} · `) })
    await expect(option).toBeVisible()
    await settle(page)
    await screenshot(page, 'front-desk-moves', 'arrived-at-another-table-choice', { fullPage: false })
    await option.click()

    await expect(statusToast(page, `${name} arrived at table ${target!.number}`)).toBeVisible()
    await page.getByRole('tab', { name: /^Seated/ }).click()
    await expect(row.getByText('Arrived', { exact: true })).toBeVisible()
    await expect(row).toContainText(`Table ${target!.number} `)
    await settle(page)
    await screenshot(page, 'front-desk-moves', 'arrived-at-another-table-done', { fullPage: false })
  })
})
