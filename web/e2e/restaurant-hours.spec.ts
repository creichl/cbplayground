import { expect, type Page, test } from '@playwright/test'
import { dateFromToday, menuSection } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The card "Hours & location" at the top of the restaurant page (live status, today's hours, the week, "Coming up", address
// and phone), the live status on the cover image, and "Good to know" at the end of the page.

const card = (page: Page) => page.locator('section#opening-hours')
const status = (page: Page) => page.getByTestId('opening-status')
const chip = (page: Page) => page.getByTestId('opening-chip')

/** The top and bottom of an element in the window, in pixels (the tests are typed without the DOM). */
async function box(page: Page, selector: string) {
  return (await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })()`)) as {
    top: number
    bottom: number
  }
}

/** A date "YYYY-MM-DD" as the guest page shows it in English, e.g. "Sat, Nov 14". */
function shortDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day))
}

const restaurants = [
  { slug: 'zur-linde', name: 'Gasthaus zur Linde', look: 'light' },
  { slug: 'rooftop-belvedere', name: 'Rooftop Belvedere', look: 'dark' },
] as const

// One page per restaurant, first at 1440 px, then at 390 px (resized, not loaded again, to keep the run short).
for (const { slug, name, look } of restaurants) {
  test(`shows the card Hours & location of ${name} (${look}) at 1440 and 390 px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/r/${slug}`)
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await expect(card(page).getByRole('heading', { name: 'Hours & location', level: 2 })).toBeVisible()
    await expect(status(page)).toHaveText(/^(Open now · until|Closes soon · |Opens again at|Opens today at|Closed · opens|Closed today)/)
    const today = card(page).getByText('Today', { exact: true }).first()
    await expect(today).toBeVisible()
    await expect(card(page).getByRole('link', { name: /^Directions to / })).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\//)
    await expect(card(page).getByRole('link', { name: /^Call / })).toHaveAttribute('href', /^tel:\+/)

    // Desktop: in the first screen, above the photos: the status and today's hours, and, unless a closing day or special
    // hours of the next 7 days add rows below them, the whole card with address and phone.
    await expect(status(page)).toBeInViewport({ ratio: 1 })
    await expect(today).toBeInViewport({ ratio: 1 })
    if (!(await card(page).getByRole('heading', { name: 'Coming up' }).isVisible())) {
      expect((await box(page, '#opening-hours')).bottom).toBeLessThanOrEqual(900)
    }
    expect((await box(page, '#opening-hours')).top).toBeLessThan((await box(page, '#photos')).top)
    await screenshot(page, 'restaurant-hours', `${slug}-1440`, { fullPage: false })

    // "All opening hours" unfolds the week in place, Monday first, today marked.
    const toggle = card(page).getByRole('button', { name: 'All opening hours' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const week = card(page).locator(`[id="${await toggle.getAttribute('aria-controls')}"]`)
    await expect(week.getByRole('listitem').first()).toBeHidden()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(week.getByRole('listitem')).toHaveCount(7)
    await expect(week.getByRole('listitem').first()).toContainText('Monday')
    await expect(week.getByRole('listitem').last()).toContainText('Sunday')
    await expect(week.locator('[aria-current="date"]')).toHaveCount(1)
    await expect(week.getByRole('listitem').last()).toBeVisible()
    await page.waitForTimeout(400)
    await screenshot(page, 'restaurant-hours', `${slug}-1440-week`, { fullPage: false })

    // Phone: right after the reservation card, before the photos.
    await toggle.click()
    await expect(week.getByRole('listitem').first()).toBeHidden()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(async () => (await box(page, '#opening-hours')).top).toBeGreaterThanOrEqual((await box(page, '#booking')).bottom)
    const booking = await box(page, '#booking')
    const hours = await box(page, '#opening-hours')
    expect(hours.top - booking.bottom).toBeLessThanOrEqual(64)
    expect(hours.top).toBeLessThan((await box(page, '#photos')).top)
    await card(page).scrollIntoViewIfNeeded()
    // Past the cover image: the header and the section navigation have faded in.
    await expect(page.getByRole('navigation', { name: 'On this page' })).toHaveCSS('opacity', '1')
    await screenshot(page, 'restaurant-hours', `${slug}-390`, { fullPage: false })
    await toggle.click()
    await expect(week.getByRole('listitem').last()).toBeVisible()
    await page.waitForTimeout(400)
    await card(page).scrollIntoViewIfNeeded()
    await screenshot(page, 'restaurant-hours', `${slug}-390-week`, { fullPage: false })
  })
}

test('shows a closing day created by the admin under Coming up', async ({ page }) => {
  // A day in the next week on which Gasthaus zur Linde is regularly open (closed on Mondays), removed again at the end.
  const date = [2, 3, 4, 5].map(dateFromToday).find((day) => new Date(`${day}T12:00:00Z`).getUTCDay() !== 1)!
  expect((await page.request.post('/api/auth/login', { data: { email: 'admin@zur-linde.local', password: 'Demo1234!' } })).status()).toBe(200)
  const created = await page.request.post('/api/admin/special-days', { data: { from: date, to: date, kind: 'Closed', note: 'Betriebsausflug', periods: [] } })
  expect(created.status()).toBe(201)
  const { specialDay } = (await created.json()) as { specialDay: { id: string } }
  try {
    await page.request.post('/api/auth/logout')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/r/zur-linde')
    // Within the next 7 days, so shown while the week is folded.
    const comingUp = card(page).locator('div').filter({ has: page.getByRole('heading', { name: 'Coming up', level: 3 }) }).last()
    await expect(comingUp).toBeVisible()
    const row = comingUp.getByRole('listitem').filter({ hasText: shortDate(date) })
    await expect(row).toContainText(shortDate(date))
    await expect(row).toContainText('Closed')
    // The internal note is not shown to guests.
    await expect(page.getByText('Betriebsausflug')).toHaveCount(0)
    await card(page).scrollIntoViewIfNeeded()
    await screenshot(page, 'restaurant-hours', 'coming-up-1440', { fullPage: false })
  } finally {
    await page.request.post('/api/auth/login', { data: { email: 'admin@zur-linde.local', password: 'Demo1234!' } })
    expect((await page.request.delete(`/api/admin/special-days/${specialDay.id}`)).ok()).toBe(true)
  }
})

test('puts Good to know last before Contact with 3 questions and Show all', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/r/zur-linde')
  await expect(page.getByRole('heading', { name: 'Gasthaus zur Linde', level: 1 })).toBeVisible()
  // The menu loads once it comes near the view.
  await menuSection(page)
  // The sections of the information in page order.
  await expect
    .poll(() => page.evaluate(`[...document.querySelectorAll('section[aria-labelledby]')].map((section) => section.id).filter((id) => id !== '')`))
    .toEqual(['opening-hours', 'photos', 'about', 'menu', 'areas', 'good-to-know', 'directions'])
  await expect(page.locator('#directions').getByRole('heading', { name: 'Contact', level: 2 })).toBeAttached()
  // Contact without the address, which is in the card at the top.
  await expect(page.locator('#directions address')).toHaveCount(0)
  await expect(page.locator('#directions').getByRole('link', { name: '+49 89 2345678' })).toBeAttached()

  const goodToKnow = page.locator('#good-to-know')
  await goodToKnow.scrollIntoViewIfNeeded()
  await expect(goodToKnow.getByRole('heading', { name: 'Good to know', level: 2 })).toBeVisible()
  // One house rule per line.
  await expect(goodToKnow.getByRole('list').first().getByRole('listitem')).toHaveCount(3)
  const questions = goodToKnow.locator('summary')
  await expect(questions.filter({ visible: true })).toHaveCount(3)
  const showAll = goodToKnow.getByRole('button', { name: 'Show all 5 questions' })
  await expect(showAll).toHaveAttribute('aria-expanded', 'false')
  await page.waitForTimeout(700)
  await screenshot(page, 'restaurant-hours', 'good-to-know-1440', { fullPage: false })
  await showAll.click()
  await expect(goodToKnow.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
  await expect(questions.filter({ visible: true })).toHaveCount(5)
  await goodToKnow.getByText('Wo kann ich parken?').click()
  await expect(goodToKnow.getByText(/12 kostenlose Parkplätze/)).toBeVisible()
  await page.waitForTimeout(400)
  await screenshot(page, 'restaurant-hours', 'good-to-know-all-1440', { fullPage: false })
})

test('opens at the card with #opening-hours in the address', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/r/zur-linde#opening-hours')
  await expect(card(page).getByRole('heading', { name: 'Hours & location', level: 2 })).toBeInViewport()
  // Below the header and the section navigation (120 px), as the navigation brings a section into view.
  await expect.poll(async () => (await box(page, '#opening-hours')).top).toBeGreaterThanOrEqual(120)
  await expect.poll(async () => (await box(page, '#opening-hours')).top).toBeLessThan(160)
  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Opening hours' })).toHaveAttribute('aria-current', 'location')
  await page.waitForTimeout(700)
  await screenshot(page, 'restaurant-hours', 'hash-opening-hours-390', { fullPage: false })
})

/** A moment of the restaurant's time zone (Munich and Vienna, both UTC+1 in November) and the status it shows. */
type Moment = { what: string; at: string; long: string; short: string }

/**
 * The live status at fixed moments (page.clock), in the card (long) and on the cover image (short). The moments are in the
 * past, so no closing day or holiday of the coming days (upcomingChanges) falls on them: the regular week decides. One page
 * per restaurant: the clock is set a minute before each moment and runs that minute, so the status follows it as it does
 * every minute while the page is open.
 */
const moments: Record<'zur-linde' | 'rooftop-belvedere', Moment[]> = {
  // Tuesday to Sunday 11:30–14:30 and 17:30–22:00, closed on Mondays. No two moments in a row show the same text, so each
  // step shows that the status followed the clock.
  'zur-linde': [
    { what: 'open', at: '2025-11-18T12:00:00+01:00', long: 'Open now · until 2:30 PM', short: 'Open now · until 2:30 PM' },
    { what: 'closed today (Monday)', at: '2025-11-17T10:00:00+01:00', long: 'Closed · opens tomorrow at 11:30 AM', short: 'Closed today' },
    { what: 'between two windows', at: '2025-11-18T15:00:00+01:00', long: 'Opens again at 5:30 PM', short: 'Opens at 5:30 PM' },
    { what: 'before opening', at: '2025-11-18T09:00:00+01:00', long: 'Opens today at 11:30 AM', short: 'Opens at 11:30 AM' },
    { what: 'after closing', at: '2025-11-18T23:00:00+01:00', long: 'Closed · opens tomorrow at 11:30 AM', short: 'Closed today' },
    { what: 'after closing before a closed day', at: '2025-11-23T22:30:00+01:00', long: 'Closed · opens Tuesday at 11:30 AM', short: 'Closed today' },
    { what: 'a minute before closing soon', at: '2025-11-18T21:29:30+01:00', long: 'Open now · until 10:00 PM', short: 'Open now · until 10:00 PM' },
    { what: 'closing soon', at: '2025-11-18T21:45:00+01:00', long: 'Closes soon · 10:00 PM', short: 'Closes soon · 10:00 PM' },
  ],
  // Wednesday to Sunday 17:00–24:00.
  'rooftop-belvedere': [
    { what: 'closed today until Wednesday', at: '2025-11-17T12:00:00+01:00', long: 'Closed · opens Wednesday at 5:00 PM', short: 'Closed today' },
    { what: 'open until midnight', at: '2025-11-19T20:00:00+01:00', long: 'Open now · until midnight', short: 'Open now · until midnight' },
  ],
}

for (const [slug, list] of Object.entries(moments)) {
  test(`live status at ${slug}: ${list.map((moment) => moment.what).join(', ')}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.clock.install({ time: new Date(list[0].at) })
    await page.goto(`/r/${slug}`)
    for (const moment of list) {
      await page.clock.setSystemTime(new Date(new Date(moment.at).getTime() - 61_000))
      await page.clock.fastForward('01:01')
      await expect(status(page), moment.what).toHaveText(moment.long)
      await expect(chip(page), moment.what).toHaveText(moment.short)
    }
    if (slug === 'zur-linde') {
      // 21:45 at Gasthaus zur Linde: open until 22:00, so the chip says "Closes soon", in the warning colour.
      await screenshot(page, 'restaurant-hours', 'closes-soon-1440', { fullPage: false })
    }
  })
}
