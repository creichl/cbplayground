import { expect, test } from '@playwright/test'
import { menuSection, revealAll } from './helpers.ts'
import { screenshot } from './screenshot.ts'

/** The demo restaurants added last. */
const newRestaurants = [
  { slug: 'il-faro', name: 'Trattoria Il Faro' },
  { slug: 'cafe-morgenrot', name: 'Café Morgenrot' },
  { slug: 'izakaya-kaze', name: 'Izakaya Kaze' },
]

type PublicRestaurant = { gallery: { caption: string | null }[] }
type PublicMenu = { sections: { name: string; items: { name: string }[] }[] }

test.describe('Demo restaurants', () => {
  test('the start page shows a card for every demo restaurant', async ({ page }) => {
    // Counted from the API, so a restaurant added to the demo data does not break the test.
    const tenants = (await (await page.request.get('/api/tenants')).json()) as { slug: string; name: string }[]
    expect(tenants.length).toBeGreaterThanOrEqual(6)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: `${tenants.length} restaurants`, level: 2 })).toBeVisible()
    await expect(page.locator('main a[href^="/r/"]')).toHaveCount(tenants.length)
    for (const { slug, name } of newRestaurants) {
      await expect(page.locator(`main a[href="/r/${slug}"]`)).toContainText(name)
    }
    await revealAll(page)
    await screenshot(page, 'demo-restaurants', 'start-page')
  })

  for (const { slug, name } of newRestaurants) {
    test(`shows ${name} with its gallery and menu`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const restaurant = (await (await page.request.get(`/api/public/restaurants/${slug}`)).json()) as PublicRestaurant
      const { sections } = (await (await page.request.get(`/api/public/restaurants/${slug}/menu`)).json()) as PublicMenu
      expect(restaurant.gallery.length).toBeGreaterThanOrEqual(8)

      await page.goto(`/r/${slug}`)
      await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
      const gallery = page.locator('section[aria-labelledby="gallery-heading"]')
      await expect(gallery.getByRole('button', { name: `All photos (${restaurant.gallery.length})` })).toBeVisible()
      await expect(gallery.getByRole('img', { name: restaurant.gallery[0].caption ?? '' }).first()).toBeAttached()

      const menu = await menuSection(page)
      await expect(menu.getByRole('tab', { name: sections[0].name })).toHaveAttribute('aria-selected', 'true')
      await expect(menu.getByRole('tabpanel').getByText(sections[0].items[0].name, { exact: true })).toBeVisible()
      await revealAll(page)
      await screenshot(page, 'demo-restaurants', slug)
    })
  }
})
