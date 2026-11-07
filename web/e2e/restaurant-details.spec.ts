import { expect, test } from '@playwright/test'
import { revealAll, settle, signIn } from './helpers.ts'
import { screenshot } from './screenshot.ts'

/** Scrolls a heading of the admin to the top of the window, below the admin's fixed header (the tests are typed without the DOM). */
function scrollBelowHeader(heading: { style: { scrollMarginTop: string }; scrollIntoView: () => void }) {
  heading.style.scrollMarginTop = '96px'
  heading.scrollIntoView()
}

test.describe('Restaurant details', () => {
  test('edits cuisines, price level and features on the profile and saves them', async ({ page }) => {
    await signIn(page, 'admin@kafana-dunav.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/profile')
    // The demo's details, put back at the end for the other tests.
    const demoDetails = (await (await page.request.get('/api/admin/details')).json()) as Record<string, unknown>
    expect(demoDetails).toMatchObject({ cuisines: ['Serbian', 'Balkan'], priceLevel: 2 })

    await expect(page.getByRole('heading', { name: 'Cuisine & price', level: 3 })).toBeVisible()
    const cuisines = page.getByRole('combobox', { name: 'Cuisines' })
    await cuisines.click()
    await page.getByRole('option', { name: 'Fish & seafood' }).click()
    await page.keyboard.press('Escape')
    // A fourth cuisine is not taken.
    await cuisines.click()
    await page.getByRole('option', { name: 'Italian' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('option', { name: 'Italian' })).toHaveCount(0)
    await expect(page.locator('[data-path="cuisines"]').locator('..').getByText('Italian')).toHaveCount(0)

    await page.getByText('€€€', { exact: true }).click()
    await expect(page.getByText('€€€ – Upscale: a special evening out.')).toBeVisible()
    const features = page.getByRole('group', { name: 'Features' })
    await features.getByText('Parking', { exact: true }).click()
    await features.getByText('Live music', { exact: true }).click()
    await page.getByLabel('House rules', { exact: true }).fill('Pušenje samo u bašti.')

    const saveBar = page.getByRole('region', { name: 'Unsaved changes' })
    await saveBar.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('The profile has been saved.')).toBeVisible()
    await expect(saveBar).toHaveCount(0)
    expect(await (await page.request.get('/api/admin/details')).json()).toEqual({
      cuisines: ['Serbian', 'Balkan', 'FishSeafood'],
      priceLevel: 3,
      features: ['Garden', 'View', 'ChildFriendly', 'VegetarianOptions', 'Parking', 'CardPayment', 'Wifi'],
      houseRules: 'Pušenje samo u bašti.',
    })
    // The window at the new cards: in a full-page screenshot the admin's fixed header would lie across the page.
    await page.getByRole('heading', { name: 'Cuisine & price', level: 3 }).evaluate(scrollBelowHeader)
    await screenshot(page, 'restaurant-details', 'admin-details-saved', { fullPage: false })

    // Back to the demo's details for the other tests.
    expect((await page.request.put('/api/admin/details', { data: demoDetails })).ok()).toBe(true)
  })

  test('adds a question, moves it up and deletes it on the profile', async ({ page }) => {
    await signIn(page, 'admin@kafana-dunav.local')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/admin/profile')
    await expect(page.getByRole('heading', { name: 'Frequently asked questions', level: 3 })).toBeVisible()
    await expect(page.getByText('5 of 12 questions')).toBeVisible()

    await page.getByRole('button', { name: 'Add question' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add question' })
    await dialog.getByLabel('Question').fill('Da li imate dečiji meni?')
    await dialog.getByLabel('Answer').fill('Da, polovične porcije svih jela sa roštilja.')
    await settle(page)
    await screenshot(page, 'restaurant-details', 'admin-faq-dialog', { fullPage: false })
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('The question has been saved.')).toBeVisible()
    await expect(page.getByText('6 of 12 questions')).toBeVisible()
    // It is saved right away, at the end of the list, without the save bar.
    await expect(page.getByRole('region', { name: 'Unsaved changes' })).toHaveCount(0)
    const questions = page.locator('ol > li')
    await expect(questions.last()).toContainText('Da li imate dečiji meni?')

    await page.getByRole('button', { name: 'Move up: Da li imate dečiji meni?' }).click()
    await expect(questions.nth(4)).toContainText('Da li imate dečiji meni?')
    const faq = (await (await page.request.get('/api/public/restaurants/kafana-dunav')).json()) as { faq: { question: string }[] }
    expect(faq.faq[4].question).toBe('Da li imate dečiji meni?')
    await page.mouse.move(0, 0)
    await page.getByRole('heading', { name: 'Frequently asked questions', level: 3 }).evaluate(scrollBelowHeader)
    await screenshot(page, 'restaurant-details', 'admin-faq-added', { fullPage: false })

    await page.getByRole('button', { name: 'Delete: Da li imate dečiji meni?' }).click()
    await page.getByRole('dialog', { name: 'Delete question?' }).getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('5 of 12 questions')).toBeVisible()
    await expect(page.getByText('Da li imate dečiji meni?')).toHaveCount(0)
  })

  for (const width of [1440, 390]) {
    test(`shows the details of Gasthaus zur Linde at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto('/r/zur-linde')
      await expect(page.getByRole('heading', { name: 'Gasthaus zur Linde', level: 1 })).toBeVisible()
      // The line on the cover image: city, cuisine and price level.
      const headerLine = page.getByText(/^München · Bavarian · /)
      await expect(headerLine).toBeVisible()
      await expect(headerLine.getByRole('img', { name: 'Price level 2 of 4' })).toHaveText('€€€€')

      const features = page.getByRole('list', { name: 'Features' })
      await features.scrollIntoViewIfNeeded()
      await expect(features.getByRole('listitem')).toHaveText([
        'Terrace',
        'Garden',
        'Dogs welcome',
        'Child friendly',
        'Vegetarian options',
        'Parking',
        'Card payment',
      ])
      // The long description is cut until "Read more".
      const readMore = page.getByRole('button', { name: 'Read more' })
      await expect(readMore).toHaveAttribute('aria-expanded', 'false')
      await readMore.click()
      await expect(page.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByText(/Familien, Stammtische und Hunde/)).toBeVisible()

      await expect(page.getByRole('heading', { name: 'Good to know', level: 2 })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'House rules', level: 3 })).toBeVisible()
      const question = page.getByText('Darf ich meinen Hund mitbringen?')
      const answer = page.getByText(/Hunde sind in der Gaststube und auf der Terrasse willkommen/)
      await expect(answer).toBeHidden()
      // The question opens with the keyboard as well.
      await question.focus()
      await page.keyboard.press('Enter')
      await expect(answer).toBeVisible()

      await revealAll(page)
      await screenshot(page, 'restaurant-details', `restaurant-page-${width}`)
    })
  }

  test('shows Rooftop Belvedere in dark mode with its house rules and questions', async ({ page }) => {
    await page.goto('/r/rooftop-belvedere')
    await expect(page.getByRole('heading', { name: 'Rooftop Belvedere', level: 1 })).toBeVisible()
    await expect(page.locator('.dark').first()).toBeVisible()
    await expect(page.getByText(/^Wien · Bar & cocktails, Mediterranean · /).getByRole('img', { name: 'Price level 3 of 4' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Features' }).getByRole('listitem').first()).toHaveText('Rooftop')
    await expect(page.getByText(/^Dresscode: smart casual/)).toBeAttached()
    await page.getByText('Gibt es einen Lift?').click()
    await expect(page.getByText(/ein Lift fährt vom Eingang/)).toBeVisible()
    await revealAll(page)
    await screenshot(page, 'restaurant-details', 'rooftop-dark')
  })

  test('shows cuisine and price on the start page cards', async ({ page }) => {
    await page.goto('/')
    const linde = page.locator('main a[href="/r/zur-linde"]')
    await expect(linde.getByText(/^Bavarian · .* · München$/)).toBeVisible()
    await expect(linde.getByRole('img', { name: 'Price level 2 of 4' })).toBeVisible()
    await expect(page.locator('main a[href="/r/kafana-dunav"]').getByText(/^Serbian, Balkan · .* · Novi Sad$/)).toBeVisible()
    await expect(page.locator('main a[href="/r/rooftop-belvedere"]').getByRole('img', { name: 'Price level 3 of 4' })).toBeVisible()
    await linde.scrollIntoViewIfNeeded()
    await revealAll(page)
    await screenshot(page, 'restaurant-details', 'start-page-cards')
  })
})
