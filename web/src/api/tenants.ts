import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client.ts'
import type { Cuisine, PriceLevel, RestaurantFeature } from './restaurantDetails.ts'

/** A restaurant, as returned by GET /api/tenants. */
export type Tenant = {
  id: string
  name: string
  slug: string
  /** City and description from the restaurant's profile; null when not filled in. */
  city: string | null
  description: string | null
  /** Logo, cover image and accent colour ("#rrggbb") from the branding; null when not set. */
  logoUrl: string | null
  coverUrl: string | null
  brandColor: string | null
  /** Cuisines (the main one first), price level and features from the restaurant's details; empty or null when not set. */
  cuisines: Cuisine[]
  priceLevel: PriceLevel | null
  features: RestaurantFeature[]
}

/** All restaurants, sorted by name. */
export function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiGet<Tenant[]>('/tenants'),
  })
}
