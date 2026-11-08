import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { dateFromToday, settle, timeOfDay } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// After booking: the guest changes the time on "Your reservation", finds the booking again on the restaurant's page (remembered
// in the browser), adds it to a calendar and shares it. Gasthaus zur Linde confirms at once and assigns the tables itself.

const restaurant = '/api/public/restaurants/zur-linde'

/** A day "YYYY-MM-DD" written out as the pages show it in English, e.g. "Friday, November 6, 2026". */
function longDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(new Date(year, month - 1, day))
}

/** A local date and time of a time zone (plus some minutes) as a UTC time in the calendars' form, e.g. "20261114T180000Z". */
function utcStamp(date: string, time: string, timeZone: string, plusMinutes = 0) {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hours, minutes)
  // The zone's offset at an instant, e.g. "GMT+01:00" in milliseconds.
  const offset = (instant: number) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(instant))
      .find((part) => part.type === 'timeZoneName')!.value
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
    return match === null ? 0 : (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000
  }
  const instant = wall - offset(wall - offset(wall)) + plusMinutes * 60_000
  return new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Books Gasthaus zur Linde through the API on the first day from five days ahead with a free time; returns the guest's link. */
async function bookByApi(page: Page, name: string) {
  for (let days = 5; days < 40; days++) {
    const date = dateFromToday(days)
    const availability = (await (await page.request.get(`${restaurant}/availability?date=${date}&guests=2`)).json()) as {
      durationMinutes: number
      periods: { times: { time: string; available: boolean }[] }[]
    }
    const time = availability.periods.flatMap((period) => period.times).find((slot) => slot.available)?.time
    if (time === undefined) continue
    const booking = await page.request.post(`${restaurant}/reservations`, {
      data: { date, time, guests: 2, name, email: 'guest@example.com', language: 'en' },
    })
    expect(booking.status()).toBe(201)
    const { referenceCode, manageToken } = (await booking.json()) as { referenceCode: string; manageToken: string }
    return { date, time, durationMinutes: availability.durationMinutes, path: `/r/zur-linde/reservation/${referenceCode}?t=${encodeURIComponent(manageToken)}` }
  }
  throw new Error('No free time at Gasthaus zur Linde in the next 40 days.')
}

for (const [width, height] of [
  [1440, 1000],
  [390, 844],
]) {
  test.describe(`After booking at ${width} px`, () => {
    test.use({ viewport: { width, height } })

    test('books, finds the booking on the restaurant page, opens it and changes the time', async ({ page }) => {
      // Book the first free time through the card.
      await page.goto('/r/zur-linde')
      await page.locator('[data-time-chip]').first().click()
      const details = page.getByRole('dialog', { name: 'Your contact details' })
      await expect(details).toBeVisible()
      const params = new URL(page.url()).searchParams
      const date = params.get('date')!
      const time = params.get('time')!
      await details.getByLabel('Name').fill('Clara Change')
      await details.getByLabel('Email').fill('clara.change@example.com')
      await details.getByRole('button', { name: 'Book now' }).click()

      // The confirmation has the calendar and share menus and a clear "Done", which closes it.
      const confirmation = page.getByRole('dialog', { name: 'Your table is reserved' })
      await expect(confirmation).toBeVisible()
      await expect(confirmation.getByRole('button', { name: 'Add to calendar' })).toBeVisible()
      await expect(confirmation.getByRole('button', { name: 'Share' })).toBeVisible()
      await settle(page)
      await screenshot(page, 'guest-change', `confirmation-${width}`, { fullPage: false })
      await confirmation.getByRole('button', { name: 'Done' }).click()
      await expect(confirmation).toBeHidden()

      // Above the card the calm notice of the remembered booking.
      const notice = page.getByRole('note', { name: 'Your reservation' })
      await expect(notice).toContainText(`at ${timeOfDay(time)} for 2`)
      await notice.scrollIntoViewIfNeeded()
      await settle(page)
      await screenshot(page, 'guest-change', `notice-${width}`, { fullPage: false })
      await notice.getByRole('link', { name: 'View' }).click()

      // The guest's page of the reservation.
      await expect(page.getByRole('heading', { name: 'Reservation confirmed', level: 1 })).toBeVisible()
      await expect(page.getByText(longDate(date))).toBeVisible()

      // Change: the free times without the reservation itself; its own time is free in them.
      await page.getByRole('button', { name: 'Change reservation' }).click()
      const panel = width >= 768 ? page.getByRole('region', { name: 'Change reservation' }) : page.getByRole('dialog', { name: 'Change reservation' })
      await expect(panel).toBeVisible()
      await expect(panel.locator(`[data-time-chip="${time}"]`)).toBeVisible()
      const other = panel.locator(`[data-time-chip]:not([data-time-chip="${time}"])`).first()
      const newTime = (await other.getAttribute('data-time-chip'))!
      await other.click()
      const confirm = panel.getByRole('button', { name: 'Change', exact: true })
      await expect(confirm).toBeVisible()
      await expect(panel).toContainText(`${timeOfDay(time)} · 2 people`)
      await expect(panel).toContainText(`${timeOfDay(newTime)} · 2 people`)
      await confirm.scrollIntoViewIfNeeded()
      await settle(page)
      await screenshot(page, 'guest-change', `change-summary-${width}`, { fullPage: false })

      await confirm.click()
      const heading = page.getByRole('heading', { name: 'Your reservation has been changed', level: 1 })
      await expect(heading).toBeVisible()
      await expect(heading).toBeFocused()
      await expect(panel).toBeHidden()
      await expect(page.getByText(new RegExp(`^${timeOfDay(newTime)}–`))).toBeVisible()
      await settle(page)
      await screenshot(page, 'guest-change', `changed-${width}`)

      // The restaurant page's notice follows the change.
      await page.goto('/r/zur-linde')
      await expect(page.getByRole('note', { name: 'Your reservation' })).toContainText(`at ${timeOfDay(newTime)} for 2`)
    })
  })
}

test.describe('Calendar and share', () => {
  test('the calendar menu offers Google with the right UTC times, Outlook.com and the file', async ({ page }) => {
    const booking = await bookByApi(page, 'Carl Calendar')
    const { timeZoneId } = (await (await page.request.get(restaurant)).json()) as { timeZoneId: string }
    await page.goto(booking.path)
    await page.getByRole('button', { name: 'Add to calendar' }).click()

    const menu = page.getByRole('menu')
    const google = new URL((await menu.getByRole('menuitem', { name: 'Google Calendar' }).getAttribute('href'))!)
    expect(google.origin).toBe('https://calendar.google.com')
    expect(google.searchParams.get('dates')).toBe(
      `${utcStamp(booking.date, booking.time, timeZoneId)}/${utcStamp(booking.date, booking.time, timeZoneId, booking.durationMinutes)}`,
    )
    expect(google.searchParams.get('text')).toBe('Table reservation – Gasthaus zur Linde')
    expect(google.searchParams.get('details')).toContain(booking.path.split('?')[0])
    const outlook = new URL((await menu.getByRole('menuitem', { name: 'Outlook.com' }).getAttribute('href'))!)
    expect(outlook.searchParams.get('startdt')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/)
    await expect(menu.getByRole('menuitem', { name: /Apple Calendar or other/ })).toBeVisible()
    await settle(page)
    await screenshot(page, 'guest-change', 'calendar-menu', { fullPage: false })

    // The file has the reminder 2 hours before.
    const download = page.waitForEvent('download')
    await menu.getByRole('menuitem', { name: /Apple Calendar or other/ }).click()
    const file = await (await download).path()
    const content = await readFile(file, 'utf8')
    expect(content).toContain(`DTSTART:${utcStamp(booking.date, booking.time, timeZoneId)}`)
    expect(content).toContain('BEGIN:VALARM\r\nACTION:DISPLAY')
    expect(content).toContain('TRIGGER:-PT2H')
  })

  test('share falls back to copying the text in headless Chromium, with the link only on request', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const booking = await bookByApi(page, 'Sven Share')
    await page.goto(booking.path)
    expect(await page.evaluate('typeof navigator.share')).toBe('undefined')

    await page.getByRole('button', { name: 'Share' }).click()
    await page.getByRole('menuitem', { name: /Share the details/ }).click()
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
    const text = String(await page.evaluate('navigator.clipboard.readText()'))
    expect(text).toBe(`Table at Gasthaus zur Linde on ${longDate(booking.date)} at ${timeOfDay(booking.time)} for 2 people`)

    await page.getByRole('button', { name: 'Copied' }).click()
    await expect(page.getByRole('menuitem', { name: /Share with link/ })).toBeVisible()
    await settle(page)
    await screenshot(page, 'guest-change', 'share-menu', { fullPage: false })
    await page.getByRole('menuitem', { name: /Share with link/ }).click()
    const withLink = String(await page.evaluate('navigator.clipboard.readText()'))
    expect(withLink).toBe(`${text}\nhttp://localhost:5173${booking.path}`)
  })

  test('the restaurant page forgets a booking on "×" and after it was cancelled', async ({ page }) => {
    const booking = await bookByApi(page, 'Fiona Forget')
    const [code, token] = [booking.path.split('/reservation/')[1].split('?')[0], new URL(booking.path, 'http://x').searchParams.get('t')!]
    const remember = (entries: object[]) =>
      page.evaluate(`localStorage.setItem('cbplayground.bookings', ${JSON.stringify(JSON.stringify(entries))})`)
    const entry = { slug: 'zur-linde', code, token, date: booking.date, time: booking.time, guests: 2, restaurantName: 'Gasthaus zur Linde' }

    // An entry whose day has passed is left out.
    await page.goto('/r/zur-linde')
    await remember([{ ...entry, code: 'PASSED', date: dateFromToday(-1) }, entry])
    await page.reload()
    const notice = page.getByRole('note', { name: 'Your reservation' })
    await expect(notice).toContainText(`at ${timeOfDay(booking.time)} for 2`)
    await notice.getByRole('button', { name: 'Forget this reservation on this device' }).click()
    await expect(notice).toBeHidden()

    // Seen cancelled on the guest's page, it is forgotten too.
    await remember([entry])
    await page.goto(booking.path)
    await page.getByRole('button', { name: 'Cancel reservation' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel reservation' }).click()
    await expect(page.getByRole('heading', { name: 'Your reservation has been cancelled' })).toBeVisible()
    await page.goto('/r/zur-linde')
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await expect(notice).toBeHidden()
  })
})
