import { expect, test } from '@playwright/test'
import { screenshot } from './screenshot.ts'

test.describe('Not found', () => {
  for (const width of [375, 1280]) {
    test(`shows the not found page with its photo for an unknown address at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/does-not-exist')
      await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible()
      await expect(page.locator('img[src="/not-found-photo.webp"]')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Back to the start page' })).toHaveAttribute('href', '/')
      await screenshot(page, 'not-found', `page-not-found-${width}`)
    })
  }

  test('shows the not found page with its photo for an unknown reservation', async ({ page }) => {
    await page.goto('/r/zur-linde/reservation/ABC123?t=wrong')
    await expect(page.getByRole('heading', { name: 'Reservation not found', level: 1 })).toBeVisible()
    await expect(page.locator('img[src="/not-found-photo.webp"]')).toBeVisible()
    await screenshot(page, 'not-found', 'reservation-not-found')
  })
})
