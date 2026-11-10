import { join } from 'node:path'
import type { Page } from '@playwright/test'

const screenshots = join(import.meta.dirname, '../../test-results/screenshots')

/**
 * Saves a full-page screenshot of the checked page or state as test-results/screenshots/<feature>/<name>.png; with
 * `fullPage: false` only the window, e.g. for a dialog that covers it. With `networkIdle: false` it does not wait for the API
 * calls first, e.g. for a loading state whose call the test holds back.
 */
export async function screenshot(
  page: Page,
  feature: string,
  name: string,
  { fullPage = true, networkIdle = true }: { fullPage?: boolean; networkIdle?: boolean } = {},
) {
  // Let the images and the remaining API calls finish, so the screenshot shows the page as a user sees it.
  if (networkIdle) await page.waitForLoadState('networkidle')
  await page.screenshot({ path: join(screenshots, feature, `${name}.png`), fullPage })
}
