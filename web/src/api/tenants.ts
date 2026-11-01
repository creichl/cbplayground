import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client.ts'

/** A restaurant, as returned by GET /api/tenants. */
export type Tenant = {
  id: string
  name: string
  slug: string
  /** City and short description from the restaurant's profile; null when not filled in. */
  city: string | null
  description: string | null
  /** Logo, cover image and accent colour ("#rrggbb") from the branding; null when not set. */
  logoUrl: string | null
  coverUrl: string | null
  brandColor: string | null
}

/** All restaurants, sorted by name. */
export function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiGet<Tenant[]>('/tenants'),
  })
}
