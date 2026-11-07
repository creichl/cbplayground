import { expect, type Page, test } from '@playwright/test'
import { dateFromToday, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

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
