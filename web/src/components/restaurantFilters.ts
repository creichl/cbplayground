import {
  type Cuisine,
  cuisines as allCuisines,
  type PriceLevel,
  priceLevels,
  type RestaurantFeature,
  restaurantFeatures,
} from '../api/restaurantDetails.ts'
import type { Tenant } from '../api/tenants.ts'

// The start page's filters (HomePage, RestaurantFilterBar): reading them from the address and writing them to it, and matching a restaurant.

/** The start page's filters: one city, any of the cuisines and price levels, open today, and all of the features. */
export type RestaurantFilters = {
  city: string | null
  cuisines: Cuisine[]
  prices: PriceLevel[]
  openToday: boolean
  features: RestaurantFeature[]
}

/**
 * The filters from the address: `?city=&cuisine=&price=&open=1&feature=`, the parameters repeated for several values.
 * Unknown values are left out.
 */
export function readFilters(params: URLSearchParams): RestaurantFilters {
  const city = params.get('city')?.trim() ?? ''
  return {
    city: city !== '' ? city : null,
    cuisines: allCuisines.filter((cuisine) => params.getAll('cuisine').includes(cuisine)),
    prices: priceLevels.filter((level) => params.getAll('price').includes(String(level))),
    openToday: params.get('open') === '1',
    features: restaurantFeatures.filter((feature) => params.getAll('feature').includes(feature)),
  }
}

/** The filters as the parameters of the address, see readFilters. */
export function writeFilters(filters: RestaurantFilters) {
  const params = new URLSearchParams()
  if (filters.city !== null) params.set('city', filters.city)
  for (const cuisine of filters.cuisines) params.append('cuisine', cuisine)
  for (const level of filters.prices) params.append('price', String(level))
  if (filters.openToday) params.set('open', '1')
  for (const feature of filters.features) params.append('feature', feature)
  return params
}

export const noFilters: RestaurantFilters = { city: null, cuisines: [], prices: [], openToday: false, features: [] }

export function hasFilters(filters: RestaurantFilters) {
  return filters.city !== null || filters.cuisines.length > 0 || filters.prices.length > 0 || filters.openToday || filters.features.length > 0
}

export function matchesFilters(tenant: Tenant, filters: RestaurantFilters) {
  return (
    (filters.city === null || tenant.city === filters.city) &&
    (filters.cuisines.length === 0 || filters.cuisines.some((cuisine) => tenant.cuisines.includes(cuisine))) &&
    (filters.prices.length === 0 || (tenant.priceLevel !== null && filters.prices.includes(tenant.priceLevel))) &&
    (!filters.openToday || tenant.openToday) &&
    filters.features.every((feature) => tenant.features.includes(feature))
  )
}
