import { expect, type Locator, type Page, type Route, test } from '@playwright/test'
import { bookRequest, dateFromToday, menuSection, settle } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The visual sweep of every screen a guest sees: the start page, the restaurant page, the booking card, the booking dialog
// (the sheet on phones) with the table step, the contact step, the hold and the confirmation, "Your reservation" with
// "Change reservation" and cancelling, the embed and the not found pages; loading, empty, error, a full day, an ended hold,
// a request and a confirmed reservation. At 1440 × 900, 1024 × 768 (tablet, touch) and 390 × 844 (phone, touch); Gasthaus
// zur Linde (light) in English, Rooftop Belvedere (dark) in German for the long words, Izakaya Kaze (dark) in Serbian
// Cyrillic once per screen. Every screenshot is `<screen>-<size>-<theme>-<language>`; before it, the checks that hold on
// every screen: no sideways scrolling of the page, and on touch every control at least 44 px high. At the end the motion of the
// main flow (time, table, contact details, confirmation, "Change reservation") at 1440 and 390 px, with its trace.

const feature = 'visual-sweep'

const sizes = [
  { label: '1440', viewport: { width: 1440, height: 900 }, touch: false },
  { label: '1024', viewport: { width: 1024, height: 768 }, touch: true },
  { label: '390', viewport: { width: 390, height: 844 }, touch: true },
] as const

type Size = (typeof sizes)[number]
type Look = { theme: 'light' | 'dark'; language: 'en' | 'de' | 'sr' }

const zurLinde = { slug: 'zur-linde', look: { theme: 'light', language: 'en' }, query: '' } as const
const belvedere = { slug: 'rooftop-belvedere', look: { theme: 'dark', language: 'de' }, query: '?lang=de' } as const
const izakaya = { slug: 'izakaya-kaze', look: { theme: 'dark', language: 'sr' }, query: '?lang=sr-Cyrl' } as const

/**
 * The controls of the page that are smaller than 44 px high on a touch screen, and whether the page scrolls sideways. Links
 * inside running text are left out (they are as high as their line), and so is what is hidden or inert.
 */
async function faults(page: Page, touch: boolean) {
  return (await page.evaluate(`(() => {
    const found = []
    const root = document.scrollingElement
    if (root.scrollWidth > root.clientWidth + 1) found.push('page scrolls sideways: ' + root.scrollWidth + ' > ' + root.clientWidth)
    if (${touch}) {
      const controls = document.querySelectorAll('button, a[href], summary, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea')
      for (const control of controls) {
        if (control.closest('[inert], [aria-hidden="true"]')) continue
        // The tables on a floor plan are drawn to scale; the list of the free tables below the plan is the way to choose one by touch.
        if (control.hasAttribute('data-floor-table')) continue
        const box = control.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        const style = getComputedStyle(control)
        if (style.visibility === 'hidden' || style.display === 'contents') continue
        // A link in running text is as high as its line.
        if (control.tagName === 'A' && style.display === 'inline' && control.parentElement?.closest('p, li') && control.parentElement.textContent.trim() !== control.textContent.trim()) continue
        // A control inside a label that is the target, e.g. a radio button's label.
        const target = control.closest('label') ?? control
        const height = target.getBoundingClientRect().height
        if (Math.round(height) < 44) {
          const name = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim().slice(0, 40)
          found.push('touch target ' + Math.round(box.width) + '×' + Math.round(height) + ': ' + control.tagName.toLowerCase() + ' "' + name + '"')
        }
      }
    }
    return found
  })()`)) as string[]
}

/** Checks the page as it is now and saves its screenshot as `<screen>-<size>-<theme>-<language>`. */
async function shoot(
  page: Page,
  screen: string,
  size: Size,
  look: Look,
  { fullPage = true, loading = false }: { fullPage?: boolean; loading?: boolean } = {},
) {
  // First the images and API calls, then what they set moving (a header fading in after a scroll, the hold's digits rolling).
  if (!loading) await page.waitForLoadState('networkidle')
  await settle(page)
  const name = `${screen}-${size.label}-${look.theme}-${look.language}`
  expect(await faults(page, size.touch), name).toEqual([])
  await screenshot(page, feature, name, { fullPage, networkIdle: !loading })
}

/**
 * Scrolls through the whole page and back to the top, so everything that rises in on scrolling is shown in a full-page
 * screenshot; to the page's end as it is then, as it grows while the menu loads.
 */
async function revealWhole(page: Page) {
  for (let y = 0; y < Number(await page.evaluate('document.scrollingElement.scrollHeight')); y += 400) {
    await page.evaluate(`window.scrollTo(0, ${y})`)
    await page.waitForTimeout(100)
  }
  await page.evaluate('window.scrollTo(0, 0)')
  // The rise-in takes 600 ms.
  await page.waitForTimeout(800)
}

/** Holds back the API calls `matches` picks until the returned function is called: the page shows its loading state. */
async function holdBack(page: Page, matches: (url: URL) => boolean) {
  let release = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route(matches, async (route: Route) => {
    await released
    await route.fallback().catch(() => {})
  })
  return release
}

/** Answers the API calls `matches` picks with an error 500. */
async function fail(page: Page, matches: (url: URL) => boolean) {
  await page.route(matches, (route) => route.fulfill({ status: 500, json: { error: 'Internal server error' } }))
}

/** The latest free time of the card (the earliest can fall within the lead time while the test runs). */
async function lastFreeTime(page: Page) {
  const chip = page.locator('[data-time-chip]:enabled').last()
  await expect(chip).toBeVisible()
  return chip
}

/** Opens the restaurant's page and its booking at its latest free time: the first step of the dialog (the sheet on phones). */
async function openBooking(page: Page, restaurant: { slug: string; query: string }) {
  await page.goto(`/r/${restaurant.slug}${restaurant.query}`)
  await (await lastFreeTime(page)).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

/** On the table step: the first free table from the list, then on. */
async function chooseTable(dialog: Locator) {
  await dialog.locator('details summary').click()
  await dialog.locator('input[name="booking-table"]').first().click()
  const next = dialog.locator('[data-slot="step-actions"] button').last()
  await expect(next).toBeEnabled()
  await next.click()
}

/** Fills in the contact details and books. */
async function book(dialog: Locator, name: string) {
  await dialog.locator('[name="name"]').fill(name)
  await dialog.locator('[name="email"]').fill('visual.sweep@example.com')
  await dialog.locator('form [type="submit"]').click()
}

/** The confirmation, scrolled to its actions once the success moment is over. */
async function showConfirmation(page: Page) {
  const confirmation = page.getByRole('dialog').filter({ has: page.locator('[data-reference-code]') })
  await expect(confirmation.locator('[data-code-character]').last()).toHaveCSS('opacity', '1')
  await settle(page)
  return confirmation
}

/** The first day from two days on that Gasthaus zur Linde is open with free tables. */
async function openDay(page: Page) {
  for (let month = 0; month < 3; month++) {
    const first = new Date()
    first.setDate(1)
    first.setMonth(first.getMonth() + month)
    const key = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`
    const days = (await (await page.request.get(`/api/public/restaurants/zur-linde/calendar?month=${key}&guests=2`)).json()) as {
      date: string
      status: string
    }[]
    const day = days.find((candidate) => candidate.status === 'available' && candidate.date >= dateFromToday(2))
    if (day !== undefined) return day.date
  }
  throw new Error('Gasthaus zur Linde has no open day in the next three months.')
}

for (const size of sizes) {
  const phone = size.viewport.width < 768

  test.describe(`Visual sweep at ${size.label} px`, () => {
    test.use({ viewport: size.viewport, hasTouch: size.touch })
    // Each test walks several pages and states.
    test.describe.configure({ timeout: 120_000 })

    test('start page: filled, in German, empty, loading and error', async ({ page }) => {
      const light = { theme: 'light', language: 'en' } as const
      await page.goto('/')
      await expect(page.locator('main a[href^="/r/"]').first()).toBeVisible()
      await revealWhole(page)
      await shoot(page, 'start', size, light)

      await page.goto('/?lang=de')
      await expect(page.locator('main a[href^="/r/"]').first()).toBeVisible()
      await revealWhole(page)
      await shoot(page, 'start', size, { theme: 'light', language: 'de' })

      if (phone) {
        await page.goto('/?lang=sr-Cyrl')
        await expect(page.locator('main a[href^="/r/"]').first()).toBeVisible()
        await revealWhole(page)
        await shoot(page, 'start', size, { theme: 'light', language: 'sr' })
      }

      // A Serbian restaurant in Munich: none in the demo data.
      await page.goto(`/?city=${encodeURIComponent('München')}&cuisine=Serbian`)
      await expect(page.getByRole('heading', { name: 'No restaurant matches your filters', level: 3 })).toBeVisible()
      await page.getByRole('heading', { name: 'No restaurant matches your filters' }).scrollIntoViewIfNeeded()
      await shoot(page, 'start-empty', size, light, { fullPage: false })

      const release = await holdBack(page, (url) => url.pathname === '/api/tenants')
      await page.goto('/')
      await page.locator('[data-slot="skeleton"]').first().scrollIntoViewIfNeeded()
      await shoot(page, 'start-loading', size, light, { fullPage: false, loading: true })
      release()
      await page.unrouteAll({ behavior: 'ignoreErrors' })

      await fail(page, (url) => url.pathname === '/api/tenants')
      await page.goto('/')
      const error = page.getByRole('heading', { name: 'Something went wrong' })
      // After the query's one retry.
      await expect(error).toBeVisible({ timeout: 10_000 })
      await error.scrollIntoViewIfNeeded()
      await shoot(page, 'start-error', size, light, { fullPage: false })
    })

    test('restaurant page: light and dark, sticky parts, lightbox, loading, error, a full day and not found', async ({ page }) => {
      for (const restaurant of [zurLinde, belvedere, ...(phone ? [izakaya] : [])]) {
        await page.goto(`/r/${restaurant.slug}${restaurant.query}`)
        await lastFreeTime(page)
        await revealWhole(page)
        await shoot(page, `restaurant-${restaurant.slug}`, size, restaurant.look)
      }

      // Halfway down the page: the header, the section navigation and, on phones and tablets, the reserve bar over the content.
      await page.goto('/r/zur-linde')
      await lastFreeTime(page)
      await menuSection(page)
      await page.evaluate('window.scrollBy(0, 200)')
      await page.waitForTimeout(400)
      await shoot(page, 'restaurant-scrolled', size, zurLinde.look, { fullPage: false })

      // The gallery's lightbox.
      await page.locator('section[aria-labelledby="gallery-heading"] button:visible').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shoot(page, 'lightbox', size, zurLinde.look, { fullPage: false })
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()

      // A full day: every time of the day taken, with the next free days.
      const day = await openDay(page)
      await page.route(
        (url) => url.pathname === '/api/public/restaurants/zur-linde/availability' && url.searchParams.get('date') === day,
        async (route) => {
          const response = await route.fetch()
          const availability = (await response.json()) as { periods: { times: { available: boolean; remaining: number }[] }[] }
          for (const period of availability.periods) {
            for (const time of period.times) Object.assign(time, { available: false, remaining: 0 })
          }
          await route.fulfill({ response, json: availability })
        },
      )
      await page.goto(`/r/zur-linde?date=${day}&guests=2`)
      await expect(page.getByText('No free tables on this day.')).toBeVisible()
      const alternatives = page.getByRole('heading', { name: 'Next free days' })
      await expect(alternatives).toBeVisible()
      await alternatives.scrollIntoViewIfNeeded()
      await shoot(page, 'booking-full-day', size, zurLinde.look, { fullPage: false })
      await page.unrouteAll({ behavior: 'ignoreErrors' })

      const release = await holdBack(page, (url) => url.pathname === '/api/public/restaurants/zur-linde')
      await page.goto('/r/zur-linde')
      await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible()
      await shoot(page, 'restaurant-loading', size, zurLinde.look, { fullPage: false, loading: true })
      release()
      await page.unrouteAll({ behavior: 'ignoreErrors' })

      await fail(page, (url) => url.pathname === '/api/public/restaurants/zur-linde')
      await page.goto('/r/zur-linde')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shoot(page, 'restaurant-error', size, zurLinde.look, { fullPage: false })
      await page.unrouteAll({ behavior: 'ignoreErrors' })

      await page.goto('/r/does-not-exist')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shoot(page, 'not-found-restaurant', size, zurLinde.look)
      await page.goto('/does-not-exist')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shoot(page, 'not-found', size, zurLinde.look)
      if (phone) {
        await page.goto('/does-not-exist?lang=sr-Cyrl')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        // The platform's page, in its light look.
        await shoot(page, 'not-found', size, { theme: 'light', language: 'sr' })
      }
    })

    test('booking at Gasthaus zur Linde: the hold, the confirmation, "Your reservation", changing and cancelling it', async ({ page }) => {
      const look = zurLinde.look
      const dialog = await openBooking(page, zurLinde)
      await expect(dialog.locator('[data-hold-notice]')).toHaveAttribute('data-state', 'holding')
      await shoot(page, 'dialog-contact', size, look, { fullPage: false })

      await book(dialog, 'Vera Visual')
      const confirmation = await showConfirmation(page)
      await shoot(page, 'confirmation', size, look, { fullPage: false })
      await confirmation.getByRole('button', { name: 'Done' }).scrollIntoViewIfNeeded()
      await shoot(page, 'confirmation-actions', size, look, { fullPage: false })

      // The link opens a new tab; here in the same one.
      await page.goto((await confirmation.getByRole('link', { name: 'Manage reservation' }).getAttribute('href'))!)
      await expect(page.getByRole('button', { name: 'Change reservation' })).toBeVisible()
      await revealWhole(page)
      await shoot(page, 'reservation-confirmed', size, look)

      await page.getByRole('button', { name: 'Change reservation' }).click()
      const panel = phone ? page.getByRole('dialog', { name: 'Change reservation' }) : page.getByRole('region', { name: 'Change reservation' })
      await expect(panel.locator('[data-time-chip]').first()).toBeVisible()
      // Another time than the reservation's own, which is the latest.
      await panel.locator('[data-time-chip]:enabled').first().click()
      await panel.getByRole('button', { name: 'Change', exact: true }).scrollIntoViewIfNeeded()
      await shoot(page, 'reservation-change', size, look, { fullPage: false })
      if (phone) {
        await page.keyboard.press('Escape')
      } else {
        await page.getByRole('button', { name: 'Change reservation' }).click()
      }
      await expect(panel).toBeHidden()

      await page.getByRole('button', { name: 'Cancel reservation' }).click()
      const cancel = page.getByRole('dialog', { name: 'Really cancel the reservation?' })
      await expect(cancel).toBeVisible()
      await shoot(page, 'reservation-cancel', size, look, { fullPage: false })
      await cancel.getByRole('button', { name: 'Cancel reservation' }).click()
      await expect(page.getByRole('heading', { name: 'Your reservation has been cancelled', level: 1 })).toBeVisible()
      await revealWhole(page)
      await shoot(page, 'reservation-cancelled', size, look)
    })

    test('booking at Rooftop Belvedere in German: the table step, an ended hold, the confirmation and "Your reservation"', async ({ page }) => {
      const look = belvedere.look
      // The hold ends 3 seconds after it was made.
      await page.route(
        (url) => url.pathname === '/api/public/restaurants/rooftop-belvedere/holds',
        async (route) => {
          if (route.request().method() !== 'POST') return route.fallback()
          const response = await route.fetch()
          const hold = (await response.json()) as { expiresAtUtc: string }
          await route.fulfill({ response, json: { ...hold, expiresAtUtc: new Date(Date.now() + 3000).toISOString() } })
        },
      )
      const dialog = await openBooking(page, belvedere)
      await expect(dialog.locator('input[name="booking-table"]').first()).toBeAttached()
      await shoot(page, 'dialog-table', size, look, { fullPage: false })

      await chooseTable(dialog)
      await expect(dialog.locator('[data-hold-notice]')).toHaveAttribute('data-state', 'ended')
      await page.waitForTimeout(1000)
      await shoot(page, 'dialog-hold-ended', size, look, { fullPage: false })

      await book(dialog, 'Vera Visual')
      const confirmation = await showConfirmation(page)
      await shoot(page, 'confirmation', size, look, { fullPage: false })

      await page.goto(`${await confirmation.locator('a[href*="/reservation/"]').first().getAttribute('href')}&lang=de`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await revealWhole(page)
      await shoot(page, 'reservation-confirmed', size, look)
    })

    if (phone) {
      test('booking at Izakaya Kaze in Serbian Cyrillic: the table step, the hold and the confirmation', async ({ page }) => {
        const look = izakaya.look
        const dialog = await openBooking(page, izakaya)
        await expect(dialog.locator('input[name="booking-table"]').first()).toBeAttached()
        await shoot(page, 'dialog-table', size, look, { fullPage: false })
        await chooseTable(dialog)
        await expect(dialog.locator('[data-hold-notice]')).toHaveAttribute('data-state', 'holding')
        await shoot(page, 'dialog-contact', size, look, { fullPage: false })
        await book(dialog, 'Вера Визуал')
        const confirmation = await showConfirmation(page)
        await shoot(page, 'confirmation', size, look, { fullPage: false })
        await page.goto(`${await confirmation.locator('a[href*="/reservation/"]').first().getAttribute('href')}&lang=sr-Cyrl`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await revealWhole(page)
        await shoot(page, 'reservation-confirmed', size, look)
      })
    }

    test('"Your reservation" of a request, loading, error and not found; the embed', async ({ page }) => {
      const look = zurLinde.look
      const request = await bookRequest(page, 'Rita Request')
      const path = `/r/kafana-dunav/reservation/${request.referenceCode}?t=${request.manageToken}`
      const api = (url: URL) => url.pathname === `/api/public/restaurants/kafana-dunav/reservations/${request.referenceCode}`
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await revealWhole(page)
      await shoot(page, 'reservation-request', size, look)

      const release = await holdBack(page, api)
      await page.goto(path)
      await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible()
      await shoot(page, 'reservation-loading', size, look, { fullPage: false, loading: true })
      release()
      await page.unrouteAll({ behavior: 'ignoreErrors' })

      await fail(page, api)
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shoot(page, 'reservation-error', size, look)
      await page.unrouteAll({ behavior: 'ignoreErrors' })

      await page.goto('/r/zur-linde/reservation/ABC123?t=wrong')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shoot(page, 'reservation-not-found', size, look)

      await page.goto('/embed/zur-linde')
      await lastFreeTime(page)
      await shoot(page, 'embed', size, look)
      await page.goto('/embed/rooftop-belvedere?lang=de')
      await lastFreeTime(page)
      await shoot(page, 'embed', size, belvedere.look)
      if (phone) {
        await page.goto('/embed/izakaya-kaze?lang=sr-Cyrl')
        await lastFreeTime(page)
        await shoot(page, 'embed', size, izakaya.look)
      }
    })
  })
}

/**
 * Records from the page's start: the layout shifts that no input caused (as CLS counts them), and every element that started an
 * animation or a transition, marked with `data-sweep-animated`.
 */
async function recordMotion(page: Page) {
  await page.addInitScript(`(() => {
    window.__shifts = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts += entry.value
    }).observe({ type: 'layout-shift', buffered: true })
    const mark = (event) => event.target instanceof Element && event.target.setAttribute('data-sweep-animated', '')
    document.addEventListener('animationstart', mark, true)
    document.addEventListener('transitionstart', mark, true)
  })()`)
}

/**
 * Once everything has settled: the elements that animated and stayed between invisible and visible (an animation ending below
 * opacity 1), and the layout shifts so far.
 */
async function motionAfter(page: Page) {
  await settle(page)
  return (await page.evaluate(`(() => {
    const halfVisible = []
    for (const element of document.querySelectorAll('[data-sweep-animated]')) {
      if (element.closest('[inert], [aria-hidden="true"]') || element.getBoundingClientRect().width === 0) continue
      const opacity = Number(getComputedStyle(element).opacity)
      if (opacity > 0 && opacity < 1) halfVisible.push(element.tagName.toLowerCase() + '.' + String(element.className).slice(0, 60) + ' ' + opacity)
    }
    return { halfVisible, shifts: Math.round(window.__shifts * 1000) / 1000 }
  })()`)) as { halfVisible: string[]; shifts: number }
}

/** The animations and transitions running now that take any time (with reduced motion there are none). */
async function movingNow(page: Page) {
  return (await page.evaluate(`document.getAnimations()
    .filter((animation) => animation.playState === 'running' && (animation.effect?.getComputedTiming().duration ?? 0) > 0)
    .map((animation) => animation.animationName ?? animation.transitionProperty ?? 'view transition')`)) as string[]
}

/**
 * The main flow at Rooftop Belvedere: a time on the card, a table, the contact details, the confirmation and then "Change
 * reservation" on "Your reservation"; `check` after each step.
 */
async function mainFlow(page: Page, check: (step: string) => Promise<void>) {
  await page.goto('/r/rooftop-belvedere')
  const time = await lastFreeTime(page)
  await check('page')
  await time.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('input[name="booking-table"]').first()).toBeAttached()
  await check('table')
  await chooseTable(dialog)
  await expect(dialog.locator('[data-hold-notice]')).toBeVisible()
  await check('contact')
  await book(dialog, 'Moritz Motion')
  const confirmation = page.getByRole('dialog').filter({ has: page.locator('[data-reference-code]') })
  await expect(confirmation.locator('[data-code-character]').last()).toHaveCSS('opacity', '1')
  await check('confirmation')
  await page.goto((await confirmation.locator('a[href*="/reservation/"]').first().getAttribute('href'))!)
  await page.getByRole('button', { name: 'Change reservation' }).click()
  await expect(page.locator('[data-time-chip]').first()).toBeVisible()
  await check('change')
}

for (const size of [sizes[0], sizes[2]]) {
  test.describe(`Motion of the main flow at ${size.label} px`, () => {
    test.use({ viewport: size.viewport, hasTouch: size.touch })

    test('every step ends fully visible, without layout shifts', async ({ page, browser }) => {
      await recordMotion(page)
      // The browser's performance trace of the flow, with its frames, in the test's results folder (playwright/…/motion-trace.json),
      // to be opened in the browser's developer tools (Performance).
      await browser.startTracing(page, { path: test.info().outputPath('motion-trace.json'), screenshots: true })
      await mainFlow(page, async (step) => {
        const motion = await motionAfter(page)
        expect(motion.halfVisible, step).toEqual([])
        // The page itself does not shift. In the dialog the layout shifts are recorded in the report: the frame takes the next
        // step's size at once and glides there by transform (counted as a shift on desktops), and on phones the table step's
        // floor plan grows once its image has loaded (see the pull request, "Not fixed, needs decision").
        if (step === 'page') expect(motion.shifts, step).toBeLessThan(0.05)
        test.info().annotations.push({ type: 'layout shifts', description: `${step}: ${motion.shifts}` })
      })
      await browser.stopTracing()
    })

    test('nothing moves with reduced motion', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mainFlow(page, async (step) => {
        expect(await movingNow(page), step).toEqual([])
      })
    })
  })
}
