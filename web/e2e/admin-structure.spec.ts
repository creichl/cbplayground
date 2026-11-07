import { expect, type Page, test } from '@playwright/test'
import { settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

test.describe('Admin structure', () => {
  /** The sidebar's groups with their entries, in their order. */
  const groups = {
    Service: ['Overview', 'Service screen'],
    Restaurant: ['Profile', 'Appearance', 'Areas & tables', 'Opening hours'],
    Bookings: ['Reservation settings', 'Website embed'],
    Team: ['Staff'],
  }

  async function expectGroupedSidebar(page: Page) {
    const navigation = page.getByRole('navigation', { name: 'Admin navigation' })
    for (const [group, entries] of Object.entries(groups)) {
      await expect(navigation.getByRole('group', { name: group }).getByRole('link')).toHaveText(entries)
    }
    await expect(navigation.getByRole('link', { name: 'Reservations' })).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Table overview' })).toHaveCount(0)
  }

  test('groups the sidebar by task on desktops', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await expectGroupedSidebar(page)
    await expect(page.getByRole('link', { name: 'Open service screen' })).toHaveAttribute('href', '/frontdesk')
    await screenshot(page, 'admin-structure', 'sidebar-desktop')
  })

  test('shows the same groups in the burger menu on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.getByRole('button', { name: 'Show or hide navigation' }).click()
    await expectGroupedSidebar(page)
    await screenshot(page, 'admin-structure', 'sidebar-phone', { fullPage: false })
  })

  test('shows the save bar on the profile after a change and hides it after saving', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/profile')
    const phone = page.getByLabel('Phone')
    await expect(phone).toHaveValue('+49 89 2345678')
    const saveBar = page.getByRole('region', { name: 'Unsaved changes' })
    await expect(saveBar).toHaveCount(0)

    await phone.fill('+49 89 7654321')
    await expect(saveBar).toBeVisible()
    await settle(page)
    await screenshot(page, 'admin-structure', 'profile-save-bar', { fullPage: false })

    await saveBar.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('The profile has been saved.')).toBeVisible()
    await expect(saveBar).toHaveCount(0)
    await screenshot(page, 'admin-structure', 'profile-saved', { fullPage: false })
    expect(await (await page.request.get('/api/admin/profile')).json()).toMatchObject({ phone: '+49 89 7654321' })

    // Back to the demo's phone number for the other tests.
    await phone.fill('+49 89 2345678')
    await saveBar.getByRole('button', { name: 'Save' }).click()
    await expect(saveBar).toHaveCount(0)
    expect(await (await page.request.get('/api/admin/profile')).json()).toMatchObject({ phone: '+49 89 2345678' })
  })

  test('discards the changes on the profile', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/profile')
    const phone = page.getByLabel('Phone')
    const email = page.getByLabel('Email')
    await expect(phone).toHaveValue('+49 89 2345678')
    const savedEmail = await email.inputValue()

    await phone.fill('+49 89 1111111')
    await email.fill('not an email')
    const saveBar = page.getByRole('region', { name: 'Unsaved changes' })
    await saveBar.getByRole('button', { name: 'Save' }).click()
    // Invalid input is shown at its field, and nothing is saved.
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible()
    await settle(page)
    await screenshot(page, 'admin-structure', 'profile-field-error', { fullPage: false })

    await saveBar.getByRole('button', { name: 'Discard' }).click()
    await expect(phone).toHaveValue('+49 89 2345678')
    await expect(email).toHaveValue(savedEmail)
    await expect(page.getByText('Please enter a valid email address.')).toHaveCount(0)
    await expect(saveBar).toHaveCount(0)
    await screenshot(page, 'admin-structure', 'profile-discarded')
  })

  test('asks before leaving a page with unsaved changes', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    // Within the app, so the back button stays in it.
    await page.getByRole('link', { name: 'Profile' }).click()
    const phone = page.getByLabel('Phone')
    await expect(phone).toHaveValue('+49 89 2345678')
    await phone.fill('+49 89 2222222')

    // "Stay" keeps the page and the input.
    await page.getByRole('link', { name: 'Staff' }).click()
    const dialog = page.getByRole('dialog', { name: 'Leave without saving?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS('opacity', '1')
    await settle(page)
    await screenshot(page, 'admin-structure', 'leave-dialog', { fullPage: false })
    await dialog.getByRole('button', { name: 'Stay' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/\/admin\/profile$/)
    await expect(phone).toHaveValue('+49 89 2222222')

    // The back button asks too; "Leave" drops the changes.
    await page.goBack()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Leave' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    expect(await (await page.request.get('/api/admin/profile')).json()).toMatchObject({ phone: '+49 89 2345678' })
  })
})
