import { join } from 'node:path'
import type { Page } from '@playwright/test'

const screenshots = join(import.meta.dirname, '../../test-results/screenshots')

/** Saves a full-page screenshot of the checked page or state as test-results/screenshots/<feature>/<name>.png. */
export async function screenshot(page: Page, feature: string, name: string) {
  // Let the images and the remaining API calls finish, so the screenshot shows the page as a user sees it.
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: join(screenshots, feature, `${name}.png`), fullPage: true })
}
