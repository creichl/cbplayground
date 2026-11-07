import { expect, type Locator, type Page, test } from '@playwright/test'
import { revealAll, settle } from './helpers.ts'
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
      await expect(page.getByRole('heading', { name: '3 restaurants', level: 2 })).toBeVisible()
      await expect(page.locator('main a[href^="/r/"]')).toHaveCount(3)
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
    await page.goto('/login')
    await page.getByLabel('Email').fill('admin@zur-linde.local')
    await page.getByLabel('Password', { exact: true }).fill('Demo1234!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/')
    await expect(page.locator('main').getByRole('link', { name: 'Go to management' })).toHaveAttribute('href', '/admin')
    await expect(page.locator('footer').getByRole('link', { name: 'Go to management' })).toHaveAttribute('href', '/admin')
    await revealAll(page)
    await screenshot(page, 'start-page', 'signed-in')
  })

  test('does not move with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('main a[href^="/r/"]')).toHaveCount(3)
    await page.waitForLoadState('networkidle')
    const moving = await page.evaluate(
      "document.getAnimations().filter((animation) => animation.playState === 'running' && Number(animation.effect?.getComputedTiming().duration) > 0).length",
    )
    expect(moving).toBe(0)
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
    await expect(page.locator('img[src="/not-found-photo.webp"]')).toBeVisible()
    await screenshot(page, 'booking', 'restaurant-not-found')
  })
})

/** Sets the table style of Rooftop Belvedere through the API, signed in as its admin; keeps its demo branding. */
async function setRooftopTableStyle(page: Page, tableStyle: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@rooftop-belvedere.local')
  await page.getByLabel('Password', { exact: true }).fill('Demo1234!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  const response = await page.request.put('/api/admin/branding', {
    data: { brandColor: '#c9a96e', themeMode: 'Dark', fontStyle: 'Elegant', tableStyle },
  })
  expect(response.status()).toBe(200)
}

/** The plan in the dialog is drawn: its image or room has a size (it once shrank to nothing with the list open). */
async function expectPlanDrawn(dialog: Locator) {
  const plan = (await dialog.locator('[data-vaul-no-drag]').boundingBox())!
  expect(plan.width).toBeGreaterThan(300)
  expect(plan.height).toBeGreaterThan(200)
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

/**
 * A day of Gasthaus zur Linde at least `daysAhead` days ahead, beyond the demo reservations (today and the next 7 days), on
 * which a party of `guests` can book online, and its first free evening time.
 */
async function freeLindeEvening(page: Page, daysAhead: number, guests: number) {
  const slug = '/api/public/restaurants/zur-linde'
  const today = new Date()
  for (let offset = daysAhead; offset < daysAhead + 30; offset++) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset)).toISOString().slice(0, 10)
    const availability = (await (await page.request.get(`${slug}/availability?date=${day}&guests=${guests}`)).json()) as {
      periods: { start: string; times: { time: string; available: boolean }[] }[]
    }
    const time = availability.periods
      .filter((period) => period.start >= '17:00')
      .flatMap((period) => period.times)
      .find((option) => option.available)?.time
    if (time !== undefined) {
      return { day, time }
    }
  }
  throw new Error('Gasthaus zur Linde has no free evening for this party.')
}

test.describe('Table combinations', () => {
  test('books 8 people online at Gasthaus zur Linde on two combined tables', async ({ page }) => {
    const { day, time } = await freeLindeEvening(page, 12, 8)
    // An earlier booking takes the table for 8, so only the combination of tables 2 and 3 seats the next group of 8.
    const first = await page.request.post('/api/public/restaurants/zur-linde/reservations', {
      data: { date: day, time, guests: 8, name: 'Erste Gruppe', phone: '+49 89 1234567', language: 'en' },
    })
    expect(first.status()).toBe(201)
    expect(await first.json()).toMatchObject({ tableNumber: '8' })

    await page.goto(`/r/zur-linde?guests=8&date=${day}&time=${time}&step=details`)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Zweite Gruppe')
    await dialog.getByLabel('Phone').fill('+49 89 7654321')
    await dialog.getByRole('button', { name: 'Book now' }).click()

    await expect(dialog.getByRole('heading', { name: 'Your table is reserved' })).toBeVisible()
    await expect(dialog.getByText('Tables 2 + 3 · Gaststube')).toBeVisible()
    await settle(page)
    await screenshot(page, 'combinations', 'online-confirmation', { fullPage: false })
  })

  test('skips the table step where the guest chooses, when only a combination seats the group', async ({ page }) => {
    const slug = '/api/public/restaurants/kafana-dunav'
    const time = '19:00'
    // A day beyond the demo reservations; the two tables for 8 are taken by earlier groups.
    const today = new Date()
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 16)).toISOString().slice(0, 10)
    const areas = (await (await page.request.get(`${slug}/tables?date=${day}&time=${time}&guests=8`)).json()) as {
      tables: { id: string; seats: number; available: boolean }[]
    }[]
    const largeTables = areas.flatMap((area) => area.tables).filter((table) => table.available && table.seats >= 8)
    expect(largeTables.length).toBeGreaterThan(0)
    for (const table of largeTables) {
      const response = await page.request.post(`${slug}/reservations`, {
        data: { date: day, time, guests: 8, tableId: table.id, name: 'Velika grupa', phone: '+381 21 123456', language: 'en' },
      })
      expect(response.status()).toBe(201)
    }

    await page.goto(`/r/kafana-dunav?guests=8&date=${day}`)
    await page.locator(`[data-time-chip="${time}"]`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Your contact details' })).toBeVisible()
    await expect(page).toHaveURL(/step=details/)
    await expect(dialog.getByText('Table', { exact: true })).toHaveCount(0)
    await dialog.getByLabel('Name').fill('Druga grupa')
    await dialog.getByLabel('Phone').fill('+381 21 654321')
    await dialog.getByRole('button', { name: 'Send request' }).click()

    await expect(dialog.getByRole('heading', { name: 'Request sent' })).toBeVisible()
    await expect(dialog.getByText('Tables 2 + 3 · Sala')).toBeVisible()
    await settle(page)
    await screenshot(page, 'combinations', 'guest-chooses-combined', { fullPage: false })
  })
})
