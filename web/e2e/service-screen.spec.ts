import { expect, type Page, test } from '@playwright/test'
import { dateFromToday, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

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
