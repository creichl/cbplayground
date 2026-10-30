import { useEffect, useState } from 'react'

type Tenant = {
  id: string
  name: string
  slug: string
}

function App() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tenants')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json() as Promise<Tenant[]>
      })
      .then(setTenants)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  return (
    <main>
      <h1>Restaurants</h1>
      {error !== null ? (
        <p>Could not load restaurants: {error}</p>
      ) : tenants === null ? (
        <p>Loading…</p>
      ) : tenants.length === 0 ? (
        <p>No restaurants yet.</p>
      ) : (
        <ul>
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              {tenant.name} ({tenant.slug})
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
