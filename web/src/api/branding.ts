import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { ApiError, apiDelete, apiGet, apiPut, httpErrorMessage } from './client.ts'

export type ThemeMode = 'Light' | 'Dark'

/** A curated pair of fonts (heading and text); which fonts stand behind each key is decided in brandTheme.ts. */
export type FontStyle = 'Modern' | 'Classic' | 'Elegant' | 'Rustic' | 'Urban'

export const fontStyles: readonly FontStyle[] = ['Modern', 'Classic', 'Elegant', 'Rustic', 'Urban']

/** How the tables look on the guest's floor plan; TableShape draws them. */
export type TableStyle = 'Classic' | 'Natural' | 'Minimal' | 'Glow'

export const tableStyles: readonly TableStyle[] = ['Classic', 'Natural', 'Minimal', 'Glow']

/**
 * A restaurant's branding, as in GET /api/admin/branding and in the public restaurant. `brandColor` is "#rrggbb" or null
 * for the platform's colour; the URLs are null without image.
 */
export type Branding = {
  brandColor: string | null
  themeMode: ThemeMode
  fontStyle: FontStyle
  logoUrl: string | null
  coverUrl: string | null
  tableStyle: TableStyle
}

/** The body of PUT /api/admin/branding; an empty or null colour is the platform's colour. */
export type BrandingRequest = Pick<Branding, 'brandColor' | 'themeMode' | 'fontStyle' | 'tableStyle'>

/** The image types the API accepts for logo and cover image, and their largest size. */
export const brandingImageTypes = ['image/png', 'image/jpeg', 'image/webp']
export const maxLogoBytes = 2 * 1024 * 1024
export const maxCoverBytes = 10 * 1024 * 1024

/** Same rule as on the server. */
export function isValidBrandColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

const brandingKey = ['admin', 'branding'] as const

export function useBranding() {
  return useQuery({
    queryKey: brandingKey,
    queryFn: () => apiGet<Branding>('/admin/branding'),
  })
}

/** Stores the answer and reloads what shows the branding: the booking page and the cards of the start page. */
function useOnBrandingSaved() {
  const queryClient = useQueryClient()
  return async (branding: Branding) => {
    queryClient.setQueryData(brandingKey, branding)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['public'] }),
      queryClient.invalidateQueries({ queryKey: ['tenants'] }),
    ])
  }
}

export function useSaveBranding() {
  const onSuccess = useOnBrandingSaved()
  return useMutation({
    mutationFn: (branding: BrandingRequest) => apiPut<Branding>('/admin/branding', branding),
    onSuccess,
  })
}

/** Uploads or replaces the logo (`image: 'logo'`) or the cover image (`'cover'`). */
export function useUploadBrandingImage(image: 'logo' | 'cover') {
  const onSuccess = useOnBrandingSaved()
  return useMutation({
    mutationFn: (file: File) => apiPut<Branding>(`/admin/branding/${image}`, file),
    onSuccess,
  })
}

/** Removes the logo or the cover image. */
export function useDeleteBrandingImage(image: 'logo' | 'cover') {
  const onSuccess = useOnBrandingSaved()
  return useMutation({
    mutationFn: () => apiDelete<Branding>(`/admin/branding/${image}`),
    onSuccess,
  })
}

/** Error codes of the branding endpoints and their texts. The cover image shares the size limit and its code with the floor plans. */
const errorKeys = {
  invalid_brand_color: 'branding.errors.invalidBrandColor',
  invalid_theme_mode: 'branding.errors.invalidThemeMode',
  invalid_font_style: 'branding.errors.invalidFontStyle',
  invalid_table_style: 'branding.errors.invalidTableStyle',
  logo_too_large: 'branding.errors.logoTooLarge',
  floor_plan_too_large: 'branding.errors.coverTooLarge',
  floor_plan_type_invalid: 'branding.errors.imageTypeInvalid',
} as const

/** A failed request of the branding page in the user's language. */
export function brandingErrorMessage(error: unknown, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in errorKeys) {
      return t(errorKeys[error.code as keyof typeof errorKeys])
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
