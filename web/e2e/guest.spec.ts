import { expect, type Locator, type Page, test } from '@playwright/test'
import { screenshot } from './screenshot.ts'

/**
 * Scrolls through the page and back to the top, so the parts that rise in when they are scrolled into view (Reveal, Stagger)
 * are shown in a full-page screenshot.
 */
async function revealAll(page: Page) {
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

test.describe('Start page', () => {
  test('lists the restaurants', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Reserve a table – directly with the restaurant' })).toBeVisible()
    for (const name of ['Gasthaus zur Linde', 'Kafana Dunav', 'Rooftop Belvedere']) {
      await expect(page.getByText(name).first()).toBeVisible()
    }
    // The red bar of checkTailwind.ts appears when Tailwind's styles did not reach the page.
    await expect(page.getByText('Tailwind-Styles fehlen')).toHaveCount(0)
    await screenshot(page, 'start-page', 'restaurants')
  })

  for (const width of [375, 1280]) {
    test(`shows the five parts of the start page at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 800 })
      await page.goto('/')
      // The photo at the top, in two widths, loaded first.
      const hero = page.locator('img[src="/home-hero-1200.webp"]')
      await expect(hero).toHaveAttribute('srcset', /home-hero-2400\.webp 2400w/)
      await expect(hero).toHaveAttribute('fetchpriority', 'high')
      await expect(page.getByRole('heading', { name: 'Reserve a table – directly with the restaurant', level: 1 })).toBeVisible()
      await expect(page.getByRole('searchbox', { name: 'Search by name or city' })).toBeVisible()
      // The header lies transparently with white text on the photo and becomes opaque when the page scrolls.
      const header = page.locator('header')
      await expect(header).toHaveCSS('color', 'rgb(255, 255, 255)')
      await expect(page.getByRole('heading', { name: '3 restaurants', level: 2 })).toBeVisible()
      await expect(page.locator('main a[href^="/r/"]')).toHaveCount(3)
      await expect(page.getByRole('heading', { name: 'How it works', level: 2 })).toBeVisible()
      for (const step of ['Choose a restaurant', 'Pick a time and table', 'Get your confirmation']) {
        await expect(page.getByRole('heading', { name: step, level: 3 })).toBeVisible()
      }
      await expect(page.getByRole('heading', { name: 'Your tables, bookable online', level: 2 })).toBeVisible()
      for (const benefit of ['Online booking with floor plan', 'Your own look', 'Reception and table overview']) {
        await expect(page.getByRole('heading', { name: benefit, level: 3 })).toBeVisible()
      }
      await expect(page.locator('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
      const footer = page.locator('footer')
      await expect(footer.getByRole('link', { name: 'For restaurants: Sign in' })).toHaveAttribute('href', '/login')
      await expect(footer.getByRole('button', { name: /Language/ })).toBeVisible()
      await revealAll(page)
      await screenshot(page, 'start-page', `start-page-${width}`)
      await page.evaluate('window.scrollTo(0, 400)')
      await expect(header).not.toHaveCSS('color', 'rgb(255, 255, 255)')
    })
  }

  test('filters the restaurants by the search and scrolls to them', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.getByPlaceholder('Search by name or city').fill('Kafana')
    await expect(page.getByText('1 restaurant found')).toBeVisible()
    await expect(page.getByRole('heading', { name: '1 restaurant', level: 2 })).toBeVisible()
    await expect(page.locator('main a[href^="/r/"]')).toHaveCount(1)
    // The page scrolls until the card is in view, the search field stays in view.
    await expect(page.locator('main a[href="/r/kafana-dunav"]')).toBeInViewport()
    await expect(page.getByRole('searchbox')).toBeInViewport()
    await screenshot(page, 'start-page', 'search')
  })

  test('opens a restaurant from its card', async ({ page }) => {
    await page.goto('/')
    await page.locator('main a[href="/r/rooftop-belvedere"]').click()
    await expect(page).toHaveURL(/\/r\/rooftop-belvedere$/)
    await expect(page.getByRole('heading', { name: 'Rooftop Belvedere', level: 1 })).toBeVisible()
  })

  test('leads signed-in staff to their own area', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('admin@zur-linde.local')
    await page.getByLabel('Password', { exact: true }).fill('Demo1234!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/')
    await expect(page.locator('main').getByRole('link', { name: 'Go to management' })).toHaveAttribute('href', '/admin')
    await expect(page.locator('footer').getByRole('link', { name: 'Go to management' })).toHaveAttribute('href', '/admin')
    await revealAll(page)
    await screenshot(page, 'start-page', 'signed-in')
  })

  test('does not move with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('main a[href^="/r/"]')).toHaveCount(3)
    await page.waitForLoadState('networkidle')
    const moving = await page.evaluate(
      "document.getAnimations().filter((animation) => animation.playState === 'running' && Number(animation.effect?.getComputedTiming().duration) > 0).length",
    )
    expect(moving).toBe(0)
  })
})

test.describe('Booking', () => {
  test('shows the booking page of a restaurant', async ({ page }) => {
    await page.goto('/r/zur-linde')
    await expect(page.getByRole('heading', { name: 'Gasthaus zur Linde', level: 1 })).toBeVisible()
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await screenshot(page, 'booking', 'restaurant-page')
  })

  test('opens the booking dialog for a time', async ({ page }) => {
    await page.goto('/r/zur-linde')
    await page.locator('[data-time-chip]').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await screenshot(page, 'booking', 'booking-dialog')
  })

  test('shows the embedded booking', async ({ page }) => {
    await page.goto('/embed/zur-linde')
    await expect(page.locator('[data-time-chip]').first()).toBeVisible()
    await screenshot(page, 'booking', 'embed')
  })

  test('shows "not found" for an unknown restaurant', async ({ page }) => {
    await page.goto('/r/does-not-exist')
    await expect(page.getByText('Restaurant not found')).toBeVisible()
    await expect(page.locator('img[src="/not-found-photo.webp"]')).toBeVisible()
    await screenshot(page, 'booking', 'restaurant-not-found')
  })
})

/** The day and time the booking is at: the booking keeps them in its address. */
function chosenSlot(page: Page) {
  const params = new URL(page.url()).searchParams
  return { date: params.get('date')!, time: params.get('time')! }
}

/** A day "YYYY-MM-DD" written out as the booking shows it in English, e.g. "Friday, November 6, 2026". */
function longDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(new Date(year, month - 1, day))
}

/** A time "HH:mm" as the booking shows it in English, e.g. "7:00 PM". */
function timeOfDay(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hours, minutes))
}

/** Opens the booking of Gasthaus zur Linde at the first free time the card offers, at the step of the contact details. */
async function openZurLindeDetails(page: Page) {
  await page.goto('/r/zur-linde')
  await page.locator('[data-time-chip]').first().click()
  const dialog = page.getByRole('dialog', { name: 'Your contact details' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Books Gasthaus zur Linde at its first free time with name and email; returns the link to the guest's page from the confirmation. */
async function bookZurLinde(page: Page, name: string) {
  const dialog = await openZurLindeDetails(page)
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Email').fill('guest@example.com')
  await dialog.getByRole('button', { name: 'Book now' }).click()
  // The dialog is named by its step, now the confirmation.
  const confirmation = page.getByRole('dialog', { name: 'Your table is reserved' })
  await expect(confirmation).toBeVisible()
  return (await confirmation.getByRole('link', { name: 'Manage reservation' }).getAttribute('href'))!
}

test.describe('Booking: instant confirmation, the system assigns the table', () => {
  test('books the first free time with name and email', async ({ page }) => {
    const dialog = await openZurLindeDetails(page)
    const { date, time } = chosenSlot(page)
    // Gasthaus zur Linde assigns the table itself: the dialog goes from the time straight to the contact details.
    await expect(dialog.getByText('Step 1 of 2: Contact details')).toBeAttached()
    await dialog.getByLabel('Name').fill('Lena Lindner')
    await dialog.getByLabel('Email').fill('lena.lindner@example.com')
    await settle(page)
    await screenshot(page, 'booking', 'instant-details', { fullPage: false })

    await dialog.getByRole('button', { name: 'Book now' }).click()
    const confirmation = page.getByRole('dialog', { name: 'Your table is reserved' })
    await expect(confirmation).toBeVisible()
    await expect(confirmation).toContainText(/Your reference code\s*[A-HJ-NP-Z2-9]{6}/)
    await expect(confirmation).toContainText(longDate(date))
    await expect(confirmation).toContainText(timeOfDay(time))
    await expect(confirmation).toContainText('2 people')
    await expect(confirmation).toContainText(/Table \S+ · \S/)
    await settle(page)
    await screenshot(page, 'booking', 'instant-confirmation', { fullPage: false })
  })
})

test.describe('Booking: request, the guest chooses the table', () => {
  test('sends a request for a free table from the list', async ({ page }) => {
    await page.goto('/r/kafana-dunav')
    await page.locator('[data-time-chip]').first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
    await dialog.getByText('Show tables as a list').click()
    const table = dialog.getByRole('radio').first()
    const tableName = (await table.locator('..').textContent())!.trim()
    await table.click()
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await settle(page)
    await screenshot(page, 'booking', 'request-table', { fullPage: false })

    await dialog.getByRole('button', { name: 'Continue' }).click()
    await expect(dialog.getByRole('heading', { name: 'Your contact details' })).toBeVisible()
    // The chosen table in the summary at the top, e.g. "Table S3" of "Table S3 · 4 seats".
    await expect(dialog.getByRole('button', { name: `Change: ${tableName.split(' · ')[0]}` })).toBeVisible()
    await dialog.getByLabel('Name').fill('Dragan Jovanović')
    await dialog.getByLabel('Phone').fill('+381 64 7654321')
    await expect(dialog.getByText('This is a request: the restaurant reviews it and gets back to you.')).toBeVisible()
    await settle(page)
    await screenshot(page, 'booking', 'request-details', { fullPage: false })

    await dialog.getByRole('button', { name: 'Send request' }).click()
    const confirmation = page.getByRole('dialog', { name: 'Request sent' })
    await expect(confirmation).toBeVisible()
    await expect(confirmation).toContainText('Your reservation is not confirmed yet.')
    await expect(confirmation).toContainText(/Your reference code\s*[A-HJ-NP-Z2-9]{6}/)
    await settle(page)
    await screenshot(page, 'booking', 'request-sent', { fullPage: false })
  })
})

test.describe('Guest link', () => {
  test('shows the booking as confirmed and cancels it after asking', async ({ page }) => {
    const link = await bookZurLinde(page, 'Paul Gast')
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Reservation confirmed', level: 1 })).toBeVisible()
    await expect(page.getByText('Paul Gast')).toBeVisible()
    await revealAll(page)
    await screenshot(page, 'guest-link', 'confirmed')

    await page.getByRole('button', { name: 'Cancel reservation' }).click()
    const dialog = page.getByRole('dialog', { name: 'Really cancel the reservation?' })
    await expect(dialog).toBeVisible()
    await settle(page)
    await screenshot(page, 'guest-link', 'cancel-asks-first', { fullPage: false })

    await dialog.getByRole('button', { name: 'Cancel reservation' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Your reservation has been cancelled', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Book again' })).toHaveAttribute('href', '/r/zur-linde')
    await expect(page.getByRole('button', { name: 'Cancel reservation' })).toHaveCount(0)
    await revealAll(page)
    await screenshot(page, 'guest-link', 'cancelled')

    // Opened again later, the page says who cancelled it.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Reservation cancelled', level: 1 })).toBeVisible()
    await expect(page.getByText('You cancelled this reservation.')).toBeVisible()
  })

  test('shows "not found" for the link with a wrong token', async ({ page }) => {
    const link = await bookZurLinde(page, 'Petra Falsch')
    await page.goto(link.replace(/\?t=.*$/, '?t=wrong-token'))
    await expect(page.getByRole('heading', { name: 'Reservation not found', level: 1 })).toBeVisible()
    await screenshot(page, 'guest-link', 'wrong-token')
  })
})

test.describe('Embed', () => {
  test('books in German with the steps below the card', async ({ page }) => {
    await page.goto('/embed/zur-linde?lang=de')
    await expect(page.getByRole('heading', { name: 'Tisch reservieren' })).toBeVisible()
    const chip = page.locator('[data-time-chip]').first()
    await chip.click()
    // No dialog in the embed: the step follows below the card.
    const heading = page.getByRole('heading', { name: 'Ihre Kontaktdaten' })
    await expect(heading).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await heading.boundingBox())!.y).toBeGreaterThan((await chip.boundingBox())!.y)
    // Scrolled to the steps, the summary bar at their top does not cover the heading.
    await expect
      .poll(() =>
        page.evaluate(
          "(() => { const heading = document.querySelector('[data-step-heading]'); const box = heading.getBoundingClientRect(); return box.top >= 0 && document.elementFromPoint(box.left + 8, box.top + box.height / 2) === heading })()",
        ),
      )
      .toBe(true)
    await page.getByLabel('Name').fill('Jonas Einbettung')
    await page.getByLabel('E-Mail').fill('jonas@example.com')
    await screenshot(page, 'embed', 'details-de')

    await page.getByRole('button', { name: 'Jetzt reservieren' }).click()
    await expect(page.getByRole('heading', { name: 'Ihr Tisch ist reserviert' })).toBeVisible()
    await expect(page.getByText('Ihr Referenzcode')).toBeVisible()
    await expect(page.getByText('Personen: 2 Personen')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await settle(page)
    await screenshot(page, 'embed', 'confirmation-de')
  })

  test('tells the page around it its height', async ({ page }) => {
    // A page of the restaurant's website, of another origin than the embed (the API's), with the embed and a listener for its
    // messages. Not about:blank: the embed may be framed by any website ("frame-ancestors *"), which an opaque origin is not.
    await page.goto('http://localhost:5025/api/health')
    await page.setContent(`
      <h1>Restaurant website</h1>
      <iframe src="http://localhost:5173/embed/zur-linde" title="Reserve a table" style="width: 100%; height: 600px; border: 0"></iframe>
      <script>
        window.heights = []
        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'cbplayground:height') {
            window.heights.push(event.data.height)
            // As the snippet's script does: the frame takes the height of the booking.
            document.querySelector('iframe').style.height = event.data.height + 'px'
          }
        })
      </script>
    `)
    await page.waitForFunction('window.heights.length > 0')
    const height = await page.evaluate('window.heights[window.heights.length - 1]')
    expect(typeof height).toBe('number')
    expect(height).toBeGreaterThan(0)
    await expect(page.frameLocator('iframe').locator('[data-time-chip]').first()).toBeVisible()
    await page.waitForFunction("document.querySelector('iframe').style.height === window.heights[window.heights.length - 1] + 'px'")
    await screenshot(page, 'embed', 'framed')
  })

  test('shows a short message for an unknown restaurant', async ({ page }) => {
    await page.goto('/embed/does-not-exist')
    await expect(page.getByRole('note')).toHaveText('Online booking is not available for this restaurant.')
    await screenshot(page, 'embed', 'not-found')
  })
})

/** Sets the table style of Rooftop Belvedere through the API, signed in as its admin; keeps its demo branding. */
async function setRooftopTableStyle(page: Page, tableStyle: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@rooftop-belvedere.local')
  await page.getByLabel('Password', { exact: true }).fill('Demo1234!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  const response = await page.request.put('/api/admin/branding', {
    data: { brandColor: '#c9a96e', themeMode: 'Dark', fontStyle: 'Elegant', tableStyle },
  })
  expect(response.status()).toBe(200)
}

/**
 * Waits until the dialog's entrance and every other finite animation in time are over, so a screenshot shows the dialog as
 * it stays. Endless ones (the light of the table style Glow breathes on) and the cover image's parallax, which follows the
 * scrolling instead of the time, are left out.
 */
async function settle(page: Page) {
  await page.waitForFunction(
    "document.getAnimations().every((animation) => animation.playState !== 'running' || animation.timeline !== document.timeline || animation.effect?.getComputedTiming().iterations === Infinity)",
  )
}

/** The plan in the dialog is drawn: its image or room has a size (it once shrank to nothing with the list open). */
async function expectPlanDrawn(dialog: Locator) {
  const plan = (await dialog.locator('[data-vaul-no-drag]').boundingBox())!
  expect(plan.width).toBeGreaterThan(300)
  expect(plan.height).toBeGreaterThan(200)
}

/** Opens the booking dialog of Rooftop Belvedere at its first free time, at the table step. */
async function openRooftopTableStep(page: Page) {
  await page.goto('/r/rooftop-belvedere')
  await page.locator('[data-time-chip]').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
  await expect(dialog.locator('[data-floor-table]')).toHaveCount(8)
  return dialog
}

test.describe('Table choice', () => {
  test('uses nearly the whole window and shows the plan to scale', async ({ page }) => {
    await setRooftopTableStyle(page, 'Classic')
    await page.setViewportSize({ width: 1440, height: 900 })
    const dialog = await openRooftopTableStep(page)
    // Measured once the dialog's entrance (it grows from 96 %) is over, not halfway through it.
    await settle(page)

    // The dialog leaves 1 rem around it; the plan fills the height left beside the column of the areas.
    const box = (await dialog.boundingBox())!
    expect(box.width).toBeGreaterThan(1440 - 40)
    expect(box.height).toBeGreaterThan(900 - 40)
    const plan = (await dialog.locator('[data-vaul-no-drag]').boundingBox())!
    expect(plan.width).toBeGreaterThan(850)
    // The rooftop is 18 m wide: a bar of 2 m, and the legend says the plan is to scale.
    await expect(dialog.locator('[data-scale-bar]')).toHaveText('2 m')
    await expect(dialog.getByText('Plan and tables to scale')).toBeVisible()
    // Every table has its badge with its number, readable at 12 px or more however small the table is.
    const badge = dialog.locator('[data-floor-table]').filter({ hasText: 'R1' }).getByText('R1')
    await expect(badge).toHaveCSS('font-size', /^(1[2-5])(\.\d+)?px$/)
    await settle(page)
    await screenshot(page, 'table-choice', 'dialog-1440', { fullPage: false })

    await dialog.getByText('Show tables as a list').click()
    await dialog.getByRole('radio').first().click()
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
    // With the list open the plan keeps its place and size.
    await expectPlanDrawn(dialog)
    await settle(page)
    await screenshot(page, 'table-choice', 'dialog-1440-chosen', { fullPage: false })
  })

  test('fits a laptop screen', async ({ page }) => {
    await setRooftopTableStyle(page, 'Classic')
    await page.setViewportSize({ width: 1280, height: 720 })
    const dialog = await openRooftopTableStep(page)
    const plan = (await dialog.locator('[data-vaul-no-drag]').boundingBox())!
    expect(plan.height).toBeGreaterThanOrEqual(280)
    await settle(page)
    await screenshot(page, 'table-choice', 'dialog-1280x720', { fullPage: false })
    // The list of the lounge's free tables open below the plan: the plan stays drawn, at least 18 rem high.
    await dialog.getByRole('button', { name: /Lounge/ }).click()
    await expect(dialog.locator('[data-floor-table]')).toHaveCount(5)
    await dialog.getByText('Show tables as a list').click()
    await dialog.getByRole('radio').first().click()
    await expectPlanDrawn(dialog)
    await settle(page)
    await screenshot(page, 'table-choice', 'dialog-1280x720-list', { fullPage: false })
  })

  for (const tableStyle of ['Classic', 'Natural', 'Minimal', 'Glow']) {
    test(`draws the tables in the table style ${tableStyle}`, async ({ page }) => {
      await setRooftopTableStyle(page, tableStyle)
      await page.setViewportSize({ width: 1440, height: 900 })
      const dialog = await openRooftopTableStep(page)
      // A free table chosen on the plan itself, so the three states show side by side: free, chosen, not available.
      await dialog.locator('[data-floor-table].cursor-pointer').first().click()
      await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
      await expectPlanDrawn(dialog)
      await settle(page)
      await screenshot(page, 'table-choice', `style-${tableStyle.toLowerCase()}`, { fullPage: false })
    })
  }

  test('keeps the large tables for larger groups', async ({ page }) => {
    await setRooftopTableStyle(page, 'Classic')
    await page.setViewportSize({ width: 1440, height: 900 })
    const dialog = await openRooftopTableStep(page)
    // R6 seats 6 and is for 3 people or more online: for the 2 guests it is muted and says why.
    const r6 = dialog.locator('[data-floor-table]').filter({ hasText: 'R6' })
    await expect(r6).toHaveClass(/cursor-not-allowed/)
    await expect(dialog.getByText('Larger tables are kept for larger groups.')).toBeVisible()
    await r6.hover()
    await expect(page.getByRole('tooltip')).toContainText('Table R6 · too large for 2 people')
    await settle(page)
    await screenshot(page, 'table-choice', 'too-large-tables', { fullPage: false })
  })

  test('keeps the full-screen sheet on phones', async ({ page }) => {
    await setRooftopTableStyle(page, 'Classic')
    await page.setViewportSize({ width: 375, height: 812 })
    await openRooftopTableStep(page)
    await expect(page.locator('[data-scale-bar]')).toHaveText('2 m')
    await screenshot(page, 'table-choice', 'sheet-375')
  })
})

test.describe('Not found', () => {
  for (const width of [375, 1280]) {
    test(`shows the not found page with its photo for an unknown address at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/does-not-exist')
      await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible()
      await expect(page.locator('img[src="/not-found-photo.webp"]')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Back to the start page' })).toHaveAttribute('href', '/')
      await screenshot(page, 'not-found', `page-not-found-${width}`)
    })
  }

  test('shows the not found page with its photo for an unknown reservation', async ({ page }) => {
    await page.goto('/r/zur-linde/reservation/ABC123?t=wrong')
    await expect(page.getByRole('heading', { name: 'Reservation not found', level: 1 })).toBeVisible()
    await expect(page.locator('img[src="/not-found-photo.webp"]')).toBeVisible()
    await screenshot(page, 'not-found', 'reservation-not-found')
  })
})
