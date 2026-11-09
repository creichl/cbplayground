import { expect, type Locator, type Page, test } from '@playwright/test'
import { bookRequest, dateFromToday, revealAll, settle, timeOfDay } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The moment after booking: the confirmation's one primary action, a request's timeline, the success moment in sequence
// (the reference code typed in, read out whole), and "Your reservation", which leads with when and notices by itself when the
// restaurant confirms a request. Gasthaus zur Linde confirms at once; Trattoria Il Faro and Kafana Dunav take requests.

const feature = 'confirmation-polish'

/** Sets the window's size and waits until what changed with it has settled. */
async function resize(page: Page, width: number) {
  await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 })
  await settle(page)
}

/**
 * Opens the booking of a restaurant at the latest time its card offers (the earliest can fall within the lead time while the
 * test runs) and waits for the first step of the dialog.
 */
async function openBooking(page: Page, slug: string) {
  await page.goto(`/r/${slug}`)
  await page.locator('[data-time-chip]').last().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

/** Sends a request to Trattoria Il Faro through its dialog, at the first free table of the list; returns the confirmation. */
async function requestIlFaro(page: Page, name: string) {
  const dialog = await openBooking(page, 'il-faro')
  await expect(dialog.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
  await dialog.getByText('Show tables as a list').click()
  await dialog.getByRole('radio').first().click()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Phone').fill('0151 2345678')
  await dialog.getByRole('button', { name: 'Send request' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Request sent' })
  await expect(confirmation).toBeVisible()
  return confirmation
}

/** Scrolls the confirmation's actions into view and waits until everything has settled, the reference code complete on screen. */
async function showActions(page: Page, confirmation: Locator) {
  await confirmation.getByRole('button', { name: 'Done' }).scrollIntoViewIfNeeded()
  await expect(confirmation.locator('[data-code-character]').last()).toHaveCSS('opacity', '1')
  await settle(page)
}

test('confirmed: one primary "Add to calendar", "Copy link" in "Share", and the code typed in but read out whole', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const dialog = await openBooking(page, 'zur-linde')
  // Holds the code's characters at the start of their entrance as soon as they are there, so the check below sees them typing in.
  await page.evaluate(`
    window.heldCharacters = []
    window.codeObserver = new MutationObserver(() => {
      for (const character of document.querySelectorAll('[data-code-character]:not([data-held])')) {
        character.dataset.held = ''
        for (const animation of character.getAnimations()) {
          animation.pause()
          window.heldCharacters.push(animation)
        }
      }
    })
    window.codeObserver.observe(document.body, { childList: true, subtree: true })
  `)
  await dialog.getByLabel('Name').fill('Vera Verlauf')
  await dialog.getByLabel('Email').fill('vera.verlauf@example.com')
  await dialog.getByRole('button', { name: 'Book now' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Your table is reserved' })
  await expect(confirmation).toBeVisible()
  const manage = confirmation.getByRole('link', { name: 'Manage reservation' })
  const code = /\/reservation\/([A-Z0-9]+)\?/.exec((await manage.getAttribute('href'))!)![1]

  // While the characters type in (held at their start, the last one not shown yet), the code is read out whole.
  const codeLine = confirmation.locator('[data-reference-code]')
  expect(Number(await page.evaluate('window.heldCharacters.length'))).toBe(code.length)
  await expect(codeLine.locator('[data-code-character]').last()).toHaveCSS('opacity', '0')
  await expect(codeLine).toMatchAriaSnapshot(`- paragraph: ${code}`)
  // Let go, and hold nothing more: the confirmation is drawn anew in the sheet on the phone below.
  await page.evaluate('window.codeObserver.disconnect(); window.heldCharacters.forEach((animation) => animation.play())')
  await expect(codeLine.locator('[data-code-character]').last()).toHaveCSS('opacity', '1')

  // Exactly one primary action, "Add to calendar"; "Directions" and "Manage reservation" are quiet links, "Done" closes.
  const primary = confirmation.locator('[data-variant="primary"]')
  await expect(primary).toHaveCount(1)
  await expect(primary).toHaveAccessibleName('Add to calendar')
  await expect(confirmation.getByRole('link', { name: 'Directions' })).toBeVisible()
  await expect(manage).toHaveAttribute('target', '_blank')
  await expect(confirmation.getByRole('button', { name: 'Copy link' })).toHaveCount(0)
  await expect(confirmation.getByRole('button', { name: 'Done' })).toHaveAttribute('data-variant', 'ghost')

  for (const width of [1440, 390]) {
    await resize(page, width)
    await showActions(page, confirmation)
    await screenshot(page, feature, `confirmed-${width}`, { fullPage: false })
  }

  // "Copy link" moved into "Share" and copies the guest's link.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await confirmation.getByRole('button', { name: 'Share' }).click()
  await page.getByRole('menuitem', { name: /Copy link/ }).click()
  await expect(confirmation.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(String(await page.evaluate('navigator.clipboard.readText()'))).toBe((await manage.getAttribute('href'))!)
})

test('request: primary "View reservation", the timeline, and no "Add to calendar"', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const confirmation = await requestIlFaro(page, 'Rosa Richiesta')
  // The whole entrance (title, timeline, ticket, code, actions) is over one second after the confirmation appeared; only the
  // pulse of the current step goes on.
  await page.waitForTimeout(1000)
  const running = await page.evaluate(
    "document.getAnimations().filter((animation) => animation.playState === 'running' && animation.timeline === document.timeline && animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.animationName ?? 'animation')",
  )
  expect(running).toEqual([])

  const timeline = confirmation.getByRole('list', { name: 'What happens next' })
  await expect(timeline.getByRole('listitem')).toHaveText(['Done: Request sent', 'Now: The restaurant confirms', 'Next: Check your reservation page'])
  await expect(timeline.getByRole('listitem').nth(1)).toHaveAttribute('aria-current', 'step')

  const primary = confirmation.locator('[data-variant="primary"]')
  await expect(primary).toHaveCount(1)
  await expect(primary).toHaveAccessibleName('View reservation')
  await expect(primary).toHaveAttribute('target', '_blank')
  await expect(primary).toHaveAttribute('href', /^http:\/\/localhost:5173\/r\/il-faro\/reservation\/[A-Z0-9]+\?t=/)
  await expect(confirmation.getByRole('button', { name: 'Add to calendar' })).toHaveCount(0)
  await expect(confirmation.getByRole('button', { name: 'Share' })).toBeVisible()
  await expect(confirmation.getByRole('link', { name: 'Directions' })).toBeVisible()

  await settle(page)
  await screenshot(page, feature, 'request-1440', { fullPage: false })
  await resize(page, 390)
  await showActions(page, confirmation)
  await screenshot(page, feature, 'request-390', { fullPage: false })
})

test('"Your reservation" of a request turns confirmed without reload when the restaurant accepts it', async ({ page, playwright }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const name = 'Luka Osvežavanje'
  const request = await bookRequest(page, name)
  // The page's timers under the test's control, so the 30 s until it asks again pass at once.
  await page.clock.install()
  await page.goto(`/r/kafana-dunav/reservation/${request.referenceCode}?t=${encodeURIComponent(request.manageToken)}`)
  await expect(page.getByRole('heading', { name: 'Request sent', level: 1 })).toBeVisible()
  await expect(page.getByRole('list', { name: 'What happens next' })).toBeVisible()
  // No primary action for a request: "Change reservation" and "Share" are secondary, no calendar yet.
  await expect(page.getByRole('button', { name: 'Add to calendar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Change reservation' })).toHaveAttribute('data-variant', 'outline')
  await revealAll(page)
  await screenshot(page, feature, 'reservation-request-1440')
  // Marks the page, to tell that it is not loaded again.
  await page.evaluate('window.notReloaded = true')

  // The front desk accepts it through the staff API, in a session of its own.
  const staff = await playwright.request.newContext({ baseURL: 'http://localhost:5173' })
  expect((await staff.post('/api/auth/login', { data: { email: 'frontdesk@kafana-dunav.local', password: 'Demo1234!' } })).ok()).toBe(true)
  const reservations = (await (await staff.get(`/api/staff/reservations?from=${request.date}&to=${request.date}`)).json()) as {
    id: string
    referenceCode: string
  }[]
  const reservation = reservations.find((candidate) => candidate.referenceCode === request.referenceCode)!
  expect((await staff.post(`/api/staff/reservations/${reservation.id}/status`, { data: { status: 'Confirmed' } })).status()).toBe(200)
  await staff.dispose()

  await page.clock.fastForward(30_000)
  await expect(page.getByRole('heading', { name: 'Reservation confirmed', level: 1 })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'The restaurant has confirmed your reservation.' })).toBeAttached()
  await expect(page.getByRole('list', { name: 'What happens next' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add to calendar' })).toHaveAttribute('data-variant', 'primary')
  expect(await page.evaluate('window.notReloaded')).toBe(true)
  await revealAll(page)
  await screenshot(page, feature, 'reservation-confirmed-live-1440')
  await resize(page, 390)
  await revealAll(page)
  await screenshot(page, feature, 'reservation-confirmed-live-390')
})

/** Books Gasthaus zur Linde through the API on the first day from five days ahead with a free time; returns it and the guest's link. */
async function bookZurLindeByApi(page: Page, name: string) {
  const restaurant = '/api/public/restaurants/zur-linde'
  for (let days = 5; days < 40; days++) {
    const date = dateFromToday(days)
    const availability = (await (await page.request.get(`${restaurant}/availability?date=${date}&guests=2`)).json()) as {
      periods: { times: { time: string; available: boolean }[] }[]
    }
    const time = availability.periods.flatMap((period) => period.times).find((slot) => slot.available)?.time
    if (time === undefined) continue
    const booking = await page.request.post(`${restaurant}/reservations`, {
      data: { date, time, guests: 2, name, email: 'guest@example.com', language: 'en' },
    })
    expect(booking.status()).toBe(201)
    const { referenceCode, manageToken } = (await booking.json()) as { referenceCode: string; manageToken: string }
    return { date, time, path: `/r/zur-linde/reservation/${referenceCode}?t=${encodeURIComponent(manageToken)}` }
  }
  throw new Error('No free time at Gasthaus zur Linde in the next 40 days.')
}

test('"Your reservation" leads with "Today" or "Tomorrow" in the restaurant\'s time zone', async ({ page }) => {
  const booking = await bookZurLindeByApi(page, 'Theo Termin')
  // Early in the morning of the day in Central Europe (4:00 UTC), and of the day before.
  const morning = new Date(`${booking.date}T04:00:00Z`)
  const headline = page.getByRole('heading', { level: 2 }).first()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(morning)
  await page.goto(booking.path)
  await expect(headline).toHaveText(`Today, ${timeOfDay(booking.time)}`)
  await expect(page.getByText('2 people · Table')).toBeVisible()
  await revealAll(page)
  await screenshot(page, feature, 'headline-today-390')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.clock.setFixedTime(new Date(morning.getTime() - 24 * 60 * 60_000))
  await page.reload()
  await expect(headline).toHaveText(`Tomorrow, ${timeOfDay(booking.time)}`)
  // A confirmed reservation: "Add to calendar" is the one primary action.
  const primary = page.locator('[data-variant="primary"]')
  await expect(primary).toHaveCount(1)
  await expect(primary).toHaveAccessibleName('Add to calendar')
  await revealAll(page)
  await screenshot(page, feature, 'headline-tomorrow-1440')
})

test.describe('with less motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('shows the whole confirmation of a request at once', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const confirmation = await requestIlFaro(page, 'Paola Piano')
    // Right away: no entrance runs, and the parts that rise in otherwise are fully there.
    const running = await page.evaluate(
      "document.getAnimations().filter((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity).length",
    )
    expect(running).toBe(0)
    const opacities = (await page.evaluate(
      "['[data-reference-code] [data-code-character]', '[data-stagger] > *'].flatMap((selector) => [...document.querySelectorAll(selector)].map((element) => getComputedStyle(element).opacity))",
    )) as string[]
    expect(opacities.length).toBeGreaterThan(6)
    expect(new Set(opacities)).toEqual(new Set(['1']))
    await expect(confirmation.getByRole('list', { name: 'What happens next' })).toBeVisible()
    await expect(confirmation.getByRole('link', { name: 'View reservation' })).toBeVisible()
    await screenshot(page, feature, 'reduced-motion-request-1440', { fullPage: false })
    // Its actions, scrolled into view in the dialog: there as well, without any entrance.
    await showActions(page, confirmation)
    await screenshot(page, feature, 'reduced-motion-request-actions-1440', { fullPage: false })
  })
})
