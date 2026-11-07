import { expect, test } from '@playwright/test'
import { dateFromToday, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

test.describe('Pacing', () => {
  test('sets a rule on the settings page, and a staff booking above it shows the warning but is saved', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)

    // A day three weeks ahead on which Zur Linde has a free table for 4, so the test does not depend on the demo data.
    let date: string | undefined
    let time: string | undefined
    for (let days = 21; days < 35 && time === undefined; days++) {
      date = dateFromToday(days)
      const availability = (await (await page.request.get(`/api/staff/availability?date=${date}&guests=4`)).json()) as {
        periods: { times: { time: string; tables: unknown[] }[] }[]
      }
      time = availability.periods.flatMap((period) => period.times).find((slot) => slot.tables.length > 0)?.time
    }
    expect(time, 'a free time at Zur Linde three weeks ahead').toBeDefined()
    const [year, month, day] = date!.split('-').map(Number)
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(year, month - 1, day))

    // The whole day of the week, at most 2 guests per 15 minutes.
    await page.goto('/admin/reservation-settings')
    await expect(page.getByRole('heading', { name: 'Pacing' })).toBeVisible()
    await expect(page.getByText('No rules yet: there is no limit.')).toBeVisible()
    await page.getByRole('button', { name: '+ Rule' }).last().click()
    const rule = page.getByRole('group', { name: 'Pacing rule 1' })
    await rule.getByText(weekday, { exact: true }).click()
    await rule.getByLabel('From', { exact: true }).fill('00:00')
    await rule.getByLabel('To', { exact: true }).fill('00:00')
    await rule.getByLabel('Max. guests per 15 minutes').fill('2')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('The reservation settings have been saved.')).toBeVisible()
    const settings = await page.request.get('/api/admin/reservation-settings')
    expect((await settings.json()).pacingRules).toEqual([
      { days: [new Date(year, month - 1, day).getDay()], from: '00:00', to: '24:00', maxCovers: 2 },
    ])
    await screenshot(page, 'pacing', 'settings-rule')

    // A party of 4 is above the limit of 2: the drawer warns, but the reservation can still be saved.
    await page.goto(`/admin/reservations?date=${date}`)
    await page.getByRole('button', { name: 'New reservation' }).click()
    const drawer = page.getByRole('dialog', { name: 'New reservation' })
    await drawer.getByLabel('Guests').fill('4')
    const [hours, minutes] = time!.split(':').map(Number)
    const label = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hours, minutes))
    await drawer.getByText(label, { exact: true }).click()
    await expect(drawer.getByText('Above the pacing limit')).toBeVisible()
    await expect(drawer.getByText(`0 guests already start at ${label}; with this party it will be 4, the limit is 2 per 15 minutes.`, { exact: false })).toBeVisible()
    await drawer.getByLabel('Name').fill('Pacing Gast')
    await screenshot(page, 'pacing', 'staff-booking-warning', { fullPage: false })
    await drawer.getByRole('button', { name: 'Create reservation' }).click()
    await expect(page.getByText('The reservation for Pacing Gast has been created', { exact: false })).toBeVisible()

    // Back to the demo data for the other tests: cancel the reservation and remove the rule.
    const reservations = (await (await page.request.get(`/api/staff/reservations?from=${date}&to=${date}`)).json()) as { id: string; name: string }[]
    const created = reservations.find((reservation) => reservation.name === 'Pacing Gast')
    expect(created).toBeDefined()
    expect((await page.request.post(`/api/staff/reservations/${created!.id}/status`, { data: { status: 'Cancelled' } })).status()).toBe(200)
    await page.goto('/admin/reservation-settings')
    await page.getByRole('group', { name: 'Pacing rule 1' }).getByRole('button', { name: 'Delete rule' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('The reservation settings have been saved.')).toBeVisible()
    expect((await (await page.request.get('/api/admin/reservation-settings')).json()).pacingRules).toEqual([])
  })
})
