import { expect, type Page, test } from '@playwright/test'
import { settle } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The booking dialog from the time to "Book now": the compact frame and its change of size, the steps, Back, the hold of the
// table with its countdown, the contact form (errors when leaving a field, remembered details) and the embed's inline steps.
// Every scenario at 1440 px (the dialog) and at 390 px (the full-screen sheet).

const sizes = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const

/** Opens the booking of Gasthaus zur Linde (the system assigns the table) at its latest free time: the contact details. */
async function openZurLinde(page: Page) {
  await page.goto('/r/zur-linde')
  // The latest time: the earliest one can fall within the lead time while the test runs.
  await page.locator('[data-time-chip]').last().click()
  const dialog = page.getByRole('dialog', { name: 'Your contact details' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Opens the booking of Rooftop Belvedere (the guest chooses the table) at its latest free time, at the table step. */
async function openRooftopTable(page: Page) {
  await page.goto('/r/rooftop-belvedere')
  await page.locator('[data-time-chip]').last().click()
  const dialog = page.getByRole('dialog', { name: 'Choose your table' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** The hold's line under the head, e.g. "We're holding table 4 for you · 4:59". */
const holdLine = /We're holding tables? \S+( \+ \S+)* for you · [0-5]:\d\d/

for (const size of sizes) {
  const wide = size.width >= 768

  test.describe(`Booking dialog at ${size.width} px`, () => {
    test.use({ viewport: size })

    test('is compact from the start where the system assigns the table', async ({ page }) => {
      const dialog = await openZurLinde(page)
      await settle(page)
      const box = (await dialog.boundingBox())!
      if (wide) {
        // About 560 px in the middle of the window, as high as its step.
        expect(box.width).toBeGreaterThan(540)
        expect(box.width).toBeLessThan(580)
        expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(2)
      } else {
        expect(box.width).toBe(size.width)
      }
      // The head: the restaurant's logo, the choices, the steps and Close; no Back on the first step.
      await expect(dialog.getByRole('list', { name: 'Your selection' })).toBeVisible()
      await expect(dialog.getByText('Step 1 of 2: Contact details')).toBeAttached()
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0)
      await expect(dialog.locator('[data-hold-notice]')).toHaveText(holdLine)
      await screenshot(page, 'booking-dialog', `compact-${size.width}`, { fullPage: false })

      await dialog.getByRole('button', { name: 'Close' }).click()
      await expect(dialog).toBeHidden()
    })

    test('resizes from the table step to the contact details, counts down the hold and goes back', async ({ page }) => {
      const dialog = await openRooftopTable(page)
      await settle(page)
      const large = (await dialog.boundingBox())!
      if (wide) {
        expect(large.width).toBeGreaterThan(size.width - 40)
      }
      await dialog.getByText('Show tables as a list').click()
      await dialog.getByRole('radio').first().click()
      await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
      await settle(page)
      await screenshot(page, 'booking-dialog', `resize-table-${size.width}`, { fullPage: false })

      await dialog.getByRole('button', { name: 'Continue' }).click()
      const details = page.getByRole('dialog', { name: 'Your contact details' })
      await expect(details).toBeVisible()
      // The focus is on the new step's heading.
      await expect(details.getByRole('heading', { name: 'Your contact details' })).toBeFocused()
      await settle(page)
      const compact = (await details.boundingBox())!
      if (wide) {
        expect(compact.width).toBeGreaterThan(540)
        expect(compact.width).toBeLessThan(580)
      } else {
        expect(compact.width).toBe(size.width)
      }

      // The table is held: the line counts down, and the table is no longer free for others.
      const notice = details.locator('[data-hold-notice]')
      await expect(notice).toHaveText(holdLine)
      const table = (await notice.textContent())!.match(/table (\S+) for you/)![1]
      await expect(details.getByRole('button', { name: `Change: Table ${table}` })).toBeVisible()
      const first = await notice.textContent()
      await expect(notice).not.toHaveText(first!, { timeout: 3000 })
      const { date, time } = Object.fromEntries(new URL(page.url()).searchParams)
      const tableAvailable = async () => {
        const areas = (await (await page.request.get(`/api/public/restaurants/rooftop-belvedere/tables?date=${date}&time=${time}&guests=2`)).json()) as {
          tables: { number: string; available: boolean }[]
        }[]
        return areas.flatMap((area) => area.tables).find((candidate) => candidate.number === table)!.available
      }
      expect(await tableAvailable()).toBe(false)
      await screenshot(page, 'booking-dialog', `resize-contact-${size.width}`, { fullPage: false })

      // Back returns to the table, with the table still chosen, and releases the hold.
      await details.getByRole('button', { name: 'Back' }).click()
      const tableStep = page.getByRole('dialog', { name: 'Choose your table' })
      await expect(tableStep.getByRole('heading', { name: 'Choose your table' })).toBeFocused()
      await expect(tableStep.getByRole('button', { name: 'Continue' })).toBeEnabled()
      await expect.poll(tableAvailable).toBe(true)
      await settle(page)
      if (wide) {
        expect((await tableStep.boundingBox())!.width).toBeGreaterThan(size.width - 40)
      }
      await screenshot(page, 'booking-dialog', `back-${size.width}`, { fullPage: false })

      await tableStep.getByRole('button', { name: 'Close' }).click()
      await expect(tableStep).toBeHidden()
    })

    test('stays open with the nearest free times when the table was taken meanwhile', async ({ page }) => {
      const dialog = await openRooftopTable(page)
      await dialog.getByText('Show tables as a list').click()
      const radio = dialog.getByRole('radio').first()
      await radio.click()
      // Once the dialog has checked the chosen table (a table taken while the guest is still on this step is simply unselected),
      // someone else holds it just before the guest continues.
      await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
      await page.waitForLoadState('networkidle')
      const { date, time } = Object.fromEntries(new URL(page.url()).searchParams)
      const taken = await page.request.post('/api/public/restaurants/rooftop-belvedere/holds', {
        data: { date, time, guests: 2, tableId: await radio.getAttribute('value') },
      })
      expect(taken.status()).toBe(201)
      await dialog.getByRole('button', { name: 'Continue' }).click()

      const details = page.getByRole('dialog', { name: 'Your contact details' })
      await expect(details.getByText('Sorry, this table has just been booked by someone else.')).toBeVisible()
      const nearby = details.getByRole('list', { name: 'Free times nearby' }).getByRole('button')
      await expect(nearby.first()).toBeVisible()
      await expect(details.locator('[data-hold-notice]')).toHaveCount(0)
      // What the guest types stays; the form is still there.
      await details.getByLabel('Name').fill('Nora Nachbar')
      await settle(page)
      await screenshot(page, 'booking-dialog', `taken-${size.width}`, { fullPage: false })

      // A time continues the booking at that time, with the table step.
      await nearby.first().click()
      await expect(page.getByRole('dialog', { name: 'Choose your table' })).toBeVisible()
      await page.request.delete(`/api/public/restaurants/rooftop-belvedere/holds/${((await taken.json()) as { holdToken: string }).holdToken}`)
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    })

    test('shows the errors of a field when the guest leaves it', async ({ page }) => {
      const dialog = await openZurLinde(page)
      const phone = dialog.getByLabel('Phone')
      await phone.fill('12')
      await phone.press('Tab')
      await expect(dialog.getByText('Please enter a valid phone number (at least 6 digits).')).toBeVisible()
      await expect(phone).toHaveAttribute('aria-invalid', 'true')
      // The name was not visited yet: no error there.
      await expect(dialog.getByText('Please enter your name.')).toHaveCount(0)
      // The country code starts with the restaurant's country (Germany).
      await expect(dialog.getByRole('combobox', { name: 'Country code' })).toHaveText('+49')
      await dialog.getByRole('button', { name: 'Birthday' }).click()
      await expect(dialog.getByRole('button', { name: 'Birthday' })).toHaveAttribute('aria-pressed', 'true')
      await phone.scrollIntoViewIfNeeded()
      await settle(page)
      await screenshot(page, 'booking-dialog', `phone-error-${size.width}`, { fullPage: false })

      // Corrected, the error goes.
      await phone.fill('0151 23456789')
      await expect(dialog.getByText('Please enter a valid phone number (at least 6 digits).')).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Close' }).click()
    })

    test('fills in the remembered details on the next booking after ticking the box', async ({ page }) => {
      const dialog = await openZurLinde(page)
      await dialog.getByLabel('Name').fill('Rita Merk')
      await dialog.getByLabel('Phone').fill('0151 23456789')
      await dialog.getByLabel('Email').fill('rita.merk@example.com')
      await expect(dialog.getByLabel('Remember my details on this device')).not.toBeChecked()
      await dialog.getByLabel('Remember my details on this device').check()
      await dialog.getByRole('button', { name: 'Book now' }).click()
      await expect(page.getByRole('dialog', { name: 'Your table is reserved' })).toBeVisible()

      const next = await openZurLinde(page)
      await expect(next.getByLabel('Name')).toHaveValue('Rita Merk')
      await expect(next.getByLabel('Phone')).toHaveValue('0151 23456789')
      await expect(next.getByLabel('Email')).toHaveValue('rita.merk@example.com')
      await expect(next.getByLabel('Remember my details on this device')).toBeChecked()
      await expect(next.getByRole('button', { name: 'Clear' })).toBeVisible()
      await next.getByRole('button', { name: 'Clear' }).scrollIntoViewIfNeeded()
      await settle(page)
      await screenshot(page, 'booking-dialog', `remembered-${size.width}`, { fullPage: false })

      // "Not you? Clear" forgets them.
      await next.getByRole('button', { name: 'Clear' }).click()
      await expect(next.getByLabel('Name')).toHaveValue('')
      await next.getByRole('button', { name: 'Close' }).click()
      await openZurLinde(page)
      await expect(page.getByRole('dialog').getByLabel('Name')).toHaveValue('')
    })

    test('does not remember the details without the box', async ({ page }) => {
      const dialog = await openZurLinde(page)
      await dialog.getByLabel('Name').fill('Otto Vergessen')
      await dialog.getByLabel('Email').fill('otto@example.com')
      await dialog.getByRole('button', { name: 'Book now' }).click()
      await expect(page.getByRole('dialog', { name: 'Your table is reserved' })).toBeVisible()

      const next = await openZurLinde(page)
      await expect(next.getByLabel('Name')).toHaveValue('')
      await expect(next.getByLabel('Email')).toHaveValue('')
      await expect(next.getByRole('button', { name: 'Clear' })).toHaveCount(0)
      await settle(page)
      await screenshot(page, 'booking-dialog', `not-remembered-${size.width}`, { fullPage: false })
      await next.getByRole('button', { name: 'Close' }).click()
    })

    test('shows the steps below the card in the embed', async ({ page }) => {
      await page.goto('/embed/rooftop-belvedere')
      await page.locator('[data-time-chip]').last().click()
      await expect(page.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.getByText('Show tables as a list').click()
      await page.getByRole('radio').first().click()
      await page.getByRole('button', { name: 'Continue' }).click()

      const heading = page.getByRole('heading', { name: 'Your contact details' })
      await expect(heading).toBeVisible()
      await expect(heading).toBeFocused()
      await expect(page.locator('[data-hold-notice]')).toHaveText(holdLine)
      await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
      await settle(page)
      await screenshot(page, 'booking-dialog', `embed-${size.width}`)

      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Choose your table' })).toHaveCount(0)
    })
  })
}
