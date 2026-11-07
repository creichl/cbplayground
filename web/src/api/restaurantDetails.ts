import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from './client.ts'

/** The cuisines a restaurant can name, in the order the admin's list offers them; the same list as on the server. */
export const cuisines = [
  'Bavarian',
  'German',
  'Austrian',
  'Serbian',
  'Balkan',
  'Italian',
  'Mediterranean',
  'French',
  'Japanese',
  'Asian',
  'International',
  'Vegetarian',
  'CafeBrunch',
  'BarCocktails',
  'SteakGrill',
  'FishSeafood',
] as const

export type Cuisine = (typeof cuisines)[number]

/** The features a restaurant can have, in the order the server returns them. */
export const restaurantFeatures = [
  'Terrace',
  'Garden',
  'Rooftop',
  'View',
  'WheelchairAccessible',
  'DogsWelcome',
  'ChildFriendly',
  'VegetarianOptions',
  'VeganOptions',
  'GlutenFreeOptions',
  'LiveMusic',
  'PrivateDining',
  'Parking',
  'CardPayment',
  'Wifi',
] as const

export type RestaurantFeature = (typeof restaurantFeatures)[number]

/** The price levels, from € (1) to €€€€ (4). */
export const priceLevels = [1, 2, 3, 4] as const

export type PriceLevel = (typeof priceLevels)[number]

/**
 * The restaurant's details, as returned by GET /api/admin/details: up to `maxCuisines` cuisines (the main one first), the
 * price level (null when not set), the features and the house rules (null when empty).
 */
export type RestaurantDetails = {
  cuisines: Cuisine[]
  priceLevel: PriceLevel | null
  features: RestaurantFeature[]
  houseRules: string | null
}

/** Error codes of PUT /api/admin/details. */
export type RestaurantDetailsError = 'invalid_cuisine' | 'too_many_cuisines' | 'invalid_price_level' | 'invalid_feature' | 'invalid_house_rules'

/** A frequently asked question with its answer, as returned by GET /api/admin/faq. */
export type Faq = { id: string; question: string; answer: string }

/** Error codes of POST and PUT /api/admin/faq. */
export type FaqError = 'invalid_question' | 'invalid_answer' | 'faq_full'

/** The limits, as on the server. */
export const maxCuisines = 3
export const maxHouseRulesLength = 1000
export const maxFaqs = 12
export const maxQuestionLength = 150
export const maxAnswerLength = 600

const detailsKey = ['admin', 'details'] as const
const faqKey = ['admin', 'faq'] as const

export function useRestaurantDetails() {
  return useQuery({
    queryKey: detailsKey,
    queryFn: () => apiGet<RestaurantDetails>('/admin/details'),
  })
}

/** The booking page and the start page show the details, so both are reloaded after a change. */
export function useSaveRestaurantDetails() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (details: RestaurantDetails) => apiPut<RestaurantDetails>('/admin/details', details),
    onSuccess: async (details) => {
      queryClient.setQueryData(detailsKey, details)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['tenants'] }), queryClient.invalidateQueries({ queryKey: ['public'] })])
    },
  })
}

/** The questions in their order. */
export function useFaqs() {
  return useQuery({
    queryKey: faqKey,
    queryFn: () => apiGet<Faq[]>('/admin/faq'),
  })
}

/** After every change the list is read anew, and the booking page with it. */
function useReloadFaqs() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: faqKey }), queryClient.invalidateQueries({ queryKey: ['public'] })])
}

/** Adds a question at the end (without `id`) or changes one (with `id`). */
export function useSaveFaq() {
  const reload = useReloadFaqs()

  return useMutation({
    mutationFn: ({ id, question, answer }: { id: string | null; question: string; answer: string }) =>
      id === null ? apiPost<Faq>('/admin/faq', { question, answer }) : apiPut<Faq>(`/admin/faq/${id}`, { question, answer }),
    onSuccess: reload,
  })
}

export function useDeleteFaq() {
  const reload = useReloadFaqs()

  return useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/faq/${id}`),
    onSuccess: reload,
  })
}

/** Saves a new order (all question ids). */
export function useReorderFaqs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => apiPut<Faq[]>('/admin/faq/order', { ids }),
    onSuccess: async (faqs) => {
      queryClient.setQueryData(faqKey, faqs)
      await queryClient.invalidateQueries({ queryKey: ['public'] })
    },
  })
}
