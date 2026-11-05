import { expect, type Page, test } from '@playwright/test'
import { screenshot } from './screenshot.ts'

/** Signs in with a demo user of the development seed (appsettings.Development.json). */
async function signIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('Demo1234!')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('Sign-in', () => {
  test('shows the sign-in page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible()
    await screenshot(page, 'sign-in', 'sign-in-page')
  })

  test('shows an error for a wrong password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('admin@zur-linde.local')
    await page.getByLabel('Password', { exact: true }).fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('The email address or password is incorrect.')).toBeVisible()
    await screenshot(page, 'sign-in', 'wrong-password')
  })

  test('sends staff without sign-in to the sign-in page', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible()
  })
})

test.describe('Admin', () => {
  test('shows the overview and the reservations of the restaurant', async ({ page }) => {
    await signIn(page, 'admin@zur-linde.local')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByText('Welcome, Anna Admin!', { exact: false })).toBeVisible()
    await screenshot(page, 'admin', 'overview')

    await page.goto('/admin/reservations')
    await expect(page.getByRole('heading', { name: 'Reservations' })).toBeVisible()
    await screenshot(page, 'admin', 'reservations')
  })
})

test.describe('Front desk', () => {
  test('shows today', async ({ page }) => {
    await signIn(page, 'frontdesk@zur-linde.local')
    await expect(page).toHaveURL(/\/frontdesk$/)
    await expect(page.getByRole('heading', { name: 'Today' }).first()).toBeVisible()
    await screenshot(page, 'front-desk', 'today')
  })
})

test.describe('Superadmin', () => {
  test('lists all restaurants', async ({ page }) => {
    await signIn(page, 'superadmin@cbplayground.local')
    await expect(page).toHaveURL(/\/superadmin$/)
    await expect(page.getByRole('heading', { name: 'Restaurants' })).toBeVisible()
    await expect(page.getByText('Gasthaus zur Linde').first()).toBeVisible()
    await screenshot(page, 'superadmin', 'restaurants')
  })
})
