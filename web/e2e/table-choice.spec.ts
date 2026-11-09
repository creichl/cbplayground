import { expect, type Locator, type Page, test } from '@playwright/test'
import { settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

/** Sets the table style of Rooftop Belvedere through the API, signed in as its admin; keeps its demo branding. */
async function setRooftopTableStyle(page: Page, tableStyle: string) {
  await signIn(page, 'admin@rooftop-belvedere.local')
  await expect(page).toHaveURL(/\/admin$/)
  const response = await page.request.put('/api/admin/branding', {
    data: { brandColor: '#c9a96e', themeMode: 'Dark', fontStyle: 'Elegant', tableStyle },
  })
  expect(response.status()).toBe(200)
}

/**
 * The plan in the dialog is drawn: its image or room has a size (it once shrank to nothing with the list open). Waits while the
 * plan changes, e.g. while a table chosen in another area cross-fades to that area's plan and is zoomed to. During the
 * cross-fade the previous area's plan fades out above it, inert: only the plan shown counts.
 */
async function expectPlanDrawn(dialog: Locator) {
  const plan = dialog.locator('[data-vaul-no-drag]:not([inert] *)')
  await expect.poll(async () => (await plan.boundingBox())?.width ?? 0).toBeGreaterThan(300)
  await expect.poll(async () => (await plan.boundingBox())?.height ?? 0).toBeGreaterThan(200)
}

/** Opens the booking dialog of Rooftop Belvedere at its first free time, at the table step. */
async function openRooftopTableStep(page: Page) {
  await page.goto('/r/rooftop-belvedere')
  await page.locator('[data-time-chip]').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
  await expect(dialog.locator('[data-floor-table]')).toHaveCount(8)
  return dialog
}

test.describe('Table choice', () => {
  test('uses nearly the whole window and shows the plan to scale', async ({ page }) => {
    await setRooftopTableStyle(page, 'Classic')
    await page.setViewportSize({ width: 1440, height: 900 })
    const dialog = await openRooftopTableStep(page)
    // Measured once the dialog's entrance (it grows from 96 %) is over, not halfway through it.
    await settle(page)

    // The dialog leaves 1 rem around it; the plan fills the height left beside the column of the areas.
    const box = (await dialog.boundingBox())!
    expect(box.width).toBeGreaterThan(1440 - 40)
    expect(box.height).toBeGreaterThan(900 - 40)
    const plan = (await dialog.locator('[data-vaul-no-drag]').boundingBox())!
    expect(plan.width).toBeGreaterThan(850)
    // The rooftop is 18 m wide: a bar of 2 m, and the legend says the plan is to scale.
    await expect(dialog.locator('[data-scale-bar]')).toHaveText('2 m')
    await expect(dialog.getByText('Plan and tables to scale')).toBeVisible()
    // Every table has its badge with its number, readable at 12 px or more however small the table is.
    const badge = dialog.locator('[data-floor-table]').filter({ hasText: 'R1' }).getByText('R1')
    await expect(badge).toHaveCSS('font-size', /^(1[2-5])(\.\d+)?px$/)
    await settle(page)
    await screenshot(page, 'table-choice', 'dialog-1440', { fullPage: false })

    await dialog.getByText('Show tables as a list').click()
    await dialog.getByRole('radio').first().click()
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
    // With the list open the plan keeps its place and size.
    await expectPlanDrawn(dialog)
    await settle(page)
    await screenshot(page, 'table-choice', 'dialog-1440-chosen', { fullPage: false })
  })

  test('fits a laptop screen', async ({ page }) => {
    await setRooftopTableStyle(page, 'Classic')
    await page.setViewportSize({ width: 1280, height: 720 })
    const dialog = await openRooftopTableStep(page)
    const plan = (await dialog.locator('[data-vaul-no-drag]').boundingBox())!
    expect(plan.height).toBeGreaterThanOrEqual(280)
    await settle(page)
    await screenshot(page, 'table-choice', 'dialog-1280x720', { fullPage: false })
    // The list of the lounge's free tables open below the plan: the plan stays drawn, at least 18 rem high.
    await dialog.getByRole('button', { name: /Lounge/ }).click()
    await expect(dialog.locator('[data-floor-table]')).toHaveCount(5)
    await dialog.getByText('Show tables as a list').click()
    await dialog.getByRole('radio').first().click()
    await expectPlanDrawn(dialog)
    await settle(page)
    await screenshot(page, 'table-choice', 'dialog-1280x720-list', { fullPage: false })
  })

  for (const tableStyle of ['Classic', 'Natural', 'Minimal', 'Glow']) {
    test(`draws the tables in the table style ${tableStyle}`, async ({ page }) => {
      await setRooftopTableStyle(page, tableStyle)
      await page.setViewportSize({ width: 1440, height: 900 })
      const dialog = await openRooftopTableStep(page)
      // A free table chosen on the plan itself, so the three states show side by side: free, chosen, not available.
      await dialog.locator('[data-floor-table].cursor-pointer').first().click()
      await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
      await expectPlanDrawn(dialog)
      await settle(page)
      await screenshot(page, 'table-choice', `style-${tableStyle.toLowerCase()}`, { fullPage: false })
    })
  }

  test('keeps the large tables for larger groups', async ({ page }) => {
    await setRooftopTableStyle(page, 'Classic')
    await page.setViewportSize({ width: 1440, height: 900 })
    const dialog = await openRooftopTableStep(page)
    // R6 seats 6 and is for 3 people or more online: for the 2 guests it is muted and says why.
    const r6 = dialog.locator('[data-floor-table]').filter({ hasText: 'R6' })
    await expect(r6).toHaveClass(/cursor-not-allowed/)
    await expect(dialog.getByText('Larger tables are kept for larger groups.')).toBeVisible()
    await r6.hover()
    await expect(page.getByRole('tooltip')).toContainText('Table R6 · too large for 2 people')
    await settle(page)
    await screenshot(page, 'table-choice', 'too-large-tables', { fullPage: false })
  })

  test('keeps the full-screen sheet on phones', async ({ page }) => {
    await setRooftopTableStyle(page, 'Classic')
    await page.setViewportSize({ width: 375, height: 812 })
    await openRooftopTableStep(page)
    await expect(page.locator('[data-scale-bar]')).toHaveText('2 m')
    await screenshot(page, 'table-choice', 'sheet-375')
  })
})
