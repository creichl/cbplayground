import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { revealAll, settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

/** A photo of a dish for the upload: one of the seed assets. */
const dishPhoto = join(import.meta.dirname, '../../api/Cbplayground.Api/Data/SeedAssets/zur-linde-gallery-kaiserschmarrn.jpg')

/**
 * The loaded menu section of the restaurant page, scrolled into view: it loads once it comes near the view, and while it
 * loads a skeleton with the same heading stands in.
 */
async function menuSection(page: Page) {
  const menu = page.locator('section[aria-labelledby="menu-heading"]')
  for (let y = 0; (await menu.count()) === 0 && y < 8000; y += 500) {
    await page.evaluate(`window.scrollTo(0, ${y})`)
    await page.waitForTimeout(100)
  }
  await expect(menu.getByRole('heading', { name: 'Menu', level: 2, exact: true })).toBeAttached()
  await menu.scrollIntoViewIfNeeded()
  return menu
}

test.describe('Menu', () => {
  test('adds a section and a dish with a photo on the admin page', async ({ page }) => {
    const sectionName = `Mittagstisch ${Date.now().toString(36)}`
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('link', { name: 'Menu' }).click()
    await expect(page).toHaveURL(/\/admin\/menu$/)
    await expect(page.getByRole('heading', { name: 'Brotzeit & Vorspeisen' })).toBeVisible()

    await page.getByRole('button', { name: 'Add section' }).click()
    const sectionDialog = page.getByRole('dialog', { name: 'New section' })
    await sectionDialog.getByLabel('Name').fill(sectionName)
    await sectionDialog.getByLabel('Description').fill('Montag bis Freitag, 11:30 bis 14:00 Uhr')
    await sectionDialog.getByRole('button', { name: 'Add section' }).click()
    await expect(page.getByText('Section added.')).toBeVisible()
    const card = page.locator(`[data-menu-section="${sectionName}"]`)
    await expect(card.getByRole('heading', { name: sectionName })).toBeVisible()
    await expect(card.getByText('No dishes in this section yet.')).toBeVisible()

    await card.getByRole('button', { name: 'Add dish' }).click()
    const drawer = page.getByRole('dialog', { name: 'New dish' })
    await drawer.getByLabel('Name').fill('Tagessuppe')
    await drawer.getByLabel('Description').fill('Kartoffelsuppe mit Majoran')
    await drawer.getByLabel('Price (EUR)').fill('6.5')
    await drawer.getByLabel('Vegetarian').check()
    await drawer.getByText('Celery', { exact: true }).click()
    await drawer.getByText('Milk', { exact: true }).click()
    await drawer.locator('input[type="file"]').setInputFiles(dishPhoto)
    await expect(drawer.getByRole('img', { name: 'Photo of Tagessuppe' })).toBeVisible()
    await settle(page)
    await screenshot(page, 'menu', 'admin-dish-drawer', { fullPage: false })

    await drawer.getByRole('button', { name: 'Save dish' }).click()
    await expect(page.getByText('“Tagessuppe” added.')).toBeVisible()
    await expect(drawer).toBeHidden()
    const row = card.getByRole('button', { name: 'Edit Tagessuppe' })
    await expect(row).toContainText('€6.50')
    await expect(row).toContainText('Vegetarian')
    await expect(row.locator('img')).toHaveAttribute('src', /\/api\/public\/restaurants\/zur-linde\/menu\/.+\/photo\?v=/)
    await card.scrollIntoViewIfNeeded()
    await screenshot(page, 'menu', 'admin-menu')

    // The dish is on the guests' menu, in its own tab, with its photo.
    const menu = (await (await page.request.get('/api/public/restaurants/zur-linde/menu')).json()) as {
      sections: { name: string; items: { name: string; price: number; photoUrl: string | null; allergens: string[] }[] }[]
    }
    expect(menu.sections.find((section) => section.name === sectionName)?.items).toEqual([
      expect.objectContaining({ name: 'Tagessuppe', price: 650, allergens: ['Milk', 'Celery'], photoUrl: expect.any(String) }),
    ])

    // Deleting the section asks first and takes the dish with it.
    await card.getByRole('button', { name: 'Delete section' }).click()
    const deleteDialog = page.getByRole('dialog', { name: 'Delete section?' })
    await expect(deleteDialog).toContainText('and its 1 dish will be deleted')
    await deleteDialog.getByRole('button', { name: 'Delete section' }).click()
    await expect(card).toHaveCount(0)
  })

  test('shows the menu of Gasthaus zur Linde with recommendations, tabs and the lightbox at 1440 px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/r/zur-linde')
    const menu = await menuSection(page)

    await expect(menu.getByRole('heading', { name: 'Recommendations of the house' })).toBeVisible()
    await expect(menu.getByRole('button', { name: /Kalbsbraten mit Semmelknödel/ })).toBeVisible()
    await expect(menu.getByRole('tab', { name: 'Brotzeit & Vorspeisen' })).toHaveAttribute('aria-selected', 'true')
    await expect(menu.getByRole('tabpanel').getByText('Obatzda mit Brezn und Radi')).toBeVisible()
    await expect(menu.getByText('Allergens: gluten, milk').first()).toBeVisible()
    await expect(menu.getByRole('img', { name: 'Vegetarian' }).first()).toBeVisible()
    await expect(menu.getByText('Allergen information is given by the restaurant.', { exact: false })).toBeVisible()

    await menu.getByRole('tab', { name: 'Hauptgerichte' }).click()
    await expect(menu.getByRole('tabpanel').getByText('Käsespätzle', { exact: true })).toBeVisible()
    await expect(menu.getByRole('tabpanel').getByText('€14.50')).toBeVisible()
    await menu.getByRole('tabpanel').getByRole('img', { name: 'Vegetarian' }).first().hover()
    await expect(page.getByRole('tooltip', { name: 'Vegetarian' })).toBeVisible()
    await revealAll(page)
    await menu.scrollIntoViewIfNeeded()
    await screenshot(page, 'menu', 'zur-linde-desktop')

    // A dish's thumbnail opens the lightbox with the photos of its section.
    await menu.getByRole('button', { name: 'Show photo of Käsespätzle' }).click()
    const lightbox = page.getByRole('dialog')
    await expect(lightbox).toBeVisible()
    await expect(lightbox).toContainText('Käsespätzle')
    await settle(page)
    await screenshot(page, 'menu', 'zur-linde-lightbox', { fullPage: false })
    await page.keyboard.press('Escape')
    await expect(lightbox).toBeHidden()
  })

  test('shows the menu of Gasthaus zur Linde on a phone at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/r/zur-linde')
    const menu = await menuSection(page)

    await expect(menu.getByRole('heading', { name: 'Recommendations of the house' })).toBeVisible()
    await expect(menu.getByRole('tablist', { name: 'Menu sections' })).toBeVisible()
    await menu.getByRole('tab', { name: 'Nachspeisen' }).click()
    await expect(menu.getByRole('tabpanel').getByText('Apfelstrudel', { exact: true })).toBeVisible()
    await revealAll(page)
    await menu.scrollIntoViewIfNeeded()
    await screenshot(page, 'menu', 'zur-linde-phone')

    await menu.getByRole('button', { name: 'Show photo of Apfelstrudel' }).click()
    await expect(page.getByRole('dialog')).toContainText('Apfelstrudel')
    await settle(page)
    await screenshot(page, 'menu', 'zur-linde-phone-lightbox', { fullPage: false })
  })

  test('shows the menu on the dark page of Rooftop Belvedere', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/r/rooftop-belvedere')
    const menu = await menuSection(page)

    await expect(menu.getByRole('heading', { name: 'Recommendations of the house' })).toBeVisible()
    await expect(menu.getByRole('tab', { name: 'Zum Teilen' })).toHaveAttribute('aria-selected', 'true')
    await expect(menu.getByRole('tabpanel').getByText('Burrata', { exact: true })).toBeVisible()
    await revealAll(page)
    await menu.scrollIntoViewIfNeeded()
    await screenshot(page, 'menu', 'rooftop-belvedere-dark')
  })

  test('shows the prices of Kafana Dunav in dinars', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/r/kafana-dunav')
    const menu = await menuSection(page)

    await menu.getByRole('tab', { name: 'Sa roštilja i iz Dunava' }).click()
    await expect(menu.getByRole('tabpanel').getByText('Ćevapi (10 kom)', { exact: true })).toBeVisible()
    await expect(menu.getByRole('tabpanel').getByText('RSD 1,150')).toBeVisible()
    await expect(menu.getByText('€', { exact: false })).toHaveCount(0)
    await revealAll(page)
    await menu.scrollIntoViewIfNeeded()
    await screenshot(page, 'menu', 'kafana-dunav-rsd')
  })
})
