import { expect, test } from '@playwright/test'
import { screenshot } from './screenshot.ts'

test.describe('Booking', () => {
  test('shows the booking page of a restaurant', async ({ page }) => {
    await page.goto('/r/zur-linde')
    await expect(page.getByRole('heading', { name: 'Gasthaus zur Linde', level: 1 })).toBeVisible()
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await screenshot(page, 'booking', 'restaurant-page')
  })

  test('opens the booking dialog for a time', async ({ page }) => {
    await page.goto('/r/zur-linde')
    await page.locator('[data-time-chip]').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await screenshot(page, 'booking', 'booking-dialog')
  })

  test('shows the embedded booking', async ({ page }) => {
    await page.goto('/embed/zur-linde')
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await screenshot(page, 'booking', 'embed')
  })

  test('shows "not found" for an unknown restaurant', async ({ page }) => {
    await page.goto('/r/does-not-exist')
    await expect(page.getByText('Restaurant not found')).toBeVisible()
    await expect(page.locator('img[src="/not-found-photo.webp"]')).toBeVisible()
    await screenshot(page, 'booking', 'restaurant-not-found')
  })
})
