import { expect, type Page, test } from '@playwright/test'
import { screenshot } from './screenshot.ts'

/**
 * The sections of Gasthaus zur Linde's page in page order, as the navigation names them: the demo restaurant has all of them.
 * The card "Hours & location" (named "Opening hours") is the first block of the information on every layout.
 */
const sections = ['Opening hours', 'Photos', 'About us', 'Menu', 'Areas', 'Good to know', 'Contact']

/** Header (64 px) and section navigation (56 px): a section brought into view starts below them. */
const covered = 120

const navigation = (page: Page) => page.getByRole('navigation', { name: 'On this page' })

/** Opens Gasthaus zur Linde's page and scrolls past the cover image once the page is there. */
async function openScrolled(page: Page) {
  await page.goto('/r/zur-linde')
  await expect(page.getByRole('heading', { name: 'Gasthaus zur Linde', level: 1 })).toBeVisible()
  await page.evaluate('window.scrollTo(0, 1200)')
  await expect(navigation(page).getByRole('link', { name: 'Menu' })).toBeVisible()
}

/**
 * Checks that the menu can really be seen: the section and its parts that rise in when they come into view (Reveal, Stagger)
 * are no longer waiting invisible, and the section is fully opaque.
 */
async function expectMenuShown(page: Page) {
  const menu = page.locator('#menu')
  await expect(menu).not.toHaveAttribute('data-reveal', 'hidden')
  await expect(menu.locator('[data-reveal="hidden"]')).toHaveCount(0)
  await expect(menu).toHaveCSS('opacity', '1')
  await expect(menu.getByText('Obatzda mit Brezn und Radi')).toBeInViewport()
}

/** The top of an element in the window, in pixels. */
async function top(page: Page, selector: string) {
  return Number(await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top`))
}

for (const width of [1440, 390]) {
  const height = width === 390 ? 844 : 900

  test.describe(`Restaurant page section navigation at ${width} px`, () => {
    test.use({ viewport: { width, height } })

    test('appears below the header once the cover image is scrolled past', async ({ page }) => {
      await page.goto('/r/zur-linde')
      await expect(page.getByRole('heading', { name: 'Gasthaus zur Linde', level: 1 })).toBeVisible()
      // While the cover image is in view, the row is hidden and inert.
      const row = page.locator('nav[aria-label="On this page"]')
      await expect(row).toHaveAttribute('inert', '')
      await expect(row).toHaveCSS('opacity', '0')

      await page.evaluate('window.scrollTo(0, 1200)')
      await expect(row).not.toHaveAttribute('inert')
      await expect(row).toHaveCSS('opacity', '1')
      await expect(navigation(page).getByRole('link')).toHaveText(sections)
      if (width === 1440) {
        // The reservation card stays in view below the row, not under it.
        await expect.poll(() => top(page, '#booking')).toBeGreaterThanOrEqual(covered)
      } else {
        expect(await navigation(page).getByRole('list').evaluate((list) => list.scrollWidth > list.clientWidth)).toBe(true)
      }
      await screenshot(page, 'restaurant-navigation', `row-${width}`, { fullPage: false })
    })

    test('brings the menu below the header with a click and focuses its heading', async ({ page }) => {
      await openScrolled(page)
      await navigation(page).getByRole('link', { name: 'Menu' }).click()
      const heading = page.locator('#menu h2')
      await expect(heading).toBeFocused()
      await expect.poll(() => top(page, '#menu')).toBeGreaterThanOrEqual(covered)
      await expect.poll(() => top(page, '#menu')).toBeLessThan(covered + 40)
      await expect(navigation(page).getByRole('link', { name: 'Menu' })).toHaveAttribute('aria-current', 'location')
      await expect(page).toHaveURL(/\/r\/zur-linde$/)
      await expectMenuShown(page)
      await page.waitForTimeout(700)
      await screenshot(page, 'restaurant-navigation', `menu-${width}`, { fullPage: false })
    })

    test('marks the section in view as the page scrolls', async ({ page }) => {
      await openScrolled(page)
      for (const [id, name] of [
        ['opening-hours', 'Opening hours'],
        ['areas', 'Areas'],
        ['menu', 'Menu'],
        ['about', 'About us'],
      ]) {
        await page.evaluate(`document.getElementById('${id}').scrollIntoView({ block: 'start' })`)
        const link = navigation(page).getByRole('link', { name })
        await expect(link).toHaveAttribute('aria-current', 'location')
        await expect(navigation(page).locator('[aria-current="location"]')).toHaveCount(1)
        // On phones the row keeps the marked item in view.
        await expect(link).toBeInViewport()
      }
      // "Good to know" and "Contact" are the last two sections: at the end of the page, the last one is marked.
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
      await expect(navigation(page).getByRole('link', { name: 'Contact' })).toHaveAttribute('aria-current', 'location')
      await page.waitForTimeout(700)
      await screenshot(page, 'restaurant-navigation', `marked-${width}`, { fullPage: false })
    })

    test('opens at the menu with #menu in the address', async ({ page }) => {
      await page.goto('/r/zur-linde#menu')
      await expect(page.locator('#menu').getByRole('heading', { name: 'Menu', level: 2 })).toBeInViewport()
      await expect.poll(() => top(page, '#menu')).toBeGreaterThanOrEqual(covered)
      await expect.poll(() => top(page, '#menu')).toBeLessThan(covered + 40)
      await expect(navigation(page).getByRole('link', { name: 'Menu' })).toHaveAttribute('aria-current', 'location')
      await expectMenuShown(page)
      await page.waitForTimeout(700)
      await screenshot(page, 'restaurant-navigation', `hash-menu-${width}`, { fullPage: false })
    })
  })
}

test('shows no row on a page without sections', async ({ page }) => {
  // Bistro Morgenrot, the restaurant without any setup of superadmin.spec.ts: no photos, description, menu, areas, questions,
  // opening hours or contact. Created when missing and active only during this test, so it is left deactivated, as the
  // Superadmin's test and the start page's tests expect.
  expect((await page.request.post('/api/auth/login', { data: { email: 'superadmin@cbplayground.local', password: 'Demo1234!' } })).status()).toBe(200)
  const created = await page.request.post('/api/superadmin/tenants', { data: { name: 'Bistro Morgenrot', slug: 'bistro-morgenrot' } })
  const tenants = (await (await page.request.get('/api/superadmin/tenants')).json()) as { id: string; slug: string }[]
  const id = created.status() === 201 ? ((await created.json()) as { id: string }).id : tenants.find((tenant) => tenant.slug === 'bistro-morgenrot')!.id
  expect((await page.request.post(`/api/superadmin/tenants/${id}/activate`)).status()).toBe(200)
  try {
    await page.setViewportSize({ width: 390, height: 500 })
    await page.goto('/r/bistro-morgenrot')
    await expect(page.getByRole('heading', { name: 'Bistro Morgenrot', level: 1 })).toBeVisible()
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    await expect(page.locator('nav[aria-label="On this page"]')).toHaveCount(0)
  } finally {
    expect((await page.request.post(`/api/superadmin/tenants/${id}/deactivate`)).status()).toBe(200)
  }
})
