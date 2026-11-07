import { expect, type Page, test } from '@playwright/test'
import { bookRequest, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

test.describe('Front desk: declining a request', () => {
  test('asks first, and "Back" leaves the request open', async ({ page }) => {
    const name = 'Mila Petrović'
    await bookRequest(page, name)
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    // The tab "Requests" lists the open requests; a row holds the button that opens it and the status actions.
    await page.getByRole('tab', { name: /^Requests/ }).click()
    const row = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) }).locator('..')
    await row.getByRole('button', { name: 'Decline', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Decline the request?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(`The request of ${name} at`, { exact: false })).toBeVisible()
    await screenshot(page, 'front-desk', 'decline-asks-first', { fullPage: false })

    await dialog.getByRole('button', { name: 'Back' }).click()
    await expect(dialog).toBeHidden()
    await expect(row.getByText('Requested', { exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Decline', exact: true })).toBeVisible()
    await screenshot(page, 'front-desk', 'decline-back-request-open')

    // Declining for real removes it from the open requests, so the demo data stays as it was.
    await row.getByRole('button', { name: 'Decline', exact: true }).click()
    await dialog.getByRole('button', { name: 'Decline request' }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })).toHaveCount(0)
  })
})

/** The toast of a status change on the service screen (design system: a list item in the region "Notifications"). */
function statusToast(page: Page, text: string) {
  return page.getByRole('region', { name: /^Notifications/ }).getByRole('listitem').filter({ hasText: text })
}

test.describe('Front desk: undo of accepting a request', () => {
  test('offers "Undo" after accepting, which makes it an open request again', async ({ page }) => {
    const name = 'Nikola Vraćanje'
    await bookRequest(page, name)
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    await page.getByRole('tab', { name: /^Requests/ }).click()
    const open = page.getByRole('button', { name: new RegExp(`^Open the reservation of ${name} `) })
    await open.locator('..').getByRole('button', { name: 'Accept', exact: true }).click()
    // Accepted, it leaves the open requests (it lies days ahead, so it is not in today's list either).
    await expect(open).toHaveCount(0)
    const accepted = statusToast(page, `${name}: Confirmed`)
    await expect(accepted.getByRole('button', { name: 'Undo' })).toBeVisible()
    await screenshot(page, 'front-desk', 'accept-undo', { fullPage: false })

    await accepted.getByRole('button', { name: 'Undo' }).click()
    await expect(statusToast(page, `${name}: Requested`)).toBeVisible()
    await expect(open.locator('..').getByText('Requested', { exact: true })).toBeVisible()
    await screenshot(page, 'front-desk', 'accept-undone')

    // Declined again, so the demo data stays as it was; the declining can be undone as well.
    await open.locator('..').getByRole('button', { name: 'Decline', exact: true }).click()
    await page.getByRole('dialog', { name: 'Decline the request?' }).getByRole('button', { name: 'Decline request' }).click()
    await expect(open).toHaveCount(0)
    await expect(statusToast(page, `${name}: Declined`).getByRole('button', { name: 'Undo' })).toBeVisible()
  })
})
