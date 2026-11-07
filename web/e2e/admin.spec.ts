import { expect, test } from '@playwright/test'
import { signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

test.describe('Admin', () => {
  test('shows the overview and the reservations of the restaurant', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByText('Welcome, Anna Admin!', { exact: false })).toBeVisible()
    await screenshot(page, 'admin', 'overview')

    // The key figure of the open requests opens them on the front desk.
    await page.getByRole('link', { name: /^Open requests: / }).click()
    await expect(page).toHaveURL(/\/frontdesk\?tab=requests$/)
    await expect(page.getByRole('tab', { name: /^Requests/ })).toHaveAttribute('aria-selected', 'true')

    // The reservations and the table overview of the admin are the front desk's service screen now.
    await page.goto('/admin/reservations')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('tab', { name: /^Upcoming/ })).toBeVisible()
    await screenshot(page, 'admin', 'reservations')
  })
})
