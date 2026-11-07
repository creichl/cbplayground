import { expect, type Page, test } from '@playwright/test'
import { settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The waitlist of walk-ins on the service screen: a party is put on it, waits with its quoted time and the next free table,
// and is seated from it as a walk-in, or leaves (with Undo).

/** The entry of a party in the tab "Waitlist": the button that opens it, its status, its details and its actions. */
function waitlistRow(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^Change the entry of ${name}, `) }).locator('..')
}

/** Puts a party of two on Kafana Dunav's waitlist through the staff API, signed in as its front desk. */
async function addToWaitlist(page: Page, name: string) {
  const response = await page.request.post('/api/staff/waitlist', {
    data: { name, guests: 2, phone: '+381 64 2223334', quotedWaitMinutes: 15, notes: null },
  })
  expect(response.status()).toBe(201)
}

test.describe('Front desk: waitlist', () => {
  test('adds a party, shows it waiting and seats it at the suggested table', async ({ page }) => {
    const name = 'Dragana Čekić'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    // A party can be put on today's waitlist at any time of the day.
    await page.getByRole('button', { name: 'Add to waitlist', exact: true }).click()
    const form = page.getByRole('dialog', { name: 'Add to the waitlist' })
    await form.getByLabel('Name').fill(name)
    await form.getByLabel('Phone').fill('+381 63 777888')
    await form.getByText('30 min', { exact: true }).click()
    await form.getByLabel('Note').fill('By the window, please')
    await expect(form.getByRole('radio', { name: '30 min' })).toBeChecked()
    await settle(page)
    await screenshot(page, 'waitlist', 'add-form', { fullPage: false })

    await form.getByRole('button', { name: 'Add to waitlist', exact: true }).click()
    await expect(form).toBeHidden()
    await expect(page.getByText(`${name} is on the waitlist.`)).toBeVisible()
    // Added, the waitlist is shown with the party waiting.
    await expect(page.getByRole('tab', { name: /^Waitlist/ })).toHaveAttribute('aria-selected', 'true')
    const row = waitlistRow(page, name)
    await expect(row.getByText('Waiting', { exact: true })).toBeVisible()
    await expect(row).toContainText('Party of 2 · +381 63 777888')
    await expect(row).toContainText(/Waiting \d+ min · quoted 30 min/)
    await expect(row).toContainText(/A table is free now|Next table free at \d|No table frees up today/)
    await expect(page.getByRole('region', { name: 'Key figures of the service' }).getByText('Waiting', { exact: true })).toBeVisible()
    await screenshot(page, 'waitlist', 'waiting')

    // Seated now, as a walk-in: only while the restaurant is open and a table for two is free.
    const walkInTables = await page.request.get('/api/staff/walk-in-tables?guests=2')
    test.skip(walkInTables.status() === 400, 'Kafana Dunav is closed at the time of the run, so no party can be seated from the waitlist now.')
    expect(walkInTables.status()).toBe(200)
    const suggested = ((await walkInTables.json()) as { tables: { number: string }[] }).tables[0]
    test.skip(suggested === undefined, 'No table of Kafana Dunav is free for a party of two now, so it cannot be seated.')
    await expect(row).toContainText('A table is free now')

    await row.getByRole('button', { name: 'Seat', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: `Seat ${name}` })
    await expect(drawer.getByLabel('Name')).toHaveValue(name)
    await expect(drawer.getByLabel('Note')).toHaveValue('By the window, please')
    await expect(drawer.getByRole('combobox', { name: 'Table', exact: true })).toHaveValue(new RegExp(`^Table ${suggested.number} · .*\\(suggested\\)$`))
    await screenshot(page, 'waitlist', 'seat-drawer', { fullPage: false })

    await drawer.getByRole('button', { name: 'Seat party', exact: true }).click()
    await expect(drawer).toBeHidden()
    await expect(page.getByText(`${name} seated at table ${suggested.number} since`, { exact: false })).toBeVisible()
    // Seated, the party is no longer waiting and sits at its table as a walk-in.
    await expect(page.locator('[data-waitlist-entry-id]').filter({ hasText: name }).getByText('Seated', { exact: true })).toBeVisible()
    await screenshot(page, 'waitlist', 'seated', { fullPage: false })
    await page.getByRole('tab', { name: /^Seated/ }).click()
    const seated = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) }).locator('..')
    await expect(seated.getByText('Arrived', { exact: true })).toBeVisible()
    await expect(seated.getByText('Walk-in', { exact: true })).toBeVisible()
  })

  test('marks a waiting party as left and puts it back with Undo', async ({ page }) => {
    const name = 'Petar Odlazak'
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await addToWaitlist(page, name)
    await page.reload()

    await page.getByRole('tab', { name: /^Waitlist/ }).click()
    const row = waitlistRow(page, name)
    await expect(row).toContainText('quoted 15 min')
    await row.getByRole('button', { name: 'Left', exact: true }).click()
    const toast = page.getByRole('region', { name: /^Notifications/ }).getByRole('listitem').filter({ hasText: `${name} has left the waitlist.` })
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
    // Gone, the party is listed under "Seated or left" without actions.
    const entry = page.locator('[data-waitlist-entry-id]').filter({ hasText: name })
    await expect(entry.getByText('Left', { exact: true })).toBeVisible()
    await expect(entry.getByRole('button', { name: 'Seat', exact: true })).toHaveCount(0)
    await settle(page)
    await screenshot(page, 'waitlist', 'left-with-undo', { fullPage: false })

    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText(`${name} is waiting again.`)).toBeVisible()
    await expect(row.getByText('Waiting', { exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Seat', exact: true })).toBeVisible()
  })
})
