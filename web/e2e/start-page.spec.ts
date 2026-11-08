import { expect, test } from '@playwright/test'
import { revealAll, signIn } from './helpers.ts'
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

  for (const width of [375, 1280]) {
    test(`shows the five parts of the start page at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 800 })
      await page.goto('/')
      // The photo at the top, in two widths, loaded first.
      const hero = page.locator('img[src="/home-hero-1200.webp"]')
      await expect(hero).toHaveAttribute('srcset', /home-hero-2400\.webp 2400w/)
      await expect(hero).toHaveAttribute('fetchpriority', 'high')
      await expect(page.getByRole('heading', { name: 'Reserve a table – directly with the restaurant', level: 1 })).toBeVisible()
      await expect(page.getByRole('searchbox', { name: 'Search by name or city' })).toBeVisible()
      // The header lies transparently with white text on the photo and becomes opaque when the page scrolls.
      const header = page.locator('header')
      await expect(header).toHaveCSS('color', 'rgb(255, 255, 255)')
      const count = ((await (await page.request.get('/api/tenants')).json()) as unknown[]).length
      await expect(page.getByRole('heading', { name: `${count} restaurants`, level: 2 })).toBeVisible()
      await expect(page.locator('main a[href^="/r/"]')).toHaveCount(count)
      await expect(page.getByRole('heading', { name: 'How it works', level: 2 })).toBeVisible()
      for (const step of ['Choose a restaurant', 'Pick a time and table', 'Get your confirmation']) {
        await expect(page.getByRole('heading', { name: step, level: 3 })).toBeVisible()
      }
      await expect(page.getByRole('heading', { name: 'Your tables, bookable online', level: 2 })).toBeVisible()
      for (const benefit of ['Online booking with floor plan', 'Your own look', 'Reception and table overview']) {
        await expect(page.getByRole('heading', { name: benefit, level: 3 })).toBeVisible()
      }
      await expect(page.locator('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
      const footer = page.locator('footer')
      await expect(footer.getByRole('link', { name: 'For restaurants: Sign in' })).toHaveAttribute('href', '/login')
      await expect(footer.getByRole('button', { name: /Language/ })).toBeVisible()
      await revealAll(page)
      await screenshot(page, 'start-page', `start-page-${width}`)
      await page.evaluate('window.scrollTo(0, 400)')
      await expect(header).not.toHaveCSS('color', 'rgb(255, 255, 255)')
    })
  }

  test('filters the restaurants by the search and scrolls to them', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.getByPlaceholder('Search by name or city').fill('Kafana')
    await expect(page.getByText('1 restaurant found')).toBeVisible()
    await expect(page.getByRole('heading', { name: '1 restaurant', level: 2 })).toBeVisible()
    await expect(page.locator('main a[href^="/r/"]')).toHaveCount(1)
    // The page scrolls until the card is in view, the search field stays in view.
    await expect(page.locator('main a[href="/r/kafana-dunav"]')).toBeInViewport()
    await expect(page.getByRole('searchbox')).toBeInViewport()
    await screenshot(page, 'start-page', 'search')
  })

  test('opens a restaurant from its card', async ({ page }) => {
    await page.goto('/')
    await page.locator('main a[href="/r/rooftop-belvedere"]').click()
    await expect(page).toHaveURL(/\/r\/rooftop-belvedere$/)
    await expect(page.getByRole('heading', { name: 'Rooftop Belvedere', level: 1 })).toBeVisible()
  })

  test('leads signed-in staff to their own area', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/')
    await expect(page.locator('main').getByRole('link', { name: 'Go to management' })).toHaveAttribute('href', '/admin')
    await expect(page.locator('footer').getByRole('link', { name: 'Go to management' })).toHaveAttribute('href', '/admin')
    await revealAll(page)
    await screenshot(page, 'start-page', 'signed-in')
  })

  test('does not move with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const count = ((await (await page.request.get('/api/tenants')).json()) as unknown[]).length
    await page.goto('/')
    await expect(page.locator('main a[href^="/r/"]')).toHaveCount(count)
    await page.waitForLoadState('networkidle')
    const moving = await page.evaluate(
      "document.getAnimations().filter((animation) => animation.playState === 'running' && Number(animation.effect?.getComputedTiming().duration) > 0).length",
    )
    expect(moving).toBe(0)
  })
})
