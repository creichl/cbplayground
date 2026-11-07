import { expect, test } from '@playwright/test'
import { signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The Tenant Admin's reports over a period, from the sidebar group "Service", with the demo reservations of the development seed
// (the last 7 days, today and the next 7 days).

test.describe('Admin: reports', () => {
  test('shows the figures, charts and days of the last 30 days', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)

    await page.getByRole('group', { name: 'Service' }).getByRole('link', { name: 'Reports' }).click()
    await expect(page).toHaveURL(/\/admin\/reports$/)
    await expect(page.getByRole('heading', { name: 'Reports', level: 2 })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Last 30 days' })).toBeChecked()

    // The demo data has reservations in the last 7 days and today.
    await expect(page.getByText('Covers by weekday')).toBeVisible()
    await expect(page.getByRole('img', { name: /^Covers per day: busiest / })).toBeVisible()
    await expect(page.getByText('By booking channel')).toBeVisible()
    // The table per day: a header row and the 30 days.
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(31)
    await screenshot(page, 'reports', 'last-30-days')

    await page.getByText('Last 7 days').click()
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(8)
  })

  test('is not open to the front desk', async ({ page }) => {
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    expect((await page.request.get('/api/admin/reports')).status()).toBe(403)
    await page.goto('/admin/reports')
    await expect(page).toHaveURL(/\/frontdesk$/)
  })
})
