import { expect, type Page, test } from '@playwright/test'
import { revealAll, settle } from './helpers.ts'
import { screenshot } from './screenshot.ts'

/** A restaurant as GET /api/tenants returns it, as far as the filters need it. */
type Restaurant = {
  slug: string
  name: string
  city: string | null
  cuisines: string[]
  priceLevel: number | null
  features: string[]
  openToday: boolean
  todayHours: { start: string; end: string }[]
}

/** The restaurants of the start page: the expected numbers are counted from them, so the tests do not depend on how many there are. */
async function restaurants(page: Page) {
  return (await (await page.request.get('/api/tenants')).json()) as Restaurant[]
}

/** The heading with the number of matches, e.g. "2 restaurants". */
function countHeading(page: Page, count: number) {
  return page.getByRole('heading', { name: count === 1 ? '1 restaurant' : `${count} restaurants`, level: 2 })
}

const cards = (page: Page) => page.locator('main a[href^="/r/"]')
const filterBar = (page: Page) => page.getByRole('group', { name: 'Filters' })

test.describe('Start page filters', () => {
  test('filters by cuisine, then by price, and the count follows', async ({ page }) => {
    const all = await restaurants(page)
    await page.goto('/')
    await expect(countHeading(page, all.length)).toBeVisible()
    // Every card says on its photo whether the restaurant is open today.
    for (const restaurant of all) {
      await expect(page.locator(`main a[href="/r/${restaurant.slug}"]`).getByText(restaurant.openToday ? /^Open today · / : /^Closed today$/)).toBeVisible()
    }

    const bavarian = all.filter((restaurant) => restaurant.cuisines.includes('Bavarian'))
    await filterBar(page).getByRole('group', { name: 'Cuisine' }).getByRole('button', { name: 'Bavarian' }).click()
    await expect(filterBar(page).getByRole('button', { name: 'Bavarian' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/\?cuisine=Bavarian$/)
    await expect(countHeading(page, bavarian.length)).toBeVisible()
    await expect(cards(page)).toHaveCount(bavarian.length)
    await expect(page.locator('main a[href="/r/zur-linde"]')).toBeVisible()

    // Several cuisines: any of them.
    const bavarianOrSerbian = all.filter((restaurant) => restaurant.cuisines.includes('Bavarian') || restaurant.cuisines.includes('Serbian'))
    await filterBar(page).getByRole('button', { name: 'Serbian' }).click()
    await expect(countHeading(page, bavarianOrSerbian.length)).toBeVisible()

    const moderate = bavarianOrSerbian.filter((restaurant) => restaurant.priceLevel === 2)
    await filterBar(page).getByRole('group', { name: 'Price' }).getByRole('button', { name: 'Price level 2 of 4' }).click()
    await expect(page).toHaveURL(/\?cuisine=Bavarian&cuisine=Serbian&price=2$/)
    await expect(countHeading(page, moderate.length)).toBeVisible()
    await expect(cards(page)).toHaveCount(moderate.length)
    await expect(filterBar(page).getByRole('button', { name: 'Reset filters' })).toBeVisible()
    await revealAll(page)
    await screenshot(page, 'start-page-filters', 'cuisine-and-price')

    // The back button takes the last filter back.
    await page.goBack()
    await expect(page).toHaveURL(/\?cuisine=Bavarian&cuisine=Serbian$/)
    await expect(countHeading(page, bavarianOrSerbian.length)).toBeVisible()
  })

  test('keeps the filters over a reload and combines them with the search', async ({ page }) => {
    const all = await restaurants(page)
    const city = all.find((restaurant) => restaurant.slug === 'kafana-dunav')!.city!
    const inCity = all.filter((restaurant) => restaurant.city === city)
    await page.goto('/')
    await filterBar(page).getByRole('combobox', { name: 'City' }).click()
    await page.getByRole('option', { name: city }).click()
    await expect(page).toHaveURL(new RegExp(`\\?city=${encodeURIComponent(city).replace(/%20/g, '\\+')}$`))
    await expect(countHeading(page, inCity.length)).toBeVisible()

    await page.reload()
    await expect(filterBar(page).getByRole('combobox', { name: 'City' })).toHaveText(city)
    await expect(countHeading(page, inCity.length)).toBeVisible()
    await expect(page.locator('main a[href="/r/kafana-dunav"]')).toBeVisible()

    // The search narrows the filtered restaurants further.
    await page.getByRole('searchbox', { name: 'Search by name or city' }).fill('Kafana')
    await expect(countHeading(page, inCity.filter((restaurant) => restaurant.name.toLowerCase().includes('kafana')).length)).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search by name or city' }).fill('')
    await revealAll(page)
    await screenshot(page, 'start-page-filters', 'after-reload')
  })

  test('names the way back when nothing matches', async ({ page }) => {
    const all = await restaurants(page)
    const munich = all.find((restaurant) => restaurant.slug === 'zur-linde')!.city!
    // A Serbian restaurant in Munich: none in the demo data.
    expect(all.filter((restaurant) => restaurant.city === munich && restaurant.cuisines.includes('Serbian'))).toHaveLength(0)
    await page.goto(`/?city=${encodeURIComponent(munich)}&cuisine=Serbian`)
    await expect(countHeading(page, 0)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No restaurant matches your filters', level: 3 })).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
    await page.getByRole('heading', { name: 'No restaurant matches your filters' }).scrollIntoViewIfNeeded()
    await revealAll(page)
    await screenshot(page, 'start-page-filters', 'no-match')

    await page.locator('main').getByRole('button', { name: 'Reset filters' }).first().click()
    await expect(page).toHaveURL(/\/$/)
    await expect(countHeading(page, all.length)).toBeVisible()
    await expect(cards(page)).toHaveCount(all.length)
    await expect(filterBar(page).getByRole('button', { name: 'Reset filters' })).toHaveCount(0)
  })

  test('scrolls the bar sideways on phones and chooses features in a sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const all = await restaurants(page)
    await page.goto('/')
    const bar = filterBar(page)
    await bar.scrollIntoViewIfNeeded()
    // Wider than the screen: it scrolls instead of wrapping.
    expect(await bar.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    await revealAll(page)
    await screenshot(page, 'start-page-filters', 'phone-bar')

    await bar.getByRole('button', { name: 'More filters' }).click()
    const sheet = page.getByRole('dialog', { name: 'More filters' })
    await expect(sheet).toBeVisible()
    // Live music is at Kafana Dunav only.
    const withLiveMusic = all.filter((restaurant) => restaurant.features.includes('LiveMusic'))
    // Checked once the address has changed, which happens right after the click.
    await sheet.getByRole('checkbox', { name: 'Live music' }).click()
    await expect(sheet.getByRole('checkbox', { name: 'Live music' })).toBeChecked()
    await expect(page).toHaveURL(/\?feature=LiveMusic$/)
    const show = sheet.getByRole('button', { name: withLiveMusic.length === 1 ? 'Show 1 restaurant' : `Show ${withLiveMusic.length} restaurants` })
    await expect(show).toBeVisible()
    await settle(page)
    await screenshot(page, 'start-page-filters', 'phone-sheet', { fullPage: false })

    await show.click()
    await expect(sheet).toBeHidden()
    await expect(bar.getByRole('button', { name: /^More filters/ })).toContainText('1')
    await expect(countHeading(page, withLiveMusic.length)).toBeVisible()
    await expect(page.locator('main a[href="/r/kafana-dunav"]')).toBeVisible()
  })
})
