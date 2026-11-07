import { expect, type Page } from '@playwright/test'

/** Signs in with a demo user of the development seed (appsettings.Development.json). */
export async function signIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Demo1234!')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/**
 * Scrolls through the page and back to the top, so the parts that rise in when they are scrolled into view (Reveal, Stagger)
 * are shown in a full-page screenshot.
 */
export async function revealAll(page: Page) {
  // Expressions in the page as text: the tests are typed without the DOM (tsconfig.node.json).
  const height = Number(await page.evaluate('document.body.scrollHeight'))
  for (let y = 0; y < height; y += 400) {
    await page.evaluate(`window.scrollTo(0, ${y})`)
    await page.waitForTimeout(100)
  }
  await page.evaluate('window.scrollTo(0, 0)')
  // The rise-in takes 600 ms.
  await page.waitForTimeout(800)
}

/**
 * Waits until the dialog's entrance and every other finite animation in time are over, so a screenshot shows the dialog as
 * it stays. Endless ones (the light of the table style Glow breathes on) and the cover image's parallax, which follows the
 * scrolling instead of the time, are left out.
 */
export async function settle(page: Page) {
  await page.waitForFunction(
    "document.getAnimations().every((animation) => animation.playState !== 'running' || animation.timeline !== document.timeline || animation.effect?.getComputedTiming().iterations === Infinity)",
  )
}

/** The date `days` from today, "YYYY-MM-DD" (the device's today; the restaurants are in its time zone or close to it). */
export function dateFromToday(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Books an online request at Kafana Dunav (request mode, the guest chooses the table) on the first day from ten days ahead
 * with a free time and table, after the demo reservations, so the test does not depend on them.
 */
export async function bookRequest(page: Page, name: string) {
  const restaurant = '/api/public/restaurants/kafana-dunav'
  for (let days = 10; days < 40; days++) {
    const date = dateFromToday(days)
    const availability = (await (await page.request.get(`${restaurant}/availability?date=${date}&guests=2`)).json()) as {
      periods: { times: { time: string; available: boolean }[] }[]
    }
    const time = availability.periods.flatMap((period) => period.times).find((slot) => slot.available)?.time
    if (time === undefined) continue
    const areas = (await (await page.request.get(`${restaurant}/tables?date=${date}&time=${time}&guests=2`)).json()) as {
      tables: { id: string; available: boolean }[]
    }[]
    const table = areas.flatMap((area) => area.tables).find((candidate) => candidate.available)
    if (table === undefined) continue
    const booking = await page.request.post(`${restaurant}/reservations`, {
      data: { date, time, guests: 2, tableId: table.id, name, phone: '+381 64 1234567', language: 'en' },
    })
    expect(booking.status()).toBe(201)
    expect(await booking.json()).toMatchObject({ status: 'Requested' })
    return { date, time }
  }
  throw new Error('No free time at Kafana Dunav in the next 40 days.')
}
