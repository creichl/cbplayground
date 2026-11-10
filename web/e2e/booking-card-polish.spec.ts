import { expect, type Frame, type Locator, type Page, test } from '@playwright/test'
import { dateFromToday, settle, timeOfDay } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The polish of the reservation card: the selection pill below the chosen party size and day, the month labels of the date
// strip, the live summary of the choice, a readable "2 tables left", taken times in a row as one chip, the card that folds
// in the embed while the steps are open (with the height the embed reports), and no motion with less motion. Light (Gasthaus
// zur Linde) and dark (Rooftop Belvedere), at 1440 and 390 px. The tests that book do so through the public API, each on a
// day of its own far ahead.

const restaurants = [
  { slug: 'zur-linde', look: 'light' },
  { slug: 'rooftop-belvedere', look: 'dark' },
] as const

const sizes = [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
] as const

type Slot = { time: string; available: boolean; remaining: number }

/** The opening windows of a day with their times, for a party size. */
async function periodsOf(page: Page, slug: string, date: string, guests: number) {
  const response = await page.request.get(`/api/public/restaurants/${slug}/availability?date=${date}&guests=${guests}`)
  return ((await response.json()) as { periods: { times: Slot[] }[] }).periods.map((period) => period.times)
}

/** Books a time online, as a guest would. */
async function book(page: Page, slug: string, date: string, time: string, guests: number) {
  const response = await page.request.post(`/api/public/restaurants/${slug}/reservations`, {
    data: { date, time, guests, name: 'Polish Test', phone: '+49 89 1234567', language: 'en' },
  })
  expect(response.status()).toBe(201)
}

/** The first open day from `days` ahead with at least `free` free times for the party. */
async function openDayFrom(page: Page, slug: string, days: number, guests: number, free = 1) {
  for (let offset = days; offset < days + 14; offset++) {
    const date = dateFromToday(offset)
    if ((await periodsOf(page, slug, date, guests)).flat().filter((slot) => slot.available).length >= free) {
      return date
    }
  }
  throw new Error(`No open day from ${days} days ahead.`)
}

/** A day "YYYY-MM-DD" at local midnight. */
function toDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** A day as the summary shows it in English, e.g. "Fri, Nov 14". */
function shortDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(date))
}

/** The month of a day in English, written out ("November") or short ("Nov"). */
function monthOf(date: string, month: 'long' | 'short' = 'long') {
  return new Intl.DateTimeFormat('en-US', { month }).format(toDate(date))
}

/** The reservation card. */
function card(page: Page | Frame) {
  return page.locator('[data-layout-part="booking-card"]')
}

/** Expects the selection pill of a row to lie exactly below `chip`, once its glide is over. */
async function expectPillUnder(page: Page, row: Locator, chip: Locator) {
  await settle(page)
  const pill = (await row.locator('[data-selection-pill]').boundingBox())!
  const box = (await chip.boundingBox())!
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(pill[key] - box[key]), key).toBeLessThan(1.5)
  }
}

/** The number of animations running now, without endless ones (the skeleton's shimmer) and those that follow scrolling. */
function runningAnimations(page: Page | Frame) {
  return page.evaluate(
    "document.getAnimations().filter((animation) => animation.playState === 'running' && animation.timeline === document.timeline && animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.animationName ?? animation.transitionProperty ?? 'animation')",
  )
}

/** Screenshots of the window at 1440 and 390 px, with `target` in view. */
async function shoot(page: Page, name: string, target: Locator) {
  for (const size of sizes) {
    await page.setViewportSize(size)
    await target.scrollIntoViewIfNeeded()
    await settle(page)
    await screenshot(page, 'booking-card-polish', `${name}-${size.width}`, { fullPage: false })
  }
}

test.describe('Booking card polish', () => {
  for (const { slug, look } of restaurants) {
    test(`glides the selection to the chosen party size and day, and sums the choice up (${look})`, async ({ page }) => {
      await page.setViewportSize(sizes[0])
      await page.goto(`/r/${slug}`)
      const party = page.getByRole('group', { name: 'People' })
      const strip = page.getByRole('group', { name: 'Date' })
      const summary = card(page).locator('[data-booking-summary]')
      await expect(page.locator('[data-time-chip]').first()).toBeVisible()
      await expect(card(page).getByRole('heading', { name: 'Reserve a table' })).toBeVisible()
      await expect(summary).toHaveText(/^2 people · \w{3}, \w{3} \d{1,2}$/)
      await expectPillUnder(page, party, party.getByRole('button', { name: '2 people' }))

      const four = party.getByRole('button', { name: '4 people' })
      await four.click()
      await expect(four).toHaveAttribute('aria-pressed', 'true')
      await expect(summary).toHaveText(/^4 people · /)
      await expectPillUnder(page, party, four)

      await expect(card(page).locator('[aria-busy="true"]')).toHaveCount(0)
      const date = (await strip.getByRole('button', { name: /, available$/, pressed: false }).nth(1).getAttribute('data-day'))!
      const day = strip.locator(`[data-day="${date}"]`)
      await day.click()
      await expect(day).toHaveAttribute('aria-pressed', 'true')
      await expect(summary).toHaveText(`4 people · ${shortDate(date)}`)
      await expectPillUnder(page, strip, day)
      // The pill stays below the chosen day when the strip scrolls.
      await strip.locator('[data-day]').first().locator('..').evaluate((scroller) => scroller.scrollBy({ left: 60, behavior: 'instant' }))
      await expectPillUnder(page, strip, day)
      await shoot(page, `selection-${look}`, strip)
      // At 390 px (shoot ends there) too.
      await day.scrollIntoViewIfNeeded()
      await expectPillUnder(page, strip, day)
      await expectPillUnder(page, party, four)
    })
  }

  test('labels the month of the date strip and the next month where the strip reaches it', async ({ page }) => {
    // The device's today three days before the 1st of a month (at least today), so the strip of 14 days reaches the next month.
    const now = new Date()
    let first = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    if (first.getTime() - 3 * 86_400_000 < now.getTime()) {
      first = new Date(now.getFullYear(), now.getMonth() + 2, 1)
    }
    await page.clock.setFixedTime(new Date(first.getFullYear(), first.getMonth(), first.getDate() - 3, 12))
    const firstDay = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`

    await page.setViewportSize(sizes[0])
    await page.goto('/r/zur-linde')
    const strip = page.getByRole('group', { name: 'Date' })
    const scroller = strip.locator('[data-day]').first().locator('..')
    await expect(strip.locator('[data-day]').first()).toBeVisible()
    await scroller.evaluate((element) => element.scrollTo({ left: 0, behavior: 'instant' }))
    const month = strip.locator('[data-strip-month]')
    await expect(month).toHaveText(monthOf(dateFromOffset(firstDay, -3)))
    const divider = strip.locator('[data-month-divider]')
    await expect(divider).toHaveCount(1)
    await expect(divider).toHaveAttribute('data-month-divider', firstDay.slice(0, 7))
    await expect(divider).toHaveText(monthOf(firstDay, 'short'))
    // Right before the 1st of the month.
    const dividerBox = (await divider.boundingBox())!
    const dayBox = (await strip.locator(`[data-day="${firstDay}"]`).boundingBox())!
    expect(dividerBox.x + dividerBox.width).toBeLessThanOrEqual(dayBox.x)
    await settle(page)
    await screenshot(page, 'booking-card-polish', 'month-divider-1440', { fullPage: false })

    // Scrolled on, the strip starts in the next month, and the label says so.
    await scroller.evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }))
    await expect(month).toHaveText(monthOf(firstDay))
    await page.setViewportSize(sizes[1])
    await scroller.scrollIntoViewIfNeeded()
    await scroller.evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }))
    await expect(month).toHaveText(monthOf(firstDay))
    // On a phone with the divider in the middle of the strip.
    await divider.evaluate((element) => element.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }))
    await expect(divider).toBeInViewport()
    await settle(page)
    await screenshot(page, 'booking-card-polish', 'month-divider-390', { fullPage: false })
  })

  test('says "2 tables left" readably, in the accent colour, with a flame', async ({ page }) => {
    const guests = 4
    const date = await openDayFrom(page, 'zur-linde', 54, guests)
    // Books one time until two tables are left; a time that skips over 2 (e.g. through the quota) gives way to the next.
    let scarce: string | null = null
    for (const slot of (await periodsOf(page, 'zur-linde', date, guests)).flat().filter((option) => option.time >= '17:00' && option.available)) {
      let remaining = slot.remaining
      for (let i = 0; i < 30 && remaining > 2; i++) {
        await book(page, 'zur-linde', date, slot.time, guests)
        remaining = (await periodsOf(page, 'zur-linde', date, guests)).flat().find((option) => option.time === slot.time)!.remaining
      }
      if (remaining === 2) {
        scarce = slot.time
        break
      }
    }
    expect(scarce).not.toBeNull()

    await page.goto(`/r/zur-linde?guests=${guests}&date=${date}`)
    const chip = page.locator(`[data-time-chip="${scarce}"]`)
    await expect(chip).toHaveAccessibleName(`${timeOfDay(scarce!)}, 2 tables left`)
    const left = chip.locator('[data-tables-left]')
    await expect(left).toHaveText('2 tables left')
    await expect(left.locator('svg')).toHaveCount(1)
    expect(Number.parseFloat(await left.evaluate((element) => element.ownerDocument.defaultView!.getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12)
    // In the accent colour as text (primary-text), as long as the chip is not chosen.
    const colours = await left.evaluate((element) => {
      const style = (target: typeof element) => element.ownerDocument.defaultView!.getComputedStyle(target)
      const probe = element.ownerDocument.createElement('span')
      probe.style.color = 'var(--primary-text)'
      element.append(probe)
      const expected = style(probe).color
      probe.remove()
      return { actual: style(element).color, expected }
    })
    expect(colours.actual).toBe(colours.expected)
    // The text fits in its chip.
    const textBox = (await left.boundingBox())!
    const chipBox = (await chip.boundingBox())!
    expect(textBox.x).toBeGreaterThanOrEqual(chipBox.x)
    expect(textBox.x + textBox.width).toBeLessThanOrEqual(chipBox.x + chipBox.width)
    await shoot(page, 'tables-left', chip)
  })

  test('folds taken times in a row into one quiet chip', async ({ page }) => {
    // The largest party: few tables seat it, so a few bookings take its times.
    const guests = ((await (await page.request.get('/api/public/restaurants/zur-linde')).json()) as { maxOnlinePartySize: number }).maxOnlinePartySize
    const date = await openDayFrom(page, 'zur-linde', 62, guests, 6)
    // Three free times in a row in the evening are booked until they are taken.
    const evening = (await periodsOf(page, 'zur-linde', date, guests)).at(-1)!
    const start = evening.findIndex((slot, index) => slot.time >= '18:00' && evening.slice(index, index + 3).filter((next) => next.available).length === 3)
    expect(start).toBeGreaterThanOrEqual(0)
    for (const { time } of evening.slice(start, start + 3)) {
      for (let i = 0; i < 20 && (await periodsOf(page, 'zur-linde', date, guests)).flat().find((slot) => slot.time === time)!.available; i++) {
        await book(page, 'zur-linde', date, time, guests)
      }
    }
    // The runs of three or more taken times, window by window, as the card shows them.
    const runs: string[][] = []
    for (const period of await periodsOf(page, 'zur-linde', date, guests)) {
      let run: string[] = []
      for (const slot of [...period, { time: '', available: true, remaining: 0 }]) {
        if (!slot.available) {
          run.push(slot.time)
        } else {
          if (run.length >= 3) runs.push(run)
          run = []
        }
      }
    }
    const run = runs.find((times) => times.includes(evening[start].time))!
    expect(run).toBeDefined()

    await page.goto(`/r/zur-linde?guests=${guests}&date=${date}`)
    const chips = card(page).locator('[data-taken-run]')
    await expect(chips).toHaveCount(runs.length)
    const chip = chips.nth(runs.indexOf(run))
    await expect(chip).toBeDisabled()
    await expect(chip).toHaveText(`${timeOfDay(run[0])}–${timeOfDay(run.at(-1)!)} full`)
    await expect(chip).toHaveAccessibleName(`${run.map(timeOfDay).join(', ')}, fully booked`)
    // None of the folded times has a chip of its own, and the free times stay.
    await expect(card(page).getByRole('button', { name: `${timeOfDay(run[0])}, fully booked`, exact: true })).toHaveCount(0)
    await expect(card(page).locator('[data-time-chip]').first()).toBeVisible()
    await shoot(page, 'taken-run', chip)
  })

  for (const { slug, look } of restaurants) {
    test(`folds the card in the embed while the steps are open, with the frame's height following (${look})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      // A page of the restaurant's website of another origin, as in booking-flow.spec.ts.
      await page.goto('http://localhost:5025/api/health')
      await page.setContent(`
        <iframe src="http://localhost:5173/embed/${slug}" title="Reserve a table" style="width: 100%; height: 600px; border: 0; display: block"></iframe>
        <script>
          window.heights = []
          window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'cbplayground:height') {
              window.heights.push(event.data.height)
              document.querySelector('iframe').style.height = event.data.height + 'px'
            }
          })
        </script>
      `)
      const frame = page.frameLocator('iframe')
      const embed = page.frames().find((candidate) => candidate.url().includes('/embed/'))!
      /** The frame took the last height reported, and that is the height of the embed's content. */
      const expectHeightFollows = async () => {
        await page.waitForFunction("window.heights.length > 0 && document.querySelector('iframe').style.height === window.heights[window.heights.length - 1] + 'px'")
        await settle(page)
        await expect
          .poll(async () => {
            const content = await embed.evaluate(
              "Math.ceil(document.querySelector('[data-layout-part=\"booking-card\"]').closest('.font-sans.gap-2').getBoundingClientRect().height)",
            )
            return content === (await page.evaluate('window.heights[window.heights.length - 1]'))
          })
          .toBe(true)
      }
      await expect(frame.locator('[data-time-chip]').first()).toBeVisible()
      await expectHeightFollows()

      const chip = frame.locator('[data-time-chip]').last()
      const time = (await chip.getAttribute('data-time-chip'))!
      const before = Number(await page.evaluate('window.heights.length'))
      await chip.click()
      await expect(frame.locator('[data-step-heading]')).toBeVisible()
      // Folded: one line with the choice and "Change"; the chips are out of the way.
      const summary = card(embed).locator('[data-booking-summary]')
      await expect(summary).toHaveText(new RegExp(`^2 people · .+ · ${timeOfDay(time)}$`))
      const change = card(embed).getByRole('button', { name: 'Change' })
      await expect(change).toBeVisible()
      await expect(card(embed).getByRole('group', { name: 'People' })).toBeHidden()
      expect((await card(embed).boundingBox())!.height).toBeLessThan(90)
      await expectHeightFollows()
      // The final height at once, not one message per frame.
      expect(Number(await page.evaluate('window.heights.length')) - before).toBeLessThanOrEqual(3)
      for (const size of sizes) {
        await page.setViewportSize(size)
        await expectHeightFollows()
        await screenshot(page, 'booking-card-polish', `embed-folded-${look}-${size.width}`)
      }

      // "Change" unfolds it again, below it the steps stay.
      await page.setViewportSize({ width: 1440, height: 900 })
      await expectHeightFollows()
      const beforeChange = Number(await page.evaluate('window.heights.length'))
      await change.click()
      await expect(card(embed).getByRole('group', { name: 'People' })).toBeVisible()
      await expect(card(embed).getByRole('heading', { name: 'Reserve a table' })).toBeFocused()
      await expect(frame.locator('[data-step-heading]')).toBeVisible()
      await expectHeightFollows()
      expect(Number(await page.evaluate('window.heights.length')) - beforeChange).toBeLessThanOrEqual(3)
      await page.setViewportSize(sizes[1])
      await expectHeightFollows()
      await screenshot(page, 'booking-card-polish', `embed-unfolded-${look}-390`)

      // Another time folds it again.
      await page.setViewportSize({ width: 1440, height: 900 })
      await frame.locator('[data-time-chip]').first().click()
      await expect(change).toBeVisible()
      await expectHeightFollows()
    })
  }

  test.describe('with less motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('moves nothing: the pill jumps, the card folds at once', async ({ page }) => {
      await page.setViewportSize(sizes[0])
      await page.goto('/r/zur-linde')
      const party = page.getByRole('group', { name: 'People' })
      const strip = page.getByRole('group', { name: 'Date' })
      await expect(page.locator('[data-time-chip]').first()).toBeVisible()
      await expect(card(page).locator('[aria-busy="true"]')).toHaveCount(0)

      const four = party.getByRole('button', { name: '4 people' })
      await four.click()
      await expect(four).toHaveAttribute('aria-pressed', 'true')
      expect(await runningAnimations(page)).toEqual([])
      await expectPillUnder(page, party, four)
      await expect(card(page).locator('[aria-busy="true"]')).toHaveCount(0)
      expect(await runningAnimations(page)).toEqual([])

      const date = (await strip.getByRole('button', { name: /, available$/, pressed: false }).nth(1).getAttribute('data-day'))!
      const day = strip.locator(`[data-day="${date}"]`)
      await day.click()
      await expect(day).toHaveAttribute('aria-pressed', 'true')
      expect(await runningAnimations(page)).toEqual([])
      await expectPillUnder(page, strip, day)
      await expect(card(page).locator('[data-time-chip]').first()).toBeVisible()
      expect(await runningAnimations(page)).toEqual([])

      await page.goto('/embed/zur-linde')
      await page.locator('[data-time-chip]').last().click()
      await expect(card(page).getByRole('button', { name: 'Change' })).toBeVisible()
      expect(await runningAnimations(page)).toEqual([])
      await card(page).getByRole('button', { name: 'Change' }).click()
      await expect(card(page).getByRole('group', { name: 'People' })).toBeVisible()
      expect(await runningAnimations(page)).toEqual([])
      await screenshot(page, 'booking-card-polish', 'less-motion-embed-1440')
    })
  })
})

/** The day `days` after a day "YYYY-MM-DD". */
function dateFromOffset(date: string, days: number) {
  const day = toDate(date)
  day.setDate(day.getDate() + days)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}
