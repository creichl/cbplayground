import { expect, test } from '@playwright/test'
import { screenshot } from './screenshot.ts'

test.describe('Start page', () => {
  test('lists the restaurants', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Reserve a table – directly with the restaurant' })).toBeVisible()
    for (const name of ['Gasthaus zur Linde', 'Kafana Dunav', 'Rooftop Belvedere']) {
      await expect(page.getByText(name).first()).toBeVisible()
    }
    // The red bar of checkTailwind.ts appears when Tailwind's styles did not reach the page.
    await expect(page.getByText('Tailwind-Styles fehlen')).toHaveCount(0)
    await screenshot(page, 'start-page', 'restaurants')
  })

  test('filters the restaurants by the search', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder('Search by name or city').fill('Kafana')
    await expect(page.getByText('1 restaurant found')).toBeVisible()
    await screenshot(page, 'start-page', 'search')
  })
})

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
    await screenshot(page, 'booking', 'restaurant-not-found')
  })
})

test.describe('Not found', () => {
  test('shows the not found page for an unknown address', async ({ page }) => {
    await page.goto('/does-not-exist')
    await expect(page.getByText('Page not found')).toBeVisible()
    await screenshot(page, 'not-found', 'page-not-found')
  })
})
