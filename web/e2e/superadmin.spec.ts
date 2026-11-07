import { expect, type Page, test } from '@playwright/test'
import { signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

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
