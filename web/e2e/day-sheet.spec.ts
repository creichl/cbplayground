import { expect, test } from '@playwright/test'
import { signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

// The front desk's day sheet, at Kafana Dunav, which is open every day and has demo reservations on each: "Print" in the top bar of the service screen opens it in a tab of its own, where the print
// dialog opens on its own.

/** Today in Kafana Dunav's time zone (Europe/Belgrade), "YYYY-MM-DD": the day its front desk calls today. */
function todayInBelgrade() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(new Date())
}

test.describe('Front desk: day sheet', () => {
  test('prints the reservations of today from the service screen', async ({ page, context }) => {
    // Headless Chromium has no print dialog: window.print() only notes that it was called.
    await context.addInitScript('window.print = () => { window.printCalls = (window.printCalls ?? 0) + 1 }')
    await signIn(page, 'frontdesk@kafana-dunav.local')
    await expect(page).toHaveURL(/\/frontdesk$/)

    const print = page.getByRole('link', { name: 'Print the day sheet' })
    await expect(print).toHaveAttribute('href', `/frontdesk/print?date=${todayInBelgrade()}`)
    await screenshot(page, 'day-sheet', 'service-screen-print-button', { fullPage: false })
    const [sheet] = await Promise.all([context.waitForEvent('page'), print.click()])

    await expect(sheet).toHaveURL(/\/frontdesk\/print\?date=/)
    await expect(sheet.getByRole('heading', { name: 'Day sheet' })).toBeVisible()
    await expect(sheet.getByText('Kafana Dunav')).toBeVisible()
    // The totals per service and of the whole day, and the demo reservations grouped by start time.
    const totals = sheet.getByRole('region', { name: 'Totals per service' })
    await expect(totals.getByText('Whole day')).toBeVisible()
    await expect(sheet.getByRole('columnheader', { name: 'Phone' })).toBeVisible()
    await expect(sheet.locator('tbody tr').first()).toBeVisible()
    // No navigation of the front desk.
    await expect(sheet.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
    await expect.poll(() => sheet.evaluate('window.printCalls')).toBe(1)

    await sheet.emulateMedia({ media: 'print' })
    await expect(sheet.getByRole('button', { name: 'Print' })).toBeHidden()
    await screenshot(sheet, 'day-sheet', 'today-print')
  })
})
