import { expect, type Locator, type Page, test } from '@playwright/test'
import { dateFromToday, settle, timeOfDay } from './helpers.ts'
import { screenshot } from './screenshot.ts'

type Slot = { date: string; time: string }
type Area = { name: string; tables: { id: string; number: string; available: boolean }[] }

const restaurants = { rooftop: 'rooftop-belvedere', kafana: 'kafana-dunav' } as const

/** The tables of a restaurant's areas at a time for 2 people, as the guest's table choice gets them. */
async function tablesAt(page: Page, slug: string, { date, time }: Slot) {
  const response = await page.request.get(`/api/public/restaurants/${slug}/tables?date=${date}&time=${time}&guests=2`)
  return (await response.json()) as Area[]
}

/** The first time from 12 days ahead on at which at least four tables are free for 2 people, after the demo reservations. */
async function freeSlot(page: Page, slug: string): Promise<Slot> {
  for (let days = 12; days < 60; days++) {
    const date = dateFromToday(days)
    const availability = (await (await page.request.get(`/api/public/restaurants/${slug}/availability?date=${date}&guests=2`)).json()) as {
      periods: { times: { time: string; available: boolean; combined: boolean }[] }[]
    }
    for (const slot of availability.periods.flatMap((period) => period.times).filter((option) => option.available && !option.combined)) {
      const areas = await tablesAt(page, slug, { date, time: slot.time })
      if (areas.flatMap((area) => area.tables).filter((table) => table.available).length >= 4) {
        return { date, time: slot.time }
      }
    }
  }
  throw new Error(`No free time at ${slug} in the next 60 days.`)
}

/** Opens the booking dialog (or the sheet on phones) of a restaurant right at its table step for 2 people at the slot. */
async function openTableStep(page: Page, slug: string, { date, time }: Slot) {
  await page.goto(`/r/${slug}?guests=2&date=${date}&time=${time}&step=table`)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Choose your table' })).toBeVisible()
  await expect(dialog.locator('[data-floor-table]').first()).toBeVisible()
  await settle(page)
  return dialog
}

/** Books a free table at the slot through the public API, so the test has a taken table of its own; returns its number. */
async function takeTable(page: Page, slug: string, slot: Slot, area: string) {
  const table = (await tablesAt(page, slug, slot)).find((option) => option.name === area)!.tables.find((option) => option.available)!
  const booking = await page.request.post(`/api/public/restaurants/${slug}/reservations`, {
    data: { ...slot, guests: 2, tableId: table.id, name: 'Taken Table Guest', phone: '+43 660 1234567', language: 'en' },
  })
  expect(booking.status()).toBe(201)
  const now = (await tablesAt(page, slug, slot)).flatMap((option) => option.tables).find((option) => option.id === table.id)!
  expect(now.available).toBe(false)
  return table.number
}

/** The plan's zoomed and panned layer and its viewport. */
function planLayer(dialog: Locator) {
  return dialog.locator('[data-vaul-no-drag] > div').first()
}

async function planScale(dialog: Locator) {
  const transform = await planLayer(dialog).evaluate((element: { style: { transform: string } }) => element.style.transform)
  return Number(/scale\(([\d.]+)\)/.exec(transform)![1])
}

/** A table on the plan by its number, through its name (its tooltip's text). */
function table(dialog: Locator, number: string) {
  return dialog.locator(`[data-floor-table][aria-label^="Table ${number} ·"]`)
}

/** The details of the chosen table, where they show: beside the plan, or on phones at the bottom of the sheet. */
function details(dialog: Locator, text: RegExp) {
  return dialog.getByText(text).filter({ visible: true })
}

/** An area's card (or on phones its chip). */
function areaButton(dialog: Locator, name: string) {
  return dialog.getByRole('group', { name: 'Areas' }).getByRole('button', { name: new RegExp(name) })
}

test.describe('Table choice on a large screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('choosing a table shows its details', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.rooftop)
    const dialog = await openTableStep(page, restaurants.rooftop, slot)
    const area = (await tablesAt(page, restaurants.rooftop, slot)).find((option) => option.name === 'Rooftop')!
    const free = area.tables.find((option) => option.available)!

    const button = dialog.getByRole('button', { name: new RegExp(`^Table ${free.number} · up to \\d+ people$`) })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(details(dialog, new RegExp(`^Table ${free.number} · up to \\d+ people · Rooftop$`))).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await settle(page)
    await screenshot(page, 'table-choice-ux', 'rooftop-1440-chosen', { fullPage: false })
  })

  test('a click on a taken table shows the reason', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.kafana)
    const number = await takeTable(page, restaurants.kafana, slot, 'Sala')
    const dialog = await openTableStep(page, restaurants.kafana, slot)

    const taken = table(dialog, number)
    // Announced, but not a button and not reachable with the keyboard.
    await expect(taken).toHaveAttribute('role', 'img')
    await expect(taken).toHaveAttribute('aria-label', `Table ${number} · not available`)
    await expect(taken).not.toHaveAttribute('tabindex')
    await taken.click()
    await expect(page.getByRole('tooltip')).toHaveText(`Taken at ${timeOfDay(slot.time)}`)
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await screenshot(page, 'table-choice-ux', 'kafana-1440-taken', { fullPage: false })
    // The reason goes after about two seconds; under the pointer the table's tooltip stays, as on hover.
    await expect(page.getByRole('tooltip')).not.toHaveText(/^Taken/, { timeout: 4000 })
  })

  test('"No preference" moves to the contact step', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.rooftop)
    const dialog = await openTableStep(page, restaurants.rooftop, slot)
    await dialog.getByRole('button', { name: 'No preference' }).click()
    await expect(dialog.getByRole('heading', { name: 'Your contact details' })).toBeVisible()
    await expect(page).toHaveURL(/step=details/)
    await expect(page).toHaveURL(/table=/)
    await settle(page)
    await screenshot(page, 'table-choice-ux', 'rooftop-1440-no-preference', { fullPage: false })
  })

  test('switching area resets the zoom', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.rooftop)
    const dialog = await openTableStep(page, restaurants.rooftop, slot)
    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    // The buttons glide to the new zoom.
    await expect.poll(() => planScale(dialog)).toBe(2.25)
    // Ctrl + wheel zooms further, around the pointer.
    const plan = (await dialog.locator('[data-vaul-no-drag]').boundingBox())!
    await page.mouse.move(plan.x + plan.width / 3, plan.y + plan.height / 3)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await expect.poll(() => planScale(dialog)).toBeGreaterThan(2.25)

    await areaButton(dialog, 'Lounge').click()
    await expect(areaButton(dialog, 'Lounge')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => planScale(dialog)).toBe(1)
    await expect(dialog.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
    await settle(page)
    await screenshot(page, 'table-choice-ux', 'rooftop-1440-lounge', { fullPage: false })

    // Back on the rooftop the plan starts unzoomed again.
    await areaButton(dialog, 'Rooftop').click()
    await expect.poll(() => planScale(dialog)).toBe(1)
  })

  test('a table chosen from the list is brought into view after zooming in', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.kafana)
    const dialog = await openTableStep(page, restaurants.kafana, slot)
    // The list covers every area, area by area.
    await dialog.getByText('Show tables as a list').click()
    await expect(dialog.getByRole('group', { name: 'Free tables – Sala' })).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'Free tables – Bašta' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(() => planScale(dialog)).toBe(2.25)
    const viewport = dialog.locator('[data-vaul-no-drag]')
    const inView = async (number: string) => {
      const box = (await table(dialog, number).boundingBox())!
      const frame = (await viewport.boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      return x > frame.x && x < frame.x + frame.width && y > frame.y && y < frame.y + frame.height
    }
    // The free table of the Sala farthest from the middle, out of view at this zoom.
    const sala = (await tablesAt(page, restaurants.kafana, slot)).find((option) => option.name === 'Sala')!
    const far = ['12', '9', '1', '4'].find((number) => sala.tables.some((option) => option.number === number && option.available))!
    expect(await inView(far)).toBe(false)

    await dialog.getByRole('group', { name: 'Free tables – Sala' }).getByRole('radio', { name: new RegExp(`^Table ${far} ·`) }).click()
    await expect(details(dialog, new RegExp(`^Table ${far} · up to \\d+ (person|people) · Sala$`))).toBeVisible()
    await expect.poll(() => inView(far)).toBe(true)
    // It never zooms in by itself.
    expect(await planScale(dialog)).toBe(2.25)
    await settle(page)
    await screenshot(page, 'table-choice-ux', 'kafana-1440-list-in-view', { fullPage: false })
  })

  test('chooses a table with Tab and Enter alone', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.rooftop)
    const dialog = await openTableStep(page, restaurants.rooftop, slot)
    const area = (await tablesAt(page, restaurants.rooftop, slot)).find((option) => option.name === 'Rooftop')!
    // The free tables come in the order of their numbers.
    const first = area.tables.find((option) => option.available)!

    let focused = ''
    for (let presses = 0; presses < 30 && focused === ''; presses++) {
      await page.keyboard.press('Tab')
      focused = await page.evaluate("document.activeElement?.closest('[data-floor-table]')?.getAttribute('aria-label') ?? ''")
    }
    expect(focused).toMatch(new RegExp(`^Table ${first.number} · up to \\d+ people$`))
    await page.keyboard.press('Enter')
    await expect(details(dialog, new RegExp(`^Table ${first.number} · up to \\d+ people · Rooftop$`))).toBeVisible()
    await expect(dialog.getByRole('button', { name: new RegExp(`^Table ${first.number} ·`) })).toHaveAttribute('aria-pressed', 'true')
    await settle(page)
    await screenshot(page, 'table-choice-ux', 'rooftop-1440-keyboard', { fullPage: false })

    // On to the contact details with the keyboard too.
    for (let presses = 0; presses < 30; presses++) {
      await page.keyboard.press('Tab')
      if ((await page.evaluate('document.activeElement?.textContent')) === 'Continue') break
    }
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('heading', { name: 'Your contact details' })).toBeVisible()
  })

  test('with less motion no animation runs on a chosen table', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const slot = await freeSlot(page, restaurants.rooftop)
    const dialog = await openTableStep(page, restaurants.rooftop, slot)
    await dialog.locator('[data-floor-table][role="button"]').first().click()
    await expect(dialog.locator('[data-floor-table][aria-pressed="true"]')).toHaveCount(1)
    // As text: the tests are typed without the DOM (tsconfig.node.json).
    const animations = await page.evaluate(
      `(() => {
        const chosen = document.querySelector('[data-floor-table][aria-pressed="true"]')
        return [getComputedStyle(chosen).animationName, getComputedStyle(chosen, '::after').animationName]
      })()`,
    )
    expect(animations).toEqual(['none', 'none'])
    // The zoom buttons change the zoom at once.
    await dialog.getByRole('button', { name: 'Zoom in' }).click()
    await expect.poll(() => planScale(dialog)).toBe(1.5)
  })
})

test.describe('Table choice on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('a tap chooses a table and shows its details', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.rooftop)
    const dialog = await openTableStep(page, restaurants.rooftop, slot)
    const area = (await tablesAt(page, restaurants.rooftop, slot)).find((option) => option.name === 'Rooftop')!
    const free = area.tables.find((option) => option.available)!
    await table(dialog, free.number).tap()
    await expect(details(dialog, new RegExp(`^Table ${free.number} · up to \\d+ people · Rooftop$`))).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Continue' })).toBeEnabled()
    // No tooltip opens on a tap on a free table.
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await settle(page)
    await screenshot(page, 'table-choice-ux', 'rooftop-390-chosen', { fullPage: false })
  })

  test('a tap on a taken or too large table shows the reason', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.kafana)
    const number = await takeTable(page, restaurants.kafana, slot, 'Sala')
    const dialog = await openTableStep(page, restaurants.kafana, slot)
    await table(dialog, number).tap()
    await expect(page.getByRole('tooltip')).toHaveText(`Taken at ${timeOfDay(slot.time)}`)
    await screenshot(page, 'table-choice-ux', 'kafana-390-taken', { fullPage: false })
    await expect(page.getByRole('tooltip')).toHaveCount(0, { timeout: 4000 })
  })

  test('a too large table says for how many it is', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.rooftop)
    const dialog = await openTableStep(page, restaurants.rooftop, slot)
    // R6 seats 6 and is for 3 people or more online.
    await table(dialog, 'R6').tap()
    await expect(page.getByRole('tooltip')).toHaveText('For 3 people or more')
    await screenshot(page, 'table-choice-ux', 'rooftop-390-too-large', { fullPage: false })
  })

  test('zooms with a double tap and back with the reset button', async ({ page }) => {
    const slot = await freeSlot(page, restaurants.kafana)
    const dialog = await openTableStep(page, restaurants.kafana, slot)
    await areaButton(dialog, 'Bašta').click()
    await expect(areaButton(dialog, 'Bašta')).toHaveAttribute('aria-pressed', 'true')
    // Once the plans have crossfaded: until then a tap lands on the transition, not on the plan.
    await settle(page)
    const plan = (await dialog.locator('[data-vaul-no-drag]').boundingBox())!
    // A point between the tables, near the top left.
    const x = plan.x + plan.width * 0.08
    const y = plan.y + plan.height * 0.5
    await page.touchscreen.tap(x, y)
    await page.touchscreen.tap(x, y)
    await expect.poll(() => planScale(dialog)).toBe(2)
    await expect(dialog.getByRole('button', { name: 'Zoom out' })).toBeEnabled()
    await settle(page)
    await screenshot(page, 'table-choice-ux', 'kafana-390-zoomed', { fullPage: false })
    await dialog.getByRole('button', { name: 'Reset zoom' }).click()
    await expect.poll(() => planScale(dialog)).toBe(1)
  })
})
