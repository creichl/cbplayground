import { expect, test } from '@playwright/test'
import { dateFromToday, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

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
