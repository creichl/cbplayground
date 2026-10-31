import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client.ts'

/** A restaurant, as returned by GET /api/tenants. */
export type Tenant = {
  id: string
  name: string
  slug: string
}

/** All restaurants, sorted by name. */
export function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiGet<Tenant[]>('/tenants'),
  })
}
