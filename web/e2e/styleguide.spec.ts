import { expect, test } from '@playwright/test'
import { screenshot } from './screenshot.ts'

test.describe('Styleguide', () => {
  test('shows the status colours of the front desk', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dev/ui')
    const heading = page.getByRole('heading', { name: 'Reservation statuses' })
    await expect(page.getByText('--status-no-show(-surface, -text)')).toBeVisible()
    // The section at the top of the window, below the styleguide's sticky bar.
    await heading.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await page.evaluate('window.scrollBy(0, -120)')
    await screenshot(page, 'styleguide', 'status-colors', { fullPage: false })
  })
})
