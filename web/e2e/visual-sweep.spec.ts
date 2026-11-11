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
    // Text that runs out of its box, or out of the box around it (a hint in a chip), or is cut off without an ellipsis (an
    // ellipsis is a deliberate cut). Measured on the text itself; boxes that scroll sideways (strips of chips) are left out.
    const scrolls = (element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowX)
    for (const element of document.body.querySelectorAll('*')) {
      const texts = [...element.childNodes].filter((node) => node.nodeType === 3 && node.textContent.trim() !== '')
      if (texts.length === 0 || element.closest('.sr-only, [inert]')) continue
      const style = getComputedStyle(element)
      if (style.visibility === 'hidden' || style.textOverflow === 'ellipsis') continue
      const range = document.createRange()
      range.setStartBefore(texts[0])
      range.setEndAfter(texts[texts.length - 1])
      const text = range.getBoundingClientRect()
      if (text.width === 0) continue
      // The text's own box and the one around it, each the nearest element that has a box (not inline, not display: contents).
      const boxOf = (start) => {
        let current = start
        while (current !== null && ['inline', 'contents'].includes(getComputedStyle(current).display)) current = current.parentElement
        return current
      }
      const box = boxOf(element)
      for (const frame of [box, box === null ? null : boxOf(box.parentElement)]) {
        if (frame === null || frame === undefined || frame === document.body || scrolls(frame)) continue
        const outer = frame.getBoundingClientRect()
        if (text.left < outer.left + frame.clientLeft - 1 || text.right > outer.left + frame.clientLeft + frame.clientWidth + 1) {
          found.push('text runs out of its box: "' + element.textContent.trim().slice(0, 40) + '" (' + frame.tagName.toLowerCase() + ')')
          break
        }
      }
    }
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
  if (!loading) await photosShown(page)
  await settle(page)
  const name = `${screen}-${size.label}-${look.theme}-${look.language}`
  expect(await faults(page, size.touch), name).toEqual([])
  if (!fullPage) {
    await screenshot(page, feature, name, { fullPage, networkIdle: !loading })
    return
  }
  // A full-page screenshot makes the window as high as the page, and photos that were already there fade in again then. So the
  // window takes the page's height first (until it no longer grows, as heights in svh follow it), everything settles, and the
  // window gets its size back afterwards.
  for (let i = 0; i < 3; i++) {
    const height = Number(await page.evaluate('document.scrollingElement.scrollHeight'))
    if (height === page.viewportSize()!.height) break
    await page.setViewportSize({ width: size.viewport.width, height })
    if (!loading) await photosShown(page)
    await settle(page)
  }
  await screenshot(page, feature, name, { fullPage, networkIdle: !loading })
  await page.setViewportSize(size.viewport)
  await settle(page)
}

/**
 * Waits until every photo is there: photos load lazily, so all of them now, each one loaded and, in a Photo (which fades it in),
 * faded in fully, so no frame is caught empty or washed out. A photo that failed to load shows its fallback instead.
 */
async function photosShown(page: Page) {
  await page.evaluate(`document.querySelectorAll('img[loading="lazy"]').forEach((image) => { image.loading = 'eager' })`)
  await page.waitForFunction(`[...document.images].every((image) => image.complete)
    && [...document.querySelectorAll('[data-slot="photo"] > img')].every((image) =>
      image.naturalWidth === 0 || (image.hasAttribute('data-loaded') && getComputedStyle(image).opacity === '1'))`)
  await page.waitForLoadState('networkidle')
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

      // Scarce times in German, the longest hint ("Noch 2 Tische"): every second free time with two tables left.
      await page.route(
        (url) => url.pathname === '/api/public/restaurants/rooftop-belvedere/availability',
        async (route) => {
          const response = await route.fetch()
          const availability = (await response.json()) as { periods: { times: { available: boolean; remaining: number }[] }[] }
          for (const time of availability.periods.flatMap((period) => period.times).filter((slot) => slot.available).filter((_, i) => i % 2 === 0)) {
            time.remaining = 2
          }
          await route.fulfill({ response, json: availability })
        },
      )
      await page.goto(`/r/rooftop-belvedere${belvedere.query}`)
      await expect(page.locator('[data-tables-left]').first()).toBeVisible()
      await page.locator('[data-tables-left]').first().scrollIntoViewIfNeeded()
      await shoot(page, 'booking-scarce', size, belvedere.look, { fullPage: false })
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
    // Every frame: an entrance that waits (a delay) without holding its first frame meanwhile shows its end first and then jumps
    // to its start; two animations of the same property on the same element at the same moment compete.
    window.__motionFaults = new Set()
    const describe = (target) => target ? target.tagName.toLowerCase() + '.' + String(target.className).slice(0, 50) : 'document'
    const properties = (animation) => animation.transitionProperty !== undefined ? [animation.transitionProperty]
      : [...new Set((animation.effect?.getKeyframes() ?? []).flatMap((frame) => Object.keys(frame)))]
          .filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))
    const sample = () => {
      const running = new Map()
      for (const animation of document.getAnimations()) {
        const effect = animation.effect
        if (effect === null || animation.playState !== 'running') continue
        const timing = effect.getTiming()
        const moves = properties(animation)
        const name = animation.animationName ?? animation.transitionProperty ?? 'animation'
        if (timing.delay > 0 && animation.transitionProperty === undefined && !['backwards', 'both'].includes(timing.fill)
            && moves.some((property) => property === 'opacity' || property === 'transform' || property === 'translate' || property === 'scale')) {
          window.__motionFaults.add('starts with a jump (delay without fill backwards): ' + name + ' on ' + describe(effect.target))
        }
        if (effect.getComputedTiming().duration === 0 || effect.target === null || effect.composite !== 'replace') continue
        for (const property of moves) {
          const key = property + ' on ' + describe(effect.target) + (effect.pseudoElement ?? '')
          const other = running.get(key)
          if (other !== undefined && other.target === effect.target && other.pseudo === effect.pseudoElement) {
            window.__motionFaults.add('competing: ' + other.name + ' and ' + name + ' move ' + key)
          }
          running.set(key, { target: effect.target, pseudo: effect.pseudoElement, name })
        }
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })()`)
}

/**
 * Once everything has settled: the elements that animated and stayed between invisible and visible (an animation ending below
 * opacity 1), the jumps at the start and the competing animations so far, and the layout shifts so far.
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
    return { halfVisible, faults: [...window.__motionFaults], shifts: Math.round(window.__shifts * 1000) / 1000 }
  })()`)) as { halfVisible: string[]; faults: string[]; shifts: number }
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

    test('every step starts without a jump, ends fully visible, nothing competes and the page does not shift', async ({ page, browser }) => {
      await recordMotion(page)
      // The browser's performance trace of the flow, with its frames; kept only when the test fails (attached as motion-trace.json,
      // to be opened in the browser's developer tools, Performance), as it is 60–70 MB.
      await browser.startTracing(page, { screenshots: true })
      try {
        await mainFlow(page, async (step) => {
          const motion = await motionAfter(page)
          expect(motion.halfVisible, step).toEqual([])
          expect(motion.faults, step).toEqual([])
          // The page itself does not shift. In the dialog the layout shifts are recorded in the report: the frame takes the next
          // step's size at once and glides there by transform (counted as a shift on desktops), and on phones the table step's
          // floor plan grows once its image has loaded (see the pull request, "Not fixed, needs decision").
          if (step === 'page') expect(motion.shifts, step).toBeLessThan(0.05)
          test.info().annotations.push({ type: 'layout shifts', description: `${step}: ${motion.shifts}` })
        })
      } catch (error) {
        await test.info().attach('motion-trace.json', { body: await browser.stopTracing(), contentType: 'application/json' })
        throw error
      }
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

/**
 * Contrast and focus rings in the page, as functions on `window.__sweep`: `contrast(scope)` lists the texts in view inside `scope`
 * below 4.5:1 (3:1 from 24 px, or 18.66 px bold) against what lies behind them, and the borders of empty fields below 3:1;
 * `focus()` checks the focused element's ring: 2 px or more, 3:1 against what lies around it, and not cut off by a parent that
 * clips. What lies on a photo (an image or a gradient behind it) and what is disabled are left out.
 */
async function installChecks(page: Page) {
  await page.addInitScript(`(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const rgba = (color) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = '#000'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1)
    const luminance = (color) => {
      const [r, g, b] = color.slice(0, 3).map((value) => (value /= 255) <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
    // Surfaces that let the pointer through (a selection pill, a shade) are part of the stack too.
    const through = document.createElement('style')
    through.textContent = '* { pointer-events: auto !important; }'
    // The colour behind a point, from the elements stacked there below 'from' (itself left out unless 'self'); null on a photo.
    const behind = (x, y, from, self) => {
      const stack = document.elementsFromPoint(x, y)
      const layers = []
      let start = from === null ? 0 : stack.indexOf(from)
      if (start === -1) return null
      if (!self) start += 1
      for (const element of stack.slice(start)) {
        if (from !== null && !self && from.contains(element)) continue
        const style = getComputedStyle(element)
        if (['IMG', 'VIDEO', 'CANVAS', 'PICTURE'].includes(element.tagName) || style.backgroundImage !== 'none') return null
        const color = rgba(style.backgroundColor)
        if (color[3] > 0) layers.push(color)
        if (color[3] >= 0.99) break
      }
      return layers.reverse().reduce((bottom, top) => over(top, bottom), [255, 255, 255, 1])
    }
    const name = (element) => (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40) + ' (' + element.tagName.toLowerCase() + ')'
    const opaque = (element) => {
      for (let current = element; current !== null; current = current.parentElement) if (Number(getComputedStyle(current).opacity) < 0.99) return false
      return true
    }
    window.__sweep = {
      contrast(scope) {
        document.head.append(through)
        const found = []
        for (const element of document.querySelectorAll(scope + ' *')) {
          if (element.closest('.sr-only, [disabled], [aria-disabled="true"], [inert]')) continue
          const box = element.getBoundingClientRect()
          if (box.width < 2 || box.height < 2 || box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue
          const style = getComputedStyle(element)
          if (style.visibility === 'hidden' || !opaque(element)) continue
          const x = Math.min(Math.max(box.left + box.width / 2, 1), innerWidth - 1)
          const y = Math.min(Math.max(box.top + box.height / 2, 1), innerHeight - 1)
          const field = ['INPUT', 'TEXTAREA'].includes(element.tagName) && element.type !== 'radio' && element.type !== 'checkbox'
          if (field) {
            const background = behind(box.left - 2, y, element, false)
            if (background === null) continue
            const border = over(rgba(style.borderTopColor), background)
            const value = ratio(border, background)
            if (value < 3) found.push('field border ' + value.toFixed(2) + ':1 ' + name(element.labels?.[0] ?? element))
            continue
          }
          if (![...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() !== '')) continue
          const background = behind(x, y, element, true)
          if (background === null) continue
          const value = ratio(over(rgba(style.color), background), background)
          const size = parseFloat(style.fontSize)
          const needed = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5
          if (value < needed) found.push('text ' + value.toFixed(2) + ':1 ' + name(element))
        }
        through.remove()
        return [...new Set(found)]
      },
      focus() {
        const element = document.activeElement
        if (element === null || element === document.body) return []
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        if (box.width === 0) return []
        if (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) < 2) {
          // A ring drawn inside instead, on a mark over a photo that its frame clips (the gallery): a box-shadow of 2 px or more.
          const inset = [...element.querySelectorAll('*')].some((mark) => /0px 0px 0px ([2-9]|\\d\\d)px inset/.test(getComputedStyle(mark).boxShadow))
          return inset ? [] : ['no focus ring: ' + name(element)]
        }
        const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
        const found = []
        document.head.append(through)
        const background = behind(box.left - reach - 2, box.top + box.height / 2, element, false) ?? behind(box.left + box.width / 2, box.top - reach - 2, element, false)
        through.remove()
        if (background !== null) {
          const value = ratio(over(rgba(style.outlineColor), background), background)
          if (value < 3) found.push('focus ring ' + value.toFixed(2) + ':1 ' + name(element))
        }
        for (let parent = element.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
          const clip = getComputedStyle(parent)
          const clipsX = clip.overflowX !== 'visible'
          const clipsY = clip.overflowY !== 'visible'
          if (!clipsX && !clipsY) continue
          const frame = parent.getBoundingClientRect()
          const left = frame.left + parent.clientLeft
          const top = frame.top + parent.clientTop
          if ((clipsX && (box.left - reach < left - 0.5 || box.right + reach > left + parent.clientWidth + 0.5))
              || (clipsY && (box.top - reach < top - 0.5 || box.bottom + reach > top + parent.clientHeight + 0.5))) {
            found.push('focus ring cut off by ' + parent.tagName.toLowerCase() + '.' + String(parent.className).slice(0, 50) + ': ' + name(element))
            break
          }
        }
        return found
      },
    }
  })()`)
}

/** The contrast faults of the whole page, screen by screen from top to bottom, inside `scope`. */
async function contrastOfPage(page: Page, scope: string) {
  const found = new Set<string>()
  const height = Number(await page.evaluate('document.scrollingElement.scrollHeight'))
  for (let y = 0; y < height; y += 600) {
    await page.evaluate(`window.scrollTo(0, ${y})`)
    await page.waitForTimeout(150)
    await settle(page)
    for (const fault of (await page.evaluate(`window.__sweep.contrast(${JSON.stringify(scope)})`)) as string[]) found.add(fault)
  }
  return [...found]
}

/** Moves the focus with Tab `count` times and checks the ring each time; the faults of all of them. */
async function focusRings(page: Page, count: number) {
  const found = new Set<string>()
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab')
    // The ring glides in (150 ms).
    await settle(page)
    for (const fault of (await page.evaluate('window.__sweep.focus()')) as string[]) found.add(fault)
  }
  return [...found]
}

// Every demo restaurant in its own theme and accent colour, and the start page in the platform's.
const demoRestaurants = [
  { slug: 'zur-linde', theme: 'light' },
  { slug: 'kafana-dunav', theme: 'light' },
  { slug: 'il-faro', theme: 'light' },
  { slug: 'cafe-morgenrot', theme: 'light' },
  { slug: 'rooftop-belvedere', theme: 'dark' },
  { slug: 'izakaya-kaze', theme: 'dark' },
] as const

test.describe('Contrast and focus rings at 1440 px', () => {
  test.use({ viewport: sizes[0].viewport })
  // Each test checks a whole page screen by screen and tabs through it.
  test.describe.configure({ timeout: 90_000 })

  test('the start page', async ({ page }) => {
    await installChecks(page)
    await page.goto('/')
    await expect(page.locator('main a[href^="/r/"]').first()).toBeVisible()
    await revealWhole(page)
    expect(await contrastOfPage(page, 'main')).toEqual([])
    await page.evaluate('window.scrollTo(0, 0)')
    expect(await focusRings(page, 20)).toEqual([])
  })

  for (const restaurant of demoRestaurants) {
    test(`${restaurant.slug} (${restaurant.theme}): the page and the booking dialog`, async ({ page }) => {
      await installChecks(page)
      await page.goto(`/r/${restaurant.slug}`)
      const time = await lastFreeTime(page)
      await revealWhole(page)
      expect(await contrastOfPage(page, 'body'), 'page').toEqual([])
      await page.evaluate('window.scrollTo(0, 0)')
      expect(await focusRings(page, 40), 'page focus').toEqual([])

      await time.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await settle(page)
      expect(await page.evaluate(`window.__sweep.contrast('[role="dialog"]')`), 'dialog').toEqual([])
      expect(await focusRings(page, 12), 'dialog focus').toEqual([])
      // The dialog with a focused control, its ring in the accent colour.
      await shoot(page, `focus-${restaurant.slug}`, sizes[0], { theme: restaurant.theme, language: 'en' }, { fullPage: false })
      // Where the guest chooses the table: on to the first free table of the plan, its ring around it.
      if (await dialog.locator('[data-floor-table][role="button"]').count() > 0) {
        for (let i = 0; i < 40 && !(await page.evaluate(`document.activeElement?.hasAttribute('data-floor-table') === true`)); i++) {
          await page.keyboard.press('Tab')
        }
        await expect(dialog.locator('[data-floor-table]:focus-visible')).toHaveCount(1)
        expect(await page.evaluate('window.__sweep.focus()'), 'table focus').toEqual([])
        await shoot(page, `focus-table-${restaurant.slug}`, sizes[0], { theme: restaurant.theme, language: 'en' }, { fullPage: false })
      }
    })
  }
})
