import { expect, type Locator, type Page, test } from '@playwright/test'
import { settle } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The polish of the booking dialog: the time chip moving into the dialog's summary (a view transition of only those two), the
// hold's draining line and countdown with "Hold again", the main button turning into a check before the confirmation, the step
// segments filling, the phone sheet that only its handle drags closed and that asks first while a table is held, and less motion.
// At 1440 px (the dialog) and at 390 px with touch (the sheet).

const sizes = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const

/**
 * Records every call of document.startViewTransition: which elements carry a view-transition-name in the old state (when it is
 * called) and in the new one (once its update is made), and whether a dialog's or a sheet's overlay was in the page. The card's
 * time chip is "chip <time>", the summary's time "summary". Before the page's own scripts, so the app calls the wrapped one.
 */
async function recordViewTransitions(page: Page) {
  await page.addInitScript(`(() => {
    window.__viewTransitions = []
    window.__namedElements = () => Array.from(document.querySelectorAll('*'))
      .filter((element) => element !== document.documentElement && getComputedStyle(element).viewTransitionName !== 'none')
      .map((element) => element.hasAttribute('data-time-chip') ? 'chip ' + element.getAttribute('data-time-chip')
        : element.getAttribute('data-summary-part') === 'time' ? 'summary'
        : element.getAttribute('data-page-part') ?? element.tagName.toLowerCase())
    const original = document.startViewTransition
    if (typeof original !== 'function') return
    document.startViewTransition = function (argument) {
      const entry = {
        before: window.__namedElements(),
        after: null,
        withDialog: document.querySelector('[data-slot="dialog-overlay"],[data-slot="sheet-overlay"]') !== null,
      }
      window.__viewTransitions.push(entry)
      const update = typeof argument === 'function' ? argument : argument?.update
      return original.call(this, async () => {
        await update?.()
        entry.after = window.__namedElements()
      })
    }
  })()`)
}

type Recorded = { before: string[]; after: string[] | null; withDialog: boolean }

async function viewTransitions(page: Page) {
  return (await page.evaluate('window.__viewTransitions')) as Recorded[]
}

/** The elements with a view-transition-name now, and those with one set inline. */
async function namedNow(page: Page) {
  return (await page.evaluate(`({ named: window.__namedElements(), inline: document.querySelectorAll('[style*="view-transition-name"]').length })`)) as {
    named: string[]
    inline: number
  }
}

/** Opens Gasthaus zur Linde (the system assigns the table) and clicks its latest free time: the contact details with the hold. */
async function openZurLinde(page: Page) {
  await page.goto('/r/zur-linde')
  // The latest time: the earliest one can fall within the lead time while the test runs.
  const chip = page.locator('[data-time-chip]').last()
  await expect(chip).toBeEnabled()
  const time = (await chip.getAttribute('data-time-chip'))!
  await chip.click()
  const dialog = page.getByRole('dialog', { name: 'Your contact details' })
  await expect(dialog).toBeVisible()
  return { dialog, chip, time }
}

/** The scale of the hold's line, from its inline transform. */
async function lineScale(notice: Locator) {
  const transform = (await notice.locator('[data-hold-line]').getAttribute('style'))!
  return Number(/scaleX\(([\d.e-]+)\)/.exec(transform)![1])
}

/** How much of each step segment is filled, 0 to 1, by the width of its fill against its track. */
async function segmentFills(dialog: Locator) {
  return dialog.locator('[data-step-fill]').evaluateAll((fills) =>
    fills.map((fill) => Math.round((fill.getBoundingClientRect().width / fill.parentElement!.getBoundingClientRect().width) * 100) / 100),
  )
}

/** A swipe with one finger from `from`, `distance` px down, through the browser's touch input (touch events and pointer events). */
async function swipeDown(page: Page, from: { x: number; y: number }, distance: number) {
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  for (let step = 1; step <= 10; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y + (distance * step) / 10 }] })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await client.detach()
}

async function centre(locator: Locator) {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

for (const size of sizes) {
  const wide = size.width >= 768

  test.describe(`Booking dialog polish at ${size.width} px`, () => {
    test.use({ viewport: size, hasTouch: !wide })

    test('the time chip moves into the dialog and back', async ({ page }) => {
      await recordViewTransitions(page)
      await page.goto('/r/zur-linde')
      const chip = page.locator('[data-time-chip]').last()
      await expect(chip).toBeEnabled()
      const time = (await chip.getAttribute('data-time-chip'))!
      await page.evaluate('window.__viewTransitions = []')
      await chip.click()
      const dialog = page.getByRole('dialog', { name: 'Your contact details' })
      await expect(dialog).toBeVisible()
      const summaryTime = dialog.locator('[data-summary-part="time"]')
      await expect(summaryTime).toBeVisible()
      await settle(page)

      if (wide) {
        // Exactly one view transition, before the dialog was open: the card's chip in the old state, the summary's time in the new.
        await expect.poll(() => viewTransitions(page)).toEqual([{ before: [`chip ${time}`], after: ['summary'], withDialog: false }])
      } else {
        // On phones the sheet rises and the summary's time pops in, without a view transition.
        expect(await viewTransitions(page)).toEqual([])
        await expect(summaryTime.locator('..')).toHaveClass(/animate-chip-pop/)
      }
      // Afterwards neither keeps its name.
      const after = await namedNow(page)
      expect(after.inline).toBe(0)
      expect(after.named.filter((name) => name === 'summary' || name.startsWith('chip'))).toEqual([])
      await screenshot(page, 'booking-dialog-polish', `opened-${size.width}`, { fullPage: false })

      await dialog.getByRole('button', { name: 'Close' }).click()
      await expect(dialog).toBeHidden()
      // The chip keeps the focus, as before.
      await expect(chip).toBeFocused()
      if (wide) {
        // Closing moves the summary's time back into the chip.
        await expect.poll(async () => (await viewTransitions(page))[1]).toEqual({ before: ['summary'], after: [`chip ${time}`], withDialog: true })
        expect(await viewTransitions(page)).toHaveLength(2)
      }
      await settle(page)
      const closed = await namedNow(page)
      expect(closed.inline).toBe(0)
      expect(closed.named.filter((name) => name === 'summary' || name.startsWith('chip'))).toEqual([])
    })

    test('the hold drains, warns in its last minute and can be held again', async ({ page }) => {
      await page.clock.install()
      // The browser's clock runs ahead of the API's below; a new hold's end is moved by as much, so it ends 5 minutes from the
      // browser's now, as it does from the API's.
      let ahead = 0
      await page.route('**/api/public/restaurants/zur-linde/holds', async (route) => {
        const response = await route.fetch()
        const hold = (await response.json()) as { expiresAtUtc: string }
        await route.fulfill({ response, json: { ...hold, expiresAtUtc: new Date(Date.parse(hold.expiresAtUtc) + ahead).toISOString() } })
      })
      const { dialog } = await openZurLinde(page)
      const notice = dialog.locator('[data-hold-notice]')
      await expect(notice).toHaveAttribute('data-state', 'holding')
      await expect(notice).toHaveText(/We're holding table \S+ for you · 4:5\d/)
      const full = await lineScale(notice)
      expect(full).toBeGreaterThan(0.95)

      // The line drains over time.
      await page.clock.fastForward('01:00')
      await expect(notice).toHaveText(/· 3:5\d/)
      const later = await lineScale(notice)
      expect(later).toBeLessThan(full - 0.15)
      expect(later).toBeGreaterThan(0.7)

      // The last minute: the warning colour, and one announcement.
      await page.clock.fastForward('03:05')
      await expect(notice).toHaveAttribute('data-state', 'warning')
      await expect(notice.locator('[data-hold-line]')).toHaveClass(/bg-warning/)
      await expect(notice.locator('[aria-live="polite"]')).toHaveText('One minute left on your hold.')
      expect(await lineScale(notice)).toBeLessThan(0.2)
      await settle(page)
      await screenshot(page, 'booking-dialog-polish', `hold-last-minute-${size.width}`, { fullPage: false })

      // 0:00: the hold has ended, with "Hold again"; booking still works without it.
      await page.clock.fastForward('01:00')
      await expect(notice).toHaveAttribute('data-state', 'ended')
      await expect(notice.locator('[aria-live="polite"]')).toHaveText('Your hold has ended.')
      expect(await lineScale(notice)).toBe(0)
      const holdAgain = notice.getByRole('button', { name: 'Hold again' })
      await expect(holdAgain).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Book now' })).toBeVisible()
      // The line glides to empty within a second.
      await page.waitForTimeout(1000)
      await settle(page)
      await screenshot(page, 'booking-dialog-polish', `hold-ended-${size.width}`, { fullPage: false })

      ahead = Number(await page.evaluate('Date.now()')) - Date.now()
      const renewed = page.waitForResponse((response) => response.url().endsWith('/holds') && response.request().method() === 'POST')
      await holdAgain.click()
      expect((await renewed).status()).toBe(201)
      // The countdown starts again, near 5:00.
      const again = dialog.locator('[data-hold-notice]')
      await expect(again).toHaveAttribute('data-state', 'holding')
      await expect(again).toHaveText(/We're holding table \S+ for you · (5:00|4:5\d)/)
      expect(await lineScale(again)).toBeGreaterThan(0.95)
      await dialog.getByRole('button', { name: 'Close' }).click()
    })

    test('the segments fill per step and the button turns into a check before the confirmation', async ({ page }) => {
      await page.clock.install()
      await page.goto('/r/rooftop-belvedere')
      await page.locator('[data-time-chip]').last().click()
      const tableStep = page.getByRole('dialog', { name: 'Choose your table' })
      await expect(tableStep).toBeVisible()
      await settle(page)
      expect(await segmentFills(tableStep)).toEqual([1, 0, 0])

      await tableStep.getByText('Show tables as a list').click()
      await tableStep.getByRole('radio').first().click()
      await tableStep.getByRole('button', { name: 'Continue' }).click()
      const details = page.getByRole('dialog', { name: 'Your contact details' })
      await expect(details).toBeVisible()
      await settle(page)
      expect(await segmentFills(details)).toEqual([1, 1, 0])

      // Back empties the segment again.
      await details.getByRole('button', { name: 'Back' }).click()
      await expect(tableStep).toBeVisible()
      await settle(page)
      expect(await segmentFills(tableStep)).toEqual([1, 0, 0])
      await tableStep.getByRole('button', { name: 'Continue' }).click()
      await expect(details).toBeVisible()
      await settle(page)

      await details.getByLabel('Name').fill('Polish Test')
      await details.getByLabel('Email').fill('polish@example.com')
      // The browser's clock stands still from here, so the moment of the check lasts until the test lets it go on.
      await page.clock.pauseAt(new Date(Number(await page.evaluate('Date.now()')) + 1000))
      const booked = page.waitForResponse((response) => response.url().endsWith('/reservations') && response.request().method() === 'POST')
      const button = details.locator('[data-submit-state]')
      await details.getByRole('button', { name: 'Book now' }).click()
      expect((await booked).status()).toBe(201)
      await expect
        .poll(async () => {
          await page.clock.runFor(20)
          return button.getAttribute('data-submit-state')
        })
        .toBe('success')
      // The check shows in the button, the confirmation is not there yet.
      await expect(page.getByRole('heading', { name: 'Your table is reserved' })).toHaveCount(0)
      await expect(button.locator('path[pathLength]')).toBeVisible()
      await settle(page)
      await screenshot(page, 'booking-dialog-polish', `submit-check-${size.width}`, { fullPage: false })

      await page.clock.resume()
      const confirmation = page.getByRole('dialog', { name: 'Your table is reserved' })
      await expect(confirmation).toBeVisible()
      await settle(page)
      expect(await segmentFills(confirmation)).toEqual([1, 1, 1])
    })
  })
}

test.describe('Booking sheet on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('closes only from its handle, and asks first while the table is held', async ({ page }) => {
    const { dialog } = await openZurLinde(page)
    await expect(dialog.locator('[data-hold-notice]')).toHaveAttribute('data-state', 'holding')
    await settle(page)
    // A sheet with a little of the page above it.
    const top = (await dialog.boundingBox())!.y
    expect(top).toBeGreaterThan(8)
    expect(top).toBeLessThan(20)

    // A swipe down in the middle of the contact form does not close it.
    await swipeDown(page, await centre(dialog.getByText('Phone or email – one of the two is enough.')), 400)
    await page.waitForTimeout(600)
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Leave?' })).toHaveCount(0)

    // A swipe on the handle would close it: with the table held it springs back and asks first.
    const handle = page.locator('[data-vaul-handle]')
    await swipeDown(page, await centre(handle), 400)
    const question = page.getByRole('dialog', { name: 'Leave?' })
    await expect(question).toBeVisible()
    await expect(question).toContainText(/Your table is held for [0-4]:\d\d more\./)
    await settle(page)
    await screenshot(page, 'booking-dialog-polish', 'leave-question-390', { fullPage: false })

    // Stay: the sheet is back in its place.
    await question.getByRole('button', { name: 'Stay' }).click()
    await expect(question).toBeHidden()
    await expect(dialog).toBeVisible()
    await settle(page)
    expect(Math.abs((await dialog.boundingBox())!.y - top)).toBeLessThan(2)

    // Leave: it closes.
    await page.waitForTimeout(600)
    await swipeDown(page, await centre(handle), 400)
    await expect(question).toBeVisible()
    await question.getByRole('button', { name: 'Leave' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('Booking dialog polish with less motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

  test('runs no animation', async ({ page }) => {
    await recordViewTransitions(page)
    const running = () =>
      page.evaluate(
        "document.getAnimations().filter((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity).length",
      )
    const { dialog } = await openZurLinde(page)
    expect(await viewTransitions(page)).toEqual([])
    expect(await running()).toBe(0)
    const notice = dialog.locator('[data-hold-notice]')
    await expect(notice).toHaveText(/· 4:5\d/)
    // The next second's digit does not slide.
    await expect(notice).not.toHaveText((await notice.textContent())!, { timeout: 3000 })
    expect(await running()).toBe(0)

    await dialog.getByLabel('Name').fill('Still Test')
    await dialog.getByLabel('Email').fill('still@example.com')
    await dialog.getByRole('button', { name: 'Book now' }).click()
    await expect(page.getByRole('dialog', { name: 'Your table is reserved' })).toBeVisible()
    expect(await running()).toBe(0)
    expect(await viewTransitions(page)).toEqual([])
  })
})
