import { expect, type Locator, type Page, test } from '@playwright/test'
import { dateFromToday, settle, timeOfDay } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The reservation card of the booking page: party size chips, the date strip, the time chips (kept while new ones load,
// taken times, "2 tables left") and the alternatives of a fully booked day. The tests that need booked times create their
// reservations through the public API on days far ahead, each on a day of its own.

const api = '/api/public/restaurants/zur-linde'

type Slot = { time: string; available: boolean; remaining: number }

/** The times of a day at Gasthaus zur Linde for a party size, all opening windows together. */
async function timesOf(page: Page, date: string, guests: number) {
  const availability = (await (await page.request.get(`${api}/availability?date=${date}&guests=${guests}`)).json()) as {
    periods: { times: Slot[] }[]
  }
  return availability.periods.flatMap((period) => period.times)
}

/** Books a time online, as a guest would. */
async function book(page: Page, date: string, time: string, guests: number) {
  const response = await page.request.post(`${api}/reservations`, {
    data: { date, time, guests, name: 'Card Test', phone: '+49 89 1234567', language: 'en' },
  })
  expect(response.status()).toBe(201)
}

/** The first open day from `days` ahead on which the party finds a free time. */
async function openDayFrom(page: Page, days: number, guests: number) {
  for (let offset = days; offset < days + 14; offset++) {
    const date = dateFromToday(offset)
    if ((await timesOf(page, date, guests)).some((slot) => slot.available)) {
      return date
    }
  }
  throw new Error(`No open day from ${days} days ahead.`)
}

/** The largest party Gasthaus zur Linde takes online: few tables seat it, so a few bookings fill its times. */
async function largestParty(page: Page) {
  return ((await (await page.request.get(api)).json()) as { maxOnlinePartySize: number }).maxOnlinePartySize
}

/** A day "YYYY-MM-DD" written out as the card names it in English, e.g. "Monday, November 9, 2026". */
function longDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(new Date(year, month - 1, day))
}

/** The reservation card. */
function card(page: Page) {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-booking-heading]') })
}

/** Screenshots of a state at 1440 px and at 390 px, each with `target` in view. */
async function shoot(page: Page, name: string, target: Locator) {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await target.scrollIntoViewIfNeeded()
    await settle(page)
    await screenshot(page, 'booking-card', `${name}-${width}`, { fullPage: false })
  }
}

test.describe('Booking card', () => {
  test('changes the times with one tap on a party size', async ({ page }) => {
    await page.goto('/r/zur-linde')
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '2 people' })).toHaveAttribute('aria-pressed', 'true')

    const times = page.waitForResponse((response) => response.url().includes('/availability?') && response.url().includes('guests=4'))
    await page.getByRole('button', { name: '4 people' }).click()
    await times
    await expect(page).toHaveURL(/guests=4/)
    await expect(page.getByRole('button', { name: '4 people' })).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page).locator('[aria-busy="true"]')).toHaveCount(0)
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await shoot(page, 'party-size', page.getByRole('group', { name: 'People' }))
  })

  test('shows the next days as a strip with closed days disabled', async ({ page }) => {
    // The first closed day of the strip (Gasthaus zur Linde rests on one day of the week).
    const months = [...new Set([dateFromToday(0).slice(0, 7), dateFromToday(13).slice(0, 7)])]
    const days = (
      await Promise.all(months.map(async (month) => (await (await page.request.get(`${api}/calendar?month=${month}&guests=2`)).json()) as { date: string; status: string }[]))
    ).flat()
    const closed = days.find((day) => day.status === 'closed' && day.date > dateFromToday(0) && day.date <= dateFromToday(13))
    expect(closed).toBeDefined()

    await page.goto('/r/zur-linde')
    const strip = page.getByRole('group', { name: 'Date' })
    await expect(strip.getByRole('button', { name: `${longDate(closed!.date)}, closed` })).toBeDisabled()
    await expect(strip.getByRole('button', { name: /, available$/ }).first()).toBeEnabled()
    await expect(strip.getByRole('button', { name: 'More dates' })).toBeVisible()

    // The arrow keys move between the days.
    const chosen = strip.locator('[aria-pressed="true"]')
    await chosen.focus()
    await page.keyboard.press('ArrowRight')
    await expect(chosen).not.toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(chosen).toBeFocused()
    // On a desktop the strip has the card's full width: at least 8 of the 14 days are in view.
    await page.setViewportSize({ width: 1440, height: 1000 })
    const stripDays = strip.locator('[data-day]')
    const scroller = (await stripDays.first().locator('..').boundingBox())!
    let inView = 0
    for (const box of await Promise.all((await stripDays.all()).map((day) => day.boundingBox()))) {
      if (box !== null && box.x >= scroller.x - 1 && box.x + box.width <= scroller.x + scroller.width + 1) inView++
    }
    expect(inView).toBeGreaterThanOrEqual(8)
    await shoot(page, 'date-strip', strip)

    // On a phone (shoot ends at 390 px) the focused and the chosen day come fully into view.
    const isInside = async (day: Locator) => {
      const frame = (await stripDays.first().locator('..').boundingBox())!
      const box = (await day.boundingBox())!
      return box.x >= frame.x - 1 && box.x + box.width <= frame.x + frame.width + 1
    }
    await chosen.focus()
    await page.keyboard.press('End')
    await expect(stripDays.last()).toBeFocused()
    await expect.poll(() => isInside(stripDays.last())).toBe(true)

    // A free day that sticks out 10 px on the right, tapped where it shows (without Playwright scrolling it into view).
    // Snapping is turned off for this, or the strip would snap away from that position.
    // From the 8th day on (beyond the first screen of the strip), not the last ones, so it can stick out at the edge.
    let index = 7
    while ((await stripDays.nth(index).getAttribute('aria-disabled')) !== 'false' || (await stripDays.nth(index).getAttribute('aria-pressed')) === 'true') {
      index++
    }
    expect(index).toBeLessThan(12)
    const target = stripDays.nth(index)
    const day = (await target.getAttribute('data-day'))!
    await page.evaluate(`(() => {
      const button = document.querySelector('[data-day="${day}"]')
      const scroller = button.parentElement
      scroller.style.scrollSnapType = 'none'
      scroller.scrollTo({ left: 0, behavior: 'instant' })
      const offset = button.getBoundingClientRect().right - scroller.getBoundingClientRect().right
      scroller.scrollTo({ left: offset - 10, behavior: 'instant' })
    })()`)
    expect(await isInside(target)).toBe(false)
    const box = (await target.boundingBox())!
    await page.mouse.click(box.x + 8, box.y + box.height / 2)
    await expect(page).toHaveURL(new RegExp(`date=${day}`))
    await expect.poll(() => isInside(target)).toBe(true)
  })

  test('keeps the previous times in place while the new ones load', async ({ page }) => {
    await page.goto('/r/zur-linde')
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await settle(page)
    const before = (await card(page).boundingBox())!.height

    // The answers wait until both screenshots are taken, so the moment between the tap and the new times stays.
    let release = () => {}
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/availability?*', async (route) => {
      await released
      await route.continue()
    })
    const strip = page.getByRole('group', { name: 'Date' })
    await strip.getByRole('button', { name: /, available$/, pressed: false }).first().click()
    const waiting = card(page).locator('[aria-busy="true"][inert]')
    await expect(waiting).toBeVisible()
    await expect(waiting.locator('[data-time-chip]').first()).toBeVisible()
    // The old chips hold the card's height: it does not drop to the skeleton.
    expect((await card(page).boundingBox())!.height).toBeCloseTo(before, 0)
    await shoot(page, 'loading', waiting)
    // Both screenshots (1440 and 390 px) show the old times, still dimmed.
    await expect(waiting).toBeVisible()

    release()
    // Lets the held answers go on before the route is removed.
    await page.unrouteAll({ behavior: 'wait' })
    await expect(waiting).toHaveCount(0)
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
  })

  test('shows a taken time disabled', async ({ page }) => {
    const guests = await largestParty(page)
    const date = await openDayFrom(page, 30, guests)
    // 19:00 or, without it, the last free time is booked until it is gone; earlier times of the day stay free.
    const free = (await timesOf(page, date, guests)).filter((slot) => slot.available)
    const time = free.find((slot) => slot.time === '19:00')?.time ?? free[free.length - 1].time
    for (let i = 0; i < 20 && (await timesOf(page, date, guests)).find((slot) => slot.time === time)!.available; i++) {
      await book(page, date, time, guests)
    }
    expect((await timesOf(page, date, guests)).some((slot) => slot.available)).toBe(true)

    await page.goto(`/r/zur-linde?guests=${guests}&date=${date}`)
    const taken = page.getByRole('button', { name: `${timeOfDay(time)}, fully booked`, exact: true })
    await expect(taken).toBeDisabled()
    await expect(page.locator(`[data-time-chip="${time}"]`)).toHaveCount(0)
    await shoot(page, 'taken-time', taken)
  })

  test('says "2 tables left" on a time with two tables left', async ({ page }) => {
    const guests = 4
    const date = await openDayFrom(page, 38, guests)
    // Books one time until two tables are left; a time that skips over 2 (e.g. through the quota) gives way to the next.
    let scarce: string | null = null
    for (const slot of (await timesOf(page, date, guests)).filter((option) => option.time >= '17:00' && option.available)) {
      let remaining = slot.remaining
      for (let i = 0; i < 30 && remaining > 2; i++) {
        await book(page, date, slot.time, guests)
        remaining = (await timesOf(page, date, guests)).find((option) => option.time === slot.time)!.remaining
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
    await expect(chip).toContainText('2 tables left')
    await shoot(page, 'scarce-time', chip)
  })

  test('offers the next free days on a fully booked day and books one with a tap', async ({ page }) => {
    const guests = await largestParty(page)
    const date = await openDayFrom(page, 46, guests)
    // Books the first free time again and again until the day has none.
    for (let i = 0; i < 60; i++) {
      const free = (await timesOf(page, date, guests)).find((slot) => slot.available)
      if (free === undefined) break
      await book(page, date, free.time, guests)
    }
    expect((await timesOf(page, date, guests)).some((slot) => slot.available)).toBe(false)

    await page.goto(`/r/zur-linde?guests=${guests}&date=${date}`)
    await expect(page.getByText('No free tables on this day.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Next free days' })).toBeVisible()
    const alternative = card(page).locator('section[aria-labelledby^="alternative-"]').getByRole('button').first()
    await expect(alternative).toBeVisible()
    await shoot(page, 'full-day', page.getByRole('heading', { name: 'Next free days' }))

    const name = (await alternative.getAttribute('aria-label'))!
    await page.setViewportSize({ width: 1440, height: 1000 })
    await alternative.click()
    await expect(page.getByRole('dialog', { name: 'Your contact details' })).toBeVisible()
    const params = new URL(page.url()).searchParams
    expect(params.get('date')).not.toBe(date)
    expect(name).toContain(longDate(params.get('date')!))
    expect(name).toContain(timeOfDay(params.get('time')!))
  })

  test('works in the embed and reports a steady height', async ({ page }) => {
    await page.goto('/embed/zur-linde')
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await expect(page.getByRole('group', { name: 'Date' })).toBeVisible()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await settle(page)
      await screenshot(page, 'booking-card', `embed-${width}`)
    }

    // Framed by a page of another origin (as in booking-flow.spec.ts): after a change of the party size the frame follows
    // to the card's end height, and then no more messages come while nothing changes.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('http://localhost:5025/api/health')
    await page.setContent(`
      <iframe src="http://localhost:5173/embed/zur-linde" title="Reserve a table" style="width: 100%; height: 600px; border: 0"></iframe>
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
    await expect(frame.locator('[data-time-chip]').first()).toBeVisible()
    await page.waitForTimeout(1000)
    const before = Number(await page.evaluate('window.heights.length'))
    await frame.getByRole('button', { name: '6 people' }).click()
    await expect(frame.getByRole('button', { name: '6 people' })).toHaveAttribute('aria-pressed', 'true')
    await expect(frame.locator('[aria-busy="true"]')).toHaveCount(0)
    await page.waitForTimeout(1000)
    const count = Number(await page.evaluate('window.heights.length'))
    // The new times take their place in one step (a view transition moves only snapshots): no message per frame.
    expect(count - before).toBeLessThanOrEqual(3)
    await page.waitForTimeout(1500)
    expect(Number(await page.evaluate('window.heights.length'))).toBe(count)
    await page.waitForFunction("document.querySelector('iframe').style.height === window.heights[window.heights.length - 1] + 'px'")
  })
})
