import { expect, type Page, test } from '@playwright/test'
import { revealAll, settle } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The guest's flows end to end: booking with instant confirmation and as a request, the guest link and the embed.

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
