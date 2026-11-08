import { expect, test } from '@playwright/test'

// Smoke tests against the started API (not through the Vite proxy).
const api = 'http://localhost:5025'

test.describe('API smoke', () => {
  test('health check answers ok', async ({ request }) => {
    const response = await request.get(`${api}/api/health`)
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  test('lists the demo restaurants', async ({ request }) => {
    const response = await request.get(`${api}/api/tenants`)
    expect(response.status()).toBe(200)
    const slugs = ((await response.json()) as { slug: string }[]).map((tenant) => tenant.slug)
    expect(slugs).toEqual(expect.arrayContaining(['zur-linde', 'kafana-dunav', 'rooftop-belvedere', 'il-faro', 'cafe-morgenrot', 'izakaya-kaze']))
  })

  test('shows a restaurant to guests', async ({ request }) => {
    const response = await request.get(`${api}/api/public/restaurants/zur-linde`)
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'Gasthaus zur Linde', bookable: true })
  })

  test('answers 404 for an unknown restaurant', async ({ request }) => {
    const response = await request.get(`${api}/api/public/restaurants/does-not-exist`)
    expect(response.status()).toBe(404)
  })

  test('answers 401 without sign-in', async ({ request }) => {
    expect((await request.get(`${api}/api/auth/me`)).status()).toBe(401)
  })

  test('signs a demo user in', async ({ request }) => {
    const response = await request.post(`${api}/api/auth/login`, {
      data: { email: 'admin@zur-linde.local', password: 'Demo1234!' },
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ email: 'admin@zur-linde.local', role: 'TenantAdmin' })
    expect((await request.get(`${api}/api/auth/me`)).status()).toBe(200)
  })

  test('forbids the staff management to the front desk', async ({ request }) => {
    const login = await request.post(`${api}/api/auth/login`, {
      data: { email: 'frontdesk@zur-linde.local', password: 'Demo1234!' },
    })
    expect(login.status()).toBe(200)
    expect((await request.get(`${api}/api/admin/staff`)).status()).toBe(403)
  })

  test('rejects a wrong password', async ({ request }) => {
    const response = await request.post(`${api}/api/auth/login`, {
      data: { email: 'admin@zur-linde.local', password: 'wrong' },
    })
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'invalid_credentials' })
  })
})
