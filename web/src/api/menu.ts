import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { ApiError, apiDelete, apiGet, apiPost, apiPut, httpErrorMessage } from './client.ts'

/** The 14 allergens that must be declared in the EU, in their fixed order; the API names them so. */
export const allergens = [
  'Gluten',
  'Crustaceans',
  'Eggs',
  'Fish',
  'Peanuts',
  'Soy',
  'Milk',
  'Nuts',
  'Celery',
  'Mustard',
  'Sesame',
  'Sulphites',
  'Lupin',
  'Molluscs',
] as const

export type Allergen = (typeof allergens)[number]

/** The marks of a dish, as its flags in the API. */
export const marks = ['vegetarian', 'vegan', 'glutenFree', 'spicy'] as const

export type Mark = (typeof marks)[number]

/** The currency of the prices, from the restaurant's country: EUR in Germany and Austria, RSD in Serbia. */
export type Currency = 'EUR' | 'RSD'

/** What a dish says about itself, the same for the admin and the guests. `price` in minor units (cents or para), null without price. */
type Dish = {
  id: string
  name: string
  description: string | null
  price: number | null
  /** The public URL of the photo with its version; null without photo. */
  photoUrl: string | null
  recommended: boolean
  allergens: Allergen[]
} & Record<Mark, boolean>

/** A dish of the menu as the admin edits it (GET /api/admin/menu). */
export type MenuItem = Dish & { sectionId: string }

export type MenuSection = { id: string; name: string; description: string | null; items: MenuItem[] }

export type Menu = { currency: Currency; sections: MenuSection[] }

/** What is saved of a dish; a new `sectionId` moves it to the end of that section. */
export type MenuItemInput = Omit<MenuItem, 'id' | 'photoUrl'>

/** The menu for guests (GET /api/public/restaurants/{slug}/menu): only sections with dishes. */
export type PublicMenu = { currency: Currency; sections: { name: string; description: string | null; items: Dish[] }[] }

/** The limits of the API. */
export const menuLimits = {
  sections: 20,
  items: 300,
  sectionName: 60,
  sectionDescription: 200,
  itemName: 100,
  itemDescription: 300,
  /** The highest price in minor units. */
  price: 10_000_000,
  photoBytes: 10 * 1024 * 1024,
} as const

export const menuImageTypes = ['image/png', 'image/jpeg', 'image/webp']

/** Minor units per unit of the currency: both have 100 (cents, para). */
export const minorUnits = 100

const menuKey = ['admin', 'menu'] as const

export function useMenu() {
  return useQuery({
    queryKey: menuKey,
    queryFn: () => apiGet<Menu>('/admin/menu'),
  })
}

/** The menu for the restaurant page; `enabled` false until it is needed (near the view). */
export function usePublicMenu(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ['public', slug, 'menu'],
    queryFn: () => apiGet<PublicMenu>(`/public/restaurants/${encodeURIComponent(slug)}/menu`),
    enabled,
    // Not essential for booking: without the menu the section is simply left out.
    retry: false,
  })
}

/**
 * The cached menu changed with `change` after a successful save, so the page shows it at once; the guests' menu (the
 * restaurant page, when open in this browser) is reloaded.
 */
function useSaved() {
  const queryClient = useQueryClient()
  return async (change: (menu: Menu) => Menu) => {
    queryClient.setQueryData<Menu>(menuKey, (menu) => (menu === undefined ? menu : change(menu)))
    await queryClient.invalidateQueries({ queryKey: ['public'] })
  }
}

function withItem(menu: Menu, item: MenuItem): Menu {
  return {
    ...menu,
    sections: menu.sections.map((section) => {
      const items = section.items.filter((i) => i.id !== item.id)
      if (section.id !== item.sectionId) {
        return items.length === section.items.length ? section : { ...section, items }
      }
      // In its place, or at the end of a section it was moved to.
      const index = section.items.findIndex((i) => i.id === item.id)
      return { ...section, items: index < 0 ? [...items, item] : section.items.map((i) => (i.id === item.id ? item : i)) }
    }),
  }
}

export function useAddSection() {
  const saved = useSaved()
  return useMutation({
    mutationFn: (section: { name: string; description: string | null }) => apiPost<MenuSection>('/admin/menu/sections', section),
    onSuccess: (section) => saved((menu) => ({ ...menu, sections: [...menu.sections, section] })),
  })
}

export function useUpdateSection() {
  const saved = useSaved()
  return useMutation({
    mutationFn: ({ id, ...section }: { id: string; name: string; description: string | null }) =>
      apiPut<MenuSection>(`/admin/menu/sections/${id}`, section),
    onSuccess: (section) => saved((menu) => ({ ...menu, sections: menu.sections.map((s) => (s.id === section.id ? section : s)) })),
  })
}

/** Deletes the section with its dishes and their photos. */
export function useDeleteSection() {
  const saved = useSaved()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/menu/sections/${id}`),
    onSuccess: (_, id) => saved((menu) => ({ ...menu, sections: menu.sections.filter((s) => s.id !== id) })),
  })
}

/** Saves the order of the sections (all their ids). */
export function useReorderSections() {
  const saved = useSaved()
  return useMutation({
    mutationFn: (sectionIds: string[]) => apiPut<Menu>('/admin/menu/sections/order', { sectionIds }),
    onSuccess: (menu) => saved(() => menu),
  })
}

/** Saves the order of the dishes of a section (all their ids). */
export function useReorderItems() {
  const saved = useSaved()
  return useMutation({
    mutationFn: ({ sectionId, itemIds }: { sectionId: string; itemIds: string[] }) =>
      apiPut<MenuSection>(`/admin/menu/sections/${sectionId}/items/order`, { itemIds }),
    onSuccess: (section) => saved((menu) => ({ ...menu, sections: menu.sections.map((s) => (s.id === section.id ? section : s)) })),
  })
}

export function useAddItem() {
  const saved = useSaved()
  return useMutation({
    mutationFn: (item: MenuItemInput) => apiPost<MenuItem>('/admin/menu/items', item),
    onSuccess: (item) => saved((menu) => withItem(menu, item)),
  })
}

/** Saves a dish; with another `sectionId` it moves to the end of that section. */
export function useUpdateItem() {
  const saved = useSaved()
  return useMutation({
    mutationFn: ({ id, item }: { id: string; item: MenuItemInput }) => apiPut<MenuItem>(`/admin/menu/items/${id}`, item),
    onSuccess: (item) => saved((menu) => withItem(menu, item)),
  })
}

/** Deletes the dish with its photo. */
export function useDeleteItem() {
  const saved = useSaved()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/menu/items/${id}`),
    onSuccess: (_, id) => saved((menu) => ({ ...menu, sections: menu.sections.map((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) })) })),
  })
}

/** Uploads or replaces the photo of a dish (PNG, JPEG or WebP, at most 10 MB). */
export function useUploadItemPhoto() {
  const saved = useSaved()
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => apiPut<MenuItem>(`/admin/menu/items/${id}/photo`, file),
    onSuccess: (item) => saved((menu) => withItem(menu, item)),
  })
}

export function useDeleteItemPhoto() {
  const saved = useSaved()
  return useMutation({
    mutationFn: (id: string) => apiDelete<MenuItem>(`/admin/menu/items/${id}/photo`),
    onSuccess: (item) => saved((menu) => withItem(menu, item)),
  })
}

/** Error codes of the menu endpoints and their texts; the photos share the size limit and its codes with the floor plans. */
const errorKeys = {
  invalid_name: 'menu.errors.invalidName',
  invalid_description: 'menu.errors.invalidDescription',
  invalid_price: 'menu.errors.invalidPrice',
  invalid_allergen: 'menu.errors.invalidAllergen',
  invalid_order: 'menu.errors.invalidOrder',
  menu_full: 'menu.errors.menuFull',
  section_not_found: 'menu.errors.sectionNotFound',
  floor_plan_too_large: 'menu.errors.photoTooLarge',
  floor_plan_type_invalid: 'menu.errors.photoTypeInvalid',
} as const

/** A failed request of the menu, or a photo rejected before upload (its error code), in the user's language. */
export function menuErrorMessage(error: unknown, t: TFunction) {
  if (typeof error === 'string' && error in errorKeys) {
    return t(errorKeys[error as keyof typeof errorKeys])
  }
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in errorKeys) {
      return t(errorKeys[error.code as keyof typeof errorKeys])
    }
    if (error.status === 404) {
      return t('menu.errors.notFound')
    }
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.kind === 'http') {
      return httpErrorMessage(error, t)
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}
