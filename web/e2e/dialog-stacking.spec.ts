import { expect, type Locator, type Page, test } from '@playwright/test'
import { dateFromToday, settle } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The booking dialog lies fully on top of the page: no view transition runs while it is open (its named parts would be
// painted above it), the whole page is dimmed, its content is fully opaque once it has entered, and the card behind it keeps
// the booked party and day. And the transparent header of a restaurant's page never lies over the restaurant's name.
// The bookings are for 4 people on a later day: the card's presets (2 people, the first free day) differ from them, so
// the card would change behind the open dialog.

type Slot = { date: string; time: string }
type Area = { name: string; tables: { id: string; number: string; available: boolean }[] }

const guests = 4

const sizes = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'phone', width: 390, height: 844 },
] as const

/**
 * Records every call of document.startViewTransition and whether a dialog's or a sheet's overlay was in the page then.
 * Before the page's own scripts, so React Router and the app call the wrapped one.
 */
async function recordViewTransitions(page: Page) {
  await page.addInitScript(`(() => {
    window.__viewTransitions = []
    const original = document.startViewTransition
    if (typeof original !== 'function') return
    document.startViewTransition = function (...args) {
      window.__viewTransitions.push({ withDialog: document.querySelector('[data-slot="dialog-overlay"],[data-slot="sheet-overlay"]') !== null })
      return original.apply(this, args)
    }
  })()`)
}

async function viewTransitions(page: Page) {
  return (await page.evaluate('window.__viewTransitions')) as { withDialog: boolean }[]
}

/** The tables of a restaurant's areas at a time for the party. */
async function tablesAt(page: Page, slug: string, { date, time }: Slot) {
  const response = await page.request.get(`/api/public/restaurants/${slug}/tables?date=${date}&time=${time}&guests=${guests}`)
  return (await response.json()) as Area[]
}

/**
 * The first time from 5 days ahead on that is free for the party (with a table free in each of `areas` where given), so the
 * day is not the card's first free day and lies after the demo reservations.
 */
async function freeSlot(page: Page, slug: string, areas: string[] = []): Promise<Slot> {
  for (let days = 5; days < 60; days++) {
    const date = dateFromToday(days)
    const availability = (await (await page.request.get(`/api/public/restaurants/${slug}/availability?date=${date}&guests=${guests}`)).json()) as {
      periods: { times: { time: string; available: boolean; combined?: boolean }[] }[]
    }
    for (const slot of availability.periods.flatMap((period) => period.times).filter((option) => option.available && option.combined !== true)) {
      if (areas.length === 0) {
        return { date, time: slot.time }
      }
      const tables = await tablesAt(page, slug, { date, time: slot.time })
      if (areas.every((name) => tables.find((area) => area.name === name)?.tables.some((table) => table.available))) {
        return { date, time: slot.time }
      }
    }
  }
  throw new Error(`No free time at ${slug} in the next 60 days.`)
}

/** Opens the restaurant's page with the party and the day chosen and clicks the slot's time on the card. */
async function chooseTime(page: Page, slug: string, slot: Slot) {
  await page.goto(`/r/${slug}?guests=${guests}&date=${slot.date}`)
  const chip = page.locator(`[data-time-chip="${slot.time}"]`)
  await expect(chip).toBeEnabled()
  await chip.click()
}

/** Fills in the contact details and sends the booking; returns the confirmation dialog. */
async function sendDetails(page: Page, send: 'Send request' | 'Book now', title: string) {
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Your contact details' })).toBeVisible()
  await dialog.getByLabel('Name').fill('Stacking Test')
  await dialog.getByLabel('Email').fill('stacking@example.com')
  await dialog.getByRole('button', { name: send }).click()
  const confirmation = page.getByRole('dialog', { name: title })
  await expect(confirmation).toBeVisible()
  return confirmation
}

/** The centre of the part of an element that is in the window, or null when none of it is. */
async function visibleCentre(page: Page, selector: string) {
  return (await page.evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
    const left = Math.max(box.left, 0), right = Math.min(box.right, innerWidth)
    const top = Math.max(box.top, 0), bottom = Math.min(box.bottom, innerHeight)
    return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null
  })()`)) as { x: number; y: number } | null
}

/**
 * The checks of an open confirmation: the overlay covers the whole window, the page is below it at the card and the cover
 * image, the content is fully opaque and nothing moves any more one second after it appeared, and the card behind it still
 * shows the booked party and day.
 */
async function expectOnTop(page: Page, slot: Slot) {
  const overlay = page.locator('[data-slot="dialog-overlay"],[data-slot="sheet-overlay"]')
  await expect(overlay).toHaveCount(1)
  const viewport = page.viewportSize()!
  expect(await overlay.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height })

  const card = '[data-layout-part="booking-card"]'
  const cardCentre = await visibleCentre(page, card)
  expect(cardCentre).not.toBeNull()
  for (const point of [cardCentre, await visibleCentre(page, '[data-page-part="restaurant-cover"]')]) {
    if (point === null) continue
    const onTop = await page.evaluate(`(() => {
      const element = document.elementFromPoint(${point.x}, ${point.y})
      return element !== null && element.closest('[data-slot="dialog-overlay"],[data-slot="sheet-overlay"],[role="dialog"]') !== null
    })()`)
    expect(onTop).toBe(true)
  }

  await page.waitForTimeout(1000)
  // The content, and every element from the step's heading up to it (the step sliding in, the ticket rising), at full opacity.
  const opacities = (await page.evaluate(`(() => {
    const content = document.querySelector('[data-slot="dialog-content"],[data-slot="sheet-content"]')
    const values = []
    for (let element = content.querySelector('[data-step-heading]'); element !== null && element !== content.parentElement; element = element.parentElement) {
      values.push(getComputedStyle(element).opacity)
    }
    const ticket = content.querySelector('.animate-rise')
    if (ticket !== null) values.push(getComputedStyle(ticket).opacity)
    return values
  })()`)) as string[]
  expect(opacities.length).toBeGreaterThan(1)
  expect(new Set(opacities)).toEqual(new Set(['1']))
  // No entrance or other animation that ends is still running. Left out, as in settle(): endless ones, which never end by
  // design (e.g. a pulsing status dot), and the cover image's parallax, which follows the scrolling instead of the time.
  const running = await page.evaluate(
    "document.getAnimations().filter((animation) => animation.playState === 'running' && animation.timeline === document.timeline && animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.animationName ?? animation.transitionProperty ?? 'animation')",
  )
  expect(running).toEqual([])

  // The card behind the dialog keeps the booked party and day (it is hidden from assistive technology while the dialog is open).
  await expect(page.locator(`${card} button[aria-label="${guests} people"]`)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(`${card} [data-day="${slot.date}"]`)).toHaveAttribute('aria-pressed', 'true')
}

/** "Done" closes the confirmation, and the card shows the presets again: 2 people and the first free day. */
async function closeAndExpectPresets(page: Page, confirmation: Locator, slot: Slot) {
  await confirmation.getByRole('button', { name: 'Done' }).click()
  await expect(confirmation).toBeHidden()
  await expect(page.getByRole('button', { name: '2 people' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(`[data-layout-part="booking-card"] [data-day="${slot.date}"]`)).toHaveAttribute('aria-pressed', 'false')
}

for (const size of sizes) {
  test.describe(`Booking dialog on top of the page (${size.name}, ${size.width} px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('Trattoria Il Faro: a request with a table from another area', async ({ page }) => {
      await recordViewTransitions(page)
      const slot = await freeSlot(page, 'il-faro', ['Sala', 'Terrazza'])
      await chooseTime(page, 'il-faro', slot)
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
      await settle(page)

      // Another area: the plans crossfade inside the dialog, without a view transition of the page.
      const terrazza = dialog.getByRole('group', { name: 'Areas' }).getByRole('button', { name: /Terrazza/ })
      await terrazza.click()
      await expect(terrazza).toHaveAttribute('aria-pressed', 'true')
      await settle(page)
      await expect(dialog.locator('[data-vaul-no-drag]')).toHaveCount(1)
      const table = (await tablesAt(page, 'il-faro', slot)).find((area) => area.name === 'Terrazza')!.tables.find((option) => option.available)!
      await dialog.getByRole('button', { name: new RegExp(`^Table ${table.number} · up to \\d+ people$`) }).click()
      await dialog.getByRole('button', { name: 'Continue' }).click()

      const confirmation = await sendDetails(page, 'Send request', 'Request sent')
      await expectOnTop(page, slot)
      await screenshot(page, 'dialog-stacking', `il-faro-request-sent-${size.width}`, { fullPage: false })
      expect((await viewTransitions(page)).filter((call) => call.withDialog)).toEqual([])

      await closeAndExpectPresets(page, confirmation, slot)
      expect((await viewTransitions(page)).filter((call) => call.withDialog)).toEqual([])
    })

    test('Gasthaus zur Linde: an instant booking, the system assigns the table', async ({ page }) => {
      await recordViewTransitions(page)
      const slot = await freeSlot(page, 'zur-linde')
      await chooseTime(page, 'zur-linde', slot)
      const confirmation = await sendDetails(page, 'Book now', 'Your table is reserved')
      await expectOnTop(page, slot)
      expect((await viewTransitions(page)).filter((call) => call.withDialog)).toEqual([])

      await closeAndExpectPresets(page, confirmation, slot)
      expect((await viewTransitions(page)).filter((call) => call.withDialog)).toEqual([])
    })

    test('Rooftop Belvedere: the confirmation in the dark mode', async ({ page }) => {
      await recordViewTransitions(page)
      const slot = await freeSlot(page, 'rooftop-belvedere', ['Rooftop'])
      await chooseTime(page, 'rooftop-belvedere', slot)
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
      await dialog.getByRole('button', { name: 'No preference' }).click()

      await sendDetails(page, 'Book now', 'Your table is reserved')
      await expectOnTop(page, slot)
      await screenshot(page, 'dialog-stacking', `rooftop-confirmed-${size.width}`, { fullPage: false })
      expect((await viewTransitions(page)).filter((call) => call.withDialog)).toEqual([])
    })

    test('the header logo never lies over the restaurant name', async ({ page }) => {
      await page.goto('/r/il-faro')
      const name = page.getByRole('heading', { name: 'Trattoria Il Faro', level: 1 })
      await expect(name).toBeVisible()
      await settle(page)

      type Box = { left: number; right: number; top: number; bottom: number }
      const measure = async () =>
        (await page.evaluate(`(() => {
          const box = (element) => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
          const header = document.querySelector('header')
          return {
            logo: box(header.querySelector('a[aria-label="Trattoria Il Faro"]')),
            name: box(document.querySelector('main h1')),
            surface: Number(getComputedStyle(header.querySelector('div[aria-hidden="true"]')).opacity),
            heroBottom: document.querySelector('[data-page-part="restaurant-cover"]').getBoundingClientRect().bottom + scrollY,
          }
        })()`)) as { logo: Box; name: Box; surface: number; heroBottom: number }

      const { heroBottom } = await measure()
      let critical: number | null = null
      for (let y = 0; y <= heroBottom + 100; y += 20) {
        await page.evaluate(`window.scrollTo(0, ${y})`)
        // The header follows the scroll event; its surface fades in or out.
        await page.evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        await settle(page)
        const { logo, name: h1, surface } = await measure()
        const nameInView = h1.bottom > 0 && h1.top < size.height
        // Over the image (transparent header) the logo's box never touches the name's; once the header is opaque the name
        // passes below it.
        if (nameInView && surface < 1) {
          const overlap = logo.left < h1.right && h1.left < logo.right && logo.top < h1.bottom && h1.top < logo.bottom
          expect(overlap, `logo over the name at ${y} px`).toBe(false)
          expect(h1.top, `name below the header at ${y} px`).toBeGreaterThanOrEqual(64)
          critical = y
        }
      }
      expect(critical).not.toBeNull()
      // The last position with the transparent header: the name just below it.
      await page.evaluate(`window.scrollTo(0, ${critical})`)
      await page.evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      await settle(page)
      await screenshot(page, 'dialog-stacking', `header-name-${size.width}`, { fullPage: false })
    })
  })
}

test('the page transition from a start page card into the restaurant still runs', async ({ page }) => {
  await recordViewTransitions(page)
  await page.goto('/')
  await page.locator('main a[href="/r/il-faro"]').click()
  await expect(page).toHaveURL(/\/r\/il-faro$/)
  await expect(page.getByRole('heading', { name: 'Trattoria Il Faro', level: 1 })).toBeVisible()
  expect((await viewTransitions(page)).length).toBeGreaterThan(0)
  // The cover image is the shared element the card's photo moves into.
  await expect(page.locator('[data-page-part="restaurant-cover"]')).toHaveCSS('view-transition-name', 'restaurant-cover')
})
